import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import {
  agregarValorDimension,
  desactivarValorDimension,
  editarDimension,
  editarValorDimension,
  obtenerDimension,
  ordenarValoresDimension,
} from '@/api/configuracion.js'
import { ErrorApi } from '@/api/cliente.js'
import { guardarSesion } from '@/api/sesion.js'
import { ProveedorSesion } from '@/componentes/ProveedorSesion.jsx'
import PaginaEditarDimension from './PaginaEditarDimension.jsx'

vi.mock('@/api/auth.js', () => ({ iniciarSesion: vi.fn(), cerrarSesion: vi.fn() }))
vi.mock('@/api/configuracion.js', () => ({
  obtenerDimension: vi.fn(),
  editarDimension: vi.fn(),
  agregarValorDimension: vi.fn(),
  editarValorDimension: vi.fn(),
  ordenarValoresDimension: vi.fn(),
  desactivarValorDimension: vi.fn(),
  reactivarValorDimension: vi.fn(),
}))

const valor = (codigo, etiqueta, orden, extra = {}) => ({ codigo, etiqueta, orden, activo: true, enUso: false, ...extra })

const VIA = {
  id: 'id-via',
  codigo: 'via',
  nombre: 'Vía de aplicación',
  descripcion: null,
  tipo: 'CATEGORICA',
  activa: true,
  enUso: false,
  valores: [valor('IM', 'Intramuscular', 1), valor('SC', 'Subcutánea', 2), valor('ID', 'Intradérmica', 3, { activo: false })],
}

const EDAD = {
  id: 'id-edad',
  codigo: 'grupo_edad',
  nombre: 'Grupo de edad',
  descripcion: null,
  tipo: 'RANGO_EDAD',
  activa: true,
  enUso: true,
  valores: [
    valor('MENOR_1', '< 1 año', 1, { enUso: true, edadMinMeses: 0, edadMaxMeses: 12, sinPoblacion: false }),
    valor('2_4', '2 a 4 años', 2, { edadMinMeses: 24, edadMaxMeses: 60, sinPoblacion: true }),
  ],
  gruposPoblacionDisponibles: [
    { codigo: 'NACIDOS_VIVOS', descripcion: 'Nacidos vivos (columna N/V del 5C)' },
    { codigo: 'EMBARAZADAS', descripcion: 'Mujeres embarazadas esperadas' },
  ],
}

function crearSesion() {
  const codificar = (objeto) => btoa(JSON.stringify(objeto)).replace(/=+$/, '')
  const exp = Math.floor(Date.now() / 1000) + 3600
  return {
    token: `${codificar({ alg: 'HS256', typ: 'JWT' })}.${codificar({ sub: '7', exp })}.firma`,
    usuario: {
      id: 7,
      nombreUsuario: 'mlopez',
      rol: 'REVISOR',
      permisos: ['CONFIGURACION_CONSULTAR', 'DIMENSION_CONSULTAR', 'DIMENSION_EDITAR'],
      empleado: { nombres: 'María', apellidos: 'López', ddrissId: 1, establecimientoId: null, municipioId: null },
    },
  }
}

function Ubicacion() {
  const { pathname, search } = useLocation()
  return <output data-testid="ubicacion">{`${pathname}${search}`}</output>
}

// El aviso de cambios sin guardar (useBlocker) necesita un data router.
function montar(ruta) {
  guardarSesion(crearSesion())
  const router = createMemoryRouter(
    [
      {
        element: (
          <ProveedorSesion>
            <Outlet />
            <Ubicacion />
          </ProveedorSesion>
        ),
        children: [
          { path: '/configuracion/dimensiones/:codigo/editar', element: <PaginaEditarDimension /> },
          { path: '/configuracion', element: <p>Pestaña</p> },
        ],
      },
    ],
    { initialEntries: [ruta] },
  )
  render(<RouterProvider router={router} />)
}
const ubicacion = () => screen.getByTestId('ubicacion').textContent

async function abrir(dimension = VIA) {
  obtenerDimension.mockResolvedValue(dimension)
  montar(`/configuracion/dimensiones/${dimension.codigo}/editar`)
  await waitFor(() => expect(screen.queryByLabelText('Cargando dimensión')).toBeNull())
}

const tabla = () => screen.getByRole('table', { name: 'Valores' })
const filaDe = (codigo) => within(tabla()).getByRole('cell', { name: codigo }).closest('tr')
const insignias = (codigo) => [...filaDe(codigo).querySelectorAll('[data-slot="badge"]')].map((b) => b.textContent)
const escribirEn = (contenedor, etiqueta, texto) =>
  fireEvent.change(within(contenedor).getByLabelText(etiqueta), { target: { value: texto } })

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
})

