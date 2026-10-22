import crypto from 'node:crypto';
import entorno from '../../config/entorno.js';

// Huella HMAC-SHA256 (64 caracteres hexadecimales) de los 13 dígitos limpios que devuelve validarCui.
// Con clave y no con SHA-256 simple: el CUI tiene pocas combinaciones y sin clave se podrían calcular todas.
export function huellaCui(cuiLimpio, clave = entorno.cuiHmacClave) {
  return crypto.createHmac('sha256', clave).update(cuiLimpio).digest('hex');
}
