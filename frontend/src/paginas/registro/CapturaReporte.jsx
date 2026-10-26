import { useEffect, useMemo, useRef, useState } from 'react'
import { CircleAlert, CircleCheck, RotateCw, Save } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { armarFormulario } from '@/componentes/formulario/armarFormulario.js'
import FormularioCaptura, { CamposAdicionales, leerCantidad } from '@/componentes/formulario/FormularioCaptura.jsx'
import { contenidoDe } from '@/paginas/configuracion/EditorEsquema.jsx'
import { guardarVacuna, obtenerFormulario } from '@/api/produccion.js'

// Con estos dos errores lo guardado ya no coincide con lo que se ve: solo queda volver a cargar.
const ERRORES_DE_RECARGA = ['REPORTE_DESACTUALIZADO', 'REPORTE_NO_EDITABLE']

const aDiaMesAnio = (fecha) => (fecha ? fecha.split('-').reverse().join('/') : null)

// 'grupo_edad=MENOR_1|sexo=F' → { grupo_edad: 'MENOR_1', sexo: 'F' }; '' → {}.
const dimensionesDeClave = (clave) => (clave === '' ? {} : Object.fromEntries(clave.split('|').map((par) => par.split('='))))

// Las celdas del municipio propio con la llave de FormularioCaptura ({dosis}|{clave}); un 0 se ve como «0».
const cantidadesDe = (vacuna, municipioId) =>
  Object.fromEntries(
    vacuna.celdas
      .filter((c) => c.municipioProcedenciaId === municipioId)
      .map((c) => [`${c.dosisCodigo}|${c.claveCombinacion}`, String(c.cantidad)]),
  )

// Una celda vacía no se manda: no tiene fila (vacía ≠ 0).
function celdasParaGuardar(cantidades, municipioId) {
  return Object.entries(cantidades)
    .filter(([, texto]) => texto.trim() !== '')
    .map(([llave, texto]) => {
      const separador = llave.indexOf('|')
      return {
        dosisCodigo: llave.slice(0, separador),
        municipioProcedenciaId: municipioId,
        dimensiones: dimensionesDeClave(llave.slice(separador + 1)),
        cantidad: Number(texto.trim()),
      }
    })
}

// Un campo sin llenar va como null; los números llegan del Input como texto.
function datosParaGuardar(campos, valores) {
  return Object.fromEntries(
    campos.map(({ clave, tipo }) => {
      const valor = valores[clave]
      if (valor === undefined || valor === null || valor === '') return [clave, null]
      return [clave, (tipo === 'entero' || tipo === 'decimal') && typeof valor === 'string' ? Number(valor) : valor]
    }),
  )
}

// Lo que se mandaría, para saber si la vacuna cambió desde que se cargó o se guardó.
function firmaDe(cantidades, datos, campos) {
  const celdas = Object.entries(cantidades)
    .filter(([, texto]) => texto.trim() !== '')
    .map(([llave, texto]) => [llave, texto.trim()])
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify({ celdas, datos: datosParaGuardar(campos, datos) })
}

const hayInvalidas = (cantidades) => Object.values(cantidades).some((texto) => !leerCantidad(texto).valida)

