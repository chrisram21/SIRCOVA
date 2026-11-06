import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarDdriss, listarDistritos, listarPeriodos } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { calcularIndicadores, listarCorridas, listarResultados, obtenerSerie } from '@/api/indicadores.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaIndicadores, { filtrosDeUrl, indicadorElegido, mesPorDefecto } from './PaginaIndicadores.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarDdriss: vi.fn(), listarDistritos: vi.fn(), listarPeriodos: vi.fn() }))
vi.mock('@/api/indicadores.js', () => ({
  calcularIndicadores: vi.fn(),
  listarCorridas: vi.fn(),
  listarResultados: vi.fn(),
  obtenerSerie: vi.fn(),
}))

// Hoy fijo: el mes por defecto es octubre de 2026.
const HOY = new Date(2026, 10, 3)

const corrida = (cambios = {}) => ({
  id: 7,
  ddriss: { id: 1, codigo: 'DDRISS_SM' },
  anio: 2026,
  mesHasta: 10,
  motivo: 'MANUAL',
  estado: 'COMPLETADA',
  vigente: true,
  parcial: false,
  mesesSinCerrar: [],
  disparadaPor: { id: 4, nombre: 'Rosa Méndez' },
  iniciadaEn: '2026-11-03T16:05:00.000Z',
  finalizadaEn: '2026-11-03T16:05:02.000Z',
  indicadores: [
    { codigo: 'COB_HEXA3', version: 1, nombre: 'Cobertura de Hexavalente 3.ª dosis', tipoCalculo: 'COBERTURA' },
    { codigo: 'AVANCE_HEXA3', version: 1, nombre: 'Avance de Hexavalente 3.ª dosis', tipoCalculo: 'AVANCE_META_MES' },
    { codigo: 'BRECHA_HEXA3', version: 1, nombre: 'Brecha de Hexavalente 3.ª dosis', tipoCalculo: 'BRECHA' },
    { codigo: 'DES_HEXA1_3', version: 1, nombre: 'Tasa de deserción Hexavalente 1.ª a 3.ª dosis', tipoCalculo: 'DESERCION' },
    { codigo: 'PROY_COB_HEXA3', version: 1, nombre: 'Proyección de cobertura anual de Hexavalente 3.ª dosis', tipoCalculo: 'PROYECCION' },
  ],
  omitidos: [{ codigo: 'PROY_COB_SPR1', motivo: 'El indicador base COB_SPR1 no aplica a la DDRISS.' }],
  totalResultados: 6,
  ...cambios,
})

