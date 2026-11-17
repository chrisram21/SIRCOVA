import {
  chipsDe,
  consultaDe,
  etiquetaAccion,
  etiquetaEntidad,
  filasDeCambios,
  filtrosDeUrl,
  grupoDe,
  pedidoDe,
  textoDeValor,
  textosDelResumen,
  ultimosDias,
} from './auditoria.js'

// 06:00 del 16 de noviembre en Guatemala.
const AHORA = new Date('2026-11-16T12:00:00.000Z')
const url = (texto) => new URLSearchParams(texto)

describe('filtrosDeUrl', () => {
  test('sin desde ni hasta, los últimos 30 días de Guatemala, la página 1 y 10 filas', () => {
    expect(filtrosDeUrl(url(''), AHORA)).toEqual({ desde: '2026-10-18', hasta: '2026-11-16', pagina: 1, porPagina: 10 })
  })

  test('el día es el de Guatemala aunque en UTC ya sea el siguiente', () => {
    expect(ultimosDias(1, new Date('2026-11-17T03:00:00.000Z'))).toEqual({ desde: '2026-11-16', hasta: '2026-11-16' })
  })

  test('con desde o hasta vacíos, sin ese límite', () => {
    expect(filtrosDeUrl(url('desde=&hasta='), AHORA)).toEqual({ pagina: 1, porPagina: 10 })
    expect(filtrosDeUrl(url('desde=2026-10-01'), AHORA)).toEqual({ desde: '2026-10-01', pagina: 1, porPagina: 10 })
  })

  test('lee todos los filtros', () => {
    const filtros = filtrosDeUrl(
      url('desde=2026-10-01&hasta=2026-10-31&usuario=2&modulo=REVISION&accion=CAMBIO_ESTADO'
        + '&entidad=vacuna,dosis&entidadId=255&pagina=3&porPagina=50'),
      AHORA,
    )

    expect(filtros).toEqual({
      desde: '2026-10-01',
      hasta: '2026-10-31',
      usuario: 2,
      modulo: 'REVISION',
      accion: 'CAMBIO_ESTADO',
      entidad: 'vacuna,dosis',
      entidadId: '255',
      pagina: 3,
      porPagina: 50,
    })
  })

  test('un valor inválido se ignora', () => {
    const filtros = filtrosDeUrl(
      url('desde=2026-02-30&hasta=ayer&usuario=x&modulo=OTRO&accion=crear&entidad=Vacuna&pagina=0&porPagina=15'),
      AHORA,
    )

    expect(filtros).toEqual({ pagina: 1, porPagina: 10 })
  })
})

describe('consultaDe y pedidoDe', () => {
  test('desde y hasta van siempre; la página 1 y las 10 filas no se escriben', () => {
    expect(consultaDe({ pagina: 1, porPagina: 10 })).toBe('desde=&hasta=')
    expect(consultaDe({ desde: '2026-10-01', hasta: '2026-10-31', modulo: 'USUARIOS', pagina: 2, porPagina: 20 })).toBe(
      'desde=2026-10-01&hasta=2026-10-31&modulo=USUARIOS&pagina=2&porPagina=20',
    )
  })

  test('leer lo que escribe da los mismos filtros', () => {
    const filtros = { desde: '2026-10-01', usuario: 2, entidad: 'vacuna', entidadId: '7', pagina: 4, porPagina: 50 }
    expect(filtrosDeUrl(url(consultaDe(filtros)), AHORA)).toEqual(filtros)
  })

  test('el pedido a la API lleva usuarioId y no la página', () => {
    expect(pedidoDe({ desde: '2026-10-01', usuario: 2, modulo: 'USUARIOS', pagina: 3, porPagina: 20 })).toEqual({
      desde: '2026-10-01',
      hasta: undefined,
      usuarioId: 2,
      modulo: 'USUARIOS',
      accion: undefined,
      entidad: undefined,
      entidadId: undefined,
    })
  })
})

