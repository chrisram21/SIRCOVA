import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente.js'
import {
  agregarVacuna,
  guardarVacuna,
  listarVacunasDisponibles,
  obtenerFormulario,
  obtenerReporte,
  quitarVacuna,
  validarReporte,
} from '@/api/produccion.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import CapturaReporte from './CapturaReporte.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/produccion.js', () => ({
  obtenerFormulario: vi.fn(),
  obtenerReporte: vi.fn(),
  guardarVacuna: vi.fn(),
  listarVacunasDisponibles: vi.fn(),
  agregarVacuna: vi.fn(),
  quitarVacuna: vi.fn(),
  validarReporte: vi.fn(),
}))

// El aviso de guardado es un toast (sonner, simulado en preparar-pruebas.js).
const borradorGuardado = () => waitFor(() => expect(toast.success).toHaveBeenCalledWith('Borrador guardado.'))

const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const HEXAVALENTE = {
  id: 51,
  vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' },
  esquema: { id: 'e-hexa', version: 2 },
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
    { codigo: 'R1', nombre: 'Refuerzo', orden: 3, activa: false },
  ],
  dimensiones: [
    { codigo: 'grupo_edad', nombre: 'Grupo de edad', etiqueta: null, valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 4)] },
  ],
}
const VPH = {
  id: 52,
  vacuna: { id: 5, codigo: 'VPH', nombre: 'VPH' },
  esquema: { id: 'e-vph', version: 1 },
  dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
  dimensiones: [
    { codigo: 'sexo', nombre: 'Sexo', etiqueta: 'Sexo biológico', valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] },
  ],
}
const REPORTE = { id: 7, actualizadoEn: '2026-10-25T15:04:00.000Z', vacunas: [HEXAVALENTE, VPH] }

const PROCEDENCIA = { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true }
const esquemaHexa = {
  id: 'e-hexa',
  version: 2,
  estado: 'VIGENTE',
  vigencia: { desde: '2026-10-01', hasta: null },
  procedencia: PROCEDENCIA,
  dosis: ['D1', 'D2', 'R1'].map((codigo) => ({ codigo, etiqueta: null, desagregacion: null })),
  desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'], etiqueta: null }],
  secciones: [
    { codigo: 'MENOR_1', titulo: '< 1 año', orden: 1, grupoEdad: 'MENOR_1', dosis: ['D1', 'D2', 'R1'] },
    { codigo: '1_A_5', titulo: 'De 1 a < 6 años', orden: 2, grupoEdad: '1_A_5', dosis: ['D1', 'D2'] },
  ],
  camposAdicionales: [{ clave: 'frascos', etiqueta: 'Frascos abiertos', tipo: 'entero', requerido: true, minimo: 0, maximo: null }],
  reglas: [],
}
const esquemaVph = {
  id: 'e-vph',
  version: 1,
  estado: 'VIGENTE',
  vigencia: { desde: '2026-01-01', hasta: null },
  procedencia: PROCEDENCIA,
  dosis: [{ codigo: 'D1', etiqueta: null, desagregacion: null }],
  desagregacion: [{ dimension: 'sexo', valores: ['M', 'F'], etiqueta: null }],
  secciones: [{ codigo: 'GENERAL', titulo: 'VPH', orden: 1, grupoEdad: null, dosis: ['D1'] }],
  camposAdicionales: [],
  reglas: [],
}
const celda = (dosisCodigo, dimensiones, cantidad, municipioProcedenciaId = 1) => ({
  dosisCodigo,
  municipioProcedenciaId,
  dimensiones,
  claveCombinacion: Object.keys(dimensiones).sort().map((d) => `${d}=${dimensiones[d]}`).join('|'),
  cantidad,
})
const SAN_PEDRO = 2
const SIBINAL = 13
const MIGRANTES = 31
const MUNICIPIOS = [
  { id: SAN_PEDRO, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' },
  { id: SIBINAL, codigoIne: '1213', nombre: 'Sibinal' },
  { id: MIGRANTES, codigoIne: '9999', nombre: 'Migrantes / fuera de San Marcos' },
]
const PERMITIDAS = [SAN_PEDRO, SIBINAL, MIGRANTES]
const capturaHexa = (cambios = {}) => ({
  vacunaId: 3,
  esquema: esquemaHexa,
  procedenciasPermitidas: PERMITIDAS,
  celdas: [
    celda('D1', { grupo_edad: 'MENOR_1' }, 78),
    celda('D2', { grupo_edad: 'MENOR_1' }, 0),
    // De otro municipio: no es de la tarjeta A.
    celda('D1', { grupo_edad: 'MENOR_1' }, 5, 2),
  ],
  datosAdicionales: { frascos: 12 },
  totalDeclarado: 83,
  ...cambios,
})
const capturaVph = (cambios = {}) => ({
  vacunaId: 5,
  esquema: esquemaVph,
  procedenciasPermitidas: PERMITIDAS,
  celdas: [],
  datosAdicionales: null,
  totalDeclarado: null,
  ...cambios,
})
const formulario = (cambios = {}) => ({
  reporteId: 7,
  versionFila: 3,
  editable: true,
  municipioPropio: { id: 1, nombre: 'San Marcos' },
  municipios: MUNICIPIOS,
  vacunas: [capturaHexa(), capturaVph()],
  ...cambios,
})

// useBlocker necesita un data router.
function dibujar({ reporte = REPORTE, formularioPedido } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/registro', element: <CapturaReporte reporte={reporte} formularioPedido={formularioPedido} /> },
      { path: '/inicio', element: <p>Pantalla de inicio</p> },
    ],
    { initialEntries: ['/registro'] },
  )
  render(<RouterProvider router={router} />)
  return router
}

