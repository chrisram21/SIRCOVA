import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { atenderAlerta, listarAlertas } from '@/api/alertas.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaAlertas, { enlaceDe } from './PaginaAlertas.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/alertas.js', () => ({ listarAlertas: vi.fn(), atenderAlerta: vi.fn() }))

const alerta = (id, datos = {}) => ({
  id,
  tipo: 'REPORTE_PENDIENTE',
  severidad: 'CRITICA',
  titulo: 'Reporte sin enviar',
  mensaje: `Mensaje de la alerta ${id}.`,
  estado: 'ACTIVA',
  generadaEn: '2026-11-06T06:00:00.000Z',
  periodo: { id: 322, anio: 2026, mes: 10 },
  municipio: null,
  establecimiento: null,
  reporteId: null,
  indicadorCodigo: null,
  atendidaPor: null,
  atendidaEn: null,
  ...datos,
})

const ALERTAS = [
  alerta(1, { mensaje: 'CS-1209 no envió el reporte de octubre.' }),
  alerta(2, {
    tipo: 'PROCESO',
    severidad: 'ADVERTENCIA',
    titulo: 'Reporte sin revisar',
    mensaje: 'El reporte de CS-1219 lleva 4 días enviado.',
    reporteId: 540,
  }),
  alerta(3, {
    tipo: 'CALIDAD',
    severidad: 'INFO',
    titulo: 'Cobertura mayor al 100 %',
    mensaje: 'Tacaná pasó del 100 %.',
    estado: 'ATENDIDA',
    atendidaPor: { usuarioId: 4, nombre: 'María López' },
    atendidaEn: '2026-11-16T15:20:00.000Z',
  }),
]

const respuesta = (elementos = ALERTAS, extra = {}) => ({
  elementos,
  total: elementos.length,
  pagina: 1,
  porPagina: 20,
  activas: { total: 12, porSeveridad: { CRITICA: 9, ADVERTENCIA: 3, INFO: 0 } },
  ...extra,
})

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'estadigrafa',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

const PERMISOS_REVISOR = ['ALERTA_CONSULTAR', 'ALERTA_ATENDER', 'REPORTE_REVISAR']

async function montar({ url = '/alertas', permisos = PERMISOS_REVISOR } = {}) {
  guardarSesion(crearSesion(permisos))
  const router = createMemoryRouter(
    [
      {
        path: '/alertas',
        element: (
          <ProveedorSesion>
            <PaginaAlertas />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(screen.queryByLabelText('Cargando alertas')).toBeNull())
  return router
}

const fila = (texto) => screen.getByText(texto).closest('tr')
const nativo = (nombre) => document.querySelector(`select[name="${nombre}"]`)

beforeEach(() => {
  vi.clearAllMocks()
  listarAlertas.mockResolvedValue(respuesta())
})

test('lista cada alerta con su severidad, mensaje, periodo y estado, y el desglose de activas', async () => {
  await montar()

  expect(listarAlertas).toHaveBeenCalledWith({ estado: 'ACTIVA', pagina: 1, porPagina: 20 })
  expect(screen.getByText('Activas: 9 críticas, 3 advertencias.')).toBeTruthy()
  expect(screen.getAllByRole('row')).toHaveLength(ALERTAS.length + 1)
  const primera = within(fila('CS-1209 no envió el reporte de octubre.'))
  expect(primera.getByText('Crítica')).toBeTruthy()
  expect(primera.getByText('Reporte sin enviar')).toBeTruthy()
  expect(primera.getByText('Octubre de 2026')).toBeTruthy()
  expect(primera.getByText('Activa')).toBeTruthy()
  expect(within(fila('El reporte de CS-1219 lleva 4 días enviado.')).getByText('Advertencia')).toBeTruthy()
  const atendida = within(fila('Tacaná pasó del 100 %.'))
  expect(atendida.getByText('Informativa')).toBeTruthy()
  expect(atendida.getByText(/^Atendida por María López el \d{2}\/\d{2}\/2026 \d{2}:\d{2}$/)).toBeTruthy()
  expect(atendida.queryByRole('button', { name: 'Marcar como atendida' })).toBeNull()
})

test('los filtros van en la URL y en la consulta, y cambiar uno vuelve a la página 1', async () => {
  const router = await montar({ url: '/alertas?tipo=PROCESO&pagina=2' })
  expect(listarAlertas).toHaveBeenLastCalledWith({ estado: 'ACTIVA', tipo: 'PROCESO', pagina: 2, porPagina: 20 })

  fireEvent.change(nativo('severidad'), { target: { value: 'CRITICA' } })
  await waitFor(() => expect(router.state.location.search).toBe('?tipo=PROCESO&severidad=CRITICA'))
  await waitFor(() =>
    expect(listarAlertas).toHaveBeenLastCalledWith({
      estado: 'ACTIVA',
      tipo: 'PROCESO',
      severidad: 'CRITICA',
      pagina: 1,
      porPagina: 20,
    }),
  )

  fireEvent.change(nativo('estado'), { target: { value: 'TODAS' } })
  await waitFor(() => expect(router.state.location.search).toBe('?estado=TODAS&tipo=PROCESO&severidad=CRITICA'))

  fireEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }))
  await waitFor(() => expect(router.state.location.search).toBe(''))
})

test('un filtro inválido en la URL se ignora', async () => {
  await montar({ url: '/alertas?estado=PENDIENTE&tipo=OTRO&severidad=ALTA' })
  expect(listarAlertas).toHaveBeenCalledWith({ estado: 'ACTIVA', pagina: 1, porPagina: 20 })
  expect(screen.queryByRole('button', { name: 'Limpiar filtros' })).toBeNull()
})

