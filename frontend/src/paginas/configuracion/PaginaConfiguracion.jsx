import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import EncabezadoPagina from '@/componentes/EncabezadoPagina.jsx'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import PestanaDimensiones from './PestanaDimensiones.jsx'
import PestanaEsquemas from './PestanaEsquemas.jsx'
import PestanaEstablecimientos from './PestanaEstablecimientos.jsx'
import PestanaPeriodos from './PestanaPeriodos.jsx'
import PestanaPoblacion from './PestanaPoblacion.jsx'
import PestanaTerritorio from './PestanaTerritorio.jsx'
import PestanaVacunas from './PestanaVacunas.jsx'

// Cada spec de catálogo agrega aquí su pestaña, con los permisos de los endpoints que usa.
const PESTANAS = [
  {
    valor: 'territorio',
    titulo: 'Territorio',
    permisos: ['DDRISS_CONSULTAR', 'MUNICIPIO_CONSULTAR', 'DISTRITO_CONSULTAR'],
    Contenido: PestanaTerritorio,
  },
  {
    valor: 'establecimientos',
    titulo: 'Establecimientos',
    permisos: ['ESTABLECIMIENTO_CONSULTAR'],
    Contenido: PestanaEstablecimientos,
  },
  {
    valor: 'vacunas',
    titulo: 'Vacunas',
    permisos: ['VACUNA_CONSULTAR'],
    Contenido: PestanaVacunas,
  },
  {
    valor: 'dimensiones',
    titulo: 'Dimensiones',
    permisos: ['DIMENSION_CONSULTAR'],
    Contenido: PestanaDimensiones,
  },
  {
    valor: 'esquemas',
    titulo: 'Esquemas',
    // El editor de borradores lee las dosis de la vacuna y el catálogo de dimensiones.
    permisos: ['ESQUEMA_CONSULTAR', 'VACUNA_CONSULTAR', 'DIMENSION_CONSULTAR'],
    Contenido: PestanaEsquemas,
  },
  {
    valor: 'periodos',
    titulo: 'Periodos',
    permisos: ['PERIODO_CONSULTAR'],
    Contenido: PestanaPeriodos,
  },
  {
    valor: 'poblacion',
    titulo: 'Población',
    // Los años del selector salen del calendario de periodos.
    permisos: ['POBLACION_CONSULTAR', 'PERIODO_CONSULTAR'],
    Contenido: PestanaPoblacion,
  },
]

export default function PaginaConfiguracion() {
  const { tienePermiso } = useSesion()
  const [parametros, setParametros] = useSearchParams()
  const visibles = PESTANAS.filter((pestana) => pestana.permisos.every(tienePermiso))
  // Sin parámetro, o con una pestaña desconocida o sin permiso, se abre la primera visible.
  const activa = visibles.find((pestana) => pestana.valor === parametros.get('pestana')) ?? visibles[0]

  return (
    <section className="flex flex-col gap-6 p-6">
      <EncabezadoPagina antetitulo="Configuración" titulo="Catálogos del sistema" />

      {activa ? (
        <Tabs value={activa.valor} onValueChange={(valor) => setParametros({ pestana: valor })}>
          {/* En pantallas angostas las pestañas se desplazan de lado; la línea de la activa va dentro del
              trigger (bottom-0) porque el desplazamiento recorta lo que sale de la lista. */}
          <TabsList
            variant="line"
            className="w-full justify-start gap-0 overflow-x-auto overflow-y-hidden border-b p-0 group-data-horizontal/tabs:h-auto"
          >
            {visibles.map((pestana) => (
              <TabsTrigger
                key={pestana.valor}
                value={pestana.valor}
                className="h-auto flex-none px-3 py-2 group-data-horizontal/tabs:after:bottom-0"
              >
                {pestana.titulo}
              </TabsTrigger>
            ))}
          </TabsList>
          {visibles.map(({ valor, Contenido }) => (
            <TabsContent key={valor} value={valor} className="pt-4">
              <Contenido />
            </TabsContent>
          ))}
        </Tabs>
      ) : (
        <p className="text-muted-foreground">No tiene acceso a ningún catálogo.</p>
      )}
    </section>
  )
}
