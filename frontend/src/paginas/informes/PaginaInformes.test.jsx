import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarDdriss, listarRedes } from '@/api/catalogos.js'
import { obtenerInforme, obtenerOpcionesInformes } from '@/api/informes.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaInformes from './PaginaInformes.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarDdriss: vi.fn(), listarRedes: vi.fn() }))
vi.mock('@/api/informes.js', () => ({ obtenerOpcionesInformes: vi.fn(), obtenerInforme: vi.fn() }))

const SAN_MARCOS = { id: 1, codigoIne: '1201', nombre: 'San Marcos' }
const SAN_PEDRO = { id: 4, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' }
const OPCIONES = {
  meses: [
    { anio: 2026, mes: 9, estado: 'EN_CIERRE' },
    { anio: 2026, mes: 8, estado: 'CERRADO' },
    { anio: 2026, mes: 2, estado: 'CERRADO' },
  ],
  vacunas: [{ codigo: 'HEXA', nombre: 'Hexavalente', activa: true }],
  municipios: [SAN_MARCOS, SAN_PEDRO],
}
const REDES = [{ id: 3, nombre: 'Red No. 1', municipios: [{ id: 4, nombre: 'San Pedro Sacatepéquez' }] }]
const informe = (cambios = {}) => ({
  informe: 'poblacion-propia',
  nivel: 'municipio',
  desde: { anio: 2026, mes: 2 },
  hasta: { anio: 2026, mes: 8 },
  incluirAprobados: false,
  columnas: [
    { vacuna: { codigo: 'HEXA', nombre: 'Hexavalente' }, seccion: { grupoEdad: 'MENOR_1', titulo: '< 1 año' },
      dosis: { id: 7, codigo: 'D1' } },
  ],
  filas: [
    { id: 1, codigo: '1201', nombre: 'San Marcos', municipio: null, fueraDelConsolidado: false, cantidades: [1234] },
  ],
  total: { cantidades: [1234] },
  dosisFueraDelConsolidado: 0,
  mesesSinCerrar: [],
  preliminar: false,
  ...cambios,
})

function crearSesion(permisos, { rol = 'REVISOR', ddrissId = 1 } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'estadigrafa',
      rol,
      permisos,
      empleado: { nombres: 'Rosa', apellidos: 'Méndez', ddrissId, establecimientoId: null, municipioId: null },
    },
  }
}

function montar({ url = '/informes', permisos = ['INFORME_CONSULTAR'], ...sesion } = {}) {
  guardarSesion(crearSesion(permisos, sesion))
  const router = createMemoryRouter(
    [{ path: '/informes', element: <ProveedorSesion><PaginaInformes /></ProveedorSesion> }],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const SIN_GENERAR = 'Elige el informe y los filtros y pulsa «Generar».'
const nativo = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const elegir = (nombre, valor) => fireEvent.change(nativo(nombre), { target: { value: valor } })
const generar = () => fireEvent.click(screen.getByRole('button', { name: 'Generar' }))
const busqueda = (router) => Object.fromEntries(new URLSearchParams(router.state.location.search))

beforeEach(() => {
  obtenerOpcionesInformes.mockResolvedValue(OPCIONES)
  obtenerInforme.mockResolvedValue(informe())
  listarRedes.mockResolvedValue(REDES)
})

test('sin filtros en la URL: valores por defecto y la invitación a generar, sin pedir el informe', async () => {
  montar()
  expect(await screen.findByText(SIN_GENERAR)).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1, name: 'Informes' })).toBeTruthy()
  expect(nativo('informe').value).toBe('poblacion-propia')
  expect([nativo('desde-anio').value, nativo('desde-mes').value]).toEqual(['2026', '2'])
  expect([nativo('hasta-anio').value, nativo('hasta-mes').value]).toEqual(['2026', '8'])
  expect(nativo('nivel').value).toBe('municipio')
  expect(screen.getByText(/aplicó a personas de su propio municipio/)).toBeTruthy()
  expect(obtenerInforme).not.toHaveBeenCalled()
})

test('«Generar» escribe los filtros en la URL y muestra el informe', async () => {
  const router = montar()
  await screen.findByText(SIN_GENERAR)
  elegir('nivel', 'distrito')
  generar()
  await waitFor(() => expect(busqueda(router)).toEqual({
    informe: 'poblacion-propia', desde: '2026-02', hasta: '2026-08', nivel: 'distrito',
  }))
  await waitFor(() => expect(obtenerInforme).toHaveBeenCalledWith({
    informe: 'poblacion-propia', desde: '2026-02', hasta: '2026-08', nivel: 'distrito', vacuna: undefined,
    redId: undefined, municipioIds: [], incluirAprobados: false, ddrissId: undefined,
  }))
  expect(await screen.findByRole('heading', { level: 2 })).toBeTruthy()
  expect(screen.getAllByText('1,234')).toHaveLength(2)
})

test('una URL con filtros genera el informe al entrar, con su título y su rango', async () => {
  montar({ url: '/informes?informe=residencia&desde=2026-02&hasta=2026-08&aprobados=si' })
  expect(await screen.findByRole('heading', { level: 2, name: 'Producción a la población propia · Municipio' }))
    .toBeTruthy()
  expect(screen.getByText('De febrero de 2026 a agosto de 2026')).toBeTruthy()
  expect(obtenerInforme).toHaveBeenCalledWith(expect.objectContaining({
    informe: 'residencia', desde: '2026-02', hasta: '2026-08', incluirAprobados: true,
  }))
  expect(nativo('informe').value).toBe('residencia')
})

