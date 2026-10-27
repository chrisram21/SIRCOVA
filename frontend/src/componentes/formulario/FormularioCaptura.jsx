import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const formatoCantidad = new Intl.NumberFormat('es-GT')
const ENTERO = /^\d+$/

// Una cantidad vacía cuenta como 0; una que no es entero ≥ 0 se marca y no suma.
export const leerCantidad = (texto) => {
  const limpio = texto.trim()
  if (limpio === '') return { valida: true, valor: 0 }
  return ENTERO.test(limpio) ? { valida: true, valor: Number(limpio) } : { valida: false, valor: 0 }
}

// La etiqueta de una columna, de arriba abajo por los niveles del encabezado: "< 1 año · Masculino".
export function etiquetaDeColumna(encabezados, indice) {
  return encabezados
    .map((nivel) => {
      let inicio = 0
      for (const { etiqueta, columnas } of nivel) {
        if (indice < inicio + columnas) return etiqueta
        inicio += columnas
      }
      return null
    })
    .filter(Boolean)
    .join(' · ')
}

function TablaCaptura({ tabla, cantidades, alCambiar, soloLectura }) {
  const { encabezados, columnas, filas } = tabla
  const niveles = Math.max(encabezados.length, 1)
  const leer = (fila, celda) => leerCantidad(cantidades[`${fila.dosis}|${celda.claveCombinacion}`] ?? '')
  const totalFila = (fila) => fila.celdas.reduce((suma, celda) => suma + (celda ? leer(fila, celda).valor : 0), 0)
  const totalColumna = (j) => filas.reduce((suma, fila) => suma + (fila.celdas[j] ? leer(fila, fila.celdas[j]).valor : 0), 0)
  const total = filas.reduce((suma, fila) => suma + totalFila(fila), 0)

  return (
    <div className="flex flex-col gap-2">
      {(tabla.titulo || tabla.seccion) && (
        <p className="text-sm font-medium">{[tabla.titulo, tabla.seccion].filter(Boolean).join(' · ')}</p>
      )}
      <Table aria-label={tabla.titulo ?? 'Dosis'}>
        <TableHeader>
          {(encabezados.length > 0 ? encabezados : [[{ etiqueta: 'Cantidad', columnas: 1 }]]).map((nivel, n) => (
            <TableRow key={n}>
              {n === 0 && <TableHead rowSpan={niveles}>Dosis</TableHead>}
              {nivel.map(({ etiqueta, columnas: abarca }, i) => (
                <TableHead key={i} colSpan={abarca} className="text-center">
                  {etiqueta}
                </TableHead>
              ))}
              {n === 0 && (
                <TableHead rowSpan={niveles} className="text-right">
                  Total
                </TableHead>
              )}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {filas.map((fila) => (
            <TableRow key={fila.dosis}>
              <TableCell className="font-medium">{fila.etiqueta}</TableCell>
              {fila.celdas.map((celda, j) => {
                const columna = etiquetaDeColumna(encabezados, j)
                const nombre = columna ? `${fila.etiqueta} · ${columna}` : fila.etiqueta
                if (!celda) {
                  return (
                    <TableCell key={j} className="text-center text-muted-foreground" aria-label={`${nombre}: no aplica`}>
                      —
                    </TableCell>
                  )
                }
                const clave = `${fila.dosis}|${celda.claveCombinacion}`
                const texto = cantidades[clave] ?? ''
                return (
                  <TableCell key={j} className="text-center">
                    <Input
                      aria-label={nombre}
                      inputMode="numeric"
                      value={texto}
                      disabled={soloLectura}
                      aria-invalid={!leerCantidad(texto).valida || undefined}
                      onChange={(e) => alCambiar(clave, e.target.value)}
                      className="w-20 text-right font-mono"
                    />
                  </TableCell>
                )
              })}
              <TableCell className="text-right font-mono" aria-label={`Total de ${fila.etiqueta}`}>
                {formatoCantidad.format(totalFila(fila))}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell className="font-medium">Total</TableCell>
            {columnas.map((_, j) => {
              const columna = etiquetaDeColumna(encabezados, j)
              return (
                <TableCell
                  key={j}
                  className="text-center font-mono"
                  aria-label={columna ? `Total de ${columna}` : 'Total de la columna'}
                >
                  {formatoCantidad.format(totalColumna(j))}
                </TableCell>
              )
            })}
            <TableCell className="text-right font-mono" aria-label="Total general">
              {formatoCantidad.format(total)}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  )
}

// formulario: lo que devuelve armarFormulario. Sin cantidades ni alCambiar (la vista previa), las cantidades viven
// aquí y nunca salen del componente; con ellas (la captura), las guarda el padre con la llave {dosis}|{clave}.
export default function FormularioCaptura({ formulario, cantidades, alCambiar, soloLectura = false }) {
  const [propias, setPropias] = useState({})
  const controlado = cantidades !== undefined
  const cambiar = controlado ? alCambiar : (clave, texto) => setPropias((previas) => ({ ...previas, [clave]: texto }))

  if (formulario.tablas.length === 0) {
    return <p className="text-sm text-muted-foreground">El esquema todavía no arma ninguna celda.</p>
  }
  return (
    <div className="flex flex-col gap-6 overflow-x-auto">
      {formulario.tablas.map((tabla) => (
        <TablaCaptura
          key={tabla.clave}
          tabla={tabla}
          cantidades={controlado ? cantidades : propias}
          alCambiar={cambiar}
          soloLectura={soloLectura}
        />
      ))}
    </div>
  )
}

// Una opción de una lista puede venir como texto o como { valor | codigo, etiqueta }.
const aOpcion = (opcion) =>
  typeof opcion === 'object' && opcion !== null
    ? { valor: String(opcion.valor ?? opcion.codigo), etiqueta: opcion.etiqueta ?? String(opcion.valor ?? opcion.codigo) }
    : { valor: String(opcion), etiqueta: String(opcion) }

function Campo({ campo, valor, alCambiar, soloLectura }) {
  const id = `campo-${campo.clave}`
  const etiqueta = `${campo.etiqueta}${campo.requerido ? ' (obligatorio)' : ''}`
  const ayuda = campo.ayuda ? `${id}-ayuda` : undefined
  let control
  if (campo.tipo === 'booleano') {
    control = (
      <Switch id={id} checked={valor === true} onCheckedChange={alCambiar} disabled={soloLectura} aria-describedby={ayuda} />
    )
  } else if (campo.tipo === 'lista') {
    control = (
      <Select value={valor ?? ''} onValueChange={alCambiar} disabled={soloLectura}>
        <SelectTrigger id={id} className="w-full sm:w-72" aria-describedby={ayuda}>
          <SelectValue placeholder="Seleccione una opción" />
        </SelectTrigger>
        <SelectContent>
          {(campo.opciones ?? []).map(aOpcion).map((o) => (
            <SelectItem key={o.valor} value={o.valor}>
              {o.etiqueta}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  } else {
    const numerico = campo.tipo === 'entero' || campo.tipo === 'decimal'
    control = (
      <Input
        id={id}
        type={numerico ? 'number' : 'text'}
        step={campo.tipo === 'decimal' ? 'any' : numerico ? 1 : undefined}
        min={numerico ? (campo.minimo ?? undefined) : undefined}
        max={numerico ? (campo.maximo ?? undefined) : undefined}
        value={valor ?? ''}
        onChange={(e) => alCambiar(e.target.value)}
        disabled={soloLectura}
        aria-describedby={ayuda}
        className={numerico ? 'w-full font-mono sm:w-48' : 'w-full sm:w-96'}
      />
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{etiqueta}</Label>
      {control}
      {campo.ayuda && (
        <p id={ayuda} className="text-sm text-muted-foreground">
          {campo.ayuda}
        </p>
      )}
    </div>
  )
}

// Los campos adicionales del esquema, según su tipo. Igual que FormularioCaptura: sin valores ni alCambiar, sus
// valores no salen del componente; con ellos, alCambiar(clave, valor) avisa al padre.
export function CamposAdicionales({ campos, valores, alCambiar, soloLectura = false }) {
  const [propios, setPropios] = useState({})
  const controlado = valores !== undefined
  const actuales = controlado ? valores : propios
  const cambiar = controlado ? alCambiar : (clave, valor) => setPropios((previos) => ({ ...previos, [clave]: valor }))
  return (
    <div className="flex flex-col gap-4">
      {campos.map((campo) => (
        <Campo
          key={campo.clave}
          campo={campo}
          valor={actuales[campo.clave]}
          alCambiar={(valor) => cambiar(campo.clave, valor)}
          soloLectura={soloLectura}
        />
      ))}
    </div>
  )
}
