import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

// SPEC 78: el logo institucional de cada DDRISS, en logos/{código}.png (autorizado por la DDRISS). Va dentro de src/
// para que la imagen de Docker lo copie. Una DDRISS sin logo, o un archivo sin DDRISS, sigue con el texto de siempre.
export const LOGOS = path.join(import.meta.dirname, 'logos');

// { bytes, ancho, alto } del logo de la DDRISS (en px, del encabezado IHDR del PNG), o null si no tiene.
export function logoDeLaDdriss(codigo) {
  if (!codigo || !/^[A-Z0-9_]+$/.test(codigo)) return null;
  const ruta = path.join(LOGOS, `${codigo}.png`);
  if (!existsSync(ruta)) return null;
  const bytes = readFileSync(ruta);
  return { bytes, ancho: bytes.readUInt32BE(16), alto: bytes.readUInt32BE(20) };
}
