# SPEC 70 — HU-54 Consultar la auditoría

> **Estado:** Implementado
> **Historia:** HU-54
> **Origen:** historia
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 48 y SPEC 64
> **Fecha:** 2026-11-16
> **Objetivo:** Que el Administrador consulte en la pantalla «Auditoría» la bitácora de su DDRISS combinando filtros por fechas, usuario, módulo, acción y elemento afectado, vea los valores anteriores y nuevos de cada registro y exporte el resultado a Excel.

## Por qué existe este spec

El SPEC 05 (HU-53) dejó la bitácora escribiéndose en cada cambio, pero nadie puede leerla: la opción «Auditoría» del menú abre «En construcción», el permiso `BITACORA_CONSULTAR` que pide el menú no existe en `05_permisos_mysql.sql`, y `GET /auditoria/bitacora` está en el contrato sin respuesta ni implementación. Las tarjetas «Actividad de la bitácora» y «Cambios en catálogos» del Inicio del Administrador siguen en «Sin datos todavía» esperando este endpoint (nota del SPEC 48 en HU-54).

La tabla `bitacora` no tiene `ddriss_id`, y la regla 10 de `AGENTS.md` exige filtrar por la DDRISS del usuario: el alcance se deduce del autor de cada fila, sin tocar el modelo.

**Lo que se decidió en la fase de preguntas (2026-11-16):**

- Permiso nuevo `BITACORA_CONSULTAR`, solo para el ADMINISTRADOR.
- Alcance por la DDRISS del autor: filas cuyo `usuario_id` es de un empleado de la DDRISS del Administrador, más los intentos de inicio de sesión fallidos cuyo `nombre_usuario_intento` es de un usuario de su DDRISS. Las filas automáticas (sin usuario ni intento) no se ven.
- Filtro de elemento afectado por entidad (tabla o colección) y su id exacto, no por texto libre.
- Cada fila muestra etiquetas en español y se expande a una tabla campo · anterior · nuevo; no se resuelven nombres de municipios, reportes ni periodos.
- Exportar a Excel con un endpoint propio, los mismos filtros y un tope de 10 000 filas.
- Se llenan las dos tarjetas del Inicio del Administrador.
- Entran del mockup los chips de filtros activos, los accesos rápidos, el resumen sobre la tabla y el selector de filas por página.
- Por defecto, los últimos 30 días.
- Las opciones de los filtros salen de un endpoint propio.
- «Cambios en catálogos» cuenta solo las tablas de catálogo de MySQL; esquemas, reglas e indicadores son de HU-55.
- El spec va en `specs/acceso-y-seguridad/`, junto al SPEC 05.

## Alcance

**Entra:**

- **Permisos** (zona protegida, autorizado por el equipo en esta fase): en `backend/db/05_permisos_mysql.sql`, el permiso `('BITACORA_CONSULTAR', 'SISTEMA', 'Consultar y exportar la bitácora de auditoría de su DDRISS')` asignado solo a ADMINISTRADOR. En la base de prueba se corren solo esos `INSERT IGNORE`, no el script entero.
- **Contrato** en `backend/openapi.yaml` (`x-permiso: BITACORA_CONSULTAR` en los tres):
  - `GET /auditoria/bitacora`: completar parámetros (`entidad`, `entidadId`) y la respuesta paginada con `resumen`;
  - `GET /auditoria/bitacora/opciones`: usuarios, módulos, acciones y entidades para los filtros;
  - `GET /auditoria/bitacora/excel`: el resultado filtrado como `.xlsx`, con 422 si pasa del tope.
- **Backend** (`backend/src/modulos/auditoria/`): `auditoria.service.js` sigue siendo el de escritura; la consulta va en `bitacora.service.js` (lista, opciones, alcance, validación de parámetros), el libro en `bitacoraExcel.service.js` (ExcelJS), más `auditoria.controller.js` y `auditoria.routes.js`, montadas en `/api/v1/auditoria`.
- **Frontend:**
  - `api/auditoria.js`: `listarBitacora(filtros)`, `obtenerOpcionesBitacora()` y `descargarBitacoraExcel(filtros)` (con `descargar` de `api/cliente.js`);
  - pantalla nueva `paginas/auditoria/` (`PaginaAuditoria.jsx`, `BarraFiltrosAuditoria.jsx`, `TablaBitacora.jsx` y las funciones puras y etiquetas en `auditoria.js`), puesta como `pagina` de «Auditoría» en `opcionesMenu.js`;
  - `paginas/inicio/roles/InicioAdministrador.jsx`: `Datos` y `permisos` de «Actividad de la bitácora» y «Cambios en catálogos».
