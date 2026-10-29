import { lazy } from 'react'
import {
  Bell,
  ChartLine,
  ClipboardCheck,
  ClipboardPen,
  FileSpreadsheet,
  FileText,
  House,
  MapIcon,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from 'lucide-react'
import PaginaInicio from '@/paginas/inicio/PaginaInicio.jsx'

// Cada pantalla se descarga al entrar en ella (Layout la espera con Suspense); Inicio va incluida, porque es la primera.
const PaginaConfiguracion = lazy(() => import('@/paginas/configuracion/PaginaConfiguracion.jsx'))
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
const PaginaEditarUsuario = lazy(() => import('@/paginas/usuarios/PaginaEditarUsuario.jsx'))
const PaginaRegistrarPersonal = lazy(() => import('@/paginas/usuarios/PaginaRegistrarPersonal.jsx'))
const PaginaUsuarios = lazy(() => import('@/paginas/usuarios/PaginaUsuarios.jsx'))
const PaginaRegistro = lazy(() => import('@/paginas/registro/PaginaRegistro.jsx'))
const PaginaMisReportes = lazy(() => import('@/paginas/reportes/PaginaMisReportes.jsx'))

// Los permisos son provisionales: el spec que construye cada pantalla confirma su código al crearlo en
// backend/db/05_permisos_mysql.sql y pone su componente en `pagina` (sin `pagina`, se ve "En construcción").
// `descripcion` acompaña al acceso rápido del Inicio.
// `subrutas` son pantallas con permiso propio que no aparecen en el menú; su opción queda activa en ellas.
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
    titulo: 'Usuarios',
    descripcion: 'El personal, sus cuentas y sus roles.',
    ruta: '/usuarios',
    permiso: 'USUARIO_CONSULTAR',
    icono: Users,
    pagina: PaginaUsuarios,
    subrutas: [
      { titulo: 'Registrar personal', ruta: '/usuarios/nuevo', permiso: 'EMPLEADO_CREAR', pagina: PaginaRegistrarPersonal },
      { titulo: 'Editar usuario', ruta: '/usuarios/:id/editar', permiso: 'USUARIO_EDITAR', pagina: PaginaEditarUsuario },
    ],
  },
  {
    titulo: 'Configuración',
    descripcion: 'Territorio, establecimientos, vacunas, esquemas y periodos.',
    ruta: '/configuracion',
    permiso: 'CONFIGURACION_CONSULTAR',
    icono: Settings,
    pagina: PaginaConfiguracion,
    subrutas: [
      {
        titulo: 'Registrar establecimiento',
        ruta: '/configuracion/establecimientos/nuevo',
        permiso: 'ESTABLECIMIENTO_CREAR',
        pagina: PaginaRegistrarEstablecimiento,
      },
      {
        titulo: 'Editar establecimiento',
        ruta: '/configuracion/establecimientos/:id/editar',
        permiso: 'ESTABLECIMIENTO_EDITAR',
        pagina: PaginaEditarEstablecimiento,
      },
      {
        titulo: 'Registrar vacuna',
        ruta: '/configuracion/vacunas/nueva',
        permiso: 'VACUNA_CREAR',
        pagina: PaginaRegistrarVacuna,
      },
      {
        titulo: 'Editar vacuna',
        ruta: '/configuracion/vacunas/:id/editar',
        permiso: 'VACUNA_EDITAR',
        pagina: PaginaEditarVacuna,
      },
      {
        titulo: 'Registrar dimensión',
        ruta: '/configuracion/dimensiones/nueva',
        permiso: 'DIMENSION_CREAR',
        pagina: PaginaRegistrarDimension,
      },
      {
        titulo: 'Editar dimensión',
        ruta: '/configuracion/dimensiones/:codigo/editar',
        permiso: 'DIMENSION_EDITAR',
        pagina: PaginaEditarDimension,
      },
      {
        titulo: 'Nuevo borrador de esquema',
        ruta: '/configuracion/esquemas/nuevo',
        permiso: 'ESQUEMA_CREAR',
        pagina: PaginaRegistrarEsquema,
      },
      {
        titulo: 'Editar borrador de esquema',
        ruta: '/configuracion/esquemas/:id/editar',
        permiso: 'ESQUEMA_EDITAR',
        pagina: PaginaEditarEsquema,
      },
      // Los segmentos fijos (nuevo, historial) ganan sobre :id en React Router.
      {
        titulo: 'Historial de esquemas',
        ruta: '/configuracion/esquemas/historial/:vacunaId',
        permiso: 'ESQUEMA_CONSULTAR',
        pagina: PaginaHistorialEsquemas,
      },
      {
        titulo: 'Versión de esquema',
        ruta: '/configuracion/esquemas/:id',
        permiso: 'ESQUEMA_CONSULTAR',
        pagina: PaginaVerEsquema,
      },
    ],
  },
  {
    titulo: 'Roles y permisos',
    descripcion: 'Qué puede hacer cada rol.',
    ruta: '/permisos',
    permiso: 'PERMISO_CONSULTAR',
    icono: ShieldCheck,
  },
]

export default opcionesMenu
