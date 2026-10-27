import { fireEvent, render, screen, within } from '@testing-library/react'
import { armarFormulario } from './armarFormulario.js'
import TarjetaProcedencias, { filasDeCeldas, llaveProcedencia } from './TarjetaProcedencias.jsx'

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

const alAgregar = vi.fn()
const alQuitar = vi.fn()
const alCambiar = vi.fn()

function montar(props = {}) {
  return render(
    <TarjetaProcedencias
      formulario={formulario}
      filas={[]}
      cantidades={{}}
      municipios={municipios}
      permitidas={permitidas}
      modo="MUNICIPIO_DETALLADO"
      alAgregar={alAgregar}
      alQuitar={alQuitar}
      alCambiar={alCambiar}
      {...props}
    />,
  )
}

const dialogo = () => screen.getByRole('dialog')
const select = (nombre) => document.querySelector(`select[name="${nombre}"]`)
const opciones = (nombre) =>
  [...select(nombre).querySelectorAll('option')]
    .filter((o) => o.value !== '')
    .map((o) => [o.value, o.disabled])
const elegir = (nombre, valor) => fireEvent.change(select(nombre), { target: { value: valor } })
const encabezados = (tabla) => within(tabla).getAllByRole('columnheader').map((th) => th.textContent)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('filasDeCeldas', () => {
  it('agrupa las celdas de otras procedencias por municipio, dosis y sección, sin las del propio', () => {
    const celdas = [
      celda('D1', PROPIO, 'grupo_edad=MENOR_1|sexo=M', 40),
      celda('D2', MIGRANTES, 'grupo_edad=MENOR_1|sexo=M', 1),
      celda('D1', SIBINAL, 'grupo_edad=1_A_5|sexo=M', 2),
      celda('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=F', 0),
      celda('D1', SIBINAL, 'grupo_edad=MENOR_1|sexo=M', 3),
      celda('R1', COATEPEQUE, 'embarazo=EMBARAZADA|grupo_edad=1_A_5', 1),
      // Una clave que no está en el formulario no tiene fila.
      celda('D1', SAN_PEDRO, 'grupo_edad=OTRO|sexo=M', 5),
    ]

    expect(filasDeCeldas(formulario, celdas, PROPIO, municipios)).toEqual([
      { municipioId: COATEPEQUE, dosis: 'R1', seccion: 0 },
      { municipioId: SIBINAL, dosis: 'D1', seccion: 0 },
      { municipioId: SIBINAL, dosis: 'D1', seccion: 1 },
      { municipioId: MIGRANTES, dosis: 'D2', seccion: 0 },
    ])
  })
})

