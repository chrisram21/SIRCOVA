import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { crearDimension, listarDimensiones } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'
import PaginaRegistrarDimension from './PaginaRegistrarDimension.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({}))
vi.mock('@/api/configuracion.js', () => ({ listarDimensiones: vi.fn(), crearDimension: vi.fn() }))

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'DIMENSION_CONSULTAR', 'DIMENSION_CREAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

function montar(entrada) {
  guardarSesion(crearSesion(PERMISOS))
  render(
    <MemoryRouter initialEntries={[entrada]}>
      <ProveedorSesion>
        <Routes>
          <Route path="/configuracion" element={<PaginaConfiguracion />} />
          <Route path="/configuracion/dimensiones/nueva" element={<PaginaRegistrarDimension />} />
        </Routes>
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const agregarValor = () => fireEvent.click(screen.getByRole('button', { name: 'Agregar valor' }))
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar dimensión' }))

function llenar() {
  escribir(/^Código\*?$/, 'via')
  escribir(/^Nombre\*?$/, 'Vía de aplicación')
  escribir('Código del valor 1', 'im')
  escribir('Etiqueta del valor 1', 'Intramuscular')
  agregarValor()
  escribir('Código del valor 2', 'SC')
  escribir('Etiqueta del valor 2', 'Subcutánea')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarDimensiones.mockResolvedValue([])
})

test('guardar manda los valores en orden y vuelve a la pestaña con su filtro y el aviso', async () => {
  crearDimension.mockResolvedValue({ codigo: 'via', nombre: 'Vía de aplicación' })
  montar({ pathname: '/configuracion/dimensiones/nueva', state: { volverA: '?pestana=dimensiones&activa=true' } })

  llenar()
  escribir('Descripción', '  Cómo se aplicó la dosis. ')
  guardar()

  expect(await screen.findByText('Dimensión Vía de aplicación registrada.')).toBeTruthy()
  expect(crearDimension).toHaveBeenCalledWith({
    codigo: 'via',
    nombre: 'Vía de aplicación',
    descripcion: 'Cómo se aplicó la dosis.',
    valores: [
      { codigo: 'IM', etiqueta: 'Intramuscular' },
      { codigo: 'SC', etiqueta: 'Subcutánea' },
    ],
  })
  expect(ubicacion()).toBe('/configuracion?pestana=dimensiones&activa=true')
})

test('sin descripción no la manda, y sin filtro vuelve a la pestaña Dimensiones', async () => {
  crearDimension.mockResolvedValue({ codigo: 'via', nombre: 'Vía de aplicación' })
  montar('/configuracion/dimensiones/nueva')

  llenar()
  guardar()

  await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=dimensiones'))
  expect(crearDimension.mock.calls[0][0]).not.toHaveProperty('descripcion')
})

test('un código inválido muestra su error y no llama a la API', () => {
  montar('/configuracion/dimensiones/nueva')

  llenar()
  escribir(/^Código\*?$/, 'Via')
  guardar()

  expect(
    screen.getByText('El código debe empezar con una letra minúscula y usar solo minúsculas, números y guion bajo (hasta 30).'),
  ).toBeTruthy()
  expect(crearDimension).not.toHaveBeenCalled()
})

test('un código de valor repetido (sin importar mayúsculas) muestra su error y no llama a la API', () => {
  montar('/configuracion/dimensiones/nueva')

  llenar()
  escribir('Código del valor 2', 'IM')
  guardar()

  expect(screen.getByText('El valor IM está repetido.')).toBeTruthy()
  expect(crearDimension).not.toHaveBeenCalled()
})

test('quitar todos los valores avisa que falta al menos uno', () => {
  montar('/configuracion/dimensiones/nueva')

  escribir(/^Código\*?$/, 'via')
  escribir(/^Nombre\*?$/, 'Vía de aplicación')
  fireEvent.click(screen.getByRole('button', { name: 'Quitar el valor 1' }))
  guardar()

  expect(screen.getByText('Indique al menos un valor.')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Valores de la dimensión' })).toBeNull()
  expect(crearDimension).not.toHaveBeenCalled()
})

test('una etiqueta vacía muestra su error al salir del campo', () => {
  montar('/configuracion/dimensiones/nueva')

  fireEvent.blur(screen.getByLabelText('Etiqueta del valor 1'))

  expect(screen.getByText('La etiqueta debe tener entre 1 y 60 caracteres.')).toBeTruthy()
})

test('un 409 se muestra en un Alert y conserva lo escrito', async () => {
  crearDimension.mockRejectedValue(
    new ErrorApi(409, 'DIMENSION_DUPLICADA', 'Ya existe una dimensión con el código via.'),
  )
  montar('/configuracion/dimensiones/nueva')

  llenar()
  guardar()

  expect(await screen.findByText('Ya existe una dimensión con el código via.')).toBeTruthy()
  expect(screen.getByLabelText(/^Código\*?$/).value).toBe('via')
  const lista = screen.getByRole('list', { name: 'Valores de la dimensión' })
  expect(within(lista).getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByLabelText('Etiqueta del valor 2').value).toBe('Subcutánea')
  expect(ubicacion()).toBe('/configuracion/dimensiones/nueva')
})

test('"Cancelar" vuelve a la pestaña sin guardar', async () => {
  montar('/configuracion/dimensiones/nueva')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

  await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=dimensiones'))
  expect(crearDimension).not.toHaveBeenCalled()
})
