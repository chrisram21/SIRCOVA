import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import {
  crearDistrito,
  desactivarDistrito,
  listarDdriss,
  listarDistritos,
  listarMunicipios,
  reactivarDistrito,
  renombrarDistrito,
} from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  crearDistrito: vi.fn(),
  renombrarDistrito: vi.fn(),
  desactivarDistrito: vi.fn(),
  reactivarDistrito: vi.fn(),
}))

const DDRISS = [{ id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos', departamentoId: 1, departamentoNombre: 'San Marcos' }]

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
  municipio(7, '1207', 'Tacaná'),
  municipio(32, '0920', 'Coatepeque', { departamentoId: 3, departamentoNombre: 'Quetzaltenango' }),
  municipio(31, '9999', 'Migrantes / fuera de San Marcos', { departamentoId: 2, departamentoNombre: 'No especificado / otro' }),
]

const distrito = (id, codigo, nombre, municipioId, municipioNombre, extra = {}) => ({
  id,
  codigo,
  nombre,
  ddrissId: 1,
  municipioId,
  municipioCodigoIne: codigo.slice(3, 7),
  municipioNombre,
  establecimientosActivos: 0,
  activo: true,
  ...extra,
})
const DISTRITOS = [
  distrito(1, 'DS-1201', 'Distrito de Salud San Marcos', 1, 'San Marcos', { establecimientosActivos: 3 }),
  distrito(7, 'DS-1207', 'Distrito de Salud Tacaná', 7, 'Tacaná', { establecimientosActivos: 2 }),
  distrito(31, 'DS-1207-02', 'Distrito de Salud Tacaná Norte', 7, 'Tacaná'),
  distrito(32, 'DS-1207-03', 'Distrito de Salud Tacaná Sur', 7, 'Tacaná', { activo: false }),
]

const TODOS_LOS_PERMISOS = [
  'CONFIGURACION_CONSULTAR',
  'MUNICIPIO_CONSULTAR',
  'DDRISS_CONSULTAR',
  'DISTRITO_CONSULTAR',
  'DISTRITO_CREAR',
  'DISTRITO_EDITAR',
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

async function abrir(permisos = TODOS_LOS_PERMISOS, ruta = '/configuracion') {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaConfiguracion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando catálogo territorial')).toBeNull())
}

const tabla = (nombre) => screen.getByRole('table', { name: nombre })
const filaDe = (nombreTabla, texto) => within(tabla(nombreTabla)).getByRole('cell', { name: texto }).closest('tr')
const filasDe = (nombreTabla) => within(tabla(nombreTabla)).getAllByRole('row').slice(1)
const elegirFiltro = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })

// Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
async function abrirMenu(codigo) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
  return screen.findByRole('menu')
}