async function montar(recibido = formulario()) {
  obtenerFormulario.mockResolvedValue(recibido)
  const router = dibujar()
  await waitFor(() => expect(screen.queryByLabelText('Cargando formulario')).toBeNull())
  return router
}

const campo = (nombre) => screen.getByRole('textbox', { name: nombre })
const escribir = (nombre, texto) => fireEvent.change(campo(nombre), { target: { value: texto } })
const botonGuardar = () => screen.getByRole('button', { name: 'Guardar borrador' })
const abrirPestana = async (nombre) => {
  fireEvent.mouseDown(screen.getByRole('tab', { name: nombre }))
  await waitFor(() => expect(screen.getByRole('tab', { name: nombre }).getAttribute('aria-selected')).toBe('true'))
}

beforeEach(() => {
  vi.clearAllMocks()
  // «Recargar reporte» pide también el detalle: las vacunas pudieron cambiar (SPEC 31).
  obtenerReporte.mockResolvedValue(REPORTE)
})

test('carga las cantidades del municipio propio: un 0 se ve como «0» y una vacía, vacía', async () => {
  await montar()

  expect(obtenerFormulario).toHaveBeenCalledWith(7)
  expect(screen.getByText('Dosis aplicadas a residentes de San Marcos')).toBeTruthy()
  expect(
    screen.getByText('Formulario generado por el esquema de captura: Hexavalente, versión 2, vigente desde 01/10/2026'),
  ).toBeTruthy()
  expect(campo('1.ª dosis · < 1 año').value).toBe('78')
  expect(campo('2.ª dosis · < 1 año').value).toBe('0')
  expect(campo('1.ª dosis · De 1 a < 6 años').value).toBe('')
  // La celda de otro municipio no se suma a la tarjeta A.
  expect(screen.getByLabelText('Total general').textContent).toBe('78')
  expect(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }).value).toBe('12')
  expect(botonGuardar().disabled).toBe(true)
})

test('la franja de cada pestaña nombra sus dimensiones, con la etiqueta del esquema si la trae', async () => {
  await montar()
  const franja = () => screen.getByText('Dimensiones de este esquema:').parentElement.textContent
  expect(franja()).toBe('Dimensiones de este esquema:DosisGrupo de edad')
  await abrirPestana('VPH')
  expect(franja()).toBe('Dimensiones de este esquema:DosisSexo biológico')
})

test('una dosis inactiva sin filas en el reporte no aparece', async () => {
  await montar()
  expect(screen.queryByRole('textbox', { name: 'Refuerzo · < 1 año' })).toBeNull()
})

test('una dosis inactiva con filas en el reporte, aunque sean de otro municipio, sí aparece', async () => {
  const conRefuerzo = capturaHexa()
  conRefuerzo.celdas = [...conRefuerzo.celdas, celda('R1', { grupo_edad: 'MENOR_1' }, 2, 2)]
  await montar(formulario({ vacunas: [conRefuerzo, capturaVph()] }))
  expect(campo('Refuerzo · < 1 año').value).toBe('')
})

test('cambiar de pestaña conserva lo escrito', async () => {
  await montar()
  escribir('1.ª dosis · De 1 a < 6 años', '9')

  await abrirPestana('VPH')
  escribir('1.ª dosis · Masculino', '3')
  await abrirPestana('Hexavalente')

  expect(campo('1.ª dosis · De 1 a < 6 años').value).toBe('9')
  await abrirPestana('VPH')
  expect(campo('1.ª dosis · Masculino').value).toBe('3')
})

test('«Guardar borrador» se deshabilita con una celda inválida y lo dice', async () => {
  await montar()
  escribir('1.ª dosis · De 1 a < 6 años', '2.5')

  expect(botonGuardar().disabled).toBe(true)
  expect(screen.getByText('Corrija las cantidades marcadas para guardar.')).toBeTruthy()
  expect(
    screen.getByText('Hay cantidades de Hexavalente que no son números enteros (0 en adelante); están marcadas en rojo.'),
  ).toBeTruthy()
  expect(campo('1.ª dosis · De 1 a < 6 años').getAttribute('title')).toBe('Escriba un número entero, de 0 en adelante.')
  // La pestaña de la vacuna lo marca, para encontrarla desde otra pestaña.
  const pestana = screen.getByRole('tab', { name: 'Hexavalente' })
  const descripcion = pestana.getAttribute('aria-describedby').split(' ').map((id) => document.getElementById(id).textContent)
  expect(descripcion).toContain('(cantidades no válidas)')
  expect(screen.getByRole('tab', { name: 'VPH' }).getAttribute('aria-describedby')).toBeNull()

  escribir('1.ª dosis · De 1 a < 6 años', '2')
  expect(botonGuardar().disabled).toBe(false)
  expect(screen.queryByText('Corrija las cantidades marcadas para guardar.')).toBeNull()
})

