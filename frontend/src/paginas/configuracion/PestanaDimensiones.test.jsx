import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { desactivarDimension, listarDimensiones, reactivarDimension } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfiguracion from './PaginaConfiguracion.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarVacunas: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarDimensiones: vi.fn(),
  desactivarDimension: vi.fn(),
  reactivarDimension: vi.fn(),
}))

const valor = (codigo, etiqueta, orden, extra = {}) => ({ codigo, etiqueta, orden, activo: true, enUso: false, ...extra })

const dimension = (codigo, nombre, valores, extra = {}) => ({
  id: `id-${codigo}`,
  codigo,
  nombre,
  descripcion: null,
  tipo: 'CATEGORICA',
  activa: true,
  enUso: false,
  valores,
  ...extra,
})

const DIMENSIONES = [
  dimension('estado_embarazo', 'Estado de embarazo', [valor('EMBARAZADA', 'Embarazada', 1), valor('NO_EMBARAZADA', 'No embarazada', 2)]),
  dimension(
    'grupo_edad',
    'Grupo de edad',
    [
      valor('MENOR_1', '< 1 año', 1, { enUso: true, edadMinMeses: 0, edadMaxMeses: 12, sinPoblacion: false }),
      valor('2_4', '2 a 4 años', 2, { activo: false, edadMinMeses: 24, edadMaxMeses: 60, sinPoblacion: true }),
      valor('10_14', '10 a 14 años', 3, { activo: false, edadMinMeses: 120, edadMaxMeses: 180, sinPoblacion: true }),
    ],
    { tipo: 'RANGO_EDAD', enUso: true },
  ),
  dimension('via', 'Vía de aplicación', [valor('IM', 'Intramuscular', 1)]),
  dimension('pueblo', 'Pueblo de pertenencia', [valor('MAYA', 'Maya', 1)], { activa: false }),
]

const CONSULTAR = ['CONFIGURACION_CONSULTAR', 'DIMENSION_CONSULTAR']
const TODOS = [...CONSULTAR, 'DIMENSION_CREAR', 'DIMENSION_EDITAR']

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
        <PaginaConfiguracion />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

async function abrir(ruta = '/configuracion?pestana=dimensiones', permisos = CONSULTAR) {
  montar(ruta, permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando dimensiones')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Dimensiones' })
const filas = () => within(tabla()).getAllByRole('row').slice(1)
const codigos = () => filas().map((fila) => within(fila).getAllByRole('cell')[0].textContent)
const filaDe = (codigo) => within(tabla()).getByRole('cell', { name: codigo }).closest('tr')
const celdasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell')
const insignias = (celda) => [...celda.querySelectorAll('[data-slot="badge"]')].map((b) => b.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarDimensiones.mockResolvedValue(DIMENSIONES)
})

test('la pestaña Dimensiones aparece con DIMENSION_CONSULTAR y pide la lista sin filtro', async () => {
  await abrir('/configuracion', CONSULTAR)

  expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Dimensiones'])
  expect(listarDimensiones).toHaveBeenCalledTimes(1)
  expect(listarDimensiones).toHaveBeenCalledWith({})
  expect(screen.getByText('Dimensiones de desagregación')).toBeTruthy()
  expect(codigos()).toEqual(['estado_embarazo', 'grupo_edad', 'via', 'pueblo'])
})

test('sin DIMENSION_CONSULTAR no aparece la pestaña', () => {
  montar('/configuracion?pestana=dimensiones', ['CONFIGURACION_CONSULTAR'])

  expect(screen.queryByRole('tab', { name: 'Dimensiones' })).toBeNull()
  expect(listarDimensiones).not.toHaveBeenCalled()
})

test('la tabla muestra el tipo, los valores activos en orden, "+N inactivos" y el estado', async () => {
  await abrir()

  const edad = celdasDe('grupo_edad')
  expect(edad[1].textContent).toBe('Grupo de edad')
  expect(edad[2].textContent).toBe('Rango de edad')
  expect(insignias(edad[3])).toEqual(['< 1 año'])
  expect(within(edad[3]).getByText('+2 inactivos')).toBeTruthy()
  expect(insignias(edad[4])).toEqual(['Activa', 'En uso'])

  const embarazo = celdasDe('estado_embarazo')
  expect(embarazo[2].textContent).toBe('Categórica')
  expect(insignias(embarazo[3])).toEqual(['Embarazada', 'No embarazada'])
  expect(within(embarazo[3]).queryByText(/inactivos/)).toBeNull()
  expect(insignias(celdasDe('pueblo')[4])).toEqual(['Inactiva'])
})

