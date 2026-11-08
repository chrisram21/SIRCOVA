# SPEC 43 — Configurar indicadores por DDRISS, con versiones y activación

> **Estado:** Implementado
> **Historia:** HU-35
> **Depende de:** SPEC 04, SPEC 05, SPEC 15, SPEC 18, SPEC 30 y SPEC 32
> **Fecha:** 2026-11-03
> **Objetivo:** Que Epidemiología cree indicadores de cobertura, avance contra la meta del mes, brecha y deserción para las vacunas de su DDRISS, publique versiones nuevas (dosis, población, prorrateo, meta y semáforo) de cualquier indicador que aplique a su DDRISS y active o desactive los suyos, con cada cambio guardado como versión en un historial.

## Por qué existe este spec

La colección `configuracion_indicadores` ya existe en el script 02, con su validador `$jsonSchema` y los índices `uq_indicador_version` (código + versión, único en el país) y `uq_indicador_vigente_territorio` (un solo `VIGENTE` por código y territorio). El 02 trae cinco indicadores `NACIONAL` `VIGENTE`: `COB_HEXA3`, `BRECHA_HEXA3`, `DES_HEXA1_3`, `PROY_COB_HEXA3` y `AVANCE_HEXA3`. El 04 agrega `COB_BCG` v1 nacional `VIGENTE` y `AVANCE_HEXA3` v2 nacional en `BORRADOR`. Hoy solo se cargan con `mongosh`, `backend/openapi.yaml` no tiene endpoints de configuración de indicadores y el rol `EPIDEMIOLOGIA` no tiene ningún permiso.

El motor que calcula los indicadores es HU-36 (cobertura, Christian), HU-37 (brecha), HU-38 (deserción) y HU-39 (proyección). Este spec define **qué indicadores existen, cómo se configuran y cuáles aplican**. No calcula nada ni escribe en `corrida_calculo`, `resultado_indicador` o `alerta`.

**Conceptos** (los mismos del SPEC 32, aplicados a indicadores):

- Un **indicador** es un código (`codigo`) con una o más **versiones**. Cada versión es un documento de `configuracion_indicadores`.
- El **tipo** (`tipo_calculo`) dice qué fórmula usa el motor y qué campos se configuran. El código, el tipo y la vacuna de un indicador no cambian entre versiones.
- El **territorio** de una versión es `NACIONAL` o una DDRISS. Para una DDRISS manda su `VIGENTE` si existe; si no, el `VIGENTE` nacional del mismo código. Esa es la **versión que aplica**.
- Un indicador está **activo** en una DDRISS si tiene versión que aplica, e **inactivo** si no.
- **Desactivar** es pasar el `VIGENTE` de la DDRISS a `HISTORICO`, sin reemplazo. Si hay un `VIGENTE` nacional del mismo código, vuelve a aplicar ese.
- **Activar** es publicar una versión nueva de la DDRISS con el mismo contenido de su última versión.

**Qué indicadores calcula el motor (contrato para HU-36 a HU-39).** En cada corrida, para una DDRISS, el motor usa las versiones que aplican a esa DDRISS **en el momento de la corrida**, y `resultado_indicador` guarda el código y la versión que usó. Como una versión publicada no se edita (`AGENTS.md` §5.5), un cambio de configuración no altera los resultados ya guardados: solo las corridas siguientes usan la versión nueva.

**Diferencias con la historia y con la documentación** (mandan `AGENTS.md`, `CONTEXTO BD.md` y lo que decidió el equipo):

- «Puedo indicar qué dosis cuenta para el numerador (la que completa el esquema…)»: el editor **precarga** la dosis con `completa_esquema` de la vacuna, pero acepta cualquier dosis activa. Así se configura, por ejemplo, la cobertura de una primera dosis.
- «Puedo definir los umbrales del semáforo»: se definen con dos cortes y tres franjas (rojo, amarillo y verde). El indicador `DES_HEXA1_3` de la semilla tiene dos franjas: se ve tal cual, y una versión nueva pide los dos cortes.
- «Prorrateo mensual»: se elige `NINGUNO` o `MENSUAL_LINEAL` en cobertura y brecha. En `AVANCE_META_MES` es siempre `MENSUAL_LINEAL`, porque es la definición del método de la DDRISS (meta del mes = población ÷ 12 × número de mes), y en deserción no hay denominador de población.
- `PROYECCION` no se crea: su método lo define HU-39. Sus versiones se publican cambiando solo el nombre, la descripción y la meta.
- No hay borradores: cada cambio publica una versión `VIGENTE` al guardar. El borrador `AVANCE_HEXA3` v2 del 04 no se lista ni se usa.
- `es_indicador_mapa` se puede marcar en varios indicadores; el 02 lo describe como «el indicador que el mapa muestra por defecto». HU-42 decide cuál muestra primero (se le deja una nota).

No hay mockup. La pantalla sigue a «Reglas de validación» (SPEC 32): tabla, editor y historial en un `Sheet` lateral, y diálogo de activar o desactivar.

## Alcance

**Entra:**

- Endpoints:
  - `GET /configuracion-indicadores`: una fila por código visible para la DDRISS del usuario;
  - `GET /configuracion-indicadores/opciones`: las vacunas activas con sus dosis activas, los grupos de población y los valores activos de `grupo_edad`;
  - `GET /configuracion-indicadores/{codigo}/historial`: las versiones nacionales y de la DDRISS del código;
  - `POST /configuracion-indicadores`: crea un indicador nuevo de la DDRISS (código generado, versión 1);
  - `POST /configuracion-indicadores/{codigo}/versiones`: publica una versión nueva de la DDRISS;
  - `POST /configuracion-indicadores/{codigo}/desactivar`: el `VIGENTE` de la DDRISS pasa a `HISTORICO`;
  - `POST /configuracion-indicadores/{codigo}/activar`: publica una copia de la última versión de la DDRISS.
- El catálogo de tipos (`tiposIndicador.js`), con los campos de cada tipo, sus valores por defecto y la conversión entre cortes y franjas, en el backend y en el frontend.
- Las reglas de formato `validarNombreIndicador` y `validarDescripcionIndicador` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `INDICADOR_CONFIG_CONSULTAR` e `INDICADOR_CONFIG_EDITAR` para Epidemiología, y `CONFIGURACION_CONSULTAR` para Epidemiología, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`, entidad `configuracion_indicadores`, `entidad_id` el ObjectId).
- Hijo «Configuración de indicadores» de «Administración» en `/administracion/indicadores`, con la tabla, el panel del editor, el panel del historial y el diálogo de activar o desactivar.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-35, notas en HU-36, HU-38, HU-39 y HU-42, nota en `CONTEXTO BD.md` y nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Calcular indicadores, `POST /indicadores/corridas`, `corrida_calculo`, `resultado_indicador` y `alerta` (HU-36 a HU-39, HU-46).
- Disparar corridas al cerrar el mes o al aplicar una rectificación (HU-36).
- Ver resultados, gráficas o el mapa (HU-41, HU-42).
- Crear indicadores de tipo `PROYECCION`, o editar su método (`parametros`, `indicador_base`).
- Editar la atribución, los estados del reporte, el acumulado, la periodicidad, los niveles, la alerta o los `parametros` de un indicador.
- Indicadores de varias vacunas (`aplica_a` con más de un elemento).
- Semáforos de más o menos de tres franjas, o colores elegidos por el usuario.
- Borradores, vigencias futuras o publicar el borrador `AVANCE_HEXA3` v2 del 04.
- Crear, publicar, activar o desactivar indicadores nacionales o de otra DDRISS.
- Permisos de configuración de indicadores para el Administrador, el Revisor u otros roles.
- Paginar la lista o el historial.
- Cambios al modelo de datos, al validador o a los índices de `configuracion_indicadores`, y a las semillas de `backend/db/01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa la colección del script 02 tal como está:

