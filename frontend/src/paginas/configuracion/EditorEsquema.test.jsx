import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ErrorApi } from '@/api/cliente.js'
import EditorEsquema from './EditorEsquema.jsx'
import { MENSAJES_COHERENCIA as M } from './coherenciaEsquema.js'

const VACUNA = { id: 2, codigo: 'ZVT', nombre: 'Vacuna de prueba' }
const DOSIS = [
  { id: 1, codigo: 'D1', nombre: 'Primera dosis', orden: 1, activa: true },
  { id: 2, codigo: 'D2', nombre: 'Segunda dosis', orden: 2, activa: true },
  { id: 3, codigo: 'D3', nombre: 'Tercera dosis', orden: 3, activa: false },
  { id: 4, codigo: 'R1', nombre: 'Primer refuerzo', orden: 4, activa: true },
]
const valor = (codigo, etiqueta, orden, activo = true) => ({ codigo, etiqueta, orden, activo })
const DIMENSIONES = [
  {
    codigo: 'grupo_edad',
    nombre: 'Grupo de edad',
    activa: true,
    valores: [valor('MENOR_1', '< 1 año', 1), valor('1_A_5', 'De 1 a < 6 años', 2), valor('2_4', '2 a 4 años', 3, false)],
  },
  { codigo: 'sexo', nombre: 'Sexo', activa: true, valores: [valor('F', 'Mujeres', 1), valor('M', 'Hombres', 2)] },
  {
    codigo: 'estado_embarazo',
    nombre: 'Estado de embarazo',
    activa: true,
    valores: [valor('EMBARAZADA', 'Embarazada', 1), valor('NO_EMBARAZADA', 'No embarazada', 2)],
  },
]

const inicial = () => ({
  procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  dosis: [
    { codigo: 'D1', desagregacion: null },
    { codigo: 'R1', desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5'] }] },
  ],
  desagregacion: [{ dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] }],
  secciones: [
    { titulo: '< 1 año', grupoEdad: 'MENOR_1', dosis: ['D1'] },
    { titulo: 'De 1 a < 6 años', grupoEdad: '1_A_5', dosis: ['D1', 'R1'] },
  ],
})

let onGuardar

function montar(datos = inicial()) {
  render(
    <MemoryRouter>
      <EditorEsquema
        vacuna={VACUNA}
        origen="Esquema nuevo"
        notaCopia={null}
        dosisVacuna={DOSIS}
        dimensiones={DIMENSIONES}
        inicial={datos}
        onGuardar={onGuardar}
        volverA="/configuracion?pestana=esquemas"
      />
    </MemoryRouter>,
  )
}

const marcar = (nombre) => fireEvent.click(screen.getByRole('checkbox', { name: nombre }))
const botonGuardar = () => screen.getByRole('button', { name: 'Guardar borrador' })
const problemas = () => {
  const lista = screen.queryByRole('list', { name: 'Problemas del esquema' })
  return lista ? within(lista).getAllByRole('listitem').map((item) => item.textContent) : []
}
const elegir = (nombre, valorNuevo) =>
  fireEvent.change(document.querySelector(`select[name="${nombre}"]`), { target: { value: valorNuevo } })
const guardado = () => onGuardar.mock.calls.at(-1)[0]

beforeEach(() => {
  onGuardar = vi.fn().mockResolvedValue(undefined)
})

test('sin cambios guarda el contenido inicial', async () => {
  montar()

  expect(problemas()).toEqual([])
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalledTimes(1))
  expect(guardado()).toEqual(inicial())
})

test('marcar y desmarcar dosis y valores cambia lo que se guarda', async () => {
  montar()

  marcar('Segunda dosis (D2)')
  expect(problemas()).toEqual([M.dosisSinSeccion('D2')])
  expect(botonGuardar().disabled).toBe(true)
  marcar('D2 en la sección 1')
  expect(problemas()).toEqual([])

  elegir('agregar-dimension', 'sexo')
  marcar('Hombres de sexo')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().dosis.map((d) => d.codigo)).toEqual(['D1', 'D2', 'R1'])
  expect(guardado().desagregacion).toEqual([
    { dimension: 'grupo_edad', valores: ['MENOR_1', '1_A_5'] },
    { dimension: 'sexo', valores: ['F'] },
  ])
  expect(guardado().secciones[0].dosis).toEqual(['D1', 'D2'])
})

