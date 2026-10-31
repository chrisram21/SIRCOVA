import { useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

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

// Cuántas casillas tiene el formulario, cuántas tienen un dato escrito y la suma de las cantidades válidas.
export function resumenDeCasillas(formulario, cantidades) {
  const resumen = { total: 0, llenas: 0, dosis: 0 }
  for (const { filas } of formulario.tablas) {
    for (const fila of filas) {
      for (const celda of fila.celdas) {
        if (!celda) continue
        const texto = cantidades[`${fila.dosis}|${celda.claveCombinacion}`] ?? ''
        resumen.total += 1
        if (texto.trim() !== '') resumen.llenas += 1
        resumen.dosis += leerCantidad(texto).valor
      }
    }
  }
  return resumen
}

// Enter y las flechas mueven el foco entre las casillas de la tabla, como en una hoja de cálculo. Cada casilla lleva
// data-fila y data-col; Enter al final de una columna sigue arriba de la siguiente.
export function moverEntreCasillas(evento) {
  const { key, shiftKey, currentTarget: campo } = evento
  const fila = Number(campo.dataset.fila)
  const col = Number(campo.dataset.col)
  const casillas = [...campo.closest('table').querySelectorAll('input[data-col]:not(:disabled)')].map((c) => ({
    c,
    fila: Number(c.dataset.fila),
    col: Number(c.dataset.col),
  }))
  const primera = (lista, orden) => lista.sort(orden)[0]
  let destino
  if (key === 'ArrowDown' || (key === 'Enter' && !shiftKey)) {
    destino =
      primera(casillas.filter((x) => x.col === col && x.fila > fila), (a, b) => a.fila - b.fila) ??
      (key === 'Enter' ? primera(casillas.filter((x) => x.col > col), (a, b) => a.col - b.col || a.fila - b.fila) : null)
  } else if (key === 'ArrowUp' || (key === 'Enter' && shiftKey)) {
    destino = primera(casillas.filter((x) => x.col === col && x.fila < fila), (a, b) => b.fila - a.fila)
  } else if (key === 'ArrowRight' && campo.selectionEnd === campo.value.length) {
    destino = primera(casillas.filter((x) => x.fila === fila && x.col > col), (a, b) => a.col - b.col)
  } else if (key === 'ArrowLeft' && campo.selectionStart === 0) {
    destino = primera(casillas.filter((x) => x.fila === fila && x.col < col), (a, b) => b.col - a.col)
  }
  if (!destino) return
  evento.preventDefault()
  destino.c.focus()
}

// Al entrar en una casilla se selecciona su contenido: lo que se escribe lo reemplaza.
export const seleccionarAlEntrar = (evento) => evento.target.select()

// La letra de cada tarjeta de la captura (A, B, C), como en el 5C.
export function LetraTarjeta({ children }) {
  return (
    <span
      aria-hidden="true"
      className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground shadow-tarjeta"
    >
      {children}
    </span>
  )
}

// Las celdas de cada nivel del encabezado con la columna en que empiezan.
const conInicio = (nivel) => {
  let inicio = 0
  return nivel.map((celda) => {
    const conSuInicio = { ...celda, inicio }
    inicio += celda.columnas
    return conSuInicio
  })
}

// El borde de una casilla señalada por la validación (SPEC 33); la tarjeta B usa las mismas.
export const CLASES_MARCA = {
  ERROR: 'border-destructive ring-1 ring-destructive/40',
  ADVERTENCIA: 'border-advertencia-foreground/60 bg-advertencia text-advertencia-foreground',
}

function TablaCaptura({ tabla, cantidades, alCambiar, soloLectura, marcas }) {
  const { encabezados, columnas, filas } = tabla
  const niveles = Math.max(encabezados.length, 1)
  // La casilla con el foco: su fila y su columna se resaltan para saber qué se está llenando.
  const [foco, setFoco] = useState(null)
  const leer = (fila, celda) => leerCantidad(cantidades[`${fila.dosis}|${celda.claveCombinacion}`] ?? '')
  const totalFila = (fila) => fila.celdas.reduce((suma, celda) => suma + (celda ? leer(fila, celda).valor : 0), 0)
  const totalColumna = (j) => filas.reduce((suma, fila) => suma + (fila.celdas[j] ? leer(fila, fila.celdas[j]).valor : 0), 0)
  const total = filas.reduce((suma, fila) => suma + totalFila(fila), 0)

  const nivelesConInicio = (encabezados.length > 0 ? encabezados : [[{ etiqueta: 'Cantidad', columnas: 1 }]]).map(conInicio)
  // Una línea separa los grupos del primer nivel del encabezado (por ejemplo, cada grupo de edad).
  const iniciosDeGrupo = new Set(nivelesConInicio[0].map(({ inicio }) => inicio))
  const separa = (j) => iniciosDeGrupo.has(j) && 'border-l'
  const enFoco = (inicio, abarca) => foco !== null && foco.col >= inicio && foco.col < inicio + abarca

  return (
    <div className="flex flex-col gap-2">
      {(tabla.titulo || tabla.seccion) && (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ring" />
          {[tabla.titulo, tabla.seccion].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table aria-label={tabla.titulo ?? 'Dosis'}>
          <TableHeader>
            {nivelesConInicio.map((nivel, n) => {
              // El último nivel, si hay más de uno, es el detalle (por ejemplo, el sexo dentro del grupo de edad).
              const detalle = nivelesConInicio.length > 1 && n === nivelesConInicio.length - 1
              return (
                <TableRow key={n} className="hover:bg-transparent">
                  {n === 0 && (
                    <TableHead rowSpan={niveles} className="sticky left-0 z-[2] min-w-32 bg-card">
                      Dosis
                    </TableHead>
                  )}
                  {nivel.map(({ etiqueta, columnas: abarca, inicio }, i) => (
                    <TableHead
                      key={i}
                      colSpan={abarca}
                      className={cn(
                        'h-auto py-2 text-center transition-colors duration-150',
                        separa(inicio),
                        detalle
                          ? 'text-xs leading-tight font-medium whitespace-normal text-muted-foreground'
                          : 'bg-accent/40 font-semibold text-accent-foreground',
                        enFoco(inicio, abarca) && 'bg-accent text-accent-foreground',
                      )}
                    >
                      {etiqueta}
                    </TableHead>
                  ))}
                  {n === 0 && (
                    <TableHead rowSpan={niveles} className="border-l bg-muted/60 text-right">
                      Total
                    </TableHead>
                  )}
                </TableRow>
              )
            })}
          </TableHeader>
          <TableBody>
            {filas.map((fila, i) => (
              <TableRow key={fila.dosis} className={cn('hover:bg-transparent', foco?.fila === i && 'bg-accent/25')}>
                <TableCell
                  className={cn(
                    'sticky left-0 z-[1] bg-card font-medium transition-colors duration-150',
                    foco?.fila === i && 'bg-accent text-accent-foreground',
                  )}
                >
                  {fila.etiqueta}
                </TableCell>
                {fila.celdas.map((celda, j) => {
                  const columna = etiquetaDeColumna(encabezados, j)
                  const nombre = columna ? `${fila.etiqueta} · ${columna}` : fila.etiqueta
                  if (!celda) {
                    return (
                      <TableCell
                        key={j}
                        className={cn('fondo-no-aplica text-center text-muted-foreground/50', separa(j))}
                        aria-label={`${nombre}: no aplica`}
                      >
                        —
                      </TableCell>
                    )
                  }
                  const clave = `${fila.dosis}|${celda.claveCombinacion}`
                  const texto = cantidades[clave] ?? ''
                  const valida = leerCantidad(texto).valida
                  const marca = marcas[clave]
                  return (
                    <TableCell
                      key={j}
                      className={cn('px-1.5 text-center', separa(j), foco?.col === j && foco.fila !== i && 'bg-accent/25')}
                    >
                      <Input
                        aria-label={nombre}
                        inputMode="numeric"
                        autoComplete="off"
                        data-fila={i}
                        data-col={j}
                        data-celda={clave}
                        value={texto}
                        disabled={soloLectura}
                        aria-invalid={!valida || marca === 'ERROR' || undefined}
                        title={valida ? undefined : 'Escriba un número entero, de 0 en adelante.'}
                        onChange={(e) => alCambiar(clave, e.target.value)}
                        onFocus={(e) => {
                          seleccionarAlEntrar(e)
                          setFoco({ fila: i, col: j })
                        }}
                        onBlur={() => setFoco(null)}
                        onKeyDown={moverEntreCasillas}
                        className={cn(
                          'mx-auto h-9 w-full max-w-24 min-w-14 bg-card text-center font-mono transition-colors',
                          valida && texto.trim() !== '' && 'border-ring/50 bg-accent font-semibold text-accent-foreground',
                          valida && CLASES_MARCA[marca],
                        )}
                      />
                    </TableCell>
                  )
                })}
                <TableCell
                  className="border-l bg-muted/40 text-right font-mono font-semibold"
                  aria-label={`Total de ${fila.etiqueta}`}
                >
                  {formatoCantidad.format(totalFila(fila))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow className="hover:bg-transparent">
              <TableCell className="sticky left-0 z-[1] bg-muted font-semibold">Total</TableCell>
              {columnas.map((_, j) => {
                const columna = etiquetaDeColumna(encabezados, j)
                return (
                  <TableCell
                    key={j}
                    className={cn('text-center font-mono font-semibold', separa(j))}
                    aria-label={columna ? `Total de ${columna}` : 'Total de la columna'}
                  >
                    {formatoCantidad.format(totalColumna(j))}
                  </TableCell>
                )
              })}
              <TableCell className="border-l bg-accent text-right font-mono font-bold text-accent-foreground" aria-label="Total general">
                {formatoCantidad.format(total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

// formulario: lo que devuelve armarFormulario. Sin cantidades ni alCambiar (la vista previa), las cantidades viven
// aquí y nunca salen del componente; con ellas (la captura), las guarda el padre con la llave {dosis}|{clave}.
// marcas: la severidad de la validación por llave (ERROR o ADVERTENCIA); la vista previa no la pasa.
export default function FormularioCaptura({ formulario, cantidades, alCambiar, soloLectura = false, marcas = {} }) {
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
          marcas={marcas}
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
