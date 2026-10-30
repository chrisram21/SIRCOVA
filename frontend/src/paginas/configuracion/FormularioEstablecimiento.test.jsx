import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  crearEstablecimiento,
  editarEstablecimiento,
  listarDdriss,
  listarDistritos,
  listarEstablecimientos,
  listarMunicipios,
  listarTiposEstablecimiento,
  obtenerEstablecimiento,
} from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEstablecimientos from './PaginaEstablecimientos.jsx'
import PaginaEditarEstablecimiento from './PaginaEditarEstablecimiento.jsx'
import PaginaRegistrarEstablecimiento from './PaginaRegistrarEstablecimiento.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  listarTiposEstablecimiento: vi.fn(),
  crearEstablecimiento: vi.fn(),
  obtenerEstablecimiento: vi.fn(),
  editarEstablecimiento: vi.fn(),
}))

const DDRISS = [{ id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos', departamentoId: 1, departamentoNombre: 'San Marcos' }]
const TIPOS = [
  { id: 3, codigo: 'CS', nombre: 'Centro de Salud' },
  { id: 4, codigo: 'PS', nombre: 'Puesto de Salud' },
]
const municipio = (id, codigoIne, nombre, extra = {}) => ({
  id,
  departamentoId: 1,
  departamentoNombre: 'San Marcos',
  codigoIne,
  nombre,
  activo: true,
  ...extra,
})
const MUNICIPIOS = [
  municipio(1, '1201', 'San Marcos'),
  municipio(9, '1209', 'Tajumulco'),
  municipio(32, '0920', 'Coatepeque', { departamentoId: 3, departamentoNombre: 'Quetzaltenango' }),
  municipio(31, '9999', 'Migrantes / fuera de San Marcos', { departamentoId: 2, departamentoNombre: 'No especificado / otro' }),
]
const distrito = (id, codigo, nombre, municipioId) => ({ id, codigo, nombre, ddrissId: 1, municipioId, activo: true })
const DISTRITOS = [
  distrito(1, 'DS-1201', 'Distrito de Salud San Marcos', 1),
  distrito(9, 'DS-1209', 'Distrito de Salud Tajumulco', 9),
  distrito(40, 'DS-1209-02', 'Distrito de Salud Tajumulco Norte', 9),
]

const PERMISOS = ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR', 'ESTABLECIMIENTO_CREAR']

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

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

// El aviso de cambios sin guardar (useBlocker) necesita un data router.
function montar(ruta, permisos = PERMISOS) {
  guardarSesion(crearSesion(permisos))
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
          { path: '/administracion/establecimientos', element: <PaginaEstablecimientos /> },
          { path: '/administracion/establecimientos/nuevo', element: <PaginaRegistrarEstablecimiento /> },
          { path: '/administracion/establecimientos/:id/editar', element: <PaginaEditarEstablecimiento /> },
        ],
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
}

async function abrirFormulario() {
  montar('/administracion/establecimientos/nuevo')
  await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).disabled).toBe(false))
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
const elegir = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })
const opciones = (nombre) => [...document.querySelectorAll(`select[name="${nombre}"] option`)].map((o) => o.textContent)
const casilla = (nombre) => screen.getByRole('checkbox', { name: nombre })
const guardar = () => fireEvent.click(screen.getByRole('button', { name: 'Registrar establecimiento' }))

function llenarPuesto() {
  elegir('tipo', 4)
  elegir('municipio', 9)
  elegir('distrito', 40)
  escribir(/^Nombre\b/, 'Puesto de Salud Aldea Tochab')
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarDdriss.mockResolvedValue(DDRISS)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarDistritos.mockResolvedValue(DISTRITOS)
  listarTiposEstablecimiento.mockResolvedValue(TIPOS)
  listarEstablecimientos.mockResolvedValue([])
})

test('pide los municipios de todos los departamentos y no ofrece el 9999', async () => {
  await abrirFormulario()

  expect(listarMunicipios).toHaveBeenCalledWith({ alcance: 'todos' })
  expect(listarDistritos).toHaveBeenCalledWith({ activo: true })
  expect(opciones('municipio')).toEqual(['', 'San Marcos', 'Tajumulco', 'Coatepeque (Quetzaltenango)'])
  expect(screen.getByText('El código se genera al guardar.')).toBeTruthy()
})