test('desmarcar una dosis la quita también de sus secciones', async () => {
  montar()

  marcar('Primer refuerzo (R1)')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().dosis).toEqual([{ codigo: 'D1', desagregacion: null }])
  expect(guardado().secciones[1].dosis).toEqual(['D1'])
})

test('la desagregación propia elige un subconjunto o "Sin desagregar", y no deja quitar grupo_edad', async () => {
  montar()

  // R1 trae su propia desagregación con solo 1_A_5.
  expect(screen.getByRole('switch', { name: 'Desagregación propia de R1' }).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByRole('checkbox', { name: '< 1 año en R1' }).getAttribute('aria-checked')).toBe('false')
  expect(screen.getByRole('checkbox', { name: 'De 1 a < 6 años en R1' }).getAttribute('aria-checked')).toBe('true')
  expect(screen.getByRole('checkbox', { name: 'Por Grupo de edad en R1' }).disabled).toBe(true)

  // Encenderla en D1 copia la general.
  fireEvent.click(screen.getByRole('switch', { name: 'Desagregación propia de D1' }))
  expect(screen.getByRole('checkbox', { name: '< 1 año en D1' }).getAttribute('aria-checked')).toBe('true')
  marcar('Sin desagregar D1')
  expect(problemas()).toEqual([M.dosisSinEdad('D1')])
  marcar('Sin desagregar D1')
  expect(problemas()).toEqual([])

  marcar('< 1 año en D1')
  expect(problemas()).toEqual([M.grupoNoPermitido('D1', 'MENOR_1', '< 1 año')])
  marcar('< 1 año en D1')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().dosis[0]).toEqual({
    codigo: 'D1',
    desagregacion: [{ dimension: 'grupo_edad', valores: ['1_A_5', 'MENOR_1'] }],
  })
})

test('sin grupo_edad no hay Select de grupo y "Agregar sección" se deshabilita con una sección', async () => {
  montar()

  fireEvent.click(screen.getByRole('button', { name: 'Quitar grupo_edad' }))
  expect(screen.queryByRole('combobox', { name: 'Grupo de edad de la sección 1' })).toBeNull()
  expect(problemas()).toEqual([M.unaSeccion])
  expect(screen.getByRole('button', { name: /Agregar sección/ }).disabled).toBe(true)

  fireEvent.click(screen.getByRole('button', { name: 'Quitar la sección 2' }))
  expect(problemas()).toEqual([M.dosisSinSeccion('R1')])
  expect(screen.getByRole('button', { name: /Agregar sección/ }).disabled).toBe(true)
  marcar('R1 en la sección 1')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().desagregacion).toEqual([])
  expect(guardado().dosis[1]).toEqual({ codigo: 'R1', desagregacion: [] })
  expect(guardado().secciones).toEqual([{ titulo: '< 1 año', grupoEdad: null, dosis: ['D1', 'R1'] }])
})

test('dos secciones con el mismo grupo o una dosis sin sección aparecen en Problemas y deshabilitan Guardar', () => {
  montar()

  elegir('grupo-seccion-2', 'MENOR_1')
  expect(problemas()).toContain(M.grupoRepetido('MENOR_1'))
  expect(botonGuardar().disabled).toBe(true)

  elegir('grupo-seccion-2', '1_A_5')
  marcar('R1 en la sección 2')
  expect(problemas()).toEqual([M.dosisSinSeccion('R1')])
  expect(botonGuardar().disabled).toBe(true)
})

