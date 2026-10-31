import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente.js'
import { listarObservaciones, obtenerFormulario, obtenerReporte, obtenerValidacionGuardada } from '@/api/produccion.js'
import { solicitarCorreccion } from '@/api/revision.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaRevisarReporte from './PaginaRevisarReporte.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({
  obtenerReporte: vi.fn(),
  obtenerFormulario: vi.fn(),
  obtenerValidacionGuardada: vi.fn(),
  listarObservaciones: vi.fn(),
}))
vi.mock('@/api/revision.js', () => ({ solicitarCorreccion: vi.fn() }))

const YO = 2
const OTRO = 3
const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const HEXAVALENTE = {
  id: 51,
  vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
  esquema: { id: 'e-hexa', version: 2 },
  base: true,
  dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
  dimensiones: [{ codigo: 'grupo_edad', nombre: 'Grupo de edad', etiqueta: null, valores: [valor('MENOR_1', '< 1 año', 1)] }],
}
const VPH = {
  id: 52,
  vacuna: { id: 5, codigo: 'VPH', nombre: 'VPH' },
  esquema: { id: 'e-vph', version: 1 },
  base: true,
  dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
  dimensiones: [{ codigo: 'sexo', nombre: 'Sexo', etiqueta: null, valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] }],
}
const reporte = (cambios = {}) => ({
  id: 524,
  establecimiento: { id: 9, codigo: 'CS-1209', nombre: 'Centro de Salud Tajumulco' },
  periodo: { id: 10, anio: 2026, mes: 10, estado: 'ABIERTO', fechaLimiteEnvio: '2026-11-10' },
  estado: 'EN_REVISION',
  numeroRectificacion: 0,
  versionFila: 14,
  revisor: { id: YO, nombre: 'Ana Pérez' },
  creadoEn: '2026-10-25T15:04:00.000Z',
  actualizadoEn: '2026-10-30T15:04:00.000Z',
  vacunas: [HEXAVALENTE, VPH],
  ...cambios,
})
const PROCEDENCIA = { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: true }
const esquema = (id, version, desagregacion, secciones) => ({
  id,
  version,
  estado: 'VIGENTE',
  vigencia: { desde: '2026-01-01', hasta: null },
  procedencia: PROCEDENCIA,
  dosis: [{ codigo: 'D1', etiqueta: null, desagregacion: null }],
  desagregacion,
  secciones,
  camposAdicionales: [],
  reglas: [],
})
const FORMULARIO = {
  reporteId: 524,
  versionFila: 14,
  editable: false,
  municipioPropio: { id: 9, nombre: 'Tajumulco' },
  municipios: [{ id: 31, codigoIne: '9999', nombre: 'Migrantes / fuera de San Marcos' }],
  vacunas: [
    {
      vacunaId: 3,
      esquema: esquema('e-hexa', 2, [{ dimension: 'grupo_edad', valores: ['MENOR_1'], etiqueta: null }], [
        { codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1'] },
      ]),
      procedenciasPermitidas: [31],
      celdas: [
        { dosisCodigo: 'D1', municipioProcedenciaId: 9, dimensiones: { grupo_edad: 'MENOR_1' }, claveCombinacion: 'grupo_edad=MENOR_1', cantidad: 78 },
      ],
      datosAdicionales: null,
      totalDeclarado: 78,
    },
    {
      vacunaId: 5,
      esquema: esquema('e-vph', 1, [{ dimension: 'sexo', valores: ['M', 'F'], etiqueta: null }], [
        { codigo: 'GENERAL', titulo: 'VPH', orden: 1, grupoEdad: null, dosis: ['D1'] },
      ]),
      procedenciasPermitidas: [31],
      celdas: [],
      datosAdicionales: null,
      totalDeclarado: null,
    },
  ],
}
const VALIDACION = {
  validadoEn: '2026-10-30T15:00:00.000Z',
  errores: 0,
  advertencias: 1,
  corregidos: 0,
  resultados: [
    {
      id: 41,
      regla: { codigo: 'SECUENCIA_DOSIS_01', version: 1, nombre: 'Secuencia de dosis', tipo: 'SECUENCIA_DOSIS' },
      severidad: 'ADVERTENCIA',
      estado: 'ABIERTO',
      mensaje: 'Hay más segundas dosis que primeras.',
      vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
      dosis: null,
      celdas: [],
      campos: [],
    },
  ],
}
const OBSERVACIONES = [
  {
    id: 2,
    vacuna: null,
    texto: 'Revise el total de octubre.',
    autor: { id: YO, nombre: 'Ana Pérez' },
    creadoEn: '2026-10-20T16:00:00.000Z',
    atendida: false,
    atendidaEn: null,
  },
  {
    id: 3,
    vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
    texto: 'D1 muy alto.',
    autor: { id: YO, nombre: 'Ana Pérez' },
    creadoEn: '2026-10-20T16:00:00.000Z',
    atendida: false,
    atendidaEn: null,
  },
]

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: String(YO), exp })}.firma`,
    usuario: {
      id: YO,
      nombreUsuario: 'estadigrafa',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

const PERMISOS = ['REPORTE_REVISAR', 'REPORTE_CONSULTAR', 'REPORTE_SOLICITAR_CORRECCION']

// useBlocker necesita un data router.
async function montar({ permisos = PERMISOS } = {}) {
  guardarSesion(crearSesion(permisos))
  const router = createMemoryRouter(
    [
      { path: '/revision', element: <h1>Bandeja</h1> },
      {
        path: '/revision/reportes/:id',
        element: (
          <ProveedorSesion>
            <PaginaRevisarReporte />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [{ pathname: '/revision/reportes/524', state: { volverA: '?periodo=10&grupo=EN_REVISION' } }] },
  )
  render(<RouterProvider router={router} />)
  await screen.findByRole('heading', { name: 'Reporte de octubre de 2026' })
  return router
}

const general = () => screen.getByLabelText('Observación general')
const escribir = (campo, texto) => fireEvent.change(campo, { target: { value: texto } })
const botonSolicitar = () => screen.getByRole('button', { name: 'Solicitar corrección' })

beforeEach(() => {
  vi.clearAllMocks()
  obtenerReporte.mockResolvedValue(reporte())
  obtenerFormulario.mockResolvedValue(FORMULARIO)
  obtenerValidacionGuardada.mockResolvedValue(VALIDACION)
  listarObservaciones.mockResolvedValue(OBSERVACIONES)
})

test('carga el detalle, las vacunas en solo consulta, la validación guardada y las observaciones anteriores', async () => {
  await montar()

  expect(obtenerReporte).toHaveBeenCalledWith('524')
  expect(screen.getByText('Revisión y cierre · Centro de Salud Tajumulco')).toBeTruthy()
  expect(screen.getByText('Revisor: Ana Pérez (usted)')).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Hexavalente' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'VPH' })).toBeTruthy()
  const casilla = screen.getByDisplayValue('78')
  expect(casilla.disabled).toBe(true)

  const validacion = within(screen.getByRole('list', { name: 'Resultados de la validación' }))
  expect(validacion.getByText('Hay más segundas dosis que primeras.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: /Validar/ })).toBeNull()

  const anteriores = within(screen.getByText('Observaciones anteriores').closest('[data-slot="card"]'))
  expect(anteriores.getByText('Revise el total de octubre.')).toBeTruthy()
  expect(anteriores.getByText('D1 muy alto.')).toBeTruthy()
  expect(anteriores.getAllByRole('listitem')).toHaveLength(2)
})

test('el formulario de observaciones solo aparece al revisor asignado de un reporte en revisión', async () => {
  await montar()
  expect(general()).toBeTruthy()
  expect(screen.getByLabelText('Observación sobre Hexavalente')).toBeTruthy()
  expect(botonSolicitar()).toBeTruthy()
})

test.each([
  ['asignado a otro revisor', { revisor: { id: OTRO, nombre: 'Luis Gómez' } }, PERMISOS, 'Solo el revisor asignado puede devolver este reporte.'],
  ['en otro estado', { estado: 'CORRECCION_SOLICITADA' }, PERMISOS, 'El reporte está en «Corrección solicitada».'],
  ['sin el permiso', {}, ['REPORTE_REVISAR', 'REPORTE_CONSULTAR'], 'Solo el revisor asignado puede devolver este reporte.'],
])('un reporte %s queda en solo consulta', async (_, cambios, permisos, motivo) => {
  obtenerReporte.mockResolvedValue(reporte(cambios))
  await montar({ permisos })

  expect(screen.getByText('Solo consulta')).toBeTruthy()
  expect(screen.getByText(motivo)).toBeTruthy()
  expect(screen.queryByLabelText('Observación general')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Solicitar corrección' })).toBeNull()
})

test('sin observaciones no llama a la API: avisa y lleva el foco a la observación general', async () => {
  await montar()
  escribir(general(), '   ')
  fireEvent.click(botonSolicitar())

  expect(await screen.findByText('Escriba al menos una observación para devolver el reporte.')).toBeTruthy()
  expect(document.activeElement).toBe(general())
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(solicitarCorreccion).not.toHaveBeenCalled()
})

test('el diálogo resume lo escrito, manda solo lo que no está vacío y vuelve a la bandeja', async () => {
  solicitarCorreccion.mockResolvedValue(reporte({ estado: 'CORRECCION_SOLICITADA', versionFila: 15 }))
  const router = await montar()
  escribir(general(), '  Revise la procedencia.  ')
  escribir(screen.getByLabelText('Observación sobre Hexavalente'), 'D1 muy alto frente a septiembre.')
  fireEvent.click(screen.getByRole('tab', { name: /Hexavalente/ }))

  fireEvent.click(botonSolicitar())
  const dialogo = within(await screen.findByRole('alertdialog'))
  const resumen = within(dialogo.getByRole('list', { name: 'Observaciones que se envían' }))
  expect(resumen.getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'GeneralRevise la procedencia.',
    'HexavalenteD1 muy alto frente a septiembre.',
  ])
  fireEvent.click(dialogo.getByRole('button', { name: 'Devolver al establecimiento' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Reporte devuelto al establecimiento.'))
  expect(solicitarCorreccion).toHaveBeenCalledTimes(1)
  expect(solicitarCorreccion).toHaveBeenCalledWith(524, {
    versionFila: 14,
    observaciones: [
      { vacunaId: null, texto: 'Revise la procedencia.' },
      { vacunaId: 3, texto: 'D1 muy alto frente a septiembre.' },
    ],
  })
  await waitFor(() => expect(router.state.location.pathname).toBe('/revision'))
  expect(router.state.location.search).toBe('?periodo=10&grupo=EN_REVISION')
})

test('un 409 muestra el error con «Recargar» y conserva lo escrito', async () => {
  solicitarCorreccion.mockRejectedValue(
    new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'),
  )
  await montar()
  escribir(general(), 'Revise la procedencia.')
  fireEvent.click(botonSolicitar())
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Devolver al establecimiento' }))

  expect(await screen.findByText('El reporte cambió desde que lo abrió; recárguelo.')).toBeTruthy()
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  fireEvent.click(screen.getByRole('button', { name: 'Recargar' }))
  await waitFor(() => expect(obtenerReporte).toHaveBeenCalledTimes(2))
  expect(general().value).toBe('Revise la procedencia.')
  expect(toast.success).not.toHaveBeenCalled()
})

test('con observaciones escritas, salir pide confirmación', async () => {
  const router = await montar()
  escribir(general(), 'Revise la procedencia.')

  fireEvent.click(screen.getByRole('link', { name: 'Volver a la bandeja' }))
  expect(await screen.findByText('Hay cambios sin guardar')).toBeTruthy()
  expect(router.state.location.pathname).toBe('/revision/reportes/524')
})

test('si falla la carga se muestra el error y «Reintentar» vuelve a pedir', async () => {
  obtenerReporte.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  guardarSesion(crearSesion(PERMISOS))
  const router = createMemoryRouter(
    [
      {
        path: '/revision/reportes/:id',
        element: (
          <ProveedorSesion>
            <PaginaRevisarReporte />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: ['/revision/reportes/524'] },
  )
  render(<RouterProvider router={router} />)

  expect(await screen.findByText(/No se pudo cargar el reporte/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('heading', { name: 'Reporte de octubre de 2026' })).toBeTruthy()
  expect(obtenerReporte).toHaveBeenCalledTimes(2)
})
