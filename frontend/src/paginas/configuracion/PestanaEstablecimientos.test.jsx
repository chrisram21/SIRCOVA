import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { desactivarEstablecimiento, listarEstablecimientos, reactivarEstablecimiento } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  desactivarEstablecimiento: vi.fn(),
  reactivarEstablecimiento: vi.fn(),
}))

const establecimiento = (id, codigo, nombre, extra = {}) => ({
  id,
  codigo,
  nombre,
  tipoEstablecimientoId: 3,
  tipoEstablecimientoCodigo: 'CS',
  tipoEstablecimientoNombre: 'Centro de Salud',
  ddrissId: 1,
  distritoSaludId: 1,
  distritoSaludCodigo: 'DS-1201',
  distritoSaludNombre: 'Distrito de Salud San Marcos',
  municipioId: 1,
  municipioCodigoIne: '1201',
  municipioNombre: 'San Marcos',
  reportaProduccion: true,
  reporta5c: false,
  soloCobertura: false,
  esExterno: false,
  direccion: null,
  telefono: null,
  correo: null,
  nombreContacto: null,
  cuentasActivas: 0,
  activo: true,
  ...extra,
})

const PUESTO = { tipoEstablecimientoId: 4, tipoEstablecimientoCodigo: 'PS', tipoEstablecimientoNombre: 'Puesto de Salud' }
const TACANA = { municipioId: 7, municipioCodigoIne: '1207', municipioNombre: 'Tacaná', distritoSaludCodigo: 'DS-1207' }

const ESTABLECIMIENTOS = [
  establecimiento(1, 'CS-1201', 'Centro de Salud San Marcos', { reporta5c: true, cuentasActivas: 2 }),
  establecimiento(2, 'CS-1207', 'Centro de Salud Tacaná', { ...TACANA, reporta5c: true }),
  establecimiento(31, 'HOSP-SM', 'Hospital de San Marcos', {
    tipoEstablecimientoId: 1,
    tipoEstablecimientoNombre: 'Hospital',
    reporta5c: true,
    soloCobertura: true,
  }),
  establecimiento(33, 'PS-1201-33', 'Puesto de Salud Aldea Las Lagunas', { ...PUESTO, reportaProduccion: false }),
  establecimiento(34, 'PS-1207-01', 'Puesto de Salud Ixmulej', { ...PUESTO, ...TACANA, reportaProduccion: false, activo: false }),
  establecimiento(40, 'EXT-COATE', 'Hospital de Coatepeque (externo)', {
    tipoEstablecimientoId: 1,
    tipoEstablecimientoNombre: 'Hospital',
    distritoSaludId: null,
    distritoSaludCodigo: null,
    distritoSaludNombre: null,
    municipioId: 32,
    municipioCodigoIne: '0920',
    municipioNombre: 'Coatepeque',
    reportaProduccion: false,
    esExterno: true,
  }),
  // Envía el 5C, pero está inactivo: no cuenta.
  establecimiento(41, 'CS-1201-02', 'Centro de Salud Inactivo', { reporta5c: true, activo: false }),
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

function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

async function abrir(ruta = '/configuracion?pestana=establecimientos', permisos = ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR']) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaConfiguracion />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando establecimientos')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Establecimientos' })
const filas = () => within(tabla()).getAllByRole('row').slice(1)
const codigos = () => filas().map((fila) => within(fila).getAllByRole('cell')[0].textContent)
const filaDe = (codigo) => within(tabla()).getByRole('cell', { name: codigo }).closest('tr')
const celdasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell')
const elegirFiltro = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarEstablecimientos.mockResolvedValue(ESTABLECIMIENTOS)
})

