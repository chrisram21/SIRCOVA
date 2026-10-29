import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { listarDdriss, listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { crearCuenta, listarRoles, registrarEmpleado } from '@/api/usuarios.js'
import PaginaRegistrarPersonal from './PaginaRegistrarPersonal.jsx'

vi.mock('@/api/usuarios.js', () => ({ registrarEmpleado: vi.fn(), crearCuenta: vi.fn(), listarRoles: vi.fn() }))
vi.mock('@/api/catalogos.js', () => ({
  listarDdriss: vi.fn(),
  listarMunicipios: vi.fn(),
  listarEstablecimientos: vi.fn(),
}))

const ROLES = [
  { id: 1, codigo: 'ESTABLECIMIENTO', nombre: 'Personal del establecimiento' },
  { id: 2, codigo: 'REVISOR', nombre: 'Estadígrafa / revisor DDRISS' },
]
const ESTABLECIMIENTOS = [{ id: 7, nombre: 'Centro de Salud Tacaná', municipioId: 7, municipioNombre: 'Tacaná' }]
const MUNICIPIOS = [{ id: 1, nombre: 'San Marcos' }]

// Data router: el aviso de cambios sin guardar usa useBlocker. `volverA` es lo que manda la lista de Usuarios.
function montar({ volverA } = {}) {
  const router = createMemoryRouter(
    [
      { path: '/usuarios/nuevo', element: <PaginaRegistrarPersonal /> },
      { path: '/usuarios', element: <h1>Lista de usuarios</h1> },
    ],
    { initialEntries: [{ pathname: '/usuarios/nuevo', state: volverA ? { volverA } : null }] },
  )
  render(<RouterProvider router={router} />)
  return router
}

async function abrir(opciones) {
  const router = montar(opciones)
  await waitFor(() => expect(screen.getByLabelText(/^Nombres/).disabled).toBe(false))
  return router
}

const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
// Radix Select deja un <select> nativo oculto dentro del formulario; cambiarlo actualiza el valor del Select.
const elegir = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })
const botonRegistrar = () => screen.getByRole('button', { name: /^(Registrar|Crear cuenta|Registrando…)$/ })
const campo = (etiqueta) => screen.getByLabelText(etiqueta)

function llenarEmpleado() {
  escribir(/^Nombres/, 'Ana')
  escribir(/^Apellidos/, 'López')
  escribir(/^Correo/, 'ana.lopez@gmail.com')
  escribir(/^CUI/, CUI)
}

function llenarCuenta({ rolId = 2 } = {}) {
  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))
  escribir(/^Nombre de usuario/, 'alopez')
  elegir('rol', rolId)
}

const CONTRASENA_GENERADA = 'Hk7pQ2xYz9Ab'
// Ficticio: cumple el dígito verificador (ver validaciones/campos.test.js).
const CUI = '1234 56789 0101'

// El diálogo de la contraseña temporal se cierra con "Ya la anoté"; después sigue el éxito de siempre.
async function cerrarDialogoContrasena() {
  const dialogo = await screen.findByRole('alertdialog')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Ya la anoté' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
  listarDdriss.mockResolvedValue([{ id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos', departamentoId: 12 }])
  listarRoles.mockResolvedValue(ROLES)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarEstablecimientos.mockResolvedValue(ESTABLECIMIENTOS)
  registrarEmpleado.mockResolvedValue({ id: 40, nombres: 'Ana', apellidos: 'López', establecimientoId: null })
  crearCuenta.mockResolvedValue({ id: 90, nombreUsuario: 'alopez', contrasenaTemporal: CONTRASENA_GENERADA })
})

test('muestra la DDRISS y las opciones de los Select, y pide solo establecimientos activos', async () => {
  await abrir()

  expect(screen.getByTestId('ddriss').textContent).toBe('DDRISS San Marcos')
  expect(listarEstablecimientos).toHaveBeenCalledWith({ activo: true })
  const establecimientos = [...document.querySelectorAll('select[name="establecimiento"] option')].map((o) => o.textContent)
  expect(establecimientos).toEqual(expect.arrayContaining(['Sin establecimiento (personal de la DDRISS)', 'Centro de Salud Tacaná']))
  const municipios = [...document.querySelectorAll('select[name="municipio"] option')].map((o) => o.textContent)
  expect(municipios).toEqual(expect.arrayContaining(['Sin municipio', 'San Marcos']))

  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))
  const roles = [...document.querySelectorAll('select[name="rol"] option')].map((o) => o.textContent)
  expect(roles).toEqual(expect.arrayContaining(['Personal del establecimiento', 'Estadígrafa / revisor DDRISS']))
})

