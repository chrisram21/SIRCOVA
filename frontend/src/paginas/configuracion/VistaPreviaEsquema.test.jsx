import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import * as apiCatalogos from '@/api/catalogos.js'
import * as apiConfiguracion from '@/api/configuracion.js'
import VistaPreviaEsquema from './VistaPreviaEsquema.jsx'

vi.mock('@/api/catalogos.js')
vi.mock('@/api/configuracion.js')

const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const DIMENSIONES = [
  { codigo: 'grupo_edad', nombre: 'Grupo de edad', activa: true, valores: [valor('MENOR_1', '< 1 año', 1)] },
  { codigo: 'sexo', nombre: 'Sexo', activa: true, valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] },
]
const VACUNA = {
  id: 7,
  codigo: 'VPH',
  nombre: 'VPH',
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
  ],
}
const contenido = (procedencia = { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true }) => ({
  procedencia,
  dosis: [
    { codigo: 'D1', desagregacion: null },
    { codigo: 'D2', desagregacion: null },
  ],
  desagregacion: [{ dimension: 'sexo', valores: ['F', 'M'] }],
  secciones: [{ titulo: 'VPH', grupoEdad: null, dosis: ['D1', 'D2'] }],
})
const VIGENTE = {
  id: 'e-vph',
  version: 1,
  estado: 'VIGENTE',
  vigencia: { desde: '2026-01-01', hasta: null },
  camposAdicionales: [],
  reglas: [
    { codigo: 'CAMPOS_COMPLETOS', version: 1, severidadOverride: null },
    { codigo: 'VARIACION_HISTORICA', version: 2, severidadOverride: 'ADVERTENCIA' },
  ],
}
const BORRADOR = { ...VIGENTE, id: 'b-vph', version: 2, estado: 'BORRADOR', vigencia: null }

const montar = ({ esquema = VIGENTE, c = contenido(), problemas, publicacion, alCambiarAbierta = () => {} } = {}) =>
  render(
    <VistaPreviaEsquema
      abierta
      alCambiarAbierta={alCambiarAbierta}
      esquema={esquema}
      contenido={c}
      vacuna={VACUNA}
      dimensiones={DIMENSIONES}
      problemas={problemas}
      publicacion={publicacion}
    />,
  )
const hoja = () => screen.getByRole('dialog')

it('muestra el encabezado, el aviso, la franja de dimensiones y la vigencia', () => {
  montar()
  const dialogo = hoja()
  within(dialogo).getByRole('heading', { name: 'Vista previa · VPH, versión 1' })
  within(dialogo).getByText('Vigente')
  within(dialogo).getByText('Así verá el formulario el establecimiento. Los datos que escriba aquí no se guardan.')
  within(dialogo).getByText('Formulario generado por el esquema de captura: VPH, versión 1, vigente desde 01/01/2026')
  expect(within(dialogo).getByText('Dimensiones de este esquema:').textContent).toBe('Dimensiones de este esquema: Dosis · Sexo')
  within(dialogo).getByRole('textbox', { name: '1.ª dosis · Masculino' })
})

it('un borrador muestra su Badge y no trae vigencia', () => {
  montar({ esquema: BORRADOR })
  within(hoja()).getByText('Borrador')
  within(hoja()).getByText('Formulario generado por el esquema de captura: VPH, versión 2')
  expect(within(hoja()).queryByText(/vigente desde/)).toBeNull()
})

it.each([
  [
    { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
    'Las dosis a personas de otros municipios se registran por municipio de procedencia. Se admite procedencia no especificada.',
  ],
  [
    { modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: false },
    'Las dosis a personas de otros municipios se registran juntas, como en el 5C.',
  ],
])('describe la procedencia %o', (procedencia, texto) => {
  montar({ c: contenido(procedencia) })
  within(hoja()).getByText(texto)
})

it('lista las reglas con su versión y su severidad, y sin campos no hay card de datos adicionales', () => {
  montar()
  const reglas = within(hoja()).getByRole('list', { name: 'Validaciones del esquema' })
  expect(within(reglas).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
    'CAMPOS_COMPLETOS · v1',
    'VARIACION_HISTORICA · v2 · severidad: Advertencia',
  ])
  expect(within(hoja()).queryByText('Datos adicionales')).toBeNull()
})

it('con campos adicionales muestra la card de datos adicionales', () => {
  const camposAdicionales = [{ clave: 'total', etiqueta: 'Total declarado', tipo: 'entero', requerido: true }]
  montar({ esquema: { ...VIGENTE, camposAdicionales } })
  within(hoja()).getByText('Datos adicionales')
  within(hoja()).getByRole('spinbutton', { name: 'Total declarado (obligatorio)' })
})

it('con problemas muestra cuántos son y cada mensaje; sin problemas no aparece el aviso', () => {
  const problemas = ['La dosis D2 no aparece en ninguna sección.', 'Indique al menos una sección.']
  const { unmount } = montar({ esquema: BORRADOR, problemas })
  within(hoja()).getByText('Este borrador tiene 2 problemas; el formulario puede verse incompleto.')
  const lista = within(hoja()).getByRole('list', { name: 'Problemas del borrador' })
  expect(within(lista).getAllByRole('listitem').map((li) => li.textContent)).toEqual(problemas)
  unmount()
  montar({ esquema: BORRADOR, problemas: [] })
  expect(within(hoja()).queryByRole('list', { name: 'Problemas del borrador' })).toBeNull()
})