test('guarda solo las vacunas con cambios, en orden, con la versionFila encadenada y sin las celdas vacías', async () => {
  await montar()
  guardarVacuna
    .mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80), celda('D2', { grupo_edad: 'MENOR_1' }, 0)] }) })
    .mockResolvedValueOnce({ versionFila: 5, vacuna: capturaVph({ celdas: [celda('D1', { sexo: 'M' }, 3)], totalDeclarado: 3 }) })

  escribir('1.ª dosis · < 1 año', '80')
  // Escrita y borrada: queda vacía y no se manda.
  escribir('1.ª dosis · De 1 a < 6 años', '5')
  escribir('1.ª dosis · De 1 a < 6 años', '')
  await abrirPestana('VPH')
  escribir('1.ª dosis · Masculino', '3')
  fireEvent.click(botonGuardar())

  await borradorGuardado()
  expect(guardarVacuna).toHaveBeenCalledTimes(2)
  // La celda de otro municipio (la tarjeta B) también se manda: el PUT reemplaza todas las procedencias.
  expect(guardarVacuna).toHaveBeenNthCalledWith(1, 7, 3, {
    versionFila: 3,
    celdas: [
      { dosisCodigo: 'D1', municipioProcedenciaId: 1, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 80 },
      { dosisCodigo: 'D2', municipioProcedenciaId: 1, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 0 },
      { dosisCodigo: 'D1', municipioProcedenciaId: SAN_PEDRO, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 5 },
    ],
    datosAdicionales: { frascos: 12 },
  })
  // VPH no tiene campos adicionales: no se manda datosAdicionales.
  expect(guardarVacuna).toHaveBeenNthCalledWith(2, 7, 5, {
    versionFila: 4,
    celdas: [{ dosisCodigo: 'D1', municipioProcedenciaId: 1, dimensiones: { sexo: 'M' }, cantidad: 3 }],
  })
  // Lo guardado es la nueva base: ya no hay cambios.
  expect(botonGuardar().disabled).toBe(true)
})

test('mientras se guarda, los campos y el botón quedan deshabilitados', async () => {
  await montar()
  let terminar
  guardarVacuna.mockReturnValueOnce(new Promise((resolver) => (terminar = resolver)))

  escribir('1.ª dosis · < 1 año', '80')
  fireEvent.click(botonGuardar())

  const guardando = await screen.findByRole('button', { name: 'Guardando…' })
  expect(guardando.disabled).toBe(true)
  expect(campo('1.ª dosis · < 1 año').disabled).toBe(true)
  expect(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }).disabled).toBe(true)

  terminar({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80)] }) })
  await borradorGuardado()
  expect(campo('1.ª dosis · < 1 año').disabled).toBe(false)
})

test('un cambio solo en los datos adicionales guarda esa vacuna con el número convertido', async () => {
  await montar()
  guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ datosAdicionales: { frascos: 15 } }) })

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }), { target: { value: '15' } })
  fireEvent.click(botonGuardar())

  await borradorGuardado()
  expect(guardarVacuna).toHaveBeenCalledTimes(1)
  expect(guardarVacuna.mock.calls[0][2].datosAdicionales).toEqual({ frascos: 15 })
})

test('un 422 muestra la vacuna y el mensaje, y conserva lo escrito', async () => {
  await montar()
  guardarVacuna.mockRejectedValueOnce(
    new ErrorApi(422, 'CELDA_INVALIDA', 'La celda 1.ª dosis · < 1 año no es parte del formulario.'),
  )

  escribir('1.ª dosis · < 1 año', '80')
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('No se guardó Hexavalente: La celda 1.ª dosis · < 1 año no es parte del formulario.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Recargar reporte' })).toBeNull()
  expect(campo('1.ª dosis · < 1 año').value).toBe('80')
  expect(botonGuardar().disabled).toBe(false)
})

test('si falla la segunda vacuna, la primera queda guardada; un 409 REPORTE_DESACTUALIZADO ofrece recargar', async () => {
  await montar()
  guardarVacuna
    .mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80)] }) })
    .mockRejectedValueOnce(new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'))

  escribir('1.ª dosis · < 1 año', '80')
  await abrirPestana('VPH')
  escribir('1.ª dosis · Femenino', '1')
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('No se guardó VPH: El reporte cambió desde que lo abrió; recárguelo.')).toBeTruthy()
  expect(guardarVacuna).toHaveBeenCalledTimes(2)

  obtenerFormulario.mockResolvedValue(formulario({ versionFila: 6 }))
  fireEvent.click(screen.getByRole('button', { name: 'Recargar reporte' }))
  await waitFor(() => expect(obtenerFormulario).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.queryByText(/No se guardó VPH/)).toBeNull())
})

