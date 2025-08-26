import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Eliminar directorio auth_info_baileys
const authDir = path.join(__dirname, 'auth_info_baileys');
if (fs.existsSync(authDir)) {
  fs.rmSync(authDir, { recursive: true, force: true });
  console.log('Directorio auth_info_baileys eliminado');
}

// Eliminar base de datos
const dbFile = path.join(__dirname, 'whatsapp_instances.db');
if (fs.existsSync(dbFile)) {
  fs.unlinkSync(dbFile);
  console.log('Archivo whatsapp_instances.db eliminado');
}

console.log('Limpieza completada');