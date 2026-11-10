# Spec A. Ajustes menores de interfaz

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `2f86a46` (SPEC 52, HU-44).
> **Origen:** correcciones del Sprint 4 (ver `CORRECCIONES_SPRINT_4.md`). Rutas relativas a `frontend/src/` salvo que digan `backend/`.

> **Choque con otros specs:** A2 y A3 tocan las tablas de `paginas/indicadores/` que también reacomoda el spec B; no trabajarlos en la misma rama a la vez.

### A1. Sidebar con más contraste (punto 1)

- **Dónde:** tokens `--sidebar*` de `index.css` (líneas ~119-126). El menú es `componentes/layout/MenuLateral.jsx`.
- **Hoy:** `--sidebar: #edf3f9` casi igual al fondo (`--background: #f5f8fb`).
- **Cambio (propuesta):** un celeste más oscuro de la paleta MSPAS, sin saturar. Punto de partida: `--sidebar: #d6e6f4`, `--sidebar-accent: #bcd6ee`, `--sidebar-border: #c3d6e8`; texto igual (`#34506b`). Alternativa más fuerte para probar: fondo azul `#2f5f8a` con texto claro, que obliga a cambiar también el «SIRCOVA» (`text-primary`) y el subtítulo (`text-muted-foreground`) del encabezado del menú.
- **Criterios:**
  - El menú se distingue a simple vista del contenido.
  - Texto normal, ítem activo y hover con contraste AA (≥ 4.5:1).
  - Solo cambian tokens (y el encabezado del menú si se usa la alternativa oscura).

### A2. «Cumple» con colores y orden de columnas (punto 2)

- **Dónde:** `TablaResultados` (en `paginas/indicadores/PaginaIndicadores.jsx`), `TablaBrecha.jsx`, `TablaDesercion.jsx`, `TablaProyeccion.jsx`. Hoy cada una tiene su `textoCumple` que devuelve texto plano.
- **Cambio:**
  - «Sí» en insignia verde suave (tokens `--exito` / `--exito-foreground`) y «No» en insignia roja suave; «—» queda gris. Un componente compartido (p. ej. `InsigniaCumple.jsx`) reemplaza los cuatro `textoCumple`. En proyección («¿Llega a la meta?») se usa la misma insignia con el estilo de dato estimado que ya tiene la columna.
  - Regla de orden en todas las tablas: **Meta** justo antes de la columna del indicador, y la columna del indicador justo antes de **Cumple**.
- **Orden resultante (confirmado por Chris, 2026-11-10):**
  - Cobertura / Avance: Municipio · Dosis acumuladas · Población (o Meta del mes) · Dosis que faltan · Meta · Cobertura (o Avance) · Cumple.
  - Deserción: Municipio · Dosis iniciales · Dosis finales · Pérdida · Meta · Deserción · Cumple.
  - Proyección: Municipio · Dosis acumuladas · Ritmo mensual · Dosis proyectadas · Población · Dosis que faltarían · Meta · Cobertura proyectada · ¿Llega a la meta?
  - Brecha (no tiene «Meta» en %): Municipio · Dosis acumuladas · Dosis para la meta · Excedente · Dosis que faltan · Cumple.
- **Criterios:**
  - En las cuatro tablas el valor del indicador queda al lado de Cumple y Meta a su izquierda.
  - Sí/No se distinguen por color y por texto (no solo color).
  - Las pruebas de las tablas (`*.test.jsx`) se actualizan al nuevo orden.

### A3. Población sin decimales (punto 3)

- **Dónde:** `TablaResultados` usa `formatoDecimal.format(r.denominador)`; `TablaProyeccion.jsx` igual (línea ~96).
- **Cambio:** mostrar con `formatoEntero` (redondeo al entero más cercano). Aplica también a «Meta del mes» del avance, que comparte la columna (población ÷ 12 × mes). Solo presentación: el cálculo y la API no cambian.
- **Criterios:** ninguna celda de Población / Meta del mes muestra decimales; los porcentajes no cambian.

### A4. Badge amarillo para «cambios sin guardar» (punto 4)

- **Dónde:** `paginas/registro/CapturaReporte.jsx`, en las píldoras de vacuna (líneas ~911-918, `idsConCambios`). El punto «café» es `bg-advertencia-foreground` (`#7a4a06`).
- **Cambio:** el punto de cambios sin guardar pasa a amarillo/ámbar visible (nuevo token, p. ej. `--cambio-pendiente: #f2c14e`, con anillo `ring-card`). El punto rojo de errores (`conErrores`) no cambia.
- **Criterios:**
  - Tras validar, corregir un dato sin guardar el borrador muestra el punto amarillo en esa vacuna.
  - Al guardar el borrador, el punto amarillo desaparece.
  - El texto oculto «(cambios sin guardar)» se mantiene para lectores de pantalla.

### A5. Municipio solo como texto al registrar personal (punto 7)

- **Dónde:** `paginas/usuarios/CamposEmpleado.jsx` (líneas ~211-232), que usan `PaginaRegistrarPersonal.jsx` y `PaginaEditarUsuario.jsx`.
- **Hoy:** con establecimiento, el municipio ya se muestra como texto; **sin** establecimiento aparece un select de municipio. Por eso, si se elige primero el municipio y luego el establecimiento, el municipio «cambia».
- **Cambio:** quitar el select. El municipio siempre es texto: el del establecimiento elegido, o «—» sin establecimiento. El frontend deja de mandar `municipioId`; el backend sigue tomándolo del establecimiento (`usuarios.service.js`).
- **⚠ Choque con lo implementado:** `empleado.municipio_id` permite un municipio **sin** establecimiento («alcance territorial opcional, p. ej. coordinador municipal», `backend/db/01`). Con este cambio ese caso ya no se puede registrar desde la pantalla. Si nadie lo usa, el backend puede quedarse igual; si se usa, hay que conservar el select solo para «Sin establecimiento».
- **Criterios:**
  - Registrar y editar: no hay select de municipio; al elegir establecimiento aparece su municipio como texto.
  - Un empleado guardado con municipio y sin establecimiento sigue mostrando su municipio (solo lectura).
  - Se actualizan las pruebas de `CamposEmpleado` / registro / edición.

### A6. Bandeja: botón «Revisar» y fila clicable (punto 9)

- **Dónde:** `paginas/revision/PaginaBandejaRevision.jsx` (tabla, líneas ~345-400). Hoy solo el nombre del establecimiento es enlace a `/revision/reportes/{reporteId}` y la columna de acciones tiene «Asignar» / «Reasignar».
- **Cambio:**
  - Botón **Revisar** en la columna de acciones cuando el reporte está `EN_REVISION` y asignado al usuario (`esMio`). Lleva a `/revision/reportes/{reporteId}` con `state={{ volverA: search }}`, igual que el enlace.
  - Si el reporte tiene revisor asignado (y no es borrador), toda la fila es clicable y lleva al reporte. Cursor de mano y hover en la fila.
  - Los botones Asignar/Reasignar no disparan la navegación de la fila (`stopPropagation`).
  - El enlace del nombre se queda (teclado y clic derecho «abrir en otra pestaña»).
- **Criterios:**
  - Mis reportes en revisión muestran «Revisar»; los de otros no.
  - Clic en la fila de un reporte asignado abre el reporte; en uno sin asignar o borrador no hace nada.
  - Pulsar Asignar abre el diálogo y no navega.
