# SPEC 44 — Calcular la cobertura y el avance contra la meta del mes

> **Estado:** Implementado
> **Historia:** HU-36
> **Depende de:** SPEC 04, SPEC 05, SPEC 17, SPEC 39, SPEC 41 y SPEC 43
> **Fecha:** 2026-11-03
> **Objetivo:** Que el backend calcule, por DDRISS, año y mes de corte, la cobertura acumulada y el avance contra la meta del mes de cada indicador que aplica a la DDRISS, por municipio de procedencia y para el departamento, y lo guarde en una corrida con la versión de configuración usada, al cerrar el mes, al aplicar una rectificación o a pedido.

## Por qué existe este spec

`corrida_calculo` y `resultado_indicador` existen desde el 01 y la semilla (03) trae una corrida de agosto de 2026 escrita a mano. `configuracion_indicadores` ya se configura por DDRISS (SPEC 43). Falta el motor: hoy `POST /periodos/{id}/cerrar` (SPEC 39) y `POST /rectificaciones/{id}/aprobar` (SPEC 41) no recalculan nada, y `POST /indicadores/corridas` y `GET /indicadores/resultados` son provisionales en el contrato.

Este spec trae el motor con un **calculador por tipo** y los de `COBERTURA` y `AVANCE_META_MES`. `BRECHA` (HU-37), `DESERCION` (HU-38) y `PROYECCION` (HU-39) agregan el suyo después; hasta entonces se omiten sin error.

**Diferencias con la historia y con la documentación** (decididas por el equipo):

- `corrida_calculo` no tenía DDRISS: la corrida era «vigente por año y mes» en todo el país y la fila departamental (`municipio_id NULL`) quedaba ambigua con varias DDRISS. Se agrega `corrida_calculo.ddriss_id`; cada corrida es de una DDRISS.
- «Usa solo reportes cerrados»: el numerador solo cuenta reportes `CERRADO`, pero una corrida manual puede tener como corte cualquier mes del calendario; si algún mes de enero al corte no estaba cerrado al calcular, la corrida es **parcial** y la pantalla lo dice.
- La fórmula de la historia es la de `AVANCE_META_MES`. `COBERTURA` usa el prorrateo de su versión (`NINGUNO` = población anual; `MENSUAL_LINEAL` = la del mes) y su meta (95 % por defecto).
- `meta.homogeneidad_municipal` y `alerta` no se usan: las alertas son de HU-51.

## Alcance

**Entra:**

- Script `backend/db/10_corrida_ddriss_mysql.sql` (idempotente) y el 01 a la v0.11 con `corrida_calculo.ddriss_id`; la corrida 1 de la semilla (03) con `DDRISS_SM`.
- Permisos `INDICADOR_CALCULAR` e `INDICADOR_CONSULTAR` en `05_permisos_mysql.sql`.
- Motor `modulos/indicadores/` (`motor.service.js`, `calculadores.js`, `corridas.service.js`, rutas y controlador).
- Endpoints: `POST /indicadores/corridas`, `GET /indicadores/corridas`, `GET /indicadores/corridas/{id}` y `GET /indicadores/resultados`.
- Disparo automático: al cerrar el mes (`CIERRE_PERIODO`) y al aplicar una rectificación (`RECTIFICACION`, ese mes y los siguientes cerrados del año).
- Acción de bitácora `CALCULAR_INDICADORES` (módulo `INDICADORES`).
- Pantalla `/indicadores` (la opción del menú que ya existe): corridas, «Calcular» y tabla de resultados por municipio.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock`).
- Verificación manual con Playwright; avance de HU-36, notas en HU-37 a HU-41 y HU-51, `CONTEXTO BD.md` y `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Calcular `BRECHA`, `DESERCION` y `PROYECCION` (HU-37, HU-38, HU-39).
- Generar alertas (`alerta`, HU-51) y la tarea programada (`PROGRAMADA`).
- Gráficas, mapa, dashboard y exportar a Excel o PDF (HU-40 a HU-44).
- Nivel distrito o establecimiento, agrupar por sexo u otras dimensiones, rangos de meses.
- Corridas asíncronas o en cola.
- Borrar corridas o resultados.
- Cambiar `v_produccion_atribuida` u otras vistas.

## Modelo de datos

