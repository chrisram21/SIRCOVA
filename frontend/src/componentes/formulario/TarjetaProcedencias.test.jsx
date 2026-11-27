import { fireEvent, render, screen, within } from '@testing-library/react'
import { armarFormulario } from './armarFormulario.js'
import TarjetaProcedencias, {
  cantidadesDeOtras,
  columnasDeProcedencia,
  filasDeProcedencia,
  llaveProcedencia,
  TablaProcedencias,
} from './TarjetaProcedencias.jsx'

const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const dimensiones = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 2)],
  },
  { codigo: 'sexo', nombre: 'Sexo', valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] },
  {
    codigo: 'embarazo',
    nombre: 'Condición de embarazo',
    valores: [valor('EMBARAZADA', 'Embarazada', 1), valor('NO_EMBARAZADA', 'No embarazada', 2)],
  },
]
const vacuna = {
  nombre: 'Vacuna',
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
    { codigo: 'R1', nombre: 'Refuerzo', orden: 3, activa: true },
  ],
}
// Como Hexavalente con sexo, más un refuerzo con desagregación propia (su tabla aparte, como el de Td).
const formulario = armarFormulario({
  contenido: {
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
    dosis: [
      { codigo: 'D1', desagregacion: null },
      { codigo: 'D2', desagregacion: null },
      {
        codigo: 'R1',
        desagregacion: [
          { dimension: 'grupo_edad', valores: ['1_A_5'] },
          { dimension: 'embarazo', valores: ['EMBARAZADA', 'NO_EMBARAZADA'] },
        ],
      },
    ],
    desagregacion: [
      { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
      { dimension: 'sexo', valores: ['M', 'F'] },
    ],
    secciones: [
      { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] },
      { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'D2', 'R1'] },
    ],
  },
  vacuna,
  dimensiones,
})

const PROPIO = 1
const SAN_PEDRO = 2
const SIBINAL = 13
const MIGRANTES = 31
const COATEPEQUE = 32
// Como los devuelve GET /reportes/{id}/formulario: por nombre, con el 9999 al final.
const municipios = [
  { id: COATEPEQUE, codigoIne: '0920', nombre: 'Coatepeque' },
  { id: SAN_PEDRO, codigoIne: '1202', nombre: 'San Pedro Sacatepéquez' },
  { id: SIBINAL, codigoIne: '1213', nombre: 'Sibinal' },
  { id: MIGRANTES, codigoIne: '9999', nombre: 'Migrantes / fuera de San Marcos' },
]
const permitidas = [SAN_PEDRO, SIBINAL, MIGRANTES]

const celda = (dosisCodigo, municipioProcedenciaId, claveCombinacion, cantidad) => ({
  dosisCodigo,
  municipioProcedenciaId,
  claveCombinacion,
  cantidad,
})

const alCambiar = vi.fn()

function montar(props = {}) {
  return render(
    <TarjetaProcedencias
      formulario={formulario}
      celdas={[]}
      cantidades={{}}
      municipios={municipios}
      permitidas={permitidas}
      modo="MUNICIPIO_DETALLADO"
      municipioPropioId={PROPIO}
      alCambiar={alCambiar}
      {...props}
    />,
  )
}

const encabezados = (tabla) => within(tabla).getAllByRole('columnheader').map((th) => th.textContent)
const nombresDeFilas = (tabla) =>
  within(tabla.querySelector('tbody'))
    .getAllByRole('row')
    .map((fila) => within(fila).getAllByRole('cell')[0].textContent)

beforeEach(() => {
  vi.clearAllMocks()
})

const bcg = armarFormulario({
  contenido: {
    procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
    dosis: [{ codigo: 'UNICA', desagregacion: null }],
    desagregacion: [],
    secciones: [{ titulo: 'BCG', grupoEdad: null, dosis: ['UNICA'] }],
  },
  vacuna: { nombre: 'BCG', dosis: [{ codigo: 'UNICA', nombre: 'Dosis única', orden: 1, activa: true }] },
  dimensiones,
})