describe('chipsDe', () => {
  const usuarios = [{ id: 2, nombre: 'María López' }]

  test('un chip por filtro aplicado, con sus etiquetas, y lo que lo quita', () => {
    const chips = chipsDe(
      {
        desde: '2026-09-01',
        hasta: '2026-10-07',
        usuario: 2,
        modulo: 'REVISION',
        accion: 'CAMBIO_ESTADO',
        entidad: 'reporte_produccion',
        entidadId: '255',
      },
      usuarios,
    )

    expect(chips.map((c) => c.texto)).toEqual([
      'Fecha: 01/09/2026 a 07/10/2026',
      'Usuario: María López',
      'Módulo: Revisión',
      'Acción: Cambio de estado',
      'Elemento: Reporte #255',
    ])
    expect(chips[0].quitar).toEqual({ desde: undefined, hasta: undefined })
    expect(chips[4].quitar).toEqual({ entidad: undefined, entidadId: undefined })
  })

  test('sin el nombre del usuario, su id; varias entidades; solo una fecha', () => {
    const chips = chipsDe({ hasta: '2026-10-07', usuario: 9, entidad: 'vacuna,dosis' }, usuarios)

    expect(chips.map((c) => c.texto)).toEqual([
      'Fecha: hasta el 07/10/2026',
      'Usuario: #9',
      'Elemento: Vacuna, Dosis',
    ])
  })

  test('sin filtros, ningún chip', () => {
    expect(chipsDe({ pagina: 1, porPagina: 10 })).toEqual([])
  })
})

describe('textosDelResumen', () => {
  const resultado = (total, usuarios, rectificaciones) => ({ total, resumen: { usuarios, rectificaciones } })

  test('con el rango, el total y los conteos', () => {
    expect(textosDelResumen(resultado(1248, 14, 3), { desde: '2026-09-01', hasta: '2026-10-07' })).toEqual([
      '1,248 registros entre el 01/09/2026 y el 07/10/2026 · del más reciente al más antiguo',
      '14 usuarios · 3 rectificaciones',
    ])
  })

  test('en singular y sin límite de fechas', () => {
    expect(textosDelResumen(resultado(1, 1, 1), {})).toEqual([
      '1 registro en todo el historial · del más reciente al más antiguo',
      '1 usuario · 1 rectificación',
    ])
  })
})

describe('detalle y etiquetas', () => {
  test('una fila por campo, con lo que falta como «—» y los objetos como JSON', () => {
    expect(
      filasDeCambios({ estado: 'EN_REVISION', meta: null }, { estado: 'APROBADO', cierre: { id: 8 }, activo: false }),
    ).toEqual([
      { campo: 'estado', anterior: 'EN_REVISION', nuevo: 'APROBADO' },
      { campo: 'meta', anterior: '—', nuevo: '—' },
      { campo: 'cierre', anterior: '—', nuevo: '{"id":8}' },
      { campo: 'activo', anterior: '—', nuevo: 'false' },
    ])
    expect(filasDeCambios(null, null)).toEqual([])
    expect(textoDeValor([1, 2])).toBe('[1,2]')
  })

  test('un código sin etiqueta se muestra tal cual', () => {
    expect(etiquetaAccion('CERRAR_PERIODO')).toBe('Cierre de periodo')
    expect(etiquetaAccion('NUEVA_ACCION')).toBe('NUEVA_ACCION')
    expect(etiquetaEntidad('tabla_nueva')).toBe('tabla_nueva')
  })

  test('el grupo de color sale de la acción y, si no, del módulo', () => {
    expect(grupoDe({ modulo: 'USUARIOS', accion: 'LOGIN_FALLIDO' })).toBe('denegado')
    expect(grupoDe({ modulo: 'USUARIOS', accion: 'LOGIN_OK' })).toBe('sesion')
    expect(grupoDe({ modulo: 'USUARIOS', accion: 'DESACTIVAR' })).toBe('baja')
    expect(grupoDe({ modulo: 'REVISION', accion: 'CAMBIO_ESTADO' })).toBe('estado')
    expect(grupoDe({ modulo: 'RECTIFICACION', accion: 'AUTORIZAR' })).toBe('rectificacion')
    expect(grupoDe({ modulo: 'CONFIGURACION', accion: 'ACTUALIZAR' })).toBe('configuracion')
    expect(grupoDe({ modulo: 'PRODUCCION', accion: 'ACTUALIZAR' })).toBe('edicion')
  })
})
