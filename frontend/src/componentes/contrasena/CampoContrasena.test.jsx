import { fireEvent, render, screen } from '@testing-library/react'
import { Label } from '@/components/ui/label'
import CampoContrasena from './CampoContrasena.jsx'

function montar(alEnviar = vi.fn()) {
  render(
    <form onSubmit={alEnviar}>
      <Label htmlFor="nueva">Contraseña nueva</Label>
      <CampoContrasena id="nueva" defaultValue="secreta" />
    </form>,
  )
  return {
    campo: screen.getByLabelText('Contraseña nueva'),
    boton: screen.getByRole('button', { name: 'Mantener presionado para ver la contraseña' }),
  }
}

test('empieza oculta', () => {
  const { campo } = montar()
  expect(campo.getAttribute('type')).toBe('password')
})

test.each([['pointerUp'], ['pointerLeave'], ['pointerCancel']])(
  'se ve mientras se presiona el botón y se oculta con %s',
  (evento) => {
    const { campo, boton } = montar()

    fireEvent.pointerDown(boton)
    expect(campo.getAttribute('type')).toBe('text')

    fireEvent[evento](boton)
    expect(campo.getAttribute('type')).toBe('password')
  },
)

test('se ve mientras se mantiene Espacio sobre el botón y se oculta al soltarla', () => {
  const { campo, boton } = montar()

  fireEvent.keyDown(boton, { key: ' ' })
  expect(campo.getAttribute('type')).toBe('text')

  fireEvent.keyUp(boton, { key: ' ' })
  expect(campo.getAttribute('type')).toBe('password')
})

test('otra tecla no la muestra', () => {
  const { campo, boton } = montar()

  fireEvent.keyDown(boton, { key: 'Enter' })
  expect(campo.getAttribute('type')).toBe('password')
})

test('el botón no envía el formulario', () => {
  const alEnviar = vi.fn((evento) => evento.preventDefault())
  const { boton } = montar(alEnviar)

  fireEvent.click(boton)
  expect(alEnviar).not.toHaveBeenCalled()
})