describe('columnasDeProcedencia', () => {
  it('con secciones y sexo: un nivel por sección, uno por dosis y el del sexo', () => {
    const { encabezados, columnas } = columnasDeProcedencia(formulario.tablas[0])

    expect(encabezados).toEqual([
      [
        { etiqueta: '< 1 año', columnas: 4 },
        { etiqueta: 'De 1 a < 6 años', columnas: 4 },
      ],
      [
        { etiqueta: '1.ª dosis', columnas: 2 },
        { etiqueta: '2.ª dosis', columnas: 2 },
        { etiqueta: '1.ª dosis', columnas: 2 },
        { etiqueta: '2.ª dosis', columnas: 2 },
      ],
      Array.from({ length: 4 }).flatMap(() => [
        { etiqueta: 'Masculino', columnas: 1 },
        { etiqueta: 'Femenino', columnas: 1 },
      ]),
    ])
    const resumen = ({ dosis, seccion, claveCombinacion, etiqueta }) => [dosis, seccion, claveCombinacion, etiqueta]
    expect(columnas.slice(0, 3).map(resumen)).toEqual([
      ['D1', 0, 'grupo_edad=MENOR_1|sexo=M', '< 1 año · 1.ª dosis · Masculino'],
      ['D1', 0, 'grupo_edad=MENOR_1|sexo=F', '< 1 año · 1.ª dosis · Femenino'],
      ['D2', 0, 'grupo_edad=MENOR_1|sexo=M', '< 1 año · 2.ª dosis · Masculino'],
    ])
    expect(resumen(columnas.at(-1))).toEqual([
      'D2',
      1,
      'grupo_edad=1_A_5|sexo=F',
      'De 1 a < 6 años · 2.ª dosis · Femenino',
    ])
  })

  it('una dosis con desagregación propia: su tabla con su grupo de edad, la dosis y sus valores', () => {
    const { encabezados, columnas } = columnasDeProcedencia(formulario.tablas[1])

    expect(encabezados).toEqual([
      [{ etiqueta: 'De 1 a < 6 años', columnas: 2 }],
      [{ etiqueta: 'Refuerzo', columnas: 2 }],
      [
        { etiqueta: 'Embarazada', columnas: 1 },
        { etiqueta: 'No embarazada', columnas: 1 },
      ],
    ])
    expect(columnas.map((c) => c.claveCombinacion)).toEqual([
      'embarazo=EMBARAZADA|grupo_edad=1_A_5',
      'embarazo=NO_EMBARAZADA|grupo_edad=1_A_5',
    ])
  })

  it('sin grupo de edad ni otras dimensiones: solo el nivel de las dosis', () => {
    expect(columnasDeProcedencia(bcg.tablas[0])).toEqual({
      encabezados: [[{ etiqueta: 'Dosis única', columnas: 1 }]],
      columnas: [{ dosis: 'UNICA', seccion: 0, claveCombinacion: '', etiqueta: 'Dosis única' }],
    })
  })
})