const resultado = (indicadorCodigo, municipio, cambios = {}) => ({
  indicadorCodigo,
  indicadorVersion: 1,
  tipoCalculo: { COB: 'COBERTURA', BRECHA: 'BRECHA', DES: 'DESERCION', PROY: 'PROYECCION' }[indicadorCodigo.split('_')[0]]
    ?? 'AVANCE_META_MES',
  municipio,
  vacuna: { codigo: 'HEXA', nombre: 'Hexavalente' },
  dosis: 'D3',
  filtroDimensiones: 'grupo_edad=MENOR_1',
  anio: 2026,
  mes: 10,
  numerador: 975,
  denominador: 1208.33,
  valor: 80.6897,
  meta: 100,
  brechaDosis: 234,
  cumpleMeta: false,
  calculable: true,
  color: 'amarillo',
  esProyeccion: false,
  metaDosis: 1209,
  excedenteDosis: 0,
  sumaBrechasMunicipales: null,
  proyeccion: null,
  ...cambios,
})
const SAN_MARCOS = { id: 1, nombre: 'San Marcos' }
const TAJUMULCO = { id: 9, nombre: 'Tajumulco' }
const COMITANCILLO = { id: 4, nombre: 'Comitancillo' }
const NO_CALCULABLE = { denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null, calculable: false, color: null, metaDosis: null, excedenteDosis: null }
// Municipios de BRECHA, a propósito desordenados: San Marcos pasa la meta, Comitancillo es el que más necesita y
// Tajumulco no tiene población.
const BRECHA_MUNICIPIOS = [
  resultado('BRECHA_HEXA3', SAN_MARCOS, { numerador: 1000, metaDosis: 950, brechaDosis: 0, excedenteDosis: 50, cumpleMeta: true, color: null }),
  resultado('BRECHA_HEXA3', TAJUMULCO, { ...NO_CALCULABLE, numerador: 300 }),
  resultado('BRECHA_HEXA3', COMITANCILLO, { numerador: 100, metaDosis: 500, brechaDosis: 400, color: null }),
]
// Municipios de DESERCION (numerador = pérdida, denominador = iniciales): Comitancillo pierde más, San Marcos tiene
// más finales que iniciales y Tajumulco no tuvo primeras dosis.
const DES_FILA = { brechaDosis: null, metaDosis: null, excedenteDosis: null, meta: 10, dosis: 'D3' }
const DES_MUNICIPIOS = [
  resultado('DES_HEXA1_3', SAN_MARCOS, { ...DES_FILA, numerador: -5, denominador: 40, valor: -12.5, cumpleMeta: true, color: 'verde' }),
  resultado('DES_HEXA1_3', TAJUMULCO, { ...NO_CALCULABLE, numerador: -7, denominador: 0 }),
  resultado('DES_HEXA1_3', COMITANCILLO, { ...DES_FILA, numerador: 15, denominador: 100, valor: 15, cumpleMeta: false, color: 'rojo' }),
]
// Municipios de PROYECCION con corte a octubre (faltan 2 meses): Comitancillo no llegará, San Marcos sí y Tajumulco
// no tiene población (y por eso tampoco la DDRISS).
const PROY_FILA = { meta: 95, color: null, esProyeccion: true, metaDosis: null, excedenteDosis: null }
const proyeccion = (dosisAcumuladas, ritmoMensual) => ({
  indicadorBase: 'COB_HEXA3', mesesVentana: 3, mesesUsados: [8, 9, 10], dosisAcumuladas, ritmoMensual,
})
const PROY_MUNICIPIOS = [
  resultado('PROY_COB_HEXA3', SAN_MARCOS, {
    ...PROY_FILA, numerador: 1300, denominador: 1000, valor: 130, brechaDosis: 0, cumpleMeta: true, proyeccion: proyeccion(1000, 150),
  }),
  resultado('PROY_COB_HEXA3', TAJUMULCO, { ...NO_CALCULABLE, esProyeccion: true, numerador: 300, proyeccion: proyeccion(200, 50) }),
  resultado('PROY_COB_HEXA3', COMITANCILLO, {
    ...PROY_FILA, numerador: 400, denominador: 1000, valor: 40, brechaDosis: 550, cumpleMeta: false, proyeccion: proyeccion(300, 50),
  }),
]
const RESULTADOS = [
  resultado('AVANCE_HEXA3', null, { numerador: 1300, denominador: 2000, valor: 65, brechaDosis: 700, color: 'rojo' }),
  resultado('AVANCE_HEXA3', SAN_MARCOS, { numerador: 1000, denominador: 1000, valor: 100, brechaDosis: 0, cumpleMeta: true, color: 'verde' }),
  resultado('AVANCE_HEXA3', TAJUMULCO, {
    numerador: 300, denominador: null, valor: null, meta: null, brechaDosis: null, cumpleMeta: null, calculable: false, color: null,
  }),
  resultado('COB_HEXA3', null, { meta: 95 }),
  resultado('COB_HEXA3', SAN_MARCOS, { meta: 95, numerador: 975, metaDosis: 967, brechaDosis: 0, excedenteDosis: 8, cumpleMeta: true }),
  resultado('COB_HEXA3', TAJUMULCO, { meta: 95 }),
  resultado('BRECHA_HEXA3', null, { numerador: 1100, metaDosis: 1250, brechaDosis: 150, sumaBrechasMunicipales: 400, color: null }),
  ...BRECHA_MUNICIPIOS,
  resultado('DES_HEXA1_3', null, { ...DES_FILA, numerador: 3, denominador: 140, valor: 2.1429, cumpleMeta: true, color: 'verde' }),
  ...DES_MUNICIPIOS,
  resultado('PROY_COB_HEXA3', null, { ...NO_CALCULABLE, esProyeccion: true, numerador: 2000, proyeccion: proyeccion(1500, 250) }),
  ...PROY_MUNICIPIOS,
]
const CORRIDAS = {
  elementos: [corrida(), corrida({ id: 5, vigente: false, motivo: 'CIERRE_PERIODO', mesHasta: 9, disparadaPor: null, parcial: true })],
  total: 2,
  pagina: 1,
  porPagina: 20,
}

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
      empleado: { nombres: 'Rosa', apellidos: 'Méndez', ddrissId, establecimientoId: null, municipioId: null },
    },
  }
}

