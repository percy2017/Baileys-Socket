// whatsappManager.js
import Database from "better-sqlite3";
import {
  makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
} from "@whiskeysockets/baileys";

import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import Pino from "pino";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, "whatsapp_instances.db");
const AUTH_DIR = path.join(__dirname, "auth_info_baileys");

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'unknown',
    user_id TEXT,
    user_name TEXT,
    profile_picture_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    instance_id TEXT,
    name TEXT,
    notify TEXT,
    verified_name TEXT,
    status TEXT,
    picture_url TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    instance_id TEXT,
    name TEXT,
    conversation_timestamp INTEGER,
    unread_count INTEGER,
    archive BOOLEAN,
    pinned BOOLEAN,
    mute_until INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    instance_id TEXT,
    chat_id TEXT,
    sender_id TEXT,
    message_type TEXT,
    content TEXT,
    timestamp INTEGER,
    status TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (instance_id) REFERENCES instances (id) ON DELETE CASCADE,
    FOREIGN KEY (chat_id) REFERENCES chats (id) ON DELETE CASCADE
  )
`);

const activeInstances = new Map();
function updateInstanceTimestamp(instanceId) {
  const updateStmt = db.prepare(
    "UPDATE instances SET updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  updateStmt.run(instanceId);
}

function updateInstanceState(instanceId, status) {
  const updateStmt = db.prepare(
    "UPDATE instances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  );
  updateStmt.run(status, instanceId);
  console.log(`Estado de instancia ${instanceId} actualizado a: ${status}`);
}

function saveInstanceProfileInfo(instanceId, profileInfo) {
  const updateStmt = db.prepare(`
        UPDATE instances 
        SET user_id = ?, user_name = ?, profile_picture_url = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
    `);
  updateStmt.run(
    profileInfo.userId,
    profileInfo.userName,
    profileInfo.profilePictureUrl,
    instanceId
  );
  console.log(`Información de perfil guardada para instancia ${instanceId}`);
}

function createInstanceInDB(instanceId) {
  const insertStmt = db.prepare(
    "INSERT OR IGNORE INTO instances (id, status) VALUES (?, ?)"
  );
  const result = insertStmt.run(instanceId, "init");
  if (result.changes > 0) {
    console.log(`Instancia ${instanceId} creada en la base de datos.`);
  } else {
    console.log(`Instancia ${instanceId} ya existía en la base de datos.`);
  }
}

function deleteInstanceFromDB(instanceId) {
  const deleteStmt = db.prepare("DELETE FROM instances WHERE id = ?");
  deleteStmt.run(instanceId);
  console.log(`Instancia ${instanceId} eliminada de la base de datos.`);
}

function saveContact(instanceId, contact) {
  const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO contacts 
        (id, instance_id, name, notify, verified_name, status, picture_url, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
  insertStmt.run(
    contact.id,
    instanceId,
    contact.name || null,
    contact.notify || null,
    contact.verifiedName || null,
    contact.status || null,
    contact.profilePictureUrl || null
  );
  console.log(`Contacto ${contact.id} guardado para instancia ${instanceId}`);
}

function saveChat(instanceId, chat) {
  const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO chats 
        (id, instance_id, name, conversation_timestamp, unread_count, archive, pinned, mute_until, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
  insertStmt.run(
    chat.id,
    instanceId,
    chat.name || null,
    chat.conversationTimestamp || null,
    chat.unreadCount || 0,
    chat.archive || false,
    chat.pinned || false,
    chat.muteEndTime || null
  );
  console.log(`Chat ${chat.id} guardado para instancia ${instanceId}`);
}

function saveMessage(instanceId, message) {
  // Extraer información relevante del mensaje
  const messageId = message.key?.id;
  const chatId = message.key?.remoteJid;
  const senderId = message.key?.participant || message.key?.remoteJid;
  const messageType =
    message.messageStubType ||
    (message.message ? Object.keys(message.message)[0] : "unknown");

  // Extraer contenido según el tipo de mensaje
  let content = "";
  if (message.message) {
    const msgContent = message.message[messageType];
    if (msgContent && typeof msgContent === "object") {
      if (msgContent.text) {
        content = msgContent.text;
      } else if (msgContent.caption) {
        content = msgContent.caption;
      }
    } else if (typeof msgContent === "string") {
      content = msgContent;
    }
  }

  const timestamp = message.messageTimestamp;
  const status = message.status;

  if (!messageId) {
    console.warn(
      `No se puede guardar mensaje sin ID para instancia ${instanceId}`
    );
    return;
  }

  const insertStmt = db.prepare(`
        INSERT OR REPLACE INTO messages 
        (id, instance_id, chat_id, sender_id, message_type, content, timestamp, status, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
  insertStmt.run(
    messageId,
    instanceId,
    chatId,
    senderId,
    messageType,
    content,
    timestamp,
    status
  );
  console.log(`Mensaje ${messageId} guardado para instancia ${instanceId}`);
}

