import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearDistrito, renombrarDistrito } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { LARGOS, validarNombreDistrito } from '@/validaciones/campos.js'

const MENSAJE_MUNICIPIO = 'Elija el municipio del distrito.'

// Sin distrito, registra uno nuevo; con distrito, solo cambia su nombre (el código y el municipio no cambian).
// Quien lo abre lo monta de nuevo en cada apertura, así el formulario empieza limpio.
export default function DialogoDistrito({ distrito, municipios, alGuardar, alCerrar }) {
  const renombrando = Boolean(distrito)
  const [nombre, setNombre] = useState(distrito?.nombre ?? '')
  const [municipioId, setMunicipioId] = useState('')
  const [errores, setErrores] = useState({})
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    const validacion = validarNombreDistrito(nombre)
    const nuevosErrores = {
      nombre: validacion.error,
      municipio: !renombrando && !municipioId ? MENSAJE_MUNICIPIO : undefined,
    }
    setErrores(nuevosErrores)
    if (nuevosErrores.nombre || nuevosErrores.municipio) return

    setGuardando(true)
    setErrorApi(null)
    try {
      const guardado = renombrando
        ? await renombrarDistrito(distrito.id, validacion.valor)
        : await crearDistrito({ municipioId: Number(municipioId), nombre: validacion.valor })
      alGuardar(guardado)
    } catch (err) {
      // El Dialog sigue abierto para corregir y volver a intentar.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>{renombrando ? 'Renombrar distrito' : 'Registrar distrito'}</DialogTitle>
            <DialogDescription>
              {renombrando
                ? 'Solo se puede cambiar el nombre; el código y el municipio no cambian.'
                : 'El código se genera al guardar.'}
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          {renombrando ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Código</dt>
              <dd className="font-medium">{distrito.codigo}</dd>
              <dt className="text-muted-foreground">Municipio</dt>
              <dd className="font-medium">{distrito.municipioNombre}</dd>
            </dl>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="distrito-municipio" className="font-semibold">
                Municipio
              </Label>
              <Select name="municipioId" value={municipioId} onValueChange={setMunicipioId} disabled={guardando}>
                <SelectTrigger
                  id="distrito-municipio"
                  className="w-full"
                  aria-invalid={errores.municipio ? true : undefined}
                  aria-describedby={errores.municipio ? 'distrito-municipio-error' : undefined}
                >
                  <SelectValue placeholder="Elija un municipio" />
                </SelectTrigger>
                <SelectContent>
                  {municipios.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errores.municipio && (
                <p id="distrito-municipio-error" className="text-sm text-destructive">
                  {errores.municipio}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="distrito-nombre" className="font-semibold">
              Nombre
            </Label>
            <Input
              id="distrito-nombre"
              value={nombre}
              maxLength={LARGOS.nombreDistrito}
              onChange={(evento) => setNombre(evento.target.value)}
              disabled={guardando}
              aria-invalid={errores.nombre ? true : undefined}
              aria-describedby={errores.nombre ? 'distrito-nombre-error' : undefined}
            />
            {errores.nombre && (
              <p id="distrito-nombre-error" className="text-sm text-destructive">
                {errores.nombre}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
