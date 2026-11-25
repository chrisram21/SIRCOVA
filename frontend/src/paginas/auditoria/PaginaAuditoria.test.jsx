import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { descargarBitacoraExcel, listarBitacora, obtenerOpcionesBitacora } from '@/api/auditoria.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaAuditoria from './PaginaAuditoria.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/auditoria.js', () => ({
  listarBitacora: vi.fn(),
  obtenerOpcionesBitacora: vi.fn(),
  descargarBitacoraExcel: vi.fn(),
}))

// 06:00 del 16 de noviembre de 2026 en Guatemala: los 30 días por defecto van del 18/10 al 16/11.
const AHORA = new Date('2026-11-16T12:00:00.000Z')
const DESDE_DEFECTO = '2026-10-18'
const HOY = '2026-11-16'

const MARIA = {
  id: 2,
  nombreUsuario: 'estadigrafa',
  nombre: 'María López',
  rol: { codigo: 'REVISOR', nombre: 'Revisor' },
}

const registro = (id, datos = {}) => ({
  id,
  fecha: '2026-10-07T22:42:00.000Z',
  usuario: MARIA,
  nombreUsuarioIntento: null,
  modulo: 'REVISION',
  accion: 'CAMBIO_ESTADO',
  entidad: 'reporte_produccion',
  entidadId: '255',
  valoresAnteriores: { estado: 'EN_REVISION' },
  valoresNuevos: { estado: 'APROBADO' },
  ipOrigen: '10.0.0.21',
  agenteUsuario: 'Mozilla/5.0',
  ...datos,
})

const REGISTROS = [
  registro(1),
  registro(2, {
    fecha: '2026-10-07T14:02:00.000Z',
    usuario: null,
    nombreUsuarioIntento: 'cs1206',
    modulo: 'USUARIOS',
    accion: 'LOGIN_FALLIDO',
    entidad: 'usuario',
    entidadId: null,
    valoresAnteriores: null,
    valoresNuevos: null,
    ipOrigen: '203.0.113.20',
    agenteUsuario: null,
  }),
]

const respuesta = (elementos = REGISTROS, extra = {}) => ({
  elementos,
  total: elementos.length,
  pagina: 1,
  porPagina: 10,
  resumen: { usuarios: 1, rectificaciones: 0, accesosFallidos: 1 },
  ...extra,
})

