import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, MemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import App from '@/App.jsx'
import { cerrarSesion } from '@/api/auth.js'
import { guardarSesion, leerSesion } from '@/api/sesion.js'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import RutaProtegida from '@/componentes/RutaProtegida.jsx'
import Layout from './Layout.jsx'
import opcionesMenu from './opcionesMenu.js'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))

const TODOS_LOS_PERMISOS = opcionesMenu.map((opcion) => opcion.permiso).filter(Boolean)

function crearSesion({ permisos = [], rolNombre = 'Administrador' } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      ...(rolNombre && { rolNombre }),
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, opciones) {
  guardarSesion(crearSesion(opciones))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const menu = () => within(screen.getByRole('navigation', { name: 'Menú principal' }))
const opcionesVisibles = () => menu().getAllByRole('link').map((enlace) => enlace.textContent)
const botonCuenta = () => screen.getByRole('button', { name: /^Cuenta de / })

// Radix abre el menú con Enter sobre el botón; su contenido va en un portal.
async function opcionDeCuenta(nombre) {
  fireEvent.keyDown(botonCuenta(), { key: 'Enter' })
  return within(await screen.findByRole('menu')).findByRole('menuitem', { name: nombre })
}

beforeEach(() => {
  sessionStorage.clear()
  cerrarSesion.mockReset()
  cerrarSesion.mockResolvedValue(null)
})

test('una sesión sin permisos ve solo "Inicio"', () => {
  abrir('/inicio', { permisos: [] })

  expect(opcionesVisibles()).toEqual(['Inicio'])
})

test('con INDICADOR_CONSULTAR y BITACORA_CONSULTAR ve Inicio, Indicadores y Auditoría', () => {
  abrir('/inicio', { permisos: ['INDICADOR_CONSULTAR', 'BITACORA_CONSULTAR'] })

  expect(opcionesVisibles()).toEqual(['Inicio', 'Indicadores', 'Auditoría'])
  expect(menu().queryByRole('link', { name: 'Registro de producción' })).toBeNull()
})

test('con los 11 permisos ve las 12 opciones en el orden de la tabla', () => {
  abrir('/inicio', { permisos: TODOS_LOS_PERMISOS })

  expect(TODOS_LOS_PERMISOS).toHaveLength(11)
  expect(opcionesVisibles()).toEqual([
    'Inicio',
    'Registro de producción',
    'Mis reportes',
    'Revisión y cierre',
    'Indicadores',
    'Mapa territorial',
    'Informes',
    'Alertas',
    'Auditoría',
    'Usuarios',
    'Configuración',
    'Roles y permisos',
  ])
})

test('la opción de la ruta actual está marcada como activa', () => {
  abrir('/indicadores', { permisos: ['INDICADOR_CONSULTAR'] })

  const indicadores = menu().getByRole('link', { name: 'Indicadores' })
  const inicio = menu().getByRole('link', { name: 'Inicio' })
  expect(indicadores.getAttribute('data-active')).toBe('true')
  expect(indicadores.getAttribute('aria-current')).toBe('page')
  expect(inicio.getAttribute('data-active')).toBe('false')
})

test('"Usuarios" sigue activa en su subruta /usuarios/nuevo, que no aparece en el menú', () => {
  abrir('/usuarios/nuevo', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })

  expect(menu().getByRole('link', { name: 'Usuarios' }).getAttribute('data-active')).toBe('true')
  expect(opcionesVisibles()).toEqual(['Inicio', 'Usuarios'])
})

// Las pantallas se cargan al entrar en ellas (lazy): se esperan con findBy.
test('/usuarios muestra "Registrar personal" solo con EMPLEADO_CREAR', async () => {
  abrir('/usuarios', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })
  expect((await screen.findByRole('link', { name: 'Registrar personal' })).getAttribute('href')).toBe('/usuarios/nuevo')
})