test('el distrito solo ofrece los del municipio elegido; con un externo se oculta', async () => {
  await abrirFormulario()

  elegir('municipio', 9)
  await waitFor(() =>
    expect(opciones('distrito')).toEqual(['', 'DS-1209 · Distrito de Salud Tajumulco', 'DS-1209-02 · Distrito de Salud Tajumulco Norte']),
  )

  elegir('distrito', 40)
  elegir('municipio', 32)
  expect(await screen.findByText('Establecimiento externo: no lleva distrito de salud.')).toBeTruthy()
  expect(document.querySelector('select[name="distrito"]')).toBeNull()

  // Al volver a un municipio de la sede, el distrito elegido antes ya no está.
  elegir('municipio', 1)
  await waitFor(() => expect(document.querySelector('select[name="distrito"]').value).toBe(''))
})

test('desmarcar "Reporta producción" desmarca y deshabilita las otras dos casillas', async () => {
  await abrirFormulario()
  fireEvent.click(casilla('Envía el 5C a la DDRISS'))
  fireEvent.click(casilla('Su producción solo cuenta para la cobertura'))
  expect(casilla('Envía el 5C a la DDRISS').getAttribute('aria-checked')).toBe('true')

  fireEvent.click(casilla('Reporta producción'))

  for (const nombre of ['Envía el 5C a la DDRISS', 'Su producción solo cuenta para la cobertura']) {
    expect(casilla(nombre).getAttribute('aria-checked')).toBe('false')
    expect(casilla(nombre).disabled).toBe(true)
  }
})

test('un nombre de 2 caracteres o un correo inválido muestran el error de la regla y no llaman a la API', async () => {
  await abrirFormulario()
  llenarPuesto()
  escribir(/^Nombre\b/, 'PS')
  escribir(/^Correo/, 'sin-arroba')

  guardar()

  expect(await screen.findByText('El nombre del establecimiento debe tener entre 3 y 150 caracteres.')).toBeTruthy()
  expect(screen.getByText('El correo no es válido.')).toBeTruthy()
  expect(crearEstablecimiento).not.toHaveBeenCalled()
})

test('sin tipo, municipio ni distrito avisa qué falta y no llama a la API', async () => {
  await abrirFormulario()
  escribir(/^Nombre\b/, 'Puesto de Salud Aldea Tochab')

  guardar()

  expect(await screen.findByText('Elija el tipo de establecimiento.')).toBeTruthy()
  expect(screen.getByText('Elija el municipio.')).toBeTruthy()
  expect(crearEstablecimiento).not.toHaveBeenCalled()
})

test('registra uno de la sede con su distrito y vuelve a la pestaña con el aviso, sin pedir confirmación', async () => {
  crearEstablecimiento.mockResolvedValue({ id: 41, codigo: 'PS-1209-02' })
  await abrirFormulario()
  llenarPuesto()
  escribir(/^Teléfono/, '5550 3010')
  escribir(/^Persona de contacto/, 'Ana Lucía Pérez')
  fireEvent.click(casilla('Reporta producción'))

  guardar()

  await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos'))
  expect(crearEstablecimiento).toHaveBeenCalledWith({
    tipoEstablecimientoId: 4,
    municipioId: 9,
    distritoSaludId: 40,
    nombre: 'Puesto de Salud Aldea Tochab',
    telefono: '5550 3010',
    nombreContacto: 'Ana Lucía Pérez',
    reportaProduccion: false,
    reporta5c: false,
    soloCobertura: false,
  })
  expect(toast.success).toHaveBeenCalledWith('Establecimiento PS-1209-02 registrado.')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('un externo se envía sin distritoSaludId', async () => {
  crearEstablecimiento.mockResolvedValue({ id: 42, codigo: 'CS-0920-01' })
  await abrirFormulario()
  elegir('tipo', 3)
  elegir('municipio', 32)
  escribir(/^Nombre\b/, 'Centro de Salud de Coatepeque')

  guardar()

  await waitFor(() => expect(crearEstablecimiento).toHaveBeenCalledTimes(1))
  expect(crearEstablecimiento.mock.calls[0][0]).not.toHaveProperty('distritoSaludId')
  expect(crearEstablecimiento.mock.calls[0][0]).toMatchObject({ municipioId: 32, reportaProduccion: true })
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Establecimiento CS-0920-01 registrado.'))
})

test('un 409 de la API se muestra junto a los botones y el formulario conserva lo escrito', async () => {
  crearEstablecimiento.mockRejectedValue(
    new ErrorApi(409, 'ESTABLECIMIENTO_DUPLICADO', 'Ya hay un establecimiento con ese nombre en el municipio.'),
  )
  await abrirFormulario()
  llenarPuesto()

  guardar()

  const aviso = (await screen.findByText('Ya hay un establecimiento con ese nombre en el municipio.')).closest('[role="alert"]')
  // Va dentro del formulario, justo antes de la fila de botones.
  expect(aviso.parentElement.nextElementSibling.contains(screen.getByRole('button', { name: 'Registrar establecimiento' }))).toBe(true)
  expect(screen.getByLabelText(/^Nombre\b/).value).toBe('Puesto de Salud Aldea Tochab')
  expect(ubicacion()).toBe('/administracion/establecimientos/nuevo')
})

test('si falla la carga de los catálogos no se puede guardar, y "Reintentar" los vuelve a pedir', async () => {
  listarTiposEstablecimiento.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))
  montar('/administracion/establecimientos/nuevo')

  expect(
    await screen.findByText('No se pudieron cargar los datos del formulario: Ocurrió un error inesperado.'),
  ).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Registrar establecimiento' }).disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(screen.getByRole('button', { name: 'Registrar establecimiento' }).disabled).toBe(false))
  expect(listarTiposEstablecimiento).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(/No se pudieron cargar los datos del formulario/)).toBeNull()
})

