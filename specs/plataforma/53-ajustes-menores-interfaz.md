# SPEC 53 — Ajustes menores de interfaz

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec A» de Chris, `CORRECCIONES_SPRINT_4.md`)
> **Depende de:** SPEC 06, SPEC 07, SPEC 23, SPEC 35, SPEC 44, SPEC 45, SPEC 46, SPEC 47 y SPEC 52
> **Fecha:** 2026-11-09
> **Objetivo:** Corregir seis detalles de la interfaz señalados en el Sprint 4: el contraste del menú lateral, el «Cumple» y el orden de columnas de las tablas de «Indicadores», la población sin decimales, el punto de cambios sin guardar de la captura, el municipio como texto al registrar personal y la bandeja de revisión con botón «Revisar» y fila clicable.

## Por qué existe este spec

Son correcciones de la revisión del Sprint 4, no una historia nueva. Chris las dejó en `specs/spec-A-ajustes-menores-interfaz.md` (puntos 1, 2, 3, 4, 7 y 9 de `CORRECCIONES_SPRINT_4.md`); este spec lo reemplaza y ese archivo se borra. Todas son de presentación, salvo A5, que deja de mandar un campo que el backend ya sabe deducir.

**Diferencias con el documento de Chris** (decididas en la fase de preguntas):

- **A1:** se prueban las dos propuestas del menú (celeste medio y azul oscuro) y se elige al verificar, no de antemano.
- **A2:** «No» usa `--destructive` con fondo suave (`bg-destructive/10`), sin tokens nuevos.
- **A5:** el select de municipio se quita del todo, también sin establecimiento. La semilla no tiene empleados con municipio y sin establecimiento.
- **A6:** la fila es clicable en los mismos casos que el enlace del nombre (todo reporte que no sea borrador), no solo con revisor asignado, para que la fila y el enlace no se contradigan.

## Alcance

**Entra:**

- **A1.** Tokens `--sidebar*` de `index.css` y, porque ganó el azul oscuro, el encabezado del menú en `componentes/layout/MenuLateral.jsx` y el nombre del pie en `componentes/layout/MenuUsuario.jsx` (decidido en el paso 7).
- **A2.** Componente `paginas/indicadores/InsigniaCumple.jsx` que reemplaza los cuatro `textoCumple`, y el nuevo orden de columnas en `TablaResultados` (`PaginaIndicadores.jsx`), `TablaBrecha.jsx`, `TablaDesercion.jsx` y `TablaProyeccion.jsx`.
- **A3.** Población y «Meta del mes» con `formatoEntero` en `TablaResultados` y `TablaProyeccion.jsx`.
- **A4.** Token `--cambio-pendiente` en `index.css` y el punto de las píldoras de vacuna en `paginas/registro/CapturaReporte.jsx`.
- **A5.** Quitar el select de municipio de `paginas/usuarios/CamposEmpleado.jsx` y dejar de mandar `municipioId` en `PaginaRegistrarPersonal.jsx` y `PaginaEditarUsuario.jsx` (salvo `null` al quitar el establecimiento, ver abajo).
- **A6.** Botón «Revisar» y fila clicable en `paginas/revision/PaginaBandejaRevision.jsx`.
- Las pruebas de cada pantalla tocada, la verificación manual con Playwright y la nota en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Reacomodar «Indicadores» en pestañas (spec B de Chris).
- La marca de agua preliminar, la pantalla de carga, el control de rectificaciones y el límite de los combobox (specs C a F de Chris).
- Cambiar el backend de usuarios: `POST /usuarios` y `PATCH /empleados/{id}` siguen aceptando `municipioId`; solo la pantalla deja de mandarlo.
- Un tema oscuro de toda la app: A1 solo cambia el menú lateral.
- Cambios en `backend/db/`, en permisos, en `transicion_estado`, en `openapi.yaml` o en los `package.json`.

## Modelo de datos

Este spec no cambia tablas, colecciones, endpoints ni permisos. Solo agrega tokens del tema y un componente.

### Tokens de `index.css`

```css
/* A1, azul oscuro (elegido en el paso 7) */
--sidebar: #2f5f8a;
--sidebar-foreground: #e8f1f9;
--sidebar-accent: #1d4a72;
--sidebar-accent-foreground: #ffffff;
--sidebar-border: #3f6f99;
--sidebar-ring: #b5d4ee;
/* --sidebar-primary y --sidebar-primary-foreground no cambian */

/* A4 */
--cambio-pendiente: #f2c14e;
```

Se expone `--cambio-pendiente` en el bloque `@theme` como los demás tokens propios, para usar `bg-cambio-pendiente`.

