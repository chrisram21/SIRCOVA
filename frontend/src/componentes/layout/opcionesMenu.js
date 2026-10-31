import { lazy } from 'react'
import {
  Bell,
  Building2,
  CalendarDays,
  ChartLine,
  ClipboardCheck,
  ClipboardPen,
  FileCog,
  FileSpreadsheet,
  FileText,
  House,
  LandPlot,
  Layers,
  ListChecks,
  MapIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  Syringe,
  Users,
  UsersRound,
} from 'lucide-react'
import PaginaInicio from '@/paginas/inicio/PaginaInicio.jsx'

// Cada pantalla se descarga al entrar en ella (Layout la espera con Suspense); Inicio va incluida, porque es la primera.
const PaginaTerritorio = lazy(() => import('@/paginas/configuracion/PaginaTerritorio.jsx'))
const PaginaBandejaRevision = lazy(() => import('@/paginas/revision/PaginaBandejaRevision.jsx'))
const PaginaEstablecimientos = lazy(() => import('@/paginas/configuracion/PaginaEstablecimientos.jsx'))
const PaginaVacunas = lazy(() => import('@/paginas/configuracion/PaginaVacunas.jsx'))
const PaginaDimensiones = lazy(() => import('@/paginas/configuracion/PaginaDimensiones.jsx'))
const PaginaEsquemas = lazy(() => import('@/paginas/configuracion/PaginaEsquemas.jsx'))
const PaginaPeriodos = lazy(() => import('@/paginas/configuracion/PaginaPeriodos.jsx'))
const PaginaPoblacion = lazy(() => import('@/paginas/configuracion/PaginaPoblacion.jsx'))
const PaginaEditarEstablecimiento = lazy(() => import('@/paginas/configuracion/PaginaEditarEstablecimiento.jsx'))
const PaginaRegistrarEstablecimiento = lazy(() => import('@/paginas/configuracion/PaginaRegistrarEstablecimiento.jsx'))
const PaginaEditarVacuna = lazy(() => import('@/paginas/configuracion/PaginaEditarVacuna.jsx'))
const PaginaRegistrarVacuna = lazy(() => import('@/paginas/configuracion/PaginaRegistrarVacuna.jsx'))
const PaginaRegistrarDimension = lazy(() => import('@/paginas/configuracion/PaginaRegistrarDimension.jsx'))
const PaginaEditarDimension = lazy(() => import('@/paginas/configuracion/PaginaEditarDimension.jsx'))
const PaginaRegistrarEsquema = lazy(() => import('@/paginas/configuracion/PaginaRegistrarEsquema.jsx'))
const PaginaEditarEsquema = lazy(() => import('@/paginas/configuracion/PaginaEditarEsquema.jsx'))
const PaginaHistorialEsquemas = lazy(() => import('@/paginas/configuracion/PaginaHistorialEsquemas.jsx'))
const PaginaVerEsquema = lazy(() => import('@/paginas/configuracion/PaginaVerEsquema.jsx'))
const PaginaReglas = lazy(() => import('@/paginas/configuracion/PaginaReglas.jsx'))
const PaginaEditarUsuario = lazy(() => import('@/paginas/usuarios/PaginaEditarUsuario.jsx'))
const PaginaRegistrarPersonal = lazy(() => import('@/paginas/usuarios/PaginaRegistrarPersonal.jsx'))
const PaginaUsuarios = lazy(() => import('@/paginas/usuarios/PaginaUsuarios.jsx'))
const PaginaRegistro = lazy(() => import('@/paginas/registro/PaginaRegistro.jsx'))
const PaginaMisReportes = lazy(() => import('@/paginas/reportes/PaginaMisReportes.jsx'))

export const RUTA_ADMINISTRACION = '/administracion'

