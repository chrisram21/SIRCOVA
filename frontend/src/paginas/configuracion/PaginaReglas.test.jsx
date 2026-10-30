import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { toast } from 'sonner'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarVacunas } from '@/api/catalogos.js'
import {
  activarRegla,
  desactivarRegla,
  historialRegla,
  listarReglas,
  publicarVersionRegla,
} from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaReglas from './PaginaReglas.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({ listarVacunas: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  listarReglas: vi.fn(),
  historialRegla: vi.fn(),
  crearRegla: vi.fn(),
  publicarVersionRegla: vi.fn(),
  desactivarRegla: vi.fn(),
  activarRegla: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const SAN_MARCOS = { nivel: 'DDRISS', ddrissCodigo: 'DDRISS_SM' }

const regla = (codigo, version, territorio, estado, cambios = {}) => ({
  id: `${codigo}-${version}`,
  codigo,
  version,
  nombre: `Regla ${codigo}`,
  descripcion: null,
  tipo: 'RANGO',
  ambito: 'DETALLE',
  severidad: 'ADVERTENCIA',
  vacunas: ['*'],
  parametros: { minimo: 0, maximo: 100 },
  mensaje: '{vacuna} {dosis}: {valor} fuera de rango.',
  territorio,
  estado,
  vigencia: { desde: '2026-10-01T06:00:00.000Z', hasta: estado === 'VIGENTE' ? null : '2026-10-20T15:00:00.000Z' },
  publicadoPor: { id: 1, nombreUsuario: 'admin.prueba' },
  publicadoEn: '2026-10-01T06:00:00.000Z',
  motivoCambio: null,
  ...cambios,
})

const CAMPOS = regla('CAMPOS_COMPLETOS', 1, NACIONAL, 'VIGENTE', {
  nombre: 'Campos completos', tipo: 'CAMPOS_COMPLETOS', ambito: 'VACUNA', severidad: 'ERROR',
  parametros: { cero_explicito: true },
})
const VARIACION = regla('VARIACION_HISTORICA', 2, SAN_MARCOS, 'VIGENTE', {
  nombre: 'Variación atípica (San Marcos)', tipo: 'VARIACION_HISTORICA', ambito: 'VACUNA',
  parametros: { meses_referencia: 3, variacion_max_pct: 40, minimo_dosis: 10 },
  mensaje: 'La producción de {vacuna} varía {variacion} %.',
})
const RANGO = regla('RANGO_01', 3, SAN_MARCOS, 'HISTORICO', { nombre: 'Rango mensual', vacunas: ['BCG', 'HEXA'] })
const SECUENCIA_NACIONAL = regla('SECUENCIA_DOSIS', 1, NACIONAL, 'VIGENTE', {
  nombre: 'Coherencia entre dosis', tipo: 'SECUENCIA_DOSIS', ambito: 'VACUNA',
  parametros: { exceso_permitido_pct: 20 },
})
const SECUENCIA_PROPIA = regla('SECUENCIA_DOSIS', 2, SAN_MARCOS, 'HISTORICO', {
  nombre: 'Coherencia entre dosis (San Marcos)', tipo: 'SECUENCIA_DOSIS', ambito: 'VACUNA',
  parametros: { exceso_permitido_pct: 10 },
})

const fila = (codigo, tipo, aplica, ultimaDdriss, vigenteNacional) => ({
  codigo,
  tipo,
  ambito: (aplica ?? ultimaDdriss).ambito,
  aplica,
  ultimaDdriss,
  vigenteNacional: vigenteNacional === null ? null : { version: vigenteNacional },
})

const FILAS = [
  fila('CAMPOS_COMPLETOS', 'CAMPOS_COMPLETOS', CAMPOS, null, 1),
  fila('VARIACION_HISTORICA', 'VARIACION_HISTORICA', VARIACION, VARIACION, 1),
  fila('RANGO_01', 'RANGO', null, RANGO, null),
  fila('SECUENCIA_DOSIS', 'SECUENCIA_DOSIS', SECUENCIA_NACIONAL, SECUENCIA_PROPIA, 1),
]

const CONSULTAR = ['CONFIGURACION_CONSULTAR', 'REGLA_CONSULTAR', 'VACUNA_CONSULTAR']
const TODOS = [...CONSULTAR, 'REGLA_CREAR', 'REGLA_EDITAR']

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

async function abrir(permisos = TODOS) {
  montar(permisos)
  await waitFor(() => expect(screen.queryByLabelText('Cargando reglas')).toBeNull())
}

// Un data router: el panel del editor usa useBlocker (nota del 2026-10-26).
function montar(permisos) {
  guardarSesion(crearSesion(permisos))
  const elemento = (
    <ProveedorSesion>
      <PaginaReglas />
    </ProveedorSesion>
  )
  const router = createMemoryRouter([{ path: '/administracion/reglas', element: elemento }], {
    initialEntries: ['/administracion/reglas'],
  })
  render(<RouterProvider router={router} />)
}