describe('tablas', () => {
  const filas = [
    { municipioId: SIBINAL, dosis: 'D1', seccion: 1 },
    { municipioId: COATEPEQUE, dosis: 'R1', seccion: 0 },
  ]
  const cantidades = {
    [llaveProcedencia('D1', SIBINAL, 'grupo_edad=1_A_5|sexo=M')]: '2',
    [llaveProcedencia('D1', SIBINAL, 'grupo_edad=1_A_5|sexo=F')]: '0',
    [llaveProcedencia('R1', COATEPEQUE, 'embarazo=EMBARAZADA|grupo_edad=1_A_5')]: '4',
  }

  it('una tabla por tabla A con filas, con las columnas de sus dimensiones y el total por fila', () => {
    montar({ filas, cantidades })

    const general = screen.getByRole('table', { name: 'Otros municipios' })
    expect(encabezados(general)).toEqual([
      'Municipio de procedencia',
      'Dosis',
      'Grupo de edad',
      'Masculino',
      'Femenino',
      'Total',
      'Acciones',
    ])
    expect(screen.getByLabelText('Sibinal · 1.ª dosis · De 1 a < 6 años · Masculino').value).toBe('2')
    expect(screen.getByLabelText('Sibinal · 1.ª dosis · De 1 a < 6 años · Femenino').value).toBe('0')
    expect(screen.getByLabelText('Total de Sibinal · 1.ª dosis · De 1 a < 6 años').textContent).toBe('2')

    // El refuerzo va en su propia tabla, y la fila heredada (Coatepeque) se ve con su nombre.
    const refuerzo = screen.getByRole('table', { name: 'Otros municipios · Refuerzo' })
    expect(encabezados(refuerzo)).toEqual([
      'Municipio de procedencia',
      'Dosis',
      'Grupo de edad',
      'Embarazada',
      'No embarazada',
      'Total',
      'Acciones',
    ])
    expect(within(refuerzo).getByText('Coatepeque')).toBeTruthy()
    expect(screen.getByLabelText('Coatepeque · Refuerzo · De 1 a < 6 años · Embarazada').value).toBe('4')
  })

  it('una vacuna con una sola sección sin grupo de edad no tiene la columna del grupo y su columna es «Cantidad»', () => {
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
    montar({ formulario: bcg, filas: [{ municipioId: SIBINAL, dosis: 'UNICA', seccion: 0 }] })

    expect(encabezados(screen.getByRole('table'))).toEqual(['Municipio de procedencia', 'Dosis', 'Cantidad', 'Total', 'Acciones'])
    expect(screen.getByLabelText('Sibinal · Dosis única')).toBeTruthy()
  })

  it('escribir en una celda avisa con su llave, y un valor inválido se marca', () => {
    montar({
      filas,
      cantidades: { ...cantidades, [llaveProcedencia('D1', SIBINAL, 'grupo_edad=1_A_5|sexo=F')]: '2.5' },
    })

    const femenino = screen.getByLabelText('Sibinal · 1.ª dosis · De 1 a < 6 años · Femenino')
    expect(femenino.getAttribute('aria-invalid')).toBe('true')
    fireEvent.change(screen.getByLabelText('Sibinal · 1.ª dosis · De 1 a < 6 años · Masculino'), {
      target: { value: '7' },
    })
    expect(alCambiar).toHaveBeenCalledWith(llaveProcedencia('D1', SIBINAL, 'grupo_edad=1_A_5|sexo=M'), '7')
  })

  it('«Quitar fila» avisa con la fila, también la de una procedencia heredada', () => {
    montar({ filas, cantidades })

    fireEvent.click(screen.getByRole('button', { name: 'Quitar fila Coatepeque · Refuerzo · De 1 a < 6 años' }))
    expect(alQuitar).toHaveBeenCalledWith({ municipioId: COATEPEQUE, dosis: 'R1', seccion: 0 })
  })

  it('en solo lectura no hay «Agregar» ni «Quitar fila» y las celdas están deshabilitadas', () => {
    montar({ filas, cantidades, soloLectura: true })

    expect(screen.queryByRole('button', { name: /Agregar municipio de procedencia/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /Quitar fila/ })).toBeNull()
    expect(screen.getByLabelText('Sibinal · 1.ª dosis · De 1 a < 6 años · Masculino').disabled).toBe(true)
  })

  it('sin filas dice que no hay dosis de otros municipios', () => {
    montar()

    expect(screen.getByText('No hay dosis de otros municipios.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('agregar una fila', () => {
  it('el Dialog ofrece solo las procedencias permitidas y deshabilita una combinación que ya existe', () => {
    montar({ filas: [{ municipioId: SIBINAL, dosis: 'D1', seccion: 0 }] })
    fireEvent.click(screen.getByRole('button', { name: /Agregar municipio de procedencia/ }))

    expect(opciones('municipio')).toEqual([
      [String(SAN_PEDRO), false],
      [String(SIBINAL), false],
      [String(MIGRANTES), false],
    ])
    expect(select('seccion')).toBeNull()
    elegir('municipio', String(SIBINAL))
    elegir('dosis', 'D1')
    // «< 1 año» ya existe para Sibinal y la 1.ª dosis.
    expect(opciones('seccion')).toEqual([
      ['0', true],
      ['1', false],
    ])
    const agregar = within(dialogo()).getByRole('button', { name: 'Agregar' })
    expect(agregar.disabled).toBe(true)

    elegir('seccion', '1')
    fireEvent.click(agregar)
    expect(alAgregar).toHaveBeenCalledWith({ municipioId: SIBINAL, dosis: 'D1', seccion: 1 })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('una dosis con una sola sección (el refuerzo) no pide el grupo', () => {
    montar()
    fireEvent.click(screen.getByRole('button', { name: /Agregar municipio de procedencia/ }))

    elegir('municipio', String(SAN_PEDRO))
    elegir('dosis', 'R1')
    expect(select('seccion')).toBeNull()
    fireEvent.click(within(dialogo()).getByRole('button', { name: 'Agregar' }))
    expect(alAgregar).toHaveBeenCalledWith({ municipioId: SAN_PEDRO, dosis: 'R1', seccion: 0 })
  })

  it('con todas las secciones de una dosis ocupadas, esa dosis queda deshabilitada para el municipio', () => {
    montar({ filas: [{ municipioId: SAN_PEDRO, dosis: 'R1', seccion: 0 }] })
    fireEvent.click(screen.getByRole('button', { name: /Agregar municipio de procedencia/ }))

    elegir('municipio', String(SAN_PEDRO))
    expect(opciones('dosis')).toEqual([
      ['D1', false],
      ['D2', false],
      ['R1', true],
    ])
  })

  it('PROPIO_Y_OTROS solo ofrece el 9999, ya elegido, y lo explica', () => {
    montar({ modo: 'PROPIO_Y_OTROS', permitidas: [MIGRANTES] })

    expect(screen.getByText('Este esquema registra juntas las dosis de otros municipios, como en el 5C.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Agregar municipio de procedencia/ }))
    expect(opciones('municipio')).toEqual([[String(MIGRANTES), false]])
    expect(select('municipio').value).toBe(String(MIGRANTES))
  })

  it('sin procedencias permitidas no hay «Agregar»', () => {
    montar({ permitidas: [] })

    expect(screen.queryByRole('button', { name: /Agregar municipio de procedencia/ })).toBeNull()
  })
})
