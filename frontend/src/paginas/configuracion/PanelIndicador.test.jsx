import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { crearIndicador, opcionesIndicadores, publicarVersionIndicador } from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import PanelIndicador from './PanelIndicador.jsx'

vi.mock('@/api/configuracion.js', () => ({
  opcionesIndicadores: vi.fn(),
  crearIndicador: vi.fn(),
  publicarVersionIndicador: vi.fn(),
}))

const NACIONAL = { nivel: 'NACIONAL', ddrissCodigo: null }
const OPCIONES = {
  vacunas: [
    {
      codigo: 'HEXA',
      nombre: 'Hexavalente',
      dosis: [
        { codigo: 'D1', nombre: 'Primera dosis', orden: 1, completaEsquema: false },
        { codigo: 'D2', nombre: 'Segunda dosis', orden: 2, completaEsquema: false },
        { codigo: 'D3', nombre: 'Tercera dosis', orden: 3, completaEsquema: true },
      ],
    },
    {
      codigo: 'BCG',
      nombre: 'BCG',
      dosis: [{ codigo: 'UNICA', nombre: 'Dosis única', orden: 1, completaEsquema: true }],
    },
  ],
  clasificaciones: [
    { codigo: 'NACIDOS_VIVOS', descripcion: 'Nacidos vivos' },
    { codigo: 'MENOR_1', descripcion: 'Menores de 1 año' },
  ],
  gruposEdad: [
    { codigo: 'MENOR_1', etiqueta: 'Menor de 1 año' },
    { codigo: '1_A_MENOR_2', etiqueta: 'De 1 a menos de 2 años' },
  ],
}

const COB_NACIONAL = {
  id: 'c1',
  codigo: 'COB_HEXA3',
  version: 1,
  nombre: 'Cobertura de Hexavalente 3',
  descripcion: null,
  tipoCalculo: 'COBERTURA',
  vacuna: { codigo: 'HEXA', nombre: 'Hexavalente', activa: true },
  dosis: 'D3',
  dosisInicial: null,
  dosisFinal: null,
  clasificacionPoblacion: 'MENOR_1',
  grupoEdad: 'MENOR_1',
  denominador: { fuente: 'POBLACION_OBJETIVO', prorrateo: 'MENSUAL_LINEAL' },
  meta: { valor: 95, unidad: 'PORCENTAJE', comparador: '>' },
  umbrales: [
    { color: 'verde', desde: 95, hasta: null },
    { color: 'amarillo', desde: 80, hasta: 95 },
    { color: 'rojo', desde: 0, hasta: 80 },
  ],
  umbralesProvisionales: false,
  esIndicadorMapa: false,
  territorio: NACIONAL,
  estado: 'VIGENTE',
}
const FILA_COB = { codigo: 'COB_HEXA3', tipoCalculo: 'COBERTURA', aplica: COB_NACIONAL, ultimaDdriss: null,
  vigenteNacional: { version: 1 } }

// La deserción de la semilla: dos franjas, y su dosis final ya no está activa (D4).
const DES_NACIONAL = {
  ...COB_NACIONAL,
  id: 'd1',
  codigo: 'DES_HEXA1_4',
  nombre: 'Deserción de Hexavalente',
  tipoCalculo: 'DESERCION',
  dosis: null,
  dosisInicial: 'D1',
  dosisFinal: 'D4',
  clasificacionPoblacion: null,
  denominador: { fuente: 'PRODUCCION' },
  meta: { valor: 10, unidad: 'PORCENTAJE', comparador: '<=' },
  umbrales: [{ color: 'verde', desde: null, hasta: 10 }, { color: 'rojo', desde: 10, hasta: null }],
}
const FILA_DES = { codigo: 'DES_HEXA1_4', tipoCalculo: 'DESERCION', aplica: DES_NACIONAL, ultimaDdriss: null,
  vigenteNacional: { version: 1 } }

const props = { alGuardar: vi.fn(), alRecargar: vi.fn(), alCerrar: vi.fn() }

async function montar(modo, fila) {
  const router = createMemoryRouter([{ path: '/', element: <PanelIndicador modo={modo} fila={fila} {...props} /> }])
  render(<RouterProvider router={router} />)
  const panel = within(screen.getByRole('dialog'))
  await waitFor(() => expect(panel.queryByLabelText('Cargando opciones')).toBeNull())
  return panel
}

