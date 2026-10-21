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

// Los permisos son provisionales: el spec que construye cada pantalla confirma su código al crearlo en
// backend/db/05_permisos_mysql.sql y pone su componente en `pagina` (sin `pagina`, se ve "En construcción").
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
  { titulo: 'Usuarios', ruta: '/usuarios', permiso: 'USUARIO_CONSULTAR', icono: Users },
  { titulo: 'Configuración', ruta: '/configuracion', permiso: 'CONFIGURACION_CONSULTAR', icono: Settings },
  { titulo: 'Roles y permisos', ruta: '/permisos', permiso: 'PERMISO_CONSULTAR', icono: ShieldCheck },
]

export default opcionesMenu
