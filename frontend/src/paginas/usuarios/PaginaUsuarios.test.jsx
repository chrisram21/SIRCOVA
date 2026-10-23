import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import {
  desactivarCuenta,
  desbloquearCuenta,
  listarUsuarios,
  restablecerContrasena,
  restaurarCuenta,
} from '@/api/usuarios.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaUsuarios from './PaginaUsuarios.jsx'
import { paginasVisibles } from './PaginacionUsuarios.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/usuarios.js', () => ({
  listarUsuarios: vi.fn(),
  desactivarCuenta: vi.fn(),
  restaurarCuenta: vi.fn(),
  desbloquearCuenta: vi.fn(),
  restablecerContrasena: vi.fn(),
}))

const TODOS_LOS_PERMISOS = [
  'USUARIO_CONSULTAR',
  'EMPLEADO_CREAR',
  'USUARIO_EDITAR',
  'USUARIO_DESACTIVAR',
  'USUARIO_DESBLOQUEAR',
  'USUARIO_RESTABLECER_CONTRASENA',
]

function cuenta(id, nombreUsuario, extra = {}) {
  return {
    id,
    empleadoId: id + 100,
    nombreUsuario,
    rol: 'REVISOR',
    rolNombre: 'Estadígrafa / revisor DDRISS',
    activo: true,
    debeCambiarContrasena: false,
    bloqueada: false,
    ultimoAcceso: null,
    desactivadoEn: null,
    ...extra,
    empleado: {
      id: id + 100,
      nombres: 'Ana',
      apellidos: nombreUsuario,
      cargo: null,
      establecimientoNombre: null,
      ...extra.empleado,
    },
  }
}

// La cuenta 7 es la de la sesión.
const CUENTAS = [
  cuenta(7, 'jperez', { rol: 'ADMINISTRADOR', rolNombre: 'Administrador' }),
  cuenta(8, 'alopez', { empleado: { cargo: 'Enfermera', establecimientoNombre: 'Centro de Salud Tacaná' } }),
  cuenta(9, 'mruiz', { activo: false, desactivadoEn: '2026-10-21T07:00:00.000Z' }),
  cuenta(10, 'rgomez', { bloqueada: true }),
  cuenta(11, 'tcruz', { activo: false, bloqueada: true, desactivadoEn: '2026-10-21T07:00:00.000Z' }),
]

const respuesta = (elementos, extra = {}) => ({ elementos, total: elementos.length, pagina: 1, porPagina: 20, ...extra })