async function montar({ url = '/indicadores', permisos = ['INDICADOR_CONSULTAR', 'INDICADOR_CALCULAR'], ...opciones } = {}) {
  guardarSesion(crearSesion(permisos, opciones))
  const router = createMemoryRouter(
    [
      {
        path: '/indicadores',
        element: (
          <ProveedorSesion>
            <PaginaIndicadores hoy={HOY} />
          </ProveedorSesion>
        ),
      },
    ],
    { initialEntries: [url] },
  )
  render(<RouterProvider router={router} />)
  return router
}

const tabla = () => within(screen.getAllByRole('table')[0])
const filaDe = (nombre) => tabla().getByText(nombre).closest('tr')
const celdas = (fila) => [...fila.querySelectorAll('td')].map((c) => c.textContent)

beforeEach(() => {
  vi.clearAllMocks()
  listarResultados.mockResolvedValue({ corrida: corrida(), resultados: RESULTADOS })
  listarCorridas.mockResolvedValue(CORRIDAS)
  listarPeriodos.mockResolvedValue([])
  obtenerSerie.mockResolvedValue({ puntos: [] })
})

test('mes por defecto, filtros de la URL e indicador elegido', () => {
  expect(mesPorDefecto(new Date(2026, 10, 3))).toEqual({ anio: 2026, mes: 10 })
  expect(mesPorDefecto(new Date(2027, 0, 15))).toEqual({ anio: 2026, mes: 12 })
  expect(filtrosDeUrl(new URLSearchParams('anio=2025&mes=13&indicador=cob'), HOY)).toEqual({
    anio: 2025, mes: 10, indicador: undefined, ddriss: undefined, vacuna: undefined, distrito: undefined, municipios: [],
  })
  expect(filtrosDeUrl(new URLSearchParams('vacuna=HEXA&distrito=3&municipios=4,x,1,4'), HOY)).toMatchObject({
    vacuna: 'HEXA', distrito: 3, municipios: [4, 1],
  })
  const indicadores = corrida().indicadores
  expect(indicadorElegido(indicadores, 'COB_HEXA3').codigo).toBe('COB_HEXA3')
  expect(indicadorElegido(indicadores, 'OTRO').codigo).toBe('AVANCE_HEXA3')
  expect(indicadorElegido([], undefined)).toBeNull()
})

test('pide la corrida vigente del mes por defecto y muestra el avance con la fila de la DDRISS primero', async () => {
  await montar()

  await screen.findByText('Total de la DDRISS')
  expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: undefined })
  expect(listarCorridas).toHaveBeenCalledWith({ anio: 2026, ddrissId: undefined })
  expect(screen.getByRole('heading', { name: 'Avance contra la meta del mes' })).toBeTruthy()
  expect(screen.getByText(/Calculada el .* por Rosa Méndez · Cálculo manual/)).toBeTruthy()
  expect(document.querySelector('select[name="indicador"]').value).toBe('AVANCE_HEXA3')

  const filas = tabla().getAllByRole('row').slice(1)
  expect(filas.map((f) => f.querySelector('td').textContent)).toEqual(['Total de la DDRISS', 'San Marcos', 'Tajumulco'])
  expect(celdas(filaDe('San Marcos'))).toEqual(['San Marcos', '1,000', '1,000', '100.0 %', '100 %', '0', 'Sí'])
  expect(celdas(filaDe('Tajumulco'))).toEqual(['Tajumulco', '300', '—', 'Sin población', '—', '—', '—'])
  expect(within(filaDe('Total de la DDRISS')).getByText('65.0 %').className).toContain('text-destructive')
  expect(within(filaDe('San Marcos')).getByText('100.0 %').className).toContain('bg-exito')
})

test('lista los indicadores omitidos y avisa cuando la corrida es parcial', async () => {
  listarResultados.mockResolvedValue({ corrida: corrida({ parcial: true, mesesSinCerrar: [9, 10] }), resultados: RESULTADOS })
  await montar()

  expect(await screen.findByText(/Cálculo parcial\. Septiembre y octubre no están cerrados/)).toBeTruthy()
  expect(screen.getByText('PROY_COB_SPR1')).toBeTruthy()
  expect(screen.getByText(/El indicador base COB_SPR1 no aplica a la DDRISS\./)).toBeTruthy()
})