test('con solo ESTABLECIMIENTO_CONSULTAR se ve la pestaña Establecimientos, que pide la lista una vez', async () => {
  await abrir('/configuracion')

  expect(screen.getByRole('tab', { name: 'Establecimientos' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.queryByRole('tab', { name: 'Territorio' })).toBeNull()
  expect(listarEstablecimientos).toHaveBeenCalledTimes(1)
  expect(listarEstablecimientos).toHaveBeenCalledWith()
  expect(filas()).toHaveLength(ESTABLECIMIENTOS.length)
})

test('sin ESTABLECIMIENTO_CONSULTAR no aparece la pestaña', async () => {
  guardarSesion(crearSesion(['CONFIGURACION_CONSULTAR']))
  render(
    <MemoryRouter initialEntries={['/configuracion?pestana=establecimientos']}>
      <ProveedorSesion>
        <PaginaConfiguracion />
      </ProveedorSesion>
    </MemoryRouter>,
  )

  expect(screen.queryByRole('tab', { name: 'Establecimientos' })).toBeNull()
  expect(screen.getByText('No tiene acceso a ningún catálogo.')).toBeTruthy()
  expect(listarEstablecimientos).not.toHaveBeenCalled()
})

test('muestra las marcas como Badge y "—" en el distrito del externo', async () => {
  await abrir()

  const marcas = (codigo) => celdasDe(codigo)[5].textContent
  expect(marcas('CS-1201')).toBe('Envía 5C')
  expect(marcas('HOSP-SM')).toBe('Envía 5CSolo cobertura')
  expect(marcas('PS-1201-33')).toBe('Lo consolida otro')
  expect(marcas('EXT-COATE')).toBe('ExternoLo consolida otro')
  expect(celdasDe('EXT-COATE')[4].textContent).toBe('—')
  expect(celdasDe('CS-1201').map((c) => c.textContent)).toEqual([
    'CS-1201',
    'Centro de Salud San Marcos',
    'Centro de Salud',
    'San Marcos',
    'DS-1201',
    'Envía 5C',
    'Activo',
  ])
  expect(celdasDe('PS-1207-01')[6].textContent).toBe('Inactivo')
})

test('el conteo del 5C solo cuenta los activos', async () => {
  await abrir()

  expect(screen.getByText('Envían el 5C: 3 establecimientos activos.')).toBeTruthy()
})

test('la búsqueda y los filtros reducen la tabla sin pedir de nuevo y quedan en la URL', async () => {
  await abrir()

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), {
    target: { value: 'tacana' },
  })
  await waitFor(() => expect(codigos()).toEqual(['CS-1207']))
  expect(ubicacion()).toBe('?pestana=establecimientos&q=tacana')

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), { target: { value: '' } })
  elegirFiltro('municipio', 7)
  await waitFor(() => expect(codigos()).toEqual(['CS-1207', 'PS-1207-01']))

  elegirFiltro('tipo', 4)
  await waitFor(() => expect(codigos()).toEqual(['PS-1207-01']))

  elegirFiltro('estado', 'activos')
  expect(await screen.findByText('No hay establecimientos que coincidan con los filtros.')).toBeTruthy()
  expect(ubicacion()).toBe('?pestana=establecimientos&municipio=7&tipo=4&estado=activos')

  elegirFiltro('municipio', 'todos')
  await waitFor(() => expect(ubicacion()).toBe('?pestana=establecimientos&tipo=4&estado=activos'))
  expect(codigos()).toEqual(['PS-1201-33'])
  expect(listarEstablecimientos).toHaveBeenCalledTimes(1)
})

test('los filtros de la URL se aplican al abrir, y la búsqueda encuentra por código', async () => {
  await abrir('/configuracion?pestana=establecimientos&q=hosp-&estado=activos')

  expect(codigos()).toEqual(['HOSP-SM'])
  expect(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }).value).toBe('hosp-')
})

test('las opciones de municipio y tipo salen de la misma lista, sin repetir', async () => {
  await abrir()

  const opciones = (nombre) => [...document.querySelector(`select[name="${nombre}"]`).options].map((o) => o.textContent)
  expect(opciones('municipio')).toEqual(['Todos los municipios', 'Coatepeque', 'San Marcos', 'Tacaná'])
  expect(opciones('tipo')).toEqual(['Todos los tipos', 'Centro de Salud', 'Hospital', 'Puesto de Salud'])
})

test('sin establecimientos muestra "No hay establecimientos registrados."', async () => {
  listarEstablecimientos.mockResolvedValue([])

  await abrir()

  expect(screen.getByText('No hay establecimientos registrados.')).toBeTruthy()
})

