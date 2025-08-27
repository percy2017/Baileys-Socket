let instances = {};
let currentDetailInstanceId = null;
let socket;
let instancesRow;
let noInstancesMessage;
let createInstanceBtn;
let createInstanceForm;
let instanceIdInput;
let qrPlaceholder;
let qrCodeDisplay;
let qrLoading;
let qrInfoText;

function renderInstances() {
  if (!instancesRow) return;

  instancesRow.innerHTML = "";
  const instanceIds = Object.keys(instances);

  if (instanceIds.length === 0) {
    noInstancesMessage.textContent =
      'No hay instancias creadas. Haz clic en "Crear Nueva Instancia".';
    noInstancesMessage.style.display = "block";
    return;
  }

  noInstancesMessage.style.display = "none";

  instanceIds.forEach((id) => {
    const instance = instances[id];
    console.log(instance);
    const colDiv = document.createElement("div");
    colDiv.className = "col-lg-4 col-md-6 mb-4";

    const cardDiv = document.createElement("div");
    cardDiv.className = "card instance-card h-100";

    const cardBodyDiv = document.createElement("div");
    cardBodyDiv.className = "card-body";

    // --- Encabezado con Avatar e Info ---
    const avatarContainer = document.createElement("div");
    avatarContainer.className = "d-flex align-items-center mb-3";
    const avatarImg = document.createElement("img");
    avatarImg.src = instance.profilePictureUrl || "/img/default-avatar.png"; // Usar un avatar por defecto
    avatarImg.className = "rounded-circle me-3";
    avatarImg.style.width = "50px";
    avatarImg.style.height = "50px";
    avatarImg.style.objectFit = "cover";
    avatarContainer.appendChild(avatarImg);

    const userInfoDiv = document.createElement("div");
    const cardTitle = document.createElement("h5");
    cardTitle.className = "card-title mb-1";
    cardTitle.textContent = instance.userName || instance.id;
    const cardSubtitle = document.createElement("p");
    cardSubtitle.className = "card-text text-muted small mb-0";
    cardSubtitle.textContent = instance.userId || "ID: " + instance.id;
    userInfoDiv.appendChild(cardTitle);
    userInfoDiv.appendChild(cardSubtitle);
    avatarContainer.appendChild(userInfoDiv);
    cardBodyDiv.appendChild(avatarContainer);

    // --- Estado ---
    let statusText, statusClass;
    switch (instance.status) {
      case "open":
      case "connected":
        statusText = "Conectado";
        statusClass = "bg-success";
        break;
      case "active": // <-- AÑADE ESTA LÍNEA
        statusText = "Conectado";
        statusClass = "bg-success";
        break;
      case "qr":
        statusText = "Esperando QR";
        statusClass = "bg-warning text-dark";
        break;
      case "close":
        statusText = instance.errorMessage ? "Error" : "Desconectado";
        statusClass = instance.errorMessage ? "bg-danger" : "bg-secondary";
        break;
      default:
        statusText = "Desconocido";
        statusClass = "bg-secondary";
        break;
    }
    cardBodyDiv.innerHTML += `
            <div class="d-flex justify-content-between align-items-center mb-3">
                <span>Estado:</span>
                <span class="badge ${statusClass}">${statusText}</span>
            </div>
        `;

    // --- Estadísticas ---
    cardBodyDiv.innerHTML += `
    <div class="row g-2 small">
        <div class="col-4"><strong><i class="bi bi-people-fill"></i> </strong> ${
          instance.contactsCount || 0
        }</div>
        <div class="col-4"><strong><i class="bi bi-chat-dots-fill"></i> </strong> ${
          instance.chatsCount || 0
        }</div>
        <div class="col-4"><strong><i class="bi bi-send-fill"></i> </strong> ${
          instance.messagesCount || 0
        }</div>
    </div>
`;

    const cardFooterDiv = document.createElement("div");
    cardFooterDiv.className =
      "card-footer d-flex justify-content-end align-items-center";

    const buttonGroup = document.createElement("div");
    buttonGroup.className = "btn-group";
    buttonGroup.role = "group";

    // Botón QR
    const qrBtn = document.createElement("button");
    qrBtn.className = "btn btn-sm btn-outline-secondary";
    qrBtn.innerHTML = "QR";
    qrBtn.disabled = instance.status !== "qr";
    qrBtn.onclick = (e) => {
      e.stopPropagation();
      showInstanceDetails(id);
    };

    // Botón Ver (puedes añadir una página de detalles más adelante)
    const viewBtn = document.createElement("button");
    viewBtn.className = "btn btn-sm btn-outline-info";
    viewBtn.innerHTML = "Ver";
    viewBtn.onclick = (e) => {
      e.stopPropagation();
      alert(`Detalles de la instancia: ${id}`);
    };

    // Botón Eliminar
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn btn-sm btn-outline-danger";
    deleteBtn.innerHTML = "Eliminar";
    deleteBtn.onclick = (e) => {
      e.stopPropagation();
      Swal.fire({
        title: "¿Estás seguro?",
        text: `Eliminar la instancia "${id}" es irreversible.`,
        icon: "warning",
        showCancelButton: true,
        confirmButtonColor: "#d33",
        cancelButtonText: "Cancelar",
        confirmButtonText: "Sí, eliminar",
      }).then((result) => {
        if (result.isConfirmed)
          socket.emit("delete_instance", { instanceId: id });
      });
    };

    buttonGroup.appendChild(qrBtn);
    buttonGroup.appendChild(viewBtn);
    buttonGroup.appendChild(deleteBtn);
    cardFooterDiv.appendChild(buttonGroup);

    // --- AÑADIR TODO AL DOM (ESTO FALTABA) ---
    cardDiv.appendChild(cardBodyDiv);
    cardDiv.appendChild(cardFooterDiv);
    colDiv.appendChild(cardDiv);
    instancesRow.appendChild(colDiv);
  });
}

