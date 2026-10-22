import { act, fireEvent, render, screen } from '@testing-library/react'
import DialogoContrasenaTemporal from './DialogoContrasenaTemporal.jsx'

const CONTRASENA = 'Hk7pQ2xYz9Ab'

function abrir(alCerrar = vi.fn()) {
  render(<DialogoContrasenaTemporal nombreUsuario="alopez" contrasena={CONTRASENA} alCerrar={alCerrar} />)
  return alCerrar
}

function simularPortapapeles(writeText) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

afterEach(() => {
  delete navigator.clipboard
  vi.useRealTimers()
})

test('muestra el usuario, la contraseña y el aviso de que no se volverá a mostrar', () => {
  abrir()

  const dialogo = screen.getByRole('alertdialog')
  expect(dialogo.textContent).toContain('alopez')
  expect(screen.getByTestId('contrasena-temporal').textContent).toBe(CONTRASENA)
  expect(dialogo.textContent).toContain(
    'Esta contraseña no se volverá a mostrar. Entréguela a la persona de forma segura; deberá cambiarla al iniciar sesión.',
  )
})

test('"Copiar" la copia al portapapeles, dice "Copiada" y vuelve a "Copiar" a los 2 segundos', async () => {
  vi.useFakeTimers()
  const writeText = vi.fn(async () => {})
  simularPortapapeles(writeText)
  abrir()

  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar' })))

  expect(writeText).toHaveBeenCalledWith(CONTRASENA)
  expect(screen.getByRole('button', { name: 'Copiada' })).toBeTruthy()
  act(() => vi.advanceTimersByTime(2000))
  expect(screen.getByRole('button', { name: 'Copiar' })).toBeTruthy()
})

test('si el portapapeles falla o no existe, dice "No se pudo copiar"', async () => {
  simularPortapapeles(vi.fn(async () => Promise.reject(new Error('sin permiso'))))
  abrir()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar' })))
  expect(screen.getByRole('button', { name: 'No se pudo copiar' })).toBeTruthy()
})

test('sin navigator.clipboard (sin HTTPS) también dice "No se pudo copiar"', async () => {
  abrir()
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Copiar' })))
  expect(screen.getByRole('button', { name: 'No se pudo copiar' })).toBeTruthy()
})

test('"Ya la anoté" llama a alCerrar y Escape no lo cierra', () => {
  const alCerrar = abrir()

  fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' })
  expect(alCerrar).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Ya la anoté' }))
  expect(alCerrar).toHaveBeenCalledTimes(1)
})
