// Variables para almacenar el estado de las instancias
let instances = {};
let currentDetailInstanceId = null;

// Elementos del DOM
let instancesRow;
let noInstancesMessage;
let createInstanceBtn;
let createInstanceForm;
let instanceIdInput;
let detailInstanceIdSpan;
let detailInstanceStatusSpan;
let qrPlaceholder;
let qrCodeDisplay;
let qrCodeContainer;
let qrLoading;
let qrInfoText;

// Función para renderizar las cards de instancias
function renderInstances() {
    if (!instancesRow) return;
    
    instancesRow.innerHTML = ''; // Limpiar el contenedor

    const instanceIds = Object.keys(instances);

    if (instanceIds.length === 0) {
        noInstancesMessage.textContent = 'No hay instancias creadas aún. Haz clic en "Crear Nueva Instancia".';
        noInstancesMessage.style.display = 'block';
        instancesRow.appendChild(noInstancesMessage);
        return;
    }

    noInstancesMessage.style.display = 'none';

    instanceIds.forEach(id => {
        const instance = instances[id];
        const colDiv = document.createElement('div');
        colDiv.className = 'col-md-4';

        const cardDiv = document.createElement('div');
        cardDiv.className = 'card instance-card h-100';
        cardDiv.style.cursor = 'pointer';
        cardDiv.onclick = () => showInstanceDetails(id);

        const cardBodyDiv = document.createElement('div');
        cardBodyDiv.className = 'card-body';

        // Avatar de la instancia
        if (instance.profilePictureUrl) {
            const avatarImg = document.createElement('img');
            avatarImg.src = instance.profilePictureUrl;
            avatarImg.className = 'rounded-circle mb-2';
            avatarImg.style.width = '50px';
            avatarImg.style.height = '50px';
            avatarImg.style.objectFit = 'cover';
            cardBodyDiv.appendChild(avatarImg);
        }

        const cardTitle = document.createElement('h5');
        cardTitle.className = 'card-title';
        cardTitle.textContent = instance.userName || id;

        const cardText = document.createElement('p');
        cardText.className = 'card-text';
        // Mostrar un estado simple basado en si hay un QR o no
        const statusText = instance.qr ? 'QR Generado' : (instance.connected ? 'Conectado' : 'Desconocido');
        const statusClass = instance.qr ? 'bg-warning' : (instance.connected ? 'bg-success' : 'bg-secondary');
        // Ajustar el color del texto para modo oscuro
        const textColorClass = instance.qr ? 'text-dark' : '';
        cardText.innerHTML = `<strong>Estado:</strong> <span class="badge ${statusClass} ${textColorClass}">${statusText}</span>`;

        const cardFooterDiv = document.createElement('div');
        cardFooterDiv.className = 'card-footer d-flex justify-content-between align-items-center';
        
        const footerText = document.createElement('small');
        footerText.className = 'text-muted';
        footerText.textContent = `Creada: ${instance.createdAt || 'Ahora'}`;

        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'btn btn-sm btn-outline-danger';
        deleteBtn.textContent = 'Eliminar';
        deleteBtn.onclick = (e) => {
            e.stopPropagation(); // Evitar que se active el click de la card
            // if (confirm(`¿Estás seguro de que quieres eliminar la instancia "${id}"? Esta acción no se puede deshacer.`)) {
            Swal.fire({
                title: '¿Estás seguro?',
                text: `¿Quieres eliminar la instancia "${id}"? Esta acción no se puede deshacer.`,
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, eliminar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    console.log(`Solicitando eliminación de instancia: ${id}`);
                    socket.emit('delete_instance', { instanceId: id });
                }
            });
        };

        cardFooterDiv.appendChild(footerText);
        cardFooterDiv.appendChild(deleteBtn);

        cardBodyDiv.appendChild(cardTitle);
        cardBodyDiv.appendChild(cardText);
        cardDiv.appendChild(cardBodyDiv);
        cardDiv.appendChild(cardFooterDiv);
        colDiv.appendChild(cardDiv);
        instancesRow.appendChild(colDiv);
    });
}