test('un reporte que no se puede editar se ve en solo lectura, sin «Guardar borrador»', async () => {
  await montar(formulario({ editable: false }))

  expect(screen.queryByRole('button', { name: 'Guardar borrador' })).toBeNull()
  expect(screen.getByText('Solo consulta')).toBeTruthy()
  expect(screen.getByText('Este reporte no se puede editar en su estado actual.')).toBeTruthy()
  expect(campo('1.ª dosis · < 1 año').value).toBe('78')
  for (const elemento of screen.getAllByRole('textbox')) expect(elemento.disabled).toBe(true)
  expect(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }).disabled).toBe(true)
})

test('en solo lectura, el aviso dice el estado del reporte cuando ya salió del Borrador', async () => {
  obtenerFormulario.mockResolvedValue(formulario({ editable: false }))
  dibujar({ reporte: { ...REPORTE, estado: 'EN_REVISION' } })

  expect(await screen.findByText('El reporte está en «En revisión»: solo se puede consultar.')).toBeTruthy()
})

test('con el formulario ya pedido (formularioPedido), lo usa y no lo vuelve a pedir; «Reintentar» sí pide', async () => {
  const fallo = Promise.reject(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  fallo.catch(() => {})
  obtenerFormulario.mockResolvedValue(formulario())
  dibujar({ formularioPedido: fallo })

  expect(await screen.findByText('No se pudo cargar el formulario: No se pudo conectar con el servidor.')).toBeTruthy()
  expect(obtenerFormulario).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(screen.queryByLabelText('Cargando formulario')).toBeNull())
  expect(obtenerFormulario).toHaveBeenCalledWith(7)
  expect(campo('1.ª dosis · < 1 año').value).toBe('78')
})

test('una vacuna cuyo esquema ya no está avisa en su pestaña', async () => {
  await montar(formulario({ vacunas: [capturaHexa({ esquema: null }), capturaVph()] }))
  expect(screen.getByText('No se encontró el formulario de esta vacuna.')).toBeTruthy()
})

describe('tarjeta B: otros municipios', () => {
  // Hexavalente solo desagrega por edad: cada fila de la tarjeta B tiene una sola celda, nombrada como la fila.
  const conOtras = () =>
    capturaHexa({
      celdas: [
        celda('D1', { grupo_edad: 'MENOR_1' }, 78),
        celda('D1', { grupo_edad: 'MENOR_1' }, 1, MIGRANTES),
        celda('D2', { grupo_edad: '1_A_5' }, 0, SIBINAL),
        celda('D1', { grupo_edad: 'MENOR_1' }, 5, SAN_PEDRO),
      ],
    })
  const filasDeB = () =>
    [...screen.getByRole('table', { name: 'Otros municipios' }).querySelectorAll('tbody tr')].map((tr) =>
      [...tr.querySelectorAll('td')].slice(0, 3).map((td) => td.textContent),
    )
  const select = (nombre) => document.querySelector(`select[name="${nombre}"]`)
  async function agregarFila(municipioId, dosis, seccion) {
    fireEvent.click(screen.getByRole('button', { name: /Agregar municipio de procedencia/ }))
    fireEvent.change(select('municipio'), { target: { value: String(municipioId) } })
    fireEvent.change(select('dosis'), { target: { value: dosis } })
    fireEvent.change(select('seccion'), { target: { value: String(seccion) } })
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  test('las celdas guardadas de otras procedencias se agrupan en filas por municipio, dosis y grupo de edad', async () => {
    await montar(formulario({ vacunas: [conOtras(), capturaVph()] }))

    expect(filasDeB()).toEqual([
      ['San Pedro Sacatepéquez', '1.ª dosis', '< 1 año'],
      ['Sibinal', '2.ª dosis', 'De 1 a < 6 años'],
      ['Migrantes / fuera de San Marcos', '1.ª dosis', '< 1 año'],
    ])
    expect(campo('San Pedro Sacatepéquez · 1.ª dosis · < 1 año').value).toBe('5')
    expect(campo('Sibinal · 2.ª dosis · De 1 a < 6 años').value).toBe('0')
    // La tarjeta A sigue sumando solo el municipio propio.
    expect(screen.getByLabelText('Total general').textContent).toBe('78')
  })

  test('el PUT lleva las celdas de las dos tarjetas, cada una con su municipio y sin las vacías', async () => {
    await montar(formulario({ vacunas: [conOtras(), capturaVph()] }))
    guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: conOtras() })

    await agregarFila(SIBINAL, 'D1', 1)
    escribir('Sibinal · 1.ª dosis · De 1 a < 6 años', '4')
    // Agregada y dejada vacía: no se manda.
    await agregarFila(MIGRANTES, 'D2', 0)
    fireEvent.click(botonGuardar())

    await borradorGuardado()
    expect(guardarVacuna.mock.calls[0][2].celdas).toEqual([
      { dosisCodigo: 'D1', municipioProcedenciaId: 1, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 78 },
      { dosisCodigo: 'D1', municipioProcedenciaId: MIGRANTES, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 1 },
      { dosisCodigo: 'D2', municipioProcedenciaId: SIBINAL, dimensiones: { grupo_edad: '1_A_5' }, cantidad: 0 },
      { dosisCodigo: 'D1', municipioProcedenciaId: SAN_PEDRO, dimensiones: { grupo_edad: 'MENOR_1' }, cantidad: 5 },
      { dosisCodigo: 'D1', municipioProcedenciaId: SIBINAL, dimensiones: { grupo_edad: '1_A_5' }, cantidad: 4 },
    ])
  })

  test('una fila quitada no manda sus celdas', async () => {
    await montar(formulario({ vacunas: [conOtras(), capturaVph()] }))
    guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: conOtras() })

    fireEvent.click(screen.getByRole('button', { name: 'Quitar fila San Pedro Sacatepéquez · 1.ª dosis · < 1 año' }))
    expect(botonGuardar().disabled).toBe(false)
    fireEvent.click(botonGuardar())

    await borradorGuardado()
    expect(guardarVacuna.mock.calls[0][2].celdas.map((c) => c.municipioProcedenciaId)).not.toContain(SAN_PEDRO)
  })

  test('una fila vacía agregada no es un cambio y desaparece después de guardar', async () => {
    await montar(formulario({ vacunas: [conOtras(), capturaVph()] }))

    await agregarFila(SIBINAL, 'D1', 0)
    expect(filasDeB()).toContainEqual(['Sibinal', '1.ª dosis', '< 1 año'])
    expect(botonGuardar().disabled).toBe(true)

    // Con otro cambio sí se guarda, y la tarjeta B se arma de nuevo con lo guardado.
    guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: conOtras() })
    escribir('1.ª dosis · De 1 a < 6 años', '2')
    fireEvent.click(botonGuardar())
    await borradorGuardado()
    expect(filasDeB()).not.toContainEqual(['Sibinal', '1.ª dosis', '< 1 año'])
  })

  test('un valor inválido en la tarjeta B deshabilita «Guardar borrador»', async () => {
    await montar(formulario({ vacunas: [conOtras(), capturaVph()] }))

    escribir('San Pedro Sacatepéquez · 1.ª dosis · < 1 año', '-1')
    expect(botonGuardar().disabled).toBe(true)
    expect(screen.getByText('Corrija las cantidades marcadas para guardar.')).toBeTruthy()
  })
})