test('enlaza al reporte, al registro o a Indicadores según los datos y los permisos', () => {
  const todos = () => true
  const solo = (...codigos) => (codigo) => codigos.includes(codigo)
  const conIndicador = alerta(9, {
    indicadorCodigo: 'AVANCE_HEXA3',
    periodo: { id: 320, anio: 2026, mes: 8 },
    municipio: { id: 27, nombre: 'Tacaná' },
  })

  expect(enlaceDe(alerta(1, { reporteId: 540 }), todos)).toBe('/revision/reportes/540')
  expect(enlaceDe(alerta(1, { reporteId: 540 }), solo('REPORTE_CREAR'))).toBe('/registro?periodo=322')
  expect(enlaceDe(alerta(1), solo('REPORTE_REVISAR'))).toBeNull()
  expect(enlaceDe(conIndicador, solo('INDICADOR_CONSULTAR'))).toBe(
    '/indicadores?anio=2026&mes=8&indicador=AVANCE_HEXA3&municipios=27',
  )
  expect(enlaceDe(conIndicador, solo('REPORTE_REVISAR'))).toBeNull()
  expect(enlaceDe(alerta(1, { periodo: null }), todos)).toBeNull()
})

test('en la lista, «Ver» solo aparece donde hay a dónde ir', async () => {
  await montar()

  const ver = within(fila('El reporte de CS-1219 lleva 4 días enviado.')).getByRole('link', {
    name: 'Ver «Reporte sin revisar»',
  })
  expect(ver.getAttribute('href')).toBe('/revision/reportes/540')
  expect(within(fila('CS-1209 no envió el reporte de octubre.')).queryByRole('link')).toBeNull()
})

test('atender pide confirmación, guarda y vuelve a leer la lista', async () => {
  atenderAlerta.mockResolvedValue({ ...ALERTAS[0], estado: 'ATENDIDA' })
  await montar()

  fireEvent.click(within(fila('CS-1209 no envió el reporte de octubre.')).getByRole('button', {
    name: 'Marcar como atendida',
  }))
  const dialogo = await screen.findByRole('alertdialog')
  expect(within(dialogo).getByText('La alerta quedará como atendida a su nombre y no se puede deshacer.')).toBeTruthy()
  expect(atenderAlerta).not.toHaveBeenCalled()

  listarAlertas.mockResolvedValue(respuesta(ALERTAS.slice(1)))
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como atendida' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(atenderAlerta).toHaveBeenCalledWith(1)
  expect(toast.success).toHaveBeenCalledWith('Alerta marcada como atendida.')
  await waitFor(() => expect(screen.queryByText('CS-1209 no envió el reporte de octubre.')).toBeNull())
  expect(listarAlertas).toHaveBeenCalledTimes(2)
})

test('cancelar no atiende la alerta', async () => {
  await montar()

  fireEvent.click(within(fila('CS-1209 no envió el reporte de octubre.')).getByRole('button', {
    name: 'Marcar como atendida',
  }))
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(atenderAlerta).not.toHaveBeenCalled()
})

test('sin ALERTA_ATENDER no hay botón para atender', async () => {
  await montar({ permisos: ['ALERTA_CONSULTAR', 'REPORTE_REVISAR'] })
  expect(screen.queryByRole('button', { name: 'Marcar como atendida' })).toBeNull()
})

test('un 409 cierra el diálogo, muestra su mensaje y recarga la lista', async () => {
  atenderAlerta.mockRejectedValue(new ErrorApi(409, 'ALERTA_NO_ACTIVA', 'La alerta ya no está activa.'))
  await montar()

  fireEvent.click(within(fila('CS-1209 no envió el reporte de octubre.')).getByRole('button', {
    name: 'Marcar como atendida',
  }))
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Marcar como atendida' }))

  expect(await screen.findByText('La alerta ya no está activa.')).toBeTruthy()
  expect(screen.queryByRole('alertdialog')).toBeNull()
  await waitFor(() => expect(listarAlertas).toHaveBeenCalledTimes(2))
})

test('otro error se muestra en el diálogo, que sigue abierto', async () => {
  atenderAlerta.mockRejectedValue(new ErrorApi(403, 'SIN_PERMISO', 'No tiene permiso para esta acción.'))
  await montar()

  fireEvent.click(within(fila('CS-1209 no envió el reporte de octubre.')).getByRole('button', {
    name: 'Marcar como atendida',
  }))
  const dialogo = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Marcar como atendida' }))

  expect(await within(dialogo).findByText('No tiene permiso para esta acción.')).toBeTruthy()
  expect(screen.getByRole('alertdialog')).toBeTruthy()
})

test('sin alertas activas lo dice, y con filtros, otro mensaje', async () => {
  const sinActivas = { total: 0, porSeveridad: { CRITICA: 0, ADVERTENCIA: 0, INFO: 0 } }
  listarAlertas.mockResolvedValue(respuesta([], { activas: sinActivas }))
  await montar()
  expect(screen.getAllByText(/No (hay|tiene) alertas activas\./)).toHaveLength(2)
})

test('con filtros y sin resultados dice que no hay alertas con estos filtros', async () => {
  listarAlertas.mockResolvedValue(respuesta([]))
  await montar({ url: '/alertas?estado=DESCARTADA' })
  expect(screen.getByText('No hay alertas con estos filtros.')).toBeTruthy()
})

test('si falla la carga muestra el error y reintenta', async () => {
  listarAlertas.mockRejectedValueOnce(new Error('Sin conexión.'))
  await montar()

  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByText('CS-1209 no envió el reporte de octubre.')).toBeTruthy()
  expect(listarAlertas).toHaveBeenCalledTimes(2)
})
