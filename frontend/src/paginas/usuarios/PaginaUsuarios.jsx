import { useEffect, useState } from 'react'
import { MoreHorizontal, UserPlus } from 'lucide-react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
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
import { mensajeDeError } from '@/api/cliente.js'
import {
  desactivarCuenta,
  desbloquearCuenta,
  listarUsuarios,
  restablecerContrasena,
  restaurarCuenta,
} from '@/api/usuarios.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import DialogoContrasenaTemporal from './DialogoContrasenaTemporal.jsx'
import FiltrosUsuarios from './FiltrosUsuarios.jsx'
import PaginacionUsuarios, { FILAS_POR_PAGINA } from './PaginacionUsuarios.jsx'

const POR_PAGINA_INICIAL = 20
const ESTADOS = ['ACTIVA', 'DESACTIVADA', 'BLOQUEADA']
const LARGO_BUSQUEDA = 100

const entero = (texto) => (/^\d+$/.test(texto ?? '') && Number(texto) >= 1 ? Number(texto) : undefined)

// Un valor inválido en la URL se ignora: a la API solo llegan filtros válidos.
export function filtrosDeUrl(parametros) {
  const busqueda = (parametros.get('busqueda') ?? '').trim().replace(/\s+/g, ' ')
  const establecimientoId = parametros.get('establecimientoId')
  const porPagina = Number(parametros.get('porPagina'))
  const filtros = {
    busqueda: busqueda && busqueda.length <= LARGO_BUSQUEDA ? busqueda : undefined,
    rolId: entero(parametros.get('rolId')),
    establecimientoId: establecimientoId === 'ninguno' ? 'ninguno' : entero(establecimientoId),
    estado: ESTADOS.includes(parametros.get('estado')) ? parametros.get('estado') : undefined,
    pagina: entero(parametros.get('pagina')) ?? 1,
    porPagina: FILAS_POR_PAGINA.includes(porPagina) ? porPagina : POR_PAGINA_INICIAL,
  }
  return Object.fromEntries(Object.entries(filtros).filter(([, valor]) => valor !== undefined))
}

// Los valores por defecto no se escriben en la URL.
function consultaDe(filtros) {
  const consulta = new URLSearchParams()
  for (const [nombre, valor] of Object.entries(filtros)) {
    if (valor === undefined || valor === '') continue
    if (nombre === 'pagina' && valor === 1) continue
    if (nombre === 'porPagina' && valor === POR_PAGINA_INICIAL) continue
    consulta.set(nombre, String(valor))
  }
  return consulta.toString()
}