const OPCIONES = {
  usuarios: [
    { ...MARIA, activo: true },
    {
      id: 7,
      nombreUsuario: 'cs1206',
      nombre: 'Pedro Gómez',
      rol: { codigo: 'ESTABLECIMIENTO', nombre: 'Personal' },
      activo: false,
    },
  ],
  modulos: [
    'USUARIOS', 'CONFIGURACION', 'PRODUCCION', 'REVISION', 'RECTIFICACION', 'INDICADORES', 'REPORTES', 'SISTEMA',
  ],
  acciones: ['CAMBIO_ESTADO', 'CERRAR_PERIODO', 'LOGIN_FALLIDO'],
  entidades: ['reporte_produccion', 'usuario', 'vacuna'],
}

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '1', exp })}.firma`,
    usuario: {
      id: 1,
      nombreUsuario: 'admin',
      rol: 'ADMINISTRADOR',
      permisos: ['BITACORA_CONSULTAR'],
      empleado: { nombres: 'Carlos', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

async function montar(url = '/administracion/auditoria') {
  guardarSesion(crearSesion())
  const router = createMemoryRouter(
    [
      {
        path: '/administracion/auditoria',
        element: (
          <ProveedorSesion>
            <PaginaAuditoria />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByLabelText('Cargando la bitácora')).toBeNull())
  return router
}

const fila = (texto) => screen.getByText(texto).closest('tr')
const nativo = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const busqueda = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search))
const ultimoPedido = () => listarBitacora.mock.lastCall[0]

beforeEach(() => {
  vi.clearAllMocks()
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(AHORA)
  listarBitacora.mockResolvedValue(respuesta())
  obtenerOpcionesBitacora.mockResolvedValue(OPCIONES)
})

afterEach(() => {
  vi.useRealTimers()
})

test('sin fechas en la URL pide los últimos 30 días y muestra el resumen y cada registro', async () => {
  await montar()

  expect(listarBitacora).toHaveBeenCalledWith({
    desde: DESDE_DEFECTO,
    hasta: HOY,
    usuarioId: undefined,
    modulo: undefined,
    accion: undefined,
    entidad: undefined,
    entidadId: undefined,
    pagina: 1,
    porPagina: 10,
  })
  expect(screen.getByRole('heading', { name: 'Bitácora del sistema' })).toBeTruthy()
  expect(
    screen.getByText('2 registros entre el 18/10/2026 y el 16/11/2026 · del más reciente al más antiguo'),
  ).toBeTruthy()
  expect(screen.getByText('1 usuario · 0 rectificaciones')).toBeTruthy()
  expect(screen.getByText('Fecha: 18/10/2026 a 16/11/2026')).toBeTruthy()

  const cambio = within(fila('María López'))
  expect(cambio.getByText('07/10/2026 16:42')).toBeTruthy()
  expect(cambio.getByText('Revisor')).toBeTruthy()
  expect(cambio.getByText('Cambio de estado')).toBeTruthy()
  expect(cambio.getByText('Revisión')).toBeTruthy()
  expect(cambio.getByText('Reporte')).toBeTruthy()
  expect(cambio.getByText('#255')).toBeTruthy()
  const intento = within(fila('Intento: cs1206'))
  expect(intento.getByText('Inicio de sesión fallido')).toBeTruthy()
  expect(intento.getByText('Usuario')).toBeTruthy()
})

test('los filtros solo pasan a la URL y a la consulta al aplicar', async () => {
  const router = await montar()

  fireEvent.change(nativo('modulo'), { target: { value: 'REVISION' } })
  fireEvent.change(nativo('accion'), { target: { value: 'CERRAR_PERIODO' } })
  fireEvent.change(nativo('entidad'), { target: { value: 'reporte_produccion' } })
  fireEvent.change(screen.getByLabelText('Id del elemento'), { target: { value: ' 255 ' } })
  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } })
  expect(listarBitacora).toHaveBeenCalledTimes(1)
  expect(busqueda(router)).toEqual({})

  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

  await waitFor(() =>
    expect(busqueda(router)).toEqual({
      desde: '2026-10-01',
      hasta: HOY,
      modulo: 'REVISION',
      accion: 'CERRAR_PERIODO',
      entidad: 'reporte_produccion',
      entidadId: '255',
    }),
  )
  await waitFor(() =>
    expect(ultimoPedido()).toMatchObject({
      desde: '2026-10-01',
      hasta: HOY,
      modulo: 'REVISION',
      accion: 'CERRAR_PERIODO',
      entidad: 'reporte_produccion',
      entidadId: '255',
      pagina: 1,
    }),
  )
  expect(screen.getByText('Acción: Cierre de periodo')).toBeTruthy()
})

describe('«Filtros sin aplicar» (SPEC 75)', () => {
  const SIN_APLICAR = 'Filtros sin aplicar'
  const botonAplicar = () => screen.getByRole('button', { name: 'Aplicar' })

  test('no se ve al entrar; aparece al cambiar un filtro y se va al aplicar', async () => {
    await montar()
    expect(screen.queryByText(SIN_APLICAR)).toBeNull()
    expect(botonAplicar().className).not.toContain('bg-cambio-pendiente')

    fireEvent.change(nativo('modulo'), { target: { value: 'REVISION' } })
    const aviso = screen.getByText(SIN_APLICAR)
    expect(botonAplicar().className).toContain('bg-cambio-pendiente')
    expect(botonAplicar().getAttribute('aria-describedby')).toBe(aviso.id)

    fireEvent.click(botonAplicar())
    await waitFor(() => expect(screen.queryByText(SIN_APLICAR)).toBeNull())
    expect(botonAplicar().className).not.toContain('bg-cambio-pendiente')
  })

  test('cambiar un filtro y volver a dejarlo igual no lo muestra', async () => {
    await montar()

    fireEvent.change(nativo('modulo'), { target: { value: 'REVISION' } })
    expect(screen.getByText(SIN_APLICAR)).toBeTruthy()
    fireEvent.change(nativo('modulo'), { target: { value: 'todos' } })
    expect(screen.queryByText(SIN_APLICAR)).toBeNull()
  })
})

test('el usuario se elige con búsqueda y viaja como usuarioId', async () => {
  const router = await montar()

  fireEvent.click(screen.getByRole('combobox', { name: 'Usuario' }))
  fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o usuario…'), { target: { value: 'pedro' } })
  fireEvent.click(within(screen.getByRole('listbox')).getByText('Pedro Gómez (inactivo)'))
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

  await waitFor(() => expect(busqueda(router).usuario).toBe('7'))
  await waitFor(() => expect(ultimoPedido().usuarioId).toBe(7))
  expect(screen.getByText('Usuario: Pedro Gómez')).toBeTruthy()
})

test('las acciones y los elementos van por su nombre en español, no por el código', async () => {
  obtenerOpcionesBitacora.mockResolvedValue({
    ...OPCIONES,
    acciones: ['ACTUALIZAR', 'AUTORIZAR', 'CREAR'],
    entidades: ['usuario', 'alerta', 'cierre_periodo'],
  })
  await montar()
  const valores = (nombre) =>
    [...nativo(nombre).options].map((o) => o.value).filter((valor) => valor !== '' && valor !== 'todos')

  // Autorización, Creación, Edición; Alerta, Cierre del mes, Usuario.
  await waitFor(() => expect(valores('accion')).toEqual(['AUTORIZAR', 'CREAR', 'ACTUALIZAR']))
  expect(valores('entidad')).toEqual(['alerta', 'cierre_periodo', 'usuario'])
})

test('desde posterior a hasta no se aplica', async () => {
  const router = await montar()

  fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-11-20' } })
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }))

  expect(screen.getByRole('alert').textContent).toBe('La fecha desde no puede ser posterior a la fecha hasta.')
  expect(busqueda(router)).toEqual({})
})

test('quitar un chip lo saca de la URL; quitar la fecha deja todo el historial', async () => {
  const router = await montar('/administracion/auditoria?desde=2026-10-01&hasta=2026-10-31&accion=CAMBIO_ESTADO&entidadId=255')

  fireEvent.click(screen.getByRole('button', { name: 'Quitar Elemento: #255' }))
  await waitFor(() =>
    expect(busqueda(router)).toEqual({ desde: '2026-10-01', hasta: '2026-10-31', accion: 'CAMBIO_ESTADO' }),
  )

  fireEvent.click(screen.getByRole('button', { name: 'Quitar Fecha: 01/10/2026 a 31/10/2026' }))
  await waitFor(() => expect(busqueda(router)).toEqual({ desde: '', hasta: '', accion: 'CAMBIO_ESTADO' }))
  await waitFor(() =>
    expect(ultimoPedido()).toMatchObject({ desde: undefined, hasta: undefined, accion: 'CAMBIO_ESTADO' }),
  )
  expect(await screen.findByText('2 registros en todo el historial · del más reciente al más antiguo')).toBeTruthy()
})

test('los accesos rápidos y «Limpiar» cambian la URL de inmediato', async () => {
  const router = await montar('/administracion/auditoria?desde=&hasta=&usuario=2&pagina=3')

  fireEvent.click(screen.getByRole('button', { name: 'Hoy' }))
  await waitFor(() => expect(busqueda(router)).toEqual({ desde: HOY, hasta: HOY, usuario: '2' }))

  fireEvent.click(screen.getByRole('button', { name: 'Últimos 7 días' }))
  await waitFor(() => expect(busqueda(router)).toEqual({ desde: '2026-11-10', hasta: HOY, usuario: '2' }))

  fireEvent.click(screen.getByRole('button', { name: 'Solo rectificaciones' }))
  await waitFor(() => expect(busqueda(router).modulo).toBe('RECTIFICACION'))

  fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }))
  await waitFor(() => expect(busqueda(router)).toEqual({}))
  await waitFor(() => expect(ultimoPedido()).toMatchObject({ desde: DESDE_DEFECTO, hasta: HOY, usuarioId: undefined }))
})

test('cada registro se expande a sus cambios por campo, con la IP y el agente', async () => {
  await montar()

  fireEvent.click(within(fila('María López')).getByRole('button', { name: /Ver cambios/ }))
  const detalle = within(document.getElementById('detalle-1'))
  expect(detalle.getByText('estado')).toBeTruthy()
  expect(detalle.getByText('EN_REVISION')).toBeTruthy()
  expect(detalle.getByText('APROBADO')).toBeTruthy()
  expect(detalle.getByText('10.0.0.21')).toBeTruthy()
  expect(detalle.getByText('Mozilla/5.0')).toBeTruthy()

  fireEvent.click(within(fila('María López')).getByRole('button', { name: /Ocultar cambios/ }))
  expect(document.getElementById('detalle-1')).toBeNull()

  fireEvent.click(within(fila('Intento: cs1206')).getByRole('button', { name: /Ver detalle/ }))
  const sinValores = within(document.getElementById('detalle-2'))
  expect(sinValores.getByText('Este registro no guarda valores anteriores ni nuevos.')).toBeTruthy()
  expect(sinValores.getByText('203.0.113.20')).toBeTruthy()
})

test('cambiar las filas por página vuelve a la página 1', async () => {
  const router = await montar('/administracion/auditoria?desde=&hasta=&pagina=2')

  fireEvent.change(nativo('porPagina'), { target: { value: '20' } })

  await waitFor(() => expect(busqueda(router)).toEqual({ desde: '', hasta: '', porPagina: '20' }))
  await waitFor(() => expect(ultimoPedido()).toMatchObject({ pagina: 1, porPagina: 20 }))
})

describe('exportar', () => {
  const descargados = []

  beforeEach(() => {
    descargados.length = 0
    URL.createObjectURL = vi.fn(() => 'blob:bitacora')
    URL.revokeObjectURL = vi.fn()
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function guardar() {
      descargados.push(this.download)
    })
  })

  test('descarga el Excel con los filtros aplicados', async () => {
    const blob = new Blob(['xlsx'])
    descargarBitacoraExcel.mockResolvedValue({ blob, nombre: 'bitacora-2026-11-16.xlsx' })
    await montar('/administracion/auditoria?desde=2026-10-01&hasta=&modulo=USUARIOS&pagina=2')

    fireEvent.click(screen.getByRole('button', { name: 'Exportar resultados' }))

    await waitFor(() => expect(descargados).toEqual(['bitacora-2026-11-16.xlsx']))
    expect(descargarBitacoraExcel).toHaveBeenCalledWith({
      desde: '2026-10-01',
      hasta: undefined,
      usuarioId: undefined,
      modulo: 'USUARIOS',
      accion: undefined,
      entidad: undefined,
      entidadId: undefined,
    })
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
  })

  test('con más de 10,000 filas muestra el mensaje de la API', async () => {
    descargarBitacoraExcel.mockRejectedValue(
      new ErrorApi(
        422,
        'DEMASIADAS_FILAS',
        'El resultado tiene 27,901 registros; acote los filtros para exportar 10,000 o menos.',
      ),
    )
    await montar()

    fireEvent.click(screen.getByRole('button', { name: 'Exportar resultados' }))

    expect(await screen.findByText(/El resultado tiene 27,901 registros/)).toBeTruthy()
    expect(descargados).toEqual([])
    expect(screen.getByRole('button', { name: 'Exportar resultados' }).disabled).toBe(false)
  })
})

test('sin resultados avisa que no hay registros', async () => {
  listarBitacora.mockResolvedValue(respuesta([], { resumen: { usuarios: 0, rectificaciones: 0, accesosFallidos: 0 } }))
  await montar()

  expect(screen.getByText('No hay registros con estos filtros.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('si la lista falla, se puede reintentar', async () => {
  listarBitacora.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))
  await montar()

  expect(screen.getByText(/No se pudo cargar la bitácora/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByText('María López')).toBeTruthy()
  expect(listarBitacora).toHaveBeenCalledTimes(2)
})

test('si las opciones fallan, los filtros siguen y se pueden reintentar', async () => {
  obtenerOpcionesBitacora.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))
  await montar()

  expect(await screen.findByText(/No se pudieron cargar las opciones de los filtros/)).toBeTruthy()
  expect(screen.getByText('María López')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(obtenerOpcionesBitacora).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText(/No se pudieron cargar las opciones/)).toBeNull())
})