describe('filasDeProcedencia', () => {
  const base = { formulario, municipios, celdas: [], municipioPropioId: PROPIO, modo: 'MUNICIPIO_DETALLADO' }
  const resumen = (filas) => filas.map((f) => [f.nombre, f.heredada])

  it('MUNICIPIO_DETALLADO con Migrantes: las permitidas en su orden, Migrantes al final', () => {
    expect(resumen(filasDeProcedencia({ ...base, permitidas }))).toEqual([
      ['San Pedro Sacatepéquez', false],
      ['Sibinal', false],
      ['Migrantes / fuera de San Marcos', false],
    ])
  })

  it('MUNICIPIO_DETALLADO sin Migrantes: un 9999 guardado es heredado y va al final', () => {
    const celdas = [celda('D1', MIGRANTES, 'grupo_edad=MENOR_1|sexo=M', 1)]

    const filas = filasDeProcedencia({ ...base, permitidas: [SAN_PEDRO, SIBINAL], celdas })

    expect(resumen(filas)).toEqual([
      ['San Pedro Sacatepéquez', false],
      ['Sibinal', false],
      ['Migrantes / fuera de San Marcos', true],
    ])
    expect(filas[0].motivo).toBeUndefined()
    expect(filas[2].motivo).toMatch(/ya no registra las dosis de Migrantes/)
  })

  it('PROPIO_Y_OTROS: una sola fila, «Otros municipios», y un municipio con nombre guardado es heredado', () => {
    const celdas = [celda('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=M', 2)]

    const filas = filasDeProcedencia({ ...base, modo: 'PROPIO_Y_OTROS', permitidas: [MIGRANTES], celdas })

    expect(filas.map((f) => [f.municipioId, f.nombre, f.heredada])).toEqual([
      [MIGRANTES, 'Otros municipios', false],
      [SIBINAL, 'Sibinal', true],
    ])
    expect(filas[1].motivo).toMatch(/registra juntas las dosis de otros municipios/)
  })

  it('las heredadas van en el orden de municipios; no cuentan el propio ni una celda que no se dibuja', () => {
    const celdas = [
      celda('D1', PROPIO, 'grupo_edad=MENOR_1|sexo=M', 40),
      celda('D1', 99, 'grupo_edad=MENOR_1|sexo=M', 1),
      celda('R1', COATEPEQUE, 'embarazo=EMBARAZADA|grupo_edad=1_A_5', 1),
      celda('D1', 77, 'grupo_edad=OTRO|sexo=M', 5),
    ]

    expect(resumen(filasDeProcedencia({ ...base, permitidas: [SIBINAL], celdas }))).toEqual([
      ['Sibinal', false],
      ['Coatepeque', true],
      ['Municipio 99', true],
    ])
  })

  it('en solo lectura, solo las filas con alguna cantidad (un 0 cuenta)', () => {
    const celdas = [
      celda('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=F', 0),
      celda('R1', COATEPEQUE, 'embarazo=EMBARAZADA|grupo_edad=1_A_5', 1),
    ]

    expect(resumen(filasDeProcedencia({ ...base, permitidas, celdas, soloLectura: true }))).toEqual([
      ['Sibinal', false],
      ['Coatepeque', true],
    ])
  })
})

