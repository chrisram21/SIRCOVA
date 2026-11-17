import { listarBitacora } from '@/api/auditoria.js'
import { listarEsquemas } from '@/api/configuracion.js'
import { listarUsuarios } from '@/api/usuarios.js'
import {
  ENTIDADES_CATALOGO,
  consultaDe,
  etiquetaAccion,
  etiquetaEntidad,
  fechaHora,
  ultimosDias,
} from '@/paginas/auditoria/auditoria.js'
import TarjetaResumen, { Cifra, useConsulta } from '../TarjetaResumen.jsx'
import { TarjetasDelInicio } from '../TarjetaSinDatos.jsx'

// Solo interesa el total: se pide una fila por estado.
async function consultarUsuarios() {
  const [activas, bloqueadas] = await Promise.all([
    listarUsuarios({ estado: 'ACTIVA', porPagina: 1 }),
    listarUsuarios({ estado: 'BLOQUEADA', porPagina: 1 }),
  ])
  return { activas: activas.total, bloqueadas: bloqueadas.total }
}

function TarjetaUsuarios({ titulo, tono }) {
  const consulta = useConsulta(consultarUsuarios)
  return (
    <TarjetaResumen titulo={titulo} tono={tono} consulta={consulta} enlace={{ a: '/administracion/usuarios', texto: 'Ver usuarios' }}>
      {({ activas, bloqueadas }) => (
        <Cifra valor={activas}>
          {bloqueadas === 0 ? 'Ninguna cuenta bloqueada' : `${bloqueadas} ${bloqueadas === 1 ? 'bloqueada' : 'bloqueadas'} por intentos fallidos`}
        </Cifra>
      )}
    </TarjetaResumen>
  )
}

// Una fila por vacuna (GET /esquemas-captura): cuántas activas tienen esquema vigente y cuántos borradores esperan.
async function consultarEsquemas() {
  const filas = await listarEsquemas()
  const activas = filas.filter((fila) => fila.vacuna.activa)
  return {
    activas: activas.length,
    conVigente: activas.filter((fila) => fila.vigente).length,
    borradores: filas.filter((fila) => fila.borrador).length,
  }
}

function TarjetaEsquemas({ titulo, tono }) {
  const consulta = useConsulta(consultarEsquemas)
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={{ a: '/administracion/esquemas', texto: 'Ver esquemas' }}
    >
      {({ activas, conVigente, borradores }) => {
        const sinEsquema = activas - conVigente
        const partes = [
          sinEsquema === 0 ? 'Todas las vacunas activas tienen esquema' : `${sinEsquema} sin esquema vigente`,
          borradores > 0 && `${borradores} ${borradores === 1 ? 'borrador' : 'borradores'} por publicar`,
        ].filter(Boolean)
        return (
          <Cifra valor={conVigente} de={activas}>
            {partes.join(' · ')}
          </Cifra>
        )
      }}
    </TarjetaResumen>
  )
}

// SPEC 70 (HU-54): las dos tarjetas de la bitácora leen los últimos 7 días con porPagina=1 (el total, el resumen y la
// fila más reciente) y enlazan a «Auditoría» con los mismos filtros.
const DIAS_RECIENTES = 7
const FILTRO_CATALOGOS = { modulo: 'CONFIGURACION', entidad: ENTIDADES_CATALOGO.join(',') }

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`
const enlaceAuditoria = (filtros) => `/auditoria?${consultaDe(filtros)}`

async function consultarActividad() {
  const rango = ultimosDias(DIAS_RECIENTES)
  const { total, resumen } = await listarBitacora({ ...rango, porPagina: 1 })
  return { rango, total, usuarios: resumen.usuarios, fallidos: resumen.accesosFallidos }
}

function TarjetaActividad({ titulo, tono }) {
  const consulta = useConsulta(consultarActividad)
  const rango = consulta.datos?.rango
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={rango && { a: enlaceAuditoria(rango), texto: 'Ver bitácora' }}
    >
      {({ total, usuarios, fallidos }) => (
        <>
          <Cifra valor={total}>
            {`${total === 1 ? 'registro' : 'registros'} en los últimos ${DIAS_RECIENTES} días · `}
            {plural(usuarios, 'usuario', 'usuarios')}
          </Cifra>
          {fallidos > 0 && (
            <p className="self-start rounded-md bg-advertencia px-2 py-1 text-sm text-advertencia-foreground">
              {plural(fallidos, 'acceso fallido o denegado', 'accesos fallidos o denegados')}
            </p>
          )}
        </>
      )}
    </TarjetaResumen>
  )
}

async function consultarCatalogos() {
  const rango = ultimosDias(DIAS_RECIENTES)
  const { total, elementos } = await listarBitacora({ ...rango, ...FILTRO_CATALOGOS, porPagina: 1 })
  return { rango, total, ultimo: elementos[0] ?? null }
}

function TarjetaCatalogos({ titulo, tono }) {
  const consulta = useConsulta(consultarCatalogos)
  const rango = consulta.datos?.rango
  return (
    <TarjetaResumen
      titulo={titulo}
      tono={tono}
      consulta={consulta}
      enlace={rango && { a: enlaceAuditoria({ ...rango, ...FILTRO_CATALOGOS }), texto: 'Ver cambios' }}
    >
      {({ total, ultimo }) => (
        <>
          <Cifra valor={total}>
            {total === 0
              ? `Sin cambios en los últimos ${DIAS_RECIENTES} días`
              : `${total === 1 ? 'cambio' : 'cambios'} en los últimos ${DIAS_RECIENTES} días`}
          </Cifra>
          {ultimo && (
            <p className="text-sm text-muted-foreground">
              Último: {etiquetaAccion(ultimo.accion)} de {etiquetaEntidad(ultimo.entidad).toLowerCase()} ·{' '}
              {fechaHora(ultimo.fecha)}
            </p>
          )}
        </>
      )}
    </TarjetaResumen>
  )
}

const TARJETAS = [
  { titulo: 'Usuarios activos', Datos: TarjetaUsuarios, permisos: ['USUARIO_CONSULTAR'] },
  { titulo: 'Esquemas de captura vigentes o por vencer', Datos: TarjetaEsquemas, permisos: ['ESQUEMA_CONSULTAR'] },
  { titulo: 'Cambios en catálogos', Datos: TarjetaCatalogos, permisos: ['BITACORA_CONSULTAR'] },
  { titulo: 'Actividad de la bitácora', Datos: TarjetaActividad, permisos: ['BITACORA_CONSULTAR'] },
]

export default function InicioAdministrador() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
