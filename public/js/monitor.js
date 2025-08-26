let serverLogList;
let serverActivityLogStatus;
let clearLogsBtn;
let logFilterInput;
let serverLogActive = true;
let allLogEntries = [];

function applyFilter() {
    if (!logFilterInput || !serverLogList) return;
    
    const filterText = logFilterInput.value.toLowerCase();
    serverLogList.innerHTML = '';

    const filteredEntries = allLogEntries.filter(logEntry => {
        const logString = JSON.stringify(logEntry).toLowerCase();
        return logString.includes(filterText);
    });

    filteredEntries.forEach(logEntry => {
        serverLogList.appendChild(renderLogEntry(logEntry));
    });

    serverLogList.scrollTop = serverLogList.scrollHeight;
}

function applyDarkModeToNewElements(isDarkMode) {
    const preElements = document.querySelectorAll('pre');
    preElements.forEach(el => {
        if (isDarkMode) {
            el.classList.remove('bg-light');
            el.classList.add('bg-dark', 'text-light');
        } else {
            el.classList.remove('bg-dark', 'text-light');
            el.classList.add('bg-light');
        }
    });
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

function renderLogEntry(logEntry) {
    const listItem = document.createElement('li');
    listItem.classList.add('log-entry');
    listItem.setAttribute('data-log-type', logEntry.type);

    const headerDiv = document.createElement('div');
    headerDiv.classList.add('log-entry-header');

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('log-timestamp');
    timestampSpan.textContent = formatTime(logEntry.timestamp);

    const typeSpan = document.createElement('span');
    typeSpan.classList.add('log-type', 'badge');
    const typeClassMap = {
        'client_connected': 'bg-success',
        'client_disconnected': 'bg-danger',
        'CLIENT_JOINED_ROOM': 'bg-primary',
        'JOIN_ROOM_FAILED': 'bg-warning text-dark',
        'HTTP_EMIT_SUCCESS': 'bg-success',
        'HTTP_EMIT_FAILED_VALIDATION': 'bg-danger',
        'HTTP_EMIT_FAILED_SERVER_ERROR': 'bg-danger',
        'monitor_joined': 'bg-info text-dark',
        'default': 'bg-secondary'
    };
    const badgeClass = typeClassMap[logEntry.type] || typeClassMap['default'];
    typeSpan.classList.add(...badgeClass.split(' '));
    typeSpan.textContent = logEntry.type;

    headerDiv.appendChild(timestampSpan);
    headerDiv.appendChild(typeSpan);

    const preElement = document.createElement('pre');
    preElement.textContent = JSON.stringify(logEntry.details, null, 2);
    preElement.classList.add('p-2', 'rounded');
    
    // Aplicar clases según el modo actual
    if (document.body.classList.contains('dark-mode')) {
        preElement.classList.add('bg-dark', 'text-light');
    } else {
        preElement.classList.add('bg-light');
    }

    listItem.appendChild(headerDiv);
    listItem.appendChild(preElement);
    return listItem;
}

document.addEventListener('DOMContentLoaded', function() {
    const socket = io({ transports: ['websocket', 'polling'] });
    serverLogList = document.getElementById('server-log-list');
    serverActivityLogStatus = document.getElementById('server-activity-log-status');
    clearLogsBtn = document.getElementById('clear-logs-btn');
    logFilterInput = document.getElementById('log-filter-input');
    socket.on('connect', () => {
        console.log('CLIENTE (navegador): Conectado al servidor Socket.IO con ID:', socket.id);
    });
    socket.on('disconnect', () => {
        console.log('CLIENTE (navegador): Desconectado del servidor Socket.IO.');
    });
    socket.emit('join_internal_monitor_room', (response) => {
        console.log('Respuesta de join_internal_monitor_room:', response);
        if (response.success) {
            serverLogActive = true;
            if (serverActivityLogStatus) {
                serverActivityLogStatus.textContent = `Unido a la sala de monitoreo: ${response.room}`;
                serverActivityLogStatus.style.color = 'var(--status-green)';
            }
        } else {
            if (serverActivityLogStatus) {
                serverActivityLogStatus.textContent = `Error al unirse a la sala de monitoreo: ${response.message}`;
                serverActivityLogStatus.style.color = 'var(--status-red)';
            }
        }
    });
    socket.on('socket_monitor_update', (logEntry) => {
        if (serverLogActive && serverLogList) {
            console.log('SERVER_ACTIVITY_LOG:', logEntry);
            allLogEntries.unshift(logEntry);
            if (allLogEntries.length > 200) {
                allLogEntries.pop();
            }
            applyFilter();
            const isDarkMode = document.body.classList.contains('dark-mode');
            applyDarkModeToNewElements(isDarkMode);
        }
    });

    if (clearLogsBtn) {
        clearLogsBtn.addEventListener('click', () => {
            Swal.fire({
                title: '¿Estás seguro?',
                text: "¡No podrás revertir esto!",
                icon: 'warning',
                showCancelButton: true,
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33',
                confirmButtonText: 'Sí, limpiar',
                cancelButtonText: 'Cancelar'
            }).then((result) => {
                if (result.isConfirmed) {
                    if (serverLogList) serverLogList.innerHTML = '';
                    allLogEntries = [];
                    Swal.fire(
                        '¡Limpiado!',
                        'Los logs han sido eliminados.',
                        'success'
                    )
                }
            })
        });
    }

    if (logFilterInput) {
        logFilterInput.addEventListener('input', applyFilter);
    }
    
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
        const icon = document.getElementById('darkModeToggle')?.querySelector('i');
        if (icon) {
            icon.classList.remove('bi-moon');
            icon.classList.add('bi-sun');
        }
        
        // Aplicar modo oscuro a elementos existentes
        applyDarkModeToNewElements(true);
    }
    
    window.addEventListener('themeChanged', function(e) {
        applyDarkModeToNewElements(e.detail.darkMode);
    });
});