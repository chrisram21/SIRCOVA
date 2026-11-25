import { render, screen } from '@testing-library/react'
import ContenedorFormulario from './ContenedorFormulario.jsx'

test.each([
  ['xl', 'max-w-xl'],
  ['3xl', 'max-w-3xl'],
  ['4xl', 'max-w-4xl'],
  ['5xl', 'max-w-5xl'],
  ['6xl', 'max-w-6xl'],
])('con ancho %s es una section centrada con %s', (ancho, clase) => {
  render(
    <ContenedorFormulario ancho={ancho} aria-label="Formulario">
      <p>Contenido</p>
    </ContenedorFormulario>,
  )
  const seccion = screen.getByRole('region', { name: 'Formulario' })
  expect(seccion.tagName).toBe('SECTION')
  expect(seccion.className.split(' ')).toEqual(expect.arrayContaining(['mx-auto', 'w-full', clase]))
  expect(seccion.textContent).toBe('Contenido')
})

test('pasa los demás atributos y suma la clase que recibe', () => {
  render(
    <ContenedorFormulario ancho="3xl" aria-label="Datos" aria-busy="true" className="pb-10">
      <p>Contenido</p>
    </ContenedorFormulario>,
  )
  const seccion = screen.getByRole('region', { name: 'Datos' })
  expect(seccion.getAttribute('aria-busy')).toBe('true')
  expect(seccion.className).toContain('pb-10')
})