test('al guardar con errores, el foco va al primer campo inválido', async () => {
  await abrirFormulario()
  escribir(/^Nombre\b/, 'PS')

  guardar()

  await waitFor(() => expect(document.activeElement).toBe(screen.getByRole('combobox', { name: /^Tipo/ })))
  expect(screen.getByRole('button', { name: 'Registrar establecimiento' }).disabled).toBe(false)
})

describe('cambios sin guardar', () => {
  test('con algo escrito, "Cancelar" pide confirmación y "Seguir editando" se queda en el formulario', async () => {
    await abrirFormulario()
    escribir(/^Nombre\b/, 'Puesto de Salud Aldea Tochab')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si sale ahora, se pierden los cambios del establecimiento.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(ubicacion()).toBe('/administracion/establecimientos/nuevo')
    expect(screen.getByLabelText(/^Nombre\b/).value).toBe('Puesto de Salud Aldea Tochab')
  })

  test('"Salir sin guardar" vuelve a la pestaña sin guardar', async () => {
    await abrirFormulario()
    elegir('tipo', 4)

    fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))

    await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos'))
    expect(crearEstablecimiento).not.toHaveBeenCalled()
  })
})

test('el botón de la pestaña lleva al formulario, y "Cancelar" vuelve con los mismos filtros', async () => {
  montar('/administracion/establecimientos?estado=activos')
  // Con la lista vacía, el enlace también aparece junto al mensaje: cualquiera de los dos sirve.
  fireEvent.click((await screen.findAllByRole('link', { name: 'Registrar establecimiento' }))[0])
  await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).disabled).toBe(false))

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

  await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos?estado=activos'))
  expect(crearEstablecimiento).not.toHaveBeenCalled()
})