function PestanaVacuna({ vacuna, captura, municipio, cantidades, datos, soloLectura, alCambiarCantidad, alCambiarDato }) {
  const { esquema } = captura
  // Una dosis inactiva se oculta, salvo que el reporte ya tenga filas de ella (de cualquier procedencia).
  const formulario = useMemo(() => {
    if (!esquema) return null
    const conFilas = new Set(captura.celdas.map((c) => c.dosisCodigo))
    return armarFormulario({
      contenido: contenidoDe(esquema),
      vacuna: { nombre: vacuna.vacuna.nombre, dosis: vacuna.dosis.filter((d) => d.activa || conFilas.has(d.codigo)) },
      dimensiones: vacuna.dimensiones,
      deducirSecciones: true,
    })
  }, [esquema, captura.celdas, vacuna])

  if (!formulario) {
    return <p className="text-sm text-muted-foreground">No se encontró el formulario de esta vacuna.</p>
  }
  const vigencia = aDiaMesAnio(esquema.vigencia?.desde)
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Dosis aplicadas a residentes de {municipio}</CardTitle>
          <CardDescription>
            Formulario generado por el esquema de captura: {vacuna.vacuna.nombre}, versión {esquema.version}
            {vigencia && `, vigente desde ${vigencia}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm text-accent-foreground">
            <span>Dimensiones de este esquema:</span>
            {['Dosis', ...vacuna.dimensiones.map((d) => d.etiqueta ?? d.nombre)].map((nombre) => (
              <Badge key={nombre} variant="outline" className="bg-card font-semibold">
                {nombre}
              </Badge>
            ))}
          </div>
          <FormularioCaptura
            formulario={formulario}
            cantidades={cantidades}
            alCambiar={alCambiarCantidad}
            soloLectura={soloLectura}
          />
        </CardContent>
      </Card>
      {esquema.camposAdicionales.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Datos adicionales</CardTitle>
          </CardHeader>
          <CardContent>
            <CamposAdicionales
              campos={esquema.camposAdicionales}
              valores={datos}
              alCambiar={alCambiarDato}
              soloLectura={soloLectura}
            />
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// reporte: GET /reportes/{id}, con las etiquetas de las dosis y de las dimensiones de cada vacuna.
export default function CapturaReporte({ reporte }) {
  // formulario: GET /reportes/{id}/formulario; cantidades, datos y firmas van por vacunaId.
  const [formulario, setFormulario] = useState(null)
  const [errorCarga, setErrorCarga] = useState(null)
  const [cantidades, setCantidades] = useState({})
  const [datos, setDatos] = useState({})
  const [firmas, setFirmas] = useState({})
  const [guardando, setGuardando] = useState(false)
  const [aviso, setAviso] = useState(null)
  const cargaActual = useRef(0)

  // Las vacunas en el orden del reporte, cada una con lo que trae el formulario.
  const vacunas = formulario
    ? reporte.vacunas
        .map((vacuna) => ({ vacuna, captura: formulario.vacunas.find((c) => c.vacunaId === vacuna.vacuna.id) }))
        .filter(({ captura }) => captura)
    : []

  function tomarVacuna(captura, municipioId) {
    const campos = captura.esquema?.camposAdicionales ?? []
    const cantidadesVacuna = cantidadesDe(captura, municipioId)
    const datosVacuna = { ...(captura.datosAdicionales ?? {}) }
    setCantidades((previas) => ({ ...previas, [captura.vacunaId]: cantidadesVacuna }))
    setDatos((previos) => ({ ...previos, [captura.vacunaId]: datosVacuna }))
    setFirmas((previas) => ({ ...previas, [captura.vacunaId]: firmaDe(cantidadesVacuna, datosVacuna, campos) }))
  }

  function cargar() {
    const carga = ++cargaActual.current
    setFormulario(null)
    setErrorCarga(null)
    setAviso(null)
    obtenerFormulario(reporte.id)
      .then((recibido) => {
        if (carga !== cargaActual.current) return
        setCantidades({})
        setDatos({})
        setFirmas({})
        for (const captura of recibido.vacunas) tomarVacuna(captura, recibido.municipioPropio.id)
        setFormulario(recibido)
      })
      .catch((err) => carga === cargaActual.current && setErrorCarga(err.mensaje))
  }

  useEffect(() => {
    cargar()
    return () => {
      cargaActual.current += 1
    }
  }, [reporte.id])

  if (errorCarga) {
    return (
      <div className="flex flex-col items-start gap-3">
        <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
          <CircleAlert />
          <AlertDescription>No se pudo cargar el formulario: {errorCarga}</AlertDescription>
        </Alert>
        <Button variant="outline" onClick={cargar}>
          Reintentar
        </Button>
      </div>
    )
  }
  if (!formulario) return <Skeleton aria-label="Cargando formulario" className="h-40 w-full" />
  if (vacunas.length === 0) return null

  const municipioId = formulario.municipioPropio.id
  const camposDe = (captura) => captura.esquema?.camposAdicionales ?? []
  const cambio = ({ captura }) =>
    firmaDe(cantidades[captura.vacunaId] ?? {}, datos[captura.vacunaId] ?? {}, camposDe(captura)) !== firmas[captura.vacunaId]
  const conCambios = vacunas.filter(cambio)
  const invalidas = vacunas.some(({ captura }) => hayInvalidas(cantidades[captura.vacunaId] ?? {}))

  // Un PUT por vacuna con cambios, uno tras otro: cada uno usa la versionFila que devolvió el anterior.
  async function guardar() {
    setGuardando(true)
    setAviso(null)
    let versionFila = formulario.versionFila
    for (const { vacuna, captura } of conCambios) {
      try {
        const respuesta = await guardarVacuna(reporte.id, captura.vacunaId, {
          versionFila,
          celdas: celdasParaGuardar(cantidades[captura.vacunaId] ?? {}, municipioId),
          ...(camposDe(captura).length > 0 && {
            datosAdicionales: datosParaGuardar(camposDe(captura), datos[captura.vacunaId] ?? {}),
          }),
        })
        versionFila = respuesta.versionFila
        const guardada = { ...respuesta.vacuna, esquema: captura.esquema }
        setFormulario((actual) => ({
          ...actual,
          versionFila,
          vacunas: actual.vacunas.map((c) => (c.vacunaId === guardada.vacunaId ? guardada : c)),
        }))
        tomarVacuna(guardada, municipioId)
      } catch (err) {
        setAviso({
          tipo: 'error',
          mensaje: `No se guardó ${vacuna.vacuna.nombre}: ${err.mensaje}`,
          recargar: ERRORES_DE_RECARGA.includes(err.codigo),
        })
        setGuardando(false)
        return
      }
    }
    setAviso({ tipo: 'exito', mensaje: 'Borrador guardado.' })
    setGuardando(false)
  }

  const soloLectura = !formulario.editable
  return (
    <div className="flex flex-col gap-4">
      <Tabs defaultValue={String(vacunas[0].vacuna.id)}>
        <TabsList aria-label="Vacunas" className="h-auto flex-wrap">
          {vacunas.map(({ vacuna }) => (
            <TabsTrigger key={vacuna.id} value={String(vacuna.id)}>
              {vacuna.vacuna.nombre}
            </TabsTrigger>
          ))}
        </TabsList>
        {vacunas.map(({ vacuna, captura }) => (
          <TabsContent key={vacuna.id} value={String(vacuna.id)} className="pt-4">
            <PestanaVacuna
              vacuna={vacuna}
              captura={captura}
              municipio={formulario.municipioPropio.nombre}
              cantidades={cantidades[captura.vacunaId] ?? {}}
              datos={datos[captura.vacunaId] ?? {}}
              // Mientras se guarda no se escribe: lo guardado reemplaza las cantidades de cada vacuna.
              soloLectura={soloLectura || guardando}
              alCambiarCantidad={(llave, texto) =>
                setCantidades((previas) => ({ ...previas, [captura.vacunaId]: { ...previas[captura.vacunaId], [llave]: texto } }))
              }
              alCambiarDato={(clave, valor) =>
                setDatos((previos) => ({ ...previos, [captura.vacunaId]: { ...previos[captura.vacunaId], [clave]: valor } }))
              }
            />
          </TabsContent>
        ))}
      </Tabs>

      {aviso?.tipo === 'exito' && (
        <Alert>
          <CircleCheck />
          <AlertDescription>{aviso.mensaje}</AlertDescription>
        </Alert>
      )}
      {aviso?.tipo === 'error' && (
        <div className="flex flex-col items-start gap-3">
          <Alert variant="destructive" className="border-destructive/20 bg-destructive/10">
            <CircleAlert />
            <AlertDescription>{aviso.mensaje}</AlertDescription>
          </Alert>
          {aviso.recargar && (
            <Button variant="outline" onClick={cargar}>
              <RotateCw />
              Recargar reporte
            </Button>
          )}
        </div>
      )}

      {soloLectura ? (
        <p className="text-sm text-muted-foreground">Este reporte no se puede editar en su estado actual.</p>
      ) : (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {invalidas && <p className="text-sm text-destructive">Corrija las cantidades marcadas para guardar.</p>}
          <Button onClick={guardar} disabled={guardando || invalidas || conCambios.length === 0}>
            <Save />
            {guardando ? 'Guardando…' : 'Guardar borrador'}
          </Button>
        </div>
      )}
    </div>
  )
}
