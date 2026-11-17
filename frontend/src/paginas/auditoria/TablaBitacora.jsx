import { Fragment, useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  COLORES_GRUPO,
  SIN_VALOR,
  etiquetaAccion,
  etiquetaEntidad,
  etiquetaModulo,
  fechaHora,
  filasDeCambios,
  grupoDe,
  tieneCambios,
} from './auditoria.js'

const COLUMNAS = 5

function DetalleRegistro({ registro }) {
  const cambios = filasDeCambios(registro.valoresAnteriores, registro.valoresNuevos)
  return (
    <div className="flex flex-col gap-3 py-2">
      {cambios.length > 0 ? (
        <div className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Campo</th>
                <th className="px-3 py-2 font-semibold">Valor anterior</th>
                <th className="px-3 py-2 font-semibold">Valor nuevo</th>
              </tr>
            </thead>
            <tbody>
              {cambios.map((fila) => (
                <tr key={fila.campo} className="border-t align-top">
                  <td className="px-3 py-2 font-mono text-xs">{fila.campo}</td>
                  <td className="px-3 py-2 break-all">{fila.anterior}</td>
                  <td className="px-3 py-2 break-all">{fila.nuevo}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Este registro no guarda valores anteriores ni nuevos.</p>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="font-semibold text-muted-foreground">IP</dt>
        <dd className="font-mono">{registro.ipOrigen ?? SIN_VALOR}</dd>
        <dt className="font-semibold text-muted-foreground">Agente</dt>
        <dd className="break-all">{registro.agenteUsuario ?? SIN_VALOR}</dd>
      </dl>
    </div>
  )
}

export default function TablaBitacora({ registros }) {
  const [abiertos, setAbiertos] = useState(() => new Set())

  function alternar(id) {
    setAbiertos((actuales) => {
      const siguientes = new Set(actuales)
      if (siguientes.has(id)) siguientes.delete(id)
      else siguientes.add(id)
      return siguientes
    })
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fecha y hora</TableHead>
          <TableHead>Usuario</TableHead>
          <TableHead>Acción</TableHead>
          <TableHead>Elemento afectado</TableHead>
          <TableHead>Detalle</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {registros.map((registro) => {
          const abierto = abiertos.has(registro.id)
          const idDetalle = `detalle-${registro.id}`
          // Sin valores, el detalle solo trae la IP y el agente.
          const textoBoton = `${abierto ? 'Ocultar' : 'Ver'} ${tieneCambios(registro) ? 'cambios' : 'detalle'}`
          return (
            <Fragment key={registro.id}>
              <TableRow className={cn('align-top', abierto && 'border-b-0 bg-muted/50')}>
                <TableCell className="font-mono text-xs whitespace-nowrap">{fechaHora(registro.fecha)}</TableCell>
                <TableCell className="whitespace-normal">
                  {registro.usuario ? (
                    <>
                      <span className="block font-medium">{registro.usuario.nombre}</span>
                      <span className="block text-xs text-muted-foreground">{registro.usuario.rol.nombre}</span>
                    </>
                  ) : (
                    <span className="block font-medium">Intento: {registro.nombreUsuarioIntento ?? SIN_VALOR}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge className={cn('whitespace-nowrap', COLORES_GRUPO[grupoDe(registro)])}>
                    {etiquetaAccion(registro.accion)}
                  </Badge>
                  <span className="mt-1 block text-xs text-muted-foreground">{etiquetaModulo(registro.modulo)}</span>
                </TableCell>
                <TableCell className="whitespace-normal">
                  <span className="block">{etiquetaEntidad(registro.entidad)}</span>
                  {registro.entidadId && (
                    <span className="block font-mono text-xs text-muted-foreground">#{registro.entidadId}</span>
                  )}
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    className="h-auto p-0 text-enlace"
                    aria-expanded={abierto}
                    aria-controls={abierto ? idDetalle : undefined}
                    onClick={() => alternar(registro.id)}
                  >
                    {textoBoton}
                    {abierto ? <ChevronUp aria-hidden="true" /> : <ChevronDown aria-hidden="true" />}
                  </Button>
                </TableCell>
              </TableRow>
              {abierto && (
                <TableRow id={idDetalle} className="bg-muted/50 hover:bg-muted/50">
                  <TableCell colSpan={COLUMNAS} className="whitespace-normal">
                    <DetalleRegistro registro={registro} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          )
        })}
      </TableBody>
    </Table>
  )
}
