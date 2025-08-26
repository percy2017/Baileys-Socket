// Variables del DOM
let serverLogList;
let serverActivityLogStatus;
let clearLogsBtn;
let logFilterInput;
let serverLogActive = true;
let allLogEntries = []; // Almacenar todas las entradas de log para el filtrado

// Función para aplicar el filtro
function applyFilter() {
    if (!logFilterInput || !serverLogList) return;
    
    const filterText = logFilterInput.value.toLowerCase();
    serverLogList.innerHTML = ''; // Limpiar la lista actual

    const filteredEntries = allLogEntries.filter(logEntry => {
        const logString = JSON.stringify(logEntry).toLowerCase();
        return logString.includes(filterText);
    });

    filteredEntries.forEach(logEntry => {
        serverLogList.appendChild(renderLogEntry(logEntry));
    });

    // Asegurar que el scroll esté al final después de filtrar
    serverLogList.scrollTop = serverLogList.scrollHeight;
}

// Función para aplicar modo oscuro a nuevos elementos
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

// Helper para formatear la hora
function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString('es-ES', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// Helper para renderizar una entrada de log
function renderLogEntry(logEntry) {
    const listItem = document.createElement('li');
    listItem.classList.add('log-entry'); // Añadir clase para facilitar el filtrado
    listItem.setAttribute('data-log-type', logEntry.type); // Atributo para filtrar por tipo

    const headerDiv = document.createElement('div');
    headerDiv.classList.add('log-entry-header');

    const timestampSpan = document.createElement('span');
    timestampSpan.classList.add('log-timestamp');
    timestampSpan.textContent = formatTime(logEntry.timestamp);

    const typeSpan = document.createElement('span');
    typeSpan.classList.add('log-type', 'badge');
    // Asignar clases de Bootstrap basadas en el tipo de log
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
    // Conectarse al servidor Socket.IO
    const socket = io();
    
    // Inicializar elementos del DOM
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

    // Escuchar las actualizaciones del monitor de actividad del servidor
    socket.on('socket_monitor_update', (logEntry) => {
        if (serverLogActive && serverLogList) {
            console.log('SERVER_ACTIVITY_LOG:', logEntry);
            allLogEntries.unshift(logEntry); // Añadir al principio del array

            // Limitar el número de entradas de log en el array para no sobrecargar la memoria
            if (allLogEntries.length > 200) { // Aumentar el límite para el array
                allLogEntries.pop();
            }
            applyFilter(); // Re-aplicar el filtro para mostrar la nueva entrada
            
            // Aplicar modo oscuro a nuevos elementos
            const isDarkMode = document.body.classList.contains('dark-mode');
            applyDarkModeToNewElements(isDarkMode);
        }
    });

    // Limpiar los logs del monitor
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
                    if (serverLogList) serverLogList.innerHTML = ''; // Vacía la lista de logs
                    allLogEntries = []; // Vacía el array de logs
                    Swal.fire(
                        '¡Limpiado!',
                        'Los logs han sido eliminados.',
                        'success'
                    )
                }
            })
        });
    }

    // Event listener para el filtro de búsqueda
    if (logFilterInput) {
        logFilterInput.addEventListener('input', applyFilter);
    }
    
    // Apply saved theme
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
    
    // Escuchar cambios de tema
    window.addEventListener('themeChanged', function(e) {
        applyDarkModeToNewElements(e.detail.darkMode);
    });
});