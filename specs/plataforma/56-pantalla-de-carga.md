# SPEC 56 — Pantalla de carga en las transiciones

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec D» de Chris, punto 10 de `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 06, SPEC 23, SPEC 28, SPEC 36, SPEC 49, SPEC 50 y SPEC 54
> **Fecha:** 2026-11-10
> **Objetivo:** Reutilizar `PantallaCargaSesion` (logo animado y barra, a pantalla completa), solo si la espera pasa de 300 ms, al descargar el código de una pantalla y en la primera carga de datos de Mapa, Indicadores, Revisar reporte y Registro.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. Hoy el logo animado solo aparece al recuperar la sesión (`PantallaCargaSesion`, a pantalla completa). Al entrar a una pantalla se ven unos esqueletos sueltos (`CargandoPantalla` en `Layout.jsx`) y, en las pantallas que tardan, otra tanda de esqueletos con los filtros todavía vacíos, o un bloque en blanco. Chris lo dejó en `specs/spec-D-pantalla-de-carga.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Diferencias con el documento de Chris** (decididas en la fase de preguntas):

- **Reutilizar, no reemplazar:** se reutiliza `PantallaCargaSesion` tal como es (archivo, nombre, animación y uso en `App.jsx`), con la prop opcional `etiqueta`. No se crea un componente nuevo (corregido por Chris al empezar la implementación).
- **Pantalla completa también en las transiciones:** tapa el menú lateral y el encabezado, igual que al recuperar la sesión (decidido por Chris en la verificación del paso 7, después de ver la versión que dejaba el menú visible). Se quitó la prop `contenida` del primer diseño.
- **Pantallas:** además de Mapa e Indicadores, Revisar reporte y Registro (la captura). Inicio no: sus tarjetas cargan cada una por su lado y no es `lazy`.
- **Qué tapa:** toda el área de la pantalla (encabezado, filtros y datos), para que la descarga del código y la de los datos se vean como una sola carga.
- **Registro:** cubre toda la cadena (meses abiertos → detalle del reporte → formulario).
- **Sesión:** la pantalla de la sesión también espera los 300 ms.
- **Continuidad:** si una pantalla de carga estaba visible hace un instante, la siguiente aparece sin esperar.
- **Movimiento reducido:** sin barra; el logo con la cruz ya dibujada y un texto visible «Cargando…».
- **Sin tiempo mínimo** visible.

## Alcance

**Entra:**

- `componentes/PantallaCargaSesion.jsx`: se conserva y gana la prop opcional `etiqueta`, el retraso de 300 ms, la continuidad, el texto de movimiento reducido y la capa fija en un portal; el hook `usePrimeraCarga` va en el mismo archivo.
- `App.jsx` no cambia: sigue usando `<PantallaCargaSesion />`.
- `componentes/layout/Layout.jsx`: `<PantallaCargaSesion etiqueta="Cargando pantalla" />` como `fallback` del `Suspense`, en lugar de `CargandoPantalla` (que se borra).
- Primera carga de datos con `PantallaCargaSesion` en `paginas/mapa/PaginaMapa.jsx`, `paginas/indicadores/PaginaIndicadores.jsx`, `paginas/revision/PaginaRevisarReporte.jsx` y `paginas/registro/PaginaRegistro.jsx` (con la prop `alListo` en `paginas/registro/CapturaReporte.jsx`).
- Las pruebas, la verificación manual con Playwright, la nota en `CLAUDE.md` y borrar `specs/spec-D-pantalla-de-carga.md`.

**Fuera de alcance (para otros specs):**

- Inicio y las demás pantallas (catálogos, usuarios, bandeja, Mis reportes, rectificaciones…): conservan sus esqueletos.
- Las cargas **después** de la primera (cambiar un filtro, el mes, la DDRISS o el modo del mapa; recargar tras un error; calcular indicadores): siguen con los esqueletos de hoy.
- Las cargas internas que ya tienen su esqueleto propio (historial, validación, vacunas disponibles, la serie de una gráfica, el mapa mientras llega Leaflet).
- Un tema oscuro.
- Cambios en el backend, el contrato, la base, los permisos o los `package.json`.

## Modelo de datos

Este spec no cambia tablas, colecciones, endpoints, permisos ni tokens del tema. Solo amplía un componente existente y le agrega un hook.

### `PantallaCargaSesion.jsx`

```jsx
export const RETRASO_MS = 300
export default function PantallaCargaSesion({ etiqueta = 'Recuperando la sesión' })
export function usePrimeraCarga(lista) // true hasta la primera vez que `lista` es true; después, siempre false
```

Sin props se ve como hoy (solo cambia el retraso), así que `App.jsx` no cambia.