const tabla = () => screen.getByRole('table', { name: 'Reglas de validación' })
const filaDe = (codigo) => within(tabla()).getByText(new RegExp(`^${codigo} ·`)).closest('tr')
const celdasDe = (codigo) => within(filaDe(codigo)).getAllByRole('cell').map((c) => c.textContent)

async function abrirAcciones(codigo) {
  fireEvent.keyDown(screen.getByRole('button', { name: `Acciones de ${codigo}` }), { key: 'Enter' })
  return within(await screen.findByRole('menu'))
}

async function elegirAccion(codigo, opcion) {
  const menu = await abrirAcciones(codigo)
  fireEvent.click(menu.getByRole('menuitem', { name: opcion }))
  return within(await screen.findByRole('alertdialog'))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarReglas.mockResolvedValue(FILAS)
})

test('la pantalla pide la lista una vez y muestra una fila por regla', async () => {
  await abrir()

  expect(screen.getByRole('heading', { level: 1, name: 'Reglas de validación' })).toBeTruthy()
  expect(listarReglas).toHaveBeenCalledTimes(1)
  expect(within(tabla()).getAllByRole('row')).toHaveLength(FILAS.length + 1)
})

test('la tabla muestra la severidad, las vacunas, la versión que aplica con su territorio y el estado', async () => {
  await abrir()

  expect(celdasDe('CAMPOS_COMPLETOS').slice(0, 5)).toEqual([
    'Campos completosCAMPOS_COMPLETOS · Campos completos',
    'Error',
    'Todas',
    'Versión 1 · Nacional',
    'Activa',
  ])
  expect(celdasDe('VARIACION_HISTORICA').slice(1, 5)).toEqual([
    'Advertencia',
    'Todas',
    'Versión 2 · DDRISS_SM',
    'Activa',
  ])
  // Inactiva: sin versión que aplique, se ven el nombre y las vacunas de su última versión.
  expect(celdasDe('RANGO_01').slice(0, 5)).toEqual([
    'Rango mensualRANGO_01 · Rango de valores',
    '—',
    'BCG, HEXA',
    '—',
    'Inactiva',
  ])
})

async function opciones(codigo) {
  const menu = await abrirAcciones(codigo)
  const textos = menu.getAllByRole('menuitem').map((m) => m.textContent)
  fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  return textos
}

test('«Desactivar» si la que aplica es de la DDRISS, y «Activar» si su última está en HISTORICO', async () => {
  await abrir()

  expect(await opciones('CAMPOS_COMPLETOS')).toEqual(['Nueva versión', 'Historial'])
  expect(await opciones('VARIACION_HISTORICA')).toEqual(['Nueva versión', 'Desactivar', 'Historial'])
  expect(await opciones('RANGO_01')).toEqual(['Nueva versión', 'Activar versión 3 de DDRISS_SM', 'Historial'])
  expect(await opciones('SECUENCIA_DOSIS')).toEqual(['Nueva versión', 'Activar versión 2 de DDRISS_SM', 'Historial'])
})

test('sin REGLA_CREAR ni REGLA_EDITAR solo queda «Historial»', async () => {
  await abrir(CONSULTAR)

  expect(screen.queryByRole('button', { name: 'Nueva regla' })).toBeNull()
  expect(await opciones('VARIACION_HISTORICA')).toEqual(['Historial'])
})

test('desactivar avisa que vuelve la nacional, exige el motivo y reemplaza la fila', async () => {
  const nacional = regla('VARIACION_HISTORICA', 1, NACIONAL, 'VIGENTE', {
    nombre: 'Variación atípica', tipo: 'VARIACION_HISTORICA', ambito: 'VACUNA',
  })
  const historica = { ...VARIACION, estado: 'HISTORICO' }
  const filaNueva = fila('VARIACION_HISTORICA', 'VARIACION_HISTORICA', nacional, historica, 1)
  desactivarRegla.mockResolvedValue(filaNueva)
  await abrir()

  const dialogo = await elegirAccion('VARIACION_HISTORICA', 'Desactivar')
  expect(dialogo.getByText('¿Desactivar la regla Variación atípica (San Marcos)?')).toBeTruthy()
  expect(dialogo.getByText('Al desactivarla vuelve a aplicar la versión 1 nacional.')).toBeTruthy()

  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))
  expect(await dialogo.findByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  expect(desactivarRegla).not.toHaveBeenCalled()
  expect(document.activeElement).toBe(dialogo.getByLabelText('Motivo del cambio'))

  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: '  Prueba de la DDRISS ' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(desactivarRegla).toHaveBeenCalledWith('VARIACION_HISTORICA', {
    version: 2,
    motivoCambio: 'Prueba de la DDRISS',
  })
  expect(toast.success).toHaveBeenCalledWith('Regla VARIACION_HISTORICA desactivada.')
  expect(celdasDe('VARIACION_HISTORICA')[3]).toBe('Versión 1 · Nacional')
  expect(listarReglas).toHaveBeenCalledTimes(1)
})