export async function createInstance(instanceId, io, targetSocketId = null) {
  if (activeInstances.has(instanceId)) {
    console.log(`La instancia con ID ${instanceId} ya está activa.`);
    // Notificar al cliente que la instancia ya existe
    if (targetSocketId) {
      io.to(targetSocketId).emit("instance_creation_error", {
        instanceId,
        error: `La instancia con ID ${instanceId} ya está activa.`,
      });
    }
    return;
  }

  console.log(`Creando nueva instancia de Baileys con ID: ${instanceId}`);

  // 1. Guardar en la base de datos
  createInstanceInDB(instanceId);

  // 2. Usar useMultiFileAuthState para manejar la autenticación
  const authPath = path.join(AUTH_DIR, instanceId);
  // Asegurarse de que el directorio de auth existe
  if (!fs.existsSync(authPath)) {
    fs.mkdirSync(authPath, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(authPath);

  // 4. Obtener la última versión de Baileys
  const { version, isLatest } = await fetchLatestBaileysVersion();
  console.log(
    `Usando versión de WhatsApp Web: ${version.join(
      "."
    )}, ¿es la más reciente? ${isLatest}`
  );

  // 5. Configurar la conexión de Baileys
  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: "fatal" })),
    },
    browser: ["Baileys Manager", "Safari", "1.0.0"], // Personaliza el nombre del cliente
    printQRInTerminal: false, // Ya no lo necesitamos, lo manejamos por Socket.IO
    syncFullHistory: false, // No sincronizar todo el historial para evitar errores
    markOnlineOnConnect: true, // Marcar como en línea al conectar
    generateHighQualityLinkPreview: true, // Generar vistas previas de alta calidad
    getMessage: async (key) => {
      // Implementar si se necesita recuperar mensajes específicos
      return {
        conversation: "Hello World!",
      };
    },
  });

  // 5. Almacenar la instancia activa con sus datos auxiliares
  activeInstances.set(instanceId, {
    sock: sock,
    status: "init",
    // Podemos almacenar más datos aquí si es necesario
  });
  updateInstanceState(instanceId, "init");

  // 6. Manejar eventos de actualización de conexión
  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (connection === "close") {
      const shouldReconnect =
        lastDisconnect?.error instanceof Boom &&
        lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

      console.log(
        `Conexión cerrada para instancia ${instanceId} debido a`,
        lastDisconnect?.error?.message || lastDisconnect?.error
      );
      updateInstanceState(instanceId, "disconnected");

      const instanceData = activeInstances.get(instanceId);
      if (instanceData) {
        instanceData.status = "disconnected";
      }

      // Notificar a todos los clientes suscritos a esta instancia
      io.to(`instance_room_${instanceId}`).emit("instance_status_update", {
        instanceId,
        status: "close",
        message: lastDisconnect?.error?.message,
      });

      if (shouldReconnect) {
        console.log(`Reconectando instancia ${instanceId}...`);
        // Pequeño retraso antes de reconectar
        setTimeout(() => {
          // Antes de reconectar, asegurarse de que la instancia anterior esté completamente eliminada de la memoria
          activeInstances.delete(instanceId);
          createInstance(instanceId, io, targetSocketId);
        }, 5000);
      } else {
        console.log(`Instancia ${instanceId} cerrada permanentemente.`);
        // Si se desloguea, eliminamos completamente la instancia
        if (
          lastDisconnect?.error?.output?.statusCode ===
          DisconnectReason.loggedOut
        ) {
          // Eliminar instancia permanentemente
          deleteInstancePermanently(instanceId).catch(console.error);
        } else {
          // Solo la marcamos como desconectada
          activeInstances.delete(instanceId);
        }
      }
    } else if (connection === "open") {
      console.log(`Conexión abierta para instancia ${instanceId}`);
      updateInstanceState(instanceId, "connected");
      const instanceData = activeInstances.get(instanceId);
      if (instanceData) {
        instanceData.status = "connected";
      }

      // Sincronizar contactos, chats y mensajes
      try {
        await syncInstanceData(instanceId, sock, io);
      } catch (syncError) {
        console.error(
          `Error en sincronización para instancia ${instanceId}:`,
          syncError
        );
      }

      // Notificar a todos los clientes suscritos
      console.log(
        `Emitiendo evento de estado abierto para instancia ${instanceId}`
      );
      io.to(`instance_room_${instanceId}`).emit("instance_status_update", {
        instanceId,
        status: "open",
      });
      console.log(
        `Evento de estado abierto emitido para instancia ${instanceId}`
      );
    }

    // Si se recibe un código QR
    if (qr) {
      console.log(`Código QR generado para instancia ${instanceId}.`);
      updateInstanceState(instanceId, "qr");
      const instanceData = activeInstances.get(instanceId);
      if (instanceData) {
        instanceData.status = "qr";
      }

      try {
        // Generar una Data URL del QR
        const qrDataUrl = await QRCode.toDataURL(qr);
        console.log(
          `QR Data URL generado (primeros 50 chars): ${qrDataUrl.substring(
            0,
            50
          )}...`
        );

        // Emitir el QR
        // Opción 1: Al socket específico que solicitó la creación
        if (targetSocketId) {
          console.log(
            `Intentando emitir QR a socket específico: ${targetSocketId}`
          );
          // Verificar si el socket todavía está conectado puede ser complejo con socket.io
          // Emitiremos de todos modos y también a la sala como respaldo.
          io.to(targetSocketId).emit("qr_code", { instanceId, qrDataUrl });
        }
        // Opción 2 (Respaldo): Emitir a la sala de la instancia
        // Esto es útil si el cliente se une a la sala después de solicitar la creación
        // o si hay algún problema con targetSocketId.
        console.log(
          `Emitiendo QR también a sala de instancia: instance_room_${instanceId}`
        );
        io.to(`instance_room_${instanceId}`).emit("qr_code", {
          instanceId,
          qrDataUrl,
        });
      } catch (err) {
        console.error(`Error generando QR para instancia ${instanceId}:`, err);
      }
    }
    updateInstanceTimestamp(instanceId);
  });

  // 7. Manejar actualizaciones de credenciales
  sock.ev.on("creds.update", saveCreds);

  // 8. Manejar eventos de nuevos mensajes
  sock.ev.on("messages.upsert", (msgUpsertEvent) => {
    console.log(
      `Nuevo mensaje recibido para instancia ${instanceId}:`,
      msgUpsertEvent.type
    );
    // Guardar mensajes en la base de datos
    if (msgUpsertEvent.messages && msgUpsertEvent.messages.length > 0) {
      msgUpsertEvent.messages.forEach((message) => {
        saveMessage(instanceId, message);
      });
    }
    // Emitir el mensaje a la sala específica de esta instancia
    io.to(`instance_room_${instanceId}`).emit("new_message", {
      instanceId,
      ...msgUpsertEvent,
      count: msgUpsertEvent.messages ? msgUpsertEvent.messages.length : 0,
    });
  });

  // 9. Manejar actualizaciones de contactos
  sock.ev.on("contacts.upsert", (contacts) => {
    console.log(
      `Contactos actualizados para instancia ${instanceId}:`,
      contacts.length
    );
    // Guardar contactos en la base de datos
    contacts.forEach((contact) => {
      saveContact(instanceId, contact);
    });
    // Emitir los contactos actualizados a la sala específica
    io.to(`instance_room_${instanceId}`).emit("contacts_update", {
      instanceId,
      contacts,
      count: contacts.length,
    });
  });

  // 10. Manejar actualización de un solo contacto
  sock.ev.on("contacts.update", (contacts) => {
    console.log(
      `Contacto actualizado para instancia ${instanceId}:`,
      contacts.length
    );
    // Guardar contactos en la base de datos
    contacts.forEach((contact) => {
      // Para actualizaciones, necesitamos obtener el ID del contacto
      if (contact.id) {
        saveContact(instanceId, contact);
      }
    });
    // Emitir los contactos actualizados a la sala específica
    io.to(`instance_room_${instanceId}`).emit("contacts_update", {
      instanceId,
      contacts,
      count: contacts.length,
    });
  });

  // 10. Manejar actualizaciones de chats
  sock.ev.on("chats.upsert", (chats) => {
    console.log(`Chats agregados para instancia ${instanceId}:`, chats.length);
    // Guardar chats en la base de datos
    chats.forEach((chat) => {
      saveChat(instanceId, chat);
    });
    // Emitir los chats nuevos a la sala específica
    io.to(`instance_room_${instanceId}`).emit("chats_upsert", {
      instanceId,
      chats,
      count: chats.length,
    });
  });

  // 11. Manejar actualizaciones de chats
  sock.ev.on("chats.update", (chats) => {
    console.log(
      `Chats actualizados para instancia ${instanceId}:`,
      chats.length
    );
    // Guardar chats en la base de datos
    chats.forEach((chat) => {
      // Para actualizaciones, necesitamos obtener el ID del chat
      if (chat.id) {
        saveChat(instanceId, chat);
      }
    });
    // Emitir los chats actualizados a la sala específica
    io.to(`instance_room_${instanceId}`).emit("chats_update", {
      instanceId,
      chats,
      count: chats.length,
    });
  });

  // 12. Manejar eliminación de chats
  sock.ev.on("chats.delete", (chatIds) => {
    console.log(
      `Chats eliminados para instancia ${instanceId}:`,
      chatIds.length
    );
    // Eliminar chats de la base de datos
    const deleteStmt = db.prepare(
      "DELETE FROM chats WHERE instance_id = ? AND id = ?"
    );
    chatIds.forEach((chatId) => {
      deleteStmt.run(instanceId, chatId);
    });
    // Emitir los chats eliminados a la sala específica
    io.to(`instance_room_${instanceId}`).emit("chats_delete", {
      instanceId,
      chatIds,
      count: chatIds.length,
    });
  });

  console.log(`Instancia ${instanceId} configurada y almacenada en memoria.`);
}