test('"Subir" y "Bajar" cambian el orden de las secciones', async () => {
  montar()

  fireEvent.click(screen.getByRole('button', { name: 'Bajar la sección 1' }))
  expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).value).toBe('De 1 a < 6 años')
  expect(screen.getByRole('button', { name: 'Subir la sección 1' }).disabled).toBe(true)
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().secciones.map((s) => s.grupoEdad)).toEqual(['1_A_5', 'MENOR_1'])

  fireEvent.click(screen.getByRole('button', { name: 'Subir la sección 2' }))
  expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).value).toBe('< 1 año')
})

test('un valor o una dosis inactivos del estado inicial se ven "Inactivo" y como problema', () => {
  const datos = inicial()
  datos.desagregacion[0].valores.push('2_4')
  datos.dosis.push({ codigo: 'D3', desagregacion: null })
  datos.secciones[1].dosis.push('D3')
  montar(datos)

  const valorInactivo = screen.getByRole('checkbox', { name: '2 a 4 años de grupo_edad' }).parentElement
  expect(within(valorInactivo).getByText('Inactivo')).toBeTruthy()
  const dosisInactiva = screen.getByRole('checkbox', { name: 'Tercera dosis (D3)' }).parentElement
  expect(within(dosisInactiva).getByText('Inactivo')).toBeTruthy()
  expect(problemas()).toEqual([M.dosisInactiva('D3', 'ZVT'), M.valorInactivo('2_4', 'grupo_edad')])

  marcar('2 a 4 años de grupo_edad')
  marcar('Tercera dosis (D3)')
  expect(problemas()).toEqual([])
  expect(screen.queryByRole('checkbox', { name: '2 a 4 años de grupo_edad' })).toBeNull()
})

test('una dimensión inactiva del estado inicial se ve "Inactivo" y se puede quitar', () => {
  const datos = inicial()
  datos.desagregacion.push({ dimension: 'pueblo', valores: ['MAYA'] })
  montar(datos)

  expect(problemas()).toEqual([M.dimensionInactiva('pueblo')])
  fireEvent.click(screen.getByRole('button', { name: 'Quitar pueblo' }))
  expect(problemas()).toEqual([])
})

test('un título vacío es un problema y se marca al salir del campo', () => {
  montar()

  const titulo = screen.getByRole('textbox', { name: 'Título de la sección 1' })
  fireEvent.change(titulo, { target: { value: '   ' } })
  expect(problemas()).toEqual(['Sección 1: El título de la sección debe tener entre 1 y 60 caracteres.'])
  expect(botonGuardar().disabled).toBe(true)

  fireEvent.blur(titulo)
  expect(titulo.getAttribute('aria-invalid')).toBe('true')
})

test('una sección sin título se nombra por su número en los problemas', () => {
  montar()

  fireEvent.click(screen.getByRole('button', { name: /Agregar sección/ }))
  expect(problemas()).toEqual([
    'Sección 3: El título de la sección debe tener entre 1 y 60 caracteres.',
    M.seccionSinDosis('3'),
    M.seccionSinGrupo('3'),
  ])
})

test('el modo de procedencia y "no especificada" van en lo que se guarda', async () => {
  montar()

  fireEvent.click(screen.getByRole('radio', { name: 'Propio y otros, como el 5C' }))
  marcar('Permitir procedencia no especificada')
  fireEvent.click(botonGuardar())

  await waitFor(() => expect(onGuardar).toHaveBeenCalled())
  expect(guardado().procedencia).toEqual({ modo: 'PROPIO_Y_OTROS', permiteNoEspecificado: false })
})

test('un error al guardar se muestra en un Alert y conserva lo editado', async () => {
  onGuardar.mockRejectedValue(new ErrorApi(422, 'ESQUEMA_INVALIDO', M.dosisInactiva('R1', 'ZVT')))
  montar()

  fireEvent.change(screen.getByRole('textbox', { name: 'Título de la sección 1' }), { target: { value: 'Menores de 1 año' } })
  fireEvent.click(botonGuardar())

  expect(await screen.findByText(M.dosisInactiva('R1', 'ZVT'))).toBeTruthy()
  expect(screen.getByRole('textbox', { name: 'Título de la sección 1' }).value).toBe('Menores de 1 año')
  expect(botonGuardar().disabled).toBe(false)
})