- **Pruebas:** `backend/tests/bitacoraConsulta.test.js` (lista, opciones, alcance y Excel); `frontend/src/paginas/auditoria/PaginaAuditoria.test.jsx` y `auditoria.test.js`; ajustar `PaginaInicio.test.jsx`, `RutaConPermiso.test.jsx` y `Layout.test.jsx` si dejan de cuadrar.
- **Documentación:** nota en `backend/src/modulos/auth/CLAUDE.md` (módulo de los specs de `acceso-y-seguridad`), avance de HU-54 en `docs/SPECS/HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

**Fuera de alcance (para otros specs):**

- Agregar `ddriss_id` a `bitacora` o cualquier otro cambio al modelo de datos.
- Ver las filas automáticas (sin usuario ni intento) y la bitácora de otras DDRISS; `BITACORA_CONSULTAR` para la Autoridad u otro rol.
- Resolver nombres legibles del elemento afectado («Reporte agosto 2026, Malacatán») o textos como «En revisión → Aprobado» armados por entidad.
- Búsqueda de texto libre por municipio, reporte o catálogo.
- Exportar a PDF.
- El historial de cambios de configuración por versión (HU-55).
- Registrar en la bitácora las consultas (solo se registra la exportación).
- Cambios a `transicion_estado` o a `package.json` (ExcelJS ya está).

## Modelo de datos

No cambia el modelo: se lee `bitacora` con `usuario`, `empleado` y `rol`. Lo nuevo en la base es el permiso `BITACORA_CONSULTAR` y su asignación al ADMINISTRADOR.

### Alcance

Una fila de la bitácora es visible para el Administrador si:

- `bitacora.usuario_id` es de un `usuario` cuyo `empleado.ddriss_id` es el del Administrador, o
- `bitacora.usuario_id` es `NULL` y `bitacora.nombre_usuario_intento` es el `nombre_usuario` de un usuario de su DDRISS (intentos fallidos contra una cuenta de su DDRISS).

Las demás filas no existen para él. El ADMINISTRADOR siempre tiene DDRISS (regla 10); si por error no la tuviera, la lista viene vacía.

### `GET /auditoria/bitacora`

| Parámetro | Valores | Por defecto |
|---|---|---|
| `desde`, `hasta` | `AAAA-MM-DD`, días de Guatemala, inclusivos; `desde` ≤ `hasta` | sin límite |
| `usuarioId` | entero; también trae los intentos fallidos contra esa cuenta | todos |
| `modulo` | un valor de `MODULOS` | todos |
| `accion` | `^[A-Z_]{1,40}$` (no se limita a `ACCIONES`: la semilla tiene `CERRAR_PERIODO` y `AUTORIZAR`) | todas |
| `entidad` | una o varias separadas por coma, cada una `^[a-z_]{1,60}$` | todas |
| `entidadId` | texto de 1 a 40 caracteres, igual exacto | todos |
| `pagina`, `porPagina` | `Pagina` y `PorPagina` del contrato | 1 y 20 |

Cualquier otro parámetro o valor responde 400 `ENTRADA_INVALIDA`. Un `usuarioId` fuera de su DDRISS da una lista vacía, sin revelar que existe. Orden: `fecha` y `id` descendentes. El rango de 30 días por defecto lo pone la pantalla, no el endpoint.

```json
{
  "elementos": [
    {
      "id": 9123,
      "fecha": "2026-10-07T22:42:10.512Z",
      "usuario": { "id": 2, "nombreUsuario": "estadigrafa", "nombre": "María López", "rol": { "codigo": "REVISOR", "nombre": "Revisor" } },
      "nombreUsuarioIntento": null,
      "modulo": "REVISION",
      "accion": "CAMBIO_ESTADO",
      "entidad": "reporte_produccion",
      "entidadId": "255",
      "valoresAnteriores": { "estado": "EN_REVISION" },
      "valoresNuevos": { "estado": "APROBADO" },
      "ipOrigen": "10.0.0.21",
      "agenteUsuario": "Mozilla/5.0 …"
    }
  ],
  "total": 248,
  "pagina": 1,
  "porPagina": 10,
  "resumen": { "usuarios": 14, "rectificaciones": 3, "accesosFallidos": 5 }
}
```

- `usuario` es `null` en un intento fallido; entonces `nombreUsuarioIntento` lleva lo tecleado.
- `resumen` cuenta sobre todas las filas filtradas (no solo la página): `usuarios` distintos (los intentos fallidos no cuentan), `rectificaciones` (filas del módulo `RECTIFICACION`) y `accesosFallidos` (`LOGIN_FALLIDO`, `CUENTA_BLOQUEADA` y `ACCESO_DENEGADO`).

### `GET /auditoria/bitacora/opciones`

```json
{
  "usuarios": [{ "id": 2, "nombreUsuario": "estadigrafa", "nombre": "María López", "rol": { "codigo": "REVISOR", "nombre": "Revisor" }, "activo": true }],
  "modulos": ["USUARIOS", "CONFIGURACION", "PRODUCCION", "REVISION", "RECTIFICACION", "INDICADORES", "REPORTES", "SISTEMA"],
  "acciones": ["ACCESO_DENEGADO", "ACTUALIZAR", "CAMBIO_ESTADO", "…"],
  "entidades": ["alerta", "cierre_periodo", "esquemas_captura", "…"]
}
```

`usuarios` son todos los de su DDRISS, activos e inactivos, por nombre. `modulos` es `MODULOS`. `acciones` y `entidades` son los valores distintos de las filas de su alcance, en orden alfabético.

### `GET /auditoria/bitacora/excel`

Los mismos filtros que la lista, sin `pagina` ni `porPagina`. Si las filas filtradas pasan de 10 000, responde 422 `DEMASIADAS_FILAS` con el mensaje «El resultado tiene {n} registros; acote los filtros para exportar 10,000 o menos.», sin armar el archivo.

- Libro con una hoja «Bitácora»: título, DDRISS, filtros aplicados y fecha de generación arriba; columnas Fecha y hora (Guatemala), Usuario, Rol, Módulo, Acción, Entidad, Id, Valores anteriores, Valores nuevos, IP y Agente. Módulo y acción con la misma etiqueta en español que la pantalla; los valores como JSON en una línea.
- Nombre: `bitacora-AAAA-MM-DD.xlsx` (día de la generación) en `Content-Disposition`.
- Después de armarlo, fila `EXPORTAR` del módulo `SISTEMA`, `entidad` `bitacora`, con los filtros, `formato: xlsx` y el número de filas en `valoresNuevos`, y el contexto del usuario; si la bitácora falla, no hay archivo (como `exportarInforme`).
- Las etiquetas de módulos y acciones del Excel repiten las del frontend: un cambio va en los dos lados.

### Pantalla «Auditoría» (`/auditoria`)

Reproduce `docs/mockups/pantallas/Auditoria.html` sin sus medidas fijas ni sus datos.

- **Encabezado:** «AUDITORÍA Y TRAZABILIDAD», «Bitácora del sistema», el texto del mockup y el botón «Exportar resultados» (deshabilitado mientras descarga; un 422 o un error muestra su mensaje en un aviso).
- **Filtros:** Desde y Hasta (fechas), Usuario (`SelectorConBusqueda`, con el rol y «(inactivo)» si aplica), Módulo y Acción (`Select` de shadcn, con «Todos»/«Todas»), y Elemento afectado: un `Select` de entidad y un campo «Id» opcional. Botones «Aplicar» y «Limpiar». Se editan en un borrador y solo «Aplicar» los escribe en la URL (`desde`, `hasta`, `usuario`, `modulo`, `accion`, `entidad`, `entidadId`, `pagina`, `porPagina`); aplicar vuelve a la página 1.
- **Rango por defecto:** si la URL no trae `desde` ni `hasta`, la pantalla pone los últimos 30 días (hoy de Guatemala y 29 días antes). Un `desde` o `hasta` vacío en la URL (`desde=`) significa sin límite, para poder ver todo el historial. «Limpiar» vuelve a los 30 días sin otros filtros.
- **Chips de filtros activos** debajo de los filtros, uno por filtro aplicado («Fecha: 01/09/2026 a 07/10/2026», «Usuario: María López», «Acción: Cambio de estado», «Elemento: Reporte #255»…), con un botón para quitarlo; quitar el de fecha deja el rango sin límite.
- **Accesos rápidos:** «Hoy», «Últimos 7 días» (cambian solo el rango) y «Solo rectificaciones» (`modulo=RECTIFICACION`), que se aplican de inmediato.
- **Resumen** sobre la tabla: «{total} registros entre el {desde} y el {hasta} · del más reciente al más antiguo» (sin límite: «{total} registros en todo el historial») y «{usuarios} usuarios · {rectificaciones} rectificaciones».
- **Tabla** (`Table` de shadcn): Fecha y hora (Guatemala, fuente mono), Usuario (nombre y rol debajo; en un intento fallido, «Intento: {nombreUsuarioIntento}»), Acción (etiqueta de color por grupo y el módulo debajo), Elemento afectado (etiqueta de la entidad y «#{entidadId}») y Detalle: un botón «Ver cambios»/«Ocultar cambios» si hay valores.
- **Detalle expandido:** tabla Campo · Valor anterior · Valor nuevo con la unión de claves de los dos JSON (objetos y listas anidados como JSON compacto, un valor ausente como «—»), más IP y agente.
- **Etiquetas:** módulos, acciones y entidades con nombre en español en `auditoria.js`; un código sin etiqueta se muestra tal cual. Las acciones se agrupan en colores del tema (sesión, edición, cambio de estado, rectificación, configuración, desactivación o borrado, acceso denegado), con variables de `index.css`, nunca colores a mano.
- **Paginación:** «Filas por página» (10, 20, 50; 10 por defecto, como el mockup), «Mostrando {a} a {b} de {total}» y el componente de páginas que ya usan las listas paginadas.
- **Estados:** cargando (el de las demás pantallas), sin resultados («No hay registros con estos filtros.»), error con «Reintentar». A 390 px la tabla se desplaza dentro de su contenedor y la página no tiene desplazamiento horizontal.

### Tarjetas del Inicio del Administrador

Las dos con `permisos: ['BITACORA_CONSULTAR']` y un enlace a `/auditoria` con los filtros que usan:

- **Actividad de la bitácora:** `GET /auditoria/bitacora?desde={hoy − 6}&hasta={hoy}&porPagina=1`: «{total} registros en los últimos 7 días», «{usuarios} usuarios» y, si hay, «{accesosFallidos} accesos fallidos o denegados» en tono de advertencia.
- **Cambios en catálogos:** la misma consulta con `modulo=CONFIGURACION&entidad=vacuna,dosis,establecimiento,distrito_salud,red,periodo,poblacion_objetivo` (lista en una constante de `auditoria.js`): «{total} cambios en los últimos 7 días» y el último («{acción} de {entidad} · {fecha}»); sin cambios, «Sin cambios en los últimos 7 días».

## Plan de implementación

1. **Permiso.** Agregar `BITACORA_CONSULTAR` y su asignación al ADMINISTRADOR en el 05, con el comentario `-- SPEC 70 (HU-54)`, y correr solo esos `INSERT IGNORE` en la base de prueba. Comprobar con el login del Administrador que lo trae y con el de la Autoridad y el Revisor que no.
2. **Contrato.** Los tres endpoints con sus parámetros, respuestas (200, 400, 401, 403 y 422 del Excel) y ejemplos.
3. **Lista.** `bitacora.service.js` con el alcance, la validación de parámetros (como `revisarParametros` de alertas), el rango de días de Guatemala convertido a la zona en que se guarda `fecha` (se comprueba al empezar el paso) y el `resumen`; controlador y rutas. Pruebas en `bitacoraConsulta.test.js` (ver «Riesgos» para los datos):
   - el Administrador de la DDRISS de prueba ve las filas de sus usuarios y los intentos fallidos contra sus cuentas, y no las de otra DDRISS ni las automáticas;
   - cada filtro solo y combinados; `entidad` con varias; `usuarioId` trae sus intentos fallidos; `usuarioId` de otra DDRISS da vacío;
   - `desde`/`hasta` incluyen los extremos en hora de Guatemala;
   - `total`, `pagina`, `porPagina` y `resumen` sobre las filas filtradas;
   - 400 con fecha inválida, `desde` > `hasta`, módulo fuera de `MODULOS`, `porPagina=101` o un parámetro desconocido; 403 sin el permiso (Revisor, Autoridad); 401 sin sesión.
4. **Opciones.** Endpoint y pruebas: usuarios de su DDRISS con rol y `activo`, y acciones y entidades solo de su alcance.
5. **Excel.** `bitacoraExcel.service.js` (puro, desde las filas) y la ruta; pruebas que abren el archivo con `exceljs` y comparan las celdas con la lista, el 422 con más de 10 000 filas (con el tope inyectable en la prueba) y la fila `EXPORTAR` en la bitácora.
6. **Pantalla.** `api/auditoria.js`, `paginas/auditoria/` y su `pagina` en `opcionesMenu.js`. Pruebas en `PaginaAuditoria.test.jsx`: rango de 30 días por defecto, filtros que pasan a la URL solo al aplicar, chips que se quitan, accesos rápidos, resumen, detalle expandido con anterior y nuevo, intento fallido, filas por página, exportar (y su 422), vacío y error; y en `auditoria.test.js` las funciones puras (etiquetas, diferencias, rango por defecto). Ajustar `RutaConPermiso.test.jsx`.
7. **Inicio.** Las dos tarjetas en `InicioAdministrador.jsx`, con sus pruebas en `PaginaInicio.test.jsx`.
8. **Verificación manual** con la API real, Vite y Playwright: como Administrador, filtrar por usuario, fechas, módulo, acción y elemento (un reporte de la semilla), abrir el detalle de un cambio de estado y de un intento fallido, exportar y abrir el `.xlsx`, y comprobar su fila `EXPORTAR`; las dos tarjetas del Inicio cuadran con la pantalla; como Revisor, «Auditoría» no está en el menú y `/auditoria` no abre; a 390 px nada desborda.
9. **Documentación.** Nota en `backend/src/modulos/auth/CLAUDE.md`, avance de HU-54 en `HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] `BITACORA_CONSULTAR` existe en el 05 y en la base de prueba, asignado solo al ADMINISTRADOR.
- [x] `GET /auditoria/bitacora` devuelve solo las filas cuyo autor es de la DDRISS del Administrador y los intentos fallidos contra cuentas de su DDRISS; nunca las de otra DDRISS ni las automáticas.
- [x] Los filtros por fechas, usuario, módulo, acción, entidad e id se combinan, y la lista viene paginada del más reciente al más antiguo con `total` y `resumen` sobre las filas filtradas.
- [x] Un parámetro o valor fuera del contrato responde 400; sin `BITACORA_CONSULTAR`, 403.
- [x] `GET /auditoria/bitacora/opciones` da los usuarios de su DDRISS y las acciones y entidades de su alcance.
- [x] `GET /auditoria/bitacora/excel` devuelve un `.xlsx` con las mismas filas que la lista con esos filtros, responde 422 con más de 10 000 y deja su fila `EXPORTAR` en la bitácora.
- [x] La pantalla abre con los últimos 30 días, aplica los filtros desde la URL, muestra los chips, los accesos rápidos, el resumen y las filas por página, y permite ver todo el historial.
- [x] Cada registro se expande a sus valores anteriores y nuevos por campo, con la IP y el agente.
- [x] «Exportar resultados» descarga el Excel con los filtros aplicados y muestra el mensaje del 422.
- [x] «Actividad de la bitácora» y «Cambios en catálogos» del Inicio del Administrador muestran datos de la API y enlazan a la pantalla filtrada.
- [x] La bitácora sigue sin rutas de edición ni de borrado.
- [x] Los colores salen de las variables del tema y a 390 px la pantalla no tiene desplazamiento horizontal.
- [x] El contrato describe los tres endpoints y la API arranca.
- [x] Pasan `bitacoraConsulta.test.js`, `auditoria.test.js` (backend, sin cambios), `PaginaAuditoria.test.jsx`, `auditoria.test.js` (frontend), `PaginaInicio.test.jsx`, `RutaConPermiso.test.jsx` y la suite del frontend.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** `BITACORA_CONSULTAR` solo para el ADMINISTRADOR. Es lo que piden la historia y el mockup; otro rol se agrega con su propio spec.
- **Sí:** alcance por la DDRISS del autor. Cumple la regla 10 sin tocar el modelo; las filas de un usuario siempre son de su DDRISS.
- **No:** `ddriss_id` en `bitacora`. Sería un cambio al modelo (zona protegida) y a todas las llamadas de `registrarBitacora`; con una sola DDRISS operando, el autor basta.
- **No:** las filas automáticas (sin usuario ni intento). No se puede saber de qué DDRISS son; mostrarlas filtraría las de otras DDRISS.
- **Sí:** los intentos fallidos contra cuentas de su DDRISS. Son la evidencia de seguridad que más interesa; un intento con un nombre que no existe no se puede atribuir y no se ve.
- **Sí:** filtro de elemento por entidad e id exacto. Usa el índice `ix_bitacora_entidad`; la bitácora no guarda el municipio, y buscarlo pediría resolver cada entidad.
- **No:** nombres legibles del elemento ni textos armados por entidad. Cada entidad pediría su consulta; la tabla de diferencias ya muestra el cambio.
- **Sí:** `accion` con patrón y no limitada a `ACCIONES`. La semilla tiene `CERRAR_PERIODO` y `AUTORIZAR`, que también se deben poder filtrar.
- **Sí:** endpoint de opciones. Da solo usuarios de su DDRISS y los valores que de verdad existen, incluidos los viejos.
- **Sí:** Excel por un endpoint con los mismos filtros, tope de 10 000 y 422. Respeta el alcance y deja la exportación en la bitácora (sección 3 de `AGENTS.md`); el tope evita armar libros enormes contra Aiven.
- **No:** PDF. La historia pide Excel.
- **Sí:** `EXPORTAR` del módulo `SISTEMA` con `entidad` `bitacora`. El `ENUM` de `bitacora.modulo` no tiene uno de auditoría y el permiso es de `SISTEMA`.
- **No:** registrar las consultas. Solo se registran escrituras, exportaciones y accesos denegados (HU-53); el 403 de un rol sin permiso ya queda.
- **Sí:** últimos 30 días por defecto, en la pantalla y no en el endpoint. La primera consulta queda liviana y el endpoint sigue siendo un filtro sin sorpresas; `desde=` vacío permite ver todo.
- **Sí:** filtros en un borrador que «Aplicar» escribe en la URL, como «Informes». Evita una consulta por cada tecla y deja la búsqueda en un enlace.
- **Sí:** chips, accesos rápidos, resumen y filas por página del mockup. Decisión del equipo.
- **Sí:** las dos tarjetas del Inicio con el mismo endpoint (`porPagina=1`). No hace falta un endpoint de resumen aparte.
- **Sí:** «Cambios en catálogos» solo con tablas de catálogo de MySQL. Los cambios de esquemas, reglas e indicadores son el historial de HU-55.
- **Sí:** el spec en `acceso-y-seguridad`. `AGENTS.md` pone la bitácora ahí, junto al SPEC 05.