test('si falla la carga lo dice y permite reintentar', async () => {
  obtenerFormulario.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  dibujar()

  expect(await screen.findByText('No se pudo cargar el formulario: No se pudo conectar con el servidor.')).toBeTruthy()
  obtenerFormulario.mockResolvedValue(formulario())
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Dosis aplicadas a residentes de San Marcos')).toBeTruthy()
})

describe('cambios sin guardar', () => {
  const MARCA = '(cambios sin guardar)'
  const marcada = (nombre) => screen.getByRole('tab', { name: nombre }).getAttribute('aria-describedby') !== null
  const insignia = (texto) => screen.queryByText(texto)
  const ultimoCambio = () => {
    const fecha = new Date(REPORTE.actualizadoEn)
    const dos = (n) => String(n).padStart(2, '0')
    return `Último cambio: ${dos(fecha.getDate())}/${dos(fecha.getMonth() + 1)}/${fecha.getFullYear()} ${dos(fecha.getHours())}:${dos(fecha.getMinutes())}`
  }

  test('al cargar se ve el último cambio del reporte, sin marcas en las pestañas', async () => {
    await montar()
    expect(insignia(ultimoCambio())).toBeTruthy()
    expect(marcada('Hexavalente')).toBe(false)
    expect(marcada('VPH')).toBe(false)
  })

  test('al escribir se ve «Cambios sin guardar» y la pestaña de esa vacuna tiene la marca', async () => {
    await montar()
    escribir('1.ª dosis · < 1 año', '80')

    expect(insignia('Cambios sin guardar')).toBeTruthy()
    expect(insignia(ultimoCambio())).toBeNull()
    expect(screen.getByRole('tab', { name: 'Hexavalente', description: MARCA })).toBeTruthy()
    expect(marcada('VPH')).toBe(false)
  })

  test('al guardar se ve «Guardado a las …» y la marca desaparece', async () => {
    await montar()
    guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80)] }) })

    escribir('1.ª dosis · < 1 año', '80')
    fireEvent.click(botonGuardar())

    await borradorGuardado()
    expect(screen.getByText(/^Guardado a las \d{2}:\d{2}$/)).toBeTruthy()
    expect(insignia('Cambios sin guardar')).toBeNull()
    expect(marcada('Hexavalente')).toBe(false)
  })

  test('si falla la segunda vacuna, la primera pierde la marca y la segunda la conserva', async () => {
    await montar()
    guardarVacuna
      .mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80)] }) })
      .mockRejectedValueOnce(new ErrorApi(422, 'CELDA_INVALIDA', 'La celda 1.ª dosis · Femenino no es parte del formulario.'))

    escribir('1.ª dosis · < 1 año', '80')
    await abrirPestana('VPH')
    escribir('1.ª dosis · Femenino', '1')
    fireEvent.click(botonGuardar())

    await screen.findByText(/No se guardó VPH/)
    expect(marcada('Hexavalente')).toBe(false)
    expect(marcada('VPH')).toBe(true)
    expect(insignia('Cambios sin guardar')).toBeTruthy()
  })

  test('con cambios, navegar a otra ruta abre el diálogo que nombra la vacuna con cambios', async () => {
    const router = await montar()
    await abrirPestana('VPH')
    escribir('1.ª dosis · Masculino', '3')

    router.navigate('/inicio')
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('Hay cambios sin guardar')).toBeTruthy()
    expect(dialogo.textContent).toContain(
      'Si sale ahora, se pierden los cambios de VPH. Para conservarlos, quédese y use «Guardar borrador».',
    )
    expect(router.state.location.pathname).toBe('/registro')

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salir sin guardar' }))
    expect(await screen.findByText('Pantalla de inicio')).toBeTruthy()
  })

  test('sin cambios, navegar a otra ruta no abre el diálogo', async () => {
    const router = await montar()
    router.navigate('/inicio')
    expect(await screen.findByText('Pantalla de inicio')).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('en solo lectura no hay insignia', async () => {
    await montar(formulario({ editable: false }))
    expect(insignia(ultimoCambio())).toBeNull()
    expect(insignia('Cambios sin guardar')).toBeNull()
  })
})