test('sin corrida vigente lo dice y conserva el historial', async () => {
  listarResultados.mockResolvedValue({ corrida: null, resultados: [] })
  await montar()

  expect(await screen.findByText('Este mes todavía no tiene indicadores calculados.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Historial de corridas del año/ }))
  const historial = within(await screen.findByRole('table'))
  expect(historial.getAllByText('Vigente')).toHaveLength(1)
  expect(historial.getByText('Parcial')).toBeTruthy()
  expect(historial.getByText('Automático')).toBeTruthy()
})

test('el año, el mes y el indicador van en la URL y cambian lo que se pide', async () => {
  const router = await montar()
  await screen.findByText('Total de la DDRISS')

  fireEvent.change(document.querySelector('select[name="indicador"]'), { target: { value: 'COB_HEXA3' } })
  await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&indicador=COB_HEXA3'))
  expect(tabla().getByText('Población')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cobertura' })).toBeTruthy()

  fireEvent.change(document.querySelector('select[name="mes"]'), { target: { value: '8' } })
  await waitFor(() => expect(listarResultados).toHaveBeenLastCalledWith({ anio: 2026, mes: 8, ddrissId: undefined }))
  fireEvent.change(document.querySelector('select[name="anio"]'), { target: { value: '2025' } })
  await waitFor(() => expect(listarResultados).toHaveBeenLastCalledWith({ anio: 2025, mes: 8, ddrissId: undefined }))
})

test('con un indicador BRECHA muestra «Brecha de dosis», lo que falta de mayor a menor y la suma municipal', async () => {
  await montar({ url: '/indicadores?indicador=BRECHA_HEXA3' })

  expect(await screen.findByRole('heading', { name: 'Brecha de dosis' })).toBeTruthy()
  const encabezados = tabla().getAllByRole('columnheader').map((c) => c.textContent)
  expect(encabezados).toEqual(['Municipio', 'Dosis acumuladas', 'Dosis para la meta', 'Dosis que faltan', 'Excedente', 'Cumple'])
  const filas = tabla().getAllByRole('row').slice(1)
  expect(filas.map((f) => f.querySelector('td').textContent)).toEqual(['Total de la DDRISS', 'Comitancillo', 'San Marcos', 'Tajumulco'])
  expect(celdas(filaDe('Comitancillo'))).toEqual(['Comitancillo', '100', '500', '400', '0', 'No'])
  expect(celdas(filaDe('San Marcos'))).toEqual(['San Marcos', '1,000', '950', '0', '50', 'Sí'])
  expect(celdas(filaDe('Tajumulco'))).toEqual(['Tajumulco', '300', 'Sin población', '—', '—', '—'])
  expect(screen.getByText(/Suma de lo que falta en los municipios:/).textContent).toContain('400 dosis')
})

test('con un indicador DESERCION muestra «Deserción entre dosis», de mayor a menor y sin primeras dosis al final', async () => {
  await montar({ url: '/indicadores?indicador=DES_HEXA1_3' })

  expect(await screen.findByRole('heading', { name: 'Deserción entre dosis' })).toBeTruthy()
  const encabezados = tabla().getAllByRole('columnheader').map((c) => c.textContent)
  expect(encabezados).toEqual(['Municipio', 'Dosis iniciales', 'Dosis finales', 'Pérdida', 'Deserción', 'Meta', 'Cumple'])
  const filas = tabla().getAllByRole('row').slice(1)
  expect(filas.map((f) => f.querySelector('td').textContent)).toEqual(['Total de la DDRISS', 'Comitancillo', 'San Marcos', 'Tajumulco'])
  expect(celdas(filaDe('Comitancillo'))).toEqual(['Comitancillo', '100', '85', '15', '15.0 %', '≤ 10 %', 'No'])
  expect(celdas(filaDe('San Marcos'))).toEqual(['San Marcos', '40', '45', '-5', '-12.5 %Deserción negativa', '≤ 10 %', 'Sí'])
  expect(celdas(filaDe('Tajumulco'))).toEqual(['Tajumulco', '0', '7', '-7', 'Sin primeras dosis', '—', '—'])
  expect(screen.getByText(/Una deserción negativa indica/)).toBeTruthy()
})

test('con un indicador PROYECCION muestra la estimación de menor a mayor cobertura y la nota del método', async () => {
  await montar({ url: '/indicadores?indicador=PROY_COB_HEXA3' })

  expect(await screen.findByRole('heading', { name: 'Proyección al cierre del año' })).toBeTruthy()
  expect(screen.getByText('Estimación')).toBeTruthy()
  const encabezados = tabla().getAllByRole('columnheader').map((c) => c.textContent)
  expect(encabezados).toEqual([
    'Municipio', 'Dosis acumuladas', 'Ritmo mensual', 'Dosis proyectadas a diciembre', 'Población', 'Cobertura proyectada', 'Meta',
    '¿Llega a la meta?', 'Dosis que faltarían',
  ])
  const filas = tabla().getAllByRole('row').slice(1)
  expect(filas.map((f) => f.querySelector('td').textContent)).toEqual(['Total de la DDRISS', 'Comitancillo', 'San Marcos', 'Tajumulco'])
  expect(celdas(filaDe('Comitancillo'))).toEqual(['Comitancillo', '300', '50', '400', '1,000', '40.0 %', '> 95 %', 'No', '550'])
  expect(celdas(filaDe('San Marcos'))).toEqual(['San Marcos', '1,000', '150', '1,300', '1,000', '130.0 %', '> 95 %', 'Sí', '0'])
  expect(celdas(filaDe('Tajumulco'))).toEqual(['Tajumulco', '200', '50', '300', '—', 'Sin población', '—', '—', '—'])
  // Las dosis acumuladas son dato real; las proyectadas, estimación sobre fondo gris.
  const [, acumuladas, , proyectadas] = filaDe('San Marcos').querySelectorAll('td')
  expect(acumuladas.className).not.toContain('bg-muted')
  expect(proyectadas.className).toContain('bg-muted')
  expect(screen.getByText(/La proyección suma/).textContent).toBe(
    'La proyección suma a las dosis acumuladas el promedio de los últimos 3 meses cerrados (agosto, septiembre y octubre) '
      + 'por cada mes que falta hasta diciembre. Es una estimación, no un dato registrado.',
  )
})

test('en la cobertura, una fila sin brecha muestra el excedente', async () => {
  await montar({ url: '/indicadores?indicador=COB_HEXA3' })
  await screen.findByText('Total de la DDRISS')

  expect(celdas(filaDe('San Marcos'))[5]).toBe('0 (+8 de excedente)')
  expect(celdas(filaDe('Tajumulco'))[5]).toBe('234')
})

test('«Calcular» solo aparece con INDICADOR_CALCULAR y, al terminar, recarga el mes', async () => {
  listarPeriodos.mockResolvedValue([{ id: 1, anio: 2026, mes: 10, estado: 'CERRADO' }])
  calcularIndicadores.mockResolvedValue(corrida({ id: 8 }))
  await montar()
  await screen.findByText('Total de la DDRISS')

  fireEvent.click(screen.getByRole('button', { name: 'Calcular' }))
  const dialogo = within(screen.getByRole('alertdialog'))
  await waitFor(() => expect(document.querySelector('select[name="mes"]')?.value).toBe('10'))
  fireEvent.click(dialogo.getByRole('button', { name: 'Calcular' }))
  await waitFor(() => expect(listarResultados).toHaveBeenCalledTimes(2))
  expect(calcularIndicadores).toHaveBeenCalledWith({ anio: 2026, mesHasta: 10 })
})

test('sin INDICADOR_CALCULAR no hay «Calcular»', async () => {
  await montar({ permisos: ['INDICADOR_CONSULTAR'], rol: 'AUTORIDAD' })
  await screen.findByText('Total de la DDRISS')

  expect(screen.queryByRole('button', { name: 'Calcular' })).toBeNull()
})

test('la Autoridad nacional elige la DDRISS, que va en la URL y en lo que se pide', async () => {
  listarDdriss.mockResolvedValue([
    { id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos' },
    { id: 2, codigo: 'DDRISS_QZ', nombre: 'DDRISS Quetzaltenango' },
  ])
  const router = await montar({ permisos: ['INDICADOR_CONSULTAR', 'DDRISS_CONSULTAR'], rol: 'AUTORIDAD', ddrissId: null })

  await waitFor(() => expect(listarResultados).toHaveBeenCalledWith({ anio: 2026, mes: 10, ddrissId: 1 }))
  fireEvent.change(document.querySelector('select[name="ddriss"]'), { target: { value: '2' } })
  await waitFor(() => expect(router.state.location.search).toContain('ddriss=2'))
  await waitFor(() => expect(listarResultados).toHaveBeenLastCalledWith({ anio: 2026, mes: 10, ddrissId: 2 }))
})

test('si falla la carga, «Reintentar» vuelve a pedir', async () => {
  listarResultados.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno. Intente de nuevo.'))
  await montar()

  fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Total de la DDRISS')).toBeTruthy()
  expect(listarResultados).toHaveBeenCalledTimes(2)
})

// SPEC 49: el panel de gráficas y los filtros de vacuna, distrito y municipios. Recharts no dibuja en jsdom: las
// pruebas miran títulos, resúmenes y lo que se pide a la API (las cuentas están en panelIndicadores.test.js).
describe('panel de gráficas y filtros', () => {
  const SPR = { codigo: 'SPR', nombre: 'SPR' }
  const conSpr = () => {
    const indicadores = [
      ...corrida().indicadores,
      { codigo: 'AVANCE_SPR1', version: 1, nombre: 'Avance de SPR 1.ª dosis', tipoCalculo: 'AVANCE_META_MES' },
      { codigo: 'COB_SPR1', version: 1, nombre: 'Cobertura de SPR 1.ª dosis', tipoCalculo: 'COBERTURA' },
    ]
    const resultados = [
      ...RESULTADOS,
      resultado('AVANCE_SPR1', null, { vacuna: SPR, dosis: 'D1', valor: 70 }),
      resultado('AVANCE_SPR1', SAN_MARCOS, { vacuna: SPR, dosis: 'D1', valor: 75 }),
      resultado('COB_SPR1', null, { vacuna: SPR, dosis: 'D1', valor: 60, meta: 95 }),
    ]
    listarResultados.mockResolvedValue({ corrida: corrida({ indicadores }), resultados })
  }
  const DISTRITOS = [
    { id: 31, codigo: 'DS-1201', nombre: 'Distrito San Marcos', municipioId: 1, activo: true },
    { id: 32, codigo: 'DS-1209', nombre: 'Distrito Tajumulco', municipioId: 9, activo: true },
    { id: 40, codigo: 'DS-0901', nombre: 'Distrito de otra DDRISS', municipioId: 99, activo: true },
  ]
  const opciones = (nombre) => [...document.querySelectorAll(`select[name="${nombre}"] option`)].map((o) => o.value).filter(Boolean)
  const nombresEnTabla = () => tabla().getAllByRole('row').slice(1).map((f) => f.querySelector('td').textContent)

  test('muestra las cinco gráficas con su dato principal y pide la serie del indicador base de la proyección', async () => {
    obtenerSerie.mockResolvedValue({
      puntos: [{ mes: 10, corridaId: 7, parcial: false, resultado: resultado('COB_HEXA3', null, { meta: 95 }) }],
    })
    await montar()

    expect(await screen.findByText('Avance acumulado y proyección al cierre del año')).toBeTruthy()
    await waitFor(() => expect(obtenerSerie).toHaveBeenCalledWith({
      anio: 2026, indicador: 'COB_HEXA3', municipioId: undefined, ddrissId: undefined,
    }))
    expect(await screen.findByText('Real a octubre: 80.7 %.')).toBeTruthy()
    const titulos = [...document.querySelectorAll('[data-slot="card-title"]')].map((t) => t.textContent)
    expect(titulos).toEqual([
      'Avance acumulado y proyección al cierre del año',
      'Avance por vacuna',
      'Avance por municipio',
      'Brecha a la meta · 400 dosis',
      'Tasa de deserción Hexavalente 1.ª a 3.ª dosis',
    ])
    expect(screen.getByText('Mayor: San Marcos (100.0 %). Menor: San Marcos (100.0 %).')).toBeTruthy()
    expect(screen.getByText('Total de la DDRISS: 2.1 %')).toBeTruthy()
    expect(screen.getAllByText('Sin población: Tajumulco.').length).toBeGreaterThan(0)
  })

  test('sin indicador de un tipo para la vacuna, su tarjeta lo dice', async () => {
    const indicadores = corrida().indicadores.filter((i) => i.tipoCalculo !== 'BRECHA')
    listarResultados.mockResolvedValue({
      corrida: corrida({ indicadores }),
      resultados: RESULTADOS.filter((r) => r.indicadorCodigo !== 'BRECHA_HEXA3'),
    })
    await montar()

    expect(await screen.findByText('La corrida no tiene un indicador de brecha de dosis de Hexavalente.')).toBeTruthy()
  })

  test('cambiar la vacuna cambia el selector «Indicador», borra el indicador de la URL y pide la serie de su base', async () => {
    conSpr()
    const router = await montar({ url: '/indicadores?indicador=COB_HEXA3' })
    await screen.findByText('Total de la DDRISS')
    expect(opciones('vacuna')).toEqual(['HEXA', 'SPR'])
    expect(opciones('indicador')).not.toContain('AVANCE_SPR1')

    fireEvent.change(document.querySelector('select[name="vacuna"]'), { target: { value: 'SPR' } })
    await waitFor(() => expect(router.state.location.search).toBe('?anio=2026&mes=10&vacuna=SPR'))
    expect(opciones('indicador')).toEqual(['AVANCE_SPR1', 'COB_SPR1'])
    expect(document.querySelector('select[name="indicador"]').value).toBe('AVANCE_SPR1')
    await waitFor(() => expect(obtenerSerie).toHaveBeenLastCalledWith(expect.objectContaining({ indicador: 'COB_SPR1' })))
    expect(await screen.findByText('La corrida no tiene un indicador de deserción entre dosis de SPR.')).toBeTruthy()
  })

  test('el distrito deja solo sus municipios en la tabla y pide la serie de ese municipio', async () => {
    listarDistritos.mockResolvedValue(DISTRITOS)
    const router = await montar({ permisos: ['INDICADOR_CONSULTAR', 'DISTRITO_CONSULTAR'] })
    await screen.findByText('Total de la DDRISS')
    await waitFor(() => expect(opciones('distrito')).toEqual(['todos', '31', '32']))
    expect(listarDistritos).toHaveBeenCalledWith({ activo: true })

    fireEvent.change(document.querySelector('select[name="distrito"]'), { target: { value: '32' } })
    await waitFor(() => expect(router.state.location.search).toContain('distrito=32'))
    expect(nombresEnTabla()).toEqual(['Total de la DDRISS', 'Tajumulco'])
    expect(screen.getByRole('button', { name: 'Municipios' }).textContent).toBe('Todos (1)')
    await waitFor(() => expect(obtenerSerie).toHaveBeenLastCalledWith(expect.objectContaining({ municipioId: 9 })))
  })

  test('sin DISTRITO_CONSULTAR no hay selector de distrito ni se piden los distritos', async () => {
    await montar()
    await screen.findByText('Total de la DDRISS')

    expect(document.querySelector('select[name="distrito"]')).toBeNull()
    expect(listarDistritos).not.toHaveBeenCalled()
  })

  test('los municipios elegidos van en la URL y filtran la tabla; con varios, la serie es la de la DDRISS', async () => {
    await montar({ url: '/indicadores?municipios=9,1' })
    await screen.findByText('Total de la DDRISS')

    expect(screen.getByRole('button', { name: 'Municipios' }).textContent).toBe('2 municipios')
    expect(nombresEnTabla()).toEqual(['Total de la DDRISS', 'San Marcos', 'Tajumulco'])
    await waitFor(() => expect(obtenerSerie).toHaveBeenCalledWith(expect.objectContaining({ municipioId: undefined })))
  })

  test('con un solo municipio elegido, la serie se pide con su municipioId', async () => {
    await montar({ url: '/indicadores?municipios=1' })
    await screen.findByText('Total de la DDRISS')

    expect(nombresEnTabla()).toEqual(['Total de la DDRISS', 'San Marcos'])
    await waitFor(() => expect(obtenerSerie).toHaveBeenCalledWith(expect.objectContaining({ municipioId: 1 })))
  })

  test('un error en la serie muestra «Reintentar» sin ocultar la tabla', async () => {
    obtenerSerie.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Ocurrió un error interno. Intente de nuevo.'))
    await montar()

    expect(await screen.findByText(/No se pudo cargar la serie/)).toBeTruthy()
    expect(screen.getByText('Total de la DDRISS')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    await waitFor(() => expect(obtenerSerie).toHaveBeenCalledTimes(2))
  })
})
