import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import {
  activarIndicador,
  desactivarIndicador,
  historialIndicador,
  listarConfigIndicadores,
  opcionesIndicadores,
  publicarVersionIndicador,
} from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaConfigIndicadores from './PaginaConfigIndicadores.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarConfigIndicadores: vi.fn(),
  opcionesIndicadores: vi.fn(),
  historialIndicador: vi.fn(),
  crearIndicador: vi.fn(),
  publicarVersionIndicador: vi.fn(),
  desactivarIndicador: vi.fn(),
  activarIndicador: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }
const HEXA = { codigo: 'HEXA', nombre: 'Hexavalente', activa: true }
const ASCENDENTES = [
  { color: 'verde', desde: 90, hasta: null },
  { color: 'amarillo', desde: 80, hasta: 90 },
  { color: 'rojo', desde: 0, hasta: 80 },
]

const indicador = (codigo, version, territorio, estado, cambios = {}) => ({
  id: `${codigo}-${version}`,
  codigo,
  version,
  nombre: `Indicador ${codigo}`,
  descripcion: null,
  tipoCalculo: 'COBERTURA',
  vacuna: HEXA,
  dosis: 'D3',
  dosisInicial: null,
  dosisFinal: null,
  clasificacionPoblacion: 'MENOR_1',
  grupoEdad: 'MENOR_1',
  numerador: { fuente: 'PRODUCCION', estadosReporte: ['CERRADO'], atribucion: 'PROCEDENCIA', acumulado: 'ANUAL' },
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
  meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
  umbrales: ASCENDENTES,
  umbralesProvisionales: false,
  esIndicadorMapa: false,
  parametros: {},
  alerta: { generar: false },
  esEstimacion: false,
  territorio,
  estado,
  vigencia: { desde: '2026-10-01T06:00:00.000Z', hasta: estado === 'VIGENTE' ? null : '2026-10-20T15:00:00.000Z' },
  publicadoPor: null,
  publicadoEn: '2026-10-01T06:00:00.000Z',
  motivoCambio: null,
  ...cambios,
})

const COB = indicador('COB_HEXA3', 1, NACIONAL, 'VIGENTE', { nombre: 'Cobertura de Hexavalente 3' })
const AVANCE = indicador('AVANCE_HEXA3', 2, SAN_MARCOS, 'VIGENTE', {
  nombre: 'Avance de Hexavalente 3',
  tipoCalculo: 'AVANCE_META_MES',
  meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
  umbralesProvisionales: true,
  esIndicadorMapa: true,
})
const DES = indicador('DES_HEXA1_3', 1, NACIONAL, 'VIGENTE', {
  nombre: 'Deserción de Hexavalente',
  tipoCalculo: 'DESERCION',
  dosis: null,
  dosisInicial: 'D1',
  dosisFinal: 'D3',
  clasificacionPoblacion: null,
  meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
  umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
})
const BRECHA = indicador('BRECHA_SPR1', 3, SAN_MARCOS, 'HISTORICO', {
  nombre: 'Brecha de SPR 1',
  tipoCalculo: 'BRECHA',
  vacuna: { codigo: 'SPR', nombre: 'SPR', activa: true },
  dosis: 'D1',
  grupoEdad: null,
  umbrales: [],
})

const fila = (codigo, tipoCalculo, aplica, ultimaDdriss, vigenteNacional) => ({
  codigo,
  tipoCalculo,
  vacuna: (aplica ?? ultimaDdriss).vacuna,
  aplica,
  ultimaDdriss,
  vigenteNacional: vigenteNacional === null ? null : { version: vigenteNacional },
})

const FILAS = [
  fila('COB_HEXA3', 'COBERTURA', COB, null, 1),
  fila('AVANCE_HEXA3', 'AVANCE_META_MES', AVANCE, AVANCE, 1),
  fila('DES_HEXA1_3', 'DESERCION', DES, null, 1),
  fila('BRECHA_SPR1', 'BRECHA', null, BRECHA, null),
]

