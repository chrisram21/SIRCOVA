import { useState } from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import SelectorMultipleConBusqueda from './SelectorMultipleConBusqueda.jsx'

const OPCIONES = [
  { valor: 'HEXA', texto: 'Hexavalente' },
  { valor: 'NEUMO', texto: 'Neumococo' },
  { valor: 'ROTA', texto: 'Rotavirus' },
  { valor: 'POLIO', texto: 'Polio (inactiva)' },
]

// Con estado propio, como lo usa una pantalla; alCambiar registra cada cambio.
function montar(inicial = []) {
  const alCambiar = vi.fn()
  function Envoltorio() {
    const [valores, setValores] = useState(inicial)
    return (
      <SelectorMultipleConBusqueda
        id="filtro-vacuna"
        etiqueta="Vacuna"
        valores={valores}
        alCambiar={(siguientes) => {
          alCambiar(siguientes)
          setValores(siguientes)
        }}
        opciones={OPCIONES}
        textoTodas="Todas las vacunas"
        textoVarias={(n) => `${n} vacunas`}
        textoBuscar="Buscar vacuna…"
        textoVacio="Ninguna vacuna coincide."
      />
    )
  }
  render(<Envoltorio />)
  return alCambiar
}

const boton = () => screen.getByRole('combobox', { name: 'Vacuna' })
const abrir = () => fireEvent.click(boton())
const lista = () => screen.getByRole('listbox')
const opcion = (texto) => within(lista()).getByText(texto).closest('[cmdk-item]')
const marcar = (texto) => fireEvent.click(within(lista()).getByText(texto))
const buscar = (texto) => fireEvent.change(screen.getByPlaceholderText('Buscar vacuna…'), { target: { value: texto } })

describe('SelectorMultipleConBusqueda', () => {
  test('el botón dice «Todas las vacunas», el nombre de una o «N vacunas»', () => {
    montar()
    expect(boton().textContent).toBe('Todas las vacunas')
    abrir()
    marcar('Neumococo')
    expect(boton().textContent).toBe('Neumococo')
    marcar('Hexavalente')
    expect(boton().textContent).toBe('2 vacunas')
    marcar('Rotavirus')
    expect(boton().textContent).toBe('3 vacunas')
  })

  test('marca y desmarca, en el orden de las opciones, y el menú sigue abierto', () => {
    const alCambiar = montar()
    abrir()
    marcar('Rotavirus')
    marcar('Hexavalente')
    expect(alCambiar).toHaveBeenLastCalledWith(['HEXA', 'ROTA'])
    expect(boton().getAttribute('aria-expanded')).toBe('true')
    expect(opcion('Hexavalente').getAttribute('aria-checked')).toBe('true')
    expect(opcion('Neumococo').getAttribute('aria-checked')).toBe('false')
    expect(within(opcion('Hexavalente')).getByRole('checkbox', { hidden: true }).getAttribute('data-state'))
      .toBe('checked')

    marcar('Hexavalente')
    expect(alCambiar).toHaveBeenLastCalledWith(['ROTA'])
    expect(opcion('Hexavalente').getAttribute('aria-checked')).toBe('false')
  })

  test('desmarcar la última vuelve a «Todas las vacunas»', () => {
    const alCambiar = montar(['HEXA'])
    expect(boton().textContent).toBe('Hexavalente')
    abrir()
    marcar('Hexavalente')
    expect(alCambiar).toHaveBeenLastCalledWith([])
    expect(boton().textContent).toBe('Todas las vacunas')
    expect(opcion('Todas las vacunas').getAttribute('aria-checked')).toBe('true')
  })

  test('«Todas las vacunas» vacía la selección', () => {
    const alCambiar = montar(['HEXA', 'NEUMO'])
    abrir()
    expect(opcion('Todas las vacunas').getAttribute('aria-checked')).toBe('false')
    marcar('Todas las vacunas')
    expect(alCambiar).toHaveBeenLastCalledWith([])
    expect(boton().textContent).toBe('Todas las vacunas')
  })

  test('la búsqueda filtra sin mayúsculas ni tildes y deja a la vista la opción fija', () => {
    montar()
    abrir()
    buscar('NEUMÓ')
    expect(within(lista()).getByText('Neumococo')).toBeTruthy()
    expect(within(lista()).queryByText('Hexavalente')).toBeNull()
    expect(within(lista()).getByText('Todas las vacunas')).toBeTruthy()

    buscar('zzz')
    expect(screen.getByText('Ninguna vacuna coincide.')).toBeTruthy()
    expect(within(lista()).getByText('Todas las vacunas')).toBeTruthy()
  })

  test('se marca con el teclado', () => {
    const alCambiar = montar()
    abrir()
    buscar('rota')
    const campo = screen.getByPlaceholderText('Buscar vacuna…')
    // La primera es la opción fija; la flecha baja a Rotavirus.
    fireEvent.keyDown(campo, { key: 'ArrowDown' })
    fireEvent.keyDown(campo, { key: 'Enter' })
    expect(alCambiar).toHaveBeenLastCalledWith(['ROTA'])
    expect(boton().getAttribute('aria-expanded')).toBe('true')
  })

  test('un valor que no está en las opciones se muestra con su código', () => {
    montar(['XX'])
    expect(boton().textContent).toBe('XX')
  })
})