function showInstanceDetails(instanceId) {
  const instance = instances[instanceId];
  if (!instance) return;

  currentDetailInstanceId = instanceId;

  // Mostrar QR en el modal
  const modal = new bootstrap.Modal(document.getElementById("qrModal"));

  // Manejar visualización del QR
  if (qrCodeDisplay) qrCodeDisplay.style.display = "none";
  if (qrPlaceholder) qrPlaceholder.style.display = "block";
  if (qrLoading) qrLoading.style.display = "none";

  if (instance.qr) {
    // Si hay un QR, mostrarlo
    if (qrPlaceholder) qrPlaceholder.style.display = "none";
    if (qrCodeDisplay) {
      qrCodeDisplay.src = instance.qr; // Asumimos que 'qr' es una data URL
      qrCodeDisplay.style.display = "block";
    }
    if (qrInfoText)
      qrInfoText.textContent =
        "Escanea este código QR con tu WhatsApp para vincular la cuenta.";
  } else if (instance.connected) {
    // Si está conectado
    if (qrPlaceholder)
      qrPlaceholder.textContent = "Instancia conectada. No se necesita QR.";
    if (qrInfoText)
      qrInfoText.textContent = "La instancia está conectada y lista para usar.";
  } else {
    // Si está desconectado y sin QR
    if (qrPlaceholder) qrPlaceholder.style.display = "block";
    if (qrPlaceholder)
      qrPlaceholder.textContent = "No se ha generado un código QR aún.";
    if (qrLoading) qrLoading.style.display = "none";
    if (qrInfoText)
      qrInfoText.textContent = "Crea una instancia para generar un código QR.";
  }

  // Mostrar el modal
  modal.show();
}

function createNewInstance() {
  const id = instanceIdInput ? instanceIdInput.value.trim() : "";
  if (!id) {
    // alert('Por favor, ingresa un ID para la instancia.');
    Swal.fire({
      title: "ID requerido",
      text: "Por favor, ingresa un ID para la instancia.",
      icon: "warning",
      confirmButtonText: "OK",
    });
    return;
  }

  console.log(`Solicitando creación de instancia con ID: ${id}`);
  if (socket) {
    socket.emit("create_instance", { instanceId: id });
  }

  const modal = bootstrap.Modal.getInstance(
    document.getElementById("createInstanceModal")
  );
  if (modal) {
    modal.hide();
  }
  // Limpiar el formulario
  if (createInstanceForm) createInstanceForm.reset();
}

