import { fireEvent, render, screen } from '@testing-library/react'
import SelectorConBusqueda, { filtrarOpciones } from './SelectorConBusqueda.jsx'

const OPCIONES = [
  { valor: 'ninguno', texto: 'Sin establecimiento (personal de la DDRISS)', fija: true },
  { valor: '6', texto: 'Centro de Salud Concepción Tutuapa', detalle: 'CS-1206' },
  { valor: '1', texto: 'Centro de Salud San Marcos', detalle: 'CS-1201' },
  { valor: '9', texto: 'Puesto de Salud Ixchiguán', detalle: 'PS-1209-01' },
]

const textos = (lista) => lista.map((o) => o.valor)

describe('filtrarOpciones', () => {
  test('sin búsqueda devuelve todas, con las fijas primero', () => {
    expect(textos(filtrarOpciones(OPCIONES, ''))).toEqual(['ninguno', '6', '1', '9'])
    expect(textos(filtrarOpciones(OPCIONES, '   '))).toEqual(['ninguno', '6', '1', '9'])
  })

  test('busca en el texto y en el detalle, sin mayúsculas ni tildes, y conserva las fijas', () => {
    expect(textos(filtrarOpciones(OPCIONES, 'tutuapa'))).toEqual(['ninguno', '6'])
    expect(textos(filtrarOpciones(OPCIONES, 'CONCEPCION'))).toEqual(['ninguno', '6'])
    expect(textos(filtrarOpciones(OPCIONES, 'ixchiguan'))).toEqual(['ninguno', '9'])
    expect(textos(filtrarOpciones(OPCIONES, 'cs-1206'))).toEqual(['ninguno', '6'])
    expect(textos(filtrarOpciones(OPCIONES, 'cs-12'))).toEqual(['ninguno', '6', '1'])
    expect(textos(filtrarOpciones(OPCIONES, 'zzz'))).toEqual(['ninguno'])
  })
})

function montar(props = {}) {
  const alCambiar = vi.fn()
  render(
    <SelectorConBusqueda
      id="establecimiento"
      valor="1"
      alCambiar={alCambiar}
      opciones={OPCIONES}
      etiqueta="Establecimiento"
      textoBuscar="Buscar por nombre o código…"
      textoVacio="Ningún establecimiento coincide."
      {...props}
    />,
  )
  return alCambiar
}

const boton = () => screen.getByRole('combobox', { name: 'Establecimiento' })
const buscar = (texto) => fireEvent.change(screen.getByPlaceholderText('Buscar por nombre o código…'), { target: { value: texto } })

describe('SelectorConBusqueda', () => {
  test('muestra la opción elegida y, al abrir, buscar y elegir, llama a alCambiar y se cierra', async () => {
    const alCambiar = montar()
    expect(boton().textContent).toBe('Centro de Salud San Marcos')
    expect(boton().getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(boton())
    expect(boton().getAttribute('aria-expanded')).toBe('true')
    buscar('tutuapa')
    expect(screen.queryByText('Centro de Salud San Marcos', { selector: '[cmdk-item] span' })).toBeNull()
    expect(screen.getByText('Sin establecimiento (personal de la DDRISS)')).toBeTruthy()
    fireEvent.click(await screen.findByText('Centro de Salud Concepción Tutuapa'))

    expect(alCambiar).toHaveBeenCalledWith('6')
    expect(boton().getAttribute('aria-expanded')).toBe('false')
  })

  test('cada opción muestra su detalle', () => {
    montar()
    fireEvent.click(boton())
    expect(screen.getByText('CS-1206')).toBeTruthy()
  })

  test('sin coincidencias lo dice, y la opción fija sigue a la vista', () => {
    montar()
    fireEvent.click(boton())
    buscar('zzz')
    expect(screen.getByText('Ningún establecimiento coincide.')).toBeTruthy()
    expect(screen.getByText('Sin establecimiento (personal de la DDRISS)')).toBeTruthy()
  })

  test('al cerrar se borra la búsqueda', () => {
    montar()
    fireEvent.click(boton())
    buscar('tutuapa')
    fireEvent.keyDown(screen.getByPlaceholderText('Buscar por nombre o código…'), { key: 'Escape' })
    fireEvent.click(boton())
    expect(screen.getByPlaceholderText('Buscar por nombre o código…').value).toBe('')
  })

  test('sin valor muestra el marcador', () => {
    montar({ valor: undefined, marcador: 'Elija un establecimiento' })
    expect(boton().textContent).toBe('Elija un establecimiento')
  })

  test('deshabilitado no abre', () => {
    montar({ deshabilitado: true })
    expect(boton().disabled).toBe(true)
    fireEvent.click(boton())
    expect(screen.queryByPlaceholderText('Buscar por nombre o código…')).toBeNull()
  })

  test('con error lleva aria-invalid y aria-describedby', () => {
    montar({ invalido: true, descritoPor: 'establecimiento-error' })
    expect(boton().getAttribute('aria-invalid')).toBe('true')
    expect(boton().getAttribute('aria-describedby')).toBe('establecimiento-error')
  })
})
