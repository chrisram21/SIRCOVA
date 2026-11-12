import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { crearRed, editarRed, obtenerOpcionesRed, obtenerRed, reactivarRed } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEditarRed from './PaginaEditarRed.jsx'
import PaginaRegistrarRed from './PaginaRegistrarRed.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  obtenerOpcionesRed: vi.fn(),
  obtenerRed: vi.fn(),
  crearRed: vi.fn(),
  editarRed: vi.fn(),
  reactivarRed: vi.fn(),
}))

const OPCIONES = {
  municipios: [
    { id: 23, codigoIne: '1223', nombre: 'Ixchiguán', red: { id: 1, nombre: 'Red No. 1' } },
    { id: 1, codigoIne: '1201', nombre: 'San Marcos', red: null },
    { id: 7, codigoIne: '1207', nombre: 'Tacaná', red: { id: 1, nombre: 'Red No. 1' } },
    { id: 10, codigoIne: '1210', nombre: 'Tejutla', red: { id: 2, nombre: 'Red No. 2' } },
  ],
  vacunas: [
    { id: 5, codigo: 'BCG', nombre: 'BCG', dosis: [{ id: 13, codigo: 'UNICA', nombre: 'Dosis al nacer', esTrazadora: true }] },
    {
      id: 2,
      codigo: 'HEXA',
      nombre: 'Hexavalente',
      dosis: [
        { id: 2, codigo: 'D1', nombre: 'Primera dosis', esTrazadora: false },
        { id: 4, codigo: 'D3', nombre: 'Tercera dosis', esTrazadora: true },
      ],
    },
  ],
}

const trazadora = (dosisId, codigo, vacuna, activa = true) => ({
  dosisId,
  codigo,
  nombre: codigo,
  activa,
  vacuna: { id: vacuna.id, codigo: vacuna.codigo, nombre: vacuna.nombre, activa: true },
})
const HEXA = { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' }
const DPT = { id: 10, codigo: 'DPT', nombre: 'DPT (refuerzos)' }

const RED_1 = {
  id: 1,
  codigo: 'RED_01',
  nombre: 'Red No. 1',
  activo: true,
  ddriss: { id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos' },
  municipios: [
    { id: 23, codigoIne: '1223', nombre: 'Ixchiguán' },
    { id: 7, codigoIne: '1207', nombre: 'Tacaná' },
  ],
  // La R2 de DPT ya no se ofrece (dosis inactiva): se muestra al final para poder quitarla.
  trazadoras: [trazadora(4, 'D3', HEXA), trazadora(30, 'R2', DPT, false)],
}
const RED_INACTIVA = { ...RED_1, id: 3, codigo: 'RED_03', nombre: 'Red No. 3', activo: false, municipios: [] }

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'RED_CONSULTAR', 'RED_CREAR', 'RED_EDITAR']

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'epidemiologia',
      rol: 'EPIDEMIOLOGIA',
      permisos: PERMISOS,
      empleado: { nombres: 'Ana', apellidos: 'Méndez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

// El aviso de cambios sin guardar (useBlocker) necesita un data router.
function montar(ruta, state) {
  guardarSesion(crearSesion())
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorSesion>
            <Outlet />
            <Ubicacion />
          </ProveedorSesion>
        ),
        children: [
          { path: '/administracion/redes', element: <p>Lista de redes</p> },
          { path: '/administracion/redes/nueva', element: <PaginaRegistrarRed /> },
          { path: '/administracion/redes/:id/editar', element: <PaginaEditarRed /> },
        ],
      },
    ],
    { initialEntries: [{ pathname: ruta, state }] },
  )
  render(<RouterProvider router={router} />)
}

async function abrir(ruta, state) {
  montar(ruta, state)
  await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).disabled).toBe(false))
}

const escribir = (valor) => fireEvent.change(screen.getByLabelText(/^Nombre\b/), { target: { value: valor } })
const casilla = (nombre) => screen.getByRole('checkbox', { name: nombre })
const marcada = (nombre) => casilla(nombre).getAttribute('aria-checked') === 'true'
const guardar = (nombre) => fireEvent.click(screen.getByRole('button', { name: nombre }))

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  obtenerOpcionesRed.mockResolvedValue(OPCIONES)
  obtenerRed.mockImplementation(async (id) => (String(id) === '3' ? RED_INACTIVA : RED_1))
})

describe('Nueva red', () => {
  test('los municipios de otra red se ven deshabilitados con su nombre, y no hay casillas de trazadoras', async () => {
    await abrir('/administracion/redes/nueva')

    expect(screen.getByRole('heading', { level: 1, name: 'Nueva red' })).toBeTruthy()
    expect(casilla('San Marcos').disabled).toBe(false)
    expect(casilla('Tacaná · Red No. 1').disabled).toBe(true)
    expect(casilla('Tejutla · Red No. 2').disabled).toBe(true)
    expect(screen.getByText(/La red empieza con las dosis trazadoras de cada vacuna/)).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: 'Hexavalente D3' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Restablecer trazadoras/ })).toBeNull()
  })

  test('al enviar sin datos muestra los errores y lleva el foco al nombre', async () => {
    await abrir('/administracion/redes/nueva')

    guardar('Registrar red')
    expect(await screen.findByText('El nombre de la red es obligatorio.')).toBeTruthy()
    expect(screen.getByText('Elija al menos un municipio.')).toBeTruthy()
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Nombre\b/)))
    expect(crearRed).not.toHaveBeenCalled()
  })

  test('registra la red con el nombre y los municipios, avisa y vuelve a la lista con su búsqueda', async () => {
    crearRed.mockResolvedValue({ ...RED_1, id: 5, codigo: 'RED_05', nombre: 'Red del Altiplano' })
    await abrir('/administracion/redes/nueva', { volverA: '?inactivas=1' })

    escribir('  Red del Altiplano ')
    fireEvent.click(casilla('San Marcos'))
    guardar('Registrar red')

    await waitFor(() => expect(crearRed).toHaveBeenCalledWith({ nombre: 'Red del Altiplano', municipioIds: [1] }))
    expect(toast.success).toHaveBeenCalledWith('Red del Altiplano registrada.')
    await waitFor(() => expect(ubicacion()).toBe('/administracion/redes?inactivas=1'))
  })

  test('un error de la API se muestra encima de los botones y no sale del formulario', async () => {
    crearRed.mockRejectedValue(new ErrorApi(409, 'MUNICIPIO_EN_OTRA_RED', 'San Marcos ya pertenece a la Red No. 4.'))
    await abrir('/administracion/redes/nueva')

    escribir('Red del Altiplano')
    fireEvent.click(casilla('San Marcos'))
    guardar('Registrar red')

    expect(await screen.findByText('San Marcos ya pertenece a la Red No. 4.')).toBeTruthy()
    expect(ubicacion()).toBe('/administracion/redes/nueva')
  })
})