const select = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const elegir = (nombre, valor) => fireEvent.change(select(nombre), { target: { value: valor } })
const escribir = (panel, etiqueta, valor) =>
  fireEvent.change(panel.getByLabelText(etiqueta), { target: { value: valor } })

beforeEach(() => {
  vi.clearAllMocks()
  opcionesIndicadores.mockResolvedValue(OPCIONES)
})

test('«Nuevo indicador» ofrece los cuatro tipos y precarga la dosis que completa el esquema', async () => {
  await montar('nuevo')

  const tipos = [...select('tipo').querySelectorAll('option')].map((o) => o.textContent).filter(Boolean)
  expect(tipos).toEqual(['Cobertura', 'Avance contra la meta del mes', 'Brecha de dosis', 'Deserción entre dosis'])

  elegir('tipo', 'COBERTURA')
  elegir('vacuna', 'HEXA')
  expect(select('dosis').value).toBe('D3')
  elegir('clasificacionPoblacion', 'MENOR_1')
  expect(select('grupoEdad').value).toBe('MENOR_1')
  // NACIDOS_VIVOS no es un grupo de edad: el filtro no cambia.
  elegir('clasificacionPoblacion', 'NACIDOS_VIVOS')
  expect(select('grupoEdad').value).toBe('MENOR_1')

  elegir('tipo', 'DESERCION')
  expect(select('dosisInicial').value).toBe('D1')
  expect(select('dosisFinal').value).toBe('D3')
})

test('cada tipo muestra solo sus campos', async () => {
  const panel = await montar('nuevo')

  elegir('tipo', 'DESERCION')
  expect(select('clasificacionPoblacion')).toBeNull()
  expect(panel.queryByRole('radiogroup', { name: 'Prorrateo' })).toBeNull()
  expect(panel.getByLabelText('Verde hasta (%)').value).toBe('10')
  expect(panel.getByLabelText('Amarillo hasta (%)').value).toBe('15')
  expect(panel.getByLabelText('Meta (%)').value).toBe('10')

  elegir('tipo', 'BRECHA')
  expect(panel.queryByText('Semáforo')).toBeNull()
  expect(panel.queryByLabelText('Indicador del mapa')).toBeNull()
  expect(panel.getByRole('radiogroup', { name: 'Prorrateo' })).toBeTruthy()

  elegir('tipo', 'AVANCE_META_MES')
  expect(panel.queryByLabelText('Meta (%)')).toBeNull()
  expect(panel.getByText('La meta del mes vale 100 %: población ÷ 12 × número de mes.')).toBeTruthy()
  expect(panel.queryByRole('radiogroup', { name: 'Prorrateo' })).toBeNull()
  expect(panel.getByLabelText('Indicador del mapa')).toBeTruthy()
})

