import { render, screen } from '@testing-library/react'
import MarcaPreliminar, { TEXTO_PRELIMINAR } from './MarcaPreliminar.jsx'

test('sin activa deja el contenido como está, sin marca ni texto para lectores', () => {
  const { container } = render(
    <MarcaPreliminar activa={false}>
      <p>Gráfica</p>
    </MarcaPreliminar>,
  )
  expect(container.innerHTML).toBe('<p>Gráfica</p>')
  expect(container.querySelector('[data-marca="preliminar"]')).toBeNull()
  expect(screen.queryByText(TEXTO_PRELIMINAR)).toBeNull()
})

test('con activa pone encima del contenido la marca oculta a los lectores y les deja el aviso en texto', () => {
  const { container } = render(
    <MarcaPreliminar activa>
      <p>Gráfica</p>
    </MarcaPreliminar>,
  )
  const marca = container.querySelector('[data-marca="preliminar"]')
  expect(marca.getAttribute('aria-hidden')).toBe('true')
  // Una copia siempre visible y cuatro que index.css muestra según la proporción de la capa.
  expect([...marca.children].map((c) => [c.textContent, c.dataset.copia ?? null])).toEqual([
    ['PRELIMINAR', null], ['PRELIMINAR', '2'], ['PRELIMINAR', '3'], ['PRELIMINAR', '4'], ['PRELIMINAR', '5'],
  ])
  expect(marca.querySelectorAll('.marca-copia').length).toBe(4)
  expect(marca.className).toContain('pointer-events-none')
  expect(screen.getByText('Gráfica')).not.toBeNull()
  expect(screen.getByText(TEXTO_PRELIMINAR).className).toContain('sr-only')
})
