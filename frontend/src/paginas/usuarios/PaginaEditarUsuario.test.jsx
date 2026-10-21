import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { cambiarRol, editarEmpleado, listarRoles, obtenerUsuario } from '@/api/usuarios.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEditarUsuario from './PaginaEditarUsuario.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/usuarios.js', () => ({
  obtenerUsuario: vi.fn(),
  listarRoles: vi.fn(),
  cambiarRol: vi.fn(),
  editarEmpleado: vi.fn(),
}))
vi.mock('@/api/catalogos.js', () => ({ listarMunicipios: vi.fn(), listarEstablecimientos: vi.fn() }))

const ROLES = [
  { id: 1, codigo: 'ESTABLECIMIENTO', nombre: 'Personal del establecimiento' },
  { id: 2, codigo: 'REVISOR', nombre: 'Estadígrafa / revisor DDRISS' },
  { id: 3, codigo: 'EPIDEMIOLOGIA', nombre: 'Epidemiología' },
]
const ESTABLECIMIENTOS = [{ id: 7, nombre: 'Centro de Salud Tacaná', municipioId: 7, municipioNombre: 'Tacaná' }]
const MUNICIPIOS = [{ id: 1, nombre: 'San Marcos' }]

const EMPLEADO = {
  id: 108,
  codigoEmpleado: null,
  nombres: 'Ana',
  apellidos: 'López',
  cargo: 'Enfermera',
  correo: null,
  telefono: null,
  establecimientoId: null,
  municipioId: null,
  ddrissId: 1,
  activo: true,
  establecimientoNombre: null,
  municipioNombre: null,
}

function cuenta(extra = {}) {
  return {
    id: 8,
    empleadoId: 108,
    nombreUsuario: 'alopez',
    rol: 'REVISOR',
    rolNombre: 'Estadígrafa / revisor DDRISS',
    activo: true,
    debeCambiarContrasena: false,
    ultimoAcceso: null,
    desactivadoEn: null,
    empleado: EMPLEADO,
    ...extra,
  }
}

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: ['USUARIO_CONSULTAR', 'USUARIO_EDITAR', 'EMPLEADO_EDITAR'],
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

async function abrir(id = 8) {
  guardarSesion(crearSesion())
  render(
    <MemoryRouter initialEntries={[`/usuarios/${id}/editar`]}>
      <ProveedorSesion>
        <Routes>
          <Route path="/usuarios/:id/editar" element={<PaginaEditarUsuario />} />
        </Routes>
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(obtenerUsuario).toHaveBeenCalled())
}

const esperarFormulario = () => waitFor(() => expect(screen.getByLabelText(/^Nombres/).disabled).toBe(false))
const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
// Radix Select deja un <select> nativo oculto dentro del formulario; cambiarlo actualiza el valor del Select.
const elegir = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })
const botonGuardar = () => screen.getByRole('button', { name: /^(Guardar cambios|Guardando…)$/ })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  obtenerUsuario.mockResolvedValue(cuenta())
  listarRoles.mockResolvedValue(ROLES)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarEstablecimientos.mockResolvedValue(ESTABLECIMIENTOS)
  editarEmpleado.mockImplementation(async (_, cambios) => ({ ...EMPLEADO, ...cambios }))
  cambiarRol.mockImplementation(async (_, rolId) => cuenta({ rol: ROLES.find((r) => r.id === rolId).codigo }))
})

test('carga los datos de la cuenta en el formulario y pide la cuenta de la ruta', async () => {
  await abrir()
  await esperarFormulario()

  expect(obtenerUsuario).toHaveBeenCalledWith('8')
  expect(listarEstablecimientos).toHaveBeenCalledWith({ activo: true })
  expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')
  expect(screen.getByLabelText(/^Cargo/).value).toBe('Enfermera')
  expect(screen.getByTestId('nombre-usuario').textContent).toBe('alopez')
  expect(document.querySelector('select[name="rol"]').value).toBe('2')
})