async function syncInstanceData(instanceId, sock, io) {
  try {
    console.log(
      `Iniciando sincronización de datos para instancia ${instanceId}`
    );

    // Obtener información del perfil
    let profilePictureUrl = null;
    let status = null;
    let userName = null;
    let userId = null;

    try {
      // Obtener foto de perfil
      profilePictureUrl = await sock
        .profilePictureUrl(sock.user.id, "image")
        .catch(() => null);
      console.log(
        `Foto de perfil obtenida para instancia ${instanceId}: ${!!profilePictureUrl}`
      );
    } catch (error) {
      console.warn(
        `No se pudo obtener foto de perfil para instancia ${instanceId}:`,
        error.message
      );
    }

    try {
      // Obtener estado
      const statusResult = await sock
        .fetchStatus(sock.user.id)
        .catch(() => null);
      status = statusResult?.status;
      console.log(`Estado obtenido para instancia ${instanceId}: ${status}`);
    } catch (error) {
      console.warn(
        `No se pudo obtener estado para instancia ${instanceId}:`,
        error.message
      );
    }

    // Obtener nombre real de WhatsApp
    try {
      userId = sock.user.id;
      if (sock.user.name) {
        userName = sock.user.name;
      } else if (sock.user.verifiedName) {
        userName = sock.user.verifiedName;
      } else if (sock.user.id) {
        // Extraer número de teléfono del ID
        userName = sock.user.id.split("@")[0];
      }
      console.log(
        `Nombre de usuario obtenido para instancia ${instanceId}: ${userName}`
      );
    } catch (error) {
      console.warn(
        `No se pudo obtener nombre de usuario para instancia ${instanceId}:`,
        error.message
      );
      userName = instanceId; // Fallback al ID de la instancia
    }

    // Guardar información del perfil en la base de datos
    saveInstanceProfileInfo(instanceId, {
      userId,
      userName,
      profilePictureUrl,
    });

    // Emitir información del perfil
    io.to(`instance_room_${instanceId}`).emit("profile_info", {
      instanceId,
      profilePictureUrl,
      status: status,
      userId: userId,
      userName: userName,
    });

    // Sincronizar contactos
    try {
      console.log(`Sincronizando contactos para instancia ${instanceId}`);
      // Enviar mensaje al cliente para indicar que comenzará la sincronización de contactos
      io.to(`instance_room_${instanceId}`).emit("contacts_sync_start", {
        instanceId,
      });

      // Aquí podrías implementar la lógica para obtener y guardar todos los contactos
      // Por ahora, solo configuramos los listeners para contactos nuevos/actualizados
      console.log(
        `Configurando escucha de contactos para instancia ${instanceId}`
      );
    } catch (contactsError) {
      console.warn(
        `Advertencia al sincronizar contactos para instancia ${instanceId}:`,
        contactsError.message
      );
    }

    // Sincronizar chats
    try {
      console.log(`Sincronizando chats para instancia ${instanceId}`);
      // Enviar mensaje al cliente para indicar que comenzará la sincronización de chats
      io.to(`instance_room_${instanceId}`).emit("chats_sync_start", {
        instanceId,
      });

      // Aquí podrías implementar la lógica para obtener y guardar todos los chats
      // Por ahora, solo configuramos los listeners para chats nuevos/actualizados
      console.log(`Configurando escucha de chats para instancia ${instanceId}`);
    } catch (chatsError) {
      console.warn(
        `Advertencia al sincronizar chats para instancia ${instanceId}:`,
        chatsError.message
      );
    }

    // Sincronizar mensajes
    try {
      console.log(`Sincronizando mensajes para instancia ${instanceId}`);
      // Enviar mensaje al cliente para indicar que comenzará la sincronización de mensajes
      io.to(`instance_room_${instanceId}`).emit("messages_sync_start", {
        instanceId,
      });

      // Aquí podrías implementar la lógica para obtener y guardar todos los mensajes
      // Por ahora, solo configuramos los listeners para mensajes nuevos
      console.log(
        `Configurando escucha de mensajes para instancia ${instanceId}`
      );
    } catch (messagesError) {
      console.warn(
        `Advertencia al sincronizar mensajes para instancia ${instanceId}:`,
        messagesError.message
      );
    }

    console.log(`Sincronización completada para instancia ${instanceId}`);
  } catch (error) {
    console.error(
      `Error sincronizando datos para instancia ${instanceId}:`,
      error
    );
    // No lanzamos el error para no interrumpir el flujo principal
  }
}

