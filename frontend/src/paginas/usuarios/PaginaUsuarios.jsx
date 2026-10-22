import { useEffect, useState } from 'react'
import { CircleAlert, CircleCheck, MoreHorizontal, UserPlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import {
  desactivarCuenta,
  desbloquearCuenta,
  listarUsuarios,
  restablecerContrasena,
  restaurarCuenta,
} from '@/api/usuarios.js'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoContrasenaTemporal from './DialogoContrasenaTemporal.jsx'

// Listado mínimo de HU-05; la búsqueda, los filtros y la paginación llegan con HU-07.
export default function PaginaUsuarios() {
  const { sesion, tienePermiso } = useSesion()
  const [cuentas, setCuentas] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [aviso, setAviso] = useState(null)
  const [enProceso, setEnProceso] = useState(null)
  const [porDesactivar, setPorDesactivar] = useState(null)
  const [porRestablecer, setPorRestablecer] = useState(null)
  // Solo mientras el diálogo está abierto; al cerrarlo la contraseña sale del estado.
  const [temporal, setTemporal] = useState(null)

  useEffect(() => {
    let vigente = true
    listarUsuarios()
      .then((lista) => vigente && setCuentas(lista))
      .catch((err) => vigente && setErrorCarga(err.mensaje))
    return () => {
      vigente = false
    }
  }, [])

  const puedeEditar = tienePermiso('USUARIO_EDITAR')
  const puedeDesactivar = tienePermiso('USUARIO_DESACTIVAR')
  const puedeDesbloquear = tienePermiso('USUARIO_DESBLOQUEAR')
  const puedeRestablecer = tienePermiso('USUARIO_RESTABLECER_CONTRASENA')

  // Opciones del menú "Más acciones" de una fila; sin opciones, la fila no muestra el menú.
  function opcionesDe(cuenta, propia) {
    const opciones = []
    if (cuenta.activo && puedeDesactivar && !propia) {
      opciones.push({ etiqueta: 'Desactivar', alElegir: () => setPorDesactivar(cuenta) })
    }
    if (!cuenta.activo && puedeDesactivar) {
      opciones.push({
        etiqueta: 'Restaurar',
        alElegir: () =>
          ejecutar(cuenta, restaurarCuenta, `Se restauró la cuenta ${cuenta.nombreUsuario}.`, 'Restaurando…'),
      })
    }
    // Una desactivada no se desbloquea: el backend responde 409 y "Restaurar" ya quita el bloqueo.
    if (cuenta.activo && cuenta.bloqueada && puedeDesbloquear) {
      opciones.push({
        etiqueta: 'Desbloquear',
        alElegir: () =>
          ejecutar(cuenta, desbloquearCuenta, `Se desbloqueó la cuenta ${cuenta.nombreUsuario}.`, 'Desbloqueando…'),
      })
    }
    // La propia se cambia con "Cambiar contraseña", que pide la actual.
    if (cuenta.activo && puedeRestablecer && !propia) {
      opciones.push({ etiqueta: 'Restablecer contraseña', alElegir: () => setPorRestablecer(cuenta) })
    }
    return opciones
  }

  async function ejecutar(cuenta, accion, mensajeExito, textoEnCurso) {
    setEnProceso({ id: cuenta.id, texto: textoEnCurso })
    setAviso(null)
    try {
      const actualizada = await accion(cuenta.id)
      setCuentas((lista) => lista.map((c) => (c.id === actualizada.id ? actualizada : c)))
      setAviso({ tipo: 'exito', mensaje: mensajeExito })
    } catch (err) {
      setAviso({ tipo: 'error', mensaje: err.mensaje })
    } finally {
      setEnProceso(null)
    }
  }

  async function confirmarDesactivacion(evento) {
    // Radix cierra el diálogo al pulsar; se cierra a mano al terminar, para mostrar "Desactivando…" mientras tanto.
    evento.preventDefault()
    await ejecutar(
      porDesactivar,
      desactivarCuenta,
      `Se desactivó la cuenta ${porDesactivar.nombreUsuario}.`,
      'Desactivando…',
    )
    setPorDesactivar(null)
  }

  async function confirmarRestablecimiento(evento) {
    evento.preventDefault()
    const cuenta = porRestablecer
    await ejecutar(
      cuenta,
      async (id) => {
        const { usuario, contrasenaTemporal } = await restablecerContrasena(id)
        setTemporal({ nombreUsuario: usuario.nombreUsuario, contrasena: contrasenaTemporal })
        return usuario
      },
      `Se restableció la contraseña de ${cuenta.nombreUsuario}.`,
      'Restableciendo…',
    )
    setPorRestablecer(null)
  }

  return (
    <section className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Usuarios</h1>
        {tienePermiso('EMPLEADO_CREAR') && (
          <Button asChild>
            <Link to="/usuarios/nuevo">
              <UserPlus />
              Registrar personal
            </Link>
          </Button>
        )}
      </div>

      {aviso?.tipo === 'exito' && (
        <Alert role="status" className="border-ring/40 bg-accent text-accent-foreground">
          <CircleCheck />
          <AlertDescription className="text-accent-foreground">{aviso.mensaje}</AlertDescription>
        </Alert>
      )}
      {aviso?.tipo === 'error' && (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>{aviso.mensaje}</AlertDescription>
        </Alert>
      )}

      {errorCarga ? (
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudieron cargar las cuentas: {errorCarga}</AlertDescription>
        </Alert>
      ) : cuentas === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando cuentas">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : cuentas.length === 0 ? (
        <p className="text-muted-foreground">No hay cuentas registradas en su DDRISS.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nombre</TableHead>
                <TableHead>Usuario</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead>Establecimiento</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cuentas.map((cuenta) => {
                const propia = cuenta.id === sesion?.usuario?.id
                const ocupada = enProceso?.id === cuenta.id
                const opciones = opcionesDe(cuenta, propia)
                return (
                  <TableRow key={cuenta.id}>
                    <TableCell>
                      <div className="font-medium">
                        {cuenta.empleado.nombres} {cuenta.empleado.apellidos}
                      </div>
                      {cuenta.empleado.cargo && (
                        <div className="text-sm text-muted-foreground">{cuenta.empleado.cargo}</div>
                      )}
                    </TableCell>
                    <TableCell>{cuenta.nombreUsuario}</TableCell>
                    <TableCell>{cuenta.rolNombre}</TableCell>
                    <TableCell>{cuenta.empleado.establecimientoNombre ?? 'DDRISS'}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {cuenta.activo ? (
                          <Badge variant="secondary">Activa</Badge>
                        ) : (
                          <Badge variant="outline">Desactivada</Badge>
                        )}
                        {cuenta.bloqueada && <Badge variant="destructive">Bloqueada</Badge>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {ocupada && enProceso.texto && (
                          <span className="text-sm text-muted-foreground">{enProceso.texto}</span>
                        )}
                        {cuenta.activo && puedeEditar && (
                          <Button variant="outline" size="sm" asChild>
                            <Link to={`/usuarios/${cuenta.id}/editar`}>Editar</Link>
                          </Button>
                        )}
                        {opciones.length > 0 && (
                          // No modal: así el AlertDialog que abre una opción no hereda el bloqueo del menú.
                          <DropdownMenu modal={false}>
                            <DropdownMenuTrigger asChild>
                              <Button variant="outline" size="icon-sm" aria-label="Más acciones" disabled={ocupada}>
                                <MoreHorizontal />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              {opciones.map((opcion) => (
                                <DropdownMenuItem key={opcion.etiqueta} onSelect={opcion.alElegir}>
                                  {opcion.etiqueta}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={porDesactivar !== null} onOpenChange={(abierto) => !abierto && !enProceso && setPorDesactivar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desactivar la cuenta {porDesactivar?.nombreUsuario}?</AlertDialogTitle>
            <AlertDialogDescription>
              No podrá iniciar sesión y su sesión abierta se cerrará. Sus acciones pasadas siguen en la bitácora.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enProceso !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={enProceso !== null} onClick={confirmarDesactivacion}>
              {enProceso !== null ? 'Desactivando…' : 'Desactivar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={porRestablecer !== null}
        onOpenChange={(abierto) => !abierto && !enProceso && setPorRestablecer(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer la contraseña de {porRestablecer?.nombreUsuario}?</AlertDialogTitle>
            <AlertDialogDescription>
              La contraseña actual dejará de funcionar. El sistema generará una temporal que la persona deberá cambiar
              al iniciar sesión.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={enProceso !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={enProceso !== null} onClick={confirmarRestablecimiento}>
              {enProceso !== null ? 'Restableciendo…' : 'Restablecer'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {temporal && (
        <DialogoContrasenaTemporal
          nombreUsuario={temporal.nombreUsuario}
          contrasena={temporal.contrasena}
          alCerrar={() => setTemporal(null)}
        />
      )}
    </section>
  )
}
