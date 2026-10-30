import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { desactivarVacuna, listarVacunas, reactivarVacuna } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaVacunas from './PaginaVacunas.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarDistritos: vi.fn(),
  listarEstablecimientos: vi.fn(),
  listarVacunas: vi.fn(),
  desactivarVacuna: vi.fn(),
  reactivarVacuna: vi.fn(),
}))

let siguienteId = 1
const dosis = (codigo, extra = {}) => ({
  id: siguienteId++,
  codigo,
  tipo: codigo === 'UNICA' ? 'UNICA' : codigo.startsWith('R') ? 'REFUERZO' : 'DOSIS',
  nombre: `Dosis ${codigo}`,
  orden: 1,
  completaEsquema: false,
  esTrazadora: false,
  activa: true,
  ...extra,
})

const vacuna = (id, codigo, nombre, listaDosis, extra = {}) => ({
  id,
  codigo,
  nombre,
  descripcion: null,
  ordenInforme: id,
  activa: true,
  dosis: listaDosis.map((d, i) => ({ ...d, orden: i + 1 })),
  ...extra,
})

const VACUNAS = [
  vacuna(1, 'HEPB', 'Hepatitis B (recién nacido)', [dosis('UNICA', { completaEsquema: true, esTrazadora: true })]),
  vacuna(4, 'HEXA', 'Hexavalente', [
    dosis('D1'),
    dosis('D2'),
    dosis('D3', { completaEsquema: true, esTrazadora: true }),
    dosis('R1'),
  ]),
  // D2 está inactiva: no se muestra y D1 completa el esquema.
  vacuna(9, 'SPR', 'Sarampión, Paperas y Rubéola (SPR)', [
    dosis('D1', { completaEsquema: true }),
    dosis('D2', { activa: false }),
  ]),
  vacuna(10, 'DPT', 'DPT (refuerzos)', [dosis('R1', { esTrazadora: true }), dosis('R2', { completaEsquema: true })], {
    activa: false,
  }),
]

const PERMISOS_REVISOR = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'VACUNA_CREAR', 'VACUNA_EDITAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'REVISOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

function montar(ruta, permisos) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaVacunas />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(ruta = '/administracion/vacunas', permisos = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR']) {
  montar(ruta, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando vacunas')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Vacunas' })
const filas = () => within(tabla()).getAllByRole('row').slice(1)
const codigos = () => filas().map((fila) => within(fila).getAllByRole('cell')[1].textContent)
const filaDe = (codigo) => within(tabla()).getByRole('cell', { name: codigo }).closest('tr')
const celdasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell')
const badgesDeDosis = (codigo) => [...celdasDe(codigo)[3].querySelectorAll('[data-slot="badge"]')]

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarVacunas.mockResolvedValue(VACUNAS)
})

test('con los permisos del Revisor se ve la pantalla Vacunas, que pide la lista una vez', async () => {
  await abrir('/administracion/vacunas', PERMISOS_REVISOR)

  expect(screen.getByRole('heading', { level: 1, name: 'Vacunas' })).toBeTruthy()
  expect(listarVacunas).toHaveBeenCalledTimes(1)
  expect(listarVacunas).toHaveBeenCalledWith()
  expect(screen.getByText('Catálogo nacional: los cambios aplican a todas las DDRISS.')).toBeTruthy()
  expect(codigos()).toEqual(['HEPB', 'HEXA', 'SPR', 'DPT'])
})

test('la tabla muestra el orden, el estado y un Badge por dosis activa, con la marca de la que completa', async () => {
  await abrir()

  expect(celdasDe('HEXA').map((c) => c.textContent)).toEqual(['4', 'HEXA', 'Hexavalente', 'D1D2D3R1', 'Activa'])
  expect(celdasDe('DPT')[4].textContent).toBe('Inactiva')

  const hexa = badgesDeDosis('HEXA')
  expect(hexa.map((b) => b.getAttribute('title'))).toEqual([null, null, 'Completa el esquema', null])
  expect(hexa.map((b) => b.querySelector('svg') !== null)).toEqual([false, false, true, false])
  // Las trazadoras van con la variante secondary.
  expect(hexa.map((b) => b.dataset.variant)).toEqual(['outline', 'outline', 'secondary', 'outline'])

  // La D2 de SPR está inactiva: no se muestra.
  expect(badgesDeDosis('SPR').map((b) => b.textContent)).toEqual(['D1'])
  expect(badgesDeDosis('SPR')[0].getAttribute('title')).toBe('Completa el esquema')
  expect(badgesDeDosis('DPT').map((b) => [b.textContent, b.getAttribute('title')])).toEqual([
    ['R1', null],
    ['R2', 'Completa el esquema'],
  ])
})

