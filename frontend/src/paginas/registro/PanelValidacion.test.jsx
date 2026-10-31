import { fireEvent, render, screen, within } from '@testing-library/react'
import PanelValidacion from './PanelValidacion.jsx'

const HEXA = { id: 2, codigo: 'HEXA', nombre: 'Hexavalente' }
const ERROR = {
  id: 1,
  regla: { codigo: 'CAMPOS_COMPLETOS', version: 1, nombre: 'Campos completos', tipo: 'CAMPOS_COMPLETOS' },
  severidad: 'ERROR',
  estado: 'ABIERTO',
  mensaje: 'Faltan valores en Hexavalente: 1 combinaciones sin registrar.',
  vacuna: HEXA,
  dosis: null,
  celdas: [{ municipioId: 10, dosis: 'D3', claveCombinacion: 'grupo_edad=MENOR_1' }],
  campos: [],
}
const ADVERTENCIA = {
  id: 2,
  regla: { codigo: 'RANGO_01', version: 2, nombre: 'Rango mensual', tipo: 'RANGO' },
  severidad: 'ADVERTENCIA',
  estado: 'ABIERTO',
  mensaje: 'Hexavalente 1.ª dosis: 150 dosis está fuera del rango esperado (0 a 100).',
  vacuna: HEXA,
  dosis: { codigo: 'D1', etiqueta: '1.ª dosis' },
  celdas: [{ municipioId: 10, dosis: 'D1', claveCombinacion: 'grupo_edad=MENOR_1' }],
  campos: [],
}
// De ámbito REPORTE: sin vacuna, no lleva a ninguna casilla.
const DEL_REPORTE = {
  ...ADVERTENCIA,
  id: 3,
  regla: { codigo: 'SIN_DUPLICADOS', version: 1, nombre: 'Sin duplicados', tipo: 'SIN_DUPLICADOS' },
  mensaje: 'Ya hay un reporte de C/S Prueba para septiembre de 2026.',
  vacuna: null,
  dosis: null,
  celdas: [],
}

const validacion = (resultados, cambios = {}) => ({
  validadoEn: '2026-10-30T21:42:10.000Z',
  errores: resultados.filter((r) => r.severidad === 'ERROR').length,
  advertencias: resultados.filter((r) => r.severidad === 'ADVERTENCIA').length,
  corregidos: 0,
  resultados,
  ...cambios,
})

const props = { alValidar: vi.fn(), alElegir: vi.fn() }
const mostrar = (otras = {}) =>
  render(<PanelValidacion validacion={null} validando={false} error={null} conCambios={false} {...props} {...otras} />)
const resultados = () => within(screen.getByRole('list', { name: 'Resultados de la validación' }))

beforeEach(() => vi.clearAllMocks())

test('un error y una advertencia se muestran con su severidad, su vacuna, su dosis y su regla', () => {
  mostrar({ validacion: validacion([ERROR, ADVERTENCIA]) })

  const [error, advertencia] = resultados().getAllByRole('listitem')
  expect(error.textContent).toContain('Error · impide enviar')
  expect(error.textContent).toContain('Faltan valores en Hexavalente: 1 combinaciones sin registrar.')
  expect(error.textContent).toContain('Regla Campos completos · CAMPOS_COMPLETOS v1')
  expect(advertencia.textContent).toContain('Advertencia')
  expect(advertencia.textContent).toContain('Hexavalente · 1.ª dosis')
  expect(advertencia.textContent).toContain('Regla Rango mensual · RANGO_01 v2')
  expect(screen.queryByText('Sin errores')).toBeNull()
  expect(screen.getByText('Validada a las 03:42 p. m.')).toBeTruthy()
})

test('los errores van primero aunque lleguen después', () => {
  mostrar({ validacion: validacion([ADVERTENCIA, ERROR]) })
  const [primero] = resultados().getAllByRole('listitem')
  expect(primero.textContent).toContain('Error · impide enviar')
})

test('sin errores se ve «Sin errores» en verde, y las advertencias debajo', () => {
  mostrar({ validacion: validacion([ADVERTENCIA]) })

  const sinErrores = screen.getByRole('status')
  expect(sinErrores.textContent).toBe('Sin errores')
  expect(sinErrores.className).toContain('bg-exito')
  expect(resultados().getAllByRole('listitem')).toHaveLength(1)
})

test('sin resultados solo se ve «Sin errores»', () => {
  mostrar({ validacion: validacion([]) })
  expect(screen.getByText('Sin errores')).toBeTruthy()
  expect(screen.queryByRole('list', { name: 'Resultados de la validación' })).toBeNull()
})

test('un resultado con casillas es un botón que avisa cuál se eligió; uno del reporte no', () => {
  mostrar({ validacion: validacion([ERROR, DEL_REPORTE]) })

  const [error, delReporte] = resultados().getAllByRole('listitem')
  fireEvent.click(within(error).getByRole('button'))
  expect(props.alElegir).toHaveBeenCalledWith(ERROR)
  expect(within(delReporte).queryByRole('button')).toBeNull()
})

test('cuenta los resultados corregidos desde la última validación', () => {
  mostrar({ validacion: validacion([], { corregidos: 2 }) })
  expect(screen.getByText('2 resultados corregidos desde la última validación.')).toBeTruthy()
})

test('con cambios sin guardar avisa que los resultados son de lo guardado', () => {
  mostrar({ validacion: validacion([]), conCambios: true })
  expect(screen.getByText('Los resultados son de lo guardado. Guarde el borrador para validar los cambios.')).toBeTruthy()
})

test('antes de la primera validación se ve la carga', () => {
  mostrar({ validando: true })
  expect(screen.getByLabelText('Cargando la validación')).toBeTruthy()
})

test('un fallo muestra el error y «Reintentar» vuelve a validar', () => {
  mostrar({ error: 'No se pudo conectar con el servidor.' })

  expect(screen.getByText('No se pudo conectar con el servidor.')).toBeTruthy()
  expect(screen.queryByLabelText('Cargando la validación')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
  expect(props.alValidar).toHaveBeenCalledOnce()
})

test('«Validar de nuevo» valida una vez y queda deshabilitado mientras espera', () => {
  const { rerender } = mostrar({ validacion: validacion([]) })

  fireEvent.click(screen.getByRole('button', { name: 'Validar de nuevo' }))
  expect(props.alValidar).toHaveBeenCalledOnce()

  rerender(<PanelValidacion validacion={validacion([])} validando error={null} conCambios={false} {...props} />)
  expect(screen.getByRole('button', { name: 'Validando…' }).hasAttribute('disabled')).toBe(true)
})