test('cambiar el estado pide la lista con activa y lo deja en la URL; al abrir con activa se aplica', async () => {
  await abrir()

  listarDimensiones.mockResolvedValue(DIMENSIONES.filter((d) => !d.activa))
  fireEvent.change(document.querySelector('select[name="activa"]'), { target: { value: 'false' } })
  await waitFor(() => expect(codigos()).toEqual(['pueblo']))
  expect(listarDimensiones).toHaveBeenLastCalledWith({ activa: false })
  expect(ubicacion()).toBe('?pestana=dimensiones&activa=false')

  fireEvent.change(document.querySelector('select[name="activa"]'), { target: { value: 'todas' } })
  await waitFor(() => expect(listarDimensiones).toHaveBeenLastCalledWith({}))
  expect(ubicacion()).toBe('?pestana=dimensiones')
})

test('con activa=true en la URL pide solo las activas', async () => {
  await abrir('/configuracion?pestana=dimensiones&activa=true')
  expect(listarDimensiones).toHaveBeenCalledWith({ activa: true })
})

test('sin dimensiones con ese estado lo dice', async () => {
  listarDimensiones.mockResolvedValue([])
  await abrir()
  expect(screen.getByText('No hay dimensiones con ese estado.')).toBeTruthy()
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir', async () => {
  listarDimensiones.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar las dimensiones: Ocurrió un error interno.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(tabla()).toBeTruthy())
  expect(listarDimensiones).toHaveBeenCalledTimes(2)
})

describe('acciones', () => {
  test('sin DIMENSION_CREAR ni DIMENSION_EDITAR no hay botón de alta ni columna de acciones', async () => {
    await abrir()

    expect(screen.queryByRole('link', { name: /Nueva dimensión/ })).toBeNull()
    expect(within(tabla()).queryByRole('columnheader', { name: 'Acciones' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'Editar via' })).toBeNull()
  })

  test('con los permisos aparecen "Nueva dimensión" y los enlaces de edición', async () => {
    await abrir(undefined, TODOS)

    expect(screen.getByRole('link', { name: /Nueva dimensión/ }).getAttribute('href')).toBe('/configuracion/dimensiones/nueva')
    expect(screen.getByRole('link', { name: 'Editar grupo_edad' }).getAttribute('href')).toBe(
      '/configuracion/dimensiones/grupo_edad/editar',
    )
  })

  test('"Desactivar" está deshabilitado en una dimensión en uso, con el motivo en un Tooltip', async () => {
    await abrir(undefined, TODOS)

    const boton = screen.getByRole('button', { name: 'Desactivar grupo_edad' })
    expect(boton.disabled).toBe(true)
    fireEvent.focus(boton.parentElement)
    expect((await screen.findAllByText('La usa un esquema vigente o en borrador.')).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Desactivar via' }).disabled).toBe(false)
  })

  test('desactivar una dimensión pide confirmación, reemplaza la fila y muestra el aviso', async () => {
    const via = DIMENSIONES.find((d) => d.codigo === 'via')
    desactivarDimension.mockResolvedValue({ ...via, activa: false })
    await abrir(undefined, TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar via' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Desactivar la dimensión Vía de aplicación?')).toBeTruthy()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Desactivar' }))

    expect(await screen.findByText('Dimensión Vía de aplicación desactivada.')).toBeTruthy()
    expect(desactivarDimension).toHaveBeenCalledWith('via')
    expect(insignias(celdasDe('via')[4])).toEqual(['Inactiva'])
    expect(screen.getByRole('button', { name: 'Reactivar via' })).toBeTruthy()
    expect(listarDimensiones).toHaveBeenCalledTimes(1)
  })

  test('reactivar una dimensión inactiva la deja "Activa"', async () => {
    const pueblo = DIMENSIONES.find((d) => d.codigo === 'pueblo')
    reactivarDimension.mockResolvedValue({ ...pueblo, activa: true })
    await abrir(undefined, TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Reactivar pueblo' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reactivar' }))

    expect(await screen.findByText('Dimensión Pueblo de pertenencia reactivada.')).toBeTruthy()
    expect(reactivarDimension).toHaveBeenCalledWith('pueblo')
    expect(insignias(celdasDe('pueblo')[4])).toEqual(['Activa'])
  })

  test('un 409 de la API se muestra en un Alert y la fila no cambia', async () => {
    desactivarDimension.mockRejectedValue(
      new ErrorApi(409, 'DIMENSION_EN_USO', 'La dimensión via la usa un esquema de captura vigente o en borrador.'),
    )
    await abrir(undefined, TODOS)

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar via' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

    expect(await screen.findByText('La dimensión via la usa un esquema de captura vigente o en borrador.')).toBeTruthy()
    expect(insignias(celdasDe('via')[4])).toEqual(['Activa'])
  })
})
