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
import { guardarPoblacion } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { validarCantidadPoblacion, validarFuentePoblacion } from '@/validaciones/campos.js'

const GRUPO_VACIO = 'Un grupo ya registrado no se puede dejar vacío.'
const SIN_GRUPOS = 'Debe registrar al menos un grupo.'

// La fuente actual solo se muestra si todos los grupos registrados tienen la misma.
function fuenteComun(poblacion) {
  const fuentes = new Set(Object.values(poblacion).map((registro) => registro.fuente ?? ''))
  return fuentes.size === 1 ? [...fuentes][0] : ''
}

// Solo se mandan los grupos con número; un grupo ya registrado no se puede vaciar porque el backend nunca borra.
function leerFormulario(grupos, poblacion, valores) {
  const errores = {}
  const cantidades = {}
  for (const { codigo } of grupos) {
    const texto = valores[codigo].trim()
    if (texto === '') {
      if (poblacion[codigo]) errores[codigo] = GRUPO_VACIO
      continue
    }
    const { valor, error } = validarCantidadPoblacion(texto)
    if (error) errores[codigo] = error
    else cantidades[codigo] = valor
  }
  return { errores, cantidades }
}

// Quien lo abre lo monta de nuevo en cada apertura, así empieza con la población actual del municipio.
export default function DialogoPoblacion({ municipio, anio, grupos, alGuardar, alCerrar }) {
  const [valores, setValores] = useState(() =>
    Object.fromEntries(grupos.map(({ codigo }) => [codigo, String(municipio.poblacion[codigo]?.cantidad ?? '')])),
  )
  const [fuente, setFuente] = useState(() => fuenteComun(municipio.poblacion))
  const [errores, setErrores] = useState({})
  const [errorGeneral, setErrorGeneral] = useState(null)
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  async function guardar(evento) {
    evento.preventDefault()
    const { errores: erroresGrupos, cantidades } = leerFormulario(grupos, municipio.poblacion, valores)
    const fuenteLeida = validarFuentePoblacion(fuente)
    const nuevosErrores = { ...erroresGrupos, ...(fuenteLeida.error ? { fuente: fuenteLeida.error } : {}) }
    const sinGrupos = Object.keys(erroresGrupos).length === 0 && Object.keys(cantidades).length === 0
    setErrores(nuevosErrores)
    setErrorGeneral(sinGrupos ? SIN_GRUPOS : null)
    if (sinGrupos || Object.keys(nuevosErrores).length > 0) return

    setGuardando(true)
    setErrorApi(null)
    try {
      // Una fuente vacía no se manda: las filas existentes conservan la suya.
      const cuerpo = { grupos: cantidades }
      if (fuenteLeida.valor !== null) cuerpo.fuente = fuenteLeida.valor
      alGuardar(await guardarPoblacion(municipio.id, anio, cuerpo))
    } catch (err) {
      // El Dialog sigue abierto y conserva lo escrito.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  const campo = (id, error) => ({
    id,
    disabled: guardando,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : undefined,
  })

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>
              Población de {municipio.nombre} {anio}
            </DialogTitle>
            <DialogDescription>
              Deje vacíos los grupos que el MSPAS no envió. Un grupo ya registrado se puede corregir, pero no vaciar.
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}
          {errorGeneral && <p className="text-sm text-destructive">{errorGeneral}</p>}

          <div className="grid gap-4 sm:grid-cols-2">
            {grupos.map(({ codigo, descripcion }) => {
              const id = `poblacion-${codigo}`
              return (
                <div key={codigo} className="flex flex-col gap-2">
                  <Label htmlFor={id} className="font-semibold">
                    {descripcion}
                  </Label>
                  <Input
                    {...campo(id, errores[codigo])}
                    inputMode="numeric"
                    value={valores[codigo]}
                    onChange={(evento) => setValores((actuales) => ({ ...actuales, [codigo]: evento.target.value }))}
                  />
                  {errores[codigo] && (
                    <p id={`${id}-error`} className="text-sm text-destructive">
                      {errores[codigo]}
                    </p>
                  )}
                </div>
              )
            })}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="poblacion-fuente" className="font-semibold">
              Fuente <span className="font-normal text-muted-foreground">(opcional)</span>
            </Label>
            <Input
              {...campo('poblacion-fuente', errores.fuente)}
              placeholder="Archivo de población del MSPAS"
              value={fuente}
              onChange={(evento) => setFuente(evento.target.value)}
            />
            {errores.fuente && (
              <p id="poblacion-fuente-error" className="text-sm text-destructive">
                {errores.fuente}
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