function crearSesion(permisos) {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'jperez',
      rol: 'ADMINISTRADOR',
      permisos,
      empleado: { nombres: 'Juan', apellidos: 'Pérez', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

// Muestra la cadena de consulta actual, para revisar lo que la página escribe en la URL.
function Ubicacion() {
  return <output data-testid="ubicacion">{useLocation().search}</output>
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

async function abrir(permisos = TODOS_LOS_PERMISOS, ruta = '/usuarios') {
  guardarSesion(crearSesion(permisos))
  render(
    <MemoryRouter initialEntries={[ruta]}>
      <ProveedorSesion>
        <PaginaUsuarios />
        <Ubicacion />
      </ProveedorSesion>
    </MemoryRouter>,
  )
  await waitFor(() => expect(screen.queryByLabelText('Cargando cuentas')).toBeNull())
}

const fila = (nombreUsuario) => screen.getByRole('cell', { name: nombreUsuario }).closest('tr')
const enlacesDe = (nombreUsuario) => within(fila(nombreUsuario)).queryAllByRole('link').map((a) => a.textContent)
const botonMenu = (nombreUsuario) => within(fila(nombreUsuario)).queryByRole('button', { name: 'Más acciones' })

// Radix abre el menú con Enter sobre el botón; su contenido va en un portal, fuera de la fila.
async function abrirMenu(nombreUsuario) {
  fireEvent.keyDown(botonMenu(nombreUsuario), { key: 'Enter' })
  return screen.findByRole('menu')
}

async function opcionesDe(nombreUsuario) {
  if (!botonMenu(nombreUsuario)) return []
  const menu = await abrirMenu(nombreUsuario)
  const opciones = within(menu).getAllByRole('menuitem').map((opcion) => opcion.textContent)
  fireEvent.keyDown(menu, { key: 'Escape' })
  await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  return opciones
}

async function elegir(nombreUsuario, opcion) {
  const menu = await abrirMenu(nombreUsuario)
  fireEvent.click(within(menu).getByRole('menuitem', { name: opcion }))
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  listarUsuarios.mockResolvedValue(respuesta(CUENTAS))
})

test('muestra una fila por cuenta con su estado, el cargo y el establecimiento o "DDRISS"', async () => {
  await abrir()

  expect(screen.getAllByRole('row')).toHaveLength(CUENTAS.length + 1)
  expect(within(fila('alopez')).getByText('Activa')).toBeTruthy()
  expect(within(fila('alopez')).getByText('Enfermera')).toBeTruthy()
  expect(within(fila('alopez')).getByText('Centro de Salud Tacaná')).toBeTruthy()
  expect(within(fila('jperez')).getByText('DDRISS')).toBeTruthy()
  expect(within(fila('mruiz')).getByText('Desactivada')).toBeTruthy()
})

test('Editar queda a la vista; la fila propia no tiene menú y una desactivada solo tiene "Restaurar" en el menú', async () => {
  await abrir()

  expect(enlacesDe('jperez')).toEqual(['Editar'])
  expect(await opcionesDe('jperez')).toEqual([])
  expect(enlacesDe('alopez')).toEqual(['Editar'])
  expect(await opcionesDe('alopez')).toEqual(['Desactivar', 'Restablecer contraseña'])
  expect(enlacesDe('mruiz')).toEqual([])
  expect(await opcionesDe('mruiz')).toEqual(['Restaurar'])
  expect(within(fila('alopez')).getByRole('link', { name: 'Editar' }).getAttribute('href')).toBe('/usuarios/8/editar')
})

test('sin USUARIO_DESACTIVAR no aparecen "Desactivar" ni "Restaurar"', async () => {
  await abrir(['USUARIO_CONSULTAR', 'USUARIO_EDITAR'])
  expect(await opcionesDe('alopez')).toEqual([])
  expect(await opcionesDe('mruiz')).toEqual([])
  expect(enlacesDe('alopez')).toEqual(['Editar'])
})

test('sin USUARIO_EDITAR no aparece "Editar"', async () => {
  await abrir(['USUARIO_CONSULTAR', 'USUARIO_DESACTIVAR'])

  expect(enlacesDe('alopez')).toEqual([])
  expect(await opcionesDe('alopez')).toEqual(['Desactivar'])
})

test('"Desactivar" pide confirmación: "Cancelar" no llama a la API y "Desactivar" actualiza la fila', async () => {
  desactivarCuenta.mockResolvedValue({ ...CUENTAS[1], activo: false })
  await abrir()

  await elegir('alopez', 'Desactivar')
  const dialogo = await screen.findByRole('alertdialog')
  expect(within(dialogo).getByText('¿Desactivar la cuenta alopez?')).toBeTruthy()
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(desactivarCuenta).not.toHaveBeenCalled()

  await elegir('alopez', 'Desactivar')
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Desactivar' }))

  expect(await screen.findByText('Se desactivó la cuenta alopez.')).toBeTruthy()
  expect(desactivarCuenta).toHaveBeenCalledWith(8)
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(within(fila('alopez')).getByText('Desactivada')).toBeTruthy()
  expect(await opcionesDe('alopez')).toEqual(['Restaurar'])
})

test('"Restaurar" llama a restaurarCuenta, muestra "Restaurando…" mientras tanto, actualiza la fila y muestra el éxito', async () => {
  let resolver
  restaurarCuenta.mockReturnValue(new Promise((resolve) => (resolver = resolve)))
  await abrir()

  await elegir('mruiz', 'Restaurar')

  expect(await within(fila('mruiz')).findByText('Restaurando…')).toBeTruthy()
  expect(botonMenu('mruiz').disabled).toBe(true)
  resolver({ ...CUENTAS[2], activo: true, desactivadoEn: null })
  expect(await screen.findByText('Se restauró la cuenta mruiz.')).toBeTruthy()
  expect(restaurarCuenta).toHaveBeenCalledWith(9)
  expect(within(fila('mruiz')).getByText('Activa')).toBeTruthy()
  expect(within(fila('mruiz')).queryByText('Restaurando…')).toBeNull()
})

describe('HU-62: cuentas bloqueadas', () => {
  test('el Badge "Bloqueada" aparece solo en las cuentas bloqueadas, activas o desactivadas', async () => {
    await abrir()

    expect(within(fila('rgomez')).getByText('Bloqueada')).toBeTruthy()
    expect(within(fila('rgomez')).getByText('Activa')).toBeTruthy()
    expect(within(fila('tcruz')).getByText('Bloqueada')).toBeTruthy()
    for (const nombreUsuario of ['jperez', 'alopez', 'mruiz']) {
      expect(within(fila(nombreUsuario)).queryByText('Bloqueada')).toBeNull()
    }
  })

  test('"Desbloquear" aparece solo en las cuentas activas bloqueadas y con USUARIO_DESBLOQUEAR', async () => {
    await abrir()

    expect(await opcionesDe('rgomez')).toEqual(['Desactivar', 'Desbloquear', 'Restablecer contraseña'])
    expect(await opcionesDe('alopez')).toEqual(['Desactivar', 'Restablecer contraseña'])
    expect(await opcionesDe('tcruz')).toEqual(['Restaurar'])
  })

  test('sin USUARIO_DESBLOQUEAR no aparece "Desbloquear", pero sí el Badge', async () => {
    await abrir(['USUARIO_CONSULTAR', 'USUARIO_DESACTIVAR'])

    expect(await opcionesDe('rgomez')).toEqual(['Desactivar'])
    expect(within(fila('rgomez')).getByText('Bloqueada')).toBeTruthy()
  })

  test('"Desbloquear" llama a desbloquearCuenta sin confirmación, actualiza la fila y muestra el éxito', async () => {
    let resolver
    desbloquearCuenta.mockReturnValue(new Promise((resolve) => (resolver = resolve)))
    await abrir()

    await elegir('rgomez', 'Desbloquear')

    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(await within(fila('rgomez')).findByText('Desbloqueando…')).toBeTruthy()
    resolver({ ...CUENTAS[3], bloqueada: false })
    expect(await screen.findByText('Se desbloqueó la cuenta rgomez.')).toBeTruthy()
    expect(desbloquearCuenta).toHaveBeenCalledWith(10)
    expect(within(fila('rgomez')).queryByText('Bloqueada')).toBeNull()
    expect(await opcionesDe('rgomez')).toEqual(['Desactivar', 'Restablecer contraseña'])
  })

  test('si desbloquear falla, muestra el mensaje del backend y la fila sigue bloqueada', async () => {
    desbloquearCuenta.mockRejectedValue(new ErrorApi(409, 'CUENTA_NO_BLOQUEADA', 'La cuenta no está bloqueada.'))
    await abrir()

    await elegir('rgomez', 'Desbloquear')

    expect(await screen.findByText('La cuenta no está bloqueada.')).toBeTruthy()
    expect(within(fila('rgomez')).getByText('Bloqueada')).toBeTruthy()
  })
})

describe('HU-63: restablecer contraseña', () => {
  const CONTRASENA_GENERADA = 'Hk7pQ2xYz9Ab'

  test('"Restablecer contraseña" no aparece en la fila propia, en las desactivadas ni sin el permiso', async () => {
    await abrir()
    expect(await opcionesDe('jperez')).toEqual([])
    expect(await opcionesDe('mruiz')).not.toContain('Restablecer contraseña')
    expect(await opcionesDe('tcruz')).not.toContain('Restablecer contraseña')
    expect(await opcionesDe('alopez')).toContain('Restablecer contraseña')
  })

  test('sin USUARIO_RESTABLECER_CONTRASENA no aparece la opción', async () => {
    await abrir(['USUARIO_CONSULTAR', 'USUARIO_DESACTIVAR'])
    expect(await opcionesDe('alopez')).toEqual(['Desactivar'])
  })

  test('pide confirmación y "Cancelar" no llama a la API', async () => {
    await abrir()

    await elegir('alopez', 'Restablecer contraseña')
    const dialogo = await screen.findByRole('alertdialog')
    expect(within(dialogo).getByText('¿Restablecer la contraseña de alopez?')).toBeTruthy()
    expect(dialogo.textContent).toContain(
      'La contraseña actual dejará de funcionar. El sistema generará una temporal que la persona deberá cambiar al iniciar sesión.',
    )
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }))

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(restablecerContrasena).not.toHaveBeenCalled()
  })

  test('confirmar llama a restablecerContrasena, actualiza la fila y muestra la contraseña hasta "Ya la anoté"', async () => {
    restablecerContrasena.mockResolvedValue({
      usuario: { ...CUENTAS[3], bloqueada: false, debeCambiarContrasena: true },
      contrasenaTemporal: CONTRASENA_GENERADA,
    })
    await abrir()

    await elegir('rgomez', 'Restablecer contraseña')
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }))

    expect(await screen.findByTestId('contrasena-temporal')).toBeTruthy()
    expect(screen.getByTestId('contrasena-temporal').textContent).toBe(CONTRASENA_GENERADA)
    expect(restablecerContrasena).toHaveBeenCalledWith(10)
    expect(screen.getAllByRole('alertdialog')).toHaveLength(1)

    fireEvent.click(screen.getByRole('button', { name: 'Ya la anoté' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    // Mientras el diálogo está abierto, Radix oculta el resto de la página a la accesibilidad; la fila se revisa después.
    expect(within(fila('rgomez')).queryByText('Bloqueada')).toBeNull()
    expect(screen.getByText('Se restableció la contraseña de rgomez.')).toBeTruthy()
    expect(document.body.textContent).not.toContain(CONTRASENA_GENERADA)
    expect(JSON.stringify({ ...sessionStorage })).not.toContain(CONTRASENA_GENERADA)
  })

  test('si falla, muestra el mensaje del backend y no abre el diálogo de la contraseña', async () => {
    restablecerContrasena.mockRejectedValue(
      new ErrorApi(409, 'CUENTA_DESACTIVADA', 'La cuenta está desactivada; restáurela antes de restablecer su contraseña.'),
    )
    await abrir()

    await elegir('alopez', 'Restablecer contraseña')
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Restablecer' }))

    expect(await screen.findByText('La cuenta está desactivada; restáurela antes de restablecer su contraseña.')).toBeTruthy()
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(screen.queryByTestId('contrasena-temporal')).toBeNull()
  })
})