### Cambio en MySQL (autorizado al definir el spec)

```sql
-- 10_corrida_ddriss_mysql.sql (idempotente; bases creadas con un 01 anterior a la v0.11)
ALTER TABLE corrida_calculo
  ADD COLUMN ddriss_id TINYINT UNSIGNED NULL AFTER id;              -- si no existe
UPDATE corrida_calculo SET ddriss_id = (SELECT id FROM ddriss WHERE codigo = 'DDRISS_SM') WHERE ddriss_id IS NULL;
ALTER TABLE corrida_calculo
  MODIFY ddriss_id TINYINT UNSIGNED NOT NULL COMMENT 'DDRISS calculada',
  DROP INDEX ix_corrida_vigente,
  ADD KEY ix_corrida_vigente (ddriss_id, anio, mes_hasta, vigente),
  ADD CONSTRAINT fk_corrida_ddriss FOREIGN KEY (ddriss_id) REFERENCES ddriss (id);
```

- El 01 pasa a la v0.11 con la columna, el índice y la llave; el comentario de `vigente` dice «por (DDRISS, año, mes_hasta)». El 03 inserta la corrida 1 con el id de `DDRISS_SM`.
- `resultado_indicador` no cambia: su DDRISS es la de su corrida.
- Orden de scripts después de recrear con el 01: 05, 06, 09 (y el 10 solo en bases anteriores a la v0.11).

### Corrida

| Columna | Valor |
|---|---|
| `ddriss_id` | la del usuario, o la del mes cerrado o del reporte rectificado |
| `anio`, `mes_hasta` | el corte |
| `disparada_por` | el usuario (también en el cierre y la rectificación, que tienen usuario); `NULL` solo sin usuario |
| `motivo` | `MANUAL`, `CIERRE_PERIODO` o `RECTIFICACION` |
| `estado` | `COMPLETADA` o `FALLIDA` (`EN_PROCESO` no se ve: todo va en una transacción) |
| `vigente` | `TRUE` en la última `COMPLETADA` de (DDRISS, año, mes); la anterior pasa a `FALSE` en la misma transacción |

**Parcial** (no se guarda): una corrida es parcial si algún mes de enero a `mes_hasta` no tiene `cierre_periodo` `CERRADO` de su DDRISS con `cerrado_en <= iniciada_en`. La API lo devuelve como `parcial` y `mesesSinCerrar` (los números de mes).

### Qué se calcula

Para cada indicador que aplica a la DDRISS **al iniciar la corrida** (la `VIGENTE` de la DDRISS antes que la nacional, `indicadoresQueAplican(ddrissCodigo)`, exportada de `indicadores.service.js` sobre `versionesVisibles`) cuyo `tipo_calculo` tiene calculador, con `aplica_a[0]`:

- **Municipios:** los activos del departamento sede de la DDRISS, sin el `9999` (el territorio de `procedencias.service.js`).
- **Numerador** (por municipio): suma de `cantidad` de los reportes `CERRADO` de establecimientos de la DDRISS, del año, meses 1 a `mes_hasta` (`acumulado: ANUAL`), de la vacuna y la dosis del indicador, atribuida al municipio de **procedencia** del mismo departamento (Migrantes `9999` y otros departamentos no cuentan; el Hospital de San Marcos, `solo_cobertura`, sí). Es la regla de `v_produccion_atribuida`; con `filtros_dimension` (`grupo_edad: [..]`) se agrega un `EXISTS` sobre `detalle_dimension` por cada dimensión. Una sola consulta parametrizada sobre `v_produccion`, agrupada por municipio.
- **Población:** `poblacion_objetivo.cantidad` del municipio, el año y `clasificacion_poblacion`.
- **Denominador:** `MENSUAL_LINEAL` = población ÷ 12 × `mes_hasta`; `NINGUNO` = población. Redondeado a 2 decimales (`DECIMAL(14,2)`).
- **Valor:** numerador ÷ denominador × 100, a 4 decimales.
- **Meta:** `meta.valor` de la versión (en avance, 100).
- **`brecha_dosis`:** máx(0, ⌈meta ÷ 100 × denominador − numerador⌉).
- **`cumple_meta`:** `valor {comparador} meta`.
- **Departamental** (`municipio_id NULL`): suma de los numeradores y de los denominadores de todos los municipios; si a alguno le falta la población, la fila departamental es no calculable.
- **Sin población:** la fila guarda el numerador y deja `denominador`, `valor`, `meta`, `brecha_dosis` y `cumple_meta` en `NULL`.
- `vacuna_id` y `dosis_id` salen de los códigos de MySQL; `filtro_dimensiones` es la forma canónica (`grupo_edad=MENOR_1`, claves y valores ordenados); `es_proyeccion = FALSE`; `indicador_codigo` e `indicador_version` los de la versión usada.
- Un indicador cuya vacuna, dosis o clasificación ya no existe se **omite** con su motivo; uno de un tipo sin calculador se omite con «Su cálculo todavía no está disponible.». Nada de eso hace fallar la corrida.