// Función para mostrar el modal de detalles
function showInstanceDetails(instanceId) {
    const instance = instances[instanceId];
    if (!instance) return;

    currentDetailInstanceId = instanceId;
    if (detailInstanceIdSpan) {
        detailInstanceIdSpan.textContent = instance.userName || instanceId;
    }
    
    // Actualizar estado
    const status = instance.qr ? 'QR Generado' : (instance.connected ? 'Conectado' : 'Desconocido');
    const statusClass = instance.qr ? 'bg-warning' : (instance.connected ? 'bg-success' : 'bg-secondary');
    // Ajustar el color del texto para modo oscuro
    const textColorClass = instance.qr ? 'text-dark' : '';
    if (detailInstanceStatusSpan) {
        detailInstanceStatusSpan.textContent = status;
        detailInstanceStatusSpan.className = `badge ${statusClass} ${textColorClass}`;
    }

    // Mostrar avatar si está disponible
    const avatarContainer = document.getElementById('detail-instance-avatar');
    if (avatarContainer) {
        if (instance.profilePictureUrl) {
            avatarContainer.innerHTML = `<img src="${instance.profilePictureUrl}" class="rounded-circle mb-2" style="width: 80px; height: 80px; objectFit: cover;">`;
        } else {
            avatarContainer.innerHTML = '';
        }
    }

    // Manejar visualización del QR
    if (qrCodeDisplay) qrCodeDisplay.style.display = 'none';
    if (qrPlaceholder) qrPlaceholder.style.display = 'block';
    if (qrLoading) qrLoading.style.display = 'none';

    if (instance.qr) {
        // Si hay un QR, mostrarlo
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (qrCodeDisplay) {
            qrCodeDisplay.src = instance.qr; // Asumimos que 'qr' es una data URL
            qrCodeDisplay.style.display = 'block';
        }
        if (qrInfoText) qrInfoText.textContent = 'Escanea este código QR con tu WhatsApp para vincular la cuenta.';
    } else if (!instance.connected) {
        // Si no está conectado ni tiene QR, mostrar loading
        if (qrPlaceholder) qrPlaceholder.style.display = 'none';
        if (qrLoading) qrLoading.style.display = 'block';
        if (qrInfoText) qrInfoText.textContent = 'Esperando código QR...';
    } else {
        // Si está conectado
        if (qrPlaceholder) qrPlaceholder.textContent = 'Instancia conectada. No se necesita QR.';
        if (qrInfoText) qrInfoText.textContent = '';
    }

    // Mostrar el modal
    const modal = new bootstrap.Modal(document.getElementById('instanceDetailModal'));
    modal.show();
}

// Función para crear una nueva instancia
function createNewInstance() {
    const id = instanceIdInput ? instanceIdInput.value.trim() : '';
    if (!id) {
        // alert('Por favor, ingresa un ID para la instancia.');
        Swal.fire({
            title: 'ID requerido',
            text: 'Por favor, ingresa un ID para la instancia.',
            icon: 'warning',
            confirmButtonText: 'OK'
        });
        return;
    }

    console.log(`Solicitando creación de instancia con ID: ${id}`);
    socket.emit('create_instance', { instanceId: id });
    
    // Cerrar el modal de creación
    const modal = bootstrap.Modal.getInstance(document.getElementById('createInstanceModal'));
    if (modal) {
        modal.hide();
    }
    // Limpiar el formulario
    if (createInstanceForm) createInstanceForm.reset();
}