export function loadInstancesFromDB() {
  const selectStmt = db.prepare(
    "SELECT id, status, user_id, user_name, profile_picture_url, created_at, updated_at FROM instances"
  );
  return selectStmt.all();
}

export function getBaileysSocket(instanceId) {
  const instanceData = activeInstances.get(instanceId);
  return instanceData ? instanceData.sock : null;
}

export function listActiveInstances() {
  return Array.from(activeInstances.keys());
}

export async function deleteInstancePermanently(instanceId) {
  const instanceData = activeInstances.get(instanceId);
  if (instanceData) {
    try {
      // 1. Intentar cerrar sesión si el socket está disponible
      if (instanceData.sock) {
        console.log(`Cerrando sesión para instancia ${instanceId}...`);
        await instanceData.sock.logout(); // Esto puede no ser siempre necesario o posible
      }
    } catch (error) {
      // Logout puede fallar si ya está desconectado, lo cual está bien.
      console.warn(
        `Advertencia al cerrar sesión para instancia ${instanceId}:`,
        error.message
      );
    } finally {
      // 2. Eliminar de la memoria activa
      activeInstances.delete(instanceId);
      console.log(`Instancia ${instanceId} eliminada de la memoria activa.`);
    }
  }

  // 3. Eliminar de la base de datos
  deleteInstanceFromDB(instanceId);

  // 4. Eliminar archivos de autenticación del sistema de archivos
  const authPath = path.join(AUTH_DIR, instanceId);
  if (fs.existsSync(authPath)) {
    try {
      // fs.rmSync es preferido, pero puede no estar disponible en versiones muy antiguas de Node
      // fs.rmSync(authPath, { recursive: true, force: true });
      // Usamos rmdirSync con recursive (deprecado pero funciona) como fallback
      fs.rmSync
        ? fs.rmSync(authPath, { recursive: true, force: true })
        : fs.rmdirSync(authPath, { recursive: true });
      console.log(
        `Archivos de autenticación para instancia ${instanceId} eliminados.`
      );
    } catch (err) {
      console.error(
        `Error al eliminar archivos de autenticación para instancia ${instanceId}:`,
        err.message
      );
    }
  } else {
    console.log(
      `No se encontraron archivos de autenticación para eliminar para instancia ${instanceId}.`
    );
  }
}