Ejemplo de la historia: población 541, `MENSUAL_LINEAL`, junio → denominador 270,50; con 270 dosis, avance 99,8152 %, `brecha_dosis` 1 y `cumple_meta` `FALSE` (`>=`).

### Calculadores (`calculadores.js`)

`CALCULADORES = { COBERTURA: calcularContraMeta, AVANCE_META_MES: calcularContraMeta }`: funciones puras que reciben la versión, los numeradores y las poblaciones por municipio y el mes, y devuelven las filas. HU-37 a HU-39 agregan su tipo aquí.

### Escritura y concurrencia

1. Valida el cuerpo, lee la configuración de MongoDB.
2. `enTransaccion`: primera consulta `SELECT id FROM ddriss WHERE id = ? FOR UPDATE` (serializa las corridas de una DDRISS; nota del 2026-10-23); inserta la corrida, calcula, inserta los resultados en un solo `INSERT`, pasa a `vigente = FALSE` la anterior y deja la nueva `COMPLETADA` y `vigente`, con su `finalizada_en`, y escribe la bitácora.
3. Si algo falla, se deshace y, en otra transacción, se inserta la corrida `FALLIDA` (sin resultados, `vigente = FALSE`) con su bitácora; el endpoint manual responde 500 con el formato común.

### Disparo automático

- **Cierre** (`cerrarPeriodo`, `cierre.service.js`): después de confirmar el cierre, `calcularCorrida({ ddrissId, anio, mes, motivo: 'CIERRE_PERIODO', usuarioId })`. Si falla, el mes sigue cerrado, la corrida queda `FALLIDA` y la respuesta del cierre agrega `corrida: { id, estado }`.
- **Rectificación** (`aprobarRectificacion`, `rectificaciones.service.js`): después de confirmar, una corrida `RECTIFICACION` por cada mes `CERRADO` de la DDRISS en el mismo año, desde el del reporte hasta el último cerrado, en orden. La respuesta agrega `corridas: [{ id, mesHasta, estado }]`.

### Permisos (en el 05, bloque "SPEC 44 (HU-36)")

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `INDICADOR_CALCULAR` | `INDICADORES` | Calcular los indicadores de su DDRISS para un mes | EPIDEMIOLOGIA, REVISOR, ADMINISTRADOR |
| `INDICADOR_CONSULTAR` | `INDICADORES` | Consultar las corridas y los resultados de los indicadores | EPIDEMIOLOGIA, REVISOR, ADMINISTRADOR, AUTORIDAD |

(El módulo del catálogo de permisos se confirma al implementar contra los valores que ya usa el 05.) El cálculo automático no pide permiso: lo hace quien cierra o aprueba. AUTORIDAD sin DDRISS consulta cualquier DDRISS con `ddrissId`; los demás, solo la suya (`filtroAlcance`).

### Bitácora

`CALCULAR_INDICADORES` (nueva en `ACCIONES`), módulo `INDICADORES`, entidad `corrida_calculo`, `entidad_id` la corrida; `valoresNuevos`: `{ ddrissId, anio, mesHasta, motivo, estado, parcial, indicadores: [{ codigo, version }], omitidos: [{ codigo, motivo }], resultados: n }` (o `error` en una `FALLIDA`). Sin usuario solo si la corrida no tiene usuario.

### Endpoints

