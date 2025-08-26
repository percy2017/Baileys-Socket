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
    
    instancesRow.innerHTML = '';

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
        colDiv.className = 'col-md-4 mb-4';

        const cardDiv = document.createElement('div');
        cardDiv.className = 'card instance-card h-100';
        cardDiv.style.cursor = 'pointer';
        cardDiv.onclick = () => showInstanceDetails(id);

        const cardBodyDiv = document.createElement('div');
        cardBodyDiv.className = 'card-body';

        // Avatar de la instancia
        const avatarContainer = document.createElement('div');
        avatarContainer.className = 'd-flex align-items-center mb-3';
        
        if (instance.profilePictureUrl) {
            const avatarImg = document.createElement('img');
            avatarImg.src = instance.profilePictureUrl;
            avatarImg.className = 'rounded-circle me-3';
            avatarImg.style.width = '50px';
            avatarImg.style.height = '50px';
            avatarImg.style.objectFit = 'cover';
            avatarContainer.appendChild(avatarImg);
        } else {
            // Avatar por defecto
            const defaultAvatar = document.createElement('div');
            defaultAvatar.className = 'rounded-circle bg-primary d-flex align-items-center justify-content-center me-3';
            defaultAvatar.style.width = '50px';
            defaultAvatar.style.height = '50px';
            defaultAvatar.innerHTML = '<i class="fas fa-user text-white"></i>';
            avatarContainer.appendChild(defaultAvatar);
        }

        const userInfoDiv = document.createElement('div');
        const cardTitle = document.createElement('h5');
        cardTitle.className = 'card-title mb-1';
        cardTitle.textContent = instance.userName || instance.id;

        const cardSubtitle = document.createElement('p');
        cardSubtitle.className = 'card-text text-muted small mb-0';
        cardSubtitle.textContent = instance.userId || 'ID: ' + instance.id;

        userInfoDiv.appendChild(cardTitle);
        userInfoDiv.appendChild(cardSubtitle);
        avatarContainer.appendChild(userInfoDiv);
        cardBodyDiv.appendChild(avatarContainer);

        // Estado de la instancia
        const statusDiv = document.createElement('div');
        statusDiv.className = 'd-flex justify-content-between align-items-center mb-3';
        
        const statusLabel = document.createElement('span');
        statusLabel.textContent = 'Estado:';
        
        // Mostrar un estado simple basado en el estado real de la instancia
        let statusText, statusClass, textColorClass = '';
        console.log(`[DEBUG] Evaluando estado para instancia ${id}:`, {
            connected: instance.connected,
            hasQR: !!instance.qr,
            hasError: !!instance.errorMessage,
            dbStatus: instance.status
        });
        if (instance.connected) {
            statusText = 'Conectado';
            statusClass = 'bg-success';
        } else if (instance.qr) {
            statusText = 'QR Generado';
            statusClass = 'bg-warning';
            textColorClass = 'text-dark';
        } else if (instance.errorMessage) {
            statusText = 'Error';
            statusClass = 'bg-danger';
        } else if (instance.status === 'connected') {
            // Usar el estado de la base de datos si no hay otro estado más específico
            statusText = 'Conectado';
            statusClass = 'bg-success';
        } else if (instance.status === 'disconnected') {
            statusText = 'Desconectado';
            statusClass = 'bg-secondary';
        } else {
            statusText = 'Desconocido';
            statusClass = 'bg-secondary';
        }
        
        const statusBadge = document.createElement('span');
        statusBadge.className = `badge ${statusClass} ${textColorClass}`;
        statusBadge.textContent = statusText;
        
        statusDiv.appendChild(statusLabel);
        statusDiv.appendChild(statusBadge);
        cardBodyDiv.appendChild(statusDiv);

        // Estadísticas de la instancia
        const statsDiv = document.createElement('div');
        statsDiv.className = 'row g-2 mb-3';
        
        // Contactos
        const contactsCol = document.createElement('div');
        contactsCol.className = 'col-6';
        const contactsStat = document.createElement('div');
        contactsStat.className = 'small';
        contactsStat.innerHTML = `<strong>Contactos:</strong> ${instance.contactsCount !== undefined ? instance.contactsCount : '0'}`;
        contactsCol.appendChild(contactsStat);
        statsDiv.appendChild(contactsCol);
        
        // Chats
        const chatsCol = document.createElement('div');
        chatsCol.className = 'col-6';
        const chatsStat = document.createElement('div');
        chatsStat.className = 'small';
        chatsStat.innerHTML = `<strong>Chats:</strong> ${instance.chatsCount !== undefined ? instance.chatsCount : '0'}`;
        chatsCol.appendChild(chatsStat);
        statsDiv.appendChild(chatsCol);
        
        // Mensajes (si lo tenemos)
        const messagesCol = document.createElement('div');
        messagesCol.className = 'col-6';
        const messagesStat = document.createElement('div');
        messagesStat.className = 'small';
        messagesStat.innerHTML = `<strong>Mensajes:</strong> ${instance.messagesCount !== undefined ? instance.messagesCount : '0'}`;
        messagesCol.appendChild(messagesStat);
        statsDiv.appendChild(messagesCol);
        
        cardBodyDiv.appendChild(statsDiv);

        const cardFooterDiv = document.createElement('div');
        cardFooterDiv.className = 'card-footer d-flex justify-content-between align-items-center';
        
        const footerText = document.createElement('small');
        footerText.className = 'text-muted';
        // Asegurarse de que la fecha se muestre correctamente
        const createdAtText = instance.createdAt ? 
            (typeof instance.createdAt === 'string' ? instance.createdAt : new Date(instance.createdAt).toLocaleString()) : 
            'Fecha no disponible';
        footerText.textContent = `Creada: ${createdAtText}`;
        footerText.style.whiteSpace = 'nowrap';
        footerText.style.overflow = 'hidden';
        footerText.style.textOverflow = 'ellipsis';
        footerText.title = createdAtText; // Mostrar fecha completa al pasar el mouse

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
                    if (socket) {
                        socket.emit('delete_instance', { instanceId: id });
                    }
                }
            });
        };

        cardFooterDiv.appendChild(footerText);
        cardFooterDiv.appendChild(deleteBtn);

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
    const modal = new bootstrap.Modal(document.getElementById('qrModal'));
    
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
    } else if (instance.connected) {
        // Si está conectado
        if (qrPlaceholder) qrPlaceholder.textContent = 'Instancia conectada. No se necesita QR.';
        if (qrInfoText) qrInfoText.textContent = 'La instancia está conectada y lista para usar.';
    } else {
        // Si está desconectado y sin QR
        if (qrPlaceholder) qrPlaceholder.style.display = 'block';
        if (qrPlaceholder) qrPlaceholder.textContent = 'No se ha generado un código QR aún.';
        if (qrLoading) qrLoading.style.display = 'none';
        if (qrInfoText) qrInfoText.textContent = 'Crea una instancia para generar un código QR.';
    }

    // Mostrar el modal
    modal.show();
}

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
    if (socket) {
        socket.emit('create_instance', { instanceId: id });
    }
    
    const modal = bootstrap.Modal.getInstance(document.getElementById('createInstanceModal'));
    if (modal) {
        modal.hide();
    }
    // Limpiar el formulario
    if (createInstanceForm) createInstanceForm.reset();
}

