// SPEC 70 (HU-54): las etiquetas de la bitácora en el Excel. Repiten las de
// frontend/src/paginas/auditoria/auditoria.js: un cambio va en los dos lados. Un código sin etiqueta se muestra tal cual.

export const ETIQUETAS_MODULO = {
  USUARIOS: 'Usuarios',
  CONFIGURACION: 'Configuración',
  PRODUCCION: 'Producción',
  REVISION: 'Revisión',
  RECTIFICACION: 'Rectificación',
  INDICADORES: 'Indicadores',
  REPORTES: 'Informes',
  SISTEMA: 'Sistema',
};

export const ETIQUETAS_ACCION = {
  LOGIN_OK: 'Inicio de sesión',
  LOGIN_FALLIDO: 'Inicio de sesión fallido',
  CUENTA_BLOQUEADA: 'Cuenta bloqueada',
  LOGOUT: 'Cierre de sesión',
  CREAR: 'Creación',
  ACTUALIZAR: 'Edición',
  DESACTIVAR: 'Desactivación',
  REACTIVAR: 'Reactivación',
  ELIMINAR: 'Eliminación',
  CAMBIO_ESTADO: 'Cambio de estado',
  PUBLICAR_ESQUEMA: 'Publicación de esquema',
  EXPORTAR: 'Exportación',
  ACCESO_DENEGADO: 'Acceso denegado',
  CAMBIO_CONTRASENA: 'Cambio de contraseña',
  DESBLOQUEAR: 'Desbloqueo de cuenta',
  RESTABLECER_CONTRASENA: 'Restablecimiento de contraseña',
  VALIDAR: 'Validación',
  APLICAR_RECTIFICACION: 'Rectificación aplicada',
  RECHAZAR_RECTIFICACION: 'Rectificación rechazada',
  CALCULAR_INDICADORES: 'Cálculo de indicadores',
  // Solo en la semilla (03).
  CERRAR_PERIODO: 'Cierre de periodo',
  AUTORIZAR: 'Autorización',
};

export const etiquetaModulo = (codigo) => ETIQUETAS_MODULO[codigo] ?? codigo;
export const etiquetaAccion = (codigo) => ETIQUETAS_ACCION[codigo] ?? codigo;

const ZONA_HORARIA = 'America/Guatemala';

function partesEnGuatemala(fecha) {
  return Object.fromEntries(new Intl.DateTimeFormat('es-GT', {
    timeZone: ZONA_HORARIA, day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(fecha).map((p) => [p.type, p.value]));
}

// DD/MM/AAAA HH:mm:ss en Guatemala.
export function fechaYHora(fecha) {
  const p = partesEnGuatemala(fecha);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

// AAAA-MM-DD en Guatemala, para el nombre del archivo.
export function diaEnGuatemala(fecha) {
  const p = partesEnGuatemala(fecha);
  return `${p.year}-${p.month}-${p.day}`;
}

// AAAA-MM-DD → DD/MM/AAAA.
export const fechaCorta = (dia) => dia.split('-').reverse().join('/');