test('"Registrar" está habilitado; sin nombres, o con cuenta sin nombre de usuario o sin rol, no envía y lleva el foco al error', async () => {
  await abrir()
  expect(botonRegistrar().disabled).toBe(false)

  fireEvent.click(botonRegistrar())
  // Se ven todos los errores a la vez, sin haber salido de los campos.
  expect(screen.getByText('Los nombres son obligatorios.')).toBeTruthy()
  expect(screen.getByText('Los apellidos son obligatorios.')).toBeTruthy()
  expect(screen.getByText('El CUI es obligatorio.')).toBeTruthy()
  expect(screen.getByText('El correo es obligatorio.')).toBeTruthy()
  expect(document.activeElement).toBe(campo(/^Nombres/))
  expect(campo(/^Nombres/).getAttribute('aria-invalid')).toBe('true')

  llenarEmpleado()
  expect(screen.queryByText('Los nombres son obligatorios.')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))
  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(campo(/^Nombre de usuario/))
  expect(screen.getByText('Elija un rol.')).toBeTruthy()
  expect(document.getElementById('rol').getAttribute('aria-invalid')).toBe('true')

  escribir(/^Nombre de usuario/, 'alopez')
  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(document.getElementById('rol'))
  expect(registrarEmpleado).not.toHaveBeenCalled()

  elegir('rol', 2)
  expect(screen.queryByText('Elija un rol.')).toBeNull()
  fireEvent.click(botonRegistrar())
  await waitFor(() => expect(registrarEmpleado).toHaveBeenCalledTimes(1))
})

test('sin correo no se registra, y el correo se marca como obligatorio', async () => {
  await abrir()
  escribir(/^Nombres/, 'Ana')
  escribir(/^Apellidos/, 'López')
  escribir(/^CUI/, CUI)

  expect(document.querySelector('label[for="correo"]').textContent).toBe('Correo*')
  fireEvent.blur(screen.getByLabelText(/^Correo/))
  expect(screen.getByText('El correo es obligatorio.')).toBeTruthy()

  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(campo(/^Correo/))
  expect(registrarEmpleado).not.toHaveBeenCalled()
})

test('un campo mal escrito muestra su mensaje al salir de él o al enviar, y no se registra hasta corregirlo', async () => {
  await abrir()
  llenarEmpleado()
  escribir(/^Nombres/, '123')

  // El mensaje no aparece mientras se escribe por primera vez, solo al salir del campo.
  expect(screen.queryByText('Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.')).toBeNull()

  fireEvent.blur(screen.getByLabelText(/^Nombres/))
  const mensaje = screen.getByText('Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.')
  const campo = screen.getByLabelText(/^Nombres/)
  expect(campo.getAttribute('aria-invalid')).toBe('true')
  expect(campo.getAttribute('aria-describedby')).toBe(mensaje.id)

  escribir(/^Nombres/, "María de los Ángeles B'alam")
  expect(screen.queryByText('Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.')).toBeNull()
  expect(campo.getAttribute('aria-invalid')).toBeNull()

  // Sin salir del teléfono, el envío muestra su error y le pone el foco.
  escribir(/^Teléfono/, '9551-1001')
  fireEvent.click(botonRegistrar())
  expect(screen.getByText('El teléfono debe tener 8 dígitos y empezar con 2 a 7.')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByLabelText(/^Teléfono/))
  expect(registrarEmpleado).not.toHaveBeenCalled()

  escribir(/^Teléfono/, '+502 5551 1001')
  fireEvent.click(botonRegistrar())
  await waitFor(() => expect(registrarEmpleado).toHaveBeenCalledTimes(1))
})

