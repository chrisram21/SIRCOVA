import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarVacunas } from '@/api/catalogos.js'
import { crearRegla, publicarVersionRegla } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PanelRegla from './PanelRegla.jsx'

vi.mock('@/api/catalogos.js', () => ({ listarVacunas: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({ crearRegla: vi.fn(), publicarVersionRegla: vi.fn() }))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const VACUNAS = [
  { id: 1, codigo: 'BCG', nombre: 'BCG' },
  { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' },
]
const RANGO_NACIONAL = {
  id: 'r1',
  codigo: 'RANGO_DOSIS',
  version: 1,
  nombre: 'Rango mensual',
  descripcion: null,
  tipo: 'RANGO',
  ambito: 'DETALLE',
  severidad: 'ADVERTENCIA',
  // VIEJA ya no está entre las vacunas activas.
  vacunas: ['VIEJA', 'BCG'],
  parametros: { minimo: 0, maximo: 500 },
  mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango ({minimo} a {maximo}).',
  territorio: NACIONAL,
  estado: 'VIGENTE',
}
const FILA_NACIONAL = {
  codigo: 'RANGO_DOSIS',
  tipo: 'RANGO',
  aplica: RANGO_NACIONAL,
  ultimaDdriss: null,
  vigenteNacional: { version: 1 },
}

const props = { alGuardar: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }

function montar(modo, fila) {
  const router = createMemoryRouter([{ path: '/', element: <PanelRegla modo={modo} fila={fila} {...props} /> }])
  render(<RouterProvider router={router} />)
  return within(screen.getByRole('dialog'))
}

const select = () => document.querySelector('select[name="tipo"]')
const escribir = (panel, etiqueta, valor) =>
  fireEvent.change(panel.getByLabelText(etiqueta), { target: { value: valor } })

beforeEach(() => {
  vi.clearAllMocks()
  listarVacunas.mockResolvedValue(VACUNAS)
})

test('«Nueva regla» ofrece los cuatro tipos; elegir uno muestra sus parámetros y precarga su mensaje', async () => {
  const panel = montar('nueva')

  const opciones = [...select().querySelectorAll('option')].map((o) => o.textContent).filter(Boolean)
  expect(opciones).toEqual([
    'Rango de valores',
    'Secuencia de dosis',
    'Variación frente al historial',
    'Total que cuadra',
  ])
  expect(panel.queryByLabelText('Mensaje')).toBeNull()

  fireEvent.change(select(), { target: { value: 'VARIACION_HISTORICA' } })
  expect(panel.getByLabelText('Meses de referencia').value).toBe('1')
  expect(panel.getByLabelText('Variación máxima (%)')).toBeTruthy()
  expect(panel.getByLabelText('Mínimo de dosis para comparar')).toBeTruthy()
  expect(panel.getByLabelText('Mensaje').value).toBe(
    'La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.',
  )
  expect(panel.getByText('Marcadores: {vacuna}, {variacion}, {meses_referencia}, {variacion_max_pct}.')).toBeTruthy()
})

test('al enviar se muestran todos los errores, con el foco en el primero, y no se llama a la API', async () => {
  const panel = montar('nueva')
  fireEvent.change(select(), { target: { value: 'RANGO' } })
  escribir(panel, 'Nombre', 'Rango de BCG')
  escribir(panel, 'Máximo', '0')
  escribir(panel, 'Mensaje', 'La regla {total} de {vacuna} no se cumple.')

  fireEvent.click(panel.getByRole('button', { name: 'Crear regla' }))

  expect(await panel.findByText('El parámetro maximo debe ser un entero entre 1 y 100000.')).toBeTruthy()
  expect(panel.getByText('El mensaje usa el marcador {total}, que no existe en las reglas de tipo RANGO.')).toBeTruthy()
  expect(panel.getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(panel.getByLabelText('Máximo')))
  expect(crearRegla).not.toHaveBeenCalled()
})

test('sin tipo y con «Elegir» sin vacunas, pide las dos cosas', async () => {
  const panel = montar('nueva')
  fireEvent.click(panel.getByLabelText('Elegir'))
  fireEvent.click(panel.getByRole('button', { name: 'Crear regla' }))

  expect(await panel.findByText('Elija el tipo de regla.')).toBeTruthy()
  expect(panel.getByText('Elija al menos una vacuna, o «Todas».')).toBeTruthy()
})

test('crear una regla manda el tipo, los parámetros como números y las vacunas elegidas en su orden', async () => {
  const creada = { ...RANGO_NACIONAL, codigo: 'RANGO_02' }
  crearRegla.mockResolvedValue(creada)
  const panel = montar('nueva')
  fireEvent.change(select(), { target: { value: 'RANGO' } })
  escribir(panel, 'Nombre', 'Rango de vacunas')
  escribir(panel, 'Máximo', ' 300 ')
  fireEvent.click(panel.getByLabelText('Elegir'))
  fireEvent.click(await panel.findByLabelText('Hexavalente'))
  fireEvent.click(panel.getByLabelText('BCG'))
  fireEvent.click(panel.getByLabelText('Error: impide enviar'))
  escribir(panel, 'Motivo del cambio', 'Control pedido por la DDRISS')

  fireEvent.click(panel.getByRole('button', { name: 'Crear regla' }))

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(creada))
  expect(crearRegla).toHaveBeenCalledWith({
    tipo: 'RANGO',
    nombre: 'Rango de vacunas',
    descripcion: '',
    severidad: 'ERROR',
    vacunas: ['BCG', 'HEXA'],
    parametros: { minimo: 0, maximo: 300 },
    mensaje: '{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).',
    motivoCambio: 'Control pedido por la DDRISS',
  })
})

test('«Nueva versión» de una nacional precarga, avisa el reemplazo y quita las vacunas inactivas', async () => {
  const panel = montar('version', FILA_NACIONAL)

  expect(panel.getByText('Nueva versión de RANGO_DOSIS')).toBeTruthy()
  expect(panel.getByText('Esta versión reemplazará a la versión 1 nacional solo en su DDRISS.')).toBeTruthy()
  expect(await panel.findByText('Se quitaron vacunas inactivas: VIEJA.')).toBeTruthy()
  expect(select()).toBeNull()
  expect(panel.getByLabelText('Nombre').value).toBe('Rango mensual')
  expect(panel.getByLabelText('Máximo').value).toBe('500')
  expect(panel.getByLabelText('Elegir').getAttribute('aria-checked')).toBe('true')
  expect(panel.getByLabelText('BCG').getAttribute('aria-checked')).toBe('true')
  expect(panel.getByLabelText('Hexavalente').getAttribute('aria-checked')).toBe('false')
})

test('publicar una versión manda versionBase y el contenido editado', async () => {
  const publicada = { ...RANGO_NACIONAL, version: 2 }
  publicarVersionRegla.mockResolvedValue(publicada)
  const panel = montar('version', FILA_NACIONAL)
  await panel.findByText('Se quitaron vacunas inactivas: VIEJA.')
  escribir(panel, 'Máximo', '250')
  escribir(panel, 'Motivo del cambio', 'Umbral de San Marcos')

  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(publicada))
  expect(publicarVersionRegla).toHaveBeenCalledWith('RANGO_DOSIS', {
    versionBase: 1,
    nombre: 'Rango mensual',
    descripcion: '',
    severidad: 'ADVERTENCIA',
    vacunas: ['BCG'],
    parametros: { minimo: 0, maximo: 250 },
    mensaje: RANGO_NACIONAL.mensaje,
    motivoCambio: 'Umbral de San Marcos',
  })
})

test('un 409 se muestra con «Recargar»', async () => {
  publicarVersionRegla.mockRejectedValue(
    new ErrorApi(409, 'REGLA_DESACTUALIZADA', 'La regla RANGO_DOSIS cambió mientras la editaba; vuelva a abrirla.'),
  )
  const panel = montar('version', FILA_NACIONAL)
  // El panel no envía hasta tener las vacunas activas.
  await panel.findByText('Se quitaron vacunas inactivas: VIEJA.')
  escribir(panel, 'Motivo del cambio', 'Cambio')
  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  expect(await panel.findByText('La regla RANGO_DOSIS cambió mientras la editaba; vuelva a abrirla.')).toBeTruthy()
  fireEvent.click(panel.getByRole('button', { name: 'Recargar' }))
  expect(props.alRecargar).toHaveBeenCalled()
  expect(props.alGuardar).not.toHaveBeenCalled()
})

test('cerrar con cambios pide confirmación; sin cambios, cierra directo', async () => {
  const panel = montar('version', FILA_NACIONAL)
  await panel.findByText('Se quitaron vacunas inactivas: VIEJA.')

  // Quitar una vacuna inactiva ya es un cambio respecto de la versión base.
  fireEvent.click(panel.getByRole('button', { name: 'Cancelar' }))
  const confirmacion = within(await screen.findByRole('alertdialog'))
  expect(confirmacion.getByText('¿Descartar los cambios?')).toBeTruthy()
  expect(props.alCerrar).not.toHaveBeenCalled()
  fireEvent.click(confirmacion.getByRole('button', { name: 'Descartar' }))
  expect(props.alCerrar).toHaveBeenCalledTimes(1)
})

test('una regla nueva sin cambios se cierra sin preguntar', () => {
  const panel = montar('nueva')
  fireEvent.click(panel.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByRole('alertdialog')).toBeNull()
  expect(props.alCerrar).toHaveBeenCalledTimes(1)
})
