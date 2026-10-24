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
import PaginaInicio from '@/paginas/inicio/PaginaInicio.jsx'
import PaginaEditarUsuario from '@/paginas/usuarios/PaginaEditarUsuario.jsx'
import PaginaRegistrarPersonal from '@/paginas/usuarios/PaginaRegistrarPersonal.jsx'
import PaginaUsuarios from '@/paginas/usuarios/PaginaUsuarios.jsx'

// Los permisos son provisionales: el spec que construye cada pantalla confirma su código al crearlo en
// backend/db/05_permisos_mysql.sql y pone su componente en `pagina` (sin `pagina`, se ve "En construcción").
// `subrutas` son pantallas con permiso propio que no aparecen en el menú; su opción queda activa en ellas.
const opcionesMenu = [
  { titulo: 'Inicio', ruta: '/inicio', permiso: null, icono: House, pagina: PaginaInicio },
  { titulo: 'Registro de producción', ruta: '/registro', permiso: 'REPORTE_REGISTRAR', icono: ClipboardPen },
  { titulo: 'Reportes', ruta: '/reportes', permiso: 'REPORTE_CONSULTAR', icono: FileText },
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
    ],
  },
  { titulo: 'Roles y permisos', ruta: '/permisos', permiso: 'PERMISO_CONSULTAR', icono: ShieldCheck },
]

export default opcionesMenu