it('una versión publicada sin secciones las deduce; un borrador sin secciones no arma celdas', () => {
  const sinSecciones = { ...contenido(), secciones: [] }
  const { unmount } = montar({ c: sinSecciones })
  within(hoja()).getByText('VPH')
  within(hoja()).getByRole('textbox', { name: '1.ª dosis · Masculino' })
  unmount()
  montar({ esquema: BORRADOR, c: sinSecciones })
  within(hoja()).getByText('El esquema todavía no arma ninguna celda.')
})

function ConBoton() {
  const [abierta, setAbierta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAbierta(true)}>
        Abrir
      </button>
      <VistaPreviaEsquema
        abierta={abierta}
        alCambiarAbierta={setAbierta}
        esquema={VIGENTE}
        contenido={contenido()}
        vacuna={VACUNA}
        dimensiones={DIMENSIONES}
      />
    </>
  )
}

it('no llama a la API al abrirla, escribir cantidades ni cerrarla, y al reabrirla las cantidades están vacías', () => {
  const fetch = vi.spyOn(globalThis, 'fetch')
  render(<ConBoton />)
  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  const celda = within(hoja()).getByRole('textbox', { name: '1.ª dosis · Masculino' })
  fireEvent.change(celda, { target: { value: '12' } })
  expect(within(hoja()).getByLabelText('Total general').textContent).toBe('12')
  fireEvent.click(within(hoja()).getByRole('button', { name: 'Cerrar' }))
  expect(screen.queryByRole('dialog')).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Abrir' }))
  expect(within(hoja()).getByRole('textbox', { name: '1.ª dosis · Masculino' }).value).toBe('')

  expect(fetch).not.toHaveBeenCalled()
  for (const api of [apiCatalogos, apiConfiguracion]) {
    for (const funcion of Object.values(api)) if (vi.isMockFunction(funcion)) expect(funcion).not.toHaveBeenCalled()
  }
  fetch.mockRestore()
})

const publicacion = (cambios = {}) => ({
  vigencia: 'Noviembre 2026',
  motivo: 'Ajuste del esquema nacional',
  publicando: false,
  errorApi: null,
  alVolver: vi.fn(),
  alConfirmar: vi.fn(),
  ...cambios,
})
const boton = (nombre) => within(hoja()).getByRole('button', { name: nombre })

it('sin publicacion solo tiene «Cerrar»', () => {
  montar({ esquema: BORRADOR })
  boton('Cerrar')
  expect(within(hoja()).queryByRole('button', { name: 'Confirmar publicación' })).toBeNull()
  expect(within(hoja()).queryByText(/Vigente desde/)).toBeNull()
})

it('con publicacion muestra lo elegido y sus tres botones', () => {
  const datos = publicacion()
  const alCambiarAbierta = vi.fn()
  montar({ esquema: BORRADOR, publicacion: datos, alCambiarAbierta })
  within(hoja()).getByText('Vigente desde Noviembre 2026. Motivo: Ajuste del esquema nacional.')
  expect(within(hoja()).queryByRole('button', { name: 'Cerrar' })).toBeNull()

  fireEvent.click(boton('Volver a los datos'))
  expect(datos.alVolver).toHaveBeenCalledTimes(1)
  fireEvent.click(boton('Confirmar publicación'))
  expect(datos.alConfirmar).toHaveBeenCalledTimes(1)
  fireEvent.click(boton('Cancelar'))
  expect(alCambiarAbierta).toHaveBeenCalledWith(false)
})

it('con problemas, «Confirmar publicación» está deshabilitado y dice por qué', () => {
  const datos = publicacion()
  montar({ esquema: BORRADOR, problemas: ['Indique al menos una sección.'], publicacion: datos })
  expect(boton('Confirmar publicación').disabled).toBe(true)
  within(hoja()).getByText('Corrija los problemas del borrador antes de publicarlo.')
})

it('muestra el error de la API encima de los botones', () => {
  montar({ esquema: BORRADOR, publicacion: publicacion({ errorApi: 'El mes ya no es válido.' }) })
  within(hoja()).getByText('El mes ya no es válido.')
  expect(boton('Confirmar publicación').disabled).toBe(false)
})

it('mientras publica, los botones están deshabilitados y Esc no cierra', () => {
  const alCambiarAbierta = vi.fn()
  montar({ esquema: BORRADOR, publicacion: publicacion({ publicando: true }), alCambiarAbierta })
  for (const nombre of ['Volver a los datos', 'Cancelar', 'Publicando…']) expect(boton(nombre).disabled).toBe(true)
  fireEvent.keyDown(hoja(), { key: 'Escape' })
  expect(alCambiarAbierta).not.toHaveBeenCalled()
})