Con el menú oscuro, los textos que usaban colores del contenido pasan a tokens del sidebar: «SIRCOVA» (`text-primary`) y el nombre del pie (`text-foreground`) a `text-sidebar-accent-foreground`, y el subtítulo «Registro de vacunación» (`text-muted-foreground`) a `text-sidebar-foreground`. El menú desplegable de la cuenta (fondo blanco) no cambia.

Contraste medido en la app (paso 7): menú contra el contenido 6.31:1; texto normal y subítems 5.88; subtítulo 5.88; «SIRCOVA» 6.72; ítem activo y hover 9.23; pie 8.13 (nombre) y 7.11 (rol). El anillo de foco (`--sidebar-ring`) se ve claro sobre el azul.

### `InsigniaCumple`

`paginas/indicadores/InsigniaCumple.jsx` exporta `InsigniaCumple({ cumple })`, con las clases `verde` y `rojo` de `CLASES_COLOR` (`InsigniaValor.jsx`):

- `true` → `Badge` con «Sí», `bg-exito text-exito-foreground`.
- `false` → `Badge` con «No», `bg-destructive/10 text-destructive`.
- `null` → «—» en `text-muted-foreground`, sin insignia.
- En la proyección («¿Llega a la meta?»), el estilo de dato estimado es el fondo de la celda (`ESTIMADA` de `TablaProyeccion.jsx`), que se queda; la insignia no necesita una prop para eso (decidido en el paso 2).

El texto siempre está: Sí y No no se distinguen solo por el color.

### Orden de columnas (confirmado por Chris, 2026-11-10)

Regla: **Meta** justo antes de la columna del indicador, y la del indicador justo antes de **Cumple**.

- **Cobertura / Avance:** Municipio · Dosis acumuladas · Población (o Meta del mes) · Dosis que faltan · Meta · Cobertura (o Avance) · Cumple.
- **Deserción:** Municipio · Dosis iniciales · Dosis finales · Pérdida · Meta · Deserción · Cumple.
- **Proyección:** Municipio · Dosis acumuladas · Ritmo mensual · Dosis proyectadas · Población · Dosis que faltarían · Meta · Cobertura proyectada · ¿Llega a la meta?
- **Brecha** (sin «Meta» en %): Municipio · Dosis acumuladas · Dosis para la meta · Excedente · Dosis que faltan · Cumple.

La marca de mayor al 100 % (SPEC 52) se mueve con su celda: junto al valor en cobertura y avance, y junto al nombre en la brecha.

### Municipio en `CamposEmpleado` (A5)

- El municipio es siempre texto: el `municipioNombre` del establecimiento elegido, o, sin establecimiento, el municipio guardado del empleado (si lo tiene) o «—».
- Registrar: el cuerpo de `POST /usuarios` ya no lleva `municipioId`; el backend lo toma del establecimiento.
- Editar: si el empleado pasa de un establecimiento a «Sin establecimiento», el `PATCH` manda `municipioId: null`, porque el backend conserva el municipio anterior si no lo recibe (`usuarios.service.js`, líneas ~669-683). En los demás casos no se manda.
- Un empleado ya guardado con municipio y sin establecimiento sigue mostrándolo como texto, y editar otros campos no lo borra.

### Bandeja (A6)

- **Botón «Revisar»:** en la columna de acciones, cuando `fila.estado === 'EN_REVISION'` y `esMio`. Navega a `/revision/reportes/{reporteId}` con `state={{ volverA: search }}`, como el enlace.
- **Fila clicable:** cuando `fila.reporteId && fila.estado !== 'BORRADOR'` (la misma condición del enlace del nombre). Cursor de mano y hover en la fila; el clic navega igual que el enlace.
- Asignar, Reasignar y Revisar llevan `stopPropagation`, y el enlace del nombre también, para no navegar dos veces.
- El enlace del nombre se queda: es el acceso por teclado y el de «abrir en otra pestaña». La fila no recibe foco propio.

### Archivos que cambian

```
frontend/src/
├── index.css                                    ← --sidebar*, --cambio-pendiente
├── componentes/layout/MenuLateral.jsx           ← encabezado con tokens del sidebar
├── componentes/layout/MenuUsuario.jsx           ← nombre del pie con tokens del sidebar
├── paginas/indicadores/
│   ├── InsigniaCumple.jsx                       ← nuevo
│   ├── PaginaIndicadores.jsx (+ .test)          ← TablaResultados: orden, insignia, población entera
│   ├── TablaBrecha.jsx (+ .test)
│   ├── TablaDesercion.jsx (+ .test)
│   └── TablaProyeccion.jsx (+ .test)
├── paginas/registro/CapturaReporte.jsx (+ .test)
├── paginas/usuarios/CamposEmpleado.jsx, PaginaRegistrarPersonal.jsx, PaginaEditarUsuario.jsx (+ .test)
└── paginas/revision/PaginaBandejaRevision.jsx (+ .test)
specs/spec-A-ajustes-menores-interfaz.md         ← se borra
CLAUDE.md                                        ← nota de contexto
```

