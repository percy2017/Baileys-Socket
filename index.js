// Importar los módulos necesarios
import express from 'express';
import dotenv from 'dotenv';
import http from 'http'; // Módulo HTTP nativo de Node.js
import { Server } from "socket.io"; // Clase Server de socket.io
import cors from 'cors'; // Middleware CORS
import path from 'path'; // Módulo path para trabajar con rutas de archivos y directorios
import { fileURLToPath } from 'url'; // Para obtener __dirname en ES Modules
import { loadInstancesFromDB, createInstance } from './whatsappManager.js'; // Nuestro nuevo módulo

// Configurar dotenv para cargar variables de entorno desde .env
dotenv.config();

// Obtener __filename y __dirname en ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Crear una instancia de la aplicación Express
const app = express();

// Configurar CORS para Express
// Esto permite peticiones desde cualquier origen. En producción, deberías restringirlo.
app.use(cors());

// Middleware para servir archivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Middleware para parsear cuerpos de solicitud JSON (esencial para los hooks)
app.use(express.json());

// Configurar EJS como motor de plantillas
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views')); // Especificar la carpeta de vistas

// Crear un servidor HTTP a partir de la aplicación Express
const httpServer = http.createServer(app);

// Inicializar Socket.IO con el servidor HTTP y configurar CORS para Socket.IO
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Permitir cualquier origen (ajustar en producción)
    methods: ["GET", "POST"] // Métodos permitidos
  }
});

// Nombre de la sala para el monitor interno de actividad de Socket.IO
const INTERNAL_MONITOR_ROOM = 'internal_socket_monitor_room';

// Función helper para emitir logs de actividad a la sala del monitor
function logSocketActivity(type, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    details,
  };
  io.to(INTERNAL_MONITOR_ROOM).emit('socket_monitor_update', logEntry);
  // También podemos loguearlo en la consola del servidor si queremos
  // console.log(`MONITOR_LOG: ${type}`, details);
}

// Definir el puerto para el servidor
const PORT = process.env.PORT || 3000; // Usar el puerto de .env o 3000 por defecto para coincidir con Dockerfile/Compose

// --- Integración con whatsappManager ---
// Cargar y recrear instancias al iniciar el servidor
async function initializeWhatsAppInstances() {
  try {
      const instancesFromDB = loadInstancesFromDB();
      console.log(`Cargando ${instancesFromDB.length} instancias desde la base de datos...`);
      for (const instanceData of instancesFromDB) {
          console.log(`Intentando recrear instancia: ${instanceData.id}`);
          // Pasamos 'io' para que pueda emitir eventos
          await createInstance(instanceData.id, io);
      }
  } catch (error) {
      console.error('Error al inicializar instancias de WhatsApp:', error);
  }
}

// Llamar a la función de inicialización
initializeWhatsAppInstances().catch(console.error);