**`POST /indicadores/corridas` (`INDICADOR_CALCULAR`).** Cuerpo `{ anio, mesHasta }` (otro campo, 400). El mes debe estar en `periodo` (422 `CORRIDA_INVALIDA`: "El mes {m} de {anio} no está en el calendario."). Responde **201** con `Corrida` (ver abajo). Usuario sin DDRISS: 403 `SIN_PERMISO`.

**`GET /indicadores/corridas` (`INDICADOR_CONSULTAR`).** Parámetros `anio` (obligatorio), `mesHasta`, `ddrissId` (solo AUTORIDAD sin DDRISS; obligatorio para ella), `Pagina`, `PorPagina`. Respuesta paginada `{ elementos, total, pagina, porPagina }`, de la más reciente a la más antigua.

**`GET /indicadores/corridas/{id}` (`INDICADOR_CONSULTAR`).** `Corrida` con `resultados`; 404 fuera del ámbito.

**`GET /indicadores/resultados` (`INDICADOR_CONSULTAR`).** Parámetros `anio` y `mes` (obligatorios), `indicador` (código), `municipioId`, `ddrissId` (como arriba). Lee la corrida **vigente** de (DDRISS, año, mes); sin ella responde 200 `{ corrida: null, resultados: [] }`. Responde `{ corrida, resultados: [ResultadoIndicador] }`.

`Corrida`:

```json
{
  "id": 7, "ddriss": { "id": 1, "codigo": "DDRISS_SM" }, "anio": 2026, "mesHasta": 8,
  "motivo": "MANUAL", "estado": "COMPLETADA", "vigente": true,
  "parcial": false, "mesesSinCerrar": [],
  "disparadaPor": { "id": 4, "nombre": "…" }, "iniciadaEn": "…Z", "finalizadaEn": "…Z",
  "indicadores": [{ "codigo": "COB_HEXA3", "version": 1, "nombre": "…", "tipoCalculo": "COBERTURA" }],
  "omitidos": [{ "codigo": "DES_HEXA1_3", "motivo": "Su cálculo todavía no está disponible." }],
  "totalResultados": 62
}
```

`indicadores` y `omitidos` salen de la bitácora `CALCULAR_INDICADORES` de la corrida; en la corrida de la semilla (sin bitácora) `indicadores` se deduce de sus resultados y `omitidos` es `[]`.

`ResultadoIndicador` (amplía el esquema provisional):

```json
{
  "indicadorCodigo": "AVANCE_HEXA3", "indicadorVersion": 1, "tipoCalculo": "AVANCE_META_MES",
  "municipio": { "id": 1, "nombre": "San Marcos" }, "vacuna": { "codigo": "HEXA", "nombre": "Hexavalente" },
  "dosis": "D3", "filtroDimensiones": "grupo_edad=MENOR_1", "anio": 2026, "mes": 8,
  "numerador": 975, "denominador": 966.67, "valor": 100.8621, "meta": 100,
  "brechaDosis": 0, "cumpleMeta": true, "calculable": true, "color": "verde", "esProyeccion": false
}
```

`municipio` es `null` en la fila departamental; `calculable` es `false` si `valor` es `NULL`; `color` sale de los `umbrales` de la versión usada (leída de MongoDB por código y versión), o `null` sin umbrales o sin valor. Las fechas se leen con `UNIX_TIMESTAMP` (nota del 2026-10-21). Orden: departamental primero, luego por nombre de municipio.

### Errores

| HTTP | `codigo` | Caso |
|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Campo o parámetro desconocido, año fuera de 2000 a 2100, mes fuera de 1 a 12, `ddrissId` donde no va o que falta |
| 403 | `SIN_PERMISO` | Calcular sin DDRISS |
| 404 | `NO_ENCONTRADO` | Corrida inexistente o de otra DDRISS |
| 422 | `CORRIDA_INVALIDA` | El mes no está en el calendario |

### Frontend