async function elegirAccion(codigo, accion) {
  const menu = await abrirMenu(codigo)
  fireEvent.click(within(menu).getByRole('menuitem', { name: accion }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarDdriss.mockResolvedValue(DDRISS)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarDistritos.mockResolvedValue(DISTRITOS)
})

test('abre la pestaña Territorio y pide los municipios de procedencia, incluidos los inactivos', async () => {
  await abrir()

  expect(screen.getByRole('heading', { name: 'Catálogos del sistema' })).toBeTruthy()
  expect(screen.getByRole('tab', { name: 'Territorio' }).getAttribute('aria-selected')).toBe('true')
  expect(listarMunicipios).toHaveBeenCalledWith({ alcance: 'procedencia', incluirInactivos: true })
  expect(listarDdriss).toHaveBeenCalledTimes(1)
  expect(listarDistritos).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Departamento sede: San Marcos')).toBeTruthy()
})

test('la tabla de municipios marca el 9999 y los de fuera del departamento, y cuenta los distritos activos', async () => {
  await abrir()

  expect(filasDe('Municipios')).toHaveLength(MUNICIPIOS.length)
  const migrantes = filaDe('Municipios', '9999')
  expect(within(migrantes).getByText('Procedencia especial')).toBeTruthy()
  expect(within(filaDe('Municipios', '0920')).getByText('Fuera del departamento')).toBeTruthy()
  expect(within(filaDe('Municipios', '1201')).queryByText('Fuera del departamento')).toBeNull()
  // Tacaná tiene tres distritos, uno inactivo.
  const celdas = within(filaDe('Municipios', '1207')).getAllByRole('cell').map((c) => c.textContent)
  expect(celdas).toEqual(['1207', 'Tacaná', 'San Marcos', '2', 'Activo'])
})

test('un municipio inactivo lleva el Badge "Inactivo"', async () => {
  listarMunicipios.mockResolvedValue([...MUNICIPIOS, municipio(40, '1230', 'La Blanca', { activo: false })])

  await abrir()

  expect(within(filaDe('Municipios', '1230')).getByText('Inactivo')).toBeTruthy()
})

test('los filtros de municipio y estado reducen la tabla de distritos sin pedir de nuevo', async () => {
  await abrir()
  expect(filasDe('Distritos de salud')).toHaveLength(DISTRITOS.length)

  elegirFiltro('municipio', 7)
  await waitFor(() => expect(filasDe('Distritos de salud')).toHaveLength(3))

  elegirFiltro('estado', 'inactivos')
  await waitFor(() => expect(filasDe('Distritos de salud')).toHaveLength(1))
  expect(within(tabla('Distritos de salud')).getByText('DS-1207-03')).toBeTruthy()

  elegirFiltro('municipio', 1)
  expect(await screen.findByText('No hay distritos que coincidan con los filtros.')).toBeTruthy()
  expect(listarDistritos).toHaveBeenCalledTimes(1)
})

test('el filtro de municipio solo ofrece los del departamento sede', async () => {
  await abrir()

  const opciones = [...document.querySelector('select[name="municipio"]').options].map((o) => o.textContent)
  expect(opciones).toEqual(['Todos los municipios', 'San Marcos', 'Tacaná'])
})

test('sin distritos muestra "No hay distritos de salud registrados."', async () => {
  listarDistritos.mockResolvedValue([])

  await abrir()

  expect(screen.getByText('No hay distritos de salud registrados.')).toBeTruthy()
})

test('si falla una petición muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarDistritos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(
    await screen.findByText('No se pudo cargar el catálogo territorial: Ocurrió un error inesperado.'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(screen.getByRole('table', { name: 'Distritos de salud' })).toBeTruthy())
  expect(listarDistritos).toHaveBeenCalledTimes(2)
})

test('sin DISTRITO_CONSULTAR no aparece la pestaña', async () => {
  await abrir(['CONFIGURACION_CONSULTAR', 'MUNICIPIO_CONSULTAR'])

  expect(screen.queryByRole('tab', { name: 'Territorio' })).toBeNull()
  expect(screen.getByText('No tiene acceso a ningún catálogo.')).toBeTruthy()
  expect(listarDistritos).not.toHaveBeenCalled()
})

test('sin DDRISS_CONSULTAR tampoco aparece, porque la pestaña pide GET /ddriss', async () => {
  await abrir(['CONFIGURACION_CONSULTAR', 'MUNICIPIO_CONSULTAR', 'DISTRITO_CONSULTAR'])

  expect(screen.queryByRole('tab', { name: 'Territorio' })).toBeNull()
  expect(listarDdriss).not.toHaveBeenCalled()
})

test('una pestaña desconocida en la URL abre la primera visible', async () => {
  await abrir(TODOS_LOS_PERMISOS, '/configuracion?pestana=otra')

  expect(screen.getByRole('tab', { name: 'Territorio' }).getAttribute('aria-selected')).toBe('true')
})

