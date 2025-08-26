import express from "express";
import http from "http";
import { Server } from "socket.io";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { loadInstancesFromDB, createInstance } from "./whatsappManager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true,
  },
  allowEIO3: true,
  transports: ["websocket", "polling"],
  upgrade: true,
  cookie: false,
});
const INTERNAL_MONITOR_ROOM = "internal_socket_monitor_room";

function logSocketActivity(type, details) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    type,
    details,
  };
  io.to(INTERNAL_MONITOR_ROOM).emit("socket_monitor_update", logEntry);
}

async function initializeWhatsAppInstances() {
  try {
    const instancesFromDB = loadInstancesFromDB();
    console.log(
      `Cargando ${instancesFromDB.length} instancias desde la base de datos...`
    );
    for (const instanceData of instancesFromDB) {
      console.log(`Intentando recrear instancia: ${instanceData.id}`);
      await createInstance(instanceData.id, io);
    }

    setTimeout(async () => {
      const { listActiveInstances } = await import("./whatsappManager.js");
      const activeInstances = listActiveInstances();
      console.log(
        `Instancias activas después de inicialización: ${activeInstances.join(
          ", "
        )}`
      );

      // For now, we'll just emit a generic status update for active instances
      // In a future enhancement, we could implement a function to get the real status
      activeInstances.forEach((instanceId) => {
        console.log(
          `Enviando estado de instancia ${instanceId}: active`
        );
        io.emit("instance_status_update", {
          instanceId,
          status: "active",
        });
      });
    }, 2000);
  } catch (error) {
    console.error("Error al inicializar instancias de WhatsApp:", error);
  }
}

initializeWhatsAppInstances().catch(console.error);

io.on("connection", (socket) => {
  const clientId = socket.id;
  console.log("Un cliente se ha conectado:", clientId);
  logSocketActivity("client_connected", { clientId });
  const clientIp = socket.handshake.address;

  socket.on("join_instance_room", (data) => {
    if (data && data.instanceId) {
      const roomName = `instance_room_${data.instanceId}`;
      socket.join(roomName);
      console.log(
        `Cliente ${clientId} se unió a la sala de instancia: ${roomName}`
      );
    } else {
      console.warn(
        `Cliente ${clientId} envió join_instance_room sin instanceId válido.`,
        data
      );
    }
  });

  socket.on("create_instance", async (data) => {
    if (data && data.instanceId) {
      const instanceId = data.instanceId;
      console.log(
        `Solicitud de creación de instancia '${instanceId}' recibida de cliente ${clientId}`
      );
      try {
        await createInstance(instanceId, io, clientId);
        io.emit("instance_created", { instanceId });
      } catch (error) {
        console.error(`Error al crear instancia '${instanceId}':`, error);
        socket.emit("instance_creation_error", {
          instanceId,
          error: error.message,
        });
      }
    }
  });

  socket.on("list_instances", async () => {
    console.log(
      `Solicitud de lista de instancias recibida de cliente ${clientId}`
    );
    try {
      const instancesFromDB = loadInstancesFromDB();
      socket.emit("instances_list", instancesFromDB);
      const { listActiveInstances } = await import(
        "./whatsappManager.js"
      );
      const activeInstances = listActiveInstances();
      console.log(`Instancias activas: ${activeInstances.join(", ")}`);
      activeInstances.forEach((instanceId) => {
        // Emit a generic "active" status for now
        // In a future enhancement, we could implement a function to get the real status
        console.log(
          `Enviando estado actual de instancia ${instanceId}: active`
        );
        socket.emit("instance_status_update", {
          instanceId,
          status: "active",
        });
      });
    } catch (error) {
      console.error("Error al listar instancias:", error);
      socket.emit("instances_list", []);
    }
  });

  socket.on("delete_instance", async (data) => {
    if (data && data.instanceId) {
      const instanceId = data.instanceId;
      console.log(
        `Solicitud de eliminación de instancia '${instanceId}' recibida de cliente ${clientId}`
      );
      try {
        const { deleteInstancePermanently } = await import(
          "./whatsappManager.js"
        );
        await deleteInstancePermanently(instanceId);
        console.log(`Instancia '${instanceId}' eliminada permanentemente.`);

        io.emit("instance_deleted", { instanceId });
      } catch (error) {
        console.error(`Error al eliminar instancia '${instanceId}':`, error);
        socket.emit("instance_deletion_error", {
          instanceId,
          error: error.message,
        });
      }
    }
  });

  socket.on("join_room", (data, callback) => {
    if (data && data.roomName) {
      const roomName = data.roomName;
      socket.join(roomName);
      logSocketActivity("CLIENT_JOINED_ROOM", {
        socketId: socket.id,
        room: roomName,
        clientIp,
      });
      console.log(
        `Socket ${socket.id} (IP: ${clientIp}) se unió a la sala ${roomName}`
      );
      if (typeof callback === "function") {
        callback({
          success: true,
          room: roomName,
          message: `Te has unido exitosamente a la sala: ${roomName}`,
        });
      }
    } else {
      const errorMessage =
        "Error al unirse a la sala: `roomName` no fue proporcionado en los datos.";
      logSocketActivity("JOIN_ROOM_FAILED", {
        socketId: socket.id,
        error: errorMessage,
        dataReceived: data,
        clientIp,
      });
      console.error(
        `Socket ${socket.id} (IP: ${clientIp}) falló al unirse a la sala. Datos recibidos:`,
        data
      );
      if (typeof callback === "function") {
        callback({ success: false, message: errorMessage, dataReceived: data });
      }
    }
  });
});

