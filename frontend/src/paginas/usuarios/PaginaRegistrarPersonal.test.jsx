import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { listarDdriss, listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { crearCuenta, listarRoles, registrarEmpleado } from '@/api/usuarios.js'
import PaginaRegistrarPersonal from './PaginaRegistrarPersonal.jsx'

vi.mock('@/api/usuarios.js', () => ({ registrarEmpleado: vi.fn(), crearCuenta: vi.fn(), listarRoles: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarEstablecimientos: vi.fn(),
}))

const ROLES = [
  { id: 1, codigo: 'ESTABLECIMIENTO', nombre: 'Personal del establecimiento' },
  { id: 2, codigo: 'REVISOR', nombre: 'Estadígrafa / revisor DDRISS' },
]
const ESTABLECIMIENTOS = [{ id: 7, nombre: 'Centro de Salud Tacaná', municipioId: 7, municipioNombre: 'Tacaná' }]
const MUNICIPIOS = [{ id: 1, nombre: 'San Marcos' }]

async function abrir() {
  render(
    <MemoryRouter>
      <PaginaRegistrarPersonal />
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.getByLabelText(/^Nombres/).disabled).toBe(false))
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
// Radix Select deja un <select> nativo oculto dentro del formulario; cambiarlo actualiza el valor del Select.
const elegir = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })
const botonRegistrar = () => screen.getByRole('button', { name: /^(Registrar|Crear cuenta|Registrando…)$/ })

function llenarEmpleado() {
  escribir(/^Nombres/, 'Ana')
  escribir(/^Apellidos/, 'López')
}

function llenarCuenta({ rolId = 2, confirmacion = 'Temporal-123' } = {}) {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))
  escribir(/^Nombre de usuario/, 'alopez')
  escribir(/^Contraseña temporal/, 'Temporal-123')
  escribir(/^Confirmar contraseña/, confirmacion)
  elegir('rol', rolId)
}