test('muestra los datos, los valores en orden y pide la dimensión por su código', async () => {
  await abrir()

  expect(obtenerDimension).toHaveBeenCalledWith('via')
  expect(screen.getByText('Categórica')).toBeTruthy()
  expect(screen.getByLabelText(/^Nombre\*?$/).value).toBe('Vía de aplicación')
  const codigos = within(tabla())
    .getAllByRole('row')
    .slice(1)
    .map((fila) => within(fila).getAllByRole('cell')[1].textContent)
  expect(codigos).toEqual(['IM', 'SC', 'ID'])
  expect(insignias('ID')).toEqual(['Inactivo'])
  expect(within(tabla()).queryByRole('columnheader', { name: 'Rango' })).toBeNull()
})

test('guardar el nombre llama a editarDimension solo con lo que cambió, muestra el aviso y ya no hay cambios', async () => {
  editarDimension.mockResolvedValue({ ...VIA, nombre: 'Vía' })
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Nombre\*?$/), { target: { value: '  Vía ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Dimensión Vía actualizada.'))
  expect(editarDimension).toHaveBeenCalledWith('via', { nombre: 'Vía' })
  expect(screen.getByLabelText(/^Nombre\*?$/).value).toBe('Vía')

  // Lo guardado ya no cuenta como cambio: «Volver» sale sin preguntar.
  fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
  await waitFor(() => expect(ubicacion()).toBe('/configuracion?pestana=dimensiones'))
  expect(screen.queryByRole('alertdialog')).toBeNull()
})

test('sin cambios, "Guardar cambios" avisa que no hay nada que guardar y no llama a la API', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(toast.info).toHaveBeenCalledWith('No hay cambios que guardar.')
  expect(editarDimension).not.toHaveBeenCalled()
})