app.get("/", (req, res) => {
  res.redirect("/admin");
});

app.get("/admin", (req, res) => {
  res.render("admin", {
    title: "Panel de Administración",
    current_page: "admin",
  });
});

app.get("/admin/monitor", (req, res) => {
  res.render("monitor", {
    title: "Monitor Socket.IO",
    current_page: "monitor",
  });
});

app.get("/admin/whatsapp", (req, res) => {
  res.render("whatsapp", {
    title: "Gestor de Instancias Baileys",
    current_page: "whatsapp",
  });
});

app.post("/api/emit", (req, res) => {
  const { roomName, dataToEmit, eventName, clientId } = req.body;
  if (!roomName || typeof dataToEmit === "undefined") {
    logSocketActivity("HTTP_EMIT_FAILED_VALIDATION", {
      error: "roomName y dataToEmit son requeridos",
      receivedBody: req.body,
      sourceIp: req.ip,
    });
    return res.status(400).json({
      success: false,
      message: "Los campos `roomName` y `dataToEmit` son requeridos.",
    });
  }

  const targetEventName = eventName || "new_server_data";

  try {
    io.to(roomName).emit(targetEventName, dataToEmit);
    logSocketActivity("HTTP_EMIT_SUCCESS", {
      roomName,
      eventName: targetEventName,
      dataPreview:
        JSON.stringify(dataToEmit).substring(0, 100) +
        (JSON.stringify(dataToEmit).length > 100 ? "..." : ""),
      clientId: clientId || "N/A",
      sourceIp: req.ip,
    });
    res.status(200).json({
      success: true,
      message: `Evento '${targetEventName}' emitido exitosamente a la sala '${roomName}'.`,
    });
  } catch (error) {
    logSocketActivity("HTTP_EMIT_FAILED_SERVER_ERROR", {
      error: error.message,
      roomName,
      eventName: targetEventName,
      receivedBody: req.body,
      sourceIp: req.ip,
    });
    res.status(500).json({
      success: false,
      message: "Error interno del servidor al intentar emitir el evento.",
      error: error.message,
    });
  }
});

const PORT = 6001;
httpServer.listen(PORT, () => {
  console.log(`Servidor Socket.IO escuchando en el puerto ${PORT}`);
});