test('si la acción falla, muestra el mensaje del backend y la fila no cambia', async () => {
  restaurarCuenta.mockRejectedValue(new ErrorApi(409, 'EMPLEADO_INACTIVO', 'El empleado de esta cuenta está inactivo.'))
  await abrir()

  await elegir('mruiz', 'Restaurar')

  expect(await screen.findByText('El empleado de esta cuenta está inactivo.')).toBeTruthy()
  expect(within(fila('mruiz')).getByText('Desactivada')).toBeTruthy()
})

test('si falla la carga, se muestra el error', async () => {
  listarUsuarios.mockRejectedValue(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  await abrir()

  expect(await screen.findByText('No se pudieron cargar las cuentas: No se pudo conectar con el servidor.')).toBeTruthy()
  expect(screen.queryByRole('table')).toBeNull()
})

test('sin cuentas, muestra el aviso', async () => {
  listarUsuarios.mockResolvedValue(respuesta([]))
  await abrir()

  expect(screen.getByText('No hay cuentas registradas en su DDRISS.')).toBeTruthy()
})

describe('HU-07: paginación', () => {
  // Responde la página pedida de un listado de 57 cuentas (3 páginas de 20).
  const conTotal = (total) =>
    listarUsuarios.mockImplementation(async ({ pagina, porPagina }) => respuesta(CUENTAS, { total, pagina, porPagina }))
  const enlace = (nombre) => screen.getByRole('link', { name: nombre })

  test('paginasVisibles muestra la primera, la última, la actual y una a cada lado, con saltos', () => {
    expect(paginasVisibles(1, 1)).toEqual([1])
    expect(paginasVisibles(1, 3)).toEqual([1, 2, 3])
    expect(paginasVisibles(5, 12)).toEqual([1, null, 4, 5, 6, null, 12])
    expect(paginasVisibles(12, 12)).toEqual([1, null, 11, 12])
  })

  test('al cargar /usuarios pide la página 1 de 20 filas', async () => {
    await abrir()
    expect(listarUsuarios).toHaveBeenCalledTimes(1)
    expect(listarUsuarios).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
  })

  test('con 57 cuentas muestra "Mostrando 1 a 20 de 57" y "Siguiente" pide la página 2', async () => {
    conTotal(57)
    await abrir()

    expect(screen.getByText('Mostrando 1 a 20 de 57')).toBeTruthy()
    const paginacion = screen.getByRole('navigation', { name: 'Paginación' })
    expect(within(paginacion).getAllByRole('link').map((a) => a.textContent)).toEqual(['Anterior', '1', '2', '3', 'Siguiente'])
    expect(enlace('Página 1').getAttribute('aria-current')).toBe('page')
    expect(enlace('Siguiente').getAttribute('href')).toBe('/usuarios?pagina=2')

    fireEvent.click(enlace('Siguiente'))

    expect(await screen.findByText('Mostrando 21 a 40 de 57')).toBeTruthy()
    expect(ubicacion()).toBe('?pagina=2')
    expect(listarUsuarios).toHaveBeenLastCalledWith({ pagina: 2, porPagina: 20 })
    expect(enlace('Página 2').getAttribute('aria-current')).toBe('page')
  })

  test('"Anterior" está deshabilitado en la página 1 y "Siguiente" en la última', async () => {
    conTotal(57)
    await abrir(TODOS_LOS_PERMISOS, '/usuarios?pagina=3')

    expect(screen.getByText('Mostrando 41 a 57 de 57')).toBeTruthy()
    expect(enlace('Siguiente').getAttribute('aria-disabled')).toBe('true')
    expect(enlace('Anterior').getAttribute('aria-disabled')).toBeNull()

    fireEvent.click(enlace('Página 1'))
    await screen.findByText('Mostrando 1 a 20 de 57')
    expect(enlace('Anterior').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(enlace('Anterior'))
    expect(listarUsuarios).toHaveBeenCalledTimes(2)
    expect(ubicacion()).toBe('')
  })

  test('con una sola página no hay paginación, pero sí "Mostrando…" y "Filas por página"', async () => {
    await abrir()

    expect(screen.getByText(`Mostrando 1 a ${CUENTAS.length} de ${CUENTAS.length}`)).toBeTruthy()
    expect(screen.getByLabelText('Filas por página')).toBeTruthy()
    expect(screen.queryByRole('navigation', { name: 'Paginación' })).toBeNull()
  })

  test('cambiar "Filas por página" a 50 pide porPagina 50 y vuelve a la página 1', async () => {
    conTotal(57)
    await abrir(TODOS_LOS_PERMISOS, '/usuarios?pagina=2')

    // Radix Select deja un <select> nativo oculto dentro del formulario; cambiarlo actualiza el valor del Select.
    fireEvent.change(document.querySelector('select[name="porPagina"]'), { target: { value: '50' } })

    await screen.findByText('Mostrando 1 a 50 de 57')
    expect(listarUsuarios).toHaveBeenLastCalledWith({ pagina: 1, porPagina: 50 })
    expect(ubicacion()).toBe('?porPagina=50')
  })

  test('un valor inválido en la URL no llega a la API: se usa el valor por defecto', async () => {
    await abrir(TODOS_LOS_PERMISOS, '/usuarios?pagina=abc&porPagina=30&estado=OTRO&rolId=-1&establecimientoId=x')
    expect(listarUsuarios).toHaveBeenCalledWith({ pagina: 1, porPagina: 20 })
  })

  test('si la página pedida viene vacía con total mayor que 0, pide la última', async () => {
    listarUsuarios.mockImplementation(async ({ pagina, porPagina }) =>
      pagina > 3 ? respuesta([], { total: 57, pagina, porPagina }) : respuesta(CUENTAS, { total: 57, pagina, porPagina }),
    )
    await abrir(TODOS_LOS_PERMISOS, '/usuarios?pagina=9')

    expect(await screen.findByText('Mostrando 41 a 57 de 57')).toBeTruthy()
    expect(listarUsuarios).toHaveBeenLastCalledWith({ pagina: 3, porPagina: 20 })
    expect(ubicacion()).toBe('?pagina=3')
    expect(screen.queryByText('No hay cuentas registradas en su DDRISS.')).toBeNull()
  })

  test('si la respuesta de una petición vieja llega después de la nueva, se descarta', async () => {
    let resolverVieja
    conTotal(57)
    await abrir()
    listarUsuarios
      .mockImplementationOnce(() => new Promise((resolve) => (resolverVieja = resolve)))
      .mockImplementationOnce(async () => respuesta([cuenta(30, 'nueva')], { total: 57, pagina: 3 }))

    fireEvent.click(enlace('Siguiente'))
    expect(screen.getByRole('table').closest('[aria-busy]').getAttribute('aria-busy')).toBe('true')
    fireEvent.click(enlace('Página 3'))
    expect(await screen.findByRole('cell', { name: 'nueva' })).toBeTruthy()

    resolverVieja(respuesta([cuenta(20, 'vieja')], { total: 57, pagina: 2 }))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByRole('cell', { name: 'vieja' })).toBeNull()
    expect(screen.getByRole('cell', { name: 'nueva' })).toBeTruthy()
    expect(ubicacion()).toBe('?pagina=3')
  })
})
