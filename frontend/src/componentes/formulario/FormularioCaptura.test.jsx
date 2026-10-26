import { fireEvent, render, screen } from '@testing-library/react'
import { armarFormulario } from './armarFormulario.js'
import FormularioCaptura, { CamposAdicionales } from './FormularioCaptura.jsx'

const valor = (codigo, etiqueta, orden) => ({ codigo, etiqueta, orden, activo: true })
const dimensiones = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    activa: true,
    valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 2)],
  },
  { codigo: 'sexo', nombre: 'Sexo', activa: true, valores: [valor('M', 'Masculino', 1), valor('F', 'Femenino', 2)] },
]
const vacuna = {
  id: 1,
  codigo: 'ZVT',
  nombre: 'Vacuna',
  dosis: [
    { codigo: 'D1', nombre: '1.ª dosis', orden: 1, activa: true },
    { codigo: 'D2', nombre: '2.ª dosis', orden: 2, activa: true },
  ],
}
// D2 solo está en < 1 año: sus celdas de 1 a < 6 años no existen.
const contenido = {
  procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  dosis: [
    { codigo: 'D1', desagregacion: null },
    { codigo: 'D2', desagregacion: null },
  ],
  desagregacion: [
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    { dimension: 'sexo', valores: ['M', 'F'] },
  ],
  secciones: [
    { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1', 'D2'] },
    { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1'] },
  ],
}
const montar = (c = contenido) => render(<FormularioCaptura formulario={armarFormulario({ contenido: c, vacuna, dimensiones })} />)
const escribir = (nombre, texto) => fireEvent.change(screen.getByRole('textbox', { name: nombre }), { target: { value: texto } })
const total = (nombre) => screen.getByLabelText(nombre).textContent

it('dibuja los encabezados de varios niveles y «—» en las celdas que no existen', () => {
  montar()
  expect(screen.getByRole('columnheader', { name: '< 1 año' }).getAttribute('colspan')).toBe('2')
  expect(screen.getByRole('columnheader', { name: 'De 1 a < 6 años' }).getAttribute('colspan')).toBe('2')
  expect(screen.getAllByRole('columnheader', { name: 'Masculino' })).toHaveLength(2)
  screen.getByRole('textbox', { name: '1.ª dosis · De 1 a < 6 años · Femenino' })
  expect(screen.getByLabelText('2.ª dosis · De 1 a < 6 años · Masculino: no aplica').textContent).toBe('—')
  expect(screen.queryByRole('textbox', { name: '2.ª dosis · De 1 a < 6 años · Masculino' })).toBeNull()
  expect(screen.getAllByRole('textbox')).toHaveLength(6)
})

it('calcula los totales por fila, por columna y el general', () => {
  montar()
  escribir('1.ª dosis · < 1 año · Masculino', '78')
  escribir('1.ª dosis · De 1 a < 6 años · Femenino', '4')
  escribir('2.ª dosis · < 1 año · Masculino', '71')
  expect(total('Total de 1.ª dosis')).toBe('82')
  expect(total('Total de 2.ª dosis')).toBe('71')
  expect(total('Total de < 1 año · Masculino')).toBe('149')
  expect(total('Total de De 1 a < 6 años · Femenino')).toBe('4')
  expect(total('Total general')).toBe('153')
})

it.each(['-1', '2.5', 'abc'])('«%s» se marca con error y no suma', (texto) => {
  montar()
  escribir('1.ª dosis · < 1 año · Masculino', '10')
  escribir('1.ª dosis · < 1 año · Femenino', texto)
  expect(screen.getByRole('textbox', { name: '1.ª dosis · < 1 año · Femenino' }).getAttribute('aria-invalid')).toBe('true')
  expect(screen.getByRole('textbox', { name: '1.ª dosis · < 1 año · Masculino' }).hasAttribute('aria-invalid')).toBe(false)
  expect(total('Total de 1.ª dosis')).toBe('10')
  expect(total('Total general')).toBe('10')
})

it('sin celdas muestra el aviso en lugar de las tablas', () => {
  montar({ ...contenido, secciones: [] })
  screen.getByText('El esquema todavía no arma ninguna celda.')
  expect(screen.queryByRole('table')).toBeNull()
})

it('dibuja los campos adicionales según su tipo, con "(obligatorio)" y su ayuda', () => {
  render(
    <CamposAdicionales
      campos={[
        { clave: 'total_dosis', etiqueta: 'Total de dosis', tipo: 'entero', requerido: true, minimo: 0, maximo: null, ayuda: 'Según el registro.' },
        { clave: 'promedio', etiqueta: 'Promedio', tipo: 'decimal', requerido: false },
        { clave: 'nota', etiqueta: 'Nota', tipo: 'texto', requerido: false },
        { clave: 'jornada', etiqueta: 'Hubo jornada', tipo: 'booleano', requerido: false },
        { clave: 'turno', etiqueta: 'Turno', tipo: 'lista', requerido: false, opciones: ['Mañana', 'Tarde'] },
      ]}
    />,
  )
  const entero = screen.getByRole('spinbutton', { name: 'Total de dosis (obligatorio)' })
  expect(entero.getAttribute('min')).toBe('0')
  expect(entero.getAttribute('step')).toBe('1')
  expect(document.getElementById(entero.getAttribute('aria-describedby')).textContent).toBe('Según el registro.')
  expect(screen.getByRole('spinbutton', { name: 'Promedio' }).getAttribute('step')).toBe('any')
  const nota = screen.getByRole('textbox', { name: 'Nota' })
  fireEvent.change(nota, { target: { value: 'Sin novedades' } })
  expect(nota.value).toBe('Sin novedades')
  const jornada = screen.getByRole('switch', { name: 'Hubo jornada' })
  fireEvent.click(jornada)
  expect(jornada.getAttribute('aria-checked')).toBe('true')
  screen.getByRole('combobox', { name: 'Turno' })
})

describe('con cantidades del padre (la captura)', () => {
  const formulario = armarFormulario({ contenido, vacuna, dimensiones })

  it('muestra las cantidades recibidas con sus totales y avisa cada cambio con la llave {dosis}|{clave}', () => {
    const alCambiar = vi.fn()
    render(
      <FormularioCaptura
        formulario={formulario}
        cantidades={{ 'D1|grupo_edad=MENOR_1|sexo=M': '78', 'D2|grupo_edad=MENOR_1|sexo=F': '0' }}
        alCambiar={alCambiar}
      />,
    )
    expect(screen.getByRole('textbox', { name: '1.ª dosis · < 1 año · Masculino' }).value).toBe('78')
    expect(screen.getByRole('textbox', { name: '2.ª dosis · < 1 año · Femenino' }).value).toBe('0')
    expect(screen.getByRole('textbox', { name: '1.ª dosis · < 1 año · Femenino' }).value).toBe('')
    expect(total('Total general')).toBe('78')

    escribir('1.ª dosis · De 1 a < 6 años · Femenino', '4')
    expect(alCambiar).toHaveBeenCalledWith('D1|grupo_edad=1_A_5|sexo=F', '4')
    // El padre no actualizó sus cantidades: el campo sigue con lo que recibió.
    expect(screen.getByRole('textbox', { name: '1.ª dosis · De 1 a < 6 años · Femenino' }).value).toBe('')
  })

  it('en solo lectura los campos están deshabilitados y los totales se siguen viendo', () => {
    render(<FormularioCaptura formulario={formulario} cantidades={{ 'D1|grupo_edad=MENOR_1|sexo=M': '5' }} soloLectura />)
    for (const campo of screen.getAllByRole('textbox')) expect(campo.disabled).toBe(true)
    expect(total('Total de 1.ª dosis')).toBe('5')
  })

  it('CamposAdicionales muestra los valores recibidos, avisa con alCambiar(clave, valor) y en solo lectura se deshabilita', () => {
    const campos = [
      { clave: 'frascos', etiqueta: 'Frascos', tipo: 'entero', requerido: false },
      { clave: 'jornada', etiqueta: 'Hubo jornada', tipo: 'booleano', requerido: false },
      { clave: 'turno', etiqueta: 'Turno', tipo: 'lista', requerido: false, opciones: ['Mañana', 'Tarde'] },
    ]
    const alCambiar = vi.fn()
    const { unmount } = render(
      <CamposAdicionales campos={campos} valores={{ frascos: '12', jornada: true }} alCambiar={alCambiar} />,
    )
    const frascos = screen.getByRole('spinbutton', { name: 'Frascos' })
    expect(frascos.value).toBe('12')
    expect(screen.getByRole('switch', { name: 'Hubo jornada' }).getAttribute('aria-checked')).toBe('true')
    fireEvent.change(frascos, { target: { value: '13' } })
    expect(alCambiar).toHaveBeenCalledWith('frascos', '13')
    fireEvent.click(screen.getByRole('switch', { name: 'Hubo jornada' }))
    expect(alCambiar).toHaveBeenCalledWith('jornada', false)
    unmount()

    render(<CamposAdicionales campos={campos} valores={{ frascos: '12' }} soloLectura />)
    expect(screen.getByRole('spinbutton', { name: 'Frascos' }).disabled).toBe(true)
    expect(screen.getByRole('switch', { name: 'Hubo jornada' }).disabled).toBe(true)
    expect(screen.getByRole('combobox', { name: 'Turno' }).disabled).toBe(true)
  })
})