- `src/api/indicadores.js`: `calcularIndicadores({ anio, mesHasta })`, `listarCorridas(params)`, `obtenerCorrida(id)` y `listarResultados(params)`. Sin caché.
- `opcionesMenu.js`: «Indicadores» (`/indicadores`) mantiene `INDICADOR_CONSULTAR` y recibe `pagina: PaginaIndicadores` (lazy).
- `paginas/indicadores/PaginaIndicadores.jsx`:
  - `EncabezadoPagina` con antetítulo «Indicadores», título «Cobertura contra la meta del mes» y la acción «Calcular» (con `INDICADOR_CALCULAR`).
  - Filtros en la URL (`anio`, `mes`, `indicador`; `ddriss` para la Autoridad nacional): Select de año y mes, Select de indicador (los códigos de la corrida vigente).
  - Card de la corrida vigente: «Calculada el {fecha} por {nombre} · {motivo}», con el aviso ámbar (`--advertencia`) "Cálculo parcial: {meses} no estaban cerrados." si `parcial`, y la lista de omitidos. Sin corrida: «Este mes todavía no tiene indicadores calculados.».
  - Tabla: Municipio · Dosis acumuladas · Meta del mes (denominador) · Avance o cobertura (%) con su insignia de color (`--destructive`, `--advertencia`, `--exito`) · Meta (%) · Dosis que faltan · Cumple. Fila departamental arriba, en negrita. «Sin población» en las no calculables.
  - «Historial de corridas»: tabla plegable con las corridas del año (fecha, corte, motivo, estado, «Parcial», «Vigente»).
  - `DialogoCalcularIndicadores.jsx` (`AlertDialog`): año y mes; si el mes no está cerrado, avisa "El mes no está cerrado: solo se cuentan los reportes ya cerrados."; al terminar, `toast.success("Indicadores de {mes} de {anio} calculados: {n} resultados.")` y recarga.
  - Carga con Skeleton, errores con `AvisoError` y `onReintentar`.
- No hay mockup de esta versión mínima: la tabla sigue el estilo de `Indicadores.html`, sin sus gráficas (HU-41).

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                ← /indicadores/corridas (POST, GET), /indicadores/corridas/{id}, /indicadores/resultados; Corrida, ResultadoIndicador; respuestas de cerrar periodo y aprobar rectificación
├── db/01_modelo_relacional_mysql.sql           ← v0.11: corrida_calculo.ddriss_id
├── db/03_datos_prueba_mysql.sql                ← ddriss_id de la corrida 1
├── db/05_permisos_mysql.sql                    ← INDICADOR_CALCULAR, INDICADOR_CONSULTAR
├── db/10_corrida_ddriss_mysql.sql              ← nuevo
├── src/app.js                                  ← rutas de indicadores
├── src/modulos/auditoria/auditoria.service.js  ← CALCULAR_INDICADORES
├── src/modulos/configuracion/indicadores.service.js ← exporta indicadoresQueAplican
├── src/modulos/indicadores/                    ← nuevo: indicadores.routes.js, indicadores.controller.js, corridas.service.js, motor.service.js, calculadores.js
├── src/modulos/revision/cierre.service.js      ← corrida al cerrar
├── src/modulos/revision/rectificaciones.service.js ← corridas al aplicar
└── tests/
    ├── calculadores.test.js                    ← nuevo (puro)
    ├── corridas.test.js                        ← nuevo
    ├── cierrePeriodo.test.js                   ← corrida al cerrar
    └── resolverRectificacion.test.js           ← corridas al aplicar