document.addEventListener('DOMContentLoaded', function() {
    instancesRow = document.getElementById('instances-row');
    noInstancesMessage = document.getElementById('no-instances-message');
    createInstanceBtn = document.getElementById('create-instance-btn');
    createInstanceForm = document.getElementById('create-instance-form');
    instanceIdInput = document.getElementById('instance-id');
    qrPlaceholder = document.getElementById('qr-placeholder');
    qrCodeDisplay = document.getElementById('qr-code-display');
    qrLoading = document.getElementById('qr-loading');
    qrInfoText = document.getElementById('qr-info-text');

    // Conectarse al servidor Socket.IO
    socket = io({
        transports: ['websocket', 'polling'],
        upgrade: true,
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 20000
    });
    
    // Manejar reconexiones
    socket.on('connect', () => {
        console.log('Cliente conectado al servidor Socket.IO con ID:', socket.id);
        // Solicitar la lista de instancias al conectarse
        socket.emit('list_instances');
    });
    
    // Manejar desconexiones
    socket.on('disconnect', (reason) => {
        console.log('Cliente desconectado del servidor Socket.IO:', reason);
        // Mostrar mensaje al usuario si la desconexión no es intencional
        if (reason !== 'io client disconnect') {
            console.log('Intentando reconectar automáticamente...');
        }
    });
    
    // Manejar errores de conexión
    socket.on('connect_error', (error) => {
        console.error('Error de conexión con el servidor Socket.IO:', error);
        console.log('Detalles del error:', {
            message: error.message,
            type: error.type,
            description: error.description
        });
    });

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

    socket.on('instances_list', (instancesData) => {
        console.log('[UI] Lista de instancias recibida:', instancesData);
        // Inicializar el objeto instances con los datos recibidos
        instances = {}; // Limpiar instancias anteriores si las hubiera
        if (instancesData && instancesData.length > 0) {
            instancesData.forEach(instanceData => {
                instances[instanceData.id] = { 
                    id: instanceData.id, 
                    createdAt: instanceData.created_at ? new Date(instanceData.created_at).toLocaleString() : 'Fecha no disponible',
                    status: instanceData.status || 'unknown', // Agregar el estado desde la base de datos
                    userId: instanceData.user_id,
                    userName: instanceData.user_name,
                    profilePictureUrl: instanceData.profile_picture_url
                };
                // Unirse automáticamente a la sala de cada instancia para recibir actualizaciones
                console.log(`[UI] Uniéndose a la sala de instancia existente: instance_room_${instanceData.id}`);
                socket.emit('join_instance_room', { instanceId: instanceData.id });
            });
        }
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
         const { instanceId, status, message } = data;
         console.log(`[DEBUG] Actualización de estado para instancia ${instanceId}: ${status}`, message || '');
         if (instances[instanceId]) {
             console.log(`[DEBUG] Estado anterior de la instancia:`, {
                 connected: instances[instanceId].connected,
                 hasQR: !!instances[instanceId].qr,
                 hasError: !!instances[instanceId].errorMessage
             });
             
             // Actualizar el estado en la instancia
             instances[instanceId].status = status;
             
             if (status === 'open') {
                 instances[instanceId].connected = true;
                 delete instances[instanceId].qr; // Eliminar QR si se conecta
                 delete instances[instanceId].errorMessage; // Eliminar mensaje de error si estaba presente
                 console.log(`[DEBUG] Instancia ${instanceId} marcada como conectada`);
             } else if (status === 'close') {
                 instances[instanceId].connected = false;
                 // Agregar mensaje de error si está disponible
                 if (message) {
                     instances[instanceId].errorMessage = message;
                 }
                 console.log(`[DEBUG] Instancia ${instanceId} marcada como desconectada`);
             } else if (status === 'qr') {
                 // Mantener el estado QR hasta que se conecte
                 console.log(`[DEBUG] Instancia ${instanceId} en estado QR`);
             } else if (status === 'disconnected') {
                 instances[instanceId].connected = false;
                 console.log(`[DEBUG] Instancia ${instanceId} desconectada`);
             }
             renderInstances();
             // Si el modal de detalles de esta instancia está abierto, actualizarlo
             if (currentDetailInstanceId === instanceId) {
                 showInstanceDetails(instanceId);
             }
         } else {
             console.log(`[DEBUG] Instancia ${instanceId} no encontrada en el estado local`);
         }
    });

    // Nuevos eventos para sincronización de datos
    socket.on('profile_info', (data) => {
        const { instanceId, profilePictureUrl, status, userId, userName } = data;
        console.log(`Información de perfil recibida para instancia ${instanceId}:`, { profilePictureUrl, userName, userId });
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

    socket.on('contacts_update', (data) => {
        const { instanceId, contacts, count } = data;
        console.log(`Contactos actualizados para instancia ${instanceId}:`, count);
        if (instances[instanceId]) {
            instances[instanceId].contacts = contacts;
            instances[instanceId].contactsCount = count;
            renderInstances();
        }
    });

    socket.on('chats_upsert', (data) => {
        const { instanceId, chats, count } = data;
        console.log(`Chats agregados para instancia ${instanceId}:`, count);
        if (instances[instanceId]) {
            // Inicializar el array de chats si no existe
            if (!instances[instanceId].chats) {
                instances[instanceId].chats = [];
                instances[instanceId].chatsCount = 0;
            }
            // Agregar los nuevos chats
            instances[instanceId].chats.push(...chats);
            instances[instanceId].chatsCount += count;
            renderInstances();
        }
    });

    socket.on('chats_update', (data) => {
        const { instanceId, chats, count } = data;
        console.log(`Chats actualizados para instancia ${instanceId}:`, count);
        if (instances[instanceId]) {
            // Inicializar el array de chats si no existe
            if (!instances[instanceId].chats) {
                instances[instanceId].chats = [];
                instances[instanceId].chatsCount = 0;
            }
            // Actualizar los chats existentes
            chats.forEach(chat => {
                const index = instances[instanceId].chats.findIndex(c => c.id === chat.id);
                if (index !== -1) {
                    instances[instanceId].chats[index] = chat;
                }
            });
            renderInstances();
        }
    });

    socket.on('chats_delete', (data) => {
        const { instanceId, chatIds, count } = data;
        console.log(`Chats eliminados para instancia ${instanceId}:`, count);
        if (instances[instanceId] && instances[instanceId].chats) {
            // Eliminar los chats
            instances[instanceId].chats = instances[instanceId].chats.filter(
                chat => !chatIds.includes(chat.id)
            );
            instances[instanceId].chatsCount = Math.max(0, (instances[instanceId].chatsCount || 0) - count);
            renderInstances();
        }
    });

    socket.on('new_message', (data) => {
        const { instanceId, count } = data;
        console.log(`Nuevos mensajes para instancia ${instanceId}:`, count);
        if (instances[instanceId]) {
            // Actualizar el conteo de mensajes
            instances[instanceId].messagesCount = (instances[instanceId].messagesCount || 0) + count;
            renderInstances();
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