describe('agregar y quitar vacunas (SPEC 31)', () => {
  const VARICELA = {
    id: 53,
    vacuna: { id: 9, codigo: 'VARICELA', nombre: 'Varicela' },
    esquema: { id: 'e-var', version: 1 },
    base: false,
    dosis: [{ codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true }],
    dimensiones: [],
  }
  const esquemaVaricela = {
    ...esquemaVph,
    id: 'e-var',
    desagregacion: [],
    secciones: [{ codigo: 'GENERAL', titulo: 'Varicela', orden: 1, grupoEdad: null, dosis: ['D1'] }],
  }
  const capturaVaricela = { ...capturaVph(), vacunaId: 9, base: false, esquema: esquemaVaricela }
  // Hexavalente es base; VPH no.
  const conBase = (cambios = {}) =>
    formulario({ vacunas: [capturaHexa({ base: true }), capturaVph({ base: false })], ...cambios })
  // Con un diálogo abierto el resto de la página queda aria-hidden; las marcas ocultas («(cambios sin guardar)») no
  // son parte del nombre.
  const pestanas = () =>
    screen.getAllByRole('tab', { hidden: true }).map((tab) => tab.textContent.replace(/\(.*\)/, '').trim())
  const botonQuitar = () => screen.queryByRole('button', { name: 'Quitar vacuna' })

  async function abrirAgregar() {
    listarVacunasDisponibles.mockResolvedValue([
      { vacunaId: 9, codigo: 'VARICELA', nombre: 'Varicela', esquema: { id: 'e-var', version: 1 } },
    ])
    fireEvent.click(screen.getByRole('button', { name: 'Agregar vacuna' }))
    return screen.findByRole('dialog')
  }

  test('«Agregar vacuna» une la vacuna nueva en su lugar sin perder lo escrito, y el siguiente guardado usa la versión nueva', async () => {
    agregarVacuna.mockResolvedValue({ versionFila: 4, orden: [3, 9, 5], vacuna: VARICELA, formulario: capturaVaricela })
    guardarVacuna.mockResolvedValue({ versionFila: 5, vacuna: capturaHexa({ base: true }) })
    await montar(conBase())
    escribir('1.ª dosis · De 1 a < 6 años', '9')

    const dialogo = await abrirAgregar()
    expect(listarVacunasDisponibles).toHaveBeenCalledWith(7)
    within(dialogo).getByText('versión 1')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar Varicela' }))

    await waitFor(() => expect(pestanas()).toEqual(['Hexavalente', 'Varicela', 'VPH']))
    expect(agregarVacuna).toHaveBeenCalledWith(7, { vacunaId: 9, versionFila: 3 })
    expect(toast.success).toHaveBeenCalledWith('Varicela agregada al reporte.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Varicela' }).getAttribute('aria-selected')).toBe('true')
    expect(campo('1.ª dosis').value).toBe('')

    await abrirPestana('Hexavalente')
    expect(campo('1.ª dosis · De 1 a < 6 años').value).toBe('9')
    fireEvent.click(botonGuardar())
    await borradorGuardado()
    expect(guardarVacuna.mock.calls[0][2].versionFila).toBe(4)
  })

  test('sin vacunas disponibles lo dice; un error al agregar se ve en el diálogo, que sigue abierto', async () => {
    await montar(conBase())
    listarVacunasDisponibles.mockResolvedValue([])
    fireEvent.click(screen.getByRole('button', { name: 'Agregar vacuna' }))
    within(await screen.findByRole('dialog')).getByText('No hay más vacunas con formulario para este mes.')
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    agregarVacuna.mockRejectedValue(new ErrorApi(409, 'REPORTE_DESACTUALIZADO', 'El reporte cambió desde que lo abrió; recárguelo.'))
    const dialogo = await abrirAgregar()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar Varicela' }))
    expect(await within(dialogo).findByText('El reporte cambió desde que lo abrió; recárguelo.')).toBeTruthy()
    within(dialogo).getByRole('button', { name: 'Recargar reporte' })
    expect(pestanas()).toEqual(['Hexavalente', 'VPH'])
  })

  test('una vacuna base no tiene «Quitar vacuna»; una que no es base sí', async () => {
    await montar(conBase())
    expect(botonQuitar()).toBeNull()
    await abrirPestana('VPH')
    expect(botonQuitar()).toBeTruthy()
  })

  test('quitar una vacuna sin cantidades no avisa que se borran, y al confirmar se va su pestaña', async () => {
    quitarVacuna.mockResolvedValue({ versionFila: 4 })
    await montar(conBase())
    await abrirPestana('VPH')
    fireEvent.click(botonQuitar())

    const dialogo = await screen.findByRole('alertdialog')
    within(dialogo).getByText('¿Quitar VPH del reporte?')
    expect(within(dialogo).queryByText('Se borrarán sus cantidades y no se pueden recuperar.')).toBeNull()
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar vacuna' }))

    await waitFor(() => expect(pestanas()).toEqual(['Hexavalente']))
    expect(quitarVacuna).toHaveBeenCalledWith(7, 5, 3)
    expect(toast.success).toHaveBeenCalledWith('VPH se quitó del reporte.')
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(screen.getByRole('tab', { name: 'Hexavalente' }).getAttribute('aria-selected')).toBe('true')
  })

  test('con una cantidad sin guardar avisa que se borran; un error se ve en el diálogo, que sigue abierto', async () => {
    quitarVacuna.mockRejectedValue(new ErrorApi(409, 'VACUNA_CON_OBSERVACIONES', 'La vacuna tiene observaciones del revisor y no se puede quitar.'))
    await montar(conBase())
    await abrirPestana('VPH')
    escribir('1.ª dosis · Masculino', '3')
    fireEvent.click(botonQuitar())

    const dialogo = await screen.findByRole('alertdialog')
    within(dialogo).getByText('Se borrarán sus cantidades y no se pueden recuperar.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Quitar vacuna' }))
    expect(await within(dialogo).findByText('La vacuna tiene observaciones del revisor y no se puede quitar.')).toBeTruthy()
    expect(screen.getByRole('alertdialog')).toBeTruthy()
    expect(pestanas()).toEqual(['Hexavalente', 'VPH'])
  })

  test('un reporte sin vacunas lo dice y ofrece «Agregar vacuna»; en solo consulta, sin botón', async () => {
    obtenerFormulario.mockResolvedValue(formulario({ vacunas: [] }))
    dibujar({ reporte: { ...REPORTE, vacunas: [] } })
    expect(
      await screen.findByText('Este reporte todavía no tiene vacunas. Agregue las que aplicó el establecimiento.'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Agregar vacuna' })).toBeTruthy()
  })

  test('con el reporte en solo consulta no hay «Agregar vacuna» ni «Quitar vacuna»', async () => {
    await montar(conBase({ editable: false }))
    expect(screen.queryByRole('button', { name: 'Agregar vacuna' })).toBeNull()
    await abrirPestana('VPH')
    expect(botonQuitar()).toBeNull()
  })

  test('un reporte sin vacunas en solo consulta lo dice, sin botón', async () => {
    obtenerFormulario.mockResolvedValue(formulario({ vacunas: [], editable: false }))
    dibujar({ reporte: { ...REPORTE, vacunas: [] } })
    expect(await screen.findByText('Este reporte no tiene vacunas.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Agregar vacuna' })).toBeNull()
  })
})