describe('registrar y renombrar', () => {
  const dialogo = () => screen.getByRole('dialog')
  const escribirNombre = (texto) =>
    fireEvent.change(within(dialogo()).getByLabelText('Nombre'), { target: { value: texto } })
  const guardar = () => fireEvent.click(within(dialogo()).getByRole('button', { name: 'Guardar' }))

  async function abrirRegistro() {
    await abrir()
    fireEvent.click(screen.getByRole('button', { name: 'Registrar distrito' }))
    return screen.findByRole('dialog')
  }

  test('registrar envía el municipio y el nombre, agrega la fila con el código de la respuesta y avisa', async () => {
    const nuevo = distrito(40, 'DS-1207-04', 'Distrito de Salud Tacaná Este', 7, 'Tacaná')
    crearDistrito.mockResolvedValue(nuevo)
    await abrirRegistro()
    expect(within(dialogo()).getByText('El código se genera al guardar.')).toBeTruthy()

    elegirFiltro('municipioId', 7)
    escribirNombre('  Distrito de Salud   Tacaná Este ')
    guardar()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(crearDistrito).toHaveBeenCalledWith({ municipioId: 7, nombre: 'Distrito de Salud Tacaná Este' })
    expect(within(tabla('Distritos de salud')).getByText('DS-1207-04')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Distrito DS-1207-04 registrado.')
    // Tacaná pasa a tener tres distritos activos.
    expect(within(filaDe('Municipios', '1207')).getAllByRole('cell')[3].textContent).toBe('3')
  })

  test('el Select de municipio solo ofrece los activos de la sede: ni el 9999 ni Coatepeque', async () => {
    listarMunicipios.mockResolvedValue([...MUNICIPIOS, municipio(40, '1230', 'La Blanca', { activo: false })])
    await abrirRegistro()

    const opciones = [...document.querySelector('select[name="municipioId"]').options]
      .map((o) => o.textContent)
      .filter(Boolean)
    expect(opciones).toEqual(['San Marcos', 'Tacaná'])
  })

  test('un nombre de 2 caracteres o sin municipio muestra el error y no llama a la API', async () => {
    await abrirRegistro()

    escribirNombre('DS')
    guardar()

    expect(await within(dialogo()).findByText('El nombre del distrito debe tener entre 3 y 120 caracteres.')).toBeTruthy()
    expect(within(dialogo()).getByText('Elija el municipio del distrito.')).toBeTruthy()
    expect(crearDistrito).not.toHaveBeenCalled()
  })

  test('un error de la API se muestra dentro del Dialog, que sigue abierto', async () => {
    crearDistrito.mockRejectedValue(
      new ErrorApi(409, 'DISTRITO_DUPLICADO', 'Ya hay un distrito con ese nombre en el municipio.'),
    )
    await abrirRegistro()

    elegirFiltro('municipioId', 7)
    escribirNombre('Distrito de Salud Tacaná Norte')
    guardar()

    expect(await within(dialogo()).findByText('Ya hay un distrito con ese nombre en el municipio.')).toBeTruthy()
    expect(within(dialogo()).getByRole('button', { name: 'Guardar' }).disabled).toBe(false)
  })

  test('renombrar muestra el código y el municipio como texto, envía solo el nombre y reemplaza la fila', async () => {
    const renombrado = { ...DISTRITOS[2], nombre: 'Distrito de Salud Tacaná Alto' }
    renombrarDistrito.mockResolvedValue(renombrado)
    await abrir()

    await elegirAccion('DS-1207-02', 'Renombrar')
    await screen.findByRole('dialog')
    expect(within(dialogo()).getByText('DS-1207-02')).toBeTruthy()
    expect(within(dialogo()).getByText('Tacaná')).toBeTruthy()
    expect(within(dialogo()).queryByRole('combobox')).toBeNull()
    expect(within(dialogo()).getByLabelText('Nombre').value).toBe('Distrito de Salud Tacaná Norte')

    escribirNombre('Distrito de Salud Tacaná Alto')
    guardar()

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(renombrarDistrito).toHaveBeenCalledWith(31, 'Distrito de Salud Tacaná Alto')
    expect(within(filaDe('Distritos de salud', 'DS-1207-02')).getByText('Distrito de Salud Tacaná Alto')).toBeTruthy()
    expect(filasDe('Distritos de salud')).toHaveLength(DISTRITOS.length)
    expect(screen.getByRole('status').textContent).toBe('Distrito DS-1207-02 actualizado.')
  })

  test('sin DISTRITO_CREAR no aparece "Registrar distrito", y sin DISTRITO_EDITAR no hay acciones', async () => {
    await abrir(['CONFIGURACION_CONSULTAR', 'DDRISS_CONSULTAR', 'MUNICIPIO_CONSULTAR', 'DISTRITO_CONSULTAR'])

    expect(screen.queryByRole('button', { name: 'Registrar distrito' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acciones de DS-1201' })).toBeNull()
    expect(within(tabla('Distritos de salud')).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  })
})

describe('desactivar y reactivar', () => {
  const confirmar = async (boton) => {
    const alerta = await screen.findByRole('alertdialog')
    fireEvent.click(within(alerta).getByRole('button', { name: boton }))
  }

  test('confirmar "Desactivar" llama a la API y la fila queda "Inactivo", con la acción "Reactivar"', async () => {
    desactivarDistrito.mockResolvedValue({ ...DISTRITOS[2], activo: false })
    await abrir()

    await elegirAccion('DS-1207-02', 'Desactivar')
    const alerta = await screen.findByRole('alertdialog')
    expect(within(alerta).getByText('¿Desactivar el distrito DS-1207-02 · Distrito de Salud Tacaná Norte?')).toBeTruthy()
    await confirmar('Desactivar')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(desactivarDistrito).toHaveBeenCalledWith(31)
    expect(within(filaDe('Distritos de salud', 'DS-1207-02')).getByText('Inactivo')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('Distrito DS-1207-02 desactivado.')
    const menu = await abrirMenu('DS-1207-02')
    expect(within(menu).getAllByRole('menuitem').map((o) => o.textContent)).toEqual(['Renombrar', 'Reactivar'])
  })

  test('confirmar "Reactivar" llama a la API y la fila vuelve a "Activo"', async () => {
    reactivarDistrito.mockResolvedValue({ ...DISTRITOS[3], activo: true })
    await abrir()

    await elegirAccion('DS-1207-03', 'Reactivar')
    await confirmar('Reactivar')

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(reactivarDistrito).toHaveBeenCalledWith(32)
    expect(within(filaDe('Distritos de salud', 'DS-1207-03')).getByText('Activo')).toBeTruthy()
  })

  test('con establecimientos activos, "Desactivar" está deshabilitado y lo explica', async () => {
    await abrir()

    const menu = await abrirMenu('DS-1201')
    const desactivar = within(menu).getByRole('menuitem', { name: /^Desactivar/ })
    expect(desactivar.getAttribute('aria-disabled')).toBe('true')
    expect(within(desactivar).getByText('Tiene establecimientos activos')).toBeTruthy()
    fireEvent.click(desactivar)
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('un 409 de la API se muestra en un Alert y la fila no cambia', async () => {
    desactivarDistrito.mockRejectedValue(
      new ErrorApi(
        409,
        'DISTRITO_CON_ESTABLECIMIENTOS',
        'El distrito tiene 1 establecimiento activo; muévalos o desactívelos primero.',
      ),
    )
    await abrir()

    await elegirAccion('DS-1207-02', 'Desactivar')
    await confirmar('Desactivar')

    expect(
      await screen.findByText('El distrito tiene 1 establecimiento activo; muévalos o desactívelos primero.'),
    ).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(within(filaDe('Distritos de salud', 'DS-1207-02')).getByText('Activo')).toBeTruthy()
  })
})