```js
// configuracion_indicadores (MongoDB, base vacunacion_config) — una versión publicada aquí
{
  _id: ObjectId,
  codigo: "COB_SPR1",                                          // generado; ver «Código»
  version: 1,                                                  // Int32; mayor versión del código en todo el país + 1
  nombre: "Cobertura de SPR 1.ª dosis en niñas y niños de 1 año",
  descripcion: "…",                                            // opcional
  tipo_calculo: "COBERTURA",
  aplica_a: [{
    vacuna: "SPR",                                             // vacuna.codigo de MySQL; un solo elemento
    dosis: "D1",                                               // o dosis_inicial + dosis_final en DESERCION
    clasificacion_poblacion: "1_A_MENOR_2",                    // null en DESERCION
    filtros_dimension: { grupo_edad: ["1_A_MENOR_2"] }         // sin el campo = todas las edades
  }],
  numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
  denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "MENSUAL_LINEAL" },
  meta: { valor: 95, unidad: "PORCENTAJE", comparador: ">", homogeneidad_municipal: true },
  umbrales: [
    { color: "verde",    desde: 90, hasta: null },
    { color: "amarillo", desde: 80, hasta: 90 },
    { color: "rojo",     desde: 0,  hasta: 80 }
  ],
  umbrales_provisionales: false,
  es_indicador_mapa: false,
  parametros: {},                                              // los del tipo; no se editan
  niveles: ["MUNICIPIO", "DEPARTAMENTO"],
  periodicidad: "MENSUAL",
  alerta: { generar: false },
  es_estimacion: false,
  territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" }, // siempre la DDRISS del usuario
  estado: "VIGENTE",                                           // VIGENTE al publicar; HISTORICO al reemplazarla o desactivarla
  vigencia: { desde: ISODate("2026-11-03T16:20:00Z"), hasta: null },
  auditoria: { creado_por: 4, creado_en: ISODate, publicado_por: 4, publicado_en: ISODate, motivo_cambio: "…" }
}
```

- `version` y `auditoria.creado_por`/`publicado_por` van con `Int32` (nota del 2026-10-24). `meta.valor` y los cortes se guardan como números de JavaScript (el validador acepta `int` o `double`).
- `vigencia.desde` es el **instante** de la publicación, y `auditoria.creado_en` y `publicado_en` son ese mismo instante. Es informativa: el motor usa el estado `VIGENTE` del momento de la corrida.
- Al reemplazarse o desactivarse, una versión solo cambia `estado` a `HISTORICO` y `vigencia.hasta` al instante del cambio, como en el SPEC 32.
- Una versión nueva escribe `filtros_dimension` solo con `grupo_edad`. Si la versión base tenía filtros de otras dimensiones, se pierden; ninguna semilla los tiene.

### Código y versión

- **Indicador nuevo.** El backend genera `{PREFIJO}_{VACUNA}{DOSIS}`:
  - el prefijo sale del tipo: `COB`, `AVANCE`, `BRECHA` o `DES`;
  - `{VACUNA}` es `vacuna.codigo`;
  - `{DOSIS}` es el código de la dosis sin la `D` inicial (`D3` → `3`, `R1` → `R1`, `UNICA` → `U`). En `DESERCION` son las dos dosis unidas con `_` (`DES_HEXA1_3`).
  - Si el código ya existe en cualquier territorio y estado, agrega `_2`, `_3`… (el primero libre).
  - Si pasa de 40 caracteres (`resultado_indicador.indicador_codigo` es `VARCHAR(40)`), responde 422 `INDICADOR_INVALIDO` ("El código generado pasa de 40 caracteres; use una vacuna con un código más corto.").
  - La versión es 1.
- **Versión nueva o activación.** `version` = la mayor `version` del código en toda la colección (todos los territorios y estados) + 1, como las reglas (SPEC 32). Una versión de la DDRISS que reemplaza a una nacional usa el código nacional.
- Si dos escrituras chocan en `uq_indicador_version` o en `uq_indicador_vigente_territorio`, la segunda responde 409 `INDICADOR_DESACTUALIZADO` y no queda nada escrito.

### Duplicados

Dos indicadores de la misma DDRISS no pueden medir lo mismo. Al crear, publicar una versión o activar, si **otro código** con versión que aplica a la DDRISS tiene el mismo tipo, la misma vacuna y la misma dosis (o las mismas dosis inicial y final), responde 409 `INDICADOR_DUPLICADO` con `codigoExistente` ("Ya existe el indicador {codigo} para la misma vacuna y dosis; publique una versión de ese."). El grupo de población y el filtro de edad no lo hacen distinto.

### Catálogo de tipos (`tiposIndicador.js`)

| Tipo | Se crea | Prefijo | Dosis | Población | Prorrateo | Meta (comparador) | Semáforo | Mapa |
|---|---|---|---|---|---|---|---|---|
| `COBERTURA` | Sí | `COB` | una | obligatoria | `NINGUNO` o `MENSUAL_LINEAL` (por defecto) | editable, 95 por defecto (`>`) | ascendente, obligatorio | se puede marcar |
| `AVANCE_META_MES` | Sí | `AVANCE` | una | obligatoria | siempre `MENSUAL_LINEAL` | siempre 100 (`>=`) | ascendente, obligatorio | se puede marcar |
| `BRECHA` | Sí | `BRECHA` | una | obligatoria | `NINGUNO` (por defecto) o `MENSUAL_LINEAL` | editable, 95 por defecto (`>`) | no tiene | no |
| `DESERCION` | Sí | `DES` | inicial y final | no tiene | no tiene | editable, 10 por defecto (`<=`) | descendente, obligatorio | no |
| `PROYECCION` | No | — | se copia | se copia | se copia | editable (`>`) | no tiene | no |

- **Dosis.** Códigos de dosis **activas** de la vacuna (`dosis.codigo` de MySQL). En `DESERCION`, la dosis inicial debe tener un `orden` menor que la final ("La dosis inicial debe ir antes que la final.").
- **Población.** Un código de `clasificacion_poblacion`.
- **Grupo de edad que cuenta** (`grupoEdad`, opcional en todos los tipos menos `PROYECCION`). Un valor **activo** de la dimensión `grupo_edad`, o `null` para todas las edades.
- **Meta.** Unidad `PORCENTAJE`. Valor de 1 a 100, con un decimal como máximo. El comparador lo fija el tipo.
- **Semáforo.** Dos cortes `[c1, c2]`, con `0 ≤ c1 < c2 ≤ 100` y un decimal como máximo. Se guardan como tres franjas:
  - ascendente (más es mejor): rojo `[0, c1)`, amarillo `[c1, c2)` y verde `[c2, …)`, igual que `AVANCE_HEXA3`;
  - descendente (menos es mejor): verde `(…, c1]`, amarillo `(c1, c2]` y rojo `(c2, …)`.
  - `umbralesProvisionales` es un booleano (por defecto `false`).
- **Indicador del mapa** (`esIndicadorMapa`, por defecto `false`). Solo en los tipos que lo permiten; en los demás, `true` responde 400.
- **Lo que no se edita.** Al crear, sale de los valores por defecto del tipo:
  - `numerador`: `{ fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" }`;
  - `denominador`: `{ fuente: "POBLACION_OBJETIVO", prorrateo }`, o `{ fuente: "PRODUCCION" }` en `DESERCION`;
  - `meta.homogeneidad_municipal: true` en `COBERTURA` y `AVANCE_META_MES`;
  - `parametros`: `{ mostrar_diferencia: true, redondeo: "ARRIBA", minimo_cero: true }` en `AVANCE_META_MES`, `{ redondeo: "ARRIBA", minimo_cero: true }` en `BRECHA` y sin el campo en los demás;
  - `niveles: ["MUNICIPIO", "DEPARTAMENTO"]`, `periodicidad: "MENSUAL"`, `alerta: { generar: false }` y `es_estimacion: false`.

  En una versión nueva o una activación, todo eso se **copia** de la versión base.
- `tiposIndicador.js` también tiene `aCortes(umbrales, sentido)`: devuelve `[c1, c2]` si las franjas tienen la forma de tres franjas del tipo, y `null` si no (por ejemplo, las dos franjas de `DES_HEXA1_3`).
- Un campo que el tipo no tiene (por ejemplo, `prorrateo` en `DESERCION` o `cortes` en `BRECHA`) responde 400.
- El catálogo está en `backend/src/modulos/configuracion/tiposIndicador.js` y en `frontend/src/paginas/configuracion/tiposIndicador.js`, con la misma tabla `CASOS` en sus dos pruebas: un cambio va en los cuatro archivos.

### Contenido de una versión (cuerpo)