describe('Editar red', () => {
  test('carga la red con su código, sus municipios y sus trazadoras agrupadas por vacuna', async () => {
    await abrir('/administracion/redes/1/editar')

    expect(screen.getByRole('heading', { level: 1, name: 'Editar red' })).toBeTruthy()
    expect(screen.getByText('RED_01')).toBeTruthy()
    expect(screen.getByLabelText(/^Nombre\b/).value).toBe('Red No. 1')
    // Los municipios de la propia red se pueden quitar; los de otra, no.
    expect(casilla('Tacaná').disabled).toBe(false)
    expect(marcada('Tacaná')).toBe(true)
    expect(casilla('Tejutla · Red No. 2').disabled).toBe(true)

    expect(marcada('Hexavalente D3')).toBe(true)
    expect(marcada('Hexavalente D1')).toBe(false)
    expect(marcada('BCG UNICA')).toBe(false)
    expect(marcada('DPT (refuerzos) R2 (inactiva)')).toBe(true)
  })

  test('envía solo lo que cambió y vuelve a la lista', async () => {
    editarRed.mockResolvedValue({ ...RED_1, nombre: 'Red Norte' })
    await abrir('/administracion/redes/1/editar')

    escribir('Red Norte')
    fireEvent.click(casilla('DPT (refuerzos) R2 (inactiva)'))
    fireEvent.click(casilla('Hexavalente D1'))
    guardar('Guardar cambios')

    await waitFor(() => expect(editarRed).toHaveBeenCalledWith('1', { nombre: 'Red Norte', dosisIds: [2, 4] }))
    expect(toast.success).toHaveBeenCalledWith('Red Norte actualizada.')
    await waitFor(() => expect(ubicacion()).toBe('/administracion/redes'))
  })

  test('«Restablecer trazadoras por defecto» deja marcadas solo las trazadoras de cada vacuna', async () => {
    await abrir('/administracion/redes/1/editar')

    fireEvent.click(screen.getByRole('button', { name: 'Restablecer trazadoras por defecto' }))
    expect(marcada('BCG UNICA')).toBe(true)
    expect(marcada('Hexavalente D3')).toBe(true)
    expect(marcada('Hexavalente D1')).toBe(false)
    expect(marcada('DPT (refuerzos) R2 (inactiva)')).toBe(false)
  })

  test('sin trazadoras ni municipios muestra los dos errores y no envía', async () => {
    await abrir('/administracion/redes/1/editar')

    fireEvent.click(casilla('Tacaná'))
    fireEvent.click(casilla('Ixchiguán'))
    fireEvent.click(casilla('Hexavalente D3'))
    fireEvent.click(casilla('DPT (refuerzos) R2 (inactiva)'))
    guardar('Guardar cambios')

    expect(await screen.findByText('Elija al menos un municipio.')).toBeTruthy()
    expect(screen.getByText('Elija al menos una trazadora.')).toBeTruthy()
    expect(editarRed).not.toHaveBeenCalled()
  })

  test('sin cambios avisa y no envía', async () => {
    await abrir('/administracion/redes/1/editar')

    guardar('Guardar cambios')
    await waitFor(() => expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.'))
    expect(editarRed).not.toHaveBeenCalled()
  })
})

describe('Reactivar red', () => {
  test('una red inactiva se reactiva eligiendo sus municipios', async () => {
    reactivarRed.mockResolvedValue({ ...RED_INACTIVA, activo: true })
    await abrir('/administracion/redes/3/editar')

    expect(screen.getByRole('heading', { level: 1, name: 'Reactivar red' })).toBeTruthy()
    expect(screen.getByText(/Elija sus municipios para reactivarla/)).toBeTruthy()

    guardar('Reactivar red')
    expect(await screen.findByText('Elija al menos un municipio.')).toBeTruthy()
    expect(reactivarRed).not.toHaveBeenCalled()

    fireEvent.click(casilla('San Marcos'))
    guardar('Reactivar red')
    await waitFor(() => expect(reactivarRed).toHaveBeenCalledWith('3', { municipioIds: [1] }))
    expect(toast.success).toHaveBeenCalledWith('Red No. 3 reactivada.')
  })
})

test('un error al cargar ofrece reintentar', async () => {
  obtenerOpcionesRed.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falló el servidor.'))
  montar('/administracion/redes/nueva')

  expect(await screen.findByText(/No se pudieron cargar los datos del formulario/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).disabled).toBe(false))
})
