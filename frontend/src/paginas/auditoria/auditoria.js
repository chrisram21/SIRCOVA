import { aDiaMesAnio } from '@/lib/fechas.js'

// SPEC 70 (HU-54): etiquetas y funciones puras de la pantalla «Auditoría». ETIQUETAS_MODULO y ETIQUETAS_ACCION repiten
// las de backend/src/modulos/auditoria/textosBitacora.js (el Excel): un cambio va en los dos lados.

// SPEC 71: «Auditoría» es un hijo de «Administración»; /auditoria redirige aquí (RedireccionRutaVieja).
export const RUTA_AUDITORIA = '/administracion/auditoria'

// Los registros de la bitácora de un elemento (una versión de esquema, regla o indicador) en todo el historial.
export function enlaceBitacora(entidad, id) {
  return `${RUTA_AUDITORIA}?${new URLSearchParams({ entidad, entidadId: id, desde: '', hasta: '' })}`
}

export const ETIQUETAS_MODULO = {
  USUARIOS: 'Usuarios',
  CONFIGURACION: 'Configuración',
  PRODUCCION: 'Producción',
  REVISION: 'Revisión',
  RECTIFICACION: 'Rectificación',
  INDICADORES: 'Indicadores',
  REPORTES: 'Informes',
  SISTEMA: 'Sistema',
}

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
}

export const ETIQUETAS_ENTIDAD = {
  alerta: 'Alerta',
  bitacora: 'Bitácora',
  catalogo_dimensiones: 'Dimensión',
  cierre_periodo: 'Cierre del mes',
  configuracion_indicadores: 'Indicador',
  corrida_calculo: 'Cálculo de indicadores',
  distrito_salud: 'Distrito de salud',
  dosis: 'Dosis',
  empleado: 'Empleado',
  esquemas_captura: 'Esquema de captura',
  establecimiento: 'Establecimiento',
  informe: 'Informe',
  periodo: 'Periodo',
  permiso: 'Permiso',
  poblacion_objetivo: 'Población objetivo',
  red: 'Red',
  reglas_validacion: 'Regla de validación',
  reporte_produccion: 'Reporte',
  reporte_vacuna: 'Vacuna del reporte',
  solicitud_rectificacion: 'Rectificación',
  usuario: 'Usuario',
  vacuna: 'Vacuna',
}

// Un código sin etiqueta se muestra tal cual.
export const etiquetaModulo = (codigo) => ETIQUETAS_MODULO[codigo] ?? codigo
export const etiquetaAccion = (codigo) => ETIQUETAS_ACCION[codigo] ?? codigo
export const etiquetaEntidad = (codigo) => ETIQUETAS_ENTIDAD[codigo] ?? codigo

// Las tablas de catálogo de MySQL («Cambios en catálogos» del Inicio). Esquemas, reglas e indicadores son de HU-55.
export const ENTIDADES_CATALOGO = [
  'vacuna',
  'dosis',
  'establecimiento',
  'distrito_salud',
  'red',
  'periodo',
  'poblacion_objetivo',
]

// Colores de la etiqueta de cada acción, del tema (index.css).
export const COLORES_GRUPO = {
  sesion: 'bg-estado-enviado text-estado-enviado-foreground',
  edicion: 'bg-exito text-exito-foreground',
  estado: 'bg-estado-revision text-estado-revision-foreground',
  rectificacion: 'bg-estado-correccion text-estado-correccion-foreground',
  configuracion: 'bg-accent text-accent-foreground',
  baja: 'bg-destructive/10 text-destructive',
  denegado: 'bg-advertencia text-advertencia-foreground',
}

const ACCIONES_POR_GRUPO = {
  denegado: ['ACCESO_DENEGADO', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA'],
  sesion: ['LOGIN_OK', 'LOGOUT', 'CAMBIO_CONTRASENA', 'RESTABLECER_CONTRASENA', 'DESBLOQUEAR'],
  baja: ['DESACTIVAR', 'ELIMINAR'],
  rectificacion: ['APLICAR_RECTIFICACION', 'RECHAZAR_RECTIFICACION'],
  estado: ['CAMBIO_ESTADO', 'CERRAR_PERIODO'],
  configuracion: ['PUBLICAR_ESQUEMA'],
}

export function grupoDe({ modulo, accion }) {
  for (const grupo of ['denegado', 'sesion', 'baja', 'rectificacion', 'estado', 'configuracion']) {
    if (ACCIONES_POR_GRUPO[grupo].includes(accion)) return grupo
  }
  if (modulo === 'RECTIFICACION') return 'rectificacion'
  if (modulo === 'CONFIGURACION') return 'configuracion'
  return 'edicion'
}

// ---------------------------------------------------------------- Fechas (Guatemala)

const ZONA_HORARIA = 'America/Guatemala'

// AAAA-MM-DD en Guatemala.
export const diaEnGuatemala = (fecha = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: ZONA_HORARIA }).format(fecha)

