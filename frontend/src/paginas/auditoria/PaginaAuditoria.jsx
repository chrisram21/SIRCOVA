import { useEffect, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import { FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { descargarBitacoraExcel, listarBitacora, obtenerOpcionesBitacora } from '@/api/auditoria.js'
import { mensajeDeError } from '@/api/cliente.js'
import { AvisoError } from '@/componentes/Avisos.jsx'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { guardarArchivo } from '@/lib/archivos.js'
import { cn } from '@/lib/utils'
import PaginacionUsuarios from '@/paginas/usuarios/PaginacionUsuarios.jsx'
import BarraFiltrosAuditoria from './BarraFiltrosAuditoria.jsx'
import TablaBitacora from './TablaBitacora.jsx'
import { consultaDe, filtrosDeUrl, pedidoDe, textosDelResumen, ultimosDias } from './auditoria.js'

const DESCRIPCION =
  'Cada acción sobre usuarios, reportes, catálogos y configuraciones queda registrada y no se puede editar.'

// SPEC 70 (HU-54): la bitácora de la DDRISS del Administrador. Los filtros y la página van en la URL; sin fechas en
// la URL, los últimos 30 días. «Exportar resultados» descarga lo filtrado (sin paginar) como .xlsx.
export default function PaginaAuditoria() {
  const { pathname } = useLocation()
  const [parametros, setParametros] = useSearchParams()
  const filtros = filtrosDeUrl(parametros)
  const clave = consultaDe(filtros)

  const [resultado, setResultado] = useState(null)
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState(null)
  const [intento, setIntento] = useState(0)
  const [opciones, setOpciones] = useState(null)
  const [errorOpciones, setErrorOpciones] = useState(null)
  const [intentoOpciones, setIntentoOpciones] = useState(0)
  const [exportando, setExportando] = useState(false)
  const [errorExportar, setErrorExportar] = useState(null)

  // Cualquier cambio que no sea de página vuelve a la página 1.
  function irA(cambios) {
    setErrorExportar(null)
    setParametros(new URLSearchParams(consultaDe({ ...filtros, pagina: 1, ...cambios })))
  }

  function aplicar(nuevos) {
    setErrorExportar(null)
    setParametros(new URLSearchParams(consultaDe({ ...nuevos, pagina: 1, porPagina: filtros.porPagina })))
  }

  // Sin parámetros vuelven los 30 días por defecto.
  function limpiar() {
    setErrorExportar(null)
    setParametros(new URLSearchParams())
  }

  const hrefDe = (pagina) => `${pathname}?${consultaDe({ ...filtros, pagina })}`

  useEffect(() => {
    let vigente = true
    setErrorOpciones(null)
    obtenerOpcionesBitacora()
      .then((respuesta) => vigente && setOpciones(respuesta))
      .catch((err) => vigente && setErrorOpciones(mensajeDeError(err)))
    return () => {
      vigente = false
    }
  }, [intentoOpciones])

  useEffect(() => {
    // Al cambiar la URL antes de que llegue la respuesta, la respuesta vieja se descarta.
    let vigente = true
    const pedidos = filtrosDeUrl(new URLSearchParams(clave))
    setCargando(true)
    setErrorCarga(null)
    listarBitacora({ ...pedidoDe(pedidos), pagina: pedidos.pagina, porPagina: pedidos.porPagina })
      .then((respuesta) => {
        if (!vigente) return
        if (respuesta.elementos.length === 0 && respuesta.total > 0) {
          const ultima = Math.ceil(respuesta.total / respuesta.porPagina)
          setParametros(new URLSearchParams(consultaDe({ ...pedidos, pagina: ultima })), { replace: true })
          return
        }
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
    // Sin setParametros: React Router crea uno nuevo en cada cambio de URL. intento cambia al recargar.
  }, [clave, intento])

  async function exportar() {
    setExportando(true)
    setErrorExportar(null)
    try {
      const { blob, nombre } = await descargarBitacoraExcel(pedidoDe(filtros))
      guardarArchivo(blob, nombre ?? 'bitacora.xlsx')
    } catch (err) {
      setErrorExportar(mensajeDeError(err))
    } finally {
      setExportando(false)
    }
  }

  const accesosRapidos = [
    { texto: 'Hoy', alElegir: () => irA(ultimosDias(1)) },
    { texto: 'Últimos 7 días', alElegir: () => irA(ultimosDias(7)) },
    { texto: 'Solo rectificaciones', alElegir: () => irA({ modulo: 'RECTIFICACION' }) },
  ]
  const resumen = resultado && textosDelResumen(resultado, filtros)

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina
        antetitulo="Auditoría y trazabilidad"
        titulo="Bitácora del sistema"
        descripcion={DESCRIPCION}
        acciones={
          <Button type="button" onClick={exportar} disabled={exportando} className="max-sm:w-full">
            <FileSpreadsheet aria-hidden="true" />
            {exportando ? 'Exportando…' : 'Exportar resultados'}
          </Button>
        }
      />

      {errorExportar && <AvisoError>No se pudo exportar: {errorExportar}</AvisoError>}

      <BarraFiltrosAuditoria
        filtros={filtros}
        opciones={opciones}
        alAplicar={aplicar}
        alLimpiar={limpiar}
        accesosRapidos={accesosRapidos}
      />

      {errorOpciones && (
        <AvisoError onReintentar={() => setIntentoOpciones((n) => n + 1)}>
          No se pudieron cargar las opciones de los filtros: {errorOpciones}
        </AvisoError>
      )}

      {errorCarga ? (
        <AvisoError onReintentar={() => setIntento((n) => n + 1)}>
          No se pudo cargar la bitácora: {errorCarga}
        </AvisoError>
      ) : resultado === null ? (
        <div className="flex flex-col gap-2" aria-label="Cargando la bitácora">
          {[1, 2, 3].map((n) => (
            <Skeleton key={n} className="h-10 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
            <p className="font-medium">{resumen[0]}</p>
            <p className="text-muted-foreground">{resumen[1]}</p>
          </div>
          {resultado.elementos.length === 0 ? (
            <p className="text-muted-foreground">No hay registros con estos filtros.</p>
          ) : (
            <>
              {/* Mientras llega otra página o filtro se sigue viendo la anterior, atenuada. */}
              <div
                className={cn('overflow-x-auto rounded-lg border bg-card transition-opacity', cargando && 'opacity-60')}
                aria-busy={cargando}
              >
                <TablaBitacora registros={resultado.elementos} />
              </div>
              <PaginacionUsuarios
                total={resultado.total}
                pagina={resultado.pagina}
                porPagina={resultado.porPagina}
                hrefDe={hrefDe}
                alCambiarPagina={(pagina) => irA({ pagina })}
                alCambiarPorPagina={(porPagina) => irA({ porPagina })}
              />
            </>
          )}
        </div>
      )}
    </section>
  )
}
