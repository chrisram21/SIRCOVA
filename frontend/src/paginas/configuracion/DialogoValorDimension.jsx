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
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agregarValorDimension } from '@/api/configuracion.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import {
  LARGOS,
  validarCodigoValorDimension,
  validarEdadMeses,
  validarEtiquetaValorDimension,
} from '@/validaciones/campos.js'
import { CampoTexto } from '../usuarios/CamposEmpleado.jsx'

function erroresDe(esRango, datos) {
  const errores = {}
  if (esRango && !datos.codigo) errores.codigo = 'Elija el grupo de población.'
  else {
    const { error } = validarCodigoValorDimension(datos.codigo)
    if (error) errores.codigo = error
  }
  const { error } = validarEtiquetaValorDimension(datos.etiqueta)
  if (error) errores.etiqueta = error
  if (esRango) {
    const minimo = validarEdadMeses(datos.edadMinMeses)
    const maximo = validarEdadMeses(datos.edadMaxMeses)
    if (minimo.error) errores.edadMinMeses = minimo.error
    if (maximo.error) errores.edadMaxMeses = maximo.error
    if (!minimo.error && !maximo.error && minimo.valor >= maximo.valor) {
      errores.edadMaxMeses = 'La edad mínima debe ser menor que la máxima.'
    }
  }
  return errores
}

function armarCuerpo(esRango, datos) {
  const cuerpo = {
    codigo: validarCodigoValorDimension(datos.codigo).valor,
    etiqueta: validarEtiquetaValorDimension(datos.etiqueta).valor,
  }
  if (!esRango) return cuerpo
  return {
    ...cuerpo,
    edadMinMeses: validarEdadMeses(datos.edadMinMeses).valor,
    edadMaxMeses: validarEdadMeses(datos.edadMaxMeses).valor,
  }
}

// Agrega un valor al final de la dimensión. En la RANGO_EDAD el código se elige entre los grupos de la
// clasificación de población que la dimensión todavía no tiene. Quien lo abre lo monta de nuevo en cada apertura.
export default function DialogoValorDimension({ dimension, alGuardar, alCerrar }) {
  const esRango = dimension.tipo === 'RANGO_EDAD'
  const grupos = dimension.gruposPoblacionDisponibles ?? []
  const [datos, setDatos] = useState({ codigo: '', etiqueta: '', edadMinMeses: '', edadMaxMeses: '' })
  const [intentado, setIntentado] = useState(false)
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const errores = erroresDe(esRango, datos)
  const errorDe = (campo) => (intentado ? errores[campo] : undefined)
  const cambiar = (campo) => (valor) => setDatos((actual) => ({ ...actual, [campo]: valor }))
  const texto = (campo) => ({
    valor: datos[campo],
    alCambiar: cambiar(campo),
    error: errorDe(campo),
    deshabilitado: guardando,
  })

  // La etiqueta sugerida es la descripción del grupo, si la persona todavía no escribió una.
  function elegirGrupo(codigo) {
    const grupo = grupos.find((g) => g.codigo === codigo)
    setDatos((actual) => ({ ...actual, codigo, etiqueta: actual.etiqueta.trim() ? actual.etiqueta : grupo.descripcion }))
  }

  async function guardar(evento) {
    evento.preventDefault()
    setIntentado(true)
    if (guardando || Object.keys(errores).length > 0) return
    setGuardando(true)
    setErrorApi(null)
    const cuerpo = armarCuerpo(esRango, datos)
    try {
      const actualizada = await agregarValorDimension(dimension.codigo, cuerpo)
      alGuardar(actualizada, `Valor ${cuerpo.codigo} agregado.`)
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
            <DialogTitle>Agregar valor</DialogTitle>
            <DialogDescription>
              {esRango
                ? 'El grupo debe existir en la clasificación de población. El código y el rango de edad no se pueden cambiar después.'
                : 'El valor va al final de la dimensión. El código no se puede cambiar después.'}
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          {esRango ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="grupo-poblacion" className="font-semibold">
                Grupo de población<span aria-hidden="true">*</span>
              </Label>
              <Select name="grupo-poblacion" value={datos.codigo} onValueChange={elegirGrupo} disabled={guardando}>
                <SelectTrigger
                  id="grupo-poblacion"
                  className="w-full"
                  aria-invalid={errorDe('codigo') ? true : undefined}
                  aria-describedby={errorDe('codigo') ? 'grupo-poblacion-error' : undefined}
                >
                  <SelectValue placeholder="Elija el grupo" />
                </SelectTrigger>
                <SelectContent>
                  {grupos.map((g) => (
                    <SelectItem key={g.codigo} value={g.codigo}>
                      {g.codigo} · {g.descripcion}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errorDe('codigo') && (
                <p id="grupo-poblacion-error" className="text-sm text-destructive">
                  {errorDe('codigo')}
                </p>
              )}
            </div>
          ) : (
            <CampoTexto
              id="valor-codigo"
              etiqueta="Código"
              obligatorio
              {...texto('codigo')}
              maxLength={LARGOS.codigoValorDimension}
              autoComplete="off"
              ayuda="Mayúsculas, números y guion bajo."
            />
          )}

          <CampoTexto
            id="valor-etiqueta"
            etiqueta="Etiqueta"
            obligatorio
            {...texto('etiqueta')}
            maxLength={LARGOS.etiquetaValorDimension}
          />

          {esRango && (
            <div className="grid gap-4 sm:grid-cols-2">
              <CampoTexto
                id="valor-edad-minima"
                etiqueta="Edad mínima (meses)"
                obligatorio
                {...texto('edadMinMeses')}
                inputMode="numeric"
              />
              <CampoTexto
                id="valor-edad-maxima"
                etiqueta="Edad máxima (meses)"
                obligatorio
                {...texto('edadMaxMeses')}
                inputMode="numeric"
              />
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={alCerrar} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Agregar valor'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