// AAAA-MM-DD más (o menos) n días.
export function sumarDias(dia, dias) {
  const [anio, mes, numero] = dia.split('-').map(Number)
  return new Date(Date.UTC(anio, mes - 1, numero + dias)).toISOString().slice(0, 10)
}

// Los últimos n días, hoy incluido.
export function ultimosDias(dias, ahora = new Date()) {
  const hasta = diaEnGuatemala(ahora)
  return { desde: sumarDias(hasta, -(dias - 1)), hasta }
}

// DD/MM/AAAA HH:mm en Guatemala.
export function fechaHora(iso) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('es-GT', {
      timeZone: ZONA_HORARIA,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date(iso))
      .map((p) => [p.type, p.value]),
  )
  return `${partes.day}/${partes.month}/${partes.year} ${partes.hour}:${partes.minute}`
}

// ---------------------------------------------------------------- URL y filtros

export const DIAS_POR_DEFECTO = 30
export const POR_PAGINA_INICIAL = 10
const FILAS_POR_PAGINA = [10, 20, 50]

const esDia = (texto) => {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(texto ?? '')
  return Boolean(partes) && new Date(Date.UTC(partes[1], partes[2] - 1, partes[3])).toISOString().slice(0, 10) === texto
}
const entero = (texto, minimo) => (/^\d+$/.test(texto ?? '') && Number(texto) >= minimo ? Number(texto) : undefined)
const valido = (texto, patron) => (patron.test(texto ?? '') ? texto : undefined)

/**
 * Los filtros de la URL. Sin `desde` ni `hasta`, los últimos 30 días; con uno de ellos vacío (`desde=`), sin ese
 * límite. Un valor inválido se ignora: a la API solo llegan filtros válidos.
 */
export function filtrosDeUrl(parametros, ahora = new Date()) {
  const conFechas = parametros.has('desde') || parametros.has('hasta')
  const porDefecto = ultimosDias(DIAS_POR_DEFECTO, ahora)
  const fecha = (nombre) => {
    if (!conFechas) return porDefecto[nombre]
    const valor = parametros.get(nombre)
    return esDia(valor) ? valor : undefined
  }
  const porPagina = Number(parametros.get('porPagina'))
  const modulo = parametros.get('modulo')
  const filtros = {
    desde: fecha('desde'),
    hasta: fecha('hasta'),
    usuario: entero(parametros.get('usuario'), 1),
    modulo: Object.hasOwn(ETIQUETAS_MODULO, modulo ?? '') ? modulo : undefined,
    accion: valido(parametros.get('accion'), /^[A-Z_]{1,40}$/),
    entidad: valido(parametros.get('entidad'), /^[a-z_]{1,60}(,[a-z_]{1,60})*$/),
    entidadId: valido(parametros.get('entidadId'), /^.{1,40}$/su),
    pagina: entero(parametros.get('pagina'), 1) ?? 1,
    porPagina: FILAS_POR_PAGINA.includes(porPagina) ? porPagina : POR_PAGINA_INICIAL,
  }
  return Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== undefined))
}

/**
 * La búsqueda de la URL. `desde` y `hasta` van siempre (vacíos si no hay límite), para que no vuelva el rango por
 * defecto; la página 1 y las 10 filas por página no se escriben.
 */
export function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  consulta.set('desde', filtros.desde ?? '')
  consulta.set('hasta', filtros.hasta ?? '')
  for (const nombre of ['usuario', 'modulo', 'accion', 'entidad', 'entidadId']) {
    if (filtros[nombre] !== undefined && filtros[nombre] !== '') consulta.set(nombre, String(filtros[nombre]))
  }
  if (filtros.pagina && filtros.pagina !== 1) consulta.set('pagina', String(filtros.pagina))
  if (filtros.porPagina && filtros.porPagina !== POR_PAGINA_INICIAL) {
    consulta.set('porPagina', String(filtros.porPagina))
  }
  return consulta.toString()
}