## Plan de implementación

1. **A3, población sin decimales.** `formatoEntero` en la columna Población / Meta del mes de `TablaResultados` y en Población de `TablaProyeccion.jsx`. Una prueba en `PaginaIndicadores.test.jsx` y otra en `TablaProyeccion.test.jsx` con un denominador como `1234.56` que se ve «1,235». Comprobación: las dos pruebas pasan.
2. **A2, insignia.** `InsigniaCumple.jsx` y su uso en las cuatro tablas, quitando los `textoCumple`. Pruebas: Sí, No y «—» en una tabla (con la clase de cada caso) y la proyección con el estilo estimado. Comprobación: las pruebas de las cuatro tablas pasan.
3. **A2, orden de columnas.** Reordenar encabezados y celdas de las cuatro tablas según el modelo. En cada `*.test.jsx` de tabla, una prueba que lee el orden de los encabezados. Se ajustan las pruebas que leían celdas por posición. Comprobación: las pruebas de `paginas/indicadores/` pasan.
4. **A4, punto de cambios.** Token `--cambio-pendiente` y `bg-cambio-pendiente ring-2 ring-card` en el punto de `idsConCambios`. En `CapturaReporte.test.jsx`: cambiar una casilla muestra el punto con esa clase y el texto oculto «(cambios sin guardar)», y al guardar desaparece. Comprobación: la prueba pasa.
5. **A5, municipio como texto.** Quitar el select de `CamposEmpleado.jsx` y `municipioId` de los cuerpos (con `null` al quitar el establecimiento en la edición). Pruebas en `PaginaRegistrarPersonal.test.jsx` y `PaginaEditarUsuario.test.jsx`: no hay select de municipio; al elegir establecimiento aparece su municipio; el `POST` no lleva `municipioId`; un empleado con municipio y sin establecimiento lo muestra como texto; pasar a «Sin establecimiento» manda `municipioId: null`. Comprobación: las pruebas de `paginas/usuarios/` pasan.
6. **A6, bandeja.** Botón «Revisar», fila clicable y `stopPropagation`. Pruebas en `PaginaBandejaRevision.test.jsx`: «Revisar» solo en las filas `EN_REVISION` propias; clic en una fila enviada navega; clic en una fila borrador o sin reporte no navega; «Asignar» abre el diálogo y no navega. Comprobación: la prueba pasa.
7. **A1, menú lateral.** Aplicar la propuesta celeste y medir con Playwright el contraste (texto normal, ítem activo y hover, ≥ 4.5:1) contra `--sidebar` y `--sidebar-accent`. Probar después la azul oscura, con el encabezado del menú en tokens del sidebar, y medir igual. Se elige con el equipo a la vista de las capturas, se deja solo la elegida y se anota en Decisiones. Comprobación: `Layout.test.jsx` pasa.
8. **Verificación manual y documentación.** Con Playwright, contra Aiven y Atlas: el menú en Inicio, «Indicadores» (cobertura, avance, brecha, deserción y proyección de agosto de 2026, como `epidemiologia`), la captura de un borrador (como Personal), registrar y editar personal (como administrador, sin guardar cuentas reales) y la bandeja (como la estadígrafa). La pantalla a 390 px y la consola sin errores. `npm test` completo del frontend. Después, borrar `specs/spec-A-ajustes-menores-interfaz.md` y agregar la nota en `CLAUDE.md` (`InsigniaCumple`, la regla de orden de columnas y el municipio que ya no se manda).

## Criterios de aceptación