// Los permisos son provisionales: el spec que construye cada pantalla confirma su código al crearlo en
// backend/db/05_permisos_mysql.sql y pone su componente en `pagina` (sin `pagina`, se ve "En construcción").
// `descripcion` acompaña al acceso rápido del Inicio.
// `subrutas` son pantallas con permiso propio que no aparecen en el menú; su opción queda activa en ellas.
// `hijos` (SPEC 30) hace de la opción un padre desplegable sin pantalla propia; cada hijo pide todos sus `permisos`.
const opcionesMenu = [
  { titulo: 'Inicio', ruta: '/inicio', permiso: null, icono: House, pagina: PaginaInicio },
  {
    titulo: 'Registro de producción',
    descripcion: 'Captura mensual de las dosis aplicadas, por vacuna.',
    ruta: '/registro',
    permiso: 'REPORTE_CONSULTAR',
    icono: ClipboardPen,
    pagina: PaginaRegistro,
  },
  {
    titulo: 'Mis reportes',
    descripcion: 'El estado de los reportes de cada mes.',
    ruta: '/reportes',
    permiso: 'REPORTE_CONSULTAR',
    icono: FileText,
    pagina: PaginaMisReportes,
  },
  {
    titulo: 'Revisión y cierre',
    descripcion: 'Revisión, aprobación y cierre de los reportes.',
    ruta: '/revision',
    permiso: 'REPORTE_REVISAR',
    icono: ClipboardCheck,
    pagina: PaginaBandejaRevision,
  },
  {
    titulo: 'Indicadores',
    descripcion: 'Cobertura, brecha, deserción y proyección por municipio y vacuna.',
    ruta: '/indicadores',
    permiso: 'INDICADOR_CONSULTAR',
    icono: ChartLine,
  },
  {
    titulo: 'Mapa territorial',
    descripcion: 'Dónde se concentra el rezago en los municipios.',
    ruta: '/mapa',
    permiso: 'MAPA_CONSULTAR',
    icono: MapIcon,
  },
  {
    titulo: 'Informes',
    descripcion: 'Informe consolidado mensual y anual, en Excel y PDF.',
    ruta: '/informes',
    permiso: 'INFORME_CONSULTAR',
    icono: FileSpreadsheet,
  },
  {
    titulo: 'Alertas',
    descripcion: 'Avisos de calidad de los datos y del proceso.',
    ruta: '/alertas',
    permiso: 'ALERTA_CONSULTAR',
    icono: Bell,
  },
  {
    titulo: 'Auditoría',
    descripcion: 'La bitácora de lo que se hace en el sistema.',
    ruta: '/auditoria',
    permiso: 'BITACORA_CONSULTAR',
    icono: ScrollText,
  },
  {
    titulo: 'Administración',
    ruta: RUTA_ADMINISTRACION,
    icono: Settings,
    hijos: [
      {
        titulo: 'Usuarios',
        descripcion: 'El personal, sus cuentas y sus roles.',
        ruta: '/administracion/usuarios',
        permisos: ['USUARIO_CONSULTAR'],
        icono: Users,
        pagina: PaginaUsuarios,
        subrutas: [
          {
            titulo: 'Registrar personal',
            ruta: '/administracion/usuarios/nuevo',
            permiso: 'EMPLEADO_CREAR',
            pagina: PaginaRegistrarPersonal,
          },
          {
            titulo: 'Editar usuario',
            ruta: '/administracion/usuarios/:id/editar',
            permiso: 'USUARIO_EDITAR',
            pagina: PaginaEditarUsuario,
          },
        ],
      },
      {
        titulo: 'Territorio',
        descripcion: 'La DDRISS, sus municipios y sus distritos de salud.',
        ruta: '/administracion/territorio',
        permisos: ['CONFIGURACION_CONSULTAR', 'DDRISS_CONSULTAR', 'MUNICIPIO_CONSULTAR', 'DISTRITO_CONSULTAR'],
        icono: LandPlot,
        pagina: PaginaTerritorio,
      },
      {
        titulo: 'Establecimientos',
        descripcion: 'Los establecimientos que reportan su producción.',
        ruta: '/administracion/establecimientos',
        permisos: ['CONFIGURACION_CONSULTAR', 'ESTABLECIMIENTO_CONSULTAR'],
        icono: Building2,
        pagina: PaginaEstablecimientos,
        subrutas: [
          {
            titulo: 'Registrar establecimiento',
            ruta: '/administracion/establecimientos/nuevo',
            permiso: 'ESTABLECIMIENTO_CREAR',
            pagina: PaginaRegistrarEstablecimiento,
          },
          {
            titulo: 'Editar establecimiento',
            ruta: '/administracion/establecimientos/:id/editar',
            permiso: 'ESTABLECIMIENTO_EDITAR',
            pagina: PaginaEditarEstablecimiento,
          },
        ],
      },
      {
        titulo: 'Vacunas',
        descripcion: 'Las vacunas y sus dosis.',
        ruta: '/administracion/vacunas',
        permisos: ['CONFIGURACION_CONSULTAR', 'VACUNA_CONSULTAR'],
        icono: Syringe,
        pagina: PaginaVacunas,
        subrutas: [
          {
            titulo: 'Registrar vacuna',
            ruta: '/administracion/vacunas/nueva',
            permiso: 'VACUNA_CREAR',
            pagina: PaginaRegistrarVacuna,
          },
          {
            titulo: 'Editar vacuna',
            ruta: '/administracion/vacunas/:id/editar',
            permiso: 'VACUNA_EDITAR',
            pagina: PaginaEditarVacuna,
          },
        ],
      },
      {
        titulo: 'Dimensiones',
        descripcion: 'Las dimensiones con que se desagregan las dosis.',
        ruta: '/administracion/dimensiones',
        permisos: ['CONFIGURACION_CONSULTAR', 'DIMENSION_CONSULTAR'],
        icono: Layers,
        pagina: PaginaDimensiones,
        subrutas: [
          {
            titulo: 'Registrar dimensión',
            ruta: '/administracion/dimensiones/nueva',
            permiso: 'DIMENSION_CREAR',
            pagina: PaginaRegistrarDimension,
          },
          {
            titulo: 'Editar dimensión',
            ruta: '/administracion/dimensiones/:codigo/editar',
            permiso: 'DIMENSION_EDITAR',
            pagina: PaginaEditarDimension,
          },
        ],
      },
      {
        titulo: 'Esquemas',
        descripcion: 'Los esquemas de captura de cada vacuna y sus versiones.',
        ruta: '/administracion/esquemas',
        // El editor de borradores lee las dosis de la vacuna y el catálogo de dimensiones.
        permisos: ['CONFIGURACION_CONSULTAR', 'ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR'],
        icono: FileCog,
        pagina: PaginaEsquemas,
        subrutas: [
          {
            titulo: 'Nuevo borrador de esquema',
            ruta: '/administracion/esquemas/nuevo',
            permiso: 'ESQUEMA_CREAR',
            pagina: PaginaRegistrarEsquema,
          },
          {
            titulo: 'Editar borrador de esquema',
            ruta: '/administracion/esquemas/:id/editar',
            permiso: 'ESQUEMA_EDITAR',
            pagina: PaginaEditarEsquema,
          },
          // Los segmentos fijos (nuevo, historial) ganan sobre :id en React Router.
          {
            titulo: 'Historial de esquemas',
            ruta: '/administracion/esquemas/historial/:vacunaId',
            permiso: 'ESQUEMA_CONSULTAR',
            pagina: PaginaHistorialEsquemas,
          },
          {
            titulo: 'Versión de esquema',
            ruta: '/administracion/esquemas/:id',
            permiso: 'ESQUEMA_CONSULTAR',
            pagina: PaginaVerEsquema,
          },
        ],
      },
      {
        titulo: 'Reglas de validación',
        descripcion: 'Los controles de calidad que se revisan antes de enviar un reporte.',
        ruta: '/administracion/reglas',
        // El editor elige las vacunas a las que aplica cada regla.
        permisos: ['CONFIGURACION_CONSULTAR', 'REGLA_CONSULTAR', 'VACUNA_CONSULTAR'],
        icono: ListChecks,
        pagina: PaginaReglas,
      },
      {
        titulo: 'Periodos',
        descripcion: 'El calendario de meses, su apertura y su cierre.',
        ruta: '/administracion/periodos',
        permisos: ['CONFIGURACION_CONSULTAR', 'PERIODO_CONSULTAR'],
        icono: CalendarDays,
        pagina: PaginaPeriodos,
      },
      {
        titulo: 'Población',
        descripcion: 'La población objetivo de cada municipio por año.',
        ruta: '/administracion/poblacion',
        // Los años del selector salen del calendario de periodos.
        permisos: ['CONFIGURACION_CONSULTAR', 'POBLACION_CONSULTAR', 'PERIODO_CONSULTAR'],
        icono: UsersRound,
        pagina: PaginaPoblacion,
      },
      {
        titulo: 'Roles y permisos',
        descripcion: 'Qué puede hacer cada rol.',
        ruta: '/administracion/permisos',
        permisos: ['PERMISO_CONSULTAR'],
        icono: ShieldCheck,
      },
    ],
  },
]

// Una opción se ve con su permiso (o sin él, si es null), un hijo con todos los suyos y un padre con alguno de sus
// hijos.
export function puedeVer(opcion, tienePermiso) {
  if (opcion.hijos) return opcion.hijos.some((hijo) => puedeVer(hijo, tienePermiso))
  if (opcion.permisos) return opcion.permisos.every(tienePermiso)
  return !opcion.permiso || tienePermiso(opcion.permiso)
}

// Las pantallas que App convierte en rutas: opciones, hijos y subrutas. El padre no tiene pantalla propia.
export function rutasDelMenu() {
  return opcionesMenu.flatMap((opcion) =>
    (opcion.hijos ?? [opcion]).flatMap((pantalla) => [pantalla, ...(pantalla.subrutas ?? [])]),
  )
}

export default opcionesMenu