describe('TablaProcedencias', () => {
  const filas = filasDeProcedencia({
    formulario,
    permitidas: [SIBINAL, MIGRANTES],
    municipios,
    celdas: [celda('D1', COATEPEQUE, 'grupo_edad=MENOR_1|sexo=M', 1)],
    municipioPropioId: PROPIO,
    modo: 'MUNICIPIO_DETALLADO',
  })
  const cantidades = {
    [llaveProcedencia('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=M')]: '2',
    [llaveProcedencia('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=F')]: '0',
    [llaveProcedencia('D2', SIBINAL, 'grupo_edad=1_A_5|sexo=F')]: '5',
    [llaveProcedencia('D1', MIGRANTES, 'grupo_edad=MENOR_1|sexo=M')]: '3',
    [llaveProcedencia('D1', COATEPEQUE, 'grupo_edad=MENOR_1|sexo=M')]: '1',
  }
  const montarTabla = (props = {}) =>
    render(
      <TablaProcedencias
        tabla={formulario.tablas[0]}
        filas={filas}
        cantidades={cantidades}
        alCambiar={alCambiar}
        {...props}
      />,
    )
  const casilla = (nombre) => screen.getByLabelText(nombre)

  it('encabezado por sección, dosis y sexo; una fila por municipio y la heredada al final', () => {
    montarTabla()

    const tabla = screen.getByRole('table', { name: 'Otros municipios' })
    expect(encabezados(tabla).slice(0, 5)).toEqual([
      'Municipio de procedencia',
      '< 1 año',
      'De 1 a < 6 años',
      'Total',
      '1.ª dosis',
    ])
    const nombres = within(tabla)
      .getAllByRole('row')
      .slice(3)
      .map((fila) => within(fila).getAllByRole('cell')[0].textContent)
    expect(nombres).toEqual(['Sibinal', 'Migrantes / fuera de San Marcos', 'CoatepequeYa no disponible', 'Total'])
    expect(casilla('Sibinal · < 1 año · 1.ª dosis · Masculino').value).toBe('2')
    expect(casilla('Sibinal · < 1 año · 1.ª dosis · Femenino').value).toBe('0')
    expect(casilla('Sibinal · De 1 a < 6 años · 2.ª dosis · Masculino').value).toBe('')
  })

  it('suma el total de cada municipio, de cada columna y de la tabla', () => {
    montarTabla()

    expect(screen.getByLabelText('Total de Sibinal').textContent).toBe('7')
    expect(screen.getByLabelText('Total de < 1 año · 1.ª dosis · Masculino').textContent).toBe('6')
    expect(screen.getByLabelText('Total de De 1 a < 6 años · 2.ª dosis · Masculino').textContent).toBe('0')
    expect(screen.getByLabelText('Total de Otros municipios').textContent).toBe('11')
  })

  it('escribir avisa con la llave de siempre; un valor inválido y una marca de la validación se ven', () => {
    const llaveF = llaveProcedencia('D1', MIGRANTES, 'grupo_edad=MENOR_1|sexo=F')
    montarTabla({ cantidades: { ...cantidades, [llaveF]: '2.5' }, marcas: { [llaveF]: 'ERROR' } })

    const femenino = casilla('Migrantes / fuera de San Marcos · < 1 año · 1.ª dosis · Femenino')
    expect(femenino.getAttribute('aria-invalid')).toBe('true')
    expect(femenino.getAttribute('data-celda')).toBe(llaveF)
    fireEvent.change(casilla('Coatepeque · < 1 año · 1.ª dosis · Masculino'), { target: { value: '' } })
    expect(alCambiar).toHaveBeenCalledWith(llaveProcedencia('D1', COATEPEQUE, 'grupo_edad=MENOR_1|sexo=M'), '')
  })

  it('las casillas llevan su fila y columna para moverse con Enter y las flechas', () => {
    montarTabla()

    const sibinal = casilla('Sibinal · < 1 año · 1.ª dosis · Masculino')
    const migrantes = casilla('Migrantes / fuera de San Marcos · < 1 año · 1.ª dosis · Masculino')
    expect([sibinal.dataset.fila, sibinal.dataset.col, migrantes.dataset.fila]).toEqual(['0', '0', '1'])
    sibinal.focus()
    fireEvent.keyDown(sibinal, { key: 'Enter' })
    expect(document.activeElement).toBe(migrantes)
  })

  it('la heredada lleva «Ya no disponible», que se puede enfocar para leer su motivo', () => {
    montarTabla()

    const marca = screen.getByText('Ya no disponible')
    expect(marca.getAttribute('tabindex')).toBe('0')
    expect(filas[2].motivo).toMatch(/ya no se ofrece como procedencia/)
  })

  it('desplaza con el encabezado y la columna del municipio fijos', () => {
    montarTabla()

    expect(screen.getByTestId('contenedor-procedencias').className).toMatch(/overflow-auto/)
    expect(document.querySelector('thead').className).toMatch(/sticky top-0/)
    expect(screen.getByText('Sibinal').closest('td').className).toMatch(/sticky left-0/)
  })

  it('en solo lectura las casillas están deshabilitadas', () => {
    montarTabla({ soloLectura: true })

    expect(casilla('Sibinal · < 1 año · 1.ª dosis · Masculino').disabled).toBe(true)
  })
})