// Manejar conexiones de Socket.IO
io.on('connection', (socket) => {
  const clientId = socket.id;
  console.log('Un cliente se ha conectado:', clientId);
  logSocketActivity('client_connected', { clientId });
  const clientIp = socket.handshake.address; // Obtener IP del cliente

  // --- Eventos específicos para gestión de WhatsApp ---
  
  // Unirse a la sala de una instancia específica
  socket.on('join_instance_room', (data) => {
      if (data && data.instanceId) {
          const roomName = `instance_room_${data.instanceId}`;
          socket.join(roomName);
          console.log(`Cliente ${clientId} se unió a la sala de instancia: ${roomName}`);
          // Podrías enviar un mensaje de confirmación si lo deseas
          // socket.emit('joined_instance_room', { success: true, instanceId: data.instanceId });
      } else {
          console.warn(`Cliente ${clientId} envió join_instance_room sin instanceId válido.`, data);
      }
  });

  // Crear una nueva instancia de WhatsApp
  socket.on('create_instance', async (data) => {
      if (data && data.instanceId) {
          const instanceId = data.instanceId;
          console.log(`Solicitud de creación de instancia '${instanceId}' recibida de cliente ${clientId}`);
          try {
              // Pasamos 'io' y 'clientId' para que el QR se envíe solo al solicitante
              await createInstance(instanceId, io, clientId);
              // Notificar a todos los clientes que una nueva instancia fue solicitada/creada
              io.emit('instance_created', { instanceId });
          } catch (error) {
              console.error(`Error al crear instancia '${instanceId}':`, error);
              // Podrías enviar un mensaje de error al cliente específico
              socket.emit('instance_creation_error', { instanceId, error: error.message });
          }
      }
  });

  // Listar todas las instancias (desde la DB)
  socket.on('list_instances', () => {
      console.log(`Solicitud de lista de instancias recibida de cliente ${clientId}`);
      try {
          const instancesFromDB = loadInstancesFromDB();
          const instanceIds = instancesFromDB.map(inst => inst.id);
          socket.emit('instances_list', instanceIds);
      } catch (error) {
          console.error('Error al listar instancias:', error);
          socket.emit('instances_list', []); // Enviar lista vacía en caso de error
      }
  });

  // Eliminar una instancia permanentemente
  socket.on('delete_instance', async (data) => {
      if (data && data.instanceId) {
          const instanceId = data.instanceId;
          console.log(`Solicitud de eliminación de instancia '${instanceId}' recibida de cliente ${clientId}`);
          try {
              const { deleteInstancePermanently } = await import('./whatsappManager.js'); // Importar dinámicamente
              await deleteInstancePermanently(instanceId);
              console.log(`Instancia '${instanceId}' eliminada permanentemente.`);
              
              // Notificar a todos los clientes que la instancia fue eliminada
              io.emit('instance_deleted', { instanceId });
              
          } catch (error) {
              console.error(`Error al eliminar instancia '${instanceId}':`, error);
              // Podrías enviar un mensaje de error al cliente específico
              socket.emit('instance_deletion_error', { instanceId, error: error.message });
          }
      }
  });

  // --- Fin de eventos específicos para WhatsApp ---

  socket.on('disconnect', () => {
    console.log('Un cliente se ha desconectado:', clientId);
    logSocketActivity('client_disconnected', { clientId, clientIp });
  });

  // Manejar cuando un cliente intenta unirse a una sala genérica
  socket.on('join_room', (data, callback) => {
    if (data && data.roomName) {
      const roomName = data.roomName;
      socket.join(roomName);
      logSocketActivity('CLIENT_JOINED_ROOM', { socketId: socket.id, room: roomName, clientIp });
      console.log(`Socket ${socket.id} (IP: ${clientIp}) se unió a la sala ${roomName}`);
      if (typeof callback === 'function') {
        callback({ success: true, room: roomName, message: `Te has unido exitosamente a la sala: ${roomName}` });
      }
    } else {
      const errorMessage = 'Error al unirse a la sala: `roomName` no fue proporcionado en los datos.';
      logSocketActivity('JOIN_ROOM_FAILED', { socketId: socket.id, error: errorMessage, dataReceived: data, clientIp });
      console.error(`Socket ${socket.id} (IP: ${clientIp}) falló al unirse a la sala. Datos recibidos:`, data);
      if (typeof callback === 'function') {
        callback({ success: false, message: errorMessage, dataReceived: data });
      }
    }
  });
  // Evento para que el monitor se una a la sala de logs internos
  socket.on('join_internal_monitor_room', (callback) => {
    socket.join(INTERNAL_MONITOR_ROOM);
    console.log(`Cliente ${clientId} se unió a la sala de monitoreo interno: ${INTERNAL_MONITOR_ROOM}`);
    logSocketActivity('monitor_joined', { clientId, room: INTERNAL_MONITOR_ROOM });
    if (typeof callback === 'function') {
      callback({ success: true, room: INTERNAL_MONITOR_ROOM, message: `Te has unido a la sala de monitoreo interno: ${INTERNAL_MONITOR_ROOM}` });
    }
  });
});



// Ruta para landingpage
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// Ruta principal del panel de administración
app.get('/admin', (req, res) => {
  res.render('admin', { 
    title: 'Panel de Administración',
    current_page: 'admin'
  });
});

// Ruta para servir la página del monitor
app.get('/admin/monitor', (req, res) => {
  res.render('monitor', { 
    title: 'Monitor Socket.IO',
    current_page: 'monitor'
  }); // Renderiza views/monitor.ejs
});

// Ruta para servir la página de gestión de WhatsApp
app.get('/admin/whatsapp', (req, res) => {
  res.render('whatsapp', { 
    title: 'Gestor de Instancias Baileys',
    current_page: 'whatsapp'
  }); // Renderiza views/whatsapp.ejs
});

// Ruta genérica para que un sistema externo (como un webhook de WordPress) emita un evento a una sala específica
app.post('/api/emit', (req, res) => {
  const { roomName, dataToEmit, eventName, clientId } = req.body; // eventName y clientId son opcionales

  // Validación básica
  if (!roomName || typeof dataToEmit === 'undefined') {
    logSocketActivity('HTTP_EMIT_FAILED_VALIDATION', { error: 'roomName y dataToEmit son requeridos', receivedBody: req.body, sourceIp: req.ip });
    return res.status(400).json({ success: false, message: 'Los campos `roomName` y `dataToEmit` son requeridos.' });
  }

  const targetEventName = eventName || 'new_server_data'; // Evento por defecto si no se especifica

  try {
    io.to(roomName).emit(targetEventName, dataToEmit);
    logSocketActivity('HTTP_EMIT_SUCCESS', {
      roomName,
      eventName: targetEventName,
      dataPreview: JSON.stringify(dataToEmit).substring(0, 100) + (JSON.stringify(dataToEmit).length > 100 ? '...' : ''), // Preview de los datos
      clientId: clientId || 'N/A', // Si se proporciona un ID de cliente
      sourceIp: req.ip
    });
    res.status(200).json({ success: true, message: `Evento '${targetEventName}' emitido exitosamente a la sala '${roomName}'.` });
  } catch (error) {
    logSocketActivity('HTTP_EMIT_FAILED_SERVER_ERROR', { error: error.message, roomName, eventName: targetEventName, receivedBody: req.body, sourceIp: req.ip });
    res.status(500).json({ success: false, message: 'Error interno del servidor al intentar emitir el evento.', error: error.message });
  }
});

// Iniciar el servidor y escuchar en el puerto especificado
httpServer.listen(PORT, () => {
  console.log(`Servidor Socket.IO escuchando en el puerto ${PORT}`);
});