- **Pantalla completa:** una capa fija sobre todo (`fixed inset-0 z-50`, con `min-h-svh`) que se pinta con `createPortal` en `document.body`. El portal hace falta porque dentro del `Layout` las pantallas van en un `div` con `animate-aparecer`, y un `transform` en un contenedor vuelve relativo a él lo que es `position: fixed`. Tapa el menú lateral y el encabezado.

- **Retraso:** durante los primeros `RETRASO_MS` no dibuja nada (`null`); después, la pantalla.
- **Continuidad:** una variable del módulo guarda cuándo se dejó de ver la última `PantallaCargaSesion` visible. Si se monta otra menos de 150 ms después (`CONTINUIDAD_MS`), la nueva aparece de inmediato. Así, sesión → Suspense → datos de la pantalla se ve como una sola carga, sin un hueco en blanco en medio.
- **Sin mínimo:** se quita en cuanto la pantalla está lista.
- **Accesibilidad:** el contenedor visible lleva `role="status"` y `aria-label={etiqueta}`. El logo y la barra van con `aria-hidden`.
- **Aspecto:** el de hoy (`FondoMarca`, logo y texto «SIRCOVA» en `text-primary-foreground`, barra en `bg-ring` sobre `bg-primary-foreground/20`).
- **Movimiento reducido:** la barra lleva `motion-reduce:hidden` y debajo del logo aparece el texto visible «Cargando…» (`hidden motion-reduce:block`). La regla global de `index.css` deja la cruz del logo ya dibujada.

### `usePrimeraCarga` y el patrón de cada pantalla

Cada una de las cuatro pantallas calcula una condición `lista` y hace:

```jsx
const primeraCarga = usePrimeraCarga(lista)
return (
  <>
    {primeraCarga && <PantallaCargaSesion etiqueta="Cargando …" />}
    <section hidden={primeraCarga} …>{/* lo de hoy, sin cambios */}</section>
  </>
)
```

La pantalla se sigue montando debajo (oculta), así que sus efectos piden los datos como hoy y sus esqueletos internos siguen existiendo. Cuando `lista` pasa a `true` por primera vez, `primeraCarga` queda en `false` para siempre en esa visita: un cambio de filtro vuelve a los esqueletos. Un error también cuenta como «lista», para que se vea el `AvisoError` con «Reintentar».

| Pantalla | `etiqueta` | `lista` cuando |
|---|---|---|
| Mapa | «Cargando el mapa» | llegaron (o fallaron) la lista de DDRISS si es nacional, los límites (`limites`) y los datos del modo inicial (`indicadores` o `avance`) |
| Indicadores | «Cargando indicadores» | llegaron (o fallaron) la lista de DDRISS si es nacional y `datos` (resultados y corridas) |
| Revisar reporte | «Cargando reporte» | `datos` o `errorCarga` |
| Registro | «Cargando registro» | llegaron (o fallaron) los meses abiertos y, si el mes elegido tiene reporte, también su detalle y el formulario de `CapturaReporte`; sin meses o sin reporte del mes, basta con los meses |

`CapturaReporte` recibe la prop opcional `alListo`, que llama una vez cuando su formulario termina de cargar o falla. `PaginaRegistro` la usa para cerrar la primera carga.

## Plan de implementación

1. **Componente.** Agregar a `PantallaCargaSesion.jsx` la prop `etiqueta`, la capa fija en un portal, el retraso, la continuidad, el texto de movimiento reducido y `usePrimeraCarga`. Probarlo en `PantallaCargaSesion.test.jsx`, con temporizadores falsos:
   - antes de 300 ms no hay `role="status"`; después sí, con «Recuperando la sesión» por defecto o con la etiqueta recibida;
   - montada justo después de quitar otra visible, aparece sin esperar;
   - se pinta en `document.body`, fija sobre toda la pantalla y con `FondoMarca`;
   - el texto «Cargando…» y la barra llevan sus clases de `motion-reduce`;
   - `usePrimeraCarga` pasa de `true` a `false` y no vuelve a `true`.

   La app solo cambia en el retraso de la pantalla de la sesión.
2. **Suspense y sesión.** En `Layout.jsx`, cambiar `CargandoPantalla` por `<PantallaCargaSesion etiqueta="Cargando pantalla" />` y borrarla; `App.jsx` no cambia. Ajustar `RutaProtegida.test.jsx`: la pantalla de la sesión ya no está al instante, así que `findByRole` en lugar de `getByRole`.
3. **Mapa e Indicadores.** Aplicar el patrón en `PaginaMapa.jsx` y `PaginaIndicadores.jsx`. Pruebas en `PaginaMapa.test.jsx` y `PaginaIndicadores.test.jsx`:
   - con la API sin responder, aparece `role="status"` con su etiqueta y no se ve el encabezado;
   - al responder, desaparece;
   - al cambiar el mes o la vacuna con la respuesta pendiente, se ven los esqueletos y no la pantalla de carga;
   - con error en la primera carga, se ve el `AvisoError`.