test('sin establecimientos y con ESTABLECIMIENTO_CREAR, el aviso trae el enlace de registro', async () => {
  listarEstablecimientos.mockResolvedValue([])

  await abrir(undefined, ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR', 'ESTABLECIMIENTO_CREAR'])

  const vacio = screen.getByText('No hay establecimientos registrados.').parentElement
  expect(within(vacio).getByRole('link', { name: 'Registrar establecimiento' }).getAttribute('href')).toBe(
    '/configuracion/establecimientos/nuevo',
  )
})

test('sin ESTABLECIMIENTO_CREAR, el aviso de vacío no trae el enlace', async () => {
  listarEstablecimientos.mockResolvedValue([])

  await abrir()

  expect(screen.queryByRole('link', { name: 'Registrar establecimiento' })).toBeNull()
})

test('si falla la petición muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarEstablecimientos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(
    await screen.findByText('No se pudieron cargar los establecimientos: Ocurrió un error inesperado.'),
  ).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarEstablecimientos).toHaveBeenCalledTimes(2)
})

describe('acciones', () => {
  const CON_EDITAR = ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR', 'ESTABLECIMIENTO_EDITAR']

  // Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
  async function abrirMenu(codigo) {
    fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
    return screen.findByRole('menu')
  }

  async function elegirAccion(codigo, accion) {
    const menu = await abrirMenu(codigo)
    fireEvent.click(within(menu).getByRole('menuitem', { name: accion }))
  }

  test('sin ESTABLECIMIENTO_EDITAR no hay columna de acciones', async () => {
    await abrir()

    expect(within(tabla()).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acciones de CS-1207' })).toBeNull()
  })

  test('confirmar "Desactivar" llama a la API y la fila queda inactiva, con la acción "Reactivar"', async () => {
    const tacana = ESTABLECIMIENTOS.find((e) => e.codigo === 'CS-1207')
    desactivarEstablecimiento.mockResolvedValue({ ...tacana, activo: false })
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('CS-1207', 'Desactivar')
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Desactivar el establecimiento CS-1207 · Centro de Salud Tacaná?')).toBeTruthy()
    expect(within(dialogo).getByText('Su personal no podrá crear reportes nuevos.')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Establecimiento CS-1207 desactivado.'))
    expect(desactivarEstablecimiento).toHaveBeenCalledWith(2)
    expect(celdasDe('CS-1207')[6].textContent).toBe('Inactivo')
    const menu = await abrirMenu('CS-1207')
    expect(within(menu).getByRole('menuitem', { name: 'Reactivar' })).toBeTruthy()
    expect(listarEstablecimientos).toHaveBeenCalledTimes(1)
  })

  test('confirmar "Reactivar" llama a la API y la fila queda activa', async () => {
    const ixmulej = ESTABLECIMIENTOS.find((e) => e.codigo === 'PS-1207-01')
    reactivarEstablecimiento.mockResolvedValue({ ...ixmulej, activo: true })
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('PS-1207-01', 'Reactivar')
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Establecimiento PS-1207-01 reactivado.'))
    expect(reactivarEstablecimiento).toHaveBeenCalledWith(34)
    expect(celdasDe('PS-1207-01')[6].textContent).toBe('Activo')
  })

  test('con cuentas activas, "Desactivar" está deshabilitado', async () => {
    await abrir(undefined, CON_EDITAR)

    const menu = await abrirMenu('CS-1201')
    const desactivar = within(menu).getByRole('menuitem', { name: /Desactivar/ })
    expect(desactivar.getAttribute('aria-disabled')).toBe('true')
    expect(within(desactivar).getByText('Tiene cuentas activas')).toBeTruthy()
  })

  test('un 409 se muestra en un Alert y la fila no cambia', async () => {
    desactivarEstablecimiento.mockRejectedValue(
      new ErrorApi(409, 'ESTABLECIMIENTO_CON_CUENTAS', 'El establecimiento tiene 1 cuenta activa; muévala o desactívela en Usuarios primero.'),
    )
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('CS-1207', 'Desactivar')
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

    expect(
      await screen.findByText('El establecimiento tiene 1 cuenta activa; muévala o desactívela en Usuarios primero.'),
    ).toBeTruthy()
    expect(celdasDe('CS-1207')[6].textContent).toBe('Activo')
  })
})