test('un error al guardar se muestra junto al botón y conserva lo escrito', async () => {
  editarDimension.mockRejectedValue(new ErrorApi(409, 'DIMENSION_DUPLICADA', 'Ya hay una dimensión con ese nombre.'))
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Nombre\*?$/), { target: { value: 'Vía' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  const aviso = (await screen.findByText('Ya hay una dimensión con ese nombre.')).closest('[role="alert"]')
  expect(aviso.parentElement.nextElementSibling.contains(screen.getByRole('button', { name: 'Guardar cambios' }))).toBe(true)
  expect(screen.getByLabelText(/^Nombre\*?$/).value).toBe('Vía')
})

test('con el nombre cambiado, "Volver" pide confirmación y "Seguir editando" se queda', async () => {
  await abrir()
  fireEvent.change(screen.getByLabelText(/^Nombre\*?$/), { target: { value: 'Vía' } })

  fireEvent.click(screen.getByRole('link', { name: 'Volver' }))
  const dialogo = await screen.findByRole('alertdialog')
  expect(dialogo.textContent).toContain('Si sale ahora, se pierden los cambios de la dimensión.')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Seguir editando' }))

  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
  expect(ubicacion()).toBe('/configuracion/dimensiones/via/editar')
  expect(screen.getByLabelText(/^Nombre\*?$/).value).toBe('Vía')
})

test('si falla la carga muestra el aviso, y "Reintentar" vuelve a pedir la dimensión', async () => {
  obtenerDimension.mockRejectedValueOnce(new ErrorApi(0, 'SIN_CONEXION', 'No se pudo conectar con el servidor.'))
  obtenerDimension.mockResolvedValue(VIA)
  montar('/configuracion/dimensiones/via/editar')

  expect(await screen.findByText('No se pudo cargar la dimensión: No se pudo conectar con el servidor.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

  expect(await screen.findByRole('table', { name: 'Valores' })).toBeTruthy()
  expect(obtenerDimension).toHaveBeenCalledTimes(2)
})

test('un nombre inválido muestra su error y no llama a la API', async () => {
  await abrir()

  fireEvent.change(screen.getByLabelText(/^Nombre\*?$/), { target: { value: 'V' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }))

  expect(screen.getByText('El nombre debe tener entre 2 y 60 caracteres.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText(/^Nombre\*?$/)))
  expect(editarDimension).not.toHaveBeenCalled()
})

test('"Bajar" manda la lista completa reordenada, con los inactivos, y reemplaza la tabla', async () => {
  ordenarValoresDimension.mockResolvedValue({
    ...VIA,
    valores: [valor('SC', 'Subcutánea', 1), valor('IM', 'Intramuscular', 2), valor('ID', 'Intradérmica', 3, { activo: false })],
  })
  await abrir()

  expect(screen.getByRole('button', { name: 'Subir IM' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Bajar ID' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Bajar IM' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Orden de los valores actualizado.'))
  expect(ordenarValoresDimension).toHaveBeenCalledWith('via', ['SC', 'IM', 'ID'])
  expect(within(filaDe('SC')).getAllByRole('cell')[0].textContent).toBe('1')
})

test('en una CATEGORICA el Dialog pide código y etiqueta, y agrega el valor', async () => {
  agregarValorDimension.mockResolvedValue({ ...VIA, valores: [...VIA.valores, valor('OR', 'Oral', 4)] })
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Agregar valor' }))
  const dialogo = await screen.findByRole('dialog')
  expect(within(dialogo).queryByLabelText(/Edad mínima/)).toBeNull()
  escribirEn(dialogo, /^Código\*?$/, 'or')
  escribirEn(dialogo, /^Etiqueta\*?$/, 'Oral')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar valor' }))

  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valor OR agregado.'))
  expect(agregarValorDimension).toHaveBeenCalledWith('via', { codigo: 'OR', etiqueta: 'Oral' })
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(filaDe('OR')).toBeTruthy()
})

test('un 409 al agregar se muestra dentro del Dialog, que conserva lo escrito', async () => {
  agregarValorDimension.mockRejectedValue(new ErrorApi(409, 'VALOR_DUPLICADO', 'La dimensión ya tiene el valor ID.'))
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Agregar valor' }))
  const dialogo = await screen.findByRole('dialog')
  escribirEn(dialogo, /^Código\*?$/, 'ID')
  escribirEn(dialogo, /^Etiqueta\*?$/, 'Otra')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar valor' }))

  expect(await within(dialogo).findByText('La dimensión ya tiene el valor ID.')).toBeTruthy()
  expect(within(dialogo).getByLabelText(/^Código\*?$/).value).toBe('ID')
})

describe('dimensión RANGO_EDAD', () => {
  test('la tabla muestra el rango y marca "Sin población"', async () => {
    await abrir(EDAD)

    expect(screen.getByText('Rango de edad')).toBeTruthy()
    expect(within(filaDe('MENOR_1')).getByText('0 a 12 meses')).toBeTruthy()
    expect(insignias('2_4')).toEqual(['Activo', 'Sin población'])
    expect(insignias('MENOR_1')).toEqual(['Activo', 'En uso'])
  })

  test('el Dialog ofrece los grupos disponibles, sugiere la etiqueta y valida mínimo < máximo', async () => {
    agregarValorDimension.mockResolvedValue({
      ...EDAD,
      valores: [...EDAD.valores, valor('EMBARAZADAS', 'Mujeres embarazadas esperadas', 3, { edadMinMeses: 120, edadMaxMeses: 600 })],
      gruposPoblacionDisponibles: [EDAD.gruposPoblacionDisponibles[0]],
    })
    await abrir(EDAD)

    fireEvent.click(screen.getByRole('button', { name: 'Agregar valor' }))
    const dialogo = await screen.findByRole('dialog')
    const grupos = dialogo.querySelector('select[name="grupo-poblacion"]')
    expect([...grupos.options].map((o) => o.value).filter(Boolean)).toEqual(['NACIDOS_VIVOS', 'EMBARAZADAS'])

    fireEvent.change(grupos, { target: { value: 'EMBARAZADAS' } })
    expect(within(dialogo).getByLabelText(/^Etiqueta\*?$/).value).toBe('Mujeres embarazadas esperadas')
    escribirEn(dialogo, /^Edad mínima/, '600')
    escribirEn(dialogo, /^Edad máxima/, '120')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar valor' }))
    expect(within(dialogo).getByText('La edad mínima debe ser menor que la máxima.')).toBeTruthy()
    expect(agregarValorDimension).not.toHaveBeenCalled()

    escribirEn(dialogo, /^Edad mínima/, '120')
    escribirEn(dialogo, /^Edad máxima/, '600')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Agregar valor' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valor EMBARAZADAS agregado.'))
    expect(agregarValorDimension).toHaveBeenCalledWith('grupo_edad', {
      codigo: 'EMBARAZADAS',
      etiqueta: 'Mujeres embarazadas esperadas',
      edadMinMeses: 120,
      edadMaxMeses: 600,
    })
  })

  test('sin grupos disponibles, "Agregar valor" queda deshabilitado con el motivo', async () => {
    await abrir({ ...EDAD, gruposPoblacionDisponibles: [] })

    expect(screen.getByRole('button', { name: 'Agregar valor' }).disabled).toBe(true)
    expect(
      screen.getByText('Todos los grupos de la clasificación de población ya están en esta dimensión.'),
    ).toBeTruthy()
  })
})

describe('desactivar y editar valores', () => {
  test('"Desactivar" está deshabilitado en un valor en uso; un inactivo se puede reactivar', async () => {
    await abrir({
      ...VIA,
      valores: [valor('IM', 'Intramuscular', 1, { enUso: true }), valor('SC', 'Subcutánea', 2, { activo: false })],
    })
    expect(screen.getByRole('button', { name: 'Desactivar IM' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Reactivar SC' }).disabled).toBe(false)
  })

  test('el último valor activo no se puede desactivar aunque no esté en uso', async () => {
    await abrir({ ...VIA, valores: [valor('IM', 'Intramuscular', 1), valor('SC', 'Subcutánea', 2, { activo: false })] })

    const boton = screen.getByRole('button', { name: 'Desactivar IM' })
    expect(boton.disabled).toBe(true)
    fireEvent.focus(boton.parentElement)
    expect((await screen.findAllByText('La dimensión debe conservar al menos un valor activo.')).length).toBeGreaterThan(0)
  })

  test('desactivar un valor pide confirmación y reemplaza la tabla', async () => {
    desactivarValorDimension.mockResolvedValue({
      ...VIA,
      valores: VIA.valores.map((v) => (v.codigo === 'SC' ? { ...v, activo: false } : v)),
    })
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Desactivar SC' }))
    const confirmacion = await screen.findByRole('alertdialog')
    expect(within(confirmacion).getByText('¿Desactivar el valor SC · Subcutánea?')).toBeTruthy()
    fireEvent.click(within(confirmacion).getByRole('button', { name: 'Desactivar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Valor SC desactivado.'))
    expect(desactivarValorDimension).toHaveBeenCalledWith('via', 'SC')
    expect(insignias('SC')).toEqual(['Inactivo'])
  })

  test('editar la etiqueta llama a editarValorDimension y actualiza la fila', async () => {
    editarValorDimension.mockResolvedValue({
      ...VIA,
      valores: VIA.valores.map((v) => (v.codigo === 'IM' ? { ...v, etiqueta: 'Inyección intramuscular' } : v)),
    })
    await abrir()

    fireEvent.click(screen.getByRole('button', { name: 'Editar la etiqueta de IM' }))
    const dialogo = await screen.findByRole('dialog')
    expect(within(dialogo).getByLabelText(/^Etiqueta\*?$/).value).toBe('Intramuscular')
    escribirEn(dialogo, /^Etiqueta\*?$/, 'Inyección intramuscular')
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Etiqueta de IM actualizada.'))
    expect(editarValorDimension).toHaveBeenCalledWith('via', 'IM', { etiqueta: 'Inyección intramuscular' })
    expect(within(filaDe('IM')).getByText('Inyección intramuscular')).toBeTruthy()
  })
})

test('un código que no existe muestra "La dimensión no existe." con el enlace a la pestaña', async () => {
  obtenerDimension.mockRejectedValue(new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'))
  montar('/configuracion/dimensiones/no_existe/editar')

  expect(await screen.findByText(/La dimensión no existe\./)).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Volver a las dimensiones' }).getAttribute('href')).toBe(
    '/configuracion?pestana=dimensiones',
  )
})

test('en el Dialog de la etiqueta, una etiqueta vacía muestra su error y le lleva el foco', async () => {
  await abrir()

  fireEvent.click(screen.getByRole('button', { name: 'Editar la etiqueta de IM' }))
  const dialogo = await screen.findByRole('dialog')
  escribirEn(dialogo, /^Etiqueta\*?$/, '')
  fireEvent.click(within(dialogo).getByRole('button', { name: 'Guardar' }))

  expect(within(dialogo).getByText('La etiqueta debe tener entre 1 y 60 caracteres.')).toBeTruthy()
  await waitFor(() => expect(document.activeElement).toBe(within(dialogo).getByLabelText(/^Etiqueta\*?$/)))
  expect(editarValorDimension).not.toHaveBeenCalled()
})
