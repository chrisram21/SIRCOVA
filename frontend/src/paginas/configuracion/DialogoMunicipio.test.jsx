import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { crearMunicipio, listarDepartamentos, renombrarMunicipio } from '@/api/catalogos.js'
import { ErrorApi } from '@/api/cliente.js'
import DialogoMunicipio from './DialogoMunicipio.jsx'

vi.mock('@/api/catalogos.js', () => ({
  listarDepartamentos: vi.fn(),
  crearMunicipio: vi.fn(),
  renombrarMunicipio: vi.fn(),
}))

const DEPARTAMENTOS = [
  { id: 3, codigoIne: '09', nombre: 'Quetzaltenango' },
  { id: 1, codigoIne: '12', nombre: 'San Marcos' },
]
const COATEPEQUE = {
  id: 32,
  departamentoId: 3,
  departamentoNombre: 'Quetzaltenango',
  codigoIne: '0920',
  nombre: 'Coatepeque',
  activo: true,
}

const props = { alGuardar: vi.fn(), alCerrar: vi.fn() }
const dialogo = () => within(screen.getByRole('dialog'))
const escribir = (etiqueta, valor) => fireEvent.change(dialogo().getByLabelText(etiqueta), { target: { value: valor } })
const elegirDepartamento = (id) =>
  fireEvent.change(document.querySelector('select[name="departamentoId"]'), { target: { value: String(id) } })
const guardar = () => fireEvent.click(dialogo().getByRole('button', { name: 'Guardar' }))

async function abrirParaRegistrar() {
  render(<DialogoMunicipio {...props} />)
  await waitFor(() => expect(document.querySelector('select[name="departamentoId"] option[value="3"]')).toBeTruthy())
}

beforeEach(() => {
  vi.clearAllMocks()
  listarDepartamentos.mockResolvedValue(DEPARTAMENTOS)
})

test('registra con el departamento, el código y el nombre limpios', async () => {
  const guardado = { ...COATEPEQUE, id: 40, codigoIne: '0915', nombre: 'Flores Costa Cuca' }
  crearMunicipio.mockResolvedValue(guardado)
  await abrirParaRegistrar()
  expect(dialogo().getByRole('heading', { name: 'Registrar municipio' })).toBeTruthy()

  elegirDepartamento(3)
  escribir('Código INE', ' 0915 ')
  escribir('Nombre', '  Flores   Costa Cuca ')
  guardar()

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(guardado))
  expect(crearMunicipio).toHaveBeenCalledWith({ departamentoId: 3, codigoIne: '0915', nombre: 'Flores Costa Cuca' })
})

test('con un departamento elegido, debajo del código sale con qué empieza', async () => {
  await abrirParaRegistrar()
  expect(dialogo().queryByText(/^Empieza con/)).toBeNull()

  elegirDepartamento(3)

  const ayuda = dialogo().getByText('Empieza con 09.')
  expect(dialogo().getByLabelText('Código INE').getAttribute('aria-describedby')).toContain(ayuda.id)
})

test('los errores de formato se muestran antes de enviar, sin llamar a la API', async () => {
  await abrirParaRegistrar()

  escribir('Código INE', '915')
  escribir('Nombre', 'SM')
  guardar()

  expect(dialogo().getByText('Elija el departamento del municipio.')).toBeTruthy()
  expect(dialogo().getByText('El código INE debe tener 4 dígitos.')).toBeTruthy()
  expect(dialogo().getByText('El nombre del municipio debe tener entre 3 y 80 caracteres.')).toBeTruthy()
  expect(dialogo().getByLabelText('Código INE').getAttribute('aria-invalid')).toBe('true')
  expect(crearMunicipio).not.toHaveBeenCalled()
})

test('el error de la API se muestra dentro del diálogo, que sigue abierto', async () => {
  crearMunicipio.mockRejectedValue(
    new ErrorApi(422, 'CODIGO_INE_DEPARTAMENTO', 'El código INE debe empezar con 09, el código del departamento.'),
  )
  await abrirParaRegistrar()

  elegirDepartamento(3)
  escribir('Código INE', '1215')
  escribir('Nombre', 'Flores Costa Cuca')
  guardar()

  expect(await dialogo().findByText('El código INE debe empezar con 09, el código del departamento.')).toBeTruthy()
  expect(props.alGuardar).not.toHaveBeenCalled()
  expect(dialogo().getByRole('button', { name: 'Guardar' }).disabled).toBe(false)
})

test('si no cargan los departamentos, avisa y se puede reintentar', async () => {
  listarDepartamentos.mockRejectedValueOnce(new ErrorApi(500, 'ERROR_INTERNO', 'Error interno.'))
  render(<DialogoMunicipio {...props} />)

  fireEvent.click(await dialogo().findByRole('button', { name: 'Reintentar' }))

  await waitFor(() => expect(document.querySelector('select[name="departamentoId"] option[value="3"]')).toBeTruthy())
  expect(listarDepartamentos).toHaveBeenCalledTimes(2)
})

test('al cambiar el nombre, el código y el departamento se ven como texto y no se editan', async () => {
  const guardado = { ...COATEPEQUE, nombre: 'Coatepeque Centro' }
  renombrarMunicipio.mockResolvedValue(guardado)
  render(<DialogoMunicipio municipio={COATEPEQUE} {...props} />)

  expect(dialogo().getByRole('heading', { name: 'Renombrar municipio' })).toBeTruthy()
  expect(dialogo().getByText('0920')).toBeTruthy()
  expect(dialogo().getByText('Quetzaltenango')).toBeTruthy()
  expect(dialogo().queryByLabelText('Código INE')).toBeNull()
  expect(dialogo().queryByRole('combobox')).toBeNull()
  expect(listarDepartamentos).not.toHaveBeenCalled()

  escribir('Nombre', 'Coatepeque Centro')
  guardar()

  await waitFor(() => expect(props.alGuardar).toHaveBeenCalledWith(guardado))
  expect(renombrarMunicipio).toHaveBeenCalledWith(32, 'Coatepeque Centro')
})