frontend/src/
├── api/indicadores.js                          ← nuevo
├── componentes/layout/opcionesMenu.js          ← pagina de «Indicadores»
└── paginas/indicadores/                        ← nuevo: PaginaIndicadores.jsx (+ .test), DialogoCalcularIndicadores.jsx (+ .test)
docs/SPECS/HISTORIAS_DE_USUARIO.md, docs/base-de-datos/CONTEXTO BD.md, CLAUDE.md
```

## Plan de implementación

1. **Contrato.** Las cuatro operaciones con `x-permiso`, `Corrida`, `ResultadoIndicador` ampliado, los errores con ejemplo y los campos nuevos de las respuestas de cerrar periodo y aprobar rectificación. Comprobación: `/api/docs` carga.
2. **Modelo y permisos.** El 10, el 01 v0.11, el 03 y el bloque del 05. **Pedir autorización antes de correr el 10 y el 05** en la base de prueba (`mysql2` con `multipleStatements`). Comprobación: `corrida_calculo.ddriss_id` existe y la corrida 1 es de `DDRISS_SM`; correr el 10 dos veces no falla; el token de `epidemiologia`, `estadigrafa`, `admin.prueba` trae los dos permisos y el de la autoridad solo `INDICADOR_CONSULTAR`.
3. **Calculadores puros.** `calculadores.js` y `calculadores.test.js`: el ejemplo de 541 en junio; `NINGUNO` contra `MENSUAL_LINEAL`; meta superada (`brecha_dosis` 0); sin población (fila no calculable y departamental no calculable); los comparadores; una fila de la semilla (`COB_HEXA3`, San Marcos, agosto: 975 / 966,67 = 100,8621). Comprobación: la prueba pasa.
4. **Motor y corrida manual.** `motor.service.js` (numeradores, poblaciones, configuración), `corridas.service.js` (`calcularCorrida`, listar, obtener, resultados), rutas y controlador. `corridas.test.js` usa el año **2006** (meses con fecha límite `2099-12-31`), la vacuna `ZVT_HU36` (`D1`, `D2` con `completa_esquema`), indicadores `ZVT_HU36_*` de `DDRISS_SM` insertados en MongoDB (`COBERTURA` `NINGUNO`, `AVANCE_META_MES` con `grupo_edad`, uno `DESERCION`) y reportes `CERRADO` insertados por SQL de dos establecimientos con procedencias propia, de otro municipio, `9999` y del Hospital de San Marcos; población de dos municipios (uno sin población). Borra todo al inicio y al final (corridas del año 2006 y sus resultados antes que la corrida). Casos:
   - los valores esperados por municipio y departamental; Migrantes no cuenta y el hospital sí; el filtro de edad excluye las otras celdas;
   - el `DESERCION` sale en `omitidos` y la corrida queda `COMPLETADA`;
   - `indicador_version` es la que aplicaba; una versión nueva publicada después no cambia los resultados guardados;
   - una segunda corrida queda vigente y la primera no; `GET /indicadores/resultados` lee la vigente;
   - con un mes sin cerrar, `parcial` y `mesesSinCerrar`;
   - dos corridas en paralelo: las dos `COMPLETADA`, una sola vigente;
   - si falla el `INSERT` de resultados (`vi.spyOn`), queda una corrida `FALLIDA` sin resultados y con su bitácora;
   - 400, 404 de otra DDRISS, 422 de un mes fuera del calendario; Personal 403; la Autoridad consulta con `ddrissId`.
5. **Disparo automático.** En `cerrarPeriodo` y `aprobarRectificacion`. Pruebas en `cierrePeriodo.test.js` (cerrar crea la corrida `CIERRE_PERIODO`) y `resolverRectificacion.test.js` (aplicar en un mes con otro mes cerrado después crea dos corridas `RECTIFICACION` y el acumulado del segundo cambia; un fallo del motor no deshace la rectificación). Comprobación: los archivos que tocó el spec pasan.
6. **Frontend.** `api/indicadores.js`, la página y el diálogo. Pruebas: la tabla con la fila departamental, colores e «Sin población»; el aviso de parcial y los omitidos; sin corrida; «Calcular» solo con `INDICADOR_CALCULAR`, el aviso de mes sin cerrar y `toast.success`; filtros en la URL; `AvisoError` con «Reintentar». Comprobación: `npm test` del frontend pasa completo.
7. **Verificación manual y documentación.** Con Playwright (acceso rápido o inicio de sesión a mano): como `epidemiologia`, calcular agosto de 2026 y comparar con la corrida de la semilla; ver septiembre (`EN_CIERRE`) parcial; como Autoridad, solo consulta. Revisar por SQL la corrida, sus resultados y la bitácora. Documentación: avance y criterios de HU-36; notas en HU-37, HU-38 y HU-39 (agregar su calculador en `CALCULADORES`), HU-40/41 (leer `GET /indicadores/resultados`) y HU-51 (alertas); `CONTEXTO BD.md` (v0.11 y reglas del motor); nota en `CLAUDE.md`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta las cuatro operaciones con su `x-permiso` y `/api/docs` carga.
- [x] Solo cambian en `backend/db/` el 01, el 03, el 05 y el 10 nuevo; el 10 es idempotente. Los `package.json` no cambian.
- [x] Meta del mes = población ÷ 12 × número de mes, y el avance = dosis acumuladas ÷ meta del mes × 100; el caso de 541 en junio da 270,50 de meta.
- [x] Las dosis se atribuyen al municipio de procedencia; Migrantes y otros departamentos no cuentan y el Hospital de San Marcos sí, con pruebas de cada caso.
- [x] Cada resultado guarda el código y la versión de configuración usados, y publicar otra versión después no los cambia.
- [x] Cada corrida es de una DDRISS; solo una `COMPLETADA` es vigente por DDRISS, año y mes, también con dos corridas en paralelo.
- [x] Cerrar un mes crea su corrida `CIERRE_PERIODO`; aplicar una rectificación crea una `RECTIFICACION` por ese mes y cada mes cerrado siguiente del año; si el cálculo falla, el cierre o la rectificación siguen confirmados y la corrida queda `FALLIDA`.
- [x] Un municipio sin población deja una fila no calculable; un tipo sin calculador se omite sin hacer fallar la corrida.
- [x] Una corrida con meses sin cerrar se muestra como parcial.
- [x] Sin `INDICADOR_CALCULAR` o `INDICADOR_CONSULTAR` los endpoints responden 403 y la pantalla oculta «Calcular» o la opción; cada rol ve solo su DDRISS salvo la Autoridad nacional.
- [x] Cada corrida deja su `CALCULAR_INDICADORES` en la bitácora, también las `FALLIDA`.
- [x] Las pruebas que tocó el spec pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar pruebas, y no quedan datos `ZVT_HU36…` ni del año 2006.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch`.
- [x] HU-36 tiene su avance y sus criterios, las historias siguientes sus notas, y `CONTEXTO BD.md` y `CLAUDE.md` están al día.