4. **Revisar reporte.** Aplicar el patrón en `PaginaRevisarReporte.jsx`, con las mismas pruebas de aparición y de error en `PaginaRevisarReporte.test.jsx`.
5. **Registro.** Agregar `alListo` a `CapturaReporte.jsx` y aplicar el patrón en `PaginaRegistro.jsx`. Pruebas en `PaginaRegistro.test.jsx`:
   - la pantalla de carga sigue mientras falta el formulario, aunque ya llegaron los meses y el detalle;
   - un mes sin reporte la quita al llegar los meses;
   - al cambiar de mes después, se ven los esqueletos.
6. **Pruebas existentes.** Correr las de las pantallas tocadas y ajustar solo las esperas que dependían de ver la pantalla de inmediato, sin cambiar lo que comprueban. Al final, la suite del frontend.
7. **Verificación manual** con Playwright contra la API real, con el acceso rápido del login y las peticiones de la API retrasadas con `page.route` (unos 2 s), a 1440 px y a 390 px. Se comprueba:
   - al entrar a Mapa, Indicadores, Revisar reporte y Registro, se ven el logo y la barra a pantalla completa, y al recargar no hay hueco entre la descarga del código y los datos;
   - sin retraso, ninguna muestra el logo;
   - cambiar un filtro muestra los esqueletos;
   - recargar muestra la pantalla de la sesión como hoy;
   - con movimiento reducido emulado, se ve el texto «Cargando…» sin barra.
8. Borrar `specs/spec-D-pantalla-de-carga.md` y agregar la nota de este spec en «Notas de contexto» de `CLAUDE.md`.

## Criterios de aceptación

- [x] Entrar a Mapa, Indicadores, Revisar reporte o Registro con la API lenta muestra el logo y la barra a pantalla completa, nunca filtros sin datos.
- [x] Durante esa carga, la pantalla de carga tapa el menú lateral y el encabezado, con el mismo aspecto que la de la sesión (azul marino, logo animado y barra).
- [x] Una carga que termina en menos de 300 ms no muestra la pantalla de carga.
- [x] Al recargar en una pantalla `lazy` con el código y los datos lentos, la pantalla de carga se ve continua (sesión → código → datos), sin un tramo en blanco en medio.
- [x] En Registro, con un reporte del mes, la pantalla de carga sigue hasta que el formulario está listo.
- [x] Después de la primera carga, cambiar un filtro, el mes, la DDRISS o el modo del mapa muestra los esqueletos de hoy, no la pantalla de carga.
- [x] Si la primera carga falla, se quita la pantalla de carga y se ve el `AvisoError` con «Reintentar».
- [x] La descarga del código de cualquier pantalla (`Suspense` del `Layout`) usa `PantallaCargaSesion`, y `CargandoPantalla` ya no existe.
- [x] Al recargar con sesión, `PantallaCargaSesion` aparece solo si la recuperación pasa de 300 ms y se ve como hoy; `App.jsx` no cambia y no hay un componente de carga nuevo.
- [x] Toda pantalla de carga visible tiene `role="status"` y su etiqueta («Recuperando la sesión», «Cargando pantalla», «Cargando el mapa», «Cargando indicadores», «Cargando reporte», «Cargando registro»).
- [x] Con `prefers-reduced-motion`, no hay barra animada y se lee «Cargando…» bajo el logo.
- [x] Los colores salen de las variables del tema, sin colores escritos en el componente.
- [x] A 390 px, el logo y la barra quedan centrados sin desbordar.
- [x] Pasan `PantallaCargaSesion.test.jsx`, `RutaProtegida.test.jsx`, `PaginaMapa.test.jsx`, `PaginaIndicadores.test.jsx`, `PaginaRevisarReporte.test.jsx`, `PaginaRegistro.test.jsx`, `CapturaReporte.test.jsx` y la suite del frontend.

## Decisiones