test('al enviar se muestran todos los errores, con el foco en el primero, y no se llama a la API', async () => {
  const panel = await montar('nuevo')
  elegir('tipo', 'COBERTURA')
  elegir('vacuna', 'HEXA')
  elegir('clasificacionPoblacion', 'MENOR_1')
  escribir(panel, 'Nombre', 'Cobertura de prueba')
  escribir(panel, 'Meta (%)', '150')
  escribir(panel, 'Amarillo desde (%)', '90')
  escribir(panel, 'Verde desde (%)', '80')

  fireEvent.click(panel.getByRole('button', { name: 'Crear indicador' }))

  expect(await panel.findByText('La meta debe ser un número de 1 a 100, con un decimal como máximo.')).toBeTruthy()
  expect(panel.getByText(/^Los cortes del semáforo deben ser dos números/)).toBeTruthy()
  expect(panel.getByText('El motivo del cambio debe tener entre 1 y 300 caracteres.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(panel.getByLabelText('Meta (%)')))
  expect(crearIndicador).not.toHaveBeenCalled()
})

test('sin tipo ni vacuna, pide las dos cosas', async () => {
  const panel = await montar('nuevo')
  fireEvent.click(panel.getByRole('button', { name: 'Crear indicador' }))

  expect(await panel.findByText('Elija el tipo de indicador.')).toBeTruthy()
  expect(panel.getByText('Elija la vacuna.')).toBeTruthy()
})

test('crear un indicador manda solo los campos del tipo, con la meta y los cortes como números', async () => {
  const creado = { ...COB_NACIONAL, codigo: 'COB_HEXA3_2' }
  crearIndicador.mockResolvedValue(creado)
  const panel = await montar('nuevo')
  elegir('tipo', 'COBERTURA')
  elegir('vacuna', 'HEXA')
  elegir('clasificacionPoblacion', 'MENOR_1')
  escribir(panel, 'Nombre', 'Cobertura de Hexavalente 3')
  escribir(panel, 'Meta (%)', '92,5')
  fireEvent.click(panel.getByLabelText('Población anual completa'))
  fireEvent.click(panel.getByLabelText('Rangos provisionales'))
  fireEvent.click(panel.getByLabelText('Indicador del mapa'))
  escribir(panel, 'Motivo del cambio', 'Pedido por Epidemiología')

  expect(panel.getByLabelText('Vista previa del semáforo').textContent).toBe('< 8080 a 90≥ 90')
  fireEvent.click(panel.getByRole('button', { name: 'Crear indicador' }))

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(creado))
  expect(crearIndicador).toHaveBeenCalledWith({
    tipoCalculo: 'COBERTURA',
    vacuna: 'HEXA',
    nombre: 'Cobertura de Hexavalente 3',
    descripcion: '',
    dosis: 'D3',
    clasificacionPoblacion: 'MENOR_1',
    grupoEdad: 'MENOR_1',
    prorrateo: 'NINGUNO',
    meta: 92.5,
    cortes: [80, 90],
    umbralesProvisionales: true,
    esIndicadorMapa: true,
    motivoCambio: 'Pedido por Epidemiología',
  })
})

test('crear una deserción no manda población, prorrateo ni marca del mapa', async () => {
  crearIndicador.mockResolvedValue(DES_NACIONAL)
  const panel = await montar('nuevo')
  elegir('tipo', 'DESERCION')
  elegir('vacuna', 'HEXA')
  elegir('grupoEdad', '__todas__')
  escribir(panel, 'Nombre', 'Deserción de Hexavalente')
  escribir(panel, 'Motivo del cambio', 'Pedido por Epidemiología')
  fireEvent.click(panel.getByRole('button', { name: 'Crear indicador' }))

  await waitFor(() => expect(crearIndicador).toHaveBeenCalled())
  expect(crearIndicador.mock.calls[0][0]).toEqual({
    tipoCalculo: 'DESERCION',
    vacuna: 'HEXA',
    nombre: 'Deserción de Hexavalente',
    descripcion: '',
    dosisInicial: 'D1',
    dosisFinal: 'D3',
    grupoEdad: null,
    meta: 10,
    cortes: [10, 15],
    umbralesProvisionales: false,
    motivoCambio: 'Pedido por Epidemiología',
  })
})

test('«Nueva versión» de una nacional precarga su contenido y avisa el reemplazo', async () => {
  const panel = await montar('version', FILA_COB)

  expect(panel.getByText('Nueva versión de COB_HEXA3')).toBeTruthy()
  expect(panel.getByText('Esta versión reemplazará a la versión 1 nacional solo en su DDRISS.')).toBeTruthy()
  expect(select('tipo')).toBeNull()
  expect(select('vacuna')).toBeNull()
  expect(panel.getByLabelText('Nombre').value).toBe('Cobertura de Hexavalente 3')
  expect(select('dosis').value).toBe('D3')
  expect(select('grupoEdad').value).toBe('MENOR_1')
  expect(panel.getByLabelText('Meta (%)').value).toBe('95')
  expect(panel.getByLabelText('Amarillo desde (%)').value).toBe('80')
  expect(panel.getByLabelText('Verde desde (%)').value).toBe('95')
})

test('una base con dos franjas y una dosis inactiva deja esos campos vacíos, con sus avisos', async () => {
  const panel = await montar('version', FILA_DES)

  expect(panel.getByText('La dosis D4 ya no está activa; elija otra.')).toBeTruthy()
  expect(panel.getByText('La versión base tiene un semáforo de 2 franjas; indique los dos cortes.')).toBeTruthy()
  expect(select('dosisInicial').value).toBe('D1')
  expect(select('dosisFinal').value).toBe('')
  expect(panel.getByLabelText('Verde hasta (%)').value).toBe('')
  expect(panel.getByLabelText('Amarillo hasta (%)').value).toBe('')
})

test('publicar una versión manda versionBase y el contenido editado', async () => {
  const publicada = { ...COB_NACIONAL, version: 2 }
  publicarVersionIndicador.mockResolvedValue(publicada)
  const panel = await montar('version', FILA_COB)
  escribir(panel, 'Verde desde (%)', '90')
  escribir(panel, 'Motivo del cambio', 'Semáforo de San Marcos')

  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(publicada))
  expect(publicarVersionIndicador).toHaveBeenCalledWith('COB_HEXA3', {
    versionBase: 1,
    nombre: 'Cobertura de Hexavalente 3',
    descripcion: '',
    dosis: 'D3',
    clasificacionPoblacion: 'MENOR_1',
    grupoEdad: 'MENOR_1',
    prorrateo: 'MENSUAL_LINEAL',
    meta: 95,
    cortes: [80, 90],
    umbralesProvisionales: false,
    esIndicadorMapa: false,
    motivoCambio: 'Semáforo de San Marcos',
  })
})

