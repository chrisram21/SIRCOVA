import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { listarReportes, obtenerFormulario, obtenerReporte } from '@/api/produccion.js'
import { listarRectificaciones, solicitarRectificacion } from '@/api/rectificaciones.js'
import PaginaNuevaRectificacion from './PaginaNuevaRectificacion.jsx'

vi.mock('@/api/catalogos.js', () => ({ listarPeriodos: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({ listarReportes: vi.fn(), obtenerReporte: vi.fn(), obtenerFormulario: vi.fn() }))
vi.mock('@/api/rectificaciones.js', () => ({ listarRectificaciones: vi.fn(), solicitarRectificacion: vi.fn() }))

const ESTABLECIMIENTO = { id: 9, codigo: 'CS-1209', nombre: 'Centro de Salud Tajumulco' }
const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const HEXAVALENTE = {
  id: 51,
  vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
  esquema: { id: 'e-hexa', version: 2 },
  base: true,
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
  ],
  dimensiones: [{ codigo: 'grupo_edad', nombre: 'Grupo de edad', etiqueta: null, valores: [valor('MENOR_1', '< 1 año', 1)] }],
}
const REPORTE = {
  id: 412,
  establecimiento: ESTABLECIMIENTO,
  periodo: { id: 8, anio: 2026, mes: 8, estado: 'CERRADO', fechaLimiteEnvio: '2026-09-10' },
  estado: 'CERRADO',
  numeroRectificacion: 0,
  versionFila: 14,
  revisor: null,
  creadoEn: '2026-08-25T15:04:00.000Z',
  actualizadoEn: '2026-09-20T15:04:00.000Z',
  vacunas: [HEXAVALENTE],
}
const FORMULARIO = {
  reporteId: 412,
  versionFila: 14,
  editable: false,
  municipioPropio: { id: 9, nombre: 'Tajumulco' },
  municipios: [{ id: 31, codigoIne: '9999', nombre: 'Migrantes / fuera de San Marcos' }],
  vacunas: [
    {
      vacunaId: 3,
      base: true,
      esquema: {
        id: 'e-hexa',
        version: 2,
        estado: 'HISTORICO',
        vigencia: { desde: '2026-01-01', hasta: null },
        procedencia: { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true },
        dosis: [
          { codigo: 'D1', etiqueta: null, desagregacion: null },
          { codigo: 'D2', etiqueta: null, desagregacion: null },
        ],
        desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1'], etiqueta: null }],
        secciones: [{ codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] }],
        camposAdicionales: [],
        reglas: [],
      },
      procedenciasPermitidas: [31],
      celdas: [
        {
          dosisCodigo: 'D1',
          municipioProcedenciaId: 9,
          dimensiones: { grupo_edad: 'MENOR_1' },
          claveCombinacion: 'grupo_edad=MENOR_1',
          cantidad: 78,
        },
      ],
      datosAdicionales: null,
      totalDeclarado: 78,
    },
  ],
}
const SOLICITUD = { id: 77 }

const reporteCerrado = (id, mes, nombre) => ({
  id,
  establecimiento: { ...ESTABLECIMIENTO, nombre },
  periodo: { id: mes, anio: 2026, mes, estado: 'CERRADO' },
  estado: 'CERRADO',
  actualizadoEn: '2026-09-20T15:04:00.000Z',
  estadoDesde: '2026-09-20T15:04:00.000Z',
  correccion: null,
})
const pagina = (elementos) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 20 })

