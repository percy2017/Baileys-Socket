# Gestor de Instancias Baileys (WhatsApp Web) con Socket.IO

Este proyecto es un servidor Node.js diseñado para gestionar múltiples sesiones independientes de WhatsApp Web simultáneamente. Utiliza la popular biblioteca [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) para la interacción con WhatsApp, y proporciona una interfaz de comunicación en tiempo real mediante [Socket.IO](https://socket.io/). También incluye una API HTTP simple para emitir eventos a clientes conectados.

## Características

*   **Gestión Multi-Instancia:** Crea, administra y elimina múltiples sesiones de WhatsApp Web, cada una identificada por un ID único.
*   **Interfaz Web (EJS):** Ofrece páginas web para:
    *   **Panel de Administración:** Interfaz principal con navegación entre secciones (`/admin`).
    *   **Gestionar Instancias:** Crear nuevas instancias, ver su estado, escanear códigos QR y eliminarlas (`/admin/whatsapp`).
    *   **Monitorear Actividad:** Ver un log en tiempo real de la actividad del servidor Socket.IO (`/admin/monitor`).
*   **Comunicación en Tiempo Real (Socket.IO):**
    *   Clientes pueden conectarse para recibir actualizaciones (QR, estado, mensajes) de instancias específicas.
    *   API para crear, listar y eliminar instancias directamente desde el cliente.
*   **Persistencia de Sesión:** Utiliza `useMultiFileAuthState` de Baileys para guardar y restaurar automáticamente las credenciales de cada sesión en el sistema de archivos (`auth_info_baileys/<instanceId>`).
*   **Almacenamiento de Metadatos:** Usa una base de datos SQLite (`whatsapp_instances.db`) para almacenar información sobre las instancias (ID, estado).
*   **API HTTP para Emisión de Eventos:** Un endpoint (`/api/emit`) permite a sistemas externos enviar datos a salas específicas de clientes Socket.IO.
*   **Interfaz de Administración Moderna:** Construido con Node.js ES Modules, Express, EJS, Bootstrap 5, SweetAlert2 y diseño responsivo con modo oscuro.
*   **Sincronización Automática:** Sincroniza automáticamente el historial completo, contactos y chats cuando se conecta una instancia.

## Requisitos Previos

*   [Node.js](https://nodejs.org/) (Preferiblemente LTS)
*   [npm](https://www.npmjs.com/) (Incluido con Node.js)

## Instalación

1.  Clona este repositorio:
    ```bash
    git clone https://tu-repositorio-url.git
    cd sever-sockerIO # Asegúrate de que el nombre del directorio es correcto
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```

## Uso

1.  **Iniciar el Servidor:**
    *   En modo desarrollo (con `nodemon` para reinicios automáticos):
        ```bash
        npm run dev
        ```
    *   En modo producción:
        ```bash
        npm start
        ```
2.  **Acceder a las Interfaces Web:**
    *   **Panel de Administración:** Abre `http://localhost:3000/admin` en tu navegador. Esta es la página principal que proporciona navegación a todas las secciones.
    *   **Gestor de WhatsApp:** Accede a través del panel de administración o directamente en `http://localhost:3000/admin/whatsapp`. Aquí podrás crear y administrar tus instancias de WhatsApp.
    *   **Monitor Interno:** Accede a través del panel de administración o directamente en `http://localhost:3000/admin/monitor`. Aquí verás un log de la actividad del servidor en tiempo real.
3.  **Variables de Entorno:**
    *   El servidor escucha en el puerto definido por la variable de entorno `PORT`. Si no se define, usa el puerto `3000` por defecto. Puedes crear un archivo `.env` en la raíz del proyecto para configurarlo:
        ```bash
        PORT=3001
        ```

## Despliegue en Producción

### 1. Preparación del Entorno

Antes de desplegar en producción, asegúrate de:

1.  **Configurar un dominio o subdominio** para acceder a la aplicación (ej. `whatsapp-manager.tudominio.com`)
2.  **Configurar SSL/TLS** para conexiones seguras (recomendado Let's Encrypt)
3.  **Configurar un proxy inverso** como Nginx o Apache para manejar las solicitudes HTTP/HTTPS
4.  **Asegurar permisos adecuados** para el directorio de la aplicación

### 2. Configuración del Proxy Inverso (Nginx)

Crea un archivo de configuración en Nginx (`/etc/nginx/sites-available/whatsapp-manager`):

```nginx
server {
    listen 80;
    server_name whatsapp-manager.tudominio.com;
    
    # Redirigir todo el tráfico HTTP a HTTPS
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name whatsapp-manager.tudominio.com;
    
    # Configuración SSL (ajusta las rutas a tus certificados)
    ssl_certificate /path/to/your/certificate.crt;
    ssl_certificate_key /path/to/your/private.key;
    
    # Mejores prácticas de seguridad SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES256-GCM-SHA512:DHE-RSA-AES256-GCM-SHA512:ECDHE-RSA-AES256-GCM-SHA384:DHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    
    # Configuración de seguridad
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;
    
    # Configuración del proxy para la aplicación Node.js
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_buffering off;
    }
    
    # Configuración para Socket.IO (WebSockets)
    location /socket.io/ {
        proxy_pass http://localhost:3000/socket.io/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Habilita el sitio y reinicia Nginx:

```bash
sudo ln -s /etc/nginx/sites-available/whatsapp-manager /etc/nginx/sites-enabled/
sudo nginx -t  # Verificar configuración
sudo systemctl reload nginx
```

### 3. Configuración como Servicio del Sistema (Systemd)

Crea un archivo de servicio en `/etc/systemd/system/whatsapp-manager.service`:

```ini
[Unit]
Description=WhatsApp Manager Server
After=network.target

[Service]
Type=simple
User=tu-usuario
WorkingDirectory=/ruta/a/sever-sockerIO
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=10
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

Habilita e inicia el servicio:

```bash
sudo systemctl daemon-reload
sudo systemctl enable whatsapp-manager
sudo systemctl start whatsapp-manager
```

### 4. Gestión de Registros (Logs)

Configura el registro de la aplicación para facilitar la supervisión:

```bash
# Crear directorio para logs
sudo mkdir -p /var/log/whatsapp-manager
sudo chown tu-usuario:tu-usuario /var/log/whatsapp-manager

# Ver logs en tiempo real
sudo journalctl -u whatsapp-manager -f
```

### 5. Configuración de Seguridad Adicional

1.  **Configurar un firewall** (UFW):
    ```bash
    sudo ufw allow ssh
    sudo ufw allow 'Nginx Full'
    sudo ufw enable
    ```

2.  **Limitar permisos del directorio de autenticación**:
    ```bash
    chmod 700 auth_info_baileys/
    chown tu-usuario:tu-usuario auth_info_baileys/
    ```

3.  **Configurar copias de seguridad** regulares de:
    *   Base de datos SQLite (`whatsapp_instances.db`)
    *   Directorio de autenticación (`auth_info_baileys/`)

### 6. Pruebas de Funcionamiento

Después del despliegue, realiza las siguientes pruebas:

1.  **Accede a la interfaz web** en `https://whatsapp-manager.tudominio.com/admin`
2.  **Crea una nueva instancia** de WhatsApp
3.  **Escanea el código QR** con la aplicación de WhatsApp en tu móvil
4.  **Verifica la sincronización** de contactos, chats y mensajes
5.  **Prueba la desconexión y reconexión** de la instancia
6.  **Verifica el monitoreo** en tiempo real de la actividad

### 7. Mantenimiento y Actualizaciones

1.  **Actualiza regularmente** las dependencias:
    ```bash
    npm outdated
    npm update
    ```

2.  **Reinicia el servicio** después de actualizaciones:
    ```bash
    sudo systemctl restart whatsapp-manager
    ```

3.  **Monitorea el uso de recursos** del sistema

## Estructura del Proyecto

*   `index.js`: Punto de entrada principal. Configura Express, Socket.IO, rutas y escucha eventos de conexión.
*   `whatsappManager.js`: Módulo central para la lógica de gestión de instancias de Baileys (creación, eventos, persistencia).
*   `views/`:
    *   `admin.ejs`: Página principal del panel de administración.
    *   `whatsapp.ejs`: Página web para gestionar instancias de WhatsApp (Bootstrap 5, JS personalizado).
    *   `monitor.ejs`: Página web para monitorear la actividad del servidor (Vanilla JS, Bootstrap 5, SweetAlert2).
    *   `partials/`:
        *   `header.ejs`: Encabezado común con navegación y estilos.
        *   `footer.ejs`: Pie de página común con scripts.
*   `public/`:
    *   `css/`: Archivos CSS separados.
    *   `js/`: Archivos JavaScript separados.
*   `auth_info_baileys/`: Directorio donde Baileys guarda los archivos de autenticación de cada instancia.
*   `whatsapp_instances.db`: Base de datos SQLite que almacena metadatos de las instancias.
*   `package.json`: Define dependencias, scripts y metadatos del proyecto.

## API de Sockets

Los clientes Socket.IO pueden emitir los siguientes eventos al servidor:

*   `create_instance`: `{ instanceId: 'ID_UNICO' }` - Solicita la creación de una nueva instancia de WhatsApp.
*   `list_instances`: - Solicita la lista de todas las instancias registradas en la base de datos.
*   `join_instance_room`: `{ instanceId: 'ID_UNICO' }` - El cliente se une a la sala específica de una instancia para recibir sus actualizaciones.
*   `delete_instance`: `{ instanceId: 'ID_UNICO' }` - Solicita la eliminación permanente de una instancia.
*   `join_internal_monitor_room`: - El cliente se une a la sala de monitoreo interno para recibir logs de actividad del servidor.
*   `join_room`: `{ roomName: 'NOMBRE_SALA' }` - El cliente se une a una sala genérica (callback disponible).

## API HTTP

*   `POST /api/emit`:
    *   Permite a sistemas externos emitir un evento a una sala específica de clientes Socket.IO.
    *   **Cuerpo (JSON):**
        ```json
        {
          "roomName": "nombre_de_la_sala",
          "dataToEmit": { "clave": "valor", ... },
          "eventName": "nombre_del_evento_personalizado" // Opcional, por defecto es 'new_server_data'
        }
        ```

## Desarrollo

*   El proyecto utiliza módulos ES (`import`/`export`).
*   Se puede usar `npm run dev` con `nodemon` para desarrollo.
*   La interfaz web utiliza EJS con partials para un diseño consistente.
*   Bootstrap 5 para un diseño responsivo y moderno.
*   SweetAlert2 para notificaciones y diálogos mejorados.

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir lo que te gustaría cambiar.

## Licencia

[ISC](https://opensource.org/licenses/ISC)