import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente.js'
import { aprobarRectificacion, obtenerRectificacion, rechazarRectificacion } from '@/api/rectificaciones.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaDetalleRectificacion from './PaginaDetalleRectificacion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/rectificaciones.js', () => ({
  obtenerRectificacion: vi.fn(),
  aprobarRectificacion: vi.fn(),
  rechazarRectificacion: vi.fn(),
}))

const SOLICITUD = {
  id: 7,
  reporte: {
    id: 412,
    establecimiento: { id: 1, codigo: 'CS-1201', nombre: 'Centro de Salud San Marcos' },
    periodo: { id: 8, anio: 2026, mes: 8 },
    estado: 'CERRADO',
  },
  estado: 'PENDIENTE',
  motivo: 'Faltó sumar la jornada del 28 de agosto.',
  solicitadoPor: { id: 13, nombre: 'Marta López' },
  solicitadoEn: '2026-10-31T16:00:00.000Z',
  resueltoPor: null,
  comentarioResolucion: null,
  resueltoEn: null,
  aplicadoEn: null,
  cambios: [
    {
      vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
      dosis: { codigo: 'D3', nombre: '3.ª dosis' },
      municipioProcedencia: { id: 1, nombre: 'San Marcos' },
      dimensiones: [
        { codigo: 'grupo_edad', nombre: 'Grupo de edad', valor: 'MENOR_1', etiqueta: '< 1 año' },
        { codigo: 'sexo', nombre: 'Sexo', valor: 'F', etiqueta: 'Femenino' },
      ],
      claveCombinacion: 'grupo_edad=MENOR_1|sexo=F',
      celdaNueva: false,
      cantidadAnterior: 87,
      cantidadNueva: 93,
    },
    {
      vacuna: { id: 5, codigo: 'BCG', nombre: 'BCG' },
      dosis: { codigo: 'UNICA', nombre: 'Dosis única' },
      municipioProcedencia: { id: 2, nombre: 'San Pedro Sacatepéquez' },
      dimensiones: [],
      claveCombinacion: '',
      celdaNueva: true,
      cantidadAnterior: 0,
      cantidadNueva: 4,
    },
    {
      vacuna: { id: 5, codigo: 'BCG', nombre: 'BCG' },
      dosis: { codigo: 'UNICA', nombre: 'Dosis única' },
      municipioProcedencia: { id: 1, nombre: 'San Marcos' },
      dimensiones: [],
      claveCombinacion: '',
      celdaNueva: false,
      cantidadAnterior: 10,
      cantidadNueva: 7,
    },
  ],
}