| Campo | Al crear | En una versión nueva |
|---|---|---|
| `tipoCalculo` | obligatorio, uno de los cuatro que se crean | no va (400) |
| `vacuna` | obligatorio, código de una vacuna **activa** | no va (400) |
| `versionBase` | no va (400) | obligatorio |
| `nombre` | `validarNombreIndicador` | igual |
| `descripcion` | `validarDescripcionIndicador`; vacía o ausente no guarda el campo | igual |
| `dosis` o `dosisInicial` + `dosisFinal` | según el tipo | según el tipo; no va en `PROYECCION` |
| `clasificacionPoblacion` | según el tipo | según el tipo; no va en `PROYECCION` |
| `grupoEdad` | opcional | opcional; no va en `PROYECCION` |
| `prorrateo` | solo `COBERTURA` y `BRECHA` | igual |
| `meta` | salvo `AVANCE_META_MES` | igual |
| `cortes` y `umbralesProvisionales` | según el tipo | según el tipo |
| `esIndicadorMapa` | según el tipo | según el tipo |
| `motivoCambio` | `validarMotivoCambio` (SPEC 20), en `auditoria.motivo_cambio` | igual |

En una versión nueva, la vacuna de la versión base debe seguir activa (422 `INDICADOR_INVALIDO`).

### Reglas de formato (`campos.js`)

| Regla | Acepta | Error |
|---|---|---|
| `validarNombreIndicador` | recorta; de 3 a 120 caracteres | "El nombre del indicador debe tener entre 3 y 120 caracteres." |
| `validarDescripcionIndicador` | recorta; vacío = sin descripción; hasta 300 caracteres | "La descripción del indicador debe tener como máximo 300 caracteres." |

Van en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22). La meta, los cortes y las dosis los revisa `tiposIndicador.js`.