document.addEventListener('DOMContentLoaded', function() {
    // Conectarse al servidor Socket.IO
    const socket = io();

    // Inicializar elementos del DOM
    instancesRow = document.getElementById('instances-row');
    noInstancesMessage = document.getElementById('no-instances-message');
    createInstanceBtn = document.getElementById('create-instance-btn');
    createInstanceForm = document.getElementById('create-instance-form');
    instanceIdInput = document.getElementById('instance-id');
    detailInstanceIdSpan = document.getElementById('detail-instance-id');
    detailInstanceStatusSpan = document.getElementById('detail-instance-status');
    qrPlaceholder = document.getElementById('qr-placeholder');
    qrCodeDisplay = document.getElementById('qr-code-display');
    qrCodeContainer = document.getElementById('qr-code-container');
    qrLoading = document.getElementById('qr-loading');
    qrInfoText = document.getElementById('qr-info-text');

    // Event Listeners
    if (createInstanceBtn) {
        createInstanceBtn.addEventListener('click', createNewInstance);
    }

    // Escuchar eventos del servidor
    socket.on('connect', () => {
        console.log('Cliente conectado al servidor Socket.IO');
        // Solicitar la lista de instancias al conectarse
        socket.emit('list_instances');
    });

    socket.on('instances_list', (list) => {
        console.log('[UI] Lista de instancias recibida:', list);
        // Inicializar el objeto instances con los IDs recibidos
        instances = {}; // Limpiar instancias anteriores si las hubiera
        list.forEach(id => {
            instances[id] = { id: id, createdAt: new Date().toLocaleString() };
            // Unirse automáticamente a la sala de cada instancia para recibir actualizaciones
            console.log(`[UI] Uniéndose a la sala de instancia existente: instance_room_${id}`);
            socket.emit('join_instance_room', { instanceId: id });
        });
        renderInstances();
    });

    socket.on('instance_created', (data) => {
        const { instanceId } = data;
        console.log(`[UI] Notificación de creación de instancia: ${instanceId}`);
        if (!instances[instanceId]) {
            instances[instanceId] = { id: instanceId, createdAt: new Date().toLocaleString() };
            renderInstances();
        }
        // Unirse automáticamente a la sala de la nueva instancia para recibir actualizaciones
        console.log(`[UI] Uniéndose automáticamente a la sala de la nueva instancia: instance_room_${instanceId}`);
        socket.emit('join_instance_room', { instanceId: instanceId });
        // Opcionalmente, mostrar el modal de detalles de la nueva instancia
        // showInstanceDetails(instanceId);
    });

    socket.on('qr_code', (data) => {
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

    socket.on('instance_status_update', (data) => {
         const { instanceId, status } = data;
         console.log(`Actualización de estado para instancia ${instanceId}: ${status}`);
         if (instances[instanceId]) {
             if (status === 'open') {
                 instances[instanceId].connected = true;
                 delete instances[instanceId].qr; // Eliminar QR si se conecta
             } else if (status === 'close') {
                 instances[instanceId].connected = false;
                 // Podrías manejar otros estados aquí
             }
             renderInstances();
             // Si el modal de detalles de esta instancia está abierto, actualizarlo
             if (currentDetailInstanceId === instanceId) {
                 showInstanceDetails(instanceId);
             }
         }
    });

    // Nuevos eventos para sincronización de datos
    socket.on('profile_info', (data) => {
        const { instanceId, profilePictureUrl, status, userId, userName } = data;
        console.log(`Información de perfil recibida para instancia ${instanceId}`);
        if (instances[instanceId]) {
            instances[instanceId].profilePictureUrl = profilePictureUrl;
            instances[instanceId].status = status;
            instances[instanceId].userId = userId;
            instances[instanceId].userName = userName;
            renderInstances();
            // Si el modal de detalles de esta instancia está abierto, actualizarlo
            if (currentDetailInstanceId === instanceId) {
                showInstanceDetails(instanceId);
            }
        }
    });

    socket.on('contacts_update', (data) => {
        const { instanceId, contacts } = data;
        console.log(`Contactos actualizados para instancia ${instanceId}:`, contacts.length);
        if (instances[instanceId]) {
            instances[instanceId].contacts = contacts;
            // Podemos mostrar esta información en la UI si es necesario
        }
    });

    socket.on('chats_upsert', (data) => {
        const { instanceId, chats } = data;
        console.log(`Chats agregados para instancia ${instanceId}:`, chats.length);
        if (instances[instanceId]) {
            // Inicializar el array de chats si no existe
            if (!instances[instanceId].chats) {
                instances[instanceId].chats = [];
            }
            // Agregar los nuevos chats
            instances[instanceId].chats.push(...chats);
        }
    });

    socket.on('chats_update', (data) => {
        const { instanceId, chats } = data;
        console.log(`Chats actualizados para instancia ${instanceId}:`, chats.length);
        if (instances[instanceId]) {
            // Inicializar el array de chats si no existe
            if (!instances[instanceId].chats) {
                instances[instanceId].chats = [];
            }
            // Actualizar los chats existentes
            chats.forEach(chat => {
                const index = instances[instanceId].chats.findIndex(c => c.id === chat.id);
                if (index !== -1) {
                    instances[instanceId].chats[index] = chat;
                }
            });
        }
    });

    socket.on('chats_delete', (data) => {
        const { instanceId, chatIds } = data;
        console.log(`Chats eliminados para instancia ${instanceId}:`, chatIds.length);
        if (instances[instanceId] && instances[instanceId].chats) {
            // Eliminar los chats
            instances[instanceId].chats = instances[instanceId].chats.filter(
                chat => !chatIds.includes(chat.id)
            );
        }
    });

    // Solicitar la lista de instancias al cargar la página
    console.log('DOM completamente cargado y analizado');
    socket.emit('list_instances');
    
    // Escuchar cambios de tema para actualizar la UI
    window.addEventListener('themeChanged', function(e) {
        // Re-renderizar las instancias para aplicar el nuevo tema
        renderInstances();
        
        // Si hay una instancia en detalles, actualizar también
        if (currentDetailInstanceId) {
            showInstanceDetails(currentDetailInstanceId);
        }
    });
});