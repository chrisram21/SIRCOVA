import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ErrorApi } from '@/api/cliente.js'
import { guardarVacuna, obtenerFormulario } from '@/api/produccion.js'
import CapturaReporte from './CapturaReporte.jsx'

vi.mock('@/api/produccion.js', () => ({ obtenerFormulario: vi.fn(), guardarVacuna: vi.fn() }))

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
const REPORTE = { id: 7, vacunas: [HEXAVALENTE, VPH] }

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

async function montar(recibido = formulario()) {
  obtenerFormulario.mockResolvedValue(recibido)
  render(<CapturaReporte reporte={REPORTE} />)
  await waitFor(() => expect(screen.queryByLabelText('Cargando formulario')).toBeNull())
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

  expect(await screen.findByText('Borrador guardado.')).toBeTruthy()
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
  await screen.findByText('Borrador guardado.')
  expect(campo('1.ª dosis · < 1 año').disabled).toBe(false)
})

test('un cambio solo en los datos adicionales guarda esa vacuna con el número convertido', async () => {
  await montar()
  guardarVacuna.mockResolvedValueOnce({ versionFila: 4, vacuna: capturaHexa({ datosAdicionales: { frascos: 15 } }) })

  fireEvent.change(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }), { target: { value: '15' } })
  fireEvent.click(botonGuardar())

  await screen.findByText('Borrador guardado.')
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
  expect(screen.getByText('Este reporte no se puede editar en su estado actual.')).toBeTruthy()
  expect(campo('1.ª dosis · < 1 año').value).toBe('78')
  for (const elemento of screen.getAllByRole('textbox')) expect(elemento.disabled).toBe(true)
  expect(screen.getByRole('spinbutton', { name: 'Frascos abiertos (obligatorio)' }).disabled).toBe(true)
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

    await screen.findByText('Borrador guardado.')
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

    await screen.findByText('Borrador guardado.')
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
    await screen.findByText('Borrador guardado.')
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
  render(<CapturaReporte reporte={REPORTE} />)

  expect(await screen.findByText('No se pudo cargar el formulario: No se pudo conectar con el servidor.')).toBeTruthy()
  obtenerFormulario.mockResolvedValue(formulario())
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(await screen.findByText('Dosis aplicadas a residentes de San Marcos')).toBeTruthy()
})