### Permisos

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `INDICADOR_CONFIG_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar la configuración de los indicadores que aplican a su DDRISS y su historial | EPIDEMIOLOGIA |
| `INDICADOR_CONFIG_EDITAR` | `CONFIGURACION_CATALOGOS` | Crear indicadores para su DDRISS, publicar sus versiones y activar y desactivar los suyos | EPIDEMIOLOGIA |

Además, Epidemiología recibe `CONFIGURACION_CONSULTAR`, que piden todos los hijos de «Administración» (SPEC 30). Con los permisos de hoy solo verá «Configuración de indicadores». `INDICADOR_CONSULTAR`, el permiso provisional de la opción «Indicadores» del menú, es para ver resultados (HU-41) y no cambia.

### Bitácora

Sin acciones nuevas en `ACCIONES`, como en el SPEC 32:

| Escritura | Filas |
|---|---|
| Indicador nuevo | `CREAR` del documento nuevo, completo |
| Versión nueva | `CREAR` del documento nuevo, y `ACTUALIZAR` del `VIGENTE` anterior de la DDRISS (si había) con `estado` y `vigencia.hasta` |
| Desactivar | `DESACTIVAR` del `VIGENTE` de la DDRISS, con `estado`, `vigencia.hasta` y `motivoCambio` en `valoresNuevos` |
| Activar | `REACTIVAR` del documento nuevo, completo |

Las escrituras de varios documentos usan `escribirEnTransaccionConBitacora` y las de uno, `escribirConBitacora` (`mongoBitacora.js`). En las filas `CREAR` y `REACTIVAR`, `publicadoPor` es el id del usuario, como en el SPEC 32.

### Respuestas

**Versión de un indicador (esquema `ConfiguracionIndicador`):**

```json
{
  "id": "6727c0c1a2b3c4d5e6f70a01",
  "codigo": "AVANCE_HEXA3",
  "version": 1,
  "nombre": "Avance de Hexavalente 3.ª dosis contra la meta del mes",
  "descripcion": "Dosis acumuladas al mes ÷ (población ÷ 12 × número de mes) × 100. La meta del mes vale 100 %.",
  "tipoCalculo": "AVANCE_META_MES",
  "vacuna": { "codigo": "HEXA", "nombre": "Hexavalente", "activa": true },
  "dosis": "D3",
  "dosisInicial": null,
  "dosisFinal": null,
  "clasificacionPoblacion": "MENOR_1",
  "grupoEdad": "MENOR_1",
  "numerador": { "fuente": "PRODUCCION", "estadosReporte": ["CERRADO"], "atribucion": "PROCEDENCIA", "acumulado": "ANUAL" },
  "denominador": { "fuente": "POBLACION_OBJETIVO", "prorrateo": "MENSUAL_LINEAL" },
  "meta": { "valor": 100, "unidad": "PORCENTAJE", "comparador": ">=" },
  "umbrales": [
    { "color": "verde", "desde": 90, "hasta": null },
    { "color": "amarillo", "desde": 80, "hasta": 90 },
    { "color": "rojo", "desde": 0, "hasta": 80 }
  ],
  "umbralesProvisionales": true,
  "esIndicadorMapa": true,
  "parametros": { "mostrar_diferencia": true, "redondeo": "ARRIBA", "minimo_cero": true },
  "alerta": { "generar": true, "tipo": "COBERTURA_BAJO_META", "rolDestino": ["EPIDEMIOLOGIA", "REVISOR"] },
  "esEstimacion": false,
  "territorio": { "nivel": "NACIONAL", "ddrissCodigo": null },
  "estado": "VIGENTE",
  "vigencia": { "desde": "2026-01-01T00:00:00.000Z", "hasta": null },
  "publicadoPor": null,
  "publicadoEn": "2026-01-01T00:00:00.000Z",
  "motivoCambio": null
}
```

- `vacuna.nombre` y `vacuna.activa` salen de MySQL; si el código ya no existe, `nombre` es el código y `activa` es `false`.
- `grupoEdad` es el único valor de `filtros_dimension.grupo_edad`, o `null` si no hay filtro o tiene más de un valor.
- `parametros` conserva las claves en snake_case de la base, como en las reglas. Se documenta en el contrato.
- `umbrales` es `[]` si la versión no tiene.
- `publicadoPor` usa el esquema `PublicadoPor` del SPEC 20; en las versiones de la semilla sin `publicado_por`, es `null` y `publicadoEn` es `auditoria.creado_en`.

**Fila de `GET /configuracion-indicadores` (esquema `IndicadorPorCodigo`):**

```json
{
  "codigo": "AVANCE_HEXA3",
  "tipoCalculo": "AVANCE_META_MES",
  "vacuna": { "codigo": "HEXA", "nombre": "Hexavalente", "activa": true },
  "aplica": { "...ConfiguracionIndicador": "la versión que aplica, o null" },
  "ultimaDdriss": { "...ConfiguracionIndicador": "la versión más reciente de la DDRISS, VIGENTE o HISTORICO, o null" },
  "vigenteNacional": { "version": 1 }
}
```

- Una fila por código que tenga al menos una versión `VIGENTE` o `HISTORICO` `NACIONAL` o de la DDRISS del usuario. Los códigos que solo tienen borradores y los de otras DDRISS no aparecen (`AGENTS.md` §5.10). `AVANCE_HEXA3` aparece por su v1; su v2 en `BORRADOR` no cuenta.
- Orden: por el nombre de la vacuna y luego por el tipo, en el orden de la tabla de tipos.

**Versión del historial (esquema `IndicadorEnHistorial`):** `ConfiguracionIndicador` más `desactivacion`: `{ en, por: PublicadoPor, motivo }` si esa versión se desactivó (sale de la fila `DESACTIVAR` de la bitácora), o `null`.

**Opciones (esquema `OpcionesIndicador`):**

```json
{
  "vacunas": [
    { "codigo": "HEXA", "nombre": "Hexavalente", "dosis": [
      { "codigo": "D1", "nombre": "Primera dosis", "orden": 1, "completaEsquema": false },
      { "codigo": "D3", "nombre": "Tercera dosis", "orden": 3, "completaEsquema": true }
    ] }
  ],
  "clasificaciones": [{ "codigo": "MENOR_1", "descripcion": "Menores de 1 año" }],
  "gruposEdad": [{ "codigo": "MENOR_1", "etiqueta": "Menor de 1 año" }]
}
```

Vacunas activas con sus dosis activas, en el orden de `GET /vacunas`; las siete clasificaciones de `clasificacion_poblacion`, por id; los valores activos de `grupo_edad`, por `orden`.

### Endpoints

Todos reciben y devuelven camelCase, salvo `parametros`. Un `codigo` que no sigue `^[A-Z0-9_]{1,40}$`, que no existe o que no es visible para la DDRISS responde 404. Un parámetro de consulta desconocido responde 400 (`revisarParametros`). `/configuracion-indicadores/opciones` va antes de `/{codigo}` en las rutas.

**`GET /configuracion-indicadores` (`INDICADOR_CONFIG_CONSULTAR`).** Sin parámetros. Responde 200 con un arreglo de `IndicadorPorCodigo`.

**`GET /configuracion-indicadores/opciones` (`INDICADOR_CONFIG_CONSULTAR`).** Sin parámetros. Responde 200 con `OpcionesIndicador`.

**`GET /configuracion-indicadores/{codigo}/historial` (`INDICADOR_CONFIG_CONSULTAR`).** Responde 200 con las versiones `NACIONAL` y de la DDRISS del código, sin borradores, de la más reciente a la más antigua.

**`POST /configuracion-indicadores` (`INDICADOR_CONFIG_EDITAR`).**

- Cuerpo: los campos «Al crear» de la tabla de contenido. Otro campo responde 400.
- Un `tipoCalculo` que no se crea responde 400 ("Solo se crean indicadores de tipo COBERTURA, AVANCE_META_MES, BRECHA o DESERCION.").
- Revisa la vacuna, las dosis y el grupo de edad, revisa duplicados, genera el código y guarda la versión 1 `VIGENTE` de la DDRISS.
- Responde 201 con la `ConfiguracionIndicador`. Bitácora: `CREAR`.

**`POST /configuracion-indicadores/{codigo}/versiones` (`INDICADOR_CONFIG_EDITAR`).**

- Cuerpo: los campos «En una versión nueva». `tipoCalculo`, `vacuna`, `codigo` u otro campo responden 400.
- `versionBase` es la versión que el editor cargó: la de `aplica`, o si no hay, la de `ultimaDdriss`, o si no hay, la última nacional. Si ya no es esa, responde 409 `INDICADOR_DESACTUALIZADO`.
- Si el contenido es igual al de la versión que aplica, responde 422 `INDICADOR_SIN_CAMBIOS` ("La versión no cambia nada de la que aplica.").
- Guarda la versión nueva `VIGENTE` de la DDRISS. El `VIGENTE` anterior de la DDRISS, si había, pasa a `HISTORICO`. El nacional no se toca.
- Responde 201 con la `ConfiguracionIndicador`. Bitácora: `CREAR` y, si había anterior, `ACTUALIZAR`.

**`POST /configuracion-indicadores/{codigo}/desactivar` (`INDICADOR_CONFIG_EDITAR`).**

- Cuerpo: `version` (la del `VIGENTE` de la DDRISS que se ve) y `motivoCambio`.
- Si la DDRISS no tiene `VIGENTE` del código, responde 409 `INDICADOR_SIN_VERSION_PROPIA` ("Su DDRISS no tiene una versión activa de este indicador; los indicadores nacionales no se desactivan."). Si `version` no es la del `VIGENTE`, responde 409 `INDICADOR_DESACTUALIZADO`.
- El `updateOne` lleva la condición `estado: "VIGENTE"`; si no modifica nada, responde 409 `INDICADOR_DESACTUALIZADO`.
- Responde 200 con la fila `IndicadorPorCodigo` actualizada. Bitácora: `DESACTIVAR`.

**`POST /configuracion-indicadores/{codigo}/activar` (`INDICADOR_CONFIG_EDITAR`).**

- Cuerpo: `version` (la de `ultimaDdriss`) y `motivoCambio`.
- Si la DDRISS ya tiene `VIGENTE` del código, o no tiene versiones, responde 409 `INDICADOR_SIN_VERSION_PROPIA` ("Solo se activa un indicador de su DDRISS que esté desactivado."). Si `version` no es la de su última versión, responde 409 `INDICADOR_DESACTUALIZADO`.
- Copia esa versión en una nueva `VIGENTE` de la DDRISS. Si la copia usa una vacuna, una dosis o un grupo de edad ya inactivos, responde 422 `INDICADOR_INVALIDO`; si otro código ya mide lo mismo, 409 `INDICADOR_DUPLICADO`.
- Responde 201 con la `ConfiguracionIndicador`. Bitácora: `REACTIVAR`.

**Orden de escritura.** El de las notas del 2026-10-24: lee y valida (incluidas las vacunas y dosis de MySQL, la dimensión `grupo_edad` y la DDRISS), abre `enTransaccion`, escribe la bitácora, escribe en MongoDB (en una transacción de MongoDB si son dos documentos), y si MongoDB falla o no cumple su condición, se deshace la bitácora.

### Errores

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Parámetro o campo no permitido o que el tipo no tiene, tipo que no se crea, meta o cortes fuera de rango, dosis inicial después de la final, formato de nombre, descripción o motivo | los de `campos.js` y `tiposIndicador.js` |
| 404 | `NO_ENCONTRADO` | Código inexistente, inválido o no visible para la DDRISS | "El recurso solicitado no existe." |
| 409 | `INDICADOR_DESACTUALIZADO` | `versionBase` o `version` no son las actuales; choque en un índice único | "El indicador {codigo} cambió mientras lo editaba; vuelva a abrirlo." |
| 409 | `INDICADOR_SIN_VERSION_PROPIA` | Desactivar sin `VIGENTE` de la DDRISS; activar con `VIGENTE` o sin versiones de la DDRISS | los de los endpoints |
| 409 | `INDICADOR_DUPLICADO` | Otro código que aplica mide la misma vacuna y dosis | el de «Duplicados», con `codigoExistente` |
| 422 | `INDICADOR_INVALIDO` | Vacuna, dosis o grupo de edad inexistente o inactivo; código generado de más de 40 caracteres | "La vacuna {codigo} no existe o está inactiva.", "La dosis {codigo} no existe o está inactiva en {vacuna}.", "El grupo de edad {codigo} no existe o está inactivo." y el del código |
| 422 | `INDICADOR_SIN_CAMBIOS` | La versión nueva es igual a la que aplica | el del endpoint |

Los 401 y 403 no cambian. Un usuario sin DDRISS recibe 403 `SIN_PERMISO`; hoy no pasa, porque `AUTORIDAD` no tiene estos permisos. El 409 `INDICADOR_DUPLICADO` lo arma el controlador con `codigoExistente`, como `RECTIFICACION_PENDIENTE` (SPEC 40).

### Frontend

**`src/api/configuracion.js`.** Funciones nuevas: `listarConfigIndicadores()`, `opcionesIndicadores()`, `historialIndicador(codigo)`, `crearIndicador(datos)`, `publicarVersionIndicador(codigo, datos)`, `desactivarIndicador(codigo, datos)` y `activarIndicador(codigo, datos)`. Sin caché.

**Opción del menú.** Hijo «Configuración de indicadores» de «Administración» en `opcionesMenu.js`, después de «Reglas de validación», con la ruta `/administracion/indicadores`, el icono `Gauge` de `lucide-react`, la descripción "Cómo se calcula cada indicador: dosis, población, meta y semáforo." y los permisos `CONFIGURACION_CONSULTAR` e `INDICADOR_CONFIG_CONSULTAR`. No tiene subrutas.

**Pantalla (`PaginaConfigIndicadores.jsx`).**

- `EncabezadoPagina` con el antetítulo «Administración», el título «Configuración de indicadores» y la acción «Nuevo indicador» (con `INDICADOR_CONFIG_EDITAR`).
- Card con el texto "Cada cambio publica una versión nueva: los resultados ya calculados conservan la versión con la que se calcularon. Un indicador de su DDRISS reemplaza al nacional del mismo código.".
- Tabla:

  | Indicador | Vacuna y dosis | Meta | Semáforo | Aplica | Estado | Acciones |
  |---|---|---|---|---|---|---|

  - Indicador: el nombre, y debajo el código y el nombre del tipo; insignias «Mapa» si `esIndicadorMapa` y «Estimación» si `esEstimacion`.
  - Vacuna y dosis: "Hexavalente · D3", o "Hexavalente · D1 a D3" en deserción; la población y el grupo de edad debajo.
  - Meta: "> 95 %", "≥ 100 % del mes" o "≤ 10 %", de la versión que aplica; «—» si está inactivo.
  - Semáforo: tres insignias con sus rangos (por ejemplo «< 80», «80 a 90», «≥ 90»), con los colores `--destructive`, `--advertencia` y `--exito` del tema; «—» si no tiene; la palabra «Provisional» si `umbralesProvisionales`. Si las franjas no tienen la forma de tres (`aCortes` da `null`), una insignia por franja.
  - Aplica: "Versión {n} · Nacional", "Versión {n} · {ddrissCodigo}" o "—".
  - Estado: Badge «Activo» o «Inactivo».
  - Acciones: un `DropdownMenu` (`modal={false}`) con:
    - «Nueva versión» (con `INDICADOR_CONFIG_EDITAR`): abre el editor con la versión base;
    - «Desactivar» (con `INDICADOR_CONFIG_EDITAR`, si la versión que aplica es de la DDRISS);
    - «Activar versión {n} de {ddrissCodigo}» (con `INDICADOR_CONFIG_EDITAR`, si `ultimaDdriss` está en `HISTORICO`);
    - «Historial».
- Carga: Skeleton. Error: `AvisoError` con `onReintentar`.
- Un 409 al guardar, activar o desactivar se muestra en el panel o el diálogo, con «Recargar», que vuelve a pedir la lista. Un 409 `INDICADOR_DUPLICADO` dice el código existente.

**Editor (`PanelIndicador.jsx`, un `Sheet` a la derecha).** Pide `opcionesIndicadores()` al abrirse (Skeleton y `AvisoError` con `onReintentar`).

- Dos modos:
  - **Nuevo indicador:** Select «Tipo» con los cuatro tipos que se crean y Select «Vacuna». Al elegir la vacuna, precarga la dosis con `completaEsquema` (en deserción, la primera por `orden` como inicial y la de `completaEsquema` como final). Al elegir el grupo de población, precarga el grupo de edad con el mismo código si existe. Los demás campos se precargan con los valores por defecto del tipo, y los cortes, con 80 y 90 (ascendente) o 10 y 15 (descendente).
  - **Nueva versión:** el tipo, la vacuna y el código fijos, y todo precargado de la versión base. Si la base es nacional, el aviso "Esta versión reemplazará a la versión {n} nacional solo en su DDRISS.". Si la base tiene una dosis o un grupo de edad inactivos, se dejan vacíos con el aviso "La dosis {codigo} ya no está activa; elija otra.". Si `aCortes` da `null`, los cortes quedan vacíos con el aviso "La versión base tiene un semáforo de {n} franjas; indique los dos cortes.". En `PROYECCION` solo se editan el nombre, la descripción, la meta y el motivo.
- Campos, según el tipo: «Nombre», «Descripción» (Textarea), «Dosis que cuenta» (Select) o «Dosis inicial» y «Dosis final», «Grupo de población» (Select), «Grupo de edad que cuenta» (Select con «Todas las edades»), «Prorrateo» (RadioGroup «Población anual completa» / «Proporcional al mes: población ÷ 12 × número de mes»), «Meta (%)» (Input numérico; en avance, el texto fijo "La meta del mes vale 100 %"), «Semáforo» (dos Input numéricos con la vista previa de las tres franjas y el Checkbox «Rangos provisionales»), «Indicador del mapa» (Switch) y «Motivo del cambio» (Textarea).
- Botón «Crear indicador» o «Publicar versión». Sigue las reglas de formularios de la nota del 2026-10-28.
- Al guardar, cierra el panel, actualiza la lista y muestra `toast.success("Indicador {codigo} publicado (versión {n}).")`.
- Con cambios, cerrar el panel pide confirmación ("¿Descartar los cambios?"), y `useAvisoCambiosSinGuardar` bloquea la salida de la ruta.

**Historial (`PanelHistorialIndicador.jsx`, un `Sheet`).** Las versiones de `historialIndicador`, de la más reciente a la más antigua. Cada una muestra versión, territorio, Badge de estado, dosis, población y grupo de edad, prorrateo, meta, semáforo, vigencia (fecha y hora), publicada por y el motivo. Si se desactivó, "Desactivada el {fecha} por {nombre}: {motivo}".

**Diálogo de estado (`DialogoEstadoIndicador.jsx`, un `AlertDialog`).** Pide el «Motivo del cambio» para activar o desactivar.

- Al desactivar, si hay un `VIGENTE` nacional: "Al desactivarlo vuelve a aplicar la versión {n} nacional.". Si no: "Este indicador dejará de calcularse para su DDRISS.".
- Al activar: "Se publicará una versión nueva con el mismo contenido de la versión {n}.".
- En el `AlertDialogAction` va `evento.preventDefault()` (nota del 2026-10-26).
- Al terminar, `toast.success` y actualiza la lista.

**Presentación (`presentacionIndicador.jsx`).** El texto de la meta, las insignias del semáforo, el territorio y la vacuna con sus dosis, que usan la lista, el historial y la vista previa del editor.

**`tiposIndicador.js` (frontend).** El catálogo de la tabla de tipos, con la etiqueta de cada tipo en español, `aCortes`, `aUmbrales` y la revisión del contenido con los mismos mensajes del backend.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                  ← /configuracion-indicadores y sus operaciones; ConfiguracionIndicador, IndicadorPorCodigo, IndicadorEnHistorial, OpcionesIndicador, IndicadorCrear, IndicadorVersion, IndicadorEstado
├── db/05_permisos_mysql.sql                      ← INDICADOR_CONFIG_CONSULTAR, INDICADOR_CONFIG_EDITAR y las asignaciones de EPIDEMIOLOGIA (con CONFIGURACION_CONSULTAR)
├── src/validaciones/campos.js                    ← validarNombreIndicador, validarDescripcionIndicador
├── src/modulos/configuracion/
│   ├── configuracion.routes.js                   ← rutas de indicadores
│   ├── configuracion.controller.js               ← controladores de indicadores
│   ├── tiposIndicador.js                         ← nuevo: catálogo de tipos
│   └── indicadores.service.js                    ← nuevo: listar, opciones, historial, crear, publicar versión, desactivar, activar
└── tests/
    ├── campos.test.js                            ← casos nuevos
    ├── tiposIndicador.test.js                    ← nuevo
    └── configIndicadores.test.js                 ← nuevo
frontend/src/
├── api/configuracion.js                          ← funciones de indicadores
├── validaciones/campos.js                        ← las dos reglas
├── validaciones/campos.test.js                   ← los mismos casos
├── componentes/layout/opcionesMenu.js            ← hijo «Configuración de indicadores»
├── componentes/layout/Layout.test.jsx            ← el hijo nuevo en el menú
└── paginas/configuracion/
    ├── tiposIndicador.js                         ← nuevo
    ├── tiposIndicador.test.js                    ← nuevo
    ├── PaginaConfigIndicadores.jsx               ← nuevo
    ├── PaginaConfigIndicadores.test.jsx          ← nuevo
    ├── PanelIndicador.jsx                        ← nuevo
    ├── PanelIndicador.test.jsx                   ← nuevo
    ├── PanelHistorialIndicador.jsx               ← nuevo
    ├── presentacionIndicador.jsx                 ← nuevo
    ├── DialogoEstadoIndicador.jsx                ← nuevo
    └── DialogoEstadoIndicador.test.jsx           ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                ← avance y criterios de HU-35; notas en HU-36, HU-38, HU-39 y HU-42
docs/base-de-datos/CONTEXTO BD.md                 ← quién configura los indicadores, cuáles aplican y el formato del semáforo
CLAUDE.md                                         ← nota de configuración de indicadores
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, agregar las siete operaciones de este spec con sus esquemas, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Documentar que `parametros` va en snake_case y la tabla de tipos. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos.** En `05_permisos_mysql.sql`, en un bloque "SPEC 43 (HU-35)": agregar `INDICADOR_CONFIG_CONSULTAR` e `INDICADOR_CONFIG_EDITAR` (módulo `CONFIGURACION_CATALOGOS`) y asignarlos, con `CONFIGURACION_CONSULTAR`, a EPIDEMIOLOGIA. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token de `epidemiologia` trae los tres códigos y el del Administrador no trae los dos nuevos.

3. **Reglas de formato.** Las dos reglas en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`: un valor válido, uno con espacios alrededor, vacío, solo espacios, uno corto y uno largo (en la descripción, vacío es válido). Comprobación: `campos.test.js` pasa en los dos proyectos.