beforeEach(() => {
  vi.clearAllMocks()
  listarDdriss.mockResolvedValue([{ id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos', departamentoId: 12 }])
  listarRoles.mockResolvedValue(ROLES)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarEstablecimientos.mockResolvedValue(ESTABLECIMIENTOS)
  registrarEmpleado.mockResolvedValue({ id: 40, nombres: 'Ana', apellidos: 'López', establecimientoId: null })
  crearCuenta.mockResolvedValue({ id: 90, nombreUsuario: 'alopez' })
})

test('muestra la DDRISS y las opciones de los Select, y pide solo establecimientos activos', async () => {
  await abrir()

  expect(screen.getByTestId('ddriss').textContent).toBe('DDRISS San Marcos')
  expect(listarEstablecimientos).toHaveBeenCalledWith({ activo: true })
  const establecimientos = [...document.querySelectorAll('select[name="establecimiento"] option')].map((o) => o.textContent)
  expect(establecimientos).toEqual(expect.arrayContaining(['Sin establecimiento (personal de la DDRISS)', 'Centro de Salud Tacaná']))
  const municipios = [...document.querySelectorAll('select[name="municipio"] option')].map((o) => o.textContent)
  expect(municipios).toEqual(expect.arrayContaining(['Sin municipio', 'San Marcos']))

  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))
  const roles = [...document.querySelectorAll('select[name="rol"] option')].map((o) => o.textContent)
  expect(roles).toEqual(expect.arrayContaining(['Personal del establecimiento', 'Estadígrafa / revisor DDRISS']))
})

test('"Registrar" está deshabilitado sin nombres o con contraseñas distintas', async () => {
  await abrir()
  expect(botonRegistrar().disabled).toBe(true)

  llenarEmpleado()
  expect(botonRegistrar().disabled).toBe(false)

  llenarCuenta({ confirmacion: 'Otra-123' })
  expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy()
  expect(botonRegistrar().disabled).toBe(true)
})

test('el rol de personal del establecimiento sin establecimiento muestra el aviso y no deja enviar', async () => {
  await abrir()
  llenarEmpleado()
  llenarCuenta({ rolId: 1 })

  expect(screen.getByText(/Para el rol Personal del establecimiento, el empleado debe tener un establecimiento/)).toBeTruthy()
  expect(botonRegistrar().disabled).toBe(true)

  elegir('establecimiento', 7)
  expect(botonRegistrar().disabled).toBe(false)
})

test('con establecimiento no aparece el Select de municipio y se muestra el del establecimiento', async () => {
  await abrir()
  elegir('establecimiento', 7)

  expect(document.querySelector('select[name="municipio"]')).toBeNull()
  expect(screen.getByTestId('municipio-establecimiento').textContent).toBe('Tacaná')
})

test('sin cuenta, solo registra al empleado y muestra el éxito', async () => {
  await abrir()
  llenarEmpleado()
  escribir(/^Cargo/, '  Enfermera  ')
  elegir('municipio', 1)

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Se registró a Ana López.')).toBeTruthy()
  expect(registrarEmpleado).toHaveBeenCalledWith({ nombres: 'Ana', apellidos: 'López', cargo: 'Enfermera', municipioId: 1 })
  expect(crearCuenta).not.toHaveBeenCalled()
  expect(screen.queryByText(/Se creó la cuenta/)).toBeNull()
})

test('con cuenta, registra al empleado, crea la cuenta con su id y muestra los dos mensajes', async () => {
  await abrir()
  llenarEmpleado()
  elegir('establecimiento', 7)
  llenarCuenta()

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Se creó la cuenta alopez.')).toBeTruthy()
  expect(screen.getByText('Se registró a Ana López.')).toBeTruthy()
  expect(registrarEmpleado).toHaveBeenCalledWith({ nombres: 'Ana', apellidos: 'López', establecimientoId: 7 })
  expect(crearCuenta).toHaveBeenCalledWith({
    empleadoId: 40,
    nombreUsuario: 'alopez',
    contrasenaTemporal: 'Temporal-123',
    rolId: 2,
  })
  expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios')
})

test('si falla la cuenta, muestra el aviso parcial y "Crear cuenta" reintenta solo la cuenta', async () => {
  crearCuenta.mockRejectedValueOnce(new ErrorApi(409, 'NOMBRE_USUARIO_DUPLICADO', 'Ya existe ese nombre de usuario.'))
  await abrir()
  llenarEmpleado()
  llenarCuenta()

  fireEvent.click(botonRegistrar())

  expect(
    await screen.findByText('Se registró a Ana López, pero no se pudo crear la cuenta: Ya existe ese nombre de usuario.'),
  ).toBeTruthy()
  expect(screen.queryByLabelText(/^Nombres/)).toBeNull()
  expect(screen.getByLabelText(/^Contraseña temporal/).value).toBe('')

  escribir(/^Nombre de usuario/, 'alopez2')
  escribir(/^Contraseña temporal/, 'Temporal-123')
  escribir(/^Confirmar contraseña/, 'Temporal-123')
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

  expect(await screen.findByText('Se creó la cuenta alopez.')).toBeTruthy()
  expect(registrarEmpleado).toHaveBeenCalledTimes(1)
  expect(crearCuenta).toHaveBeenCalledTimes(2)
  expect(crearCuenta).toHaveBeenLastCalledWith(expect.objectContaining({ empleadoId: 40, nombreUsuario: 'alopez2' }))
})

test('un 409 del empleado muestra su mensaje y conserva lo escrito', async () => {
  registrarEmpleado.mockRejectedValueOnce(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  llenarEmpleado()

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Ya hay un empleado con ese correo.')).toBeTruthy()
  expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')
  expect(crearCuenta).not.toHaveBeenCalled()
})

test('si falla un catálogo, muestra el error y no se puede enviar', async () => {
  listarRoles.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  render(
    <MemoryRouter>
      <PaginaRegistrarPersonal />
    </MemoryRouter>,
  )

  expect(await screen.findByText(/No se pudieron cargar los datos del formulario: No se pudo conectar/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/^Nombres/), { target: { value: 'Ana' } })
  expect(botonRegistrar().disabled).toBe(true)
})

test('"Registrar otro" vacía el formulario', async () => {
  await abrir()
  llenarEmpleado()
  fireEvent.click(botonRegistrar())
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar otro' }))

  expect(screen.getByLabelText(/^Nombres/).value).toBe('')
  expect(screen.getByLabelText(/^Apellidos/).value).toBe('')
  expect(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }).getAttribute('aria-checked')).toBe('false')
})
