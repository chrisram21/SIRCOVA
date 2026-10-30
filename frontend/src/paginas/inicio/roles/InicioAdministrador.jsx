import { listarEsquemas } from '@/api/configuracion.js'
import { listarUsuarios } from '@/api/usuarios.js'
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

const TARJETAS = [
  { titulo: 'Usuarios activos', Datos: TarjetaUsuarios, permisos: ['USUARIO_CONSULTAR'] },
  { titulo: 'Esquemas de captura vigentes o por vencer', Datos: TarjetaEsquemas, permisos: ['ESQUEMA_CONSULTAR'] },
  { titulo: 'Cambios en catálogos' },
  { titulo: 'Actividad de la bitácora' },
]

export default function InicioAdministrador() {
  return <TarjetasDelInicio tarjetas={TARJETAS} />
}
