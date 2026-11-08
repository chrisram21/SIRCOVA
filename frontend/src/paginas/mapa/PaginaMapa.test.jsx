import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarDdriss } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { cargarLimites } from '@/api/geo.js'
import { listarResultados } from '@/api/indicadores.js'
import { obtenerAvance } from '@/api/revision.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaMapa, { filtrosDelMapa } from './PaginaMapa.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarDdriss: vi.fn() }))
vi.mock('@/api/indicadores.js', () => ({ listarResultados: vi.fn() }))
vi.mock('@/api/revision.js', () => ({ obtenerAvance: vi.fn() }))
vi.mock('@/api/geo.js', () => ({ cargarLimites: vi.fn() }))
// Leaflet no dibuja en jsdom: el doble muestra un botón por polígono, con su color, y avisa al elegir.
vi.mock('./MapaMunicipios.jsx', () => ({
  default: ({ filas, onElegir, seleccionado }) => (
    <div data-testid="mapa">
      {filas
        .filter((f) => f.enMapa)
        .map((f) => (
          <button
            key={f.codigoIne}
            type="button"
            data-color={f.color}
            data-elegido={f.codigoIne === seleccionado}
            onClick={() => onElegir(f)}
          >
            Polígono {f.nombre}
          </button>
        ))}
    </div>
  ),
}))

// Hoy fijo: el mes por defecto es octubre de 2026.
const HOY = new Date(2026, 10, 7)

const UMBRALES = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
]
const indicador = (codigo, tipoCalculo, nombre, cambios = {}) => ({
  codigo, version: 1, nombre, tipoCalculo, esIndicadorMapa: false, umbrales: UMBRALES, umbralesProvisionales: false, ...cambios,
})
const CORRIDA = {
  id: 7,
  ddriss: { id: 1, codigo: 'DDRISS_SM' },
  anio: 2026,
  mesHasta: 10,
  parcial: false,
  indicadores: [
    indicador('AVANCE_HEXA3', 'AVANCE_META_MES', 'Avance de Hexavalente 3.ª dosis', { esIndicadorMapa: true, umbralesProvisionales: true }),
    indicador('BRECHA_HEXA3', 'BRECHA', 'Brecha de Hexavalente 3.ª dosis', { umbrales: [] }),
    indicador('COB_HEXA3', 'COBERTURA', 'Cobertura de Hexavalente 3.ª dosis'),
    indicador('DES_HEXA1_3', 'DESERCION', 'Deserción de Hexavalente', {
      umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
    }),
  ],
}

const SAN_MARCOS = { id: 1, nombre: 'San Marcos', codigoIne: '1201' }
const TACANA = { id: 7, nombre: 'Tacaná', codigoIne: '1207' }
const SIBINAL = { id: 8, nombre: 'Sibinal', codigoIne: '1208' }
const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente' }

const resultado = (indicadorCodigo, municipio, cambios = {}) => ({
  indicadorCodigo, municipio, vacuna: HEXA, valor: 85, meta: 100, color: 'amarillo', calculable: true, numerador: 800,
  denominador: 940, metaDosis: 940, brechaDosis: 140, ...cambios,
})
const RESULTADOS = [
  resultado('AVANCE_HEXA3', null, { valor: 70, color: 'rojo', numerador: 2000, denominador: 2850, brechaDosis: 850 }),
  resultado('AVANCE_HEXA3', SAN_MARCOS, { valor: 95, color: 'verde', numerador: 950, metaDosis: 1000, brechaDosis: 50 }),
  resultado('AVANCE_HEXA3', TACANA, { valor: 63.2, color: 'rojo', numerador: 712, metaDosis: 853, brechaDosis: 141 }),
  resultado('AVANCE_HEXA3', SIBINAL, { valor: 82, color: 'amarillo', numerador: 338, metaDosis: 412, brechaDosis: 74 }),
  resultado('BRECHA_HEXA3', null, { brechaDosis: 850 }),
  resultado('BRECHA_HEXA3', SAN_MARCOS, { brechaDosis: 0 }),
  resultado('BRECHA_HEXA3', TACANA, { brechaDosis: 415 }),
  resultado('BRECHA_HEXA3', SIBINAL, { brechaDosis: 74 }),
  resultado('DES_HEXA1_3', SAN_MARCOS, { valor: 4, color: 'verde', numerador: 4, denominador: 100 }),
  resultado('DES_HEXA1_3', TACANA, { valor: 12, color: 'rojo', numerador: 12, denominador: 100 }),
]
const conteos = (cambios = {}) => ({
  SIN_ENVIAR: 0, ENVIADO: 0, EN_REVISION: 0, CORRECCION_SOLICITADA: 0, APROBADO: 0, CERRADO: 0, ...cambios,
})
const AVANCE = {
  periodo: { id: 41, anio: 2026, mes: 10, estado: 'ABIERTO', fechaLimiteEnvio: '2026-11-10' },
  esperados: 6,
  conteos: conteos({ SIN_ENVIAR: 1, APROBADO: 3, CERRADO: 2 }),
  municipios: [
    { municipio: SAN_MARCOS, esperados: 3, conteos: conteos({ APROBADO: 1, CERRADO: 2 }) },
    { municipio: SIBINAL, esperados: 1, conteos: conteos({ APROBADO: 1 }) },
    { municipio: TACANA, esperados: 2, conteos: conteos({ SIN_ENVIAR: 1, APROBADO: 1 }) },
  ],
}
const LIMITES = {
  type: 'FeatureCollection',
  features: [SAN_MARCOS, TACANA, SIBINAL].map((m) => ({
    type: 'Feature', properties: { codigo_ine: m.codigoIne, nombre: m.nombre }, geometry: null,
  })),
}