test('un 409 por duplicado muestra el código existente, sin «Recargar»', async () => {
  const mensaje = 'Ya existe el indicador COB_HEXA1 para la misma vacuna y dosis; publique una versión de ese.'
  publicarVersionIndicador.mockRejectedValue(
    new ErrorApi(409, 'INDICADOR_DUPLICADO', mensaje, { codigoExistente: 'COB_HEXA1' }),
  )
  const panel = await montar('version', FILA_COB)
  elegir('dosis', 'D1')
  escribir(panel, 'Motivo del cambio', 'Cambio')
  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  expect(await panel.findByText(mensaje)).toBeTruthy()
  expect(panel.queryByRole('button', { name: 'Recargar' })).toBeNull()
  expect(props.alGuardar).not.toHaveBeenCalled()
})

test('un 409 por versión vieja se muestra con «Recargar»', async () => {
  const mensaje = 'El indicador COB_HEXA3 cambió mientras lo editaba; vuelva a abrirlo.'
  publicarVersionIndicador.mockRejectedValue(new ErrorApi(409, 'INDICADOR_DESACTUALIZADO', mensaje))
  const panel = await montar('version', FILA_COB)
  escribir(panel, 'Motivo del cambio', 'Cambio')
  fireEvent.click(panel.getByRole('button', { name: 'Publicar versión' }))

  expect(await panel.findByText(mensaje)).toBeTruthy()
  fireEvent.click(panel.getByRole('button', { name: 'Recargar' }))
  expect(props.alRecargar).toHaveBeenCalled()
})

test('cerrar con cambios pide confirmación; sin cambios, cierra directo', async () => {
  const panel = await montar('version', FILA_COB)
  fireEvent.click(panel.getByRole('button', { name: 'Cancelar' }))
  expect(props.alCerrar).toHaveBeenCalledTimes(1)

  escribir(panel, 'Nombre', 'Otro nombre')
  fireEvent.click(panel.getByRole('button', { name: 'Cancelar' }))
  const confirmacion = within(await screen.findByRole('alertdialog'))
  expect(confirmacion.getByText('¿Descartar los cambios?')).toBeTruthy()
  fireEvent.click(confirmacion.getByRole('button', { name: 'Descartar' }))
  expect(props.alCerrar).toHaveBeenCalledTimes(2)
})

test('si fallan las opciones, «Reintentar» las vuelve a pedir', async () => {
  opcionesIndicadores.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Falla'))
  const panel = await montar('nuevo')

  expect(await panel.findByText(/No se pudieron cargar las vacunas y los grupos/)).toBeTruthy()
  fireEvent.click(panel.getByRole('button', { name: 'Reintentar' }))
  await waitFor(() => expect(select('tipo')).toBeTruthy())
  expect(opcionesIndicadores).toHaveBeenCalledTimes(2)
})
