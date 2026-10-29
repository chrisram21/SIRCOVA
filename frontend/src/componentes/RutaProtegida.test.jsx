import { act, render, screen } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import App from '@/App.jsx'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from './ProveedorSesion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), cambiarContrasena: vi.fn() }))
// /usuarios pide la lista al montar; aquí solo importa la ruta, no la API.
vi.mock('@/api/usuarios.js', () => ({ listarUsuarios: vi.fn(() => new Promise(() => {})) }))

function crearSesion(debeCambiarContrasena) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: ['USUARIO_CONSULTAR'],
      debeCambiarContrasena,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, debeCambiar) {
  guardarSesion(crearSesion(debeCambiar))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  sessionStorage.clear()
})

test.each([['/inicio'], ['/usuarios'], ['/ruta-que-no-existe']])(
  'con debeCambiarContrasena, %s lleva a la pantalla de cambio sin menú',
  (ruta) => {
    abrir(ruta, true)

    expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Menú principal' })).toBeNull()
  },
)

test.each([['/inicio'], ['/usuarios']])('sin debeCambiarContrasena, %s abre normal', (ruta) => {
  abrir(ruta, false)

  expect(screen.queryByLabelText('Contraseña actual')).toBeNull()
  expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
})

describe('al recargar (sin sesión en memoria)', () => {
  function Ubicacion() {
    const { pathname, search } = useLocation()
    return <p data-testid="ubicacion">{pathname + search}</p>
  }

  // La respuesta de /auth/refrescar queda en manos de la prueba. refrescar() comparte su promesa en el módulo: la que
  // quede sin responder se responde al terminar, para que la prueba siguiente haga la suya.
  let responder
  const responderCon = (status, cuerpo) =>
    act(async () => {
      responder({ status, ok: status === 200, json: async () => cuerpo })
    })

  function abrirSinSesion(ruta) {
    responder = undefined
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise((resolver) => (responder = resolver))),
    )
    render(
      <MemoryRouter initialEntries={[ruta]}>
        <ProveedorSesion>
          <App />
          <Ubicacion />
        </ProveedorSesion>
      </MemoryRouter>,
    )
    return responderCon
  }

  afterEach(async () => {
    await responderCon(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } })
    vi.unstubAllGlobals()
  })

  test('mientras recupera la sesión muestra la pantalla de carga y no redirige', () => {
    abrirSinSesion('/usuarios?estado=ACTIVA')

    expect(screen.getByRole('status', { name: 'Recuperando la sesión' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).toBeNull()
    expect(screen.getByTestId('ubicacion').textContent).toBe('/usuarios?estado=ACTIVA')
  })

  test('al recuperar la sesión se queda en la ruta pedida, con su búsqueda', async () => {
    const responder = abrirSinSesion('/usuarios?estado=ACTIVA')

    await responder(200, crearSesion(false))

    expect(await screen.findByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
    expect(screen.queryByRole('status', { name: 'Recuperando la sesión' })).toBeNull()
    expect(screen.getByTestId('ubicacion').textContent).toBe('/usuarios?estado=ACTIVA')
  })

  test('sin cookie termina en el login, sin aviso', async () => {
    const responder = abrirSinSesion('/usuarios')

    await responder(401, { error: { codigo: 'NO_AUTENTICADO', mensaje: 'Debe iniciar sesión.' } })

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
    expect(screen.getByTestId('ubicacion').textContent).toBe('/login')
    expect(screen.queryByRole('status')).toBeNull()
  })
})