const PERMISOS = ['MAPA_CONSULTAR', 'INDICADOR_CONSULTAR', 'REPORTE_AVANCE_CONSULTAR']

function crearSesion(permisos, { rol = 'EPIDEMIOLOGIA', ddrissId = 1 } = {}) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'epidemiologia',
      rol,
      permisos,
      empleado: { nombres: 'Andrea', apellidos: 'López', ddrissId, establecimientoId: null, municipioId: null },
    },
  }
}

function montar({ url = '/mapa', permisos = PERMISOS, ...opciones } = {}) {
  guardarSesion(crearSesion(permisos, opciones))
  const router = createMemoryRouter(
    [
      {
        path: '/mapa',
        element: (
          <ProveedorSesion>
            <PaginaMapa hoy={HOY} />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const poligono = (nombre) => screen.findByRole('button', { name: `Polígono ${nombre}` })
const pestana = (nombre) => fireEvent.mouseDown(screen.getByRole('tab', { name: nombre }))
const clasificacion = () => within(screen.getByRole('list', { name: 'Clasificación de municipios' }))
const ordenDeLaClasificacion = () =>
  clasificacion().getAllByRole('button').map((b) => b.textContent.replace(/^\d+/, '').trim())
const dato = (etiqueta) => screen.getByText(etiqueta, { selector: 'dt' }).nextElementSibling.textContent

beforeEach(() => {
  vi.clearAllMocks()
  listarResultados.mockResolvedValue({ corrida: CORRIDA, resultados: RESULTADOS })
  obtenerAvance.mockResolvedValue(AVANCE)
  cargarLimites.mockResolvedValue(LIMITES)
})

test('los filtros salen de la URL, con el mes anterior y Cobertura por defecto', () => {
  expect(filtrosDelMapa(new URLSearchParams(''), HOY)).toEqual({
    anio: 2026, mes: 10, ddriss: undefined, vacuna: undefined, modo: 'cobertura', municipio: undefined,
  })
  expect(filtrosDelMapa(new URLSearchParams('anio=2025&mes=3&modo=estado&municipio=7&vacuna=BCG'), HOY)).toEqual({
    anio: 2025, mes: 3, ddriss: undefined, vacuna: 'BCG', modo: 'estado', municipio: 7,
  })
  expect(filtrosDelMapa(new URLSearchParams('modo=otro&mes=13&vacuna=bcg'), HOY)).toMatchObject({
    modo: 'cobertura', mes: 10, vacuna: undefined,
  })
})

test('por defecto colorea el indicador del mapa, lo nombra y pide los datos del mes con el desglose', async () => {
  montar()

  expect((await poligono('San Marcos')).dataset.color).toBe('var(--semaforo-verde)')
  expect((await poligono('Tacaná')).dataset.color).toBe('var(--semaforo-rojo)')
  expect(screen.getByRole('heading', { level: 1, name: '¿Dónde está el rezago de cobertura?' })).toBeTruthy()
  expect(screen.getByText(/Mapa territorial · Avance de Hexavalente 3\.ª dosis · ene a oct 2026/)).toBeTruthy()
  expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: undefined })
  expect(obtenerAvance).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: undefined, desglose: 'municipio' })
  expect(cargarLimites).toHaveBeenCalledWith('geo/san-marcos.geojson')

  const leyenda = screen.getByRole('group', { name: 'Leyenda: Avance contra la meta del mes' })
  expect(within(leyenda).getByText('90 % o más')).toBeTruthy()
  expect(within(leyenda).getByText('Rangos provisionales')).toBeTruthy()
  // Sin municipio elegido, el panel muestra el total de la DDRISS.
  expect(screen.getByRole('heading', { level: 2, name: 'Total de la DDRISS' })).toBeTruthy()
})

test('cambiar el modo cambia la URL, el título, la leyenda y el orden de la clasificación', async () => {
  const router = montar()
  await poligono('San Marcos')
  pestana('Clasificación')
  expect(ordenDeLaClasificacion()).toEqual(['Tacaná63.2 %', 'Sibinal82.0 %', 'San Marcos95.0 %'])

  pestana('Brecha')
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&modo=brecha'))
  expect(screen.getByRole('heading', { level: 1, name: '¿Dónde faltan más dosis para la meta?' })).toBeTruthy()
  expect(screen.getByRole('group', { name: 'Leyenda: Dosis por aplicar para la meta' })).toBeTruthy()
  expect(ordenDeLaClasificacion()).toEqual(['Tacaná415 dosis', 'Sibinal74 dosis', 'San Marcos0 dosis'])
  expect((await poligono('San Marcos')).dataset.color).toBe('var(--mapa-brecha-1)')

  pestana('Deserción')
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&modo=desercion'))
  expect(ordenDeLaClasificacion()).toEqual(['Tacaná12.0 %', 'San Marcos4.0 %', 'SibinalSin datos'])

  pestana('Estado del reporte')
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&modo=estado'))
  expect(screen.getByRole('heading', { level: 1, name: '¿Dónde faltan reportes del mes?' })).toBeTruthy()
  // San Marcos y Sibinal empatan (aprobado, sin reportes sin enviar): van por nombre.
  expect(ordenDeLaClasificacion()).toEqual(['TacanáSin enviar', 'San MarcosAprobado', 'SibinalAprobado'])
  expect((await poligono('Tacaná')).dataset.color).toBe('var(--mapa-sin-enviar)')
})

test('elegir un municipio en la clasificación lo pone en la URL y muestra su panel con dosis, meta, avance y brecha', async () => {
  const router = montar()
  await poligono('San Marcos')
  pestana('Clasificación')

  fireEvent.click(clasificacion().getByRole('button', { name: /Tacaná/ }))
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&municipio=7'))
  const panel = within(screen.getByRole('tabpanel'))
  expect(panel.getByRole('heading', { level: 2, name: 'Tacaná' })).toBeTruthy()
  expect(panel.getByText('63.2 %')).toBeTruthy()
  expect(panel.getByText('Menos de 80 %')).toBeTruthy()
  expect(panel.getByText('Meta: 100.0 %')).toBeTruthy()
  // Las tres cifras del indicador pintado cuadran (712 + 141 = 853); la brecha anual va aparte.
  expect(dato('Dosis aplicadas')).toBe('712')
  expect(dato('Meta en dosis')).toBe('853')
  expect(dato('Dosis por aplicar')).toBe('141')
  expect(panel.getByTitle('Brecha de Hexavalente 3.ª dosis').closest('dt').nextElementSibling.textContent).toBe('415')
  expect(panel.queryByText('Población de referencia')).toBeNull()
  expect(dato('Deserción')).toBe('12.0 %')
  expect(dato('Reportes de octubre de 2026')).toMatch(/^1 de 2aprobados o cerradosMás atrasado: sin enviar$/)
  expect((await poligono('Tacaná')).dataset.elegido).toBe('true')
})

test('elegir un polígono también lo elige, y el municipio de la URL se conserva al cambiar de modo', async () => {
  const router = montar({ url: '/mapa?municipio=1' })
  expect(await screen.findByRole('heading', { level: 2, name: 'San Marcos' })).toBeTruthy()

  fireEvent.click(await poligono('Sibinal'))
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&municipio=8'))
  pestana('Brecha')
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&modo=brecha&municipio=8'))
  expect(screen.getByRole('heading', { level: 2, name: 'Sibinal' })).toBeTruthy()
})

test('«Ver en Indicadores» lleva el mes, la vacuna y el municipio; sin INDICADOR_CONSULTAR no aparece', async () => {
  montar({ url: '/mapa?municipio=7' })
  const enlace = await screen.findByRole('link', { name: /Ver en Indicadores/ })
  expect(enlace.getAttribute('href')).toBe('/indicadores?anio=2026&mes=10&vacuna=HEXA&municipios=7')
})

test('sin INDICADOR_CONSULTAR no pide resultados ni muestra «Ver en Indicadores», y el estado sigue', async () => {
  montar({ url: '/mapa?modo=estado', permisos: ['MAPA_CONSULTAR', 'REPORTE_AVANCE_CONSULTAR'] })

  expect((await poligono('Tacaná')).dataset.color).toBe('var(--mapa-sin-enviar)')
  expect(listarResultados).not.toHaveBeenCalled()
  expect(screen.queryByRole('link', { name: /Ver en Indicadores/ })).toBeNull()
})

test('sin corrida vigente lo avisa con el enlace a Indicadores, y «Estado del reporte» sigue con sus datos', async () => {
  listarResultados.mockResolvedValue({ corrida: null, resultados: [] })
  const router = montar()

  expect(await screen.findByText(/No hay un cálculo vigente de octubre de 2026\./)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Ir a Indicadores' }).getAttribute('href')).toBe('/indicadores?anio=2026&mes=10')
  expect((await poligono('San Marcos')).dataset.color).toBe('var(--muted)')

  pestana('Estado del reporte')
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&modo=estado'))
  expect((await poligono('San Marcos')).dataset.color).toBe('var(--estado-aprobado)')
  expect(screen.queryByText(/No hay un cálculo vigente/)).toBeNull()
})

test('un error en el avance muestra «Reintentar» sin ocultar los modos de indicadores', async () => {
  obtenerAvance.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno. Intente de nuevo.'))
  montar()

  expect(await screen.findByText(/No se pudo cargar el estado de los reportes/)).toBeTruthy()
  expect((await poligono('San Marcos')).dataset.color).toBe('var(--semaforo-verde)')
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(obtenerAvance).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText(/No se pudo cargar el estado de los reportes/)).toBeNull())
})