describe('TarjetaProcedencias', () => {
  it('una tabla por tabla A con todas las procedencias permitidas, sin botones ni diálogo', () => {
    montar()

    const general = screen.getByRole('table', { name: 'Otros municipios' })
    const refuerzo = screen.getByRole('table', { name: 'Otros municipios · Refuerzo' })
    const permitidasEnOrden = ['San Pedro Sacatepéquez', 'Sibinal', 'Migrantes / fuera de San Marcos']
    expect(nombresDeFilas(general)).toEqual(permitidasEnOrden)
    expect(nombresDeFilas(refuerzo)).toEqual(permitidasEnOrden)
    expect(encabezados(refuerzo).slice(0, 4)).toEqual([
      'Municipio de procedencia',
      'De 1 a < 6 años',
      'Total',
      'Refuerzo',
    ])
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('escribir en la fila de un municipio avisa con su llave', () => {
    montar()

    fireEvent.change(screen.getByLabelText('San Pedro Sacatepéquez · De 1 a < 6 años · Refuerzo · Embarazada'), {
      target: { value: '4' },
    })
    const llave = llaveProcedencia('R1', SAN_PEDRO, 'embarazo=EMBARAZADA|grupo_edad=1_A_5')
    expect(alCambiar).toHaveBeenCalledWith(llave, '4')
  })

  it('PROPIO_Y_OTROS: una sola fila, «Otros municipios», que escribe en el 9999, y lo explica', () => {
    montar({ modo: 'PROPIO_Y_OTROS', permitidas: [MIGRANTES] })

    expect(screen.getByText('Este esquema registra juntas las dosis de otros municipios, como en el 5C.')).toBeTruthy()
    expect(nombresDeFilas(screen.getByRole('table', { name: 'Otros municipios' }))).toEqual(['Otros municipios'])
    fireEvent.change(screen.getByLabelText('Otros municipios · < 1 año · 1.ª dosis · Femenino'), {
      target: { value: '1' },
    })
    expect(alCambiar).toHaveBeenCalledWith(llaveProcedencia('D1', MIGRANTES, 'grupo_edad=MENOR_1|sexo=F'), '1')
  })

  it('una heredada guardada sale al final y, guardada vacía, ya no aparece', () => {
    const celdas = [celda('D1', COATEPEQUE, 'grupo_edad=MENOR_1|sexo=M', 1)]
    const { rerender } = montar({ celdas, cantidades: cantidadesDeOtras(formulario, celdas, PROPIO) })

    const general = () => screen.getByRole('table', { name: 'Otros municipios' })
    expect(nombresDeFilas(general()).at(-1)).toBe('CoatepequeYa no disponible')
    expect(screen.getByLabelText('Coatepeque · < 1 año · 1.ª dosis · Masculino').value).toBe('1')

    rerender(
      <TarjetaProcedencias
        formulario={formulario}
        celdas={[]}
        cantidades={{}}
        municipios={municipios}
        permitidas={permitidas}
        modo="MUNICIPIO_DETALLADO"
        municipioPropioId={PROPIO}
        alCambiar={alCambiar}
      />,
    )
    expect(nombresDeFilas(general())).not.toContain('CoatepequeYa no disponible')
  })

  it('en solo lectura, solo los municipios con datos, con las casillas deshabilitadas', () => {
    const celdas = [
      celda('D1', PROPIO, 'grupo_edad=MENOR_1|sexo=M', 40),
      celda('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=M', 2),
    ]
    montar({ celdas, cantidades: cantidadesDeOtras(formulario, celdas, PROPIO), soloLectura: true })

    const general = screen.getByRole('table', { name: 'Otros municipios' })
    expect(nombresDeFilas(general)).toEqual(['Sibinal'])
    expect(screen.getByLabelText('Total de Otros municipios').textContent).toBe('2')
    expect(screen.getByLabelText('Sibinal · < 1 año · 1.ª dosis · Masculino').disabled).toBe(true)
  })

  it('en solo lectura sin datos dice «Sin dosis atribuidas a otros municipios»', () => {
    montar({ celdas: [celda('D1', PROPIO, 'grupo_edad=MENOR_1|sexo=M', 40)], soloLectura: true })

    expect(screen.getByText('Sin dosis atribuidas a otros municipios.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('sin procedencias permitidas ni heredadas no dibuja la tabla', () => {
    montar({ permitidas: [] })

    expect(screen.getByText('Esta vacuna no tiene municipios de procedencia para registrar.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})
