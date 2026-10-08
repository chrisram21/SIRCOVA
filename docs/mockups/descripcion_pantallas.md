# SIRCOVA: descripción de pantallas para prototipo

Plataforma web de la DDRISS San Marcos (MSPAS, Guatemala) para registrar, revisar y analizar la producción mensual de vacunación de 30 municipios. Todo en español. Solo datos agregados, nunca datos de pacientes. Los datos de ejemplo son ficticios.

## Estilo general
- Escritorio, 1440 px de ancho. Menú lateral verde pastel (#dcefe5) de 240 px con el logo "SIRCOVA · DDRISS San Marcos" (cuadro verde menta #7cc4a4 con una cruz blanca); el texto del menú va en verde oscuro (#2d5446). La opción activa tiene fondo celeste (#c6e2f7) y texto azul oscuro. Al pie del menú, el usuario y su rol.
- Fondo menta muy claro (#f2f7f5), tarjetas blancas con borde fino (#dbe7e1) y esquinas de 12 px. Las tarjetas de resumen alternan fondo celeste (#e6f2fb) y verde pastel (#e5f4ec).
- Tipografía IBM Plex Sans; cifras en IBM Plex Mono.
- Color de acción principal: verde #357d5f con texto blanco. Enlaces en azul #2a6f9e.
- Colores de datos: azul (#3d85c6) y celeste (#b9dcf6) para los datos y el cumplimiento; naranja pastel (#f0a877) y coral (#e8877a) para el rezago. El valor siempre va escrito junto al color.
- Escala de cobertura en 4 rangos: En meta (63.3% o más) azul #3d85c6; Cerca (55 a 63.2%) celeste #b9dcf6; Bajo (45 a 54.9%) durazno #f7cfa6; Crítico (menos de 45%) coral #e8877a.
- Las proyecciones van punteadas, sobre fondo gris claro y con la etiqueta "Estimación".

---

## Pantalla 1. Inicio de sesión
- Dividida en dos. A la izquierda (620 px), un panel verde pastel con el logo y texto en verde oscuro, el título "Producción de vacunación del departamento de San Marcos, en un solo lugar.", un subtítulo ("Registro mensual por establecimiento, revisión y cierre de periodos, e indicadores de cobertura para los 30 municipios.") y al pie "DDRISS San Marcos · MSPAS".
- A la derecha, un formulario centrado: título "Iniciar sesión", alerta roja "Usuario o contraseña incorrectos. Intente de nuevo.", campos Usuario o correo institucional y Contraseña (este con borde rojo), casilla "Recordar este equipo", enlace "¿Olvidó su contraseña?", botón "Ingresar" y la nota "¿No tiene cuenta? El administrador registra a cada usuario y le asigna su rol."

## Pantalla 2. Inicio (resumen ligero; ejemplo con el rol Epidemiología)
Menú: Inicio (activo), Registro de producción, Revisión y cierre (insignia 6), Indicadores, Mapa territorial, Informes, Alertas (insignia 5), Auditoría, Configuración. Las gráficas de análisis no van aquí: están en Indicadores (pantalla 3) y en Mapa territorial.

**Encabezado:** "Buenos días" y debajo "Resumen del departamento de San Marcos · enero a agosto de 2026". A la derecha: "Datos de periodos cerrados · actualizado 28/09/2026".

**Fila 1: 4 tarjetas de resumen** (fondos celeste y verde pastel alternados)
1. Cobertura departamental (Penta 3): **57.1%**, con la nota "6.2 puntos bajo la meta proporcional de 63.3%".
2. Municipios en meta: **11 de 30** (19 municipios con brecha).
3. Reportes de agosto cerrados: **14 de 30** (el cierre vence el 30/09).
4. Alertas activas: **5** (1 crítica, 1 seria y 3 advertencias).

**Fila 2 (dos columnas)**
- **"Avance del cierre de agosto"**: una barra apilada delgada con Cerrado 14, Aprobado 5, En revisión 4, Corrección solicitada 3 y Enviado o sin enviar 4, su leyenda en dos columnas y el enlace "Ir a revisión".
- **"Alertas que requieren acción"**: las 3 más importantes, cada una con una etiqueta de severidad:
  - Crítica: Tacaná, Sibinal y Concepción Tutuapa están bajo 45% de cobertura en Penta 3.
  - Seria: Ocós y Sibinal no han enviado el reporte de agosto.
  - Advertencia: Malacatán atribuye 38% de sus dosis a otros municipios.
  - Enlace "Ver las 5".

**Fila 3: "Accesos rápidos"**, 4 tarjetas con icono, título y una línea:
- Indicadores: cobertura, brecha, deserción y proyección.
- Mapa territorial: dónde se concentra el rezago.
- Informes: informe consolidado en PDF.
- Revisión y cierre: 6 reportes esperan revisión.

## Pantalla 3. Indicadores (se llega desde el menú)
**Encabezado:** "INDICADORES DE COBERTURA" y el título "Enero a agosto de 2026". A la derecha, el botón "Exportar PDF".

**Barra de filtros:** Año 2026 · Periodo Ene a Ago (acumulado) · Vacuna trazadora Pentavalente 3.ª dosis · Municipio Todos (30) · Atribución Por procedencia.

**Fila 1**
- (2/3 del ancho) **Gráfica de líneas "Avance acumulado y proyección al cierre del año"**, que responde "¿Llegaremos al 95% en diciembre?". Eje X de enero a diciembre y eje Y de 0 a 100%.
  - Real (línea azul sólida): Ene 6.4, Feb 13.3, Mar 20.9, Abr 27.8, May 35.2, Jun 42.0, Jul 49.3, Ago 57.1.
  - Proyección (azul punteada, sobre fondo gris claro con la etiqueta "Estimación"): Sep 64.5, Oct 71.9, Nov 79.3, Dic 86.7, con una banda celeste de 81.8 a 91.6 en diciembre.
  - Meta proporcional (línea gris): recta de 7.9% en enero a 95% en diciembre.
- (1/3) **Barras "Cobertura por vacuna"** con línea de meta en 63.3%: BCG 68.4, Hepatitis B RN 61.2, Penta 1 61.4, IPV 1 61.0, Neumococo 2 59.1, Rotavirus 2 58.8, Penta 3 57.1 (resaltada), bOPV 3 56.3, SPR 1 55.6, SPR 2 48.2.

**Fila 2**
- (1/2) **Barras horizontales "Cobertura por municipio"**, ordenadas de mayor a menor, con la leyenda de los 4 rangos arriba y una línea punteada en "Meta 63.3%":
  Río Blanco 74.1, San Antonio Sacatepéquez 72.5, San Pedro Sacatepéquez 71.2, Esquipulas Palo Gordo 70.4, San Rafael Pie de la Cuesta 69.8, El Quetzal 68.3, Tejutla 67.4, San Marcos 66.8, El Rodeo 65.2, San Pablo 64.9, San Cristóbal Cucho 63.8, Pajapita 62.1, San Miguel Ixtahuacán 61.5, El Tumbador 60.1, Ayutla 59.4, Comitancillo 58.7, San Lorenzo 58.2, Nuevo Progreso 57.3, La Reforma 56.9, Ixchiguán 55.2, La Blanca 54.8, Catarina 53.6, Malacatán 52.4, Sipacapa 51.3, San José Ojetenam 49.6, Tajumulco 48.9, Ocós 46.7, Concepción Tutuapa 44.1, Sibinal 42.3, Tacaná 39.8.
- (1/2, dos tarjetas apiladas)
  - **Barras "Brecha a la meta proporcional"** (dosis que faltan; total 1,801), los 8 municipios más altos: Tacaná 422, Concepción Tutuapa 312, Tajumulco 222, Malacatán 180, Sibinal 82, Comitancillo 74, Ocós 71, Catarina 61.
  - **Barras "Deserción entre Penta 1 y Penta 3"** (departamento: 7.0%), con una línea de umbral en 10%. Sobre el umbral, en naranja pastel: La Blanca 12.0, Catarina 11.9, El Quetzal 11.1, El Tumbador 10.9, San Lorenzo 10.6. Bajo el umbral, en celeste: Malacatán 9.2, El Rodeo 9.0, Ayutla 8.5.

## Pantalla 4. Registro de producción (rol Personal del establecimiento)
Menú reducido: Inicio, Registro de producción (activo), Mis reportes, Cobertura de mi municipio. Usuario: C/S Tacaná.
- Encabezado: "REGISTRO DE PRODUCCIÓN · CENTRO DE SALUD TACANÁ" y el título "Reporte mensual de septiembre de 2026". A la derecha, los pasos de estado: **Borrador** (activo) › Enviado › En revisión › Aprobado › Cerrado.
- Pestañas de vacunas: BCG ✓, Hepatitis B ✓, **Pentavalente** (activa), IPV/bOPV, Rotavirus, Neumococo, SPR, DPT refuerzos, Td.
- **Tarjeta A. "Dosis aplicadas a residentes de Tacaná"**, con el subtítulo "Formulario generado por el esquema de captura: Pentavalente, versión 3, vigente desde 01/01/2026". Tabla con filas 1.ª, 2.ª y 3.ª dosis y columnas Menor de 1 año / 1 año / 2 a 4 años, cada una dividida en Hombres y Mujeres, más una columna Total. Los valores se editan en campos numéricos:
  - 1.ª: 78, 74, 4, 3, 1, 0 = 160
  - 2.ª: 71, 69, 5, 4, 0, 1 = 150
  - 3.ª: 62, (vacío, con borde rojo), 8 (con borde amarillo), 7, 1, 0 = —
- **Tarjeta B. "Dosis aplicadas a personas de otros municipios"** (se atribuyen al municipio de procedencia). Filas con Municipio de procedencia, Dosis, Grupo de edad, Hombres, Mujeres y Total: Sibinal, 1.ª, <1 año, 2/1; Sibinal, 3.ª, <1 año, 1/2; San José Ojetenam, 2.ª, <1 año, 1/0; Otro departamento, 1.ª, 1 año, 0/1. Al final, el botón "+ Agregar municipio de procedencia".
- **Panel derecho "Validación automática":**
  - Error (rojo, bloquea el envío): "Falta la 3.ª dosis en mujeres menores de 1 año. Escriba 0 si no hubo."
  - Advertencia (amarillo): "En 1 año, la 3.ª dosis (15) supera a la 1.ª (7). Confirme si son esquemas atrasados."
  - Advertencia: "La 1.ª dosis es 18% menor que el promedio de los últimos 3 meses."
- Resumen: Vacunas completas 2 de 9 · Dosis a otros municipios 8 · Fecha límite 05/10/2026.
- Botones: "Enviar a revisión" (deshabilitado) y "Guardar borrador". Nota: "Corrija el error para poder enviar. Las advertencias no bloquean el envío."

- Debajo del título de la tarjeta A, una franja celeste que dice "Dimensiones de este esquema:" con las etiquetas **Dosis · Grupo de edad · Sexo** y la nota "Las columnas cambian según la vacuna".

### Pantalla 4b. Registro de la misma vacuna con otras dimensiones (ejemplo Td)
- Es la misma pantalla con la pestaña **Td** activa. El esquema es "Td, versión 2, vigente desde 01/03/2026" y sus dimensiones son **Dosis · Grupo de edad · Condición: embarazada o no**; esta vacuna no pide sexo.
- Tabla A: filas 1.ª dosis, 2.ª dosis y Refuerzo. Las columnas son 10 a 14 años, 15 a 19 años y 20 a 49 años, cada una dividida en Embarazada y No embarazada, más el Total:
  - 1.ª: 1, 6, 9, 11, 14, 8 = 49
  - 2.ª: 0, 4, 7, 9, 12, 6 = 38
  - Refuerzo: 0, 1, 3, 2, 6, 5 = 17
- La tabla B usa las mismas columnas (Embarazada y No embarazada) en lugar de Hombres y Mujeres.
- Validación: "Sin errores" en verde, más una advertencia: "Hay 1 embarazada de 10 a 14 años con 1.ª dosis. Confirme el grupo de edad." Nota: "Estas reglas vienen del esquema de Td; cada vacuna trae sus propias validaciones."

## Pantalla 5. Bandeja de revisión (rol Estadígrafa)
- Encabezado: "REVISIÓN Y CIERRE · PERIODO AGOSTO DE 2026" y el título "Bandeja de revisión". A la derecha, "19 de 30 aprobados o cerrados" y el botón deshabilitado "Cerrar periodo de agosto".
- Chips de filtro: Por atender 6 (activo), En revisión 4, Enviado 2, Corrección solicitada 3, Sin enviar 2, Aprobado 5, Cerrado 14, Todos 30.
- Tabla con Municipio · establecimiento, Enviado, Estado (etiqueta de color), Validación y Dosis totales:
  - Malacatán (seleccionada) · 22/09 · En revisión · 1 advertencia · 1,184
  - El Tumbador · 23/09 · En revisión · sin observaciones · 512
  - Ayutla (C/S Tecún Umán) · 24/09 · En revisión · 2 advertencias · 688
  - Catarina · 24/09 · En revisión · 1 advertencia · 471
  - La Blanca · 25/09 · Enviado · 402
  - Pajapita · 26/09 · Enviado · 1 advertencia · 366
  - Tajumulco · 18/09 · Corrección solicitada · devuelto el 20/09 · 1,027
  - Concepción Tutuapa · 17/09 · Corrección solicitada · 968
  - Ocós · — · Borrador · 60% capturado
  - San Marcos · 12/09 · Aprobado · 1,436
  - San Pedro Sacatepéquez · 10/09 · Cerrado · 1,702
- **Panel de detalle "Malacatán · agosto de 2026"**:
  - Cifras: A residentes 734 y A otros municipios 450 (38%).
  - Advertencia de atribución: "38% frente a un promedio de 21% en los últimos 6 meses."
  - Mini gráfica de barras con los 6 meses (Mar 1,120 a Ago 1,184).
  - Campo de observaciones.
  - Botones "Solicitar corrección" (borde naranja) y "Aprobar" (verde). Nota: "Cada acción queda en la bitácora de revisión."

## Pantalla 6. Mapa territorial
- Encabezado: "MAPA TERRITORIAL · PENTAVALENTE 3.ª DOSIS · ENE A AGO 2026" y el título "¿Dónde está el rezago de cobertura?". Selector segmentado: **Cobertura** · Brecha · Deserción · Estado del reporte.
- Interruptor "Atribuir dosis por: **Procedencia** | Lugar de aplicación".
- Mapa grande de los 30 municipios coloreados por rango, con Tacaná seleccionado (contorno negro) y la leyenda.
- **Panel derecho "Tacaná"**:
  - **39.8%** Crítico, con una barra de progreso y una marca de meta en 63.3%.
  - Población objetivo (<1 año) 1,790 · Dosis Penta 3 atribuidas 712 · Brecha 422 · Deserción 7.9% · Reporte de agosto: Cerrado.
  - Desglose de la atribución: aplicadas en Tacaná 745, menos 51 a residentes de otros municipios, más 18 a residentes de Tacaná vacunados en otros municipios, igual a 712 atribuidas.
  - Botón "Ver informe del municipio".

## Pantalla 7. Auditoría (rol Administrador)
- Encabezado: "AUDITORÍA Y TRAZABILIDAD" y el título "Bitácora del sistema", con el texto "Cada acción sobre usuarios, reportes, catálogos y configuraciones queda registrada y no se puede editar." A la derecha, el botón "Exportar resultados".
- **Filtros:** Desde y Hasta (fechas), Usuario, Tipo de acción y Elemento afectado (búsqueda por municipio, reporte o catálogo), con los botones "Aplicar" y "Limpiar". Debajo, los filtros activos como chips que se pueden quitar y accesos rápidos: Hoy, Últimos 7 días, Solo rectificaciones.
- Resumen sobre la tabla: "248 registros entre el 01/09/2026 y el 07/10/2026", 14 usuarios y 3 rectificaciones.
- Tabla con Fecha y hora · Usuario (con su rol) · Acción (etiqueta de color) · Elemento afectado · Detalle:
  - 07/10 16:42 · Estadígrafa · Cambio de estado · Reporte agosto, Malacatán · En revisión → Aprobado
  - 07/10 16:05 · Administrador · Rectificación · Reporte julio (cerrado), Tajumulco · fila expandida con valor anterior (Penta 3 · menor de 1 año · hombres = 58), valor nuevo (64) y justificación de la solicitud RCT-0012 autorizada por Epidemiología
  - 07/10 15:31 · C/S Tacaná · Edición · Reporte septiembre (borrador) · 12 campos modificados
  - 07/10 14:58 · Administrador · Configuración · Esquema de captura Td, versión 2 → 3
  - Otras filas: corrección solicitada, exportación de PDF, inicio de sesión, desactivación de un usuario (se puede restaurar), cambio de población objetivo y cierre del periodo de julio.
- **Paginación:** filas por página (10), "Mostrando 1 a 10 de 248" y botones Anterior, 1, 2, 3 … 25, Siguiente.

---

## La pantalla inicial según el rol
- **Personal del establecimiento:** estado y fecha límite de su reporte, validaciones pendientes, cobertura de su municipio y su tendencia mensual, y un acceso directo a Registro.
- **Estadígrafa:** estado de los reportes del periodo, bandeja de pendientes, alertas de calidad y de proceso, periodos por cerrar y solicitudes de rectificación.
- **Epidemiología:** el resumen del inicio y, desde el menú, la pantalla completa de Indicadores.
- **Autoridades (solo consulta):** indicadores clave, avance y proyección, mapa y ranking de municipios, y descarga del informe PDF, sin acciones de edición.
- **Administrador:** usuarios activos, esquemas de captura vigentes o por vencer, cambios en catálogos y actividad de la bitácora.
