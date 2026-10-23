import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useSesion } from '@/componentes/ProveedorSesion.jsx'
import PestanaEstablecimientos from './PestanaEstablecimientos.jsx'
import PestanaTerritorio from './PestanaTerritorio.jsx'

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
]

export default function PaginaConfiguracion() {
  const { tienePermiso } = useSesion()
  const [parametros, setParametros] = useSearchParams()
  const visibles = PESTANAS.filter((pestana) => pestana.permisos.every(tienePermiso))
  // Sin parámetro, o con una pestaña desconocida o sin permiso, se abre la primera visible.
  const activa = visibles.find((pestana) => pestana.valor === parametros.get('pestana')) ?? visibles[0]

  return (
    <section className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-1">
        <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Configuración</p>
        <h1 className="text-2xl font-semibold">Catálogos del sistema</h1>
      </div>

      {activa ? (
        <Tabs value={activa.valor} onValueChange={(valor) => setParametros({ pestana: valor })}>
          <TabsList>
            {visibles.map((pestana) => (
              <TabsTrigger key={pestana.valor} value={pestana.valor}>
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