test('el nombre de usuario se pasa a minúsculas y uno inválido muestra su mensaje y no deja registrar', async () => {
  await abrir()
  llenarEmpleado()
  llenarCuenta()

  escribir(/^Nombre de usuario/, 'ALopez')
  expect(screen.getByLabelText(/^Nombre de usuario/).value).toBe('alopez')

  escribir(/^Nombre de usuario/, 'ana lópez')
  fireEvent.blur(screen.getByLabelText(/^Nombre de usuario/))
  expect(
    screen.getByText(
      'El nombre de usuario debe tener de 4 a 50 caracteres: minúsculas, números, punto, guion o guion bajo.',
    ),
  ).toBeTruthy()
  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(screen.getByLabelText(/^Nombre de usuario/))
  expect(registrarEmpleado).not.toHaveBeenCalled()
})

test('el CUI es obligatorio, explica para qué se usa y reemplaza al código de empleado', async () => {
  await abrir()

  expect(screen.queryByLabelText(/Código de empleado/)).toBeNull()
  const campo = screen.getByLabelText(/^CUI \(DPI\)/)
  expect(document.querySelector('label[for="cui"]').textContent).toBe('CUI (DPI)*')
  expect(campo.getAttribute('inputmode')).toBe('numeric')
  expect(document.getElementById(campo.getAttribute('aria-describedby')).textContent).toBe(
    'Se usa solo para evitar registros repetidos; el sistema no lo muestra después.',
  )

  llenarEmpleado()
  escribir(/^CUI/, '')
  fireEvent.blur(campo)
  expect(screen.getByText('El CUI es obligatorio.')).toBeTruthy()
  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(campo)
  expect(registrarEmpleado).not.toHaveBeenCalled()
})

test('un CUI con el dígito verificador mal muestra su mensaje y no deja registrar', async () => {
  await abrir()
  llenarEmpleado()

  escribir(/^CUI/, '1234 56788 0101')
  fireEvent.blur(screen.getByLabelText(/^CUI/))

  expect(screen.getByText('El CUI no es válido; revise los dígitos.')).toBeTruthy()
  fireEvent.click(botonRegistrar())
  expect(registrarEmpleado).not.toHaveBeenCalled()

  escribir(/^CUI/, '1234-56789-0101')
  expect(screen.queryByText('El CUI no es válido; revise los dígitos.')).toBeNull()
  fireEvent.click(botonRegistrar())
  await waitFor(() => expect(registrarEmpleado).toHaveBeenCalledTimes(1))
})

test('un 409 CUI_DUPLICADO muestra el mensaje del backend', async () => {
  registrarEmpleado.mockRejectedValueOnce(new ErrorApi(409, 'CUI_DUPLICADO', 'Ya hay un empleado registrado con ese CUI.'))
  await abrir()
  llenarEmpleado()

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Ya hay un empleado registrado con ese CUI.')).toBeTruthy()
  expect(registrarEmpleado.mock.calls[0][0]).not.toHaveProperty('codigoEmpleado')
})

test('la cuenta ya no tiene campos de contraseña: la genera el sistema', async () => {
  await abrir()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }))

  expect(screen.queryByLabelText(/Contraseña/)).toBeNull()
  expect(document.querySelector('input[type="password"]')).toBeNull()
  expect(screen.getByText(/El sistema genera la contraseña temporal/)).toBeTruthy()
})

test('el rol de personal del establecimiento sin establecimiento muestra el aviso y no deja enviar', async () => {
  await abrir()
  llenarEmpleado()
  llenarCuenta({ rolId: 1 })

  expect(screen.getByText(/Para el rol Personal del establecimiento, el empleado debe tener un establecimiento/)).toBeTruthy()
  fireEvent.click(botonRegistrar())
  expect(document.activeElement).toBe(document.getElementById('rol'))
  expect(registrarEmpleado).not.toHaveBeenCalled()

  elegir('establecimiento', 7)
  expect(screen.queryByText(/Para el rol Personal del establecimiento/)).toBeNull()
  fireEvent.click(botonRegistrar())
  await waitFor(() => expect(registrarEmpleado).toHaveBeenCalledTimes(1))
})

test('con establecimiento no aparece el Select de municipio y se muestra el del establecimiento', async () => {
  await abrir()
  elegir('establecimiento', 7)

  expect(document.querySelector('select[name="municipio"]')).toBeNull()
  expect(screen.getByTestId('municipio-establecimiento').textContent).toBe('Tacaná')
})

test('sin cuenta, solo registra al empleado y muestra el éxito', async () => {
  await abrir()
  llenarEmpleado()
  escribir(/^Cargo/, '  Enfermera  ')
  elegir('municipio', 1)

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Se registró a Ana López.')).toBeTruthy()
  expect(registrarEmpleado).toHaveBeenCalledWith({
    nombres: 'Ana', apellidos: 'López', cui: CUI, cargo: 'Enfermera', correo: 'ana.lopez@gmail.com', municipioId: 1,
  })
  expect(crearCuenta).not.toHaveBeenCalled()
  expect(screen.queryByText(/Se creó la cuenta/)).toBeNull()
})

test('con cuenta, registra al empleado, crea la cuenta con su id y muestra los dos mensajes', async () => {
  await abrir()
  llenarEmpleado()
  elegir('establecimiento', 7)
  llenarCuenta()

  fireEvent.click(botonRegistrar())

  const dialogo = await screen.findByRole('alertdialog')
  expect(within(dialogo).getByTestId('contrasena-temporal').textContent).toBe(CONTRASENA_GENERADA)
  expect(dialogo.textContent).toContain('alopez')
  expect(screen.queryByText('Se creó la cuenta alopez.')).toBeNull()
  expect(registrarEmpleado).toHaveBeenCalledWith({
    nombres: 'Ana', apellidos: 'López', cui: CUI, correo: 'ana.lopez@gmail.com', establecimientoId: 7,
  })
  expect(crearCuenta).toHaveBeenCalledWith({ empleadoId: 40, nombreUsuario: 'alopez', rolId: 2 })

  await cerrarDialogoContrasena()

  expect(screen.getByText('Se creó la cuenta alopez.')).toBeTruthy()
  expect(screen.getByText('Se registró a Ana López.')).toBeTruthy()
  expect(document.body.textContent).not.toContain(CONTRASENA_GENERADA)
  expect(JSON.stringify({ ...sessionStorage })).not.toContain(CONTRASENA_GENERADA)
  expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios')
})

test('si falla la cuenta, muestra el aviso parcial y "Crear cuenta" reintenta solo la cuenta', async () => {
  crearCuenta.mockRejectedValueOnce(new ErrorApi(409, 'NOMBRE_USUARIO_DUPLICADO', 'Ya existe ese nombre de usuario.'))
  await abrir()
  llenarEmpleado()
  llenarCuenta()

  fireEvent.click(botonRegistrar())

  expect(
    await screen.findByText('Se registró a Ana López, pero no se pudo crear la cuenta: Ya existe ese nombre de usuario.'),
  ).toBeTruthy()
  expect(screen.queryByLabelText(/^Nombres/)).toBeNull()
  expect(screen.queryByRole('alertdialog')).toBeNull()

  escribir(/^Nombre de usuario/, 'alopez2')
  fireEvent.click(screen.getByRole('button', { name: 'Crear cuenta' }))

  await cerrarDialogoContrasena()
  expect(screen.getByText('Se creó la cuenta alopez.')).toBeTruthy()
  expect(registrarEmpleado).toHaveBeenCalledTimes(1)
  expect(crearCuenta).toHaveBeenCalledTimes(2)
  expect(crearCuenta).toHaveBeenLastCalledWith(expect.objectContaining({ empleadoId: 40, nombreUsuario: 'alopez2' }))
})

