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
import PaginaConfiguracion from '@/paginas/configuracion/PaginaConfiguracion.jsx'
import PaginaEditarEstablecimiento from '@/paginas/configuracion/PaginaEditarEstablecimiento.jsx'
import PaginaRegistrarEstablecimiento from '@/paginas/configuracion/PaginaRegistrarEstablecimiento.jsx'
import PaginaEditarVacuna from '@/paginas/configuracion/PaginaEditarVacuna.jsx'
import PaginaRegistrarVacuna from '@/paginas/configuracion/PaginaRegistrarVacuna.jsx'
import PaginaRegistrarDimension from '@/paginas/configuracion/PaginaRegistrarDimension.jsx'
import PaginaEditarDimension from '@/paginas/configuracion/PaginaEditarDimension.jsx'
import PaginaRegistrarEsquema from '@/paginas/configuracion/PaginaRegistrarEsquema.jsx'
import PaginaEditarEsquema from '@/paginas/configuracion/PaginaEditarEsquema.jsx'
import PaginaHistorialEsquemas from '@/paginas/configuracion/PaginaHistorialEsquemas.jsx'
import PaginaVerEsquema from '@/paginas/configuracion/PaginaVerEsquema.jsx'
import PaginaInicio from '@/paginas/inicio/PaginaInicio.jsx'
import PaginaEditarUsuario from '@/paginas/usuarios/PaginaEditarUsuario.jsx'
import PaginaRegistrarPersonal from '@/paginas/usuarios/PaginaRegistrarPersonal.jsx'
import PaginaUsuarios from '@/paginas/usuarios/PaginaUsuarios.jsx'
import PaginaRegistro from '@/paginas/registro/PaginaRegistro.jsx'

// Los permisos son provisionales: el spec que construye cada pantalla confirma su código al crearlo en
// backend/db/05_permisos_mysql.sql y pone su componente en `pagina` (sin `pagina`, se ve "En construcción").
// `subrutas` son pantallas con permiso propio que no aparecen en el menú; su opción queda activa en ellas.
const opcionesMenu = [
  { titulo: 'Inicio', ruta: '/inicio', permiso: null, icono: House, pagina: PaginaInicio },
  {
    titulo: 'Registro de producción',
    ruta: '/registro',
    permiso: 'REPORTE_CONSULTAR',
    icono: ClipboardPen,
    pagina: PaginaRegistro,
  },
  { titulo: 'Reportes', ruta: '/reportes', permiso: 'REPORTE_LISTAR', icono: FileText },
  { titulo: 'Revisión y cierre', ruta: '/revision', permiso: 'REPORTE_REVISAR', icono: ClipboardCheck },
  { titulo: 'Indicadores', ruta: '/indicadores', permiso: 'INDICADOR_CONSULTAR', icono: ChartLine },
  { titulo: 'Mapa territorial', ruta: '/mapa', permiso: 'MAPA_CONSULTAR', icono: MapIcon },
  { titulo: 'Informes', ruta: '/informes', permiso: 'INFORME_CONSULTAR', icono: FileSpreadsheet },
  { titulo: 'Alertas', ruta: '/alertas', permiso: 'ALERTA_CONSULTAR', icono: Bell },
  { titulo: 'Auditoría', ruta: '/auditoria', permiso: 'BITACORA_CONSULTAR', icono: ScrollText },
  {
    titulo: 'Usuarios',
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
  { titulo: 'Roles y permisos', ruta: '/permisos', permiso: 'PERMISO_CONSULTAR', icono: ShieldCheck },
]

export default opcionesMenu
