import { render, screen } from '@testing-library/react'
import BotonAplicarFiltros from './BotonAplicarFiltros.jsx'

test('sin pendiente es el botón de siempre, sin aviso ni ámbar', () => {
  render(<BotonAplicarFiltros pendiente={false}>Generar</BotonAplicarFiltros>)

  const boton = screen.getByRole('button', { name: 'Generar' })
  expect(boton.getAttribute('type')).toBe('submit')
  expect(boton.className).not.toContain('bg-cambio-pendiente')
  expect(boton.getAttribute('aria-describedby')).toBeNull()
  expect(screen.queryByText('Filtros sin aplicar')).toBeNull()
})

test('con pendiente va en ámbar, con "Filtros sin aplicar" en aria-describedby y el mismo nombre', () => {
  render(<BotonAplicarFiltros pendiente>Aplicar</BotonAplicarFiltros>)

  const boton = screen.getByRole('button', { name: 'Aplicar' })
  expect(boton.className).toContain('bg-cambio-pendiente')
  const aviso = screen.getByText('Filtros sin aplicar')
  expect(aviso.id).toBeTruthy()
  expect(boton.getAttribute('aria-describedby')).toBe(aviso.id)
})

test('la clase que recibe va en el contenedor del botón y el aviso', () => {
  render(
    <BotonAplicarFiltros pendiente className="sm:ml-auto">
      Generar
    </BotonAplicarFiltros>,
  )
  expect(screen.getByRole('button', { name: 'Generar' }).parentElement.className).toContain('sm:ml-auto')
})