export default function PaginaUsuarios() {
  const { sesion, tienePermiso } = useSesion()
  const { pathname, search } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const filtros = filtrosDeUrl(parametros)
  const clave = consultaDe(filtros)
  const hayFiltros = Boolean(filtros.busqueda || filtros.rolId || filtros.establecimientoId || filtros.estado)

  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intentoCarga, setIntentoCarga] = useState(0)
  const [errorAccion, setErrorAccion] = useState(null)
  const [enProceso, setEnProceso] = useState(null)
  const [porDesactivar, setPorDesactivar] = useState(null)
  const [porRestablecer, setPorRestablecer] = useState(null)
  // Solo mientras el diálogo está abierto; al cerrarlo la contraseña sale del estado.
  const [temporal, setTemporal] = useState(null)

  // Cualquier cambio que no sea de página vuelve a la página 1.
  function irA(cambios, { reemplazar = false } = {}) {
    setParametros(new URLSearchParams(consultaDe({ ...filtros, pagina: 1, ...cambios })), { replace: reemplazar })
  }

  const limpiarFiltros = () => setParametros(new URLSearchParams())
  // Editar y Registrar personal vuelven a la lista con los mismos filtros y la misma página.
  const estadoVolver = { volverA: { pathname, search } }

  function hrefDe(pagina) {
    const consulta = consultaDe({ ...filtros, pagina })
    return consulta ? `${pathname}?${consulta}` : pathname
  }

  useEffect(() => {
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    listarUsuarios(pedidos)
      .then((respuesta) => {
        if (!vigente) return
        if (respuesta.elementos.length === 0 && respuesta.total > 0) {
          const ultima = Math.ceil(respuesta.total / respuesta.porPagina)
          setParametros(new URLSearchParams(consultaDe({ ...pedidos, pagina: ultima })), { replace: true })
          return
        }
        setErrorCarga(null)
        setResultado(respuesta)
        setCargando(false)
      })
      .catch((err) => {
        if (!vigente) return
        setErrorCarga(mensajeDeError(err))
        setCargando(false)
      })
    return () => {
      vigente = false
    }
    // Sin setParametros: React Router crea uno nuevo en cada cambio de URL, y este escribe la URL completa.
  }, [clave, intentoCarga])

  function reintentarCarga() {
    setErrorCarga(null)
    setIntentoCarga((intento) => intento + 1)
  }

  const puedeEditar = tienePermiso('USUARIO_EDITAR')
  const puedeDesactivar = tienePermiso('USUARIO_DESACTIVAR')
  const puedeDesbloquear = tienePermiso('USUARIO_DESBLOQUEAR')
  const puedeRestablecer = tienePermiso('USUARIO_RESTABLECER_CONTRASENA')

  // Opciones del menú de acciones de una fila; sin opciones, la fila no muestra el menú.
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
    setErrorAccion(null)
    try {
      const actualizada = await accion(cuenta.id)
      // La fila se reemplaza en su lugar aunque ya no cumpla el filtro; no se vuelve a pedir la página.
      setResultado((actual) => ({
        ...actual,
        elementos: actual.elementos.map((c) => (c.id === actualizada.id ? actualizada : c)),
      }))
      toast.success(mensajeExito)
    } catch (err) {
      setErrorAccion(mensajeDeError(err))
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
      <EncabezadoPagina
        titulo="Usuarios"
        acciones={
          tienePermiso('EMPLEADO_CREAR') && (
            <Button asChild>
              <Link to="/usuarios/nuevo" state={estadoVolver}>
                <UserPlus />
                Registrar personal
              </Link>
            </Button>
          )
        }
      />

      <FiltrosUsuarios filtros={filtros} hayFiltros={hayFiltros} alCambiar={irA} alLimpiar={limpiarFiltros} />

      {errorAccion && <AvisoError>{errorAccion}</AvisoError>}

      {errorCarga ? (
        <AvisoError onReintentar={reintentarCarga}>No se pudieron cargar las cuentas: {errorCarga}</AvisoError>
      ) : resultado === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando cuentas">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : resultado.elementos.length === 0 ? (
        hayFiltros ? (
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-muted-foreground">No hay cuentas que coincidan con la búsqueda o los filtros.</p>
            <Button variant="ghost" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          </div>
        ) : (
          <p className="text-muted-foreground">No hay cuentas registradas en su DDRISS.</p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div className="overflow-x-auto rounded-lg border" aria-busy={cargando}>
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
                {resultado.elementos.map((cuenta) => {
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
                              <Link to={`/usuarios/${cuenta.id}/editar`} state={estadoVolver}>
                                Editar
                              </Link>
                            </Button>
                          )}
                          {opciones.length > 0 && (
                            // No modal: así el AlertDialog que abre una opción no hereda el bloqueo del menú.
                            <DropdownMenu modal={false}>
                              <DropdownMenuTrigger asChild>
                                <Button
                                  variant="outline"
                                  size="icon-sm"
                                  aria-label={`Acciones de ${cuenta.nombreUsuario}`}
                                  disabled={ocupada}
                                >
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
          <PaginacionUsuarios
            total={resultado.total}
            pagina={resultado.pagina}
            porPagina={resultado.porPagina}
            hrefDe={hrefDe}
            alCambiarPagina={(pagina) => irA({ pagina })}
            alCambiarPorPagina={(porPagina) => irA({ porPagina })}
          />
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
