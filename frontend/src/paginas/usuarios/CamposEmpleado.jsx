import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

// Radix Select no acepta '' como valor de una opción.
export const NINGUNO = 'ninguno'

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

export function CampoTexto({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, ...props }) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Input
        id={id}
        value={valor}
        onChange={(evento) => alCambiar(evento.target.value)}
        disabled={deshabilitado}
        className="bg-card"
        {...props}
      />
    </Campo>
  )
}

export function CampoSeleccion({ id, etiqueta, obligatorio, valor, alCambiar, deshabilitado, marcador, opciones }) {
  return (
    <Campo id={id} etiqueta={etiqueta} obligatorio={obligatorio}>
      <Select value={valor} onValueChange={alCambiar} disabled={deshabilitado} name={id}>
        <SelectTrigger id={id} className="w-full bg-card">
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
    </Campo>
  )
}

// Campos del empleado que comparten el registro y la edición. Los valores son texto; los Select usan NINGUNO.
// Con establecimiento, el municipio se muestra como texto porque el backend lo toma del establecimiento.
export default function CamposEmpleado({ empleado, alCambiar, establecimientos, municipios, ddrissNombre, deshabilitado }) {
  const establecimiento = establecimientos.find((e) => String(e.id) === empleado.establecimientoId)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <CampoTexto id="nombres" etiqueta="Nombres" obligatorio valor={empleado.nombres}
        alCambiar={alCambiar('nombres')} deshabilitado={deshabilitado} maxLength={100} />
      <CampoTexto id="apellidos" etiqueta="Apellidos" obligatorio valor={empleado.apellidos}
        alCambiar={alCambiar('apellidos')} deshabilitado={deshabilitado} maxLength={100} />
      <CampoTexto id="codigo-empleado" etiqueta="Código de empleado" valor={empleado.codigoEmpleado}
        alCambiar={alCambiar('codigoEmpleado')} deshabilitado={deshabilitado} maxLength={20} />
      <CampoTexto id="cargo" etiqueta="Cargo" valor={empleado.cargo}
        alCambiar={alCambiar('cargo')} deshabilitado={deshabilitado} maxLength={100} />
      <CampoTexto id="correo" etiqueta="Correo" type="email" valor={empleado.correo}
        alCambiar={alCambiar('correo')} deshabilitado={deshabilitado} maxLength={150} />
      <CampoTexto id="telefono" etiqueta="Teléfono" type="tel" valor={empleado.telefono}
        alCambiar={alCambiar('telefono')} deshabilitado={deshabilitado} maxLength={20} />

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
