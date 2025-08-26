// whatsappManager.js
import Database from 'better-sqlite3';
import { 
  makeWASocket, 
  useMultiFileAuthState, 
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Pino from 'pino';

// --- Configuración de rutas ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.join(__dirname, 'whatsapp_instances.db');
const AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

// --- Inicialización de la Base de Datos ---
const db = new Database(DB_PATH);

// Crear tabla si no existe
db.exec(`
  CREATE TABLE IF NOT EXISTS instances (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'unknown',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

// --- Manejo de Instancias en Memoria ---
// Mapa para almacenar las instancias activas de Baileys y sus datos asociados
const activeInstances = new Map();

/**
 * Actualiza la marca de tiempo 'updated_at' en la base de datos.
 * @param {string} instanceId - ID de la instancia.
 */
function updateInstanceTimestamp(instanceId) {
    const updateStmt = db.prepare('UPDATE instances SET updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(instanceId);
}

/**
 * Actualiza el estado de una instancia en la base de datos.
 * @param {string} instanceId - ID de la instancia.
 * @param {string} status - Nuevo estado.
 */
function updateInstanceState(instanceId, status) {
    const updateStmt = db.prepare('UPDATE instances SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(status, instanceId);
    console.log(`Estado de instancia ${instanceId} actualizado a: ${status}`);
}

/**
 * Crea una nueva instancia en la base de datos.
 * @param {string} instanceId - ID de la instancia.
 */
function createInstanceInDB(instanceId) {
    const insertStmt = db.prepare('INSERT OR IGNORE INTO instances (id, status) VALUES (?, ?)');
    const result = insertStmt.run(instanceId, 'init');
    if (result.changes > 0) {
        console.log(`Instancia ${instanceId} creada en la base de datos.`);
    } else {
        console.log(`Instancia ${instanceId} ya existía en la base de datos.`);
    }
}

/**
 * Elimina una instancia de la base de datos.
 * @param {string} instanceId - ID de la instancia.
 */
function deleteInstanceFromDB(instanceId) {
    const deleteStmt = db.prepare('DELETE FROM instances WHERE id = ?');
    deleteStmt.run(instanceId);
    console.log(`Instancia ${instanceId} eliminada de la base de datos.`);
}

/**
 * Carga todas las instancias desde la base de datos.
 * @returns {Array} Array de objetos con datos de instancias.
 */
export function loadInstancesFromDB() {
    const selectStmt = db.prepare('SELECT * FROM instances');
    return selectStmt.all();
}

/**
 * Crea una nueva instancia de Baileys y la gestiona.
 * @param {string} instanceId - ID único para la instancia.
 * @param {Object} io - La instancia de Socket.IO para emitir eventos.
 * @param {string} [targetSocketId] - (Opcional) ID del socket específico al que enviar el QR.
 */
export async function createInstance(instanceId, io, targetSocketId = null) {
    if (activeInstances.has(instanceId)) {
        console.log(`La instancia con ID ${instanceId} ya está activa.`);
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
    console.log(`Usando versión de WhatsApp Web: ${version.join('.')}, ¿es la más reciente? ${isLatest}`);

    // 5. Configurar la conexión de Baileys
    const sock = makeWASocket({
        version,
        auth: {
            creds: state.creds,
            keys: makeCacheableSignalKeyStore(state.keys, Pino({ level: 'fatal' })),
        },
        browser: ['Baileys Manager', 'Safari', '1.0.0'], // Personaliza el nombre del cliente
        printQRInTerminal: false, // Ya no lo necesitamos, lo manejamos por Socket.IO
        syncFullHistory: true, // Sincronizar todo el historial
        markOnlineOnConnect: true, // Marcar como en línea al conectar
        generateHighQualityLinkPreview: true, // Generar vistas previas de alta calidad
        getMessage: async (key) => {
            // Implementar si se necesita recuperar mensajes específicos
            return {
                conversation: 'Hello World!'
            }
        }
    });

    // 5. Almacenar la instancia activa con sus datos auxiliares
    activeInstances.set(instanceId, {
        sock: sock,
        status: 'init',
        // Podemos almacenar más datos aquí si es necesario
    });
    updateInstanceState(instanceId, 'init');

    // 6. Manejar eventos de actualización de conexión
    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error instanceof Boom) &&
                lastDisconnect.error.output.statusCode !== DisconnectReason.loggedOut;

            console.log(`Conexión cerrada para instancia ${instanceId} debido a`, lastDisconnect?.error?.message || lastDisconnect?.error);
            updateInstanceState(instanceId, 'disconnected');
            
            const instanceData = activeInstances.get(instanceId);
            if (instanceData) {
                instanceData.status = 'disconnected';
            }

            // Notificar a todos los clientes suscritos a esta instancia
            io.to(`instance_room_${instanceId}`).emit('instance_status_update', { instanceId, status: 'close', message: lastDisconnect?.error?.message });

            if (shouldReconnect) {
                console.log(`Reconectando instancia ${instanceId}...`);
                // Pequeño retraso antes de reconectar
                setTimeout(() => {
                    // Antes de reconectar, asegurarse de que la instancia anterior esté completamente eliminada de la memoria
                    activeInstances.delete(instanceId);
                    createInstance(instanceId, io, targetSocketId)
                }, 5000);
            } else {
                console.log(`Instancia ${instanceId} cerrada permanentemente.`);
                // Si se desloguea, podrías querer eliminar los archivos de sesión
                // y la entrada de la DB. Por ahora, solo la marcamos como desconectada.
                // activeInstances.delete(instanceId);
            }
        } else if (connection === 'open') {
            console.log(`Conexión abierta para instancia ${instanceId}`);
            updateInstanceState(instanceId, 'connected');
            const instanceData = activeInstances.get(instanceId);
            if (instanceData) {
                instanceData.status = 'connected';
            }
            
            // Sincronizar contactos, chats y mensajes
            await syncInstanceData(instanceId, sock, io);
            
            // Notificar a todos los clientes suscritos
            io.to(`instance_room_${instanceId}`).emit('instance_status_update', { instanceId, status: 'open' });
        }

        // Si se recibe un código QR
        if (qr) {
            console.log(`Código QR generado para instancia ${instanceId}.`);
            updateInstanceState(instanceId, 'qr');
            const instanceData = activeInstances.get(instanceId);
            if (instanceData) {
                instanceData.status = 'qr';
            }
            
            try {
                // Generar una Data URL del QR
                const qrDataUrl = await QRCode.toDataURL(qr);
                console.log(`QR Data URL generado (primeros 50 chars): ${qrDataUrl.substring(0, 50)}...`);
                
                // Emitir el QR
                // Opción 1: Al socket específico que solicitó la creación
                if (targetSocketId) {
                    console.log(`Intentando emitir QR a socket específico: ${targetSocketId}`);
                    // Verificar si el socket todavía está conectado puede ser complejo con socket.io
                    // Emitiremos de todos modos y también a la sala como respaldo.
                    io.to(targetSocketId).emit('qr_code', { instanceId, qrDataUrl });
                }
                // Opción 2 (Respaldo): Emitir a la sala de la instancia
                // Esto es útil si el cliente se une a la sala después de solicitar la creación
                // o si hay algún problema con targetSocketId.
                console.log(`Emitiendo QR también a sala de instancia: instance_room_${instanceId}`);
                io.to(`instance_room_${instanceId}`).emit('qr_code', { instanceId, qrDataUrl });
                
            } catch (err) {
                console.error(`Error generando QR para instancia ${instanceId}:`, err);
            }
        }
        updateInstanceTimestamp(instanceId);
    });

    // 7. Manejar actualizaciones de credenciales
    sock.ev.on('creds.update', saveCreds);

    // 8. Manejar eventos de nuevos mensajes
    sock.ev.on('messages.upsert', (msgUpsertEvent) => {
        console.log(`Nuevo mensaje recibido para instancia ${instanceId}:`, msgUpsertEvent.type);
        // Emitir el mensaje a la sala específica de esta instancia
        io.to(`instance_room_${instanceId}`).emit('new_message', { instanceId, ...msgUpsertEvent });
    });

    // 9. Manejar actualizaciones de contactos
    sock.ev.on('contacts.upsert', (contacts) => {
        console.log(`Contactos actualizados para instancia ${instanceId}:`, contacts.length);
        // Emitir los contactos actualizados a la sala específica
        io.to(`instance_room_${instanceId}`).emit('contacts_update', { instanceId, contacts });
    });

    // 10. Manejar actualizaciones de chats
    sock.ev.on('chats.upsert', (chats) => {
        console.log(`Chats agregados para instancia ${instanceId}:`, chats.length);
        // Emitir los chats nuevos a la sala específica
        io.to(`instance_room_${instanceId}`).emit('chats_upsert', { instanceId, chats });
    });

    // 11. Manejar actualizaciones de chats
    sock.ev.on('chats.update', (chats) => {
        console.log(`Chats actualizados para instancia ${instanceId}:`, chats.length);
        // Emitir los chats actualizados a la sala específica
        io.to(`instance_room_${instanceId}`).emit('chats_update', { instanceId, chats });
    });

    // 12. Manejar eliminación de chats
    sock.ev.on('chats.delete', (chatIds) => {
        console.log(`Chats eliminados para instancia ${instanceId}:`, chatIds.length);
        // Emitir los chats eliminados a la sala específica
        io.to(`instance_room_${instanceId}`).emit('chats_delete', { instanceId, chatIds });
    });

    console.log(`Instancia ${instanceId} configurada y almacenada en memoria.`);
}

/**
 * Sincroniza los datos de la instancia (contactos, chats, mensajes) después de conectar
 * @param {string} instanceId - ID de la instancia
 * @param {Object} sock - Socket de Baileys
 * @param {Object} io - Instancia de Socket.IO
 */
async function syncInstanceData(instanceId, sock, io) {
    try {
        console.log(`Iniciando sincronización de datos para instancia ${instanceId}`);
        
        // Obtener información del perfil
        const profilePictureUrl = await sock.profilePictureUrl(sock.user.id, 'image').catch(() => null);
        const status = await sock.fetchStatus(sock.user.id).catch(() => null);
        
        // Emitir información del perfil
        io.to(`instance_room_${instanceId}`).emit('profile_info', {
            instanceId,
            profilePictureUrl,
            status: status?.status,
            userId: sock.user.id,
            userName: sock.user.name || sock.user.verifiedName
        });
        
        // Obtener contactos
        const contacts = await sock.contacts;
        if (Object.keys(contacts).length > 0) {
            io.to(`instance_room_${instanceId}`).emit('contacts_update', { 
                instanceId, 
                contacts: Object.values(contacts) 
            });
        }
        
        // Obtener chats
        // Nota: Baileys no tiene una función directa para obtener todos los chats
        // Esta funcionalidad puede requerir implementación adicional según las necesidades
        
        console.log(`Sincronización completada para instancia ${instanceId}`);
    } catch (error) {
        console.error(`Error sincronizando datos para instancia ${instanceId}:`, error);
    }
}

/**
 * Obtiene una instancia de Baileys por su ID.
 * @param {string} instanceId - ID de la instancia.
 * @returns {Object|null} El objeto de datos de la instancia o null si no existe.
 */
export function getInstanceData(instanceId) {
    return activeInstances.get(instanceId) || null;
}

/**
 * Obtiene el socket de Baileys para una instancia.
 * @param {string} instanceId - ID de la instancia.
 * @returns {Object|null} El socket de Baileys o null si no está activo.
 */
export function getBaileysSocket(instanceId) {
    const instanceData = activeInstances.get(instanceId);
    return instanceData ? instanceData.sock : null;
}

/**
 * Lista todas las instancias activas en memoria.
 * @returns {Array<string>} Array de IDs de instancias activas.
 */
export function listActiveInstances() {
    return Array.from(activeInstances.keys());
}

/**
 * (Opcional) Elimina una instancia activa (cierra sesión, limpia memoria, DB y archivos).
 * @param {string} instanceId - ID de la instancia.
 */
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
            console.warn(`Advertencia al cerrar sesión para instancia ${instanceId}:`, error.message);
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
            fs.rmSync ? fs.rmSync(authPath, { recursive: true, force: true }) : fs.rmdirSync(authPath, { recursive: true });
            console.log(`Archivos de autenticación para instancia ${instanceId} eliminados.`);
        } catch (err) {
            console.error(`Error al eliminar archivos de autenticación para instancia ${instanceId}:`, err.message);
        }
    } else {
        console.log(`No se encontraron archivos de autenticación para eliminar para instancia ${instanceId}.`);
    }
}