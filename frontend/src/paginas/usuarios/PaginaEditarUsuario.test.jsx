import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom'
import { toast } from 'sonner'
import { listarEstablecimientos, listarMunicipios } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { cambiarRol, editarEmpleado, listarRoles, obtenerUsuario } from '@/api/usuarios.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEditarUsuario from './PaginaEditarUsuario.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/usuarios.js', () => ({
  obtenerUsuario: vi.fn(),
  listarRoles: vi.fn(),
  cambiarRol: vi.fn(),
  editarEmpleado: vi.fn(),
}))
vi.mock('@/api/catalogos.js', () => ({ listarMunicipios: vi.fn(), listarEstablecimientos: vi.fn() }))

const ROLES = [
  { id: 1, codigo: 'ESTABLECIMIENTO', nombre: 'Personal del establecimiento' },
  { id: 2, codigo: 'REVISOR', nombre: 'Estadígrafa / revisor DDRISS' },
  { id: 3, codigo: 'EPIDEMIOLOGIA', nombre: 'Epidemiología' },
]
const ESTABLECIMIENTOS = [{ id: 7, nombre: 'Centro de Salud Tacaná', municipioId: 7, municipioNombre: 'Tacaná' }]
const MUNICIPIOS = [{ id: 1, nombre: 'San Marcos' }]

const EMPLEADO = {
  id: 108,
  cuiRegistrado: false,
  nombres: 'Ana',
  apellidos: 'López',
  cargo: 'Enfermera',
  correo: null,
  telefono: null,
  establecimientoId: null,
  municipioId: null,
  ddrissId: 1,
  activo: true,
  establecimientoNombre: null,
  municipioNombre: null,
}

// Como PATCH /empleados/{id}: el CUI no vuelve en la respuesta, solo cuiRegistrado.
const responderComoBackend = (empleado) => async (_, { cui, ...cambios }) => ({
  ...empleado,
  ...cambios,
  cuiRegistrado: empleado.cuiRegistrado || cui !== undefined,
})

function cuenta(extra = {}) {
  return {
    id: 8,
    empleadoId: 108,
    nombreUsuario: 'alopez',
    rol: 'REVISOR',
    rolNombre: 'Estadígrafa / revisor DDRISS',
    activo: true,
    debeCambiarContrasena: false,
    ultimoAcceso: null,
    desactivadoEn: null,
    empleado: EMPLEADO,
    ...extra,
  }
}

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos: ['USUARIO_CONSULTAR', 'USUARIO_EDITAR', 'EMPLEADO_EDITAR'],
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

// Data router: el aviso de cambios sin guardar usa useBlocker. `volverA` es lo que manda la lista de Usuarios.
async function abrir(id = 8, { volverA } = {}) {
  guardarSesion(crearSesion())
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorSesion>
            <Outlet />
          </ProveedorSesion>
        ),
        children: [
          { path: '/usuarios/:id/editar', element: <PaginaEditarUsuario /> },
          { path: '/usuarios', element: <h1>Lista de usuarios</h1> },
        ],
      },
    ],
    { initialEntries: [{ pathname: `/usuarios/${id}/editar`, state: volverA ? { volverA } : null }] },
  )
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(obtenerUsuario).toHaveBeenCalled())
  return router
}

const esperarFormulario = () => waitFor(() => expect(screen.getByLabelText(/^Nombres/).disabled).toBe(false))
const escribir = (etiqueta, valor) => fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } })
// Radix Select deja un <select> nativo oculto dentro del formulario; cambiarlo actualiza el valor del Select.
const elegir = (nombre, valor) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: String(valor) } })
const botonGuardar = () => screen.getByRole('button', { name: /^(Guardar cambios|Guardando…)$/ })
const EXITO = 'Se guardaron los cambios de Ana López.'

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  obtenerUsuario.mockResolvedValue(cuenta())
  listarRoles.mockResolvedValue(ROLES)
  listarMunicipios.mockResolvedValue(MUNICIPIOS)
  listarEstablecimientos.mockResolvedValue(ESTABLECIMIENTOS)
  editarEmpleado.mockImplementation(responderComoBackend(EMPLEADO))
  cambiarRol.mockImplementation(async (_, rolId) => cuenta({ rol: ROLES.find((r) => r.id === rolId).codigo }))
})

test('carga los datos de la cuenta en el formulario y pide la cuenta de la ruta', async () => {
  await abrir()
  await esperarFormulario()

  expect(obtenerUsuario).toHaveBeenCalledWith('8')
  expect(listarEstablecimientos).toHaveBeenCalledWith({ activo: true })
  expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')
  expect(screen.getByLabelText(/^Cargo/).value).toBe('Enfermera')
  expect(screen.getByTestId('nombre-usuario').textContent).toBe('alopez')
  expect(document.querySelector('select[name="rol"]').value).toBe('2')
})

test('"Guardar cambios" está habilitado: sin cambios avisa que no hay nada que guardar; con nombres vacíos, marca el error', async () => {
  await abrir()
  await esperarFormulario()
  expect(botonGuardar().disabled).toBe(false)

  fireEvent.click(botonGuardar())
  expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.')
  expect(editarEmpleado).not.toHaveBeenCalled()

  escribir(/^Cargo/, 'Epidemióloga')
  escribir(/^Nombres/, '  ')
  fireEvent.click(botonGuardar())

  expect(screen.getByText('Los nombres son obligatorios.')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByLabelText(/^Nombres/))
  expect(editarEmpleado).not.toHaveBeenCalled()
})

test('un campo cambiado mal escrito muestra su mensaje al salir de él y no deja guardar hasta corregirlo', async () => {
  await abrir()
  await esperarFormulario()

  escribir(/^Nombres/, '123')
  fireEvent.blur(screen.getByLabelText(/^Nombres/))

  expect(screen.getByText('Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.')).toBeTruthy()
  expect(screen.getByLabelText(/^Nombres/).getAttribute('aria-invalid')).toBe('true')
  fireEvent.click(botonGuardar())
  expect(editarEmpleado).not.toHaveBeenCalled()

  escribir(/^Nombres/, 'Ana María')
  expect(screen.queryByText('Los nombres solo pueden tener letras, espacios, apóstrofos y guiones.')).toBeNull()
  fireEvent.click(botonGuardar())
  await waitFor(() => expect(editarEmpleado).toHaveBeenCalledWith(108, { nombres: 'Ana María' }))
})

test('al guardar con varios errores se ven todos y el foco va al primero, aunque no se haya salido de ellos', async () => {
  await abrir()
  await esperarFormulario()

  escribir(/^Teléfono/, '9551')
  escribir(/^Cargo/, '1')
  fireEvent.click(botonGuardar())

  expect(screen.getByText('El cargo solo puede tener letras, espacios y los signos . , ( ) / -.')).toBeTruthy()
  expect(screen.getByText('El teléfono debe tener 8 dígitos y empezar con 2 a 7.')).toBeTruthy()
  expect(document.activeElement).toBe(screen.getByLabelText(/^Cargo/))
  expect(editarEmpleado).not.toHaveBeenCalled()
})

test('un dato viejo mal escrito que no se tocó no impide guardar otro campo', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ empleado: { ...EMPLEADO, telefono: '9999' } }))
  await abrir()
  await esperarFormulario()

  fireEvent.blur(screen.getByLabelText(/^Teléfono/))
  escribir(/^Cargo/, 'Estadígrafa')

  expect(screen.queryByText('El teléfono debe tener 8 dígitos y empezar con 2 a 7.')).toBeNull()
  fireEvent.click(botonGuardar())
  await waitFor(() => expect(editarEmpleado).toHaveBeenCalledWith(108, { cargo: 'Estadígrafa' }))
})

test('el correo es obligatorio solo si el empleado ya tenía uno', async () => {
  await abrir()
  await esperarFormulario()
  expect(document.querySelector('label[for="correo"]').textContent).toBe('Correo')
  cleanup()

  obtenerUsuario.mockResolvedValue(cuenta({ empleado: { ...EMPLEADO, correo: 'ana@gmail.com' } }))
  await abrir()
  await esperarFormulario()
  expect(document.querySelector('label[for="correo"]').textContent).toBe('Correo*')

  escribir(/^Correo/, '')
  fireEvent.blur(screen.getByLabelText(/^Correo/))
  expect(screen.getByText('El correo es obligatorio.')).toBeTruthy()
  fireEvent.click(botonGuardar())
  expect(document.activeElement).toBe(screen.getByLabelText(/^Correo/))
  expect(editarEmpleado).not.toHaveBeenCalled()
})

test('sin CUI registrado, el campo está vacío y es opcional; escrito, se envía como cui', async () => {
  await abrir()
  await esperarFormulario()

  expect(document.querySelector('label[for="cui"]').textContent).toBe('CUI (DPI)')
  expect(screen.getByLabelText(/^CUI/).value).toBe('')
  expect(screen.queryByText('Registrado')).toBeNull()

  escribir(/^CUI/, '1234567880101')
  fireEvent.blur(screen.getByLabelText(/^CUI/))
  expect(screen.getByText('El CUI no es válido; revise los dígitos.')).toBeTruthy()
  fireEvent.click(botonGuardar())
  expect(document.activeElement).toBe(screen.getByLabelText(/^CUI/))
  expect(editarEmpleado).not.toHaveBeenCalled()

  escribir(/^CUI/, '1234 56789 0101')
  fireEvent.click(botonGuardar())
  await waitFor(() => expect(editarEmpleado).toHaveBeenCalledWith(108, { cui: '1234 56789 0101' }))
})

test('si el rol falla después de guardar el CUI, el formulario toma lo guardado: se ve "Registrado" y no el campo', async () => {
  cambiarRol.mockRejectedValueOnce(new ErrorApi(422, 'ROL_INVALIDO', 'El rol no existe.'))
  await abrir()
  await esperarFormulario()

  escribir(/^CUI/, '1234 56789 0101')
  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Registrado')).toBeTruthy()
  expect(screen.queryByLabelText(/^CUI/)).toBeNull()
})

test('con CUI registrado se ve "Registrado"; "Reemplazar CUI" muestra el campo vacío y "Cancelar" lo oculta', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ empleado: { ...EMPLEADO, cuiRegistrado: true } }))
  await abrir()
  await esperarFormulario()

  expect(screen.getByText('Registrado')).toBeTruthy()
  expect(screen.queryByLabelText(/^CUI/)).toBeNull()

  fireEvent.click(screen.getByRole('button', { name: 'Reemplazar CUI' }))
  expect(screen.getByLabelText(/^CUI/).value).toBe('')
  escribir(/^CUI/, '1234567890101')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  expect(screen.queryByLabelText(/^CUI/)).toBeNull()
  expect(screen.getByText('Registrado')).toBeTruthy()
  // Cancelar el reemplazo descarta el CUI escrito: no queda nada que guardar.
  fireEvent.click(botonGuardar())
  expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.')
  expect(editarEmpleado).not.toHaveBeenCalled()

  fireEvent.click(screen.getByRole('button', { name: 'Reemplazar CUI' }))
  expect(screen.getByLabelText(/^CUI/).value).toBe('')
})

test('sin escribir un CUI, editarEmpleado no recibe cui; un 409 CUI_DUPLICADO muestra su mensaje', async () => {
  const conCui = { ...EMPLEADO, cuiRegistrado: true }
  obtenerUsuario.mockResolvedValue(cuenta({ empleado: conCui }))
  editarEmpleado.mockImplementation(responderComoBackend(conCui))
  await abrir()
  await esperarFormulario()

  // Guardar bien lleva a la lista; el 409 se prueba primero, porque deja la pantalla abierta.
  editarEmpleado.mockRejectedValueOnce(new ErrorApi(409, 'CUI_DUPLICADO', 'Ya hay un empleado registrado con ese CUI.'))
  fireEvent.click(screen.getByRole('button', { name: 'Reemplazar CUI' }))
  escribir(/^CUI/, '1234567890101')
  fireEvent.click(botonGuardar())
  expect(await screen.findByText('Ya hay un empleado registrado con ese CUI.')).toBeTruthy()
  expect(screen.getByLabelText(/^CUI/).value).toBe('1234567890101')

  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }))
  escribir(/^Cargo/, 'Estadígrafa')
  fireEvent.click(botonGuardar())
  await waitFor(() => expect(editarEmpleado).toHaveBeenLastCalledWith(108, { cargo: 'Estadígrafa' }))
})

test('cambiar solo el cargo llama solo a editarEmpleado, con { cargo }, avisa con un toast y vuelve a la lista', async () => {
  const router = await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, 'Epidemióloga')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(EXITO))
  expect(editarEmpleado).toHaveBeenCalledWith(108, { cargo: 'Epidemióloga' })
  expect(cambiarRol).not.toHaveBeenCalled()
  // El formulario quedó igual a lo guardado: vuelve sin preguntar por cambios sin guardar.
  expect(await screen.findByRole('heading', { name: 'Lista de usuarios' })).toBeTruthy()
  expect(router.state.location.pathname).toBe('/usuarios')
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('vaciar un campo opcional lo envía como null', async () => {
  await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, '')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(editarEmpleado).toHaveBeenCalledWith(108, { cargo: null }))
})

test('cambiar solo el rol llama solo a cambiarRol', async () => {
  await abrir()
  await esperarFormulario()

  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(EXITO))
  expect(cambiarRol).toHaveBeenCalledWith(8, 3)
  expect(editarEmpleado).not.toHaveBeenCalled()
})

test('el rol de personal del establecimiento sin establecimiento muestra el aviso y no deja guardar', async () => {
  await abrir()
  await esperarFormulario()

  elegir('rol', 1)

  expect(screen.getByText('Para el rol Personal del establecimiento, el empleado debe tener un establecimiento.')).toBeTruthy()
  fireEvent.click(botonGuardar())
  expect(document.activeElement).toBe(document.getElementById('rol'))
  expect(cambiarRol).not.toHaveBeenCalled()
})

test('si falla el rol después del empleado, muestra el aviso parcial y reintentar llama solo a cambiarRol', async () => {
  cambiarRol.mockRejectedValueOnce(new ErrorApi(422, 'ROL_INVALIDO', 'El rol no existe.'))
  await abrir()
  await esperarFormulario()

  escribir(/^Cargo/, 'Epidemióloga')
  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(
    await screen.findByText('Se guardaron los datos de Ana López, pero no se pudo cambiar el rol: El rol no existe.'),
  ).toBeTruthy()
  expect(editarEmpleado).toHaveBeenCalledTimes(1)

  fireEvent.click(botonGuardar())

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith(EXITO))
  expect(editarEmpleado).toHaveBeenCalledTimes(1)
  expect(cambiarRol).toHaveBeenCalledTimes(2)
})

test('si falla el empleado, muestra el mensaje, no intenta el rol y conserva lo escrito', async () => {
  editarEmpleado.mockRejectedValue(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  await esperarFormulario()

  escribir(/^Correo/, 'otra@prueba.local')
  elegir('rol', 3)
  fireEvent.click(botonGuardar())

  expect(await screen.findByText('Ya hay un empleado con ese correo.')).toBeTruthy()
  expect(cambiarRol).not.toHaveBeenCalled()
  expect(screen.getByLabelText(/^Correo/).value).toBe('otra@prueba.local')
})

test('en la cuenta propia el Select de rol está deshabilitado', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ id: 7, nombreUsuario: 'jperez', rol: 'ADMINISTRADOR' }))
  await abrir(7)
  await esperarFormulario()

  expect(document.getElementById('rol').disabled).toBe(true)
  expect(screen.getByText('No puede cambiar su propio rol.')).toBeTruthy()
})