document.addEventListener("DOMContentLoaded", function () {
  instancesRow = document.getElementById("instances-row");
  noInstancesMessage = document.getElementById("no-instances-message");
  createInstanceBtn = document.getElementById("create-instance-btn");
  createInstanceForm = document.getElementById("create-instance-form");
  instanceIdInput = document.getElementById("instance-id");
  qrPlaceholder = document.getElementById("qr-placeholder");
  qrCodeDisplay = document.getElementById("qr-code-display");
  qrLoading = document.getElementById("qr-loading");
  qrInfoText = document.getElementById("qr-info-text");

  // Conectarse al servidor Socket.IO
  socket = io({
    transports: ["websocket", "polling"],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
    timeout: 20000,
  });

  // Manejar reconexiones
  socket.on("connect", () => {
    console.log("Cliente conectado al servidor Socket.IO con ID:", socket.id);
    // Solicitar la lista de instancias al conectarse
    socket.emit("list_instances");
  });

  // Manejar desconexiones
  socket.on("disconnect", (reason) => {
    console.log("Cliente desconectado del servidor Socket.IO:", reason);
    // Mostrar mensaje al usuario si la desconexión no es intencional
    if (reason !== "io client disconnect") {
      console.log("Intentando reconectar automáticamente...");
    }
  });

  // Manejar errores de conexión
  socket.on("connect_error", (error) => {
    console.error("Error de conexión con el servidor Socket.IO:", error);
    console.log("Detalles del error:", {
      message: error.message,
      type: error.type,
      description: error.description,
    });
  });

  // Event Listeners
  if (createInstanceBtn) {
    createInstanceBtn.addEventListener("click", createNewInstance);
  }

  // Escuchar eventos del servidor
  socket.on("connect", () => {
    console.log("Cliente conectado al servidor Socket.IO");
    // Solicitar la lista de instancias al conectarse
    socket.emit("list_instances");
  });


socket.on("instances_list", (instancesData) => {
    console.log("[UI] Lista de instancias recibida:", instancesData);
    instances = {}; // Limpiar instancias anteriores

    if (instancesData && instancesData.length > 0) {
        instancesData.forEach((instanceData) => {
            // --- CORRECCIÓN CLAVE ---
            // Usamos el spread operator (...) para copiar TODAS las propiedades del servidor,
            // incluyendo contactsCount, chatsCount, y messagesCount.
            const instanceId = instanceData.id;
            instances[instanceId] = { ...instanceData };

            // Luego, formateamos la fecha para que sea legible
            instances[instanceId].createdAt = new Date(instanceData.created_at).toLocaleString();

            // Unirse a la sala de la instancia
            console.log(`[UI] Uniéndose a la sala: instance_room_${instanceId}`);
            socket.emit("join_instance_room", { instanceId });
        });
    }
    renderInstances();
});

  socket.on("instance_created", (data) => {
    const { instanceId } = data;
    console.log(`[UI] Notificación de creación de instancia: ${instanceId}`);
    if (!instances[instanceId]) {
      instances[instanceId] = {
        id: instanceId,
        createdAt: new Date().toLocaleString(),
      };
      renderInstances();
    }
    // Unirse automáticamente a la sala de la nueva instancia para recibir actualizaciones
    console.log(
      `[UI] Uniéndose automáticamente a la sala de la nueva instancia: instance_room_${instanceId}`
    );
    socket.emit("join_instance_room", { instanceId: instanceId });
    // Opcionalmente, mostrar el modal de detalles de la nueva instancia
    // showInstanceDetails(instanceId);
  });

  socket.on("qr_code", (data) => {
    const { instanceId, qrDataUrl } = data;
    console.log(`Código QR recibido para instancia ${instanceId}`);
    if (instances[instanceId]) {
      instances[instanceId].qr = qrDataUrl;
      renderInstances();
      // Si el modal de detalles de esta instancia está abierto, actualizarlo
      if (currentDetailInstanceId === instanceId) {
        showInstanceDetails(instanceId);
      }
    }
  });

  // En /public/js/whatsapp.js

  socket.on("instance_status_update", (data) => {
    const { instanceId, status, message } = data;
    if (instances[instanceId]) {
      const oldStatus = instances[instanceId].status;
      instances[instanceId].status = status;

      if (status === "open") {
        instances[instanceId].connected = true;
        delete instances[instanceId].qr;
        delete instances[instanceId].errorMessage;

        // LÓGICA PARA CERRAR MODAL Y MOSTRAR TOAST
        // Si el estado anterior era 'qr' y el modal de esta instancia está abierto
        if (oldStatus === "qr" && currentDetailInstanceId === instanceId) {
          const modal = bootstrap.Modal.getInstance(
            document.getElementById("qrModal")
          );
          if (modal) {
            modal.hide();
          }
          Swal.fire({
            toast: true,
            position: "top-end",
            icon: "success",
            title: `Instancia "${instanceId}" conectada!`,
            showConfirmButton: false,
            timer: 3000,
            timerProgressBar: true,
          });
        }
      } else if (status === "close") {
        instances[instanceId].connected = false;
        if (message) instances[instanceId].errorMessage = message;
      }

      renderInstances();

      // Si el modal está abierto, actualiza su contenido
      if (currentDetailInstanceId === instanceId) {
        showInstanceDetails(instanceId);
      }
    }
  });

  // Nuevos eventos para sincronización de datos
  socket.on("profile_info", (data) => {
    const { instanceId, profilePictureUrl, status, userId, userName } = data;
    console.log(
      `Información de perfil recibida para instancia ${instanceId}:`,
      { profilePictureUrl, userName, userId }
    );
    if (instances[instanceId]) {
      instances[instanceId].profilePictureUrl = profilePictureUrl;
      instances[instanceId].status = status;
      instances[instanceId].userId = userId;
      instances[instanceId].userName = userName || userId || instanceId;
      renderInstances();
      // Si el modal de detalles de esta instancia está abierto, actualizarlo
      if (currentDetailInstanceId === instanceId) {
        showInstanceDetails(instanceId);
      }
    }
  });

  socket.on("contacts_update", (data) => {
    const { instanceId, contacts, count } = data;
    console.log(`Contactos actualizados para instancia ${instanceId}:`, count);
    if (instances[instanceId]) {
      instances[instanceId].contactsCount = (instances[instanceId].contactsCount || 0) + count;
      renderInstances();
    }
  });

  socket.on("chats_upsert", (data) => {
    const { instanceId, chats, count } = data;
    // console.log(`Chats agregados para instancia ${instanceId}:`, count);
    if (instances[instanceId]) {
      // if (!instances[instanceId].chats) {
      //   instances[instanceId].chats = [];
      //   instances[instanceId].chatsCount = 0;
      // }
      // Agregar los nuevos chats
      instances[instanceId].chatsCount = (instances[instanceId].chatsCount || 0) + count;
      renderInstances();
    }
  });

  socket.on("chats_update", (data) => {
    const { instanceId, chats, count } = data;
    console.log(`Chats actualizados para instancia ${instanceId}:`, count);
    if (instances[instanceId]) {
      // Inicializar el array de chats si no existe
      if (!instances[instanceId].chats) {
        instances[instanceId].chats = [];
        instances[instanceId].chatsCount = 0;
      }
      // Actualizar los chats existentes
      chats.forEach((chat) => {
        const index = instances[instanceId].chats.findIndex(
          (c) => c.id === chat.id
        );
        if (index !== -1) {
          instances[instanceId].chats[index] = chat;
        }
      });
      renderInstances();
    }
  });

  socket.on("chats_delete", (data) => {
    const { instanceId, chatIds, count } = data;
    if (instances[instanceId] && instances[instanceId].chats) {
      // Eliminar los chats
      instances[instanceId].chats = instances[instanceId].chats.filter(
        (chat) => !chatIds.includes(chat.id)
      );
      instances[instanceId].chatsCount = Math.max(
        0,
        (instances[instanceId].chatsCount || 0) - count
      );
      renderInstances();
    }
  });

  socket.on("new_message", (data) => {
    const { instanceId, count } = data;
    if (instances[instanceId]) {
      instances[instanceId].messagesCount = (instances[instanceId].messagesCount || 0) + count;
      renderInstances();
    }
  });

  // Solicitar la lista de instancias al cargar la página
  // console.log("DOM completamente cargado y analizado");
  socket.emit("list_instances");

  // Escuchar cambios de tema para actualizar la UI
  window.addEventListener("themeChanged", function (e) {
    // Re-renderizar las instancias para aplicar el nuevo tema
    renderInstances();

    // Si hay una instancia en detalles, actualizar también
    if (currentDetailInstanceId) {
      showInstanceDetails(currentDetailInstanceId);
    }
  });
});