function montar(url) {
  const router = createMemoryRouter(
    [
      { path: '/rectificaciones/nueva', element: <PaginaNuevaRectificacion /> },
      { path: '/rectificaciones/:id', element: <p>Detalle de la solicitud</p> },
      { path: '/rectificaciones', element: <p>Lista de solicitudes</p> },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

async function abrirReporte() {
  const router = montar('/rectificaciones/nueva?reporte=412')
  await screen.findByText('Centro de Salud Tajumulco · Agosto de 2026')
  return router
}

const casilla = (llave) => document.querySelector(`[data-celda="${llave}"]`)
const D1 = 'D1|grupo_edad=MENOR_1'
const D2 = 'D2|grupo_edad=MENOR_1'
const escribir = (llave, texto) => fireEvent.change(casilla(llave), { target: { value: texto } })
const justificar = (texto) => fireEvent.change(screen.getByLabelText('Justificación'), { target: { value: texto } })
const filasDe = (nombre) =>
  within(screen.getByRole('table', { name: nombre }))
    .getAllByRole('row')
    .slice(1)
    .map((fila) => [...fila.querySelectorAll('td')].map((td) => td.textContent))

beforeEach(() => {
  vi.clearAllMocks()
  listarPeriodos.mockResolvedValue([{ id: 8, anio: 2026, mes: 8 }])
  listarReportes.mockResolvedValue(
    pagina([reporteCerrado(412, 8, 'Centro de Salud Tajumulco'), reporteCerrado(190, 7, 'Puesto de Salud Ixchiguán')]),
  )
  listarRectificaciones.mockResolvedValue(pagina([{ id: 3, reporte: { id: 190 }, estado: 'PENDIENTE' }]))
  obtenerReporte.mockResolvedValue(REPORTE)
  obtenerFormulario.mockResolvedValue(FORMULARIO)
  solicitarRectificacion.mockResolvedValue(SOLICITUD)
})

describe('paso 1: elegir el reporte', () => {
  test('lista los reportes cerrados y, si uno tiene una solicitud pendiente, lleva a ella', async () => {
    montar('/rectificaciones/nueva')

    const solicitar = await screen.findByRole('link', { name: 'Solicitar la rectificación de Agosto de 2026, Centro de Salud Tajumulco' })
    expect(solicitar.getAttribute('href')).toBe('/rectificaciones/nueva?reporte=412')
    const ver = screen.getByRole('link', { name: 'Ver la solicitud pendiente de Julio de 2026, Puesto de Salud Ixchiguán' })
    expect(ver.getAttribute('href')).toBe('/rectificaciones/3')
    expect(listarReportes).toHaveBeenCalledWith({ estado: 'CERRADO', anio: undefined, pagina: 1, porPagina: 20 })
    expect(listarRectificaciones).toHaveBeenCalledWith({ estado: 'PENDIENTE', porPagina: 100 })
  })

  test('el año va en la URL y en la consulta', async () => {
    const router = montar('/rectificaciones/nueva')
    await screen.findByText('Agosto de 2026')

    fireEvent.change(document.querySelector('select[name="anio"]'), { target: { value: '2026' } })
    await waitFor(() => expect(router.state.location.search).toBe('?anio=2026'))
    await waitFor(() => expect(listarReportes).toHaveBeenLastCalledWith({ estado: 'CERRADO', anio: 2026, pagina: 1, porPagina: 20 }))
  })

  test('sin reportes cerrados lo dice', async () => {
    listarReportes.mockResolvedValue(pagina([]))
    montar('/rectificaciones/nueva')
    expect(await screen.findByText('No hay reportes cerrados.')).toBeTruthy()
  })
})

describe('paso 2: justificación y cantidades', () => {
  test('carga los valores actuales; una casilla cambiada se marca y se lista, y al volver a su valor se quita', async () => {
    await abrirReporte()

    expect(obtenerReporte).toHaveBeenCalledWith(412)
    expect(casilla(D1).value).toBe('78')
    expect(casilla(D1).disabled).toBe(false)
    expect(screen.getByText('Todavía no cambió ninguna cantidad.')).toBeTruthy()

    escribir(D1, '80')
    escribir(D2, '5')
    expect(casilla(D1).getAttribute('data-cambiada')).toBe('true')
    expect(screen.getByRole('heading', { name: 'Cambios (2)' })).toBeTruthy()
    expect(filasDe('Cambios')).toEqual([
      ['Hexavalente', '1.ª dosis', 'Tajumulco', '< 1 año', '78', '80', '+2'],
      ['Hexavalente', '2.ª dosis', 'Tajumulco', '< 1 año', 'Vacía', '5', '+5'],
    ])

    escribir(D1, '78')
    expect(casilla(D1).getAttribute('data-cambiada')).toBeNull()
    expect(screen.getByRole('heading', { name: 'Cambios (1)' })).toBeTruthy()
  })

  test('un 0 en una casilla vacía no es un cambio', async () => {
    await abrirReporte()
    escribir(D2, '0')
    expect(screen.getByRole('heading', { name: 'Cambios (0)' })).toBeTruthy()
  })

  test('sin justificación ni cambios muestra los errores, pone el foco en el primero y no llama a la API', async () => {
    await abrirReporte()

    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.getByText('Escriba la justificación.')).toBeTruthy()
    expect(screen.getByText('Cambie al menos una cantidad.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Justificación')))

    justificar('Faltó sumar la jornada.')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.queryByText('Escriba la justificación.')).toBeNull()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('alert')))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(solicitarRectificacion).not.toHaveBeenCalled()
  })

  test('vaciar una casilla que tenía cantidad pide escribir 0', async () => {
    await abrirReporte()
    justificar('Faltó sumar la jornada.')
    escribir(D1, '')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    expect(screen.getByText('Hexavalente · 1.ª dosis · Tajumulco · < 1 año: Escriba 0 para dejarla en cero.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(casilla(D1)))
    expect(solicitarRectificacion).not.toHaveBeenCalled()
  })

  test('al confirmar manda solo las celdas cambiadas, avisa y abre la solicitud', async () => {
    const router = await abrirReporte()
    justificar('  Faltó sumar la jornada del 28.  ')
    escribir(D1, '80')

    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    const dialogo = within(await screen.findByRole('alertdialog'))
    expect(dialogo.getByText(/Se pide cambiar 1 celda del reporte de Centro de Salud Tajumulco/)).toBeTruthy()
    fireEvent.click(dialogo.getByRole('button', { name: 'Enviar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/rectificaciones/77'))
    expect(solicitarRectificacion).toHaveBeenCalledTimes(1)
    expect(solicitarRectificacion).toHaveBeenCalledWith(412, {
      motivo: 'Faltó sumar la jornada del 28.',
      versionFila: 14,
      cambios: [{ vacunaId: 3, dosisCodigo: 'D1', municipioProcedenciaId: 9, dimensiones: { grupo_edad: 'MENOR_1' }, cantidadNueva: 80 }],
    })
    expect(toast.success).toHaveBeenCalledWith('Solicitud de rectificación enviada.')
  })

  test('un 409 se muestra en el diálogo con «Recargar», que vuelve a cargar el reporte', async () => {
    solicitarRectificacion.mockRejectedValueOnce(
      new ErrorApi(409, 'RECTIFICACION_PENDIENTE', 'El reporte ya tiene una solicitud de rectificación pendiente.'),
    )
    await abrirReporte()
    justificar('Faltó sumar la jornada.')
    escribir(D1, '80')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    const dialogo = within(await screen.findByRole('alertdialog'))
    fireEvent.click(dialogo.getByRole('button', { name: 'Enviar' }))

    expect(await dialogo.findByText('El reporte ya tiene una solicitud de rectificación pendiente.')).toBeTruthy()
    fireEvent.click(dialogo.getByRole('button', { name: 'Recargar' }))
    await waitFor(() => expect(obtenerReporte).toHaveBeenCalledTimes(2))
    await screen.findByText('Centro de Salud Tajumulco · Agosto de 2026')
    expect(casilla(D1).value).toBe('78')
  })

  test('otro error se muestra sin «Recargar» y el diálogo sigue abierto', async () => {
    solicitarRectificacion.mockRejectedValueOnce(new ErrorApi(422, 'CELDA_INVALIDA', 'La celda no es parte del formulario.'))
    await abrirReporte()
    justificar('Faltó sumar la jornada.')
    escribir(D1, '80')
    fireEvent.click(screen.getByRole('button', { name: 'Enviar solicitud' }))
    const dialogo = within(await screen.findByRole('alertdialog'))
    fireEvent.click(dialogo.getByRole('button', { name: 'Enviar' }))

    expect(await dialogo.findByText('La celda no es parte del formulario.')).toBeTruthy()
    expect(dialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
    expect(dialogo.getByRole('button', { name: 'Enviar' }).disabled).toBe(false)
  })

  test('un reporte que no está cerrado no se puede rectificar', async () => {
    obtenerReporte.mockResolvedValue({ ...REPORTE, estado: 'APROBADO' })
    montar('/rectificaciones/nueva?reporte=412')
    expect(await screen.findByText('Este reporte no está cerrado: solo se rectifican reportes cerrados.')).toBeTruthy()
  })
})