test('sin ESTABLECIMIENTO_CREAR no aparece el botón "Registrar establecimiento"', async () => {
  montar('/administracion/establecimientos', ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR'])

  expect(await screen.findByText('No hay establecimientos registrados.')).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Registrar establecimiento' })).toBeNull()
})

describe('editar', () => {
  const GUARDADO = {
    id: 33,
    codigo: 'PS-1201-33',
    nombre: 'Puesto de Salud Aldea Las Lagunas',
    tipoEstablecimientoId: 4,
    tipoEstablecimientoCodigo: 'PS',
    tipoEstablecimientoNombre: 'Puesto de Salud',
    ddrissId: 1,
    distritoSaludId: 1,
    distritoSaludCodigo: 'DS-1201',
    distritoSaludNombre: 'Distrito de Salud San Marcos',
    municipioId: 1,
    municipioCodigoIne: '1201',
    municipioNombre: 'San Marcos',
    reportaProduccion: true,
    reporta5c: true,
    soloCobertura: false,
    esExterno: false,
    direccion: 'Aldea Las Lagunas',
    // Formato viejo: como no se cambia, no se valida.
    telefono: '1234',
    correo: null,
    nombreContacto: 'Ana Pérez',
    cuentasActivas: 0,
    activo: true,
  }

  async function abrirEdicion() {
    obtenerEstablecimiento.mockResolvedValue(GUARDADO)
    montar('/administracion/establecimientos/33/editar')
    await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).value).toBe(GUARDADO.nombre))
  }

  test('muestra el código, el tipo, el municipio y el distrito como texto, sin pedir los catálogos', async () => {
    await abrirEdicion()

    expect(obtenerEstablecimiento).toHaveBeenCalledWith('33')
    expect(screen.getByRole('heading', { name: 'Editar establecimiento' })).toBeTruthy()
    for (const texto of ['PS-1201-33', 'Puesto de Salud', 'San Marcos', 'DS-1201 · Distrito de Salud San Marcos']) {
      expect(screen.getByText(texto)).toBeTruthy()
    }
    for (const nombre of ['tipo', 'municipio', 'distrito']) {
      expect(document.querySelector(`select[name="${nombre}"]`)).toBeNull()
    }
    expect(listarTiposEstablecimiento).not.toHaveBeenCalled()
    expect(listarMunicipios).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/^Correo/).value).toBe('')
    expect(casilla('Envía el 5C a la DDRISS').getAttribute('aria-checked')).toBe('true')
  })

  test('sin cambios, "Guardar cambios" avisa que no hay nada que guardar y no llama a la API', async () => {
    await abrirEdicion()

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.')
    expect(editarEstablecimiento).not.toHaveBeenCalled()
  })

  test('sin cambios "Cancelar" vuelve sin preguntar; con un cambio pide confirmación', async () => {
    await abrirEdicion()
    escribir(/^Teléfono/, '5550 3010')

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Seguir editando' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())

    // Al dejarlo como estaba ya no hay cambios.
    escribir(/^Teléfono/, '1234')
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
    await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('envía solo lo que cambió y vuelve a la pestaña con el aviso', async () => {
    editarEstablecimiento.mockResolvedValue({ ...GUARDADO, nombreContacto: null })
    await abrirEdicion()
    escribir(/^Nombre\b/, 'Puesto de Salud Las Lagunas')
    escribir(/^Persona de contacto/, '')
    fireEvent.click(casilla('Su producción solo cuenta para la cobertura'))

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos'))
    expect(editarEstablecimiento).toHaveBeenCalledWith('33', {
      nombre: 'Puesto de Salud Las Lagunas',
      nombreContacto: null,
      soloCobertura: true,
    })
    expect(toast.success).toHaveBeenCalledWith('Establecimiento PS-1201-33 actualizado.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('un campo que cambió con un valor inválido muestra el error y no llama a la API', async () => {
    await abrirEdicion()
    escribir(/^Correo/, 'sin-arroba')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(await screen.findByText('El correo no es válido.')).toBeTruthy()
    expect(screen.queryByText('El teléfono debe tener 8 dígitos y empezar con 2 a 7.')).toBeNull()
    expect(editarEstablecimiento).not.toHaveBeenCalled()
  })

  test('"Editar" en la pestaña abre la subruta, y "Cancelar" vuelve con los mismos filtros', async () => {
    obtenerEstablecimiento.mockResolvedValue(GUARDADO)
    listarEstablecimientos.mockResolvedValue([GUARDADO])
    montar('/administracion/establecimientos?estado=activos', [...PERMISOS, 'ESTABLECIMIENTO_EDITAR'])
    // Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
    fireEvent.keyDown(await screen.findByRole('button', { name: 'Acciones de PS-1201-33' }), { key: 'Enter' })
    fireEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: 'Editar' }))

    await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos/33/editar'))
    await waitFor(() => expect(screen.getByLabelText(/^Nombre\b/).value).toBe(GUARDADO.nombre))
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(ubicacion()).toBe('/administracion/establecimientos?estado=activos'))
    expect(editarEstablecimiento).not.toHaveBeenCalled()
  })

  test('un externo muestra que no lleva distrito', async () => {
    obtenerEstablecimiento.mockResolvedValue({
      ...GUARDADO,
      esExterno: true,
      distritoSaludId: null,
      distritoSaludCodigo: null,
      distritoSaludNombre: null,
    })
    montar('/administracion/establecimientos/33/editar')

    expect(await screen.findByText('Establecimiento externo: no lleva distrito de salud.')).toBeTruthy()
  })

  test('un error de la API se muestra y el formulario conserva lo escrito', async () => {
    editarEstablecimiento.mockRejectedValue(
      new ErrorApi(422, 'MARCAS_INVALIDAS', 'Un establecimiento que envía el 5C o solo cuenta para cobertura debe reportar producción.'),
    )
    await abrirEdicion()
    escribir(/^Nombre\b/, 'Puesto de Salud Las Lagunas')

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

    expect(
      await screen.findByText('Un establecimiento que envía el 5C o solo cuenta para cobertura debe reportar producción.'),
    ).toBeTruthy()
    expect(screen.getByLabelText(/^Nombre\b/).value).toBe('Puesto de Salud Las Lagunas')
  })
})
