import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { cambiarContrasena, cerrarSesion } from '@/api/auth.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import { cargarEvaluador, MOTIVOS } from '@/componentes/contrasena/politicaContrasena.js'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), cambiarContrasena: vi.fn() }))
// El evaluador real, envuelto para poder hacerlo fallar en una prueba.
vi.mock('@/componentes/contrasena/politicaContrasena.js', async (importOriginal) => {
  const original = await importOriginal()
  return { ...original, cargarEvaluador: vi.fn(original.cargarEvaluador) }
})

const ACTUAL = 'caballo bateria grapa correcta'
const NUEVA = 'tucan violeta grapa nube'

function crearSesion(debeCambiarContrasena) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'REVISOR',
      rolNombre: 'Revisor',
      permisos: [],
      debeCambiarContrasena,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function abrir(ruta, { debeCambiar = true } = {}) {
  guardarSesion(crearSesion(debeCambiar))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <App />
      </ProveedorSesion>
    </MemoryRouter>,
  )
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
// El menú de la cuenta también tiene "Cambiar contraseña"; este es el que envía el formulario.
const botonEnviar = () => screen.getAllByRole('button', { name: /Cambiar contraseña|Cambiando…/ }).find((b) => b.type === 'submit')
const campo = (etiqueta) => screen.getByLabelText(etiqueta)

async function llenar({ actual = ACTUAL, nueva = NUEVA, confirmacion = nueva } = {}) {
  escribir('Contraseña actual', actual)
  escribir('Contraseña nueva', nueva)
  escribir('Confirmar contraseña nueva', confirmacion)
  // La primera vez, zxcvbn carga sus diccionarios y tarda más que el segundo por defecto de findBy.
  await screen.findByText(/Fortaleza:/, {}, { timeout: 5000 })
}

beforeEach(() => {
  sessionStorage.clear()
  cambiarContrasena.mockReset()
  cerrarSesion.mockReset()
  cerrarSesion.mockResolvedValue(null)
})

test('con el cambio obligatorio se muestra sola, sin menú, con el aviso y "Cerrar sesión"', () => {
  abrir('/cuenta/contrasena')

  expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeTruthy()
  expect(screen.getByText('Debe cambiar la contraseña temporal que le dieron antes de continuar.')).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'Menú principal' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Cancelar' })).toBeNull()
})

test('sin escribir nada no hay medidor; el botón está habilitado y al enviar marca los tres campos y enfoca el primero', () => {
  abrir('/cuenta/contrasena')

  expect(screen.queryByText(/Fortaleza:/)).toBeNull()
  expect(botonEnviar().disabled).toBe(false)

  fireEvent.click(botonEnviar())

  expect(screen.getByText('Escriba su contraseña actual.')).toBeTruthy()
  expect(screen.getByText('Escriba la contraseña nueva.')).toBeTruthy()
  expect(screen.getByText('Confirme la contraseña nueva.')).toBeTruthy()
  expect(campo('Contraseña actual').getAttribute('aria-invalid')).toBe('true')
  expect(document.activeElement).toBe(campo('Contraseña actual'))
  expect(cambiarContrasena).not.toHaveBeenCalled()
})

test('un campo vacío se marca al salir de él', () => {
  abrir('/cuenta/contrasena')

  fireEvent.blur(campo('Contraseña actual'))

  expect(screen.getByText('Escriba su contraseña actual.')).toBeTruthy()
  expect(screen.queryByText('Escriba la contraseña nueva.')).toBeNull()
})

test('con la nueva débil, el medidor muestra los motivos y al enviar el foco va a la nueva', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ nueva: 'perez2026' })

  expect(screen.getByText(MOTIVOS.corta)).toBeTruthy()
  expect(screen.getByText(MOTIVOS.nombre)).toBeTruthy()
  fireEvent.click(botonEnviar())
  expect(document.activeElement).toBe(campo('Contraseña nueva'))
  expect(campo('Contraseña nueva').getAttribute('aria-invalid')).toBe('true')
  expect(cambiarContrasena).not.toHaveBeenCalled()
})