test('un mes fuera del calendario de la DDRISS no es un error: «Estado del reporte» lo dice', async () => {
  obtenerAvance.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  montar({ url: '/mapa?modo=estado' })

  expect(await screen.findByText('Octubre de 2026 no está en el calendario de la DDRISS.', { exact: false })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Reintentar' })).toBeNull()
})

test('sin límites para los municipios de la DDRISS, el aviso reemplaza al mapa y la clasificación sigue', async () => {
  const COATEPEQUE = { id: 99, nombre: 'Coatepeque', codigoIne: '0920' }
  listarResultados.mockResolvedValue({
    corrida: CORRIDA,
    resultados: [resultado('AVANCE_HEXA3', COATEPEQUE, { valor: 50, color: 'rojo' })],
  })
  obtenerAvance.mockResolvedValue({ ...AVANCE, municipios: [] })
  montar()

  expect(await screen.findByText('No hay límites cargados para los municipios de esta DDRISS.')).toBeTruthy()
  expect(cargarLimites).not.toHaveBeenCalled()
  expect(screen.queryByTestId('mapa')).toBeNull()
  pestana('Clasificación')
  expect(ordenDeLaClasificacion()).toEqual(['Coatepeque50.0 %'])
})

test('la Autoridad nacional elige la DDRISS, que va en la URL y en lo que se pide, y borra el municipio', async () => {
  listarDdriss.mockResolvedValue([
    { id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos' },
    { id: 2, codigo: 'DDRISS_QZ', nombre: 'DDRISS Quetzaltenango' },
  ])
  const router = montar({ url: '/mapa?municipio=7', permisos: [...PERMISOS, 'DDRISS_CONSULTAR'], rol: 'AUTORIDAD', ddrissId: null })

  await waitFor(() => expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: 1 }))
  expect(obtenerAvance).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: 1, desglose: 'municipio' })
  fireEvent.change(document.querySelector('select[name="ddriss"]'), { target: { value: '2' } })
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&ddriss=2'))
  await waitFor(() => expect(listarResultados).toHaveBeenLastCalledWith({ anio: 2026, mes: 10, ddrissId: 2 }))
})