test('una cuenta desactivada muestra el aviso y no el formulario', async () => {
  obtenerUsuario.mockResolvedValue(cuenta({ activo: false }))
  await abrir()

  expect(await screen.findByText('La cuenta alopez está desactivada; restáurela para editarla.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull()
  expect(screen.getByRole('link', { name: 'Volver a Usuarios' })).toBeTruthy()
})

test('si falla la carga, muestra el error y no se puede guardar', async () => {
  obtenerUsuario.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar los datos de la cuenta: El recurso solicitado no existe.')).toBeTruthy()
  expect(botonGuardar().disabled).toBe(true)
})

test('«Reintentar» vuelve a pedir los datos de la cuenta', async () => {
  obtenerUsuario.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await abrir()
  await screen.findByText(/No se pudieron cargar los datos de la cuenta/)

  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  await esperarFormulario()
  expect(obtenerUsuario).toHaveBeenCalledTimes(2)
  expect(screen.getByLabelText(/^Nombres/).value).toBe('Ana')
  expect(screen.queryByText(/No se pudieron cargar los datos de la cuenta/)).toBeNull()
})

test('el error de la API se muestra junto a los botones, debajo del formulario', async () => {
  editarEmpleado.mockRejectedValue(new ErrorApi(409, 'CORREO_DUPLICADO', 'Ya hay un empleado con ese correo.'))
  await abrir()
  await esperarFormulario()

  escribir(/^Correo/, 'otra@prueba.local')
  fireEvent.click(botonGuardar())

  const alerta = (await screen.findByText('Ya hay un empleado con ese correo.')).closest('[role="alert"]')
  expect(alerta.nextElementSibling.contains(botonGuardar())).toBe(true)
})

describe('volver a la lista con sus filtros', () => {
  const volverA = { pathname: '/usuarios', search: '?estado=ACTIVA&pagina=2' }

  test('«Volver a Usuarios» y «Cancelar» llevan a la lista con los filtros; sin ellos, a /usuarios', async () => {
    await abrir(8, { volverA })
    await esperarFormulario()
    expect(screen.getByRole('link', { name: 'Volver a Usuarios' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA&pagina=2')
    expect(screen.getByRole('link', { name: 'Cancelar' }).getAttribute('href')).toBe('/usuarios?estado=ACTIVA&pagina=2')
    cleanup()

    await abrir()
    await esperarFormulario()
    expect(screen.getByRole('link', { name: 'Cancelar' }).getAttribute('href')).toBe('/usuarios')
  })

  test('después de guardar vuelve a la lista con los filtros', async () => {
    const router = await abrir(8, { volverA })
    await esperarFormulario()

    escribir(/^Cargo/, 'Epidemióloga')
    fireEvent.click(botonGuardar())

    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
    expect(router.state.location.search).toBe('?estado=ACTIVA&pagina=2')
  })

  test('una cuenta desactivada también vuelve con los filtros', async () => {
    obtenerUsuario.mockResolvedValue(cuenta({ activo: false }))
    await abrir(8, { volverA })

    expect((await screen.findByRole('link', { name: 'Volver a Usuarios' })).getAttribute('href')).toBe(
      '/usuarios?estado=ACTIVA&pagina=2',
    )
  })
})

describe('cambios sin guardar', () => {
  test('sin cambios, «Cancelar» sale sin preguntar', async () => {
    const router = await abrir()
    await esperarFormulario()

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))

    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })

  test('con cambios pide confirmación: «Seguir editando» se queda con lo escrito y «Salir sin guardar» sale', async () => {
    const router = await abrir()
    await esperarFormulario()
    escribir(/^Cargo/, 'Epidemióloga')

    fireEvent.click(screen.getByRole('link', { name: 'Volver a Usuarios' }))
    const dialogo = await screen.findByRole('alertdialog')
    expect(dialogo.textContent).toContain('Si sale ahora, se pierden los cambios que no guardó.')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(router.state.location.pathname).toBe('/usuarios/8/editar')
    expect(screen.getByLabelText(/^Cargo/).value).toBe('Epidemióloga')

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Salir sin guardar' }))
    await waitFor(() => expect(router.state.location.pathname).toBe('/usuarios'))
    expect(editarEmpleado).not.toHaveBeenCalled()
  })

  test('cambiar solo el rol también cuenta como cambio sin guardar', async () => {
    await abrir()
    await esperarFormulario()
    elegir('rol', 3)

    fireEvent.click(screen.getByRole('link', { name: 'Cancelar' }))
    expect(await screen.findByRole('alertdialog')).toBeTruthy()
  })
})