## Decisiones

- **Sí:** `corrida_calculo.ddriss_id` con un script 10 y el 01 v0.11 (decidido en la fase de preguntas). **No:** una corrida para todas las DDRISS, que recalcula a las demás al cerrar el mes de una y deja ambigua la fila departamental; **no:** quitar la fila departamental.
- **Sí:** solo `COBERTURA` y `AVANCE_META_MES`, con un calculador por tipo (decidido en la fase de preguntas). **No:** traer aquí la brecha de HU-37 o la deserción de HU-38.
- **Sí:** pantalla mínima en «Indicadores» (decidido en la fase de preguntas). **No:** solo backend; **no:** solo el botón.
- **Sí:** corrida síncrona; la automática corre después de confirmar el cierre o la rectificación y su fallo no los deshace (decidido en la fase de preguntas). **No:** 202 y segundo plano; **no:** dentro de la misma transacción.
- **Sí:** `INDICADOR_CALCULAR` para Epidemiología, Revisor y Administrador; `INDICADOR_CONSULTAR` para ellos y la Autoridad (decidido en la fase de preguntas).
- **Sí:** corrida manual de cualquier mes del calendario, marcada como parcial si algún mes no estaba cerrado; `parcial` se deduce de `cierre_periodo.cerrado_en`, sin columna, y la última `COMPLETADA` siempre es la vigente (decidido en la fase de preguntas). **No:** solo meses cerrados; **no:** que una parcial no sea vigente.
- **Sí:** una rectificación recalcula su mes y los cerrados siguientes del año (decidido en la fase de preguntas), porque el acumulado cambia.
- **Sí:** sin población, fila no calculable (decidido en la fase de preguntas). **No:** omitir el municipio; **no:** hacer fallar la corrida.
- **Sí:** la fila departamental es no calculable si a un municipio le falta la población (decidido al escribir el spec), para no comparar todas las dosis contra parte de la población.
- **Sí:** el numerador es una consulta sobre `v_produccion` con la regla de `v_produccion_atribuida` más un `EXISTS` por dimensión (decidido al escribir el spec), porque la vista no tiene dimensiones y las vistas no se cambian.
- **Sí:** un `FOR UPDATE` sobre la fila de `ddriss` como primera consulta (decidido al escribir el spec), para que dos corridas de la misma DDRISS no dejen dos vigentes.
- **Sí:** `color` del semáforo calculado al leer, con los umbrales de la versión usada (decidido al escribir el spec): `resultado_indicador` no tiene columna de color.
- **Sí:** `disparada_por` lleva al usuario que cerró o aprobó (decidido al escribir el spec): la corrida automática también tiene responsable.
- **Sí:** las pruebas usan el año 2006 (libre: 2007 a 2025 ya tienen dueño) y datos `ZVT_HU36*`.

