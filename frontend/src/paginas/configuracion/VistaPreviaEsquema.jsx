import { useMemo } from 'react'
import { Info, TriangleAlert } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { armarFormulario } from '@/componentes/formulario/armarFormulario.js'
import FormularioCaptura, { CamposAdicionales } from '@/componentes/formulario/FormularioCaptura.jsx'
import { aDiaMesAnio } from './DialogoPublicarEsquema.jsx'
import { ESTADOS } from './PaginaHistorialEsquemas.jsx'

const PROCEDENCIA = {
  MUNICIPIO_DETALLADO: 'Las dosis a personas de otros municipios se registran por municipio de procedencia.',
  PROPIO_Y_OTROS: 'Las dosis a personas de otros municipios se registran juntas, como en el 5C.',
}
const SEVERIDAD = { ERROR: 'Error', ADVERTENCIA: 'Advertencia' }

// Muestra el formulario del esquema como lo verá el establecimiento. No llama a la API: las cantidades y los campos
// adicionales viven en el estado del formulario y se pierden al cerrar, porque el Sheet desmonta su contenido.
// contenido: la forma de contenidoDe (la del editor, con cambios sin guardar, o la guardada). problemas: los de
// problemasDeCoherencia, solo desde el editor.
export default function VistaPreviaEsquema({ abierta, alCambiarAbierta, esquema, contenido, vacuna, dimensiones, problemas = [] }) {
  const formulario = useMemo(
    () =>
      armarFormulario({
        contenido,
        vacuna,
        dimensiones,
        camposAdicionales: esquema.camposAdicionales,
        reglas: esquema.reglas,
        deducirSecciones: esquema.estado !== 'BORRADOR',
      }),
    [contenido, vacuna, dimensiones, esquema],
  )
  const estado = ESTADOS[esquema.estado]
  const generado = `Formulario generado por el esquema de captura: ${vacuna.nombre}, versión ${esquema.version}`
  const { procedencia } = formulario

  return (
    <Sheet open={abierta} onOpenChange={alCambiarAbierta}>
      <SheetContent side="right" className="w-full overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-6xl">
        <SheetHeader>
          <div className="flex flex-wrap items-center gap-2 pr-8">
            <SheetTitle>
              Vista previa · {vacuna.nombre}, versión {esquema.version}
            </SheetTitle>
            {estado && <Badge variant={estado.variante}>{estado.etiqueta}</Badge>}
          </div>
          <SheetDescription>Así verá el formulario el establecimiento.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4">
          <Alert className="border-ring/40 bg-accent text-accent-foreground">
            <Info />
            <AlertDescription className="text-accent-foreground">
              Así verá el formulario el establecimiento. Los datos que escriba aquí no se guardan.
            </AlertDescription>
          </Alert>

          {problemas.length > 0 && (
            <Alert className="border-advertencia-foreground/20 bg-advertencia text-advertencia-foreground">
              <TriangleAlert />
              <AlertTitle>
                Este borrador tiene {problemas.length} {problemas.length === 1 ? 'problema' : 'problemas'}; el formulario
                puede verse incompleto.
              </AlertTitle>
              <AlertDescription className="text-advertencia-foreground">
                <ul aria-label="Problemas del borrador" className="list-disc pl-5">
                  {problemas.map((problema) => (
                    <li key={problema}>{problema}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Dosis aplicadas a residentes del municipio</CardTitle>
              <CardDescription>
                {esquema.vigencia ? `${generado}, vigente desde ${aDiaMesAnio(esquema.vigencia.desde)}` : generado}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <p className="rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
                Dimensiones de este esquema: <strong>{formulario.dimensionesUsadas.join(' · ')}</strong>
              </p>
              <FormularioCaptura formulario={formulario} />
            </CardContent>
          </Card>

          {procedencia && PROCEDENCIA[procedencia.modo] && (
            <p className="text-sm text-muted-foreground">
              {PROCEDENCIA[procedencia.modo]}
              {procedencia.permiteNoEspecificado && ' Se admite procedencia no especificada.'}
            </p>
          )}

          {formulario.camposAdicionales.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Datos adicionales</CardTitle>
              </CardHeader>
              <CardContent>
                <CamposAdicionales campos={formulario.camposAdicionales} />
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Validaciones que aplicará este esquema</CardTitle>
              <CardDescription>Las validaciones se ejecutan al capturar el reporte.</CardDescription>
            </CardHeader>
            <CardContent>
              {formulario.reglas.length === 0 ? (
                <p className="text-sm text-muted-foreground">Este esquema no aplica validaciones.</p>
              ) : (
                <ul aria-label="Validaciones del esquema" className="flex list-disc flex-col gap-1 pl-5 text-sm">
                  {formulario.reglas.map((regla) => (
                    <li key={`${regla.codigo}-${regla.version}`} className="font-mono">
                      {regla.codigo} · v{regla.version}
                      {regla.severidadOverride && ` · severidad: ${SEVERIDAD[regla.severidadOverride]}`}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <SheetFooter>
          <SheetClose asChild>
            <Button type="button" variant="outline">
              Cerrar
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