- [ ] El menú lateral se distingue a simple vista del contenido, y su texto normal, el ítem activo y el hover tienen contraste ≥ 4.5:1.
- [ ] A1 solo cambia tokens de `index.css`, el encabezado del menú y el nombre del pie.
- [ ] En las cuatro tablas de «Indicadores», Meta queda justo antes del valor del indicador y el valor justo antes de Cumple (en la brecha, las columnas quedan en el orden del modelo).
- [ ] «Sí» va en insignia verde y «No» en insignia roja suave, con su texto; «—» queda gris; en la proyección, «¿Llega a la meta?» conserva el estilo estimado.
- [ ] Ninguna celda de Población o Meta del mes muestra decimales, y los porcentajes no cambian.
- [ ] Después de validar, corregir una casilla sin guardar muestra el punto amarillo en la píldora de esa vacuna; al guardar el borrador, desaparece; el punto rojo de errores no cambia y el texto oculto «(cambios sin guardar)» sigue.
- [ ] Al registrar y al editar personal no hay select de municipio; al elegir un establecimiento aparece su municipio como texto.
- [ ] El `POST /usuarios` de la pantalla no lleva `municipioId`, y pasar a «Sin establecimiento» en la edición deja el municipio vacío.
- [ ] Un empleado guardado con municipio y sin establecimiento sigue mostrando su municipio.
- [ ] En la bandeja, «Revisar» aparece solo en los reportes en revisión asignados al usuario.
- [ ] Clic en la fila de un reporte que no es borrador abre el reporte; en un borrador o sin reporte no hace nada; Asignar y Reasignar abren su diálogo sin navegar.
- [ ] Ningún componente propio tiene colores escritos a mano.
- [ ] `npm test` pasa en `frontend/` sin desactivar pruebas.
- [ ] `specs/spec-A-ajustes-menores-interfaz.md` ya no está, y `CLAUDE.md` tiene su nota.

## Decisiones

- **Sí:** un solo spec en `plataforma` con los seis ajustes, sin historia de usuario (decidido en la fase de preguntas), porque son correcciones pequeñas de varias pantallas. **No:** un spec por módulo, que serían cinco ramas para cambios de pocas líneas.
- **Sí:** probar las dos propuestas del menú y elegir al verificar (decidido en la fase de preguntas). **No:** decidirlo sin ver el contraste medido en la app.
- **Sí:** el azul oscuro (decidido en el paso 7): se distingue del contenido (6.31:1) y todo su texto pasa AA. **No:** el celeste, que apenas se separa del contenido (1.2:1) y dejaba el subtítulo del encabezado en 4.11:1. El pie del menú (`MenuUsuario.jsx`) también cambia, porque su nombre usaba `text-foreground`.
- **Sí:** «No» con `bg-destructive/10 text-destructive` (decidido en la fase de preguntas). **No:** tokens nuevos `--error`, porque el tema ya tiene el rojo.
- **Sí:** un token nuevo `--cambio-pendiente: #f2c14e` (decidido en la fase de preguntas). **No:** `--semaforo-amarillo`, que es más naranja y se confunde con el rojo suave del semáforo.
- **Sí:** quitar el select de municipio del todo (decidido en la fase de preguntas): la semilla no tiene empleados con municipio y sin establecimiento. **No:** conservarlo solo para «Sin establecimiento»; si un coordinador municipal llega a necesitarse, va en otro spec. El backend no cambia y sigue aceptando `municipioId`.
- **Sí:** mandar `municipioId: null` al quitar el establecimiento en la edición (decidido al escribir el spec), porque el backend conserva el municipio anterior si no lo recibe y quedaría un municipio que la pantalla ya no deja ver ni cambiar.
- **Sí:** la fila es clicable con la misma condición del enlace del nombre (decidido en la fase de preguntas). **No:** solo con revisor asignado, que dejaría filas con enlace pero sin clic.
- **Sí:** el enlace del nombre se queda (documento de Chris), para el teclado y «abrir en otra pestaña». **No:** convertir la fila en un enlace, que no es válido dentro de una tabla.
- **Sí:** borrar `specs/spec-A-ajustes-menores-interfaz.md` al terminar (decidido en la fase de preguntas), porque este spec lo reemplaza.

## Riesgos

- **Choque con el spec B de Chris.** A2 y A3 tocan las tablas de `paginas/indicadores/` que el spec B reacomoda en pestañas. No se trabajan en ramas a la vez: el que se integre segundo parte de `main` con el otro ya integrado.
- **Pruebas que leen celdas por posición.** El nuevo orden rompe las que buscan una celda por índice. Se ajustan al nuevo orden, sin desactivarlas.
- **Contraste del azul oscuro.** Con fondo oscuro, `--sidebar-accent`, el anillo de foco y los íconos de `lucide-react` también deben verse; si no llega a 4.5:1 en todos, se queda el celeste.
- **Doble navegación en la bandeja.** Un clic en el enlace del nombre sube a la fila; sin `stopPropagation` navegaría dos veces (y el `state` del segundo podría ganar). La prueba del paso 6 lo cubre.
- **Líneas largas.** Las tablas ya tienen líneas de más de 120 caracteres (nota del 2026-11-07); este spec no las corta.

## Lo que **no** entra en este spec

- Las pestañas de «Indicadores» y los specs C a F de Chris.
- Cambios en el backend de usuarios o en el contrato.
- Registrar un empleado con municipio y sin establecimiento desde la pantalla.
- Un tema oscuro de toda la app.

Cada uno, si llega, va en su propio spec.
