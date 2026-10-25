import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { listarVacunas } from '@/api/catalogos.js'
import { descartarEsquema, listarDimensiones, listarEsquemas } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarVacunas: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  listarEsquemas: vi.fn(),
  descartarEsquema: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const fila = (id, codigo, nombre, vigente, borrador, activa = true) => ({
  vacuna: { id, codigo, nombre, activa },
  vigente,
  borrador,
})

const FILAS = [
  fila(2, 'HEXA', 'Hexavalente', { id: 'v-hexa', version: 2, territorio: NACIONAL }, { id: 'b-hexa', version: 3, creadoEn: '2026-10-15T15:00:00.000Z' }),
  fila(30, 'NUEVA', 'Nueva vacuna', null, null),
  fila(4, 'TD', 'Td', { id: 'v-td', version: 4, territorio: SAN_MARCOS }, null),
  fila(31, 'VIEJA', 'Vacuna retirada', null, { id: 'b-vieja', version: 1, creadoEn: '2026-10-20T15:00:00.000Z' }, false),
]

const CONSULTAR = ['CONFIGURACION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR']
const TODOS = [...CONSULTAR, 'ESQUEMA_CREAR', 'ESQUEMA_EDITAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

function montar(ruta, permisos) {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaConfiguracion />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(permisos = CONSULTAR) {
  montar('/configuracion?pestana=esquemas', permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando esquemas')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Esquemas de captura' })
const filaDe = (nombre) => within(tabla()).getByText(nombre).closest('tr')
const celdasDe = (nombre) => within(filaDe(nombre)).getAllByRole('cell')

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarEsquemas.mockResolvedValue(FILAS)
  // Sin la pestaña Esquemas (o al salir de ella) se abre la primera visible.
  listarVacunas.mockResolvedValue([])
  listarDimensiones.mockResolvedValue([])
})

test('la pestaña Esquemas aparece con sus tres permisos de consulta y pide la lista una vez', async () => {
  await abrir()

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Vacunas', 'Dimensiones', 'Esquemas'])
  expect(listarEsquemas).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Esquemas de captura')).toBeTruthy()
  expect(within(tabla()).getAllByRole('row')).toHaveLength(FILAS.length + 1)
})

test.each([
  ['ESQUEMA_CONSULTAR', ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR']],
  ['DIMENSION_CONSULTAR', ['CONFIGURACION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR']],
])('sin %s no aparece la pestaña', (_, permisos) => {
  montar('/configuracion?pestana=esquemas', permisos)

  expect(screen.queryByRole('tab', { name: 'Esquemas' })).toBeNull()
  expect(listarEsquemas).not.toHaveBeenCalled()
})

test('la tabla muestra el vigente que aplica con su territorio, "Sin esquema", el borrador y las vacunas inactivas', async () => {
  await abrir()

  const hexa = celdasDe('Hexavalente')
  expect(hexa[1].textContent).toBe('Versión 2 · Nacional')
  expect(hexa[2].textContent).toBe('Versión 3')

  const td = celdasDe('Td')
  expect(td[1].textContent).toBe('Versión 4 · DDRISS_SM')
  expect(td[2].textContent).toBe('—')

  expect(celdasDe('Nueva vacuna')[1].textContent).toBe('Sin esquema')
  expect(within(celdasDe('Vacuna retirada')[0]).getByText('Inactiva')).toBeTruthy()
})

test('sin ESQUEMA_CREAR ni ESQUEMA_EDITAR no hay columna de acciones', async () => {
  await abrir()

  expect(within(tabla()).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
  expect(screen.queryByRole('button', { name: /Crear borrador/ })).toBeNull()
  expect(screen.queryByRole('button', { name: /Descartar/ })).toBeNull()
})

test('con solo ESQUEMA_CREAR se puede crear pero no editar ni descartar', async () => {
  await abrir([...CONSULTAR, 'ESQUEMA_CREAR'])

  expect(screen.getByRole('button', { name: 'Crear borrador de TD' })).toBeTruthy()
  expect(screen.queryByRole('link', { name: 'Editar borrador de HEXA' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Descartar borrador de HEXA' })).toBeNull()
})

describe('crear un borrador', () => {
  async function elegir(codigo, opcion) {
    fireEvent.keyDown(screen.getByRole('button', { name: `Crear borrador de ${codigo}` }), { key: 'Enter' })
    const menu = await screen.findByRole('menu')
    expect(within(menu).getAllByRole('menuitem').map((m) => m.textContent)).toEqual([
      'Copiar la versión vigente',
      'Empezar vacío',
    ])
    fireEvent.click(within(menu).getByRole('menuitem', { name: opcion }))
  }

  test('con vigente, "Copiar la versión vigente" va al editor con origen=copia', async () => {
    await abrir(TODOS)
    await elegir('TD', 'Copiar la versión vigente')
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=4&origen=copia'))
  })

  test('con vigente, "Empezar vacío" va al editor con origen=vacio', async () => {
    await abrir(TODOS)
    await elegir('TD', 'Empezar vacío')
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=4&origen=vacio'))
  })

  test('sin vigente, "Crear borrador" va directo a vacío', async () => {
    await abrir(TODOS)
    fireEvent.click(screen.getByRole('button', { name: 'Crear borrador de NUEVA' }))
    await waitFor(() => expect(ubicacion()).toBe('/configuracion/esquemas/nuevo?vacuna=30&origen=vacio'))
  })

  test('una vacuna con borrador no ofrece crear otro, y una inactiva solo ofrece descartar el suyo', async () => {
    await abrir(TODOS)

    expect(screen.queryByRole('button', { name: 'Crear borrador de HEXA' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Editar borrador de HEXA' }).getAttribute('href')).toBe(
      '/configuracion/esquemas/b-hexa/editar',
    )
    expect(screen.queryByRole('link', { name: 'Editar borrador de VIEJA' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Descartar borrador de VIEJA' })).toBeTruthy()
  })
})

describe('descartar un borrador', () => {
  test('pide confirmación, llama a la API, quita el borrador de la fila y muestra el aviso', async () => {
    descartarEsquema.mockResolvedValue(null)
    await abrir(TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador de HEXA' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Descartar el borrador versión 3 de Hexavalente?')).toBeTruthy()
    expect(within(dialogo).getByText('No se puede deshacer.')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Descartar' }))

    expect(await screen.findByText('Borrador versión 3 de Hexavalente descartado.')).toBeTruthy()
    expect(descartarEsquema).toHaveBeenCalledWith('b-hexa')
    expect(celdasDe('Hexavalente')[2].textContent).toBe('—')
    expect(screen.getByRole('button', { name: 'Crear borrador de HEXA' })).toBeTruthy()
    expect(listarEsquemas).toHaveBeenCalledTimes(1)
  })

  test('un 409 de la API se muestra en un Alert y la fila no cambia', async () => {
    descartarEsquema.mockRejectedValue(
      new ErrorApi(
        409,
        'ESQUEMA_NO_EDITABLE',
        'Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.',
      ),
    )
    await abrir(TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Descartar borrador de HEXA' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Descartar' }))

    expect(
      await screen.findByText('Solo se edita un borrador de su DDRISS; para cambiar un esquema publicado, cree un borrador nuevo.'),
    ).toBeTruthy()
    expect(celdasDe('Hexavalente')[2].textContent).toBe('Versión 3')
  })
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarEsquemas.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar('/configuracion?pestana=esquemas', CONSULTAR)

  expect(await screen.findByText('No se pudieron cargar los esquemas: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarEsquemas).toHaveBeenCalledTimes(2)
})