4. **Catálogo de tipos.** `tiposIndicador.js` del backend y del frontend, con la tabla `CASOS` común en sus pruebas:
   - contenido válido de cada tipo que se crea;
   - un campo que el tipo no tiene (`prorrateo` en deserción, `cortes` en brecha, `meta` en avance, `esIndicadorMapa: true` en brecha);
   - meta de 0, de 100,5 o con dos decimales;
   - cortes iguales, invertidos, fuera de 0 a 100 o con un solo valor;
   - dosis inicial después de la final;
   - `aUmbrales` y `aCortes` de ida y vuelta en los dos sentidos, y `aCortes` en `null` con las dos franjas de `DES_HEXA1_3`;
   - el código generado: `COB` + `HEXA` + `D3` = `COB_HEXA3`, `UNICA` = `U`, `R1` = `R1`, deserción `DES_HEXA1_3`, el sufijo `_2` si el código existe y el error de más de 40 caracteres.

   Comprobación: `tiposIndicador.test.js` pasa en los dos proyectos.

5. **Backend: consulta.** `indicadores.service.js` con `listarConfigIndicadores`, `opcionesIndicadores` e `historialIndicador`, y sus rutas y controladores. Las pruebas de `tests/configIndicadores.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes borran los restos de corridas anteriores):
   - en MySQL, por SQL: la vacuna activa `ZVT_HU35` con `D1`, `D2` y `D3` (`D3` con `completa_esquema`) y una `D4` inactiva, y la vacuna inactiva `ZVT_HU35I`;
   - en MongoDB, insertados directamente: `ZVT_HU35_NAC` v1 `COBERTURA` `NACIONAL` `VIGENTE` de `ZVT_HU35` `D3`; `ZVT_HU35_PROPIA` v1 `HISTORICO` y v2 `VIGENTE` de `DDRISS_SM` (`DESERCION` `D1` a `D3`); `ZVT_HU35_OTRA` v1 `VIGENTE` de la DDRISS ficticia `ZVT_OTRA35`; `ZVT_HU35_BORR` v1 `NACIONAL` en `BORRADOR`;
   - borran los documentos cuyo `codigo` contenga `ZVT_HU35` (también los generados, como `COB_ZVT_HU352`) y los de `nombre` que empiece con `vitest-hu35-`.

   Casos:
   - la lista trae `COB_HEXA3` con `aplica` nacional v1, `AVANCE_HEXA3` con `aplica` v1 (no la v2 en borrador), `ZVT_HU35_NAC` y `ZVT_HU35_PROPIA` con `aplica` v2;
   - `ZVT_HU35_OTRA` y `ZVT_HU35_BORR` no aparecen, y el historial de `ZVT_HU35_OTRA` responde 404;
   - el historial de `ZVT_HU35_PROPIA` trae v2 y v1, en ese orden;
   - las opciones traen `ZVT_HU35` con `D1` a `D3` (sin `D4`), no traen `ZVT_HU35I`, y traen las siete clasificaciones y los valores activos de `grupo_edad`;
   - un parámetro desconocido responde 400;
   - el Revisor de la semilla, con un token de `tokenDePrueba`, recibe 403.

   Comprobación: la prueba pasa.

6. **Backend: crear.** `crearIndicador` y su ruta. Pruebas:
   - crear un `AVANCE_META_MES` de `ZVT_HU35` `D2` guarda `AVANCE_ZVT_HU352`, versión 1, `VIGENTE`, territorio `DDRISS_SM`, prorrateo `MENSUAL_LINEAL`, meta 100 `>=`, las tres franjas, los valores por defecto del tipo, los tipos Int32, `vigencia.desde` igual a `publicado_en` y una fila `CREAR`;
   - un segundo `AVANCE_META_MES` de `ZVT_HU35` `D2` responde 409 `INDICADOR_DUPLICADO` con `codigoExistente`;
   - un `COBERTURA` de `ZVT_HU35` `D3` responde 409 `INDICADOR_DUPLICADO` con `ZVT_HU35_NAC`;
   - un `DESERCION` de `D1` a `D2` guarda `DES_ZVT_HU351_2`, sin población ni prorrateo y con las franjas descendentes;
   - un tipo `PROYECCION` responde 400, y también `prorrateo` en deserción, `meta` en avance y cortes invertidos;
   - la vacuna `ZVT_HU35I` o la dosis `D4` responden 422 `INDICADOR_INVALIDO`;
   - si MongoDB falla (`vi.spyOn` sobre la colección), no queda la fila de bitácora.

   Comprobación: la prueba pasa.

7. **Backend: versiones.** `publicarVersionIndicador` y su ruta. Pruebas:
   - una versión de `ZVT_HU35_PROPIA` con otros cortes guarda v3 `VIGENTE`, pasa la v2 a `HISTORICO` con `vigencia.hasta` (sin cambiar su contenido), copia `numerador`, `alerta` y `parametros`, y deja `CREAR` y `ACTUALIZAR`;
   - una versión de `ZVT_HU35_NAC` con otra meta guarda v2 de `DDRISS_SM` y no toca la nacional;
   - `versionBase` vieja responde 409 `INDICADOR_DESACTUALIZADO`, y un contenido igual al que aplica responde 422 `INDICADOR_SIN_CAMBIOS`;
   - `tipoCalculo` o `vacuna` en el cuerpo responden 400;
   - cambiar la dosis de una versión a la de otro código que aplica responde 409 `INDICADOR_DUPLICADO`;
   - dos versiones en paralelo del mismo código: una 201 y otra 409, y queda un solo `VIGENTE` de la DDRISS;
   - si falla el segundo documento de la transacción de MongoDB, no queda ninguno escrito ni la bitácora.

   Comprobación: la prueba pasa.

8. **Backend: desactivar y activar.** `desactivarIndicador` y `activarIndicador` con sus rutas. Pruebas:
   - desactivar `ZVT_HU35_PROPIA` la deja sin `aplica`, con `DESACTIVAR` y el motivo en la bitácora; el historial trae su `desactivacion`;
   - desactivar la versión de `DDRISS_SM` de `ZVT_HU35_NAC` deja `aplica` en la nacional;
   - desactivar `ZVT_HU35_NAC` sin versión de la DDRISS responde 409 `INDICADOR_SIN_VERSION_PROPIA`;
   - activar `ZVT_HU35_PROPIA` publica la versión siguiente con el contenido de la última y deja `REACTIVAR`; activarla otra vez responde 409;
   - activar una copia cuya dosis se desactivó por SQL después de publicar responde 422.

   Comprobación: los archivos de prueba que tocó el spec pasan (`configIndicadores.test.js`, `tiposIndicador.test.js`, `campos.test.js`, `permisos` si cambia el conteo).

9. **Frontend: lista y diálogo.** Las funciones de `src/api/configuracion.js`, el hijo en `opcionesMenu.js`, `PaginaConfigIndicadores.jsx`, `presentacionIndicador.jsx` y `DialogoEstadoIndicador.jsx`. Pruebas:
   - la tabla muestra la vacuna y las dosis, la meta, el semáforo con sus tres rangos, la versión que aplica con su territorio y el estado;
   - un indicador con dos franjas (`DES_HEXA1_3`) muestra una insignia por franja;
   - «Desactivar» solo aparece si la versión que aplica es de la DDRISS, y «Activar versión {n}» solo con `ultimaDdriss` en `HISTORICO`;
   - el diálogo de desactivar avisa que vuelve la nacional cuando hay una, exige el motivo y llama a `desactivarIndicador` con la versión;
   - un 409 se muestra en el diálogo con «Recargar»;
   - si falla la carga, «Reintentar» vuelve a pedir;
   - sin `INDICADOR_CONFIG_EDITAR` no aparecen las acciones de escritura, y sin `INDICADOR_CONFIG_CONSULTAR` la opción no se ve en el menú.

   Comprobación: `npm test` del frontend pasa.

10. **Frontend: editor e historial.** `PanelIndicador.jsx` y `PanelHistorialIndicador.jsx`. Pruebas:
    - «Nuevo indicador» ofrece solo los cuatro tipos; elegir la vacuna precarga la dosis que completa el esquema, y en deserción, la inicial y la final;
    - cambiar el tipo muestra solo sus campos (sin prorrateo ni población en deserción, sin semáforo en brecha, meta fija en avance);
    - cortes invertidos, una meta fuera de rango o un motivo vacío se muestran al enviar, con el foco en el primero;
    - «Nueva versión» de una nacional precarga su contenido y muestra el aviso de reemplazo; una base con dos franjas deja los cortes vacíos con su aviso;
    - guardar llama a `publicarVersionIndicador` con `versionBase`, cierra el panel y llama a `toast.success`;
    - un 409 `INDICADOR_DUPLICADO` muestra el código existente;
    - cerrar con cambios pide confirmación;
    - el historial muestra las versiones y la desactivación.

    Comprobación: `npm test` del frontend pasa completo.

11. **Verificación manual y documentación.** Antes, con autorización, crear por SQL la vacuna de prueba `ZVM_HU35` con `D1` y `D2` (`D2` con `completa_esquema`), para no dejar indicadores de prueba sobre una vacuna real. Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), como `epidemiologia`:
    - ver que «Administración» solo tiene «Configuración de indicadores» y que la lista trae los seis indicadores nacionales;
    - crear un `COBERTURA` de `ZVM_HU35` con el nombre «Prueba manual HU-35», ver que precarga `D2` y que queda `COB_ZVM_HU352`;
    - publicarle una versión con otra meta y otros cortes, y ver las dos en el historial;
    - intentar crear otro `COBERTURA` de `ZVM_HU35` `D2` y ver el aviso del duplicado;
    - desactivarlo, ver «Inactivo» y activarlo de nuevo;
    - abrir «Nueva versión» de `DES_HEXA1_3` y ver el aviso de las dos franjas, sin publicarla;
    - al terminar, desactivar «Prueba manual HU-35», desactivar la vacuna `ZVM_HU35` por SQL y revisar por SQL las filas `CREAR`, `ACTUALIZAR`, `DESACTIVAR` y `REACTIVAR` de la bitácora.

    Como Administrador: «Configuración de indicadores» no aparece y `/administracion/indicadores` no se abre.

    **No** publicar versiones de los indicadores de la semilla: el motor de HU-36 a HU-39 los usará.

    Documentación:
    - en HU-35, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
    - en HU-36, la nota: "Los indicadores que se calculan son los que aplican a la DDRISS en el momento de la corrida (SPEC 43: la `VIGENTE` de la DDRISS antes que la nacional del mismo código), con `aplica_a[0]` (un solo elemento). `resultado_indicador` guarda el código y la versión usados. El semáforo son tres franjas `verde`/`amarillo`/`rojo` (`aCortes` en `tiposIndicador.js`)." y, en HU-38 y HU-39, que los indicadores `DESERCION` se crean desde este spec y que `PROYECCION` solo se versiona;
    - en HU-42, la nota: "Los umbrales salen de la versión que aplica (tres franjas con los nombres `verde`, `amarillo` y `rojo`, que el mapa pinta con sus tonos suaves). Varios indicadores pueden tener `es_indicador_mapa`: el mapa decide cuál muestra primero.";
    - en `CONTEXTO BD.md`, en `configuracion_indicadores`, quién la configura (Epidemiología, por DDRISS), la versión que aplica, el formato del semáforo y que `es_indicador_mapa` puede estar en varios;
    - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: endpoints y permisos, publicación directa por DDRISS, el código `{PREFIJO}_{VACUNA}{DOSIS}`, los duplicados, `tiposIndicador.js` en cuatro archivos, la vacuna manual `ZVM_HU35` y los datos de prueba `ZVT_HU35*` / `vitest-hu35-`.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta las siete operaciones de `/configuracion-indicadores` con su `x-permiso`, y `/api/docs` carga sin errores.
- [ ] Las pruebas de los archivos que tocó el spec pasan en `backend/`, `npm test` pasa en `frontend/`, sin desactivar ni quitar ninguna prueba, y las pruebas no dejan indicadores `ZVT_HU35…` o `vitest-hu35-…` ni las vacunas de prueba.
- [ ] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [ ] Desde la pantalla, Epidemiología crea un indicador `COBERTURA`, `AVANCE_META_MES`, `BRECHA` o `DESERCION` para una vacuna activa, eligiendo la dosis (precargada con la que completa el esquema), la población, el grupo de edad, el prorrateo, la meta y el semáforo según el tipo.
- [ ] Un indicador nuevo queda con el código `{PREFIJO}_{VACUNA}{DOSIS}`, versión 1, `VIGENTE` y el territorio de la DDRISS del usuario.
- [ ] Un indicador con el mismo tipo, vacuna y dosis que otro que aplica a la DDRISS se rechaza con 409 y el código existente.
- [ ] Los umbrales se definen con dos cortes y se guardan como tres franjas (ascendentes o descendentes según el tipo).
- [ ] Publicar una versión crea un documento nuevo con la versión siguiente; el `VIGENTE` anterior de la DDRISS pasa a `HISTORICO` sin cambiar su contenido, y el nacional no cambia.
- [ ] Desactivar deja el indicador sin versión de la DDRISS que aplique y vuelve a aplicar el nacional del mismo código si existe. Activar publica una copia de la última versión de la DDRISS.
- [ ] Un indicador nacional no se puede desactivar (409), y los de otras DDRISS no se ven (404).
- [ ] El backend rechaza campos que el tipo no tiene, metas y cortes fuera de rango (400), y vacunas, dosis o grupos de edad inactivos (422).
- [ ] El historial muestra todas las versiones nacionales y de la DDRISS del código, con quién y cuándo las publicó, su motivo y, si se desactivó, el motivo de la desactivación.
- [ ] Cada escritura deja sus filas en la bitácora (`CREAR`, `ACTUALIZAR`, `DESACTIVAR`, `REACTIVAR`) con el módulo `CONFIGURACION` y el ObjectId como `entidad_id`, y un fallo de MongoDB no deja filas ni documentos a medias.
- [ ] Sin `INDICADOR_CONFIG_CONSULTAR` o `INDICADOR_CONFIG_EDITAR`, sus endpoints responden 403 y la pantalla oculta la opción o las acciones. Solo Epidemiología tiene esos permisos.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-35 tiene su avance y sus criterios marcados, HU-36, HU-38, HU-39 y HU-42 tienen su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** configura Epidemiología, como dice la historia, desde un hijo de «Administración», con `CONFIGURACION_CONSULTAR` para que lo vea (decidido en la fase de preguntas). **No:** una subruta de «Indicadores», cuya pantalla (HU-41) todavía no existe; **no:** el Administrador, que contradice la historia; **no:** los dos roles.
- **Sí:** dos permisos nuevos, `INDICADOR_CONFIG_CONSULTAR` e `INDICADOR_CONFIG_EDITAR`, separados de `INDICADOR_CONSULTAR`, que es para ver resultados (decidido en la fase de preguntas). **No:** tres permisos con `CREAR` aparte, como las reglas; **no:** reutilizar permisos existentes.
- **Sí:** publicación directa por DDRISS, con desactivar y activar, como las reglas del SPEC 32 (decidido en la fase de preguntas). Una versión de la DDRISS reemplaza a la nacional del mismo código. **No:** borradores y publicar con vigencia, como los esquemas, que duplica pantallas y no hace falta: el motor usa la versión del momento de la corrida.
- **Sí:** se crean indicadores `COBERTURA`, `AVANCE_META_MES`, `BRECHA` y `DESERCION`; `PROYECCION` solo se versiona (decidido en la fase de preguntas). **No:** crear proyecciones, cuyo método (`indicador_base`, ventana, horizonte) lo define HU-39; **no:** solo cobertura y avance, que deja fuera la brecha y la deserción de HU-37 y HU-38.
- **Sí:** se editan los campos del método de la DDRISS: dosis, población, grupo de edad, prorrateo, meta, semáforo e «indicador del mapa». La atribución, los estados del reporte, el acumulado, la periodicidad, los niveles, la alerta y los `parametros` se fijan al crear y se copian en las versiones (decidido en la fase de preguntas). **No:** editar todo el validador, que expone opciones que el motor todavía no sabe calcular.
- **Sí:** el semáforo son dos cortes y tres franjas `verde`/`amarillo`/`rojo`, invertidas en deserción (decidido en la fase de preguntas). Los nombres de los colores son los de la semilla; HU-42 los pinta con tonos suaves. **No:** franjas libres; **no:** semáforo solo en el indicador del mapa.
- **Sí:** una vacuna por indicador, y la vacuna no cambia entre versiones (decidido en la fase de preguntas). **No:** varias vacunas en `aplica_a`.
- **Sí:** «Grupo de edad que cuenta» es un campo propio y opcional, precargado con el código del grupo de población si existe en `grupo_edad` (decidido en la fase de preguntas). **No:** deducirlo de la población, que no permite contar todas las edades contra un grupo; **no:** dejarlo sin editar.
- **Sí:** un endpoint `GET /configuracion-indicadores/opciones` con lo que necesita el editor (decidido en la fase de preguntas). **No:** dar a Epidemiología `VACUNA_CONSULTAR`, `DIMENSION_CONSULTAR` y `POBLACION_CONSULTAR`, que abren pantallas de «Administración» que no le tocan.
- **Sí:** varios indicadores pueden llevar `es_indicador_mapa` (decidido en la fase de preguntas); solo `COBERTURA` y `AVANCE_META_MES`, porque son los que se comparan contra una meta en porcentaje (decidido al escribir el spec). **No:** uno solo por DDRISS, con 422 o quitando la marca del otro.
- **Sí:** solo se edita el valor de la meta; la unidad es `PORCENTAJE` y el comparador lo fija el tipo. En avance la meta es siempre 100 (decidido en la fase de preguntas). **No:** elegir el comparador.
- **Sí:** el código `{PREFIJO}_{VACUNA}{DOSIS}`, legible y con el formato de la semilla, con `_2`… si ya existe (decidido en la fase de preguntas). `UNICA` queda `U` para que no choque con los códigos sin dosis de la semilla (`COB_BCG`). **No:** un consecutivo `{PREFIJO}_{NN}`; **no:** que lo escriba el usuario.
- **Sí:** 409 `INDICADOR_DUPLICADO` si otro código que aplica tiene el mismo tipo, vacuna y dosis; la población y el filtro de edad no lo hacen distinto (decidido en la fase de preguntas). **No:** permitirlo si cambia la población; **no:** sin restricción.
- **Sí:** el editor precarga la dosis con `completa_esquema`, pero acepta cualquier dosis activa (decidido al escribir el spec). **No:** obligar a la dosis que completa el esquema, que impide medir primeras dosis.
- **Sí:** en `AVANCE_META_MES` el prorrateo es siempre `MENSUAL_LINEAL`, y en deserción no hay prorrateo ni población (decidido al escribir el spec), porque así son sus fórmulas.
- **Sí:** el título del hijo es «Configuración de indicadores», para no confundirse con la opción «Indicadores» del menú, que verá los resultados (decidido al escribir el spec).
- **Sí:** el módulo de la bitácora es `CONFIGURACION`, como las reglas; `INDICADORES` queda para las corridas (decidido al escribir el spec).
- **Sí:** las pruebas insertan sus propios indicadores `ZVT_HU35*`, su DDRISS ficticia `ZVT_OTRA35` y sus vacunas, y la verificación manual usa la vacuna `ZVM_HU35`. Así no se publican versiones de los indicadores de la semilla ni indicadores de prueba sobre vacunas reales.

Decididas al implementar:

- **Sí:** los mensajes 400 que el spec no fijaba: "Los indicadores de tipo DESERCION no llevan prorrateo.", "La meta debe ser un número de 1 a 100, con un decimal como máximo.", "Los cortes del semáforo deben ser dos números de 0 a 100, con un decimal como máximo, y el primero menor que el segundo." y, en el 409 de dos altas simultáneas, "Se creó otro indicador con el mismo código al mismo tiempo; intente de nuevo." (paso 1).
- **Sí:** «dosis inicial después de la final» responde 400, como dice la tabla de errores, pero se revisa después de leer las dosis en MySQL, porque necesita su `orden` (paso 1).
- **Sí:** los campos que el tipo edita son obligatorios en el cuerpo (dosis, población, prorrateo, meta y cortes; 400 "Falta el campo {campo}."), y `grupoEdad`, `umbralesProvisionales` y `esIndicadorMapa` son opcionales (`null`, `false` y `false`) (paso 4).
- **Sí:** `esIndicadorMapa: false` se acepta en cualquier tipo, porque no marca nada; `true` en un tipo sin mapa responde 400 (paso 4).
- **Sí:** una dosis inicial igual a la final responde 400 "La dosis inicial debe ir antes que la final." sin consultar MySQL (paso 4).
- **Sí:** los otros mensajes de `tiposIndicador.js`: "Los indicadores de tipo {tipo} no llevan {campo}." (dosis, dosis inicial, dosis final, grupo de población, grupo de edad, prorrateo, meta editable, semáforo o marca de indicador del mapa), "{campo} debe ser un código en mayúsculas, dígitos y guion bajo.", "{campo} debe ser verdadero o falso.", "El prorrateo debe ser NINGUNO o MENSUAL_LINEAL." y "El tipo de indicador no existe." (paso 4).
- **Sí:** `aCortes` exige exactamente las tres franjas que arma `aUmbrales`; otra cantidad, otro orden u otro límite dan `null`. `COB_HEXA3` de la semilla da `[80, 95]` (paso 4).
- **No:** revisar en `tiposIndicador.test.js` los indicadores de Atlas, como hace `tiposRegla.test.js` con las reglas; el paso 4 no lo pide y las franjas de la semilla se prueban copiadas (paso 4).
- **No:** unificar con `reglas.service.js` las funciones que `indicadores.service.js` repite (`nombresDeUsuario`, `aUsuario`, `resumirCodigo`, `versionesVisibles`, `desactivaciones`): tocaría el módulo de reglas. Queda como ajuste menor para otra rama, anotado en `CLAUDE.md` (paso 5).
- **Sí:** si la dimensión `grupo_edad` está inactiva, `gruposEdad` de las opciones sale vacío (paso 5).
- **Sí:** un grupo de población que no existe responde 422 `INDICADOR_INVALIDO` con "El grupo de población {codigo} no existe."; la tabla de errores no tenía ese caso (paso 6).
- **Sí:** una vacuna mal escrita en el cuerpo responde 400 con "vacuna debe ser un código en mayúsculas, dígitos y guion bajo.", el mismo mensaje de formato de las dosis (paso 6).
- **Sí:** en el editor, «Recargar» aparece solo con el 409 `INDICADOR_DESACTUALIZADO`; el 409 `INDICADOR_DUPLICADO` muestra el mensaje con el código existente sin «Recargar», porque recargar no lo resuelve (paso 10).
- **Sí:** un grupo de edad inactivo en la versión base vuelve a «Todas las edades» con el aviso "El grupo de edad {codigo} ya no está activo; elija otro." (paso 10).
- **Sí:** las etiquetas de los cortes son «Amarillo desde (%)» y «Verde desde (%)» (ascendente) o «Verde hasta (%)» y «Amarillo hasta (%)» (deserción); en avance, el texto fijo "La meta del mes vale 100 %: población ÷ 12 × número de mes." y sin prorrateo; en deserción, una vacuna de una sola dosis deja la dosis inicial vacía (paso 10).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| `DES_HEXA1_3` tiene dos franjas y no cabe en el formato de tres | Se muestra tal cual (una insignia por franja), y el editor pide los dos cortes al publicar una versión. HU-38 y HU-42 reciben la nota del formato. |
| El 02 describe `es_indicador_mapa` como «el indicador que el mapa muestra por defecto», pero puede haber varios | La nota en HU-42 dice que el mapa decide cuál muestra primero. El 02 no cambia (zona protegida). |
| El motor de HU-36 todavía no existe, así que «no altera resultados anteriores» no se puede probar con resultados reales | Se cumple por construcción: las versiones publicadas no se editan y `resultado_indicador` guarda código y versión. La nota en HU-36 fija el contrato. |
| Un indicador desactivado, o creado con una dosis inesperada, cambia lo que calcula el motor | Es la decisión del equipo; el diálogo dice qué pasa al desactivar, y la bitácora guarda quién y por qué. |
| Dos altas simultáneas generan el mismo código | El índice `uq_indicador_version` rechaza la segunda (409 `INDICADOR_DESACTUALIZADO`). |
| Las versiones publicadas en la verificación manual no se pueden borrar (§5.5) | Se usa un solo indicador de prueba, «Prueba manual HU-35», sobre la vacuna `ZVM_HU35`, y se deja desactivado con la vacuna inactiva. |
| MySQL se confirma después de escribir en MongoDB; si la confirmación falla, MongoDB queda cambiado sin su fila de bitácora | Es la regla acordada (nota del 2026-10-20) y la ventana es mínima. El caso inverso tiene prueba. |
| El catálogo de tipos del backend y el del frontend se separan | Las dos pruebas usan la misma tabla `CASOS`, y la nota de `CLAUDE.md` lo avisa. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- El motor de indicadores, las corridas, `resultado_indicador` y las alertas (HU-36 a HU-39, HU-46).
- Ver resultados, gráficas o el mapa (HU-41, HU-42).
- Crear proyecciones o editar su método.
- Editar la atribución, los estados del reporte, el acumulado, la periodicidad, los niveles, la alerta o los `parametros`.
- Indicadores de varias vacunas o semáforos de otra cantidad de franjas.
- Borradores y vigencias futuras.
- Indicadores nacionales o de otras DDRISS.
- Permisos de configuración de indicadores para otros roles.
- Paginación de la lista o del historial.
- Cambios al modelo de datos, al validador, a los índices o a las semillas.

Cada uno, si se hace, va en su propio spec.