test('activar publica la copia de la última versión y vuelve a pedir la lista', async () => {
  activarRegla.mockResolvedValue({ ...RANGO, version: 4, estado: 'VIGENTE' })
  await abrir()

  const dialogo = await elegirAccion('RANGO_01', 'Activar versión 3 de DDRISS_SM')
  expect(dialogo.getByText('Se publicará una versión nueva con el mismo contenido de la versión 3.')).toBeTruthy()
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Se vuelve a revisar' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Activar' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(activarRegla).toHaveBeenCalledWith('RANGO_01', { version: 3, motivoCambio: 'Se vuelve a revisar' })
  expect(toast.success).toHaveBeenCalledWith('Regla RANGO_01 activada (versión 4).')
  await waitFor(() => expect(listarReglas).toHaveBeenCalledTimes(2))
})

test('un 409 se muestra en el diálogo y «Recargar» lo cierra y vuelve a pedir la lista', async () => {
  const mensaje = 'La regla VARIACION_HISTORICA cambió mientras la editaba; vuelva a abrirla.'
  desactivarRegla.mockRejectedValue(new ErrorApi(409, 'REGLA_DESACTUALIZADA', mensaje))
  await abrir()

  const dialogo = await elegirAccion('VARIACION_HISTORICA', 'Desactivar')
  fireEvent.change(dialogo.getByLabelText('Motivo del cambio'), { target: { value: 'Motivo' } })
  fireEvent.click(dialogo.getByRole('button', { name: 'Desactivar' }))

  expect(await dialogo.findByText(mensaje)).toBeTruthy()
  fireEvent.click(dialogo.getByRole('button', { name: 'Recargar' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  await waitFor(() => expect(listarReglas).toHaveBeenCalledTimes(2))
})

test('si falla la carga, «Reintentar» vuelve a pedir la lista', async () => {
  listarReglas.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falla'))
  montar(TODOS)

  expect(await screen.findByText(/No se pudieron cargar las reglas/)).toBeTruthy()
  // El encabezado y «Nueva regla» siguen a la vista.
  expect(screen.getByRole('heading', { level: 1, name: 'Reglas de validación' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByRole('table', { name: 'Reglas de validación' })).toBeTruthy()
  expect(listarReglas).toHaveBeenCalledTimes(2)
})

test('publicar una versión desde el panel lo cierra, avisa y vuelve a pedir la lista', async () => {
  listarVacunas.mockResolvedValue([{ id: 1, codigo: 'BCG', nombre: 'BCG' }])
  publicarVersionRegla.mockResolvedValue({ ...VARIACION, version: 5 })
  await abrir()

  const menu = await abrirAcciones('VARIACION_HISTORICA')
  fireEvent.click(menu.getByRole('menuitem', { name: 'Nueva versión' }))
  const panel = within(await screen.findByRole('dialog', { name: 'Nueva versión de VARIACION_HISTORICA' }))
  fireEvent.change(panel.getByLabelText('Motivo del cambio'), { target: { value: 'Umbral nuevo' } })
  fireEvent.change(panel.getByLabelText('Variación máxima (%)'), { target: { value: '30' } })
  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  expect(publicarVersionRegla).toHaveBeenCalledWith('VARIACION_HISTORICA', expect.objectContaining({ versionBase: 2 }))
  expect(toast.success).toHaveBeenCalledWith('Regla VARIACION_HISTORICA publicada (versión 5).')
  await waitFor(() => expect(listarReglas).toHaveBeenCalledTimes(2))
})

test('el historial muestra las versiones y la desactivación', async () => {
  historialRegla.mockResolvedValue([
    { ...SECUENCIA_PROPIA, desactivacion: {
      en: '2026-10-20T15:00:00.000Z',
      por: { id: 1, nombreUsuario: 'admin.prueba' },
      motivo: 'Se revisa a mano este mes',
    } },
    { ...SECUENCIA_NACIONAL, parametros: { exceso_permitido_pct: 20 }, motivoCambio: 'Semilla', desactivacion: null },
  ])
  await abrir()

  const menu = await abrirAcciones('SECUENCIA_DOSIS')
  fireEvent.click(menu.getByRole('menuitem', { name: 'Historial' }))
  const panel = within(await screen.findByRole('dialog', { name: 'Historial de Coherencia entre dosis' }))
  const versiones = await panel.findAllByRole('listitem')

  expect(historialRegla).toHaveBeenCalledWith('SECUENCIA_DOSIS')
  expect(versiones).toHaveLength(2)
  expect(versiones[0].textContent).toContain('Versión 2')
  expect(versiones[0].textContent).toContain('DDRISS_SM')
  expect(versiones[0].textContent).toContain('Histórica')
  expect(versiones[0].textContent).toMatch(/Desactivada el .+ por admin\.prueba: Se revisa a mano este mes/)
  expect(versiones[1].textContent).toContain('Exceso permitido (%)20')
  expect(versiones[1].textContent).toContain('Semilla')
  expect(versiones[1].textContent).not.toContain('Desactivada')
})