const CONSULTAR = ['CONFIGURACION_CONSULTAR', 'INDICADOR_CONFIG_CONSULTAR']
const TODOS = [...CONSULTAR, 'INDICADOR_CONFIG_EDITAR']

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '4', exp })}.firma`,
    usuario: {
      id: 4,
      nombreUsuario: 'epidemiologia',
      rol: 'EPIDEMIOLOGIA',
      permisos,
      empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

// Un data router: el panel del editor usa useBlocker (nota del 2026-10-26).
function montar(permisos) {
  guardarSesion(crearSesion(permisos))
  const elemento = (
    <ProveedorSesion>
      <PaginaConfigIndicadores />
    </ProveedorSesion>
  )
  const router = createMemoryRouter([{ path: '/administracion/indicadores', element: elemento }], {
    initialEntries: ['/administracion/indicadores'],
  })
  render(<RouterProvider router={router} />)
}

async function abrir(permisos = TODOS) {
  montar(permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando indicadores')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Indicadores' })
const filaDe = (codigo) => within(tabla()).getByText(new RegExp(`^${codigo} ·`)).closest('tr')
const celdasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell').map((c) => c.textContent)

async function abrirAcciones(codigo) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
  return within(await screen.findByRole('menu'))
}

async function opciones(codigo) {
  const menu = await abrirAcciones(codigo)
  const textos = menu.getAllByRole('menuitem').map((m) => m.textContent)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  return textos
}

async function elegirAccion(codigo, opcion) {
  const menu = await abrirAcciones(codigo)
  fireEvent.click(menu.getByRole('menuitem', { name: opcion }))
  return within(await screen.findByRole('alertdialog'))
}

beforeEach(() => {
  vi.clearAllMocks()
  listarConfigIndicadores.mockResolvedValue(FILAS)
})

test('la pantalla pide la lista una vez y muestra una fila por indicador', async () => {
  await abrir()

  expect(screen.getByRole('heading', { level: 1, name: 'Configuración de indicadores' })).toBeTruthy()
  expect(listarConfigIndicadores).toHaveBeenCalledTimes(1)
  expect(within(tabla()).getAllByRole('row')).toHaveLength(FILAS.length + 1)
})

test('la tabla muestra la vacuna y las dosis, la meta, el semáforo, la versión que aplica y el estado', async () => {
  await abrir()

  expect(celdasDe('COB_HEXA3').slice(0, 6)).toEqual([
    'Cobertura de Hexavalente 3COB_HEXA3 · Cobertura',
    'Hexavalente · D3Población MENOR_1 · Edad MENOR_1',
    '> 95 %',
    '< 8080 a 90≥ 90',
    'Versión 1 · Nacional',
    'Activo',
  ])
  expect(celdasDe('AVANCE_HEXA3').slice(0, 6)).toEqual([
    'Avance de Hexavalente 3AVANCE_HEXA3 · Avance contra la meta del mesMapa',
    'Hexavalente · D3Población MENOR_1 · Edad MENOR_1',
    '≥ 100 % del mes',
    '< 8080 a 90≥ 90Provisional',
    'Versión 2 · DDRISS_SM',
    'Activo',
  ])
  // Inactivo: sin versión que aplique, se ven el nombre, la vacuna y la dosis de su última versión.
  expect(celdasDe('BRECHA_SPR1').slice(0, 6)).toEqual([
    'Brecha de SPR 1BRECHA_SPR1 · Brecha de dosis',
    'SPR · D1Población MENOR_1 · Todas las edades',
    '—',
    '—',
    '—',
    'Inactivo',
  ])
})

test('una deserción muestra sus dos dosis y, con dos franjas, una insignia por franja', async () => {
  await abrir()

  const [, vacuna, meta, semaforo] = celdasDe('DES_HEXA1_3')
  expect(vacuna).toBe('Hexavalente · D1 a D3Edad MENOR_1')
  expect(meta).toBe('≤ 10 %')
  expect(semaforo).toBe('hasta 10desde 10')
  const insignias = within(filaDe('DES_HEXA1_3')).getAllByTitle(/Verde|Rojo/)
  expect(insignias.map((i) => i.getAttribute('title'))).toEqual(['Verde', 'Rojo'])
})

test('«Desactivar» si la que aplica es de la DDRISS, y «Activar» si su última está en HISTORICO', async () => {
  await abrir()

  expect(await opciones('COB_HEXA3')).toEqual(['Nueva versión', 'Historial'])
  expect(await opciones('AVANCE_HEXA3')).toEqual(['Nueva versión', 'Desactivar', 'Historial'])
  expect(await opciones('BRECHA_SPR1')).toEqual(['Nueva versión', 'Activar versión 3 de DDRISS_SM', 'Historial'])
})

test('sin INDICADOR_CONFIG_EDITAR solo queda «Historial»', async () => {
  await abrir(CONSULTAR)

  expect(screen.queryByRole('button', { name: 'Nuevo indicador' })).toBeNull()
  expect(await opciones('AVANCE_HEXA3')).toEqual(['Historial'])
  expect(await opciones('BRECHA_SPR1')).toEqual(['Historial'])
})

test('desactivar avisa que vuelve la nacional, exige el motivo y reemplaza la fila', async () => {
  const historico = { ...AVANCE, estado: 'HISTORICO' }
  const nacional = indicador('AVANCE_HEXA3', 1, NACIONAL, 'VIGENTE', {
    nombre: 'Avance de Hexavalente 3', tipoCalculo: 'AVANCE_META_MES',
    meta: { valor: 100, unidad: 'PORCENTAJE', comparador: '>=' },
  })
  desactivarIndicador.mockResolvedValue(fila('AVANCE_HEXA3', 'AVANCE_META_MES', nacional, historico, 1))
  await abrir()

  const dialogo = await elegirAccion('AVANCE_HEXA3', 'Desactivar')
  expect(dialogo.getByText('¿Desactivar el indicador Avance de Hexavalente 3?')).toBeTruthy()
  expect(dialogo.getByText('Al desactivarlo vuelve a aplicar la versión 1 nacional.')).toBeTruthy()

  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))
  expect(await dialogo.findByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  expect(desactivarIndicador).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(dialogo.getByLabelText('Motivo del cambio'))

  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: '  Se usa el nacional ' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(desactivarIndicador).toHaveBeenCalledWith('AVANCE_HEXA3', { version: 2, motivoCambio: 'Se usa el nacional' })
  expect(toast.success).toHaveBeenCalledWith('Indicador AVANCE_HEXA3 desactivado.')
  expect(celdasDe('AVANCE_HEXA3')[4]).toBe('Versión 1 · Nacional')
  expect(listarConfigIndicadores).toHaveBeenCalledTimes(1)
})

test('activar publica la copia de la última versión y vuelve a pedir la lista', async () => {
  activarIndicador.mockResolvedValue({ ...BRECHA, version: 4, estado: 'VIGENTE' })
  await abrir()

  const dialogo = await elegirAccion('BRECHA_SPR1', 'Activar versión 3 de DDRISS_SM')
  expect(dialogo.getByText('Se publicará una versión nueva con el mismo contenido de la versión 3.')).toBeTruthy()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Se vuelve a calcular' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Activar' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(activarIndicador).toHaveBeenCalledWith('BRECHA_SPR1', { version: 3, motivoCambio: 'Se vuelve a calcular' })
  expect(toast.success).toHaveBeenCalledWith('Indicador BRECHA_SPR1 activado (versión 4).')
  await waitFor(() => expect(listarConfigIndicadores).toHaveBeenCalledTimes(2))
})

test('un 409 se muestra en el diálogo y «Recargar» lo cierra y vuelve a pedir la lista', async () => {
  const mensaje = 'Ya existe el indicador BRECHA_SPR1_2 para la misma vacuna y dosis; publique una versión de ese.'
  activarIndicador.mockRejectedValue(new ErrorApi(409, 'INDICADOR_DUPLICADO', mensaje))
  await abrir()

  const dialogo = await elegirAccion('BRECHA_SPR1', 'Activar versión 3 de DDRISS_SM')
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Motivo' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Activar' }))

  expect(await dialogo.findByText(mensaje)).toBeTruthy()
  fireEvent.click(dialogo.getByRole('button', { name: 'Recargar' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(listarConfigIndicadores).toHaveBeenCalledTimes(2))
})

test('si falla la carga, «Reintentar» vuelve a pedir la lista', async () => {
  listarConfigIndicadores.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falla'))
  montar(TODOS)

  expect(await screen.findByText(/No se pudieron cargar los indicadores/)).toBeTruthy()
  expect(screen.getByRole('heading', { level: 1, name: 'Configuración de indicadores' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('table', { name: 'Indicadores' })).toBeTruthy()
  expect(listarConfigIndicadores).toHaveBeenCalledTimes(2)
})

test('publicar una versión desde el panel lo cierra, avisa y vuelve a pedir la lista', async () => {
  opcionesIndicadores.mockResolvedValue({
    vacunas: [{ codigo: 'HEXA', nombre: 'Hexavalente', dosis: [
      { codigo: 'D3', nombre: 'Tercera dosis', orden: 3, completaEsquema: true },
    ] }],
    clasificaciones: [{ codigo: 'MENOR_1', descripcion: 'Menores de 1 año' }],
    gruposEdad: [{ codigo: 'MENOR_1', etiqueta: 'Menor de 1 año' }],
  })
  publicarVersionIndicador.mockResolvedValue({ ...COB, version: 2, territorio: SAN_MARCOS })
  await abrir()

  const menu = await abrirAcciones('COB_HEXA3')
  fireEvent.click(menu.getByRole('menuitem', { name: 'Nueva versión' }))
  const panel = within(await screen.findByRole('dialog', { name: 'Nueva versión de COB_HEXA3' }))
  fireEvent.change(await panel.findByLabelText('Meta (%)'), { target: { value: '90' } })
  fireEvent.change(panel.getByLabelText('Motivo del cambio'), { target: { value: 'Meta de San Marcos' } })
  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(publicarVersionIndicador).toHaveBeenCalledWith(
    'COB_HEXA3',
    expect.objectContaining({ versionBase: 1, meta: 90 }),
  )
  expect(toast.success).toHaveBeenCalledWith('Indicador COB_HEXA3 publicado (versión 2).')
  await waitFor(() => expect(listarConfigIndicadores).toHaveBeenCalledTimes(2))
})

test('el historial muestra las versiones y la desactivación', async () => {
  historialIndicador.mockResolvedValue([
    { ...AVANCE, estado: 'HISTORICO', motivoCambio: 'Rangos de la DDRISS', desactivacion: {
      en: '2026-10-20T15:00:00.000Z',
      por: { id: 4, nombreUsuario: 'epidemiologia' },
      motivo: 'Se usa el nacional',
    } },
    { ...AVANCE, id: 'nac', version: 1, territorio: NACIONAL, motivoCambio: null, desactivacion: null },
  ])
  await abrir()

  const menu = await abrirAcciones('AVANCE_HEXA3')
  fireEvent.click(menu.getByRole('menuitem', { name: 'Historial' }))
  const panel = within(await screen.findByRole('dialog', { name: 'Historial de Avance de Hexavalente 3' }))
  const versiones = await panel.findAllByRole('listitem')

  expect(historialIndicador).toHaveBeenCalledWith('AVANCE_HEXA3')
  expect(versiones).toHaveLength(2)
  expect(versiones[0].textContent).toContain('Versión 2')
  expect(versiones[0].textContent).toContain('DDRISS_SM')
  expect(versiones[0].textContent).toContain('Histórica')
  expect(versiones[0].textContent).toContain('Proporcional al mes')
  expect(versiones[0].textContent).toContain('≥ 100 % del mes')
  expect(versiones[0].textContent).toMatch(/Desactivada el .+ por epidemiologia: Se usa el nacional/)
  expect(versiones[1].textContent).toContain('Nacional')
  expect(versiones[1].textContent).not.toContain('Desactivada')
})