test('la búsqueda y el filtro de estado reducen la tabla sin pedir de nuevo y quedan en la URL', async () => {
  await abrir()

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), {
    target: { value: 'sarampion' },
  })
  await waitFor(() => expect(codigos()).toEqual(['SPR']))
  expect(ubicacion()).toBe('?q=sarampion')

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), { target: { value: 'he' } })
  await waitFor(() => expect(codigos()).toEqual(['HEPB', 'HEXA']))

  fireEvent.change(document.querySelector('select[name="estado"]'), { target: { value: 'inactivas' } })
  expect(await screen.findByText('No hay vacunas que coincidan con los filtros.')).toBeTruthy()
  expect(ubicacion()).toBe('?q=he&estado=inactivas')

  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }), { target: { value: '' } })
  await waitFor(() => expect(codigos()).toEqual(['DPT']))
  expect(ubicacion()).toBe('?estado=inactivas')
  expect(listarVacunas).toHaveBeenCalledTimes(1)
})

test('los filtros de la URL se aplican al abrir', async () => {
  await abrir('/administracion/vacunas?q=hexa&estado=activas')

  expect(codigos()).toEqual(['HEXA'])
  expect(screen.getByRole('searchbox', { name: 'Buscar por código o nombre' }).value).toBe('hexa')
})

test('sin vacunas muestra "No hay vacunas registradas."', async () => {
  listarVacunas.mockResolvedValue([])

  await abrir()

  expect(screen.getByText('No hay vacunas registradas.')).toBeTruthy()
})

test('sin vacunas y con VACUNA_CREAR, el aviso trae el enlace de registro', async () => {
  listarVacunas.mockResolvedValue([])

  await abrir(undefined, PERMISOS_REVISOR)

  const vacio = screen.getByText('No hay vacunas registradas.').parentElement
  expect(within(vacio).getByRole('link', { name: 'Registrar vacuna' }).getAttribute('href')).toBe(
    '/administracion/vacunas/nueva',
  )
})

test('sin VACUNA_CREAR, el aviso de vacío no trae el enlace', async () => {
  listarVacunas.mockResolvedValue([])

  await abrir()

  expect(screen.queryByRole('link', { name: 'Registrar vacuna' })).toBeNull()
})

test('si falla la petición muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarVacunas.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INESPERADO', 'Ocurrió un error inesperado.'))

  await abrir()

  expect(await screen.findByText('No se pudieron cargar las vacunas: Ocurrió un error inesperado.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarVacunas).toHaveBeenCalledTimes(2)
})

describe('acciones', () => {
  const CON_EDITAR = ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'VACUNA_EDITAR']

  // Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
  async function abrirMenu(codigo) {
    fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
    return screen.findByRole('menu')
  }

  async function elegirAccion(codigo, accion) {
    const menu = await abrirMenu(codigo)
    fireEvent.click(within(menu).getByRole('menuitem', { name: accion }))
  }

  test('sin VACUNA_EDITAR no hay columna de acciones', async () => {
    await abrir()

    expect(within(tabla()).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Acciones de HEXA' })).toBeNull()
  })

  test('desactivar la vacuna muestra "Inactiva" y la acción "Reactivar", sin pedir de nuevo la lista', async () => {
    const hexa = VACUNAS.find((v) => v.codigo === 'HEXA')
    desactivarVacuna.mockResolvedValue({ ...hexa, activa: false })
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('HEXA', 'Desactivar')
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Desactivar la vacuna HEXA · Hexavalente?')).toBeTruthy()
    expect(
      within(dialogo).getByText('No se ofrecerá en reportes nuevos; los reportes anteriores la conservan.'),
    ).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Vacuna HEXA desactivada.'))
    expect(desactivarVacuna).toHaveBeenCalledWith(4)
    expect(celdasDe('HEXA')[4].textContent).toBe('Inactiva')
    const menu = await abrirMenu('HEXA')
    expect(within(menu).getByRole('menuitem', { name: 'Reactivar' })).toBeTruthy()
    expect(listarVacunas).toHaveBeenCalledTimes(1)
  })

  test('reactivar una vacuna inactiva la deja "Activa"', async () => {
    const dpt = VACUNAS.find((v) => v.codigo === 'DPT')
    reactivarVacuna.mockResolvedValue({ ...dpt, activa: true })
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('DPT', 'Reactivar')
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Reactivar la vacuna DPT · DPT (refuerzos)?')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Reactivar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Vacuna DPT reactivada.'))
    expect(reactivarVacuna).toHaveBeenCalledWith(10)
    expect(celdasDe('DPT')[4].textContent).toBe('Activa')
  })

  test('un error al desactivar se muestra en un Alert y la fila no cambia', async () => {
    desactivarVacuna.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'La vacuna no existe.'))
    await abrir(undefined, CON_EDITAR)

    await elegirAccion('HEXA', 'Desactivar')
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

    expect(await screen.findByText('La vacuna no existe.')).toBeTruthy()
    expect(celdasDe('HEXA')[4].textContent).toBe('Activa')
  })
})