Decididas al implementar:

- **Sí:** una población de 0 deja la fila no calculable, como la que falta, para no dividir entre cero (paso 3).
- **Sí:** las alertas de cobertura son de HU-51, no de HU-46 (que agrupa informes por dimensión); el spec decía HU-46 (paso 7).
- **Sí:** las lecturas de la corrida van antes y fuera de la transacción, en paralelo por el pool (`leerDatos`), y la transacción solo bloquea `ddriss`, quita la vigente anterior e inserta la corrida ya `COMPLETADA`, sus resultados y la bitácora. Lo pidió Chris para que las pruebas no tarden tanto: cada viaje a Aiven cuesta unos 130 ms y una corrida bajó de más de 20 viajes a unos 9 (`corridas.test.js`, de 91 s a 47 s). El bloqueo sigue garantizando una sola vigente (prueba de dos corridas en paralelo). **No:** leer dentro de la transacción, como decía «Escritura y concurrencia» (paso 5).
- **Sí:** el numerador agrupa por `vacuna_codigo` y `dosis_codigo` de `v_produccion`, así no hace falta leer los ids antes; un filtro de varias dimensiones (que la pantalla no crea) conserva su propia consulta (paso 5).
- **Sí:** para provocar el fallo, las pruebas espían el calculador (`vi.spyOn(CALCULADORES, tipo)`) y no el `INSERT` de resultados: la conexión de la transacción no se puede espiar desde la prueba (pasos 4 y 5).
- **Sí:** los casos del SPEC 44 de `resolverRectificacion.test.js` usan meses de 2005 (libre), porque los de HU-33 ocupan los 12 de 2008; el esquema de prueba de `ZVT_HU33` es vigente desde enero de 2005. `configIndicadores.test.js` borra en su limpieza los `resultado_indicador` de sus vacunas, porque una corrida de otro archivo los calcula (paso 4).
- **Sí:** `PERIODO_CONSULTAR` para Epidemiología (el diálogo «Calcular» lee el estado de los meses), aunque con eso ve «Administración › Periodos» en solo lectura, y `DDRISS_CONSULTAR` para la Autoridad (la nacional elige la DDRISS) (decidido en el paso 6). **No:** avisar solo después de calcular; **no:** un endpoint propio de DDRISS.
- **Sí:** el aviso del diálogo lista todos los meses de enero al corte que no están cerrados, no solo el elegido, porque son los que hacen parcial la corrida; en cobertura la columna se llama «Población» y no «Meta del mes» (paso 6).
- **Sí:** los años de la pantalla son el actual y los seis anteriores (la Autoridad no lee el calendario) y el mes por defecto es el anterior al actual; el diálogo toma los años y meses del calendario (paso 6).
- **Sí:** las pruebas existentes que usaban `/indicadores` como pantalla en construcción pasan a `/mapa` (`RutaConPermiso.test.jsx`) o esperan la pantalla real (`PaginaInicio.test.jsx`) (paso 6).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El 01 cambia de versión y las bases ya creadas no tienen la columna | Script 10 idempotente y nota del orden de scripts en `CLAUDE.md`. |
| El cierre o la rectificación terminan bien pero sin indicadores | La corrida queda `FALLIDA` con su bitácora, la respuesta lo dice y se puede recalcular a mano. |
| Una corrida manual parcial reemplaza a una completa | La pantalla la marca como parcial y el cierre del mes vuelve a calcular. |
| La población cargada es de ejemplo | Los resultados dependen de ella; se avisa en la verificación manual. |
| El motor y la vista `v_produccion_atribuida` se separan | Una prueba compara el numerador sin filtros con la vista para el mismo año y vacuna. |
| La corrida de la semilla no tiene bitácora | `indicadores` se deduce de sus resultados y `omitidos` es `[]`. |

## Lo que **no** entra en este spec

- Brecha, deserción y proyección (HU-37 a HU-39).
- Alertas y la corrida `PROGRAMADA` (HU-51).
- Gráficas, mapa, dashboard e informes (HU-40 a HU-44).
- Otros niveles (distrito, establecimiento) y agrupar por dimensiones.
- Borrar corridas o resultados.

Cada uno, si se hace, va en su propio spec.