test('cambiar un filtro sin pulsar «Generar» no cambia la URL ni el informe', async () => {
  const router = montar({ url: '/informes?informe=total&desde=2026-02&hasta=2026-08' })
  await screen.findAllByText('1,234')
  elegir('informe', 'residencia')
  elegir('hasta-mes', '9')
  expect(nativo('informe').value).toBe('residencia')
  expect(busqueda(router)).toEqual({ informe: 'total', desde: '2026-02', hasta: '2026-08' })
  expect(obtenerInforme).toHaveBeenCalledTimes(1)
})

test('con el informe por residencia, el nivel Establecimiento pasa a Municipio', async () => {
  const router = montar()
  await screen.findByText(SIN_GENERAR)
  elegir('nivel', 'establecimiento')
  expect(nativo('nivel').value).toBe('establecimiento')
  elegir('informe', 'residencia')
  expect(nativo('nivel').value).toBe('municipio')
  generar()
  await waitFor(() => expect(busqueda(router).informe).toBe('residencia'))
  expect(busqueda(router).nivel).toBeUndefined()
})

test('elegir una red borra los municipios elegidos', async () => {
  const router = montar({
    url: '/informes?informe=total&desde=2026-02&hasta=2026-08&municipios=1,4',
    permisos: ['INFORME_CONSULTAR', 'RED_CONSULTAR'],
  })
  await screen.findAllByText('1,234')
  expect(screen.getByRole('button', { name: 'Municipios' }).textContent).toContain('2 municipios')
  elegir('red', '3')
  expect(screen.getByRole('button', { name: 'Municipios' }).textContent).toContain('Todos (1)')
  generar()
  await waitFor(() => expect(busqueda(router)).toEqual({
    informe: 'total', desde: '2026-02', hasta: '2026-08', red: '3',
  }))
  await waitFor(() => expect(obtenerInforme).toHaveBeenLastCalledWith(expect.objectContaining({
    redId: 3, municipioIds: [],
  })))
})

test('sin RED_CONSULTAR no hay filtro de red ni se piden las redes', async () => {
  montar()
  await screen.findByText(SIN_GENERAR)
  expect(nativo('red')).toBeNull()
  expect(listarRedes).not.toHaveBeenCalled()
})

test('con meses sin cerrar y sin aprobados, avisa que esos meses no suman', async () => {
  const sinCerrar = [{ anio: 2026, mes: 9, estado: 'EN_CIERRE' }]
  obtenerInforme.mockResolvedValueOnce(informe({ mesesSinCerrar: sinCerrar, hasta: { anio: 2026, mes: 9 } }))
  montar({ url: '/informes?informe=total&desde=2026-02&hasta=2026-09' })
  const aviso = 'Septiembre de 2026 todavía no está cerrado y no suma en el informe. '
    + 'Marca «Incluir aprobados sin cerrar» para verlos como preliminares.'
  expect(await screen.findByText(aviso)).toBeTruthy()
  expect(screen.queryByText('Preliminar')).toBeNull()
})

test('un informe preliminar lleva la insignia y su aviso', async () => {
  const sinCerrar = [{ anio: 2026, mes: 9, estado: 'EN_CIERRE' }]
  obtenerInforme.mockResolvedValueOnce(informe({ mesesSinCerrar: sinCerrar, preliminar: true, incluirAprobados: true }))
  montar({ url: '/informes?informe=total&desde=2026-02&hasta=2026-09&aprobados=si' })
  expect(await screen.findByText('Datos preliminares: septiembre de 2026 todavía no está cerrado.')).toBeTruthy()
  expect(screen.getByText('Preliminar')).toBeTruthy()
})

test('sin meses habilitados lo dice y no muestra los filtros', async () => {
  obtenerOpcionesInformes.mockResolvedValueOnce({ ...OPCIONES, meses: [] })
  montar()
  expect(await screen.findByText('La DDRISS no tiene meses habilitados.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Generar' })).toBeNull()
})

test('si el informe falla, se puede reintentar', async () => {
  obtenerInforme.mockRejectedValueOnce(new Error('sin red'))
  montar({ url: '/informes?informe=total&desde=2026-02&hasta=2026-08' })
  expect(await screen.findByText(/No se pudo generar el informe/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findAllByText('1,234')).toHaveLength(2)
})

test('la Autoridad nacional elige la DDRISS y la manda con ddrissId', async () => {
  listarDdriss.mockResolvedValue([{ id: 1, nombre: 'DDRISS San Marcos' }, { id: 2, nombre: 'DDRISS Otra' }])
  const router = montar({ rol: 'AUTORIDAD', ddrissId: null })
  await screen.findByText(SIN_GENERAR)
  expect(obtenerOpcionesInformes).toHaveBeenCalledWith({ ddrissId: 1 })
  generar()
  await waitFor(() => expect(busqueda(router).ddriss).toBe('1'))
  await waitFor(() => expect(obtenerInforme).toHaveBeenCalledWith(expect.objectContaining({ ddrissId: 1 })))
})
