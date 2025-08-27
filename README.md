# Gestor de Instancias Baileys (WhatsApp Web) con Socket.IO

Este proyecto es un servidor Node.js diseñado para gestionar múltiples sesiones independientes de WhatsApp Web simultáneamente. Utiliza la biblioteca [`@whiskeysockets/baileys`](https://github.com/WhiskeySockets/Baileys) para la interacción con WhatsApp, y proporciona una interfaz de comunicación en tiempo real mediante [Socket.IO](https://socket.io/).

## Características Clave

- **Gestión Multi-Instancia:** Crea, administra y elimina múltiples sesiones de WhatsApp, cada una con su propia autenticación y almacenamiento.
- **Interfaz Web de Administración:** Un panel de control construido con EJS, Bootstrap 5 y SweetAlert2 que permite:
  - Gestionar instancias (crear, ver estado, escanear QR, eliminar).
  - Monitorear en tiempo real la actividad del servidor.
  - Diseño responsivo con modo oscuro.
- **Comunicación en Tiempo Real:** Los clientes se conectan vía Socket.IO para recibir actualizaciones instantáneas sobre el estado de las instancias, códigos QR, nuevos mensajes, etc.
- **Persistencia Robusta:**
  - **Sesiones:** Las credenciales de autenticación se guardan en el sistema de archivos (`auth_info_baileys/`) para reconexiones automáticas.
  - **Metadatos:** Toda la información de las instancias, contactos, chats y mensajes se almacena en una base de datos **SQLite** (`whatsapp_instances.db`), asegurando que los datos no se pierdan al reiniciar el servidor.
- **Sincronización de Datos:** Descarga y guarda automáticamente contactos, chats y mensajes (incluyendo multimedia) cuando una instancia se conecta.
- **Acceso Público a Multimedia (Opcional):** Los archivos multimedia recibidos (imágenes, videos) se guardan en la carpeta `public/media` para ser accesibles a través de una URL.
- **API HTTP:** Incluye un endpoint (`/api/emit`) para que sistemas externos puedan enviar eventos a los clientes conectados.

## Requisitos Previos

- [Node.js](https://nodejs.org/) (Versión LTS recomendada)
- [npm](https://www.npmjs.com/) (Incluido con Node.js)

## Instalación

1.  Clona el repositorio:
    ```bash
    git clone https://tu-repositorio-url.git
    cd nombre-del-directorio
    ```
2.  Instala las dependencias:
    ```bash
    npm install
    ```

## Cómo Empezar

1.  **Iniciar el Servidor:**
    - **Modo Desarrollo** (con reinicios automáticos):
      ```bash
      npm run dev
      ```
    - **Modo Producción:**
      ```bash
      npm start
      ```
2.  **Acceder a la Interfaz Web:**

    - Por defecto, el servidor se ejecuta en `http://localhost:6001`.

3.  **Configurar el Puerto (Opcional):**
    - Crea un archivo `.env` en la raíz del proyecto para definir un puerto diferente:
      ```env
      PORT=6001
      ```

## Roadmap (Próximos Pasos)

- ### **Vista de Detalles de Instancia**
  - Crear una nueva página (`/admin/whatsapp/:instanceId`) accesible a través del botón **"Ver"**.
  - Esta vista mostrará toda la información detallada de una instancia específica.
  - **Funcionalidades planeadas:**
    - **Lista de Contactos:** Mostrar todos los contactos sincronizados con una barra de búsqueda.
    - **Lista de Chats:** Presentar todos los chats. Al hacer clic en un chat, se cargarán sus mensajes.
    - **Visor de Mensajes:** Implementar una interfaz para visualizar el historial de mensajes de un chat seleccionado, con soporte para texto y multimedia.
    - **Enviar Mensajes:** Añadir un formulario para enviar mensajes a cualquier contacto o chat desde esta vista.

## Estructura del Proyecto

- `index.js`: Punto de entrada del servidor (Express, Socket.IO, rutas).
- `whatsappManager.js`: Módulo central para la lógica de Baileys (creación, eventos, persistencia en DB).
- `views/`: Contiene las plantillas EJS para la interfaz web.
- `public/`: Archivos estáticos (CSS, JS del lado del cliente, imágenes).
- `media/`: (Dentro de `public/`) Directorio donde se guardan los archivos multimedia recibidos.
- `auth_info_baileys/`: Almacena los archivos de autenticación de cada sesión.
- `whatsapp_instances.db`: Base de datos SQLite.

## API de Sockets

- `create_instance`: `{ instanceId: '...' }` - Crea una nueva instancia.
- `list_instances`: Solicita la lista completa de instancias y sus estadísticas.
- `join_instance_room`: `{ instanceId: '...' }` - Se suscribe a las actualizaciones de una instancia.
- `delete_instance`: `{ instanceId: '...' }` - Elimina permanentemente una instancia.

## API HTTP

- `POST /api/emit`: Permite a sistemas externos emitir un evento a una sala de Socket.IO.
  - **Cuerpo (JSON):** `{ "roomName": "...", "dataToEmit": {...}, "eventName": "..." }`

## Contribuciones

Las contribuciones son bienvenidas. Por favor, abre un issue primero para discutir los cambios que te gustaría proponer.

## Licencia

[ISC](https://opensource.org/licenses/ISC)