test('"Guardar cambios" está deshabilitado sin cambios y con nombres vacíos', async () => {
  await abrir()
  await esperarFormulario()
  expect(botonGuardar().disabled).toBe(true)

  escribir(/^Cargo/, 'Epidemióloga')
  expect(botonGuardar().disabled).toBe(false)

  escribir(/^Nombres/, '  ')
  expect(botonGuardar().disabled).toBe(true)
})

test('cambiar solo el cargo llama solo a editarEmpleado, con { cargo }, y muestra el éxito', async () => {
  await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, 'Epidemióloga')
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Se guardaron los cambios de Ana López.')).toBeTruthy()
  expect(editarEmpleado).toHaveBeenCalledWith(108, { cargo: 'Epidemióloga' })
  expect(cambiarRol).not.toHaveBeenCalled()
  expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios')
  // El formulario toma lo guardado: ya no hay cambios pendientes.
  expect(botonGuardar().disabled).toBe(true)
})

test('vaciar un campo opcional lo envía como null', async () => {
  await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, '')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(editarEmpleado).toHaveBeenCalledWith(108, { cargo: null }))
})

test('cambiar solo el rol llama solo a cambiarRol', async () => {
  await abrir()
  await esperarFormulario()

  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Se guardaron los cambios de Ana López.')).toBeTruthy()
  expect(cambiarRol).toHaveBeenCalledWith(8, 3)
  expect(editarEmpleado).not.toHaveBeenCalled()
})

test('el rol de personal del establecimiento sin establecimiento muestra el aviso y no deja guardar', async () => {
  await abrir()
  await esperarFormulario()

  elegir('rol', 1)

  expect(screen.getByText('Para el rol Personal del establecimiento, el empleado debe tener un establecimiento.')).toBeTruthy()
  expect(botonGuardar().disabled).toBe(true)
})

test('si falla el rol después del empleado, muestra el aviso parcial y reintentar llama solo a cambiarRol', async () => {
  cambiarRol.mockRejectedValueOnce(new ErrorApi(422, 'ROL_INVALIDO', 'El rol no existe.'))
  await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, 'Epidemióloga')
  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(
    await screen.findByText('Se guardaron los datos de Ana López, pero no se pudo cambiar el rol: El rol no existe.'),
  ).toBeTruthy()
  expect(editarEmpleado).toHaveBeenCalledTimes(1)

  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Se guardaron los cambios de Ana López.')).toBeTruthy()
  expect(editarEmpleado).toHaveBeenCalledTimes(1)
  expect(cambiarRol).toHaveBeenCalledTimes(2)
})

test('si falla el empleado, muestra el mensaje, no intenta el rol y conserva lo escrito', async () => {
  editarEmpleado.mockRejectedValue(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  await esperarFormulario()

  escribir(/^Correo/, 'otra@prueba.local')
  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Ya hay un empleado con ese correo.')).toBeTruthy()
  expect(cambiarRol).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/^Correo/).value).toBe('otra@prueba.local')
})

test('en la cuenta propia el Select de rol está deshabilitado', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ id: 7, nombreUsuario: 'jperez', rol: 'ADMINISTRADOR' }))
  await abrir(7)
  await esperarFormulario()

  expect(document.getElementById('rol').disabled).toBe(true)
  expect(screen.getByText('No puede cambiar su propio rol.')).toBeTruthy()
})

test('una cuenta desactivada muestra el aviso y no el formulario', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ activo: false }))
  await abrir()

  expect(await screen.findByText('La cuenta alopez está desactivada; restáurela para editarla.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Volver a Usuarios' })).toBeTruthy()
})

test('si falla la carga, muestra el error y no se puede guardar', async () => {
  obtenerUsuario.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar los datos de la cuenta: El recurso solicitado no existe.')).toBeTruthy()
  expect(botonGuardar().disabled).toBe(true)
})