test('con la nueva igual a la actual, agrega el motivo y no deja enviar', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ nueva: ACTUAL })

  expect(screen.getByText('Debe ser distinta de la actual.')).toBeTruthy()
  fireEvent.click(botonEnviar())
  expect(cambiarContrasena).not.toHaveBeenCalled()
})

test('si la confirmación no coincide, lo dice, no deja enviar y el foco va a la confirmación', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ confirmacion: 'otra cosa distinta' })

  expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy()
  fireEvent.click(botonEnviar())
  expect(document.activeElement).toBe(campo('Confirmar contraseña nueva'))
  expect(cambiarContrasena).not.toHaveBeenCalled()
})

test('si no carga el medidor, no deja enviar y «Reintentar» lo vuelve a pedir', async () => {
  cargarEvaluador.mockRejectedValueOnce(new Error('sin conexión'))
  abrir('/cuenta/contrasena')

  escribir('Contraseña actual', ACTUAL)
  escribir('Contraseña nueva', NUEVA)
  escribir('Confirmar contraseña nueva', NUEVA)
  expect(await screen.findByText('No se pudo cargar el medidor de contraseñas.')).toBeTruthy()
  fireEvent.click(botonEnviar())
  expect(cambiarContrasena).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByText('Fortaleza: Muy fuerte')).toBeTruthy()
  expect(screen.queryByText('No se pudo cargar el medidor de contraseñas.')).toBeNull()
})

test('un envío válido cambia la contraseña, cierra la sesión sin logout y muestra el aviso en el login', async () => {
  cambiarContrasena.mockResolvedValue(null)
  abrir('/cuenta/contrasena')
  await llenar()

  expect(screen.getByText('Fortaleza: Muy fuerte')).toBeTruthy()
  expect(botonEnviar().disabled).toBe(false)
  fireEvent.click(botonEnviar())

  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(cambiarContrasena).toHaveBeenCalledWith({ contrasenaActual: ACTUAL, contrasenaNueva: NUEVA })
  expect(screen.getByText('Su contraseña se cambió. Inicie sesión con la nueva.')).toBeTruthy()
  expect(sessionStorage.getItem('sircova.sesion')).toBeNull()
  expect(cerrarSesion).not.toHaveBeenCalled()
})

test('si el backend responde 422, muestra el mensaje y conserva lo escrito', async () => {
  cambiarContrasena.mockRejectedValue(
    new ErrorApi(422, 'CONTRASENA_ACTUAL_INCORRECTA', 'La contraseña actual no es correcta.'),
  )
  abrir('/cuenta/contrasena')
  await llenar()

  fireEvent.click(botonEnviar())

  const alerta = (await screen.findByText('La contraseña actual no es correcta.')).closest('[role="alert"]')
  // El error va justo encima de los botones.
  expect(alerta.nextElementSibling.contains(botonEnviar())).toBe(true)
  expect(screen.getByLabelText('Contraseña actual').value).toBe(ACTUAL)
  expect(screen.getByLabelText('Contraseña nueva').value).toBe(NUEVA)
  expect(sessionStorage.getItem('sircova.sesion')).not.toBeNull()
})

test('en el cambio obligatorio, "Cerrar sesión" cierra con MANUAL y lleva al login', async () => {
  abrir('/cuenta/contrasena')

  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

  expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeTruthy()
  expect(cerrarSesion).toHaveBeenCalledWith('MANUAL')
})

test('sin el cambio obligatorio se muestra dentro del Layout y "Cancelar" vuelve a /inicio', async () => {
  abrir('/cuenta/contrasena', { debeCambiar: false })

  expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'Cambiar contraseña' })).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))

  await waitFor(() => expect(screen.queryByLabelText('Contraseña actual')).toBeNull())
  expect(screen.getByRole('navigation', { name: 'Menú principal' })).toBeTruthy()
})
