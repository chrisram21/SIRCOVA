import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import App from '@/App.jsx'
import { obtenerPerfil } from '@/api/auth.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), obtenerPerfil: vi.fn() }))

const EMPLEADO = { nombres: 'Ana María', apellidos: 'López Fuentes', ddrissId: 1, establecimientoId: 4, municipioId: 1 }

function crearSesion({ rol = 'ESTABLECIMIENTO', permisos = ['REPORTE_CONSULTAR'] } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: { id: 7, nombreUsuario: 'alopez', rol, rolNombre: 'Personal del establecimiento', permisos, empleado: EMPLEADO },
  }
}

function perfil({ empleado = {}, ...cambios } = {}) {
  return {
    id: 7,
    nombreUsuario: 'alopez',
    rol: 'ESTABLECIMIENTO',
    rolNombre: 'Personal del establecimiento',
    permisos: ['REPORTE_CONSULTAR'],
    debeCambiarContrasena: false,
    ultimoAcceso: '2026-10-28T15:30:00.000Z',
    creadoEn: '2026-01-10T14:00:00.000Z',
    ...cambios,
    empleado: {
      ...EMPLEADO,
      id: 12,
      cuiRegistrado: true,
      cargo: 'Enfermera auxiliar',
      correo: 'ana.lopez@gmail.com',
      telefono: '5551-1001',
      ddrissNombre: 'DDRISS San Marcos',
      establecimientoCodigo: 'CS-1201',
      establecimientoNombre: 'Centro de Salud San Marcos',
      municipioNombre: 'San Marcos',
      ...empleado,
    },
  }
}

function abrir(ruta = '/cuenta/perfil', opciones) {
  guardarSesion(crearSesion(opciones))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

// El valor de una fila de datos, por su etiqueta.
const dato = (etiqueta) => screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling.textContent

beforeEach(() => {
  sessionStorage.clear()
  obtenerPerfil.mockReset()
  obtenerPerfil.mockResolvedValue(perfil())
})

test('muestra los datos de la cuenta, del empleado y de su lugar de trabajo', async () => {
  abrir()

  expect(await screen.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeTruthy()
  await screen.findByText('Datos personales')
  expect(dato('Nombres')).toBe('Ana María')
  expect(dato('Cargo')).toBe('Enfermera auxiliar')
  expect(dato('Correo')).toBe('ana.lopez@gmail.com')
  expect(dato('Teléfono')).toBe('5551-1001')
  expect(dato('DDRISS')).toBe('DDRISS San Marcos')
  expect(dato('Establecimiento')).toBe('CS-1201 · Centro de Salud San Marcos')
  expect(dato('Municipio')).toBe('San Marcos')
  expect(dato('Usuario')).toBe('alopez')
  expect(dato('Rol')).toBe('Personal del establecimiento')
  expect(screen.getByRole('link', { name: /Cambiar contraseña/ }).getAttribute('href')).toBe('/cuenta/contrasena')
  expect(document.title).toBe('Mi perfil · SIRCOVA')
})

test('del CUI solo dice si está registrado, nunca el número', async () => {
  abrir()

  await screen.findByText('Datos personales')
  expect(dato('CUI')).toBe('RegistradoPor seguridad, el sistema no muestra el número.')
})

test('un CUI sin registrar se ve como «Sin registrar»', async () => {
  obtenerPerfil.mockResolvedValue(perfil({ empleado: { cuiRegistrado: false } }))
  abrir()

  await screen.findByText('Datos personales')
  expect(dato('CUI')).toBe('Sin registrar')
})

test('un dato sin valor dice «Sin registrar» y una autoridad sin DDRISS es de nivel nacional', async () => {
  obtenerPerfil.mockResolvedValue(
    perfil({
      rol: 'AUTORIDAD',
      empleado: {
        cargo: null,
        telefono: null,
        ddrissId: null,
        ddrissNombre: null,
        establecimientoId: null,
        establecimientoCodigo: null,
        establecimientoNombre: null,
        municipioId: null,
        municipioNombre: null,
      },
    }),
  )
  abrir()

  await screen.findByText('Datos personales')
  expect(dato('Cargo')).toBe('Sin registrar')
  expect(dato('Teléfono')).toBe('Sin registrar')
  expect(dato('DDRISS')).toBe('Nivel nacional (todas las DDRISS)')
  expect(dato('Establecimiento')).toBe('Sin establecimiento')
})

test('«Lo que puede hacer» enlaza las pantallas que permiten sus permisos', async () => {
  abrir()

  const seccion = (await screen.findByRole('heading', { name: 'Lo que puede hacer en SIRCOVA' })).closest('section')
  const enlaces = within(seccion).getAllByRole('link')
  expect(enlaces.map((enlace) => enlace.getAttribute('href'))).toEqual(['/registro', '/reportes'])
})

test('si la carga falla, avisa y «Reintentar» vuelve a pedir el perfil', async () => {
  obtenerPerfil.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  abrir()

  expect(await screen.findByText('No se pudo cargar su perfil: No se pudo conectar con el servidor.')).toBeTruthy()
  // Mientras tanto, la tarjeta de identidad ya muestra el nombre de la sesión.
  expect(screen.getByText('Ana María López Fuentes', { selector: 'p' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await screen.findByText('Datos personales')
  expect(obtenerPerfil).toHaveBeenCalledTimes(2)
})

test('«Mi perfil» del menú de la cuenta abre la pantalla', async () => {
  abrir('/inicio')

  fireEvent.keyDown(screen.getByRole('button', { name: /^Cuenta de / }), { key: 'Enter' })
  fireEvent.click(await within(await screen.findByRole('menu')).findByRole('menuitem', { name: 'Mi perfil' }))

  expect(await screen.findByRole('heading', { level: 1, name: 'Mi perfil' })).toBeTruthy()
})

test('si faltan datos, avisa cuáles', async () => {
  obtenerPerfil.mockResolvedValue(perfil({ empleado: { telefono: null, cuiRegistrado: false } }))
  abrir()

  expect((await screen.findByRole('status')).textContent).toBe(
    'Faltan datos en su perfil: teléfono y CUI. El administrador del sistema de su DDRISS puede registrarlos.',
  )
})

test('con todos los datos no hay aviso', async () => {
  abrir()

  await screen.findByText('Datos personales')
  expect(screen.queryByText(/Faltan datos en su perfil/)).toBeNull()
})

test('«Copiar correo» copia el correo y lo confirma', async () => {
  const writeText = vi.fn().mockResolvedValue()
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  abrir()

  fireEvent.click(await screen.findByRole('button', { name: 'Copiar correo' }))

  expect(writeText).toHaveBeenCalledWith('ana.lopez@gmail.com')
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Correo copiado.'))
})