- **Sí:** reutilizar `PantallaCargaSesion` con la prop `etiqueta` (pedido de Chris). Es la pantalla de carga que ya existe y la que se quería ver en las transiciones.
- **No:** un componente nuevo `PantallaCarga` que reemplazara a `PantallaCargaSesion` (lo que decía el primer borrador). No era la intención: la pantalla existente se conserva.
- **No:** renombrar `PantallaCargaSesion`, aunque ya no sea solo de la sesión. Se conservan el nombre y `App.jsx` sin cambios.
- **Sí:** a pantalla completa, tapando el menú lateral y el encabezado (decidido por Chris en el paso 7). Recortada al área de contenido, el bloque azul con el menú y el encabezado alrededor no convencía, y además no llenaba el alto (`flex-1` no estira porque el área de contenido del `Layout` no es flex).
- **No:** la prop `contenida` (primer diseño). Nadie la usaría: la pantalla es siempre completa.
- **Sí:** pintarla con un portal en `document.body`. Un `transform` de `animate-aparecer` en el contenedor de la pantalla volvería relativa a él la capa fija.
- **No:** fondo claro dentro del área de contenido (lo que decía el primer borrador).
- **Sí:** dejar la espera de 300 ms también al navegar desde el menú. Ahí React Router mantiene la pantalla anterior mientras baja el código (el `Suspense` del `Layout` solo se ve al entrar por URL o al recargar), y después quedan unos 220 ms con el contenido vacío antes de la pantalla de carga de los datos. Es la espera acordada para que no parpadee en las cargas rápidas.
- **No:** saltarse la espera cuando la navegación ya tardó (con `useNavigation`). Más código para ahorrar unos 220 ms.
- **Sí:** tapar toda el área de la pantalla en la primera carga. Los filtros sin datos no sirven todavía, y así la carga del código y la de los datos se ven como una sola.
- **No:** tapar solo la zona de datos. Dejaría el encabezado y los filtros vacíos visibles, que es parte de lo que se quería quitar.
- **Sí:** montar la pantalla oculta (`hidden`) debajo de la carga. Sus efectos y sus estados no cambian, y Registro necesita que `CapturaReporte` esté montada para pedir el formulario.
- **No:** subir la carga de datos a un componente padre o a un cargador del router. Cambiaría cuatro pantallas que hoy funcionan solo para mostrar un logo.
- **Sí:** solo la primera carga de cada visita (`usePrimeraCarga`). Tapar la pantalla en cada cambio de filtro haría perder el contexto de lo que se está mirando.
- **Sí:** Revisar reporte y Registro, además de Mapa e Indicadores. Son las que más tardan (varias consultas encadenadas).
- **No:** Inicio. Sus tarjetas cargan por separado con esqueletos y no es `lazy`; taparlo retrasaría lo que ya llegó.
- **Sí:** en Registro, toda la cadena hasta el formulario, con `alListo`. Si no, la carga terminaría y aparecería el esqueleto «Cargando formulario» justo después.
- **Sí:** retraso de 300 ms en todas, también en la de la sesión. Al recargar con la cookie vigente, el logo destellaba un instante.
- **Sí:** continuidad de 150 ms entre una pantalla de carga y la siguiente. Sin ella, Suspense → datos se vería logo → blanco → logo.
- **No:** tiempo mínimo visible. El contenido nunca espera a la animación; el destello solo ocurre justo en el borde de los 300 ms.
- **Sí:** con movimiento reducido, texto «Cargando…» y sin barra. La barra quieta en su último cuadro parecería colgada.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las pruebas que esperaban ver la pantalla de la sesión al instante (o una etiqueta de carga) fallan por el retraso. | `findBy` (espera hasta 1 s) o temporizadores falsos; el paso 6 ajusta solo las esperas, sin cambiar lo que se comprueba. |
| Una prueba con `getByRole` no encuentra nada mientras dura la primera carga, porque `hidden` saca la pantalla oculta del árbol accesible. | Esperar a que se quite la pantalla de carga o usar `findBy`; las de `getByLabelText` sobre los esqueletos siguen funcionando. |
| `CapturaReporte` no llama a `alListo` en algún camino (por ejemplo, un error) y Registro se queda cargando. | `alListo` se llama al terminar o fallar el formulario; prueba de error en el paso 5. |
| La variable de continuidad del módulo pasa de una prueba a otra. | `PantallaCargaSesion.test.jsx` usa temporizadores falsos y avanza más de 150 ms entre pruebas; si hace falta, el módulo exporta cómo reiniciarla para `preparar-pruebas.js`. |
| El atributo `hidden` no oculta la sección si una de sus clases le da su propio `display` (por ejemplo, `flex`). | La sección lleva la clase `hidden` de Tailwind de forma condicional; comprobado en el paso 7. |
| La capa fija queda debajo de un menú o diálogo de Radix, o de los paneles de Leaflet (z-index hasta 1000). | En la primera carga todavía no hay menús ni mapa a la vista; comprobado en el paso 7. |
| Leaflet mide 0 px mientras el mapa está oculto y `fitBounds` falla. | `MapaMunicipios` ya espera a que el contenedor tenga tamaño (SPEC 50); comprobado en el paso 7. |

## Lo que **no** entra en este spec

- Inicio y las demás pantallas con esqueletos.
- Las cargas después de la primera y las cargas internas con esqueleto propio.
- Un tema oscuro.
- Cambios en el backend, el contrato, la base, los permisos o los `package.json`.
