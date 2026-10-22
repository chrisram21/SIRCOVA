import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import App from '@/App.jsx'
import { cambiarContrasena, cerrarSesion } from '@/api/auth.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import { MOTIVOS } from '@/componentes/contrasena/politicaContrasena.js'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn(), cambiarContrasena: vi.fn() }))

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
// El encabezado también tiene un botón "Cambiar contraseña"; este es el que envía el formulario.
const botonEnviar = () => screen.getAllByRole('button', { name: /Cambiar contraseña|Cambiando…/ }).find((b) => b.type === 'submit')

async function llenar({ actual = ACTUAL, nueva = NUEVA, confirmacion = nueva } = {}) {
  escribir('Contraseña actual', actual)
  escribir('Contraseña nueva', nueva)
  escribir('Confirmar contraseña nueva', confirmacion)
  await screen.findByText(/Fortaleza:/)
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

test('sin escribir la nueva no hay medidor y el botón está deshabilitado', () => {
  abrir('/cuenta/contrasena')

  expect(screen.queryByText(/Fortaleza:/)).toBeNull()
  expect(botonEnviar().disabled).toBe(true)
})

test('con la nueva débil, el medidor muestra los motivos y el botón sigue deshabilitado', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ nueva: 'perez2026' })

  expect(screen.getByText(MOTIVOS.corta)).toBeTruthy()
  expect(screen.getByText(MOTIVOS.nombre)).toBeTruthy()
  expect(botonEnviar().disabled).toBe(true)
})

test('con la nueva igual a la actual, agrega el motivo y no deja enviar', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ nueva: ACTUAL })

  expect(screen.getByText('Debe ser distinta de la actual.')).toBeTruthy()
  expect(botonEnviar().disabled).toBe(true)
})

test('si la confirmación no coincide, lo dice y no deja enviar', async () => {
  abrir('/cuenta/contrasena')

  await llenar({ confirmacion: 'otra cosa distinta' })

  expect(screen.getByText('Las contraseñas no coinciden.')).toBeTruthy()
  expect(botonEnviar().disabled).toBe(true)
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

  expect(await screen.findByText('La contraseña actual no es correcta.')).toBeTruthy()
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
