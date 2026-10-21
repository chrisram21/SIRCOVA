import { ErrorApi } from '../../middlewares/errores.js';

const ROLES_POR_DDRISS = new Set(['REVISOR', 'EPIDEMIOLOGIA', 'ADMINISTRADOR', 'AUTORIDAD']);

const esId = (valor) => Number.isInteger(valor) && valor > 0;

// Regla 10 de AGENTS.md. Falla cerrado: cualquier caso no previsto no ve nada.
function ambitoDe(usuario) {
  const { rol, establecimientoId, ddrissId } = usuario ?? {};

  if (rol === 'ESTABLECIMIENTO') {
    return esId(establecimientoId) ? { tipo: 'ESTABLECIMIENTO', id: establecimientoId } : null;
  }
  if (rol === 'AUTORIDAD' && ddrissId === null) return { tipo: 'PAIS' };
  if (ROLES_POR_DDRISS.has(rol) && esId(ddrissId)) return { tipo: 'DDRISS', id: ddrissId };
  return null;
}

// Las columnas las escribe el programador, nunca vienen de la petición.
export function filtroAlcance(usuario, columnas = {}) {
  const ambito = ambitoDe(usuario);

  if (ambito?.tipo === 'PAIS') return { condicion: '1 = 1', parametros: [] };
  if (ambito?.tipo === 'ESTABLECIMIENTO' && columnas.establecimiento) {
    return { condicion: `${columnas.establecimiento} = ?`, parametros: [ambito.id] };
  }
  if (ambito?.tipo === 'DDRISS' && columnas.ddriss) {
    return { condicion: `${columnas.ddriss} = ?`, parametros: [ambito.id] };
  }
  return { condicion: '1 = 0', parametros: [] };
}

// Mismo 404 que un recurso inexistente, para no revelar qué hay fuera del ámbito.
export function verificarAlcance(usuario, recurso = {}) {
  const ambito = ambitoDe(usuario);

  if (ambito?.tipo === 'PAIS') return;
  if (ambito?.tipo === 'ESTABLECIMIENTO' && recurso.establecimientoId === ambito.id) return;
  if (ambito?.tipo === 'DDRISS' && recurso.ddrissId === ambito.id) return;

  throw new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.');
}