**Decididas al implementar (2026-11-16):**

- **Sí:** «Ver detalle» en las filas sin valores (inicios de sesión, por ejemplo), que despliega solo la IP y el agente. El criterio pide que todo registro se pueda desplegar con ellos.
- **Sí:** las acciones y los elementos de los filtros, ordenados por su etiqueta en español (no por el código). Son listas largas; «Módulo» conserva el orden del modelo.
- **Sí:** la búsqueda de usuario también encuentra por el rol («estadígrafa» trae a todos los revisores). Decisión del equipo tras la prueba manual.
- **Sí:** el tope del Excel se prueba llamando a `exportarBitacora` con `{ tope: 5 }`, no por la ruta.
- **Sí:** `guardarArchivo` pasó de `PaginaInformes.jsx` a `lib/archivos.js`, para que lo compartan Informes y Auditoría.
- **Sí:** el chip de un filtro largo (las 7 entidades de «Cambios en catálogos») crece en alto en vez de tener alto fijo: a 390 px se encimaba con el siguiente.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La bitácora no se puede borrar (triggers del 06): las filas de prueba se quedan para siempre | Las pruebas usan una DDRISS ficticia permanente `ZVT_HU54` con cuentas permanentes (creadas con `INSERT IGNORE`, como `vitest-hu03-permanente`), insertan sus filas con `fecha` en 2099 y un `entidad_id` único por corrida, y filtran por él. Se anota en la nota del módulo. |
| El alcance con `JOIN`/`EXISTS` a `usuario` y `empleado` y el `resumen` hacen lenta la consulta contra Aiven | La pantalla siempre pide un rango (30 días por defecto) y la consulta usa `ix_bitacora_fecha` e `ix_bitacora_usuario`; se mide en la verificación y, si pasa de 2 s, se anota y se ajusta. |
| `acciones` y `entidades` de las opciones recorren toda la bitácora de la DDRISS | Se miden en la verificación; si son lentas, se acotan a los últimos 12 meses y se anota. |
| `fecha` se guarda en la zona de la conexión (`CURRENT_TIMESTAMP`) y el filtro es por día de Guatemala | Se comprueba al empezar el paso 3 y se prueba con filas a las 23:59 y a las 00:00 de Guatemala. |
| Los valores viejos de la semilla (`CERRAR_PERIODO`, `AUTORIZAR`) no tienen etiqueta | Se muestran con su código; se pueden agregar etiquetas sin cambiar nada más. |
| El Excel de 10 000 filas tarda o pesa | El tope corta antes de armarlo; se prueba con el tope inyectado y se mide una exportación real en la verificación. |