describe('validación automática (SPEC 33)', () => {
  const resultado = (id, severidad, vacuna, celdas, cambios = {}) => ({
    id,
    regla: { codigo: 'CAMPOS_COMPLETOS', version: 1, nombre: 'Campos completos', tipo: 'CAMPOS_COMPLETOS' },
    severidad,
    estado: 'ABIERTO',
    mensaje: `Resultado ${id}`,
    vacuna,
    dosis: null,
    celdas,
    campos: [],
    ...cambios,
  })
  const HEXA = { id: 3, codigo: 'HEXA', nombre: 'Hexavalente' }
  const VPH_VACUNA = { id: 5, codigo: 'VPH', nombre: 'VPH' }
  const enLaA = (dosis, claveCombinacion) => ({ municipioId: 1, dosis, claveCombinacion })
  const validacion = (resultados) => ({
    validadoEn: '2026-10-30T21:42:10.000Z',
    errores: resultados.filter((r) => r.severidad === 'ERROR').length,
    advertencias: resultados.filter((r) => r.severidad === 'ADVERTENCIA').length,
    corregidos: 0,
    resultados,
  })
  const RESULTADOS = [
    resultado(1, 'ERROR', HEXA, [enLaA('D1', 'grupo_edad=1_A_5')]),
    resultado(2, 'ADVERTENCIA', HEXA, [enLaA('D2', 'grupo_edad=1_A_5')]),
    resultado(3, 'ERROR', VPH_VACUNA, [enLaA('D1', 'sexo=M')]),
  ]

  function crearSesion(permisos) {
    const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
    const exp = Math.floor(Date.now() / 1000) + 3600
    return {
      token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '9', exp })}.firma`,
      usuario: {
        id: 9,
        nombreUsuario: 'cs1201',
        rol: 'ESTABLECIMIENTO',
        permisos,
        empleado: { nombres: 'Ana', apellidos: 'Pérez', ddrissId: 1, establecimientoId: 4, municipioId: 1 },
      },
    }
  }

  // Con la sesión, para que la captura sepa si tiene REPORTE_VALIDAR.
  async function montarConSesion(recibido = formulario(), permisos = ['REPORTE_EDITAR', 'REPORTE_VALIDAR']) {
    guardarSesion(crearSesion(permisos))
    obtenerFormulario.mockResolvedValue(recibido)
    const router = createMemoryRouter(
      [
        {
          path: '/registro',
          element: (
            <ProveedorSesion>
              <CapturaReporte reporte={REPORTE} />
            </ProveedorSesion>
          ),
        },
      ],
      { initialEntries: ['/registro'] },
    )
    render(<RouterProvider router={router} />)
    await waitFor(() => expect(screen.queryByLabelText('Cargando formulario')).toBeNull())
  }

  const panelResultados = () => within(screen.getByRole('list', { name: 'Resultados de la validación' }))

  // Con llaves: si beforeEach devuelve una función (mockResolvedValue devuelve el mock), Vitest la llama al terminar.
  beforeEach(() => {
    validarReporte.mockResolvedValue(validacion(RESULTADOS))
  })

  test('al cargar un borrador valida una vez y muestra el panel con los resultados', async () => {
    await montarConSesion()

    await waitFor(() => expect(panelResultados().getAllByRole('listitem')).toHaveLength(3))
    expect(validarReporte).toHaveBeenCalledOnce()
    expect(validarReporte).toHaveBeenCalledWith(7)
    expect(screen.getByText('Validación automática')).toBeTruthy()
  })

  test('un reporte de solo consulta no valida ni muestra el panel', async () => {
    await montarConSesion(formulario({ editable: false }))
    expect(validarReporte).not.toHaveBeenCalled()
    expect(screen.queryByText('Validación automática')).toBeNull()
  })

  test('sin REPORTE_VALIDAR no valida ni muestra el panel', async () => {
    await montarConSesion(formulario(), ['REPORTE_EDITAR'])
    expect(validarReporte).not.toHaveBeenCalled()
    expect(screen.queryByText('Validación automática')).toBeNull()
  })

  test('después de guardar vuelve a validar', async () => {
    await montarConSesion()
    await waitFor(() => expect(validarReporte).toHaveBeenCalledOnce())
    guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ celdas: [celda('D1', { grupo_edad: 'MENOR_1' }, 80)] }) })

    escribir('1.ª dosis · < 1 año', '80')
    fireEvent.click(botonGuardar())

    await borradorGuardado()
    await waitFor(() => expect(validarReporte).toHaveBeenCalledTimes(2))
  })

  test('la casilla de un error queda marcada como inválida, y la de una advertencia en ámbar', async () => {
    await montarConSesion()
    await waitFor(() => expect(campo('1.ª dosis · De 1 a < 6 años').getAttribute('aria-invalid')).toBe('true'))

    const advertida = campo('2.ª dosis · De 1 a < 6 años')
    expect(advertida.getAttribute('aria-invalid')).toBeNull()
    expect(advertida.className).toContain('bg-advertencia')
    expect(campo('1.ª dosis · < 1 año').getAttribute('aria-invalid')).toBeNull()
  })

  test('la pestaña de una vacuna con errores lo dice en su descripción', async () => {
    validarReporte.mockResolvedValue(validacion([RESULTADOS[2]]))
    await montarConSesion()

    await waitFor(() =>
      expect(screen.getByRole('tab', { name: 'VPH' }).getAttribute('aria-describedby')).toContain('errores-52'),
    )
    expect(screen.getByRole('tab', { name: 'Hexavalente' }).getAttribute('aria-describedby')).toBeNull()
  })

  test('el clic en un resultado de otra vacuna abre su pestaña y enfoca la casilla', async () => {
    await montarConSesion()
    await waitFor(() => expect(panelResultados().getAllByRole('listitem')).toHaveLength(3))

    // Los errores van primero: el de VPH es el segundo.
    fireEvent.click(within(panelResultados().getAllByRole('listitem')[1]).getByRole('button'))

    await waitFor(() => expect(screen.getByRole('tab', { name: 'VPH' }).getAttribute('aria-selected')).toBe('true'))
    await waitFor(() => expect(document.activeElement).toBe(campo('1.ª dosis · Masculino')))
  })

  test('un fallo de la validación se muestra en el panel sin impedir la captura', async () => {
    validarReporte.mockRejectedValue(new ErrorApi(422, 'REGLA_INVALIDA', 'No se pudo validar.'))
    await montarConSesion()

    expect(await screen.findByText('No se pudo validar.')).toBeTruthy()
    escribir('1.ª dosis · < 1 año', '80')
    expect(botonGuardar().disabled).toBe(false)
  })
})
