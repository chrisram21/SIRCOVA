import { useCallback, useEffect, useState } from 'react'
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
import { crearMunicipio, listarDepartamentos, renombrarMunicipio } from '@/api/catalogos.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import { LARGOS, validarCodigoIne, validarNombreMunicipio } from '@/validaciones/campos.js'

const MENSAJE_DEPARTAMENTO = 'Elija el departamento del municipio.'

// Sin municipio, registra uno nuevo; con municipio, solo cambia su nombre (el código INE y el departamento no
// cambian). Quien lo abre lo monta de nuevo en cada apertura, así el formulario empieza limpio.
export default function DialogoMunicipio({ municipio, alGuardar, alCerrar }) {
  const renombrando = Boolean(municipio)
  const [departamentos, setDepartamentos] = useState([])
  const [errorDepartamentos, setErrorDepartamentos] = useState(null)
  const [departamentoId, setDepartamentoId] = useState('')
  const [codigoIne, setCodigoIne] = useState('')
  const [nombre, setNombre] = useState(municipio?.nombre ?? '')
  const [errores, setErrores] = useState({})
  const [errorApi, setErrorApi] = useState(null)
  const [guardando, setGuardando] = useState(false)

  const cargarDepartamentos = useCallback(async () => {
    setErrorDepartamentos(null)
    try {
      setDepartamentos(await listarDepartamentos())
    } catch (err) {
      setErrorDepartamentos(mensajeDeError(err))
    }
  }, [])

  useEffect(() => {
    if (!renombrando) cargarDepartamentos()
  }, [renombrando, cargarDepartamentos])

  const departamento = departamentos.find((d) => String(d.id) === departamentoId)

  async function guardar(evento) {
    evento.preventDefault()
    const validacionNombre = validarNombreMunicipio(nombre)
    const validacionCodigo = renombrando ? {} : validarCodigoIne(codigoIne)
    const nuevosErrores = {
      departamento: !renombrando && !departamentoId ? MENSAJE_DEPARTAMENTO : undefined,
      codigoIne: validacionCodigo.error,
      nombre: validacionNombre.error,
    }
    setErrores(nuevosErrores)
    if (Object.values(nuevosErrores).some(Boolean)) return

    setGuardando(true)
    setErrorApi(null)
    try {
      const guardado = renombrando
        ? await renombrarMunicipio(municipio.id, validacionNombre.valor)
        : await crearMunicipio({
          departamentoId: Number(departamentoId),
          codigoIne: validacionCodigo.valor,
          nombre: validacionNombre.valor,
        })
      alGuardar(guardado)
    } catch (err) {
      // El Dialog sigue abierto para corregir y volver a intentar.
      setErrorApi(mensajeDeError(err))
      setGuardando(false)
    }
  }

  const describirCodigo = [departamento && 'municipio-codigo-ayuda', errores.codigoIne && 'municipio-codigo-error']
    .filter(Boolean)
    .join(' ')

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && !guardando && alCerrar()}>
      <DialogContent>
        <form className="flex flex-col gap-4" onSubmit={guardar} noValidate>
          <DialogHeader>
            <DialogTitle>{renombrando ? 'Renombrar municipio' : 'Registrar municipio'}</DialogTitle>
            <DialogDescription>
              {renombrando
                ? 'Solo se puede cambiar el nombre; el código INE y el departamento no cambian.'
                : 'El código INE y el departamento no se pueden cambiar después.'}
            </DialogDescription>
          </DialogHeader>

          {errorApi && <AvisoError>{errorApi}</AvisoError>}

          {renombrando ? (
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Código INE</dt>
              <dd className="font-medium">{municipio.codigoIne}</dd>
              <dt className="text-muted-foreground">Departamento</dt>
              <dd className="font-medium">{municipio.departamentoNombre}</dd>
            </dl>
          ) : (
            <>
              {errorDepartamentos && (
                <AvisoError onReintentar={cargarDepartamentos}>
                  No se pudieron cargar los departamentos: {errorDepartamentos}
                </AvisoError>
              )}
              <div className="flex flex-col gap-2">
                <Label htmlFor="municipio-departamento" className="font-semibold">
                  Departamento
                </Label>
                <Select
                  name="departamentoId"
                  value={departamentoId}
                  onValueChange={setDepartamentoId}
                  disabled={guardando || departamentos.length === 0}
                >
                  <SelectTrigger
                    id="municipio-departamento"
                    className="w-full"
                    aria-invalid={errores.departamento ? true : undefined}
                    aria-describedby={errores.departamento ? 'municipio-departamento-error' : undefined}
                  >
                    <SelectValue placeholder="Elija un departamento" />
                  </SelectTrigger>
                  <SelectContent>
                    {departamentos.map((d) => (
                      <SelectItem key={d.id} value={String(d.id)}>
                        {d.codigoIne} · {d.nombre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errores.departamento && (
                  <p id="municipio-departamento-error" className="text-sm text-destructive">
                    {errores.departamento}
                  </p>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="municipio-codigo" className="font-semibold">
                  Código INE
                </Label>
                <Input
                  id="municipio-codigo"
                  value={codigoIne}
                  inputMode="numeric"
                  onChange={(evento) => setCodigoIne(evento.target.value)}
                  disabled={guardando}
                  aria-invalid={errores.codigoIne ? true : undefined}
                  aria-describedby={describirCodigo || undefined}
                />
                {departamento && (
                  <p id="municipio-codigo-ayuda" className="text-sm text-muted-foreground">
                    Empieza con {departamento.codigoIne}.
                  </p>
                )}
                {errores.codigoIne && (
                  <p id="municipio-codigo-error" className="text-sm text-destructive">
                    {errores.codigoIne}
                  </p>
                )}
              </div>
            </>
          )}

          <div className="flex flex-col gap-2">
            <Label htmlFor="municipio-nombre" className="font-semibold">
              Nombre
            </Label>
            <Input
              id="municipio-nombre"
              value={nombre}
              maxLength={LARGOS.nombreMunicipio}
              onChange={(evento) => setNombre(evento.target.value)}
              disabled={guardando}
              aria-invalid={errores.nombre ? true : undefined}
              aria-describedby={errores.nombre ? 'municipio-nombre-error' : undefined}
            />
            {errores.nombre && (
              <p id="municipio-nombre-error" className="text-sm text-destructive">
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