const REVISOR = ['RECTIFICACION_CONSULTAR', 'RECTIFICACION_RESOLVER', 'REPORTE_REVISAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '2', exp })}.firma`,
    usuario: {
      id: 2,
      nombreUsuario: 'estadigrafa',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

// Sin permisos se monta sin sesión, como en el SPEC 40.
function montar({ state, permisos } = {}) {
  if (permisos) guardarSesion(crearSesion(permisos))
  const pagina = permisos ? (
    <ProveedorSesion>
      <PaginaDetalleRectificacion />
    </ProveedorSesion>
  ) : (
    <PaginaDetalleRectificacion />
  )
  const router = createMemoryRouter(
    [
      { path: '/rectificaciones/:id', element: pagina },
      { path: '/rectificaciones', element: <p>Lista</p> },
      { path: '/revision/reportes/:id', element: <p>Revisar reporte</p> },
    ],
    { initialEntries: [{ pathname: '/rectificaciones/7', state }] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const filaDe = (texto) => within(screen.getByRole('table', { name: 'Cambios' })).getAllByText(texto)[0].closest('tr')

beforeEach(() => {
  vi.clearAllMocks()
  obtenerRectificacion.mockResolvedValue(SOLICITUD)
})

test('muestra la solicitud con su estado, la justificación y la tabla de cambios', async () => {
  montar()

  expect(await screen.findByRole('heading', { name: 'Rectificación de agosto de 2026' })).toBeTruthy()
  expect(obtenerRectificacion).toHaveBeenCalledWith('7')
  expect(screen.getByText('Centro de Salud San Marcos')).toBeTruthy()
  expect(screen.getByText('Pendiente')).toBeTruthy()
  expect(screen.getByText(/^Marta López · /)).toBeTruthy()
  expect(screen.getByText('Faltó sumar la jornada del 28 de agosto.')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cambios (3)' })).toBeTruthy()
  expect(screen.queryByText('Resuelta por')).toBeNull()

  const hexa = filaDe('Hexavalente')
  expect([...hexa.querySelectorAll('td')].map((celda) => celda.textContent)).toEqual([
    'Hexavalente',
    '3.ª dosis',
    'San Marcos',
    '< 1 año · Femenino',
    '87',
    '93',
    '+6',
  ])
  const filasBcg = within(screen.getByRole('table', { name: 'Cambios' }))
    .getAllByText('BCG')
    .map((celda) => [...celda.closest('tr').querySelectorAll('td')].map((td) => td.textContent))
  expect(filasBcg).toEqual([
    ['BCG', 'Dosis única', 'San Pedro Sacatepéquez', 'Sin desagregación', 'Vacía', '4', '+4'],
    ['BCG', 'Dosis única', 'San Marcos', 'Sin desagregación', '10', '7', '−3'],
  ])
})

test('una solicitud resuelta muestra quién la resolvió y su comentario', async () => {
  obtenerRectificacion.mockResolvedValue({
    ...SOLICITUD,
    estado: 'RECHAZADA',
    resueltoPor: { id: 2, nombre: 'Ana Pérez' },
    resueltoEn: '2026-11-02T15:00:00.000Z',
    comentarioResolucion: 'No coincide con el libro de vacunación.',
  })
  montar()

  expect(await screen.findByText('Rechazada')).toBeTruthy()
  expect(screen.getByText(/^Ana Pérez · /)).toBeTruthy()
  expect(screen.getByText('No coincide con el libro de vacunación.')).toBeTruthy()
})

test('«Volver a las solicitudes» conserva los filtros de la lista', async () => {
  montar({ state: { volverA: '?estado=PENDIENTE' } })

  const volver = await screen.findByRole('link', { name: 'Volver a las solicitudes' })
  expect(volver.getAttribute('href')).toBe('/rectificaciones?estado=PENDIENTE')
})

test('un error muestra el mensaje y «Reintentar» vuelve a pedir la solicitud', async () => {
  obtenerRectificacion.mockRejectedValueOnce(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  montar()

  expect(await screen.findByText(/No se pudo cargar la solicitud: El recurso solicitado no existe\./)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Rectificación de agosto de 2026' })).toBeTruthy())
  expect(obtenerRectificacion).toHaveBeenCalledTimes(2)
})

describe('resolver la solicitud (SPEC 41)', () => {
  const RESUELTA = {
    resueltoPor: { id: 2, nombre: 'Ana Pérez' },
    resueltoEn: '2026-11-02T15:00:00.000Z',
  }
  const APLICADA = {
    ...SOLICITUD,
    ...RESUELTA,
    estado: 'APLICADA',
    aplicadoEn: '2026-11-02T15:00:00.000Z',
    comentarioResolucion: 'Verificado con el libro.',
  }
  const RECHAZADA = { ...SOLICITUD, ...RESUELTA, estado: 'RECHAZADA', comentarioResolucion: 'El libro no muestra esas dosis.' }
  const dialogo = () => within(screen.getByRole('alertdialog'))

  async function abrir(accion) {
    montar({ permisos: REVISOR })
    fireEvent.click(await screen.findByRole('button', { name: accion }))
    return dialogo()
  }

  test('«Aprobar» y «Rechazar» aparecen con RECTIFICACION_RESOLVER y la solicitud PENDIENTE', async () => {
    montar({ permisos: REVISOR })
    expect(await screen.findByRole('button', { name: 'Aprobar' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Rechazar' })).toBeTruthy()
  })

  test('sin RECTIFICACION_RESOLVER no aparecen las acciones', async () => {
    montar({ permisos: ['RECTIFICACION_CONSULTAR', 'RECTIFICACION_SOLICITAR'] })
    await screen.findByRole('heading', { name: 'Rectificación de agosto de 2026' })
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Rechazar' })).toBeNull()
  })

  test('una solicitud ya resuelta no ofrece las acciones', async () => {
    obtenerRectificacion.mockResolvedValue(RECHAZADA)
    montar({ permisos: REVISOR })
    await screen.findByText('Rechazada')
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })

  test('aprobar manda el comentario recortado, avisa y muestra la solicitud aplicada', async () => {
    aprobarRectificacion.mockResolvedValue(APLICADA)
    const enDialogo = await abrir('Aprobar')
    expect(
      enDialogo.getByText(/Se cambiarán 3 celdas del reporte de agosto de 2026 de Centro de Salud San Marcos/),
    ).toBeTruthy()

    fireEvent.change(enDialogo.getByLabelText('Comentario (opcional)'), {
      target: { value: '  Verificado con el libro.  ' },
    })
    fireEvent.click(enDialogo.getByRole('button', { name: 'Aprobar y aplicar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Rectificación aplicada.'))
    expect(aprobarRectificacion).toHaveBeenCalledTimes(1)
    expect(aprobarRectificacion).toHaveBeenCalledWith(7, { comentario: 'Verificado con el libro.' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByText('Aplicada')).toBeTruthy()
    expect(screen.getByText('Verificado con el libro.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Aprobar' })).toBeNull()
  })

  test('aprobar sin comentario no lo manda', async () => {
    aprobarRectificacion.mockResolvedValue(APLICADA)
    const enDialogo = await abrir('Aprobar')
    fireEvent.click(enDialogo.getByRole('button', { name: 'Aprobar y aplicar' }))
    await waitFor(() => expect(aprobarRectificacion).toHaveBeenCalledWith(7, { comentario: undefined }))
  })

  test('rechazar sin motivo muestra el error, pone el foco en el campo y no llama a la API', async () => {
    const enDialogo = await abrir('Rechazar')
    fireEvent.change(enDialogo.getByLabelText('Motivo del rechazo'), { target: { value: '   ' } })
    fireEvent.click(enDialogo.getByRole('button', { name: 'Rechazar' }))

    expect(enDialogo.getByText('Escriba el motivo del rechazo.')).toBeTruthy()
    const campo = enDialogo.getByLabelText('Motivo del rechazo')
    expect(campo.getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(campo)
    expect(rechazarRectificacion).not.toHaveBeenCalled()
  })

  test('rechazar con motivo lo manda recortado, avisa y muestra la solicitud rechazada', async () => {
    rechazarRectificacion.mockResolvedValue(RECHAZADA)
    const enDialogo = await abrir('Rechazar')
    fireEvent.change(enDialogo.getByLabelText('Motivo del rechazo'), {
      target: { value: '  El libro no muestra esas dosis. ' },
    })
    fireEvent.click(enDialogo.getByRole('button', { name: 'Rechazar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Solicitud rechazada.'))
    expect(rechazarRectificacion).toHaveBeenCalledWith(7, { comentario: 'El libro no muestra esas dosis.' })
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.getByText('Rechazada')).toBeTruthy()
  })

  test('un 409 se muestra en el diálogo con «Recargar», que lo cierra y vuelve a pedir la solicitud', async () => {
    aprobarRectificacion.mockRejectedValue(
      new ErrorApi(
        409,
        'RECTIFICACION_DESACTUALIZADA',
        'Los datos del reporte cambiaron desde la solicitud; rechácela y pida otra.',
      ),
    )
    const enDialogo = await abrir('Aprobar')
    fireEvent.click(enDialogo.getByRole('button', { name: 'Aprobar y aplicar' }))

    expect(await enDialogo.findByText(/Los datos del reporte cambiaron desde la solicitud/)).toBeTruthy()
    fireEvent.click(enDialogo.getByRole('button', { name: 'Recargar' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    await waitFor(() => expect(obtenerRectificacion).toHaveBeenCalledTimes(2))
  })

  test('otro error se muestra en el diálogo sin «Recargar»', async () => {
    rechazarRectificacion.mockRejectedValue(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno.'))
    const enDialogo = await abrir('Rechazar')
    fireEvent.change(enDialogo.getByLabelText('Motivo del rechazo'), { target: { value: 'No hay respaldo.' } })
    fireEvent.click(enDialogo.getByRole('button', { name: 'Rechazar' }))

    expect(await enDialogo.findByText('Ocurrió un error interno.')).toBeTruthy()
    expect(enDialogo.queryByRole('button', { name: 'Recargar' })).toBeNull()
    expect(enDialogo.getByRole('button', { name: 'Rechazar' }).hasAttribute('disabled')).toBe(false)
  })

  test('con totales avisa que el total declarado ya no cuadrará', async () => {
    obtenerRectificacion.mockResolvedValue({
      ...SOLICITUD,
      totales: [{ vacunaId: 3, vacuna: 'Hexavalente', totalDeclarado: 201, sumaActual: 201, sumaConCambios: 207 }],
    })
    montar({ permisos: REVISOR })
    expect(
      await screen.findByText('Hexavalente: el total declarado (201) ya no cuadrará con la suma (201 → 207).'),
    ).toBeTruthy()
  })

  test('«Ver reporte» lleva a la revisión del reporte con REPORTE_REVISAR y pide regresar a la solicitud', async () => {
    const router = montar({ permisos: REVISOR, state: { volverA: '?estado=todos' } })
    const enlace = await screen.findByRole('link', { name: 'Ver reporte' })
    expect(enlace.getAttribute('href')).toBe('/revision/reportes/412')

    fireEvent.click(enlace)
    await waitFor(() => expect(router.state.location.pathname).toBe('/revision/reportes/412'))
    expect(router.state.location.state).toEqual({
      regresarA: { ruta: '/rectificaciones/7', texto: 'Volver a la solicitud', estado: { volverA: '?estado=todos' } },
    })
  })

  test('sin REPORTE_REVISAR no aparece «Ver reporte»', async () => {
    montar({ permisos: ['RECTIFICACION_CONSULTAR'] })
    await screen.findByRole('heading', { name: 'Rectificación de agosto de 2026' })
    expect(screen.queryByRole('link', { name: 'Ver reporte' })).toBeNull()
  })
})