// Los filtros de la URL como los pide la API (sin la página).
export function pedidoDe(filtros) {
  const { desde, hasta, usuario, modulo, accion, entidad, entidadId } = filtros
  return { desde, hasta, usuarioId: usuario, modulo, accion, entidad, entidadId }
}

const etiquetasDeEntidades = (entidad) => entidad.split(',').map(etiquetaEntidad).join(', ')

export function textoDeFechas({ desde, hasta }) {
  if (desde && hasta) return `${aDiaMesAnio(desde)} a ${aDiaMesAnio(hasta)}`
  if (desde) return `desde el ${aDiaMesAnio(desde)}`
  if (hasta) return `hasta el ${aDiaMesAnio(hasta)}`
  return null
}

/**
 * Un chip por filtro aplicado: { clave, texto, quitar } (quitar son los cambios de filtros que lo sacan). Quitar el
 * de las fechas deja el rango sin límite. usuarios: los de las opciones, para mostrar el nombre.
 */
export function chipsDe(filtros, usuarios = []) {
  const chips = []
  const fechas = textoDeFechas(filtros)
  if (fechas) chips.push({ clave: 'fechas', texto: `Fecha: ${fechas}`, quitar: { desde: undefined, hasta: undefined } })
  if (filtros.usuario) {
    const cuenta = usuarios.find((u) => u.id === filtros.usuario)
    chips.push({
      clave: 'usuario',
      texto: `Usuario: ${cuenta?.nombre ?? `#${filtros.usuario}`}`,
      quitar: { usuario: undefined },
    })
  }
  if (filtros.modulo) {
    chips.push({ clave: 'modulo', texto: `Módulo: ${etiquetaModulo(filtros.modulo)}`, quitar: { modulo: undefined } })
  }
  if (filtros.accion) {
    chips.push({ clave: 'accion', texto: `Acción: ${etiquetaAccion(filtros.accion)}`, quitar: { accion: undefined } })
  }
  if (filtros.entidad || filtros.entidadId) {
    const partes = [
      filtros.entidad && etiquetasDeEntidades(filtros.entidad),
      filtros.entidadId && `#${filtros.entidadId}`,
    ]
    chips.push({
      clave: 'elemento',
      texto: `Elemento: ${partes.filter(Boolean).join(' ')}`,
      quitar: { entidad: undefined, entidadId: undefined },
    })
  }
  return chips
}

const formatoEntero = new Intl.NumberFormat('es-GT')
const plural = (n, uno, varios) => `${formatoEntero.format(n)} ${n === 1 ? uno : varios}`

// Las dos líneas sobre la tabla.
export function textosDelResumen(resultado, filtros) {
  const { desde, hasta } = filtros
  const registros = plural(resultado.total, 'registro', 'registros')
  let rango = 'en todo el historial'
  if (desde && hasta) rango = `entre el ${aDiaMesAnio(desde)} y el ${aDiaMesAnio(hasta)}`
  else if (desde) rango = `desde el ${aDiaMesAnio(desde)}`
  else if (hasta) rango = `hasta el ${aDiaMesAnio(hasta)}`
  return [
    `${registros} ${rango} · del más reciente al más antiguo`,
    `${plural(resultado.resumen.usuarios, 'usuario', 'usuarios')} · ${plural(
      resultado.resumen.rectificaciones,
      'rectificación',
      'rectificaciones',
    )}`,
  ]
}

// ---------------------------------------------------------------- Detalle

export const SIN_VALOR = '—'

// Objetos y listas como JSON compacto; null o ausente, «—».
export function textoDeValor(valor) {
  if (valor === undefined || valor === null) return SIN_VALOR
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

// Una fila por clave de los dos JSON, primero las de los anteriores, cada una una sola vez.
export function filasDeCambios(anteriores, nuevos) {
  const antes = anteriores ?? {}
  const despues = nuevos ?? {}
  const claves = [...new Set([...Object.keys(antes), ...Object.keys(despues)])]
  return claves.map((campo) => ({
    campo,
    anterior: Object.hasOwn(antes, campo) ? textoDeValor(antes[campo]) : SIN_VALOR,
    nuevo: Object.hasOwn(despues, campo) ? textoDeValor(despues[campo]) : SIN_VALOR,
  }))
}

export const tieneCambios = (registro) => registro.valoresAnteriores != null || registro.valoresNuevos != null
