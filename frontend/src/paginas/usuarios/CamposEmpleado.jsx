import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import AvisoCambiosSinGuardar, { useAvisoCambiosSinGuardar } from '@/componentes/AvisoCambiosSinGuardar.jsx'
import {
  validarApellidos,
  validarCargo,
  validarCorreo,
  validarCui,
  validarNombres,
  validarTelefono,
} from '@/validaciones/campos.js'

// Radix Select no acepta '' como valor de una opción.
export const NINGUNO = 'ninguno'

// En el orden en que aparecen en el formulario; el id de cada campo es su nombre.
const REGLAS = {
  nombres: validarNombres,
  apellidos: validarApellidos,
  cui: validarCui,
  cargo: validarCargo,
  correo: validarCorreo,
  telefono: validarTelefono,
}

const AYUDA_CUI = 'Se usa solo para evitar registros repetidos; el sistema no lo muestra después.'

// Mensaje de error de cada campo de texto con regla. `campos` limita la revisión (al editar, solo los que cambiaron).
export function erroresDeEmpleado(empleado, campos = Object.keys(REGLAS)) {
  const errores = {}
  for (const campo of campos) {
    const { error } = REGLAS[campo]?.(empleado[campo]) ?? {}
    if (error) errores[campo] = error
  }
  return errores
}

// Los ids de los campos con error, en el orden del formulario: el primero recibe el foco al enviar.
export function camposConError(errores) {
  return Object.keys(REGLAS).filter((campo) => errores[campo])
}

export function enfocarPrimero(ids) {
  for (const id of ids) {
    const campo = document.getElementById(id)
    if (campo) {
      campo.focus()
      return
    }
  }
}

// Se monta cuando el formulario ya cargó: antes no hay nada que perder. Así, las pruebas de rutas que montan la
// página con MemoryRouter (sin data router, que useBlocker exige) siguen funcionando.
export function AvisoSalida({ hayCambios, descripcion }) {
  const bloqueo = useAvisoCambiosSinGuardar(hayCambios)
  return <AvisoCambiosSinGuardar bloqueo={bloqueo} descripcion={descripcion} />
}

export function Campo({ id, etiqueta, obligatorio = false, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="font-semibold">
        {etiqueta}
        {obligatorio && <span aria-hidden="true">*</span>}
      </Label>
      {children}
    </div>
  )
}

export function CampoTexto({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, error, ayuda, ...props }) {
  const idError = `${id}-error`
  const idAyuda = `${id}-ayuda`
  const describe = [ayuda && idAyuda, error && idError].filter(Boolean).join(' ')
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Input
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={deshabilitado}
        aria-invalid={error ? true : undefined}
        aria-describedby={describe || undefined}
        className="bg-card"
        {...props}
      />
      {ayuda && (
        <p id={idAyuda} className="text-sm text-muted-foreground">
          {ayuda}
        </p>
      )}
      {error && (
        <p id={idError} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Campo>
  )
}

export function CampoSeleccion({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, marcador, opciones, error }) {
  const idError = `${id}-error`
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Select value={valor} onValueChange={alCambiar} disabled={deshabilitado} name={id}>
        <SelectTrigger
          id={id}
          className="w-full bg-card"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? idError : undefined}
        >
          <SelectValue placeholder={marcador} />
        </SelectTrigger>
        <SelectContent>
          {opciones.map((opcion) => (
            <SelectItem key={opcion.valor} value={opcion.valor}>
              {opcion.texto}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && (
        <p id={idError} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </Campo>
  )
}

// Campos del empleado que comparten el registro y la edición. Los valores son texto; los Select usan NINGUNO.
// Con establecimiento, el municipio se muestra como texto porque el backend lo toma del establecimiento.
// `errores` viene de erroresDeEmpleado; el mensaje de un campo aparece cuando la persona sale de él por primera vez,
// o en todos a la vez con `mostrarErrores` (después de intentar enviar).
// El CUI guardado nunca se muestra: con `cuiRegistrado` se ve "Registrado" y el campo solo aparece para reemplazarlo.
export default function CamposEmpleado({
  empleado, alCambiar, errores = {}, mostrarErrores = false, correoObligatorio = false, cuiObligatorio = false,
  cuiRegistrado = false, reemplazandoCui = false, alReemplazarCui, establecimientos, municipios, ddrissNombre,
  deshabilitado,
}) {
  const [tocados, setTocados] = useState({})
  const establecimiento = establecimientos.find((e) => String(e.id) === empleado.establecimientoId)

  const texto = (campo) => ({
    valor: empleado[campo],
    alCambiar: alCambiar(campo),
    onBlur: () => setTocados((actual) => (actual[campo] ? actual : { ...actual, [campo]: true })),
    error: tocados[campo] || mostrarErrores ? errores[campo] : undefined,
    deshabilitado,
  })

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CampoTexto id="nombres" etiqueta="Nombres" obligatorio {...texto('nombres')} maxLength={100} />
      <CampoTexto id="apellidos" etiqueta="Apellidos" obligatorio {...texto('apellidos')} maxLength={100} />
      {cuiRegistrado && !reemplazandoCui ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">CUI (DPI)</span>
          <div className="flex flex-wrap items-center gap-2 py-1">
            <Badge variant="secondary">Registrado</Badge>
            <Button type="button" variant="outline" size="sm" onClick={() => alReemplazarCui(true)}
              disabled={deshabilitado}>
              Reemplazar CUI
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {/* 13 dígitos con hasta 4 espacios o guiones. */}
          <CampoTexto id="cui" etiqueta="CUI (DPI)" obligatorio={cuiObligatorio} {...texto('cui')} inputMode="numeric"
            autoComplete="off" maxLength={17} ayuda={AYUDA_CUI} />
          {reemplazandoCui && (
            <div>
              <Button type="button" variant="ghost" size="sm" disabled={deshabilitado} onClick={() => {
                alCambiar('cui')('')
                alReemplazarCui(false)
              }}>
                Cancelar
              </Button>
            </div>
          )}
        </div>
      )}
      <CampoTexto id="cargo" etiqueta="Cargo" {...texto('cargo')} maxLength={100} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" obligatorio={correoObligatorio} {...texto('correo')}
        maxLength={150} />
      <CampoTexto id="telefono" etiqueta="Teléfono" type="tel" {...texto('telefono')} maxLength={20} />

      {ddrissNombre !== undefined && (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">DDRISS</span>
          <span data-testid="ddriss" className="py-1.5 text-sm">{ddrissNombre ?? '—'}</span>
        </div>
      )}

      <CampoSeleccion
        id="establecimiento"
        etiqueta="Establecimiento"
        valor={empleado.establecimientoId}
        alCambiar={alCambiar('establecimientoId')}
        deshabilitado={deshabilitado}
        opciones={[
          { valor: NINGUNO, texto: 'Sin establecimiento (personal de la DDRISS)' },
          ...establecimientos.map((e) => ({ valor: String(e.id), texto: e.nombre })),
        ]}
      />

      {establecimiento ? (
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-semibold">Municipio</span>
          <span data-testid="municipio-establecimiento" className="py-1.5 text-sm">
            {establecimiento.municipioNombre}
          </span>
        </div>
      ) : (
        <CampoSeleccion
          id="municipio"
          etiqueta="Municipio"
          valor={empleado.municipioId}
          alCambiar={alCambiar('municipioId')}
          deshabilitado={deshabilitado}
          opciones={[
            { valor: NINGUNO, texto: 'Sin municipio' },
            ...municipios.map((m) => ({ valor: String(m.id), texto: m.nombre })),
          ]}
        />
      )}
    </div>
  )
}
