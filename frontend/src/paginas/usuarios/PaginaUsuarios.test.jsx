import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { desactivarCuenta, listarUsuarios, restaurarCuenta } from '@/api/usuarios.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaUsuarios from './PaginaUsuarios.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/usuarios.js', () => ({ listarUsuarios: vi.fn(), desactivarCuenta: vi.fn(), restaurarCuenta: vi.fn() }))

const TODOS_LOS_PERMISOS = ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR', 'USUARIO_EDITAR', 'USUARIO_DESACTIVAR']

function cuenta(id, nombreUsuario, extra = {}) {
  return {
    id,
    empleadoId: id + 100,
    nombreUsuario,
    rol: 'REVISOR',
    rolNombre: 'Estadígrafa / revisor DDRISS',
    activo: true,
    debeCambiarContrasena: false,
    ultimoAcceso: null,
    desactivadoEn: null,
    ...extra,
    empleado: {
      id: id + 100,
      nombres: 'Ana',
      apellidos: nombreUsuario,
      cargo: null,
      establecimientoNombre: null,
      ...extra.empleado,
    },
  }
}

// La cuenta 7 es la de la sesión.
const CUENTAS = [
  cuenta(7, 'jperez', { rol: 'ADMINISTRADOR', rolNombre: 'Administrador' }),
  cuenta(8, 'alopez', { empleado: { cargo: 'Enfermera', establecimientoNombre: 'Centro de Salud Tacaná' } }),
  cuenta(9, 'mruiz', { activo: false, desactivadoEn: '2026-10-21T07:00:00.000Z' }),
]

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

async function abrir(permisos = TODOS_LOS_PERMISOS) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter>
      <ProveedorSesion>
        <PaginaUsuarios />
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando cuentas')).toBeNull())
}

const fila = (nombreUsuario) => screen.getByRole('cell', { name: nombreUsuario }).closest('tr')
const botonesDe = (nombreUsuario) => within(fila(nombreUsuario)).queryAllByRole('button').map((b) => b.textContent)
const enlacesDe = (nombreUsuario) => within(fila(nombreUsuario)).queryAllByRole('link').map((a) => a.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarUsuarios.mockResolvedValue(CUENTAS)
})

test('muestra una fila por cuenta con su estado, el cargo y el establecimiento o "DDRISS"', async () => {
  await abrir()

  expect(screen.getAllByRole('row')).toHaveLength(CUENTAS.length + 1)
  expect(within(fila('alopez')).getByText('Activa')).toBeTruthy()
  expect(within(fila('alopez')).getByText('Enfermera')).toBeTruthy()
  expect(within(fila('alopez')).getByText('Centro de Salud Tacaná')).toBeTruthy()
  expect(within(fila('jperez')).getByText('DDRISS')).toBeTruthy()
  expect(within(fila('mruiz')).getByText('Desactivada')).toBeTruthy()
})

test('la fila propia no tiene "Desactivar" y una desactivada solo tiene "Restaurar"', async () => {
  await abrir()

  expect(enlacesDe('jperez')).toEqual(['Editar'])
  expect(botonesDe('jperez')).toEqual([])
  expect(enlacesDe('alopez')).toEqual(['Editar'])
  expect(botonesDe('alopez')).toEqual(['Desactivar'])
  expect(enlacesDe('mruiz')).toEqual([])
  expect(botonesDe('mruiz')).toEqual(['Restaurar'])
  expect(within(fila('alopez')).getByRole('link', { name: 'Editar' }).getAttribute('href')).toBe('/usuarios/8/editar')
})

test('sin USUARIO_DESACTIVAR no aparecen "Desactivar" ni "Restaurar"', async () => {
  await abrir(['USUARIO_CONSULTAR', 'USUARIO_EDITAR'])
  expect(botonesDe('alopez')).toEqual([])
  expect(botonesDe('mruiz')).toEqual([])
  expect(enlacesDe('alopez')).toEqual(['Editar'])
})

test('sin USUARIO_EDITAR no aparece "Editar"', async () => {
  await abrir(['USUARIO_CONSULTAR', 'USUARIO_DESACTIVAR'])

  expect(enlacesDe('alopez')).toEqual([])
  expect(botonesDe('alopez')).toEqual(['Desactivar'])
})

test('"Desactivar" pide confirmación: "Cancelar" no llama a la API y "Desactivar" actualiza la fila', async () => {
  desactivarCuenta.mockResolvedValue({ ...CUENTAS[1], activo: false })
  await abrir()

  fireEvent.click(within(fila('alopez')).getByRole('button', { name: 'Desactivar' }))
  const dialogo = await screen.findByRole('alertdialog')
  expect(within(dialogo).getByText('¿Desactivar la cuenta alopez?')).toBeTruthy()
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(desactivarCuenta).not.toHaveBeenCalled()

  fireEvent.click(within(fila('alopez')).getByRole('button', { name: 'Desactivar' }))
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

  expect(await screen.findByText('Se desactivó la cuenta alopez.')).toBeTruthy()
  expect(desactivarCuenta).toHaveBeenCalledWith(8)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(within(fila('alopez')).getByText('Desactivada')).toBeTruthy()
  expect(botonesDe('alopez')).toEqual(['Restaurar'])
})

test('"Restaurar" llama a restaurarCuenta, actualiza la fila y muestra el éxito', async () => {
  restaurarCuenta.mockResolvedValue({ ...CUENTAS[2], activo: true, desactivadoEn: null })
  await abrir()

  fireEvent.click(within(fila('mruiz')).getByRole('button', { name: 'Restaurar' }))

  expect(await screen.findByText('Se restauró la cuenta mruiz.')).toBeTruthy()
  expect(restaurarCuenta).toHaveBeenCalledWith(9)
  expect(within(fila('mruiz')).getByText('Activa')).toBeTruthy()
})

test('si la acción falla, muestra el mensaje del backend y la fila no cambia', async () => {
  restaurarCuenta.mockRejectedValue(new ErrorApi(409, 'EMPLEADO_INACTIVO', 'El empleado de esta cuenta está inactivo.'))
  await abrir()

  fireEvent.click(within(fila('mruiz')).getByRole('button', { name: 'Restaurar' }))

  expect(await screen.findByText('El empleado de esta cuenta está inactivo.')).toBeTruthy()
  expect(within(fila('mruiz')).getByText('Desactivada')).toBeTruthy()
})

test('si falla la carga, se muestra el error', async () => {
  listarUsuarios.mockRejectedValue(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar las cuentas: No se pudo conectar con el servidor.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('sin cuentas, muestra el aviso', async () => {
  listarUsuarios.mockResolvedValue([])
  await abrir()

  expect(screen.getByText('No hay cuentas registradas en su DDRISS.')).toBeTruthy()
})