test('un 409 del empleado muestra su mensaje y conserva lo escrito', async () => {
  registrarEmpleado.mockRejectedValueOnce(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  llenarEmpleado()

  fireEvent.click(botonRegistrar())

  expect(await screen.findByText('Ya hay un empleado con ese correo.')).toBeTruthy()
  expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')
  expect(crearCuenta).not.toHaveBeenCalled()
})

test('si falla un catálogo, muestra el error y no se puede enviar; «Reintentar» lo vuelve a pedir', async () => {
  listarRoles.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  montar()

  expect(await screen.findByText(/No se pudieron cargar los datos del formulario: No se pudo conectar/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText(/^Nombres/), { target: { value: 'Ana' } })
  expect(botonRegistrar().disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(screen.getByLabelText(/^Nombres/).disabled).toBe(false))
  expect(listarRoles).toHaveBeenCalledTimes(2)
  expect(screen.queryByText(/No se pudieron cargar los datos del formulario/)).toBeNull()
  expect(botonRegistrar().disabled).toBe(false)
})

test('"Registrar otro" vacía el formulario', async () => {
  await abrir()
  llenarEmpleado()
  fireEvent.click(botonRegistrar())
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar otro' }))

  expect(screen.getByLabelText(/^Nombres/).value).toBe('')
  expect(screen.getByLabelText(/^Apellidos/).value).toBe('')
  expect(screen.getByRole('checkbox', { name: 'Crear cuenta de acceso' }).getAttribute('aria-checked')).toBe('false')
})

test('el error de la API se muestra junto a los botones, debajo del formulario', async () => {
  registrarEmpleado.mockRejectedValueOnce(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  llenarEmpleado()

  fireEvent.click(botonRegistrar())

  const alerta = (await screen.findByText('Ya hay un empleado con ese correo.')).closest('[role="alert"]')
  // El aviso va justo antes de la fila de botones.
  expect(alerta.nextElementSibling.contains(botonRegistrar())).toBe(true)
})

describe('volver a la lista', () => {
  const volverA = { pathname: '/usuarios', search: '?estado=ACTIVA&pagina=2' }

  test('«Volver a Usuarios» y «Cancelar» conservan los filtros de la lista; sin ellos, van a /usuarios', async () => {
    await abrir({ volverA })
    expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA&pagina=2')
    expect(screen.getByRole('link', { name: 'Cancelar' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA&pagina=2')
  })

  test('después de registrar, «Volver a Usuarios» conserva los filtros', async () => {
    await abrir({ volverA })
    llenarEmpleado()
    fireEvent.click(botonRegistrar())

    await screen.findByText('Se registró a Ana López.')
    expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA&pagina=2')
  })
})

describe('cambios sin guardar', () => {
  test('sin escribir nada, «Cancelar» sale sin preguntar', async () => {
    const router = await abrir()
    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('con datos escritos pide confirmación: «Seguir editando» se queda y «Salir sin guardar» sale', async () => {
    const router = await abrir()
    escribir(/^Nombres/, 'Ana')

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si sale ahora, se pierden los datos que escribió.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/usuarios/nuevo')
    expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
  })

  test('después de registrar, «Volver a Usuarios» sale sin preguntar', async () => {
    const router = await abrir()
    llenarEmpleado()
    fireEvent.click(botonRegistrar())
    await screen.findByText('Se registró a Ana López.')

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Usuarios' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})