test('/usuarios sin EMPLEADO_CREAR no muestra "Registrar personal"', async () => {
  abrir('/usuarios', { permisos: ['USUARIO_CONSULTAR'] })

  expect(await screen.findByRole('heading', { name: 'Usuarios' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Registrar personal' })).toBeNull()
})

test('el pie del menú muestra nombre, apellidos y rolNombre', () => {
  abrir('/inicio', { rolNombre: 'Administrador del sistema' })

  const cuenta = within(botonCuenta())
  expect(cuenta.getByText('Juan Pérez')).toBeTruthy()
  expect(cuenta.getByText('Administrador del sistema')).toBeTruthy()
})

test('sin rolNombre, el pie del menú muestra el código del rol', () => {
  abrir('/inicio', { rolNombre: null })

  expect(within(botonCuenta()).getByText('ADMINISTRADOR')).toBeTruthy()
})

test('"Cambiar contraseña" del menú de la cuenta abre la pantalla de cambio dentro del Layout', async () => {
  abrir('/inicio')

  fireEvent.click(await opcionDeCuenta('Cambiar contraseña'))

  expect(screen.getByLabelText('Contraseña actual')).toBeTruthy()
  expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
})

test('el encabezado muestra dónde se está: la opción del menú y, en una subruta, el enlace para volver a ella', async () => {
  abrir('/usuarios/nuevo', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })

  const ubicacion = within(screen.getByRole('navigation', { name: 'Ubicación' }))
  expect(ubicacion.getByRole('link', { name: 'Usuarios' }).getAttribute('href')).toBe('/usuarios')
  expect(ubicacion.getByText('Registrar personal').getAttribute('aria-current')).toBe('page')
  expect(await screen.findByRole('heading', { name: 'Registrar personal' })).toBeTruthy()
})

test('en una subruta abierta desde la lista con filtros, la miga vuelve a la lista con ellos', () => {
  guardarSesion(crearSesion({ permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] }))
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/usuarios/nuevo', state: { volverA: { pathname: '/usuarios', search: '?estado=ACTIVA' } } }]}
    >
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )

  const ubicacion = within(screen.getByRole('navigation', { name: 'Ubicación' }))
  expect(ubicacion.getByRole('link', { name: 'Usuarios' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA')
})

test('el título de la pestaña del navegador sigue a la pantalla', async () => {
  abrir('/usuarios/nuevo', { permisos: ['USUARIO_CONSULTAR', 'EMPLEADO_CREAR'] })
  expect(document.title).toBe('Registrar personal · SIRCOVA')

  fireEvent.click(menu().getByRole('link', { name: 'Inicio' }))
  expect(document.title).toBe('Inicio · SIRCOVA')
})

test('"Cerrar sesión" avisa al servidor con MANUAL, borra la sesión y lleva a /login sin aviso', async () => {
  abrir('/inicio')

  fireEvent.click(await opcionDeCuenta('Cerrar sesión'))

  expect(cerrarSesion).toHaveBeenCalledTimes(1)
  expect(cerrarSesion).toHaveBeenCalledWith('MANUAL')
  expect(leerSesion()).toBeNull()
  expect(screen.getByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(screen.queryByRole('status')).toBeNull()
  expect(screen.queryByRole('alert')).toBeNull()
})

describe('«Cerrar sesión» con cambios sin guardar', () => {
  // Una pantalla con el aviso, como la captura de /registro, montada en el Layout real.
  function PantallaConCambios() {
    const [hayCambios, setHayCambios] = useState(false)
    const bloqueo = useAvisoCambiosSinGuardar(hayCambios)
    return (
      <>
        <button onClick={() => setHayCambios(true)}>Escribir</button>
        <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion="Se pierden los cambios." />
      </>
    )
  }

  function abrirConPantalla() {
    guardarSesion(crearSesion())
    const router = createMemoryRouter(
      [
        {
          element: (
            <ProveedorSesion>
              <Outlet />
            </ProveedorSesion>
          ),
          children: [
            { path: '/login', element: <h1>Iniciar sesión</h1> },
            {
              element: (
                <RutaProtegida>
                  <Layout />
                </RutaProtegida>
              ),
              children: [{ path: '/captura', element: <PantallaConCambios /> }],
            },
          ],
        },
      ],
      { initialEntries: ['/captura'] },
    )
    render(<RouterProvider router={router} />)
    return router
  }

  const cerrar = async () => fireEvent.click(await opcionDeCuenta('Cerrar sesión'))

  test('sin cambios, cierra como siempre, sin diálogo', async () => {
    const router = abrirConPantalla()
    await cerrar()
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
    expect(cerrarSesion).toHaveBeenCalledWith('MANUAL')
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('con cambios, pide confirmación; «Seguir editando» no cierra la sesión', async () => {
    const router = abrirConPantalla()
    fireEvent.click(screen.getByRole('button', { name: 'Escribir' }))
    await cerrar()
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si cierra sesión ahora, se pierden los cambios sin guardar.')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))
    await vi.waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(cerrarSesion).not.toHaveBeenCalled()
    expect(leerSesion()).not.toBeNull()
    expect(router.state.location.pathname).toBe('/captura')
  })

  test('con cambios, «Cerrar sesión sin guardar» cierra y llega a /login sin el otro diálogo', async () => {
    const router = abrirConPantalla()
    fireEvent.click(screen.getByRole('button', { name: 'Escribir' }))
    await cerrar()
    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión sin guardar' }))

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
    expect(cerrarSesion).toHaveBeenCalledWith('MANUAL')
    expect(leerSesion()).toBeNull()
    expect(router.state.location.pathname).toBe('/login')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

test('si POST /auth/logout falla, la sesión se cierra igual', async () => {
  cerrarSesion.mockRejectedValue(new Error('sin conexión'))
  abrir('/inicio')

  fireEvent.click(await opcionDeCuenta('Cerrar sesión'))

  expect(leerSesion()).toBeNull()
  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
})
