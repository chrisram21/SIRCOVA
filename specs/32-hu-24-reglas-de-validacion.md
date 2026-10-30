# SPEC 32 — Reglas de validación por DDRISS, con versiones y activación

> **Estado:** Implementado
> **Historia:** HU-24
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 15, SPEC 19, SPEC 20 y SPEC 30
> **Fecha:** 2026-10-30
> **Objetivo:** Que el Administrador cree reglas de validación de error o advertencia para las vacunas de su DDRISS, publique versiones nuevas de cualquier regla que aplique a su DDRISS y active o desactive las suyas, con cada cambio guardado como versión en un historial.

## Por qué existe este spec

La colección `reglas_validacion` ya existe en el script 02, con su validador `$jsonSchema` y los índices `uq_regla_version` (código + versión, único en el país) y `uq_regla_vigente_territorio` (un solo `VIGENTE` por código y territorio). El 02 trae seis reglas `NACIONAL` `VIGENTE`: `CAMPOS_COMPLETOS`, `DIMENSIONES_VALIDAS`, `NO_NEGATIVO`, `TOTAL_CUADRA`, `SECUENCIA_DOSIS` y `VARIACION_HISTORICA`. El 04 agrega `VARIACION_HISTORICA` v2 de `DDRISS_SM` (`VIGENTE`, umbral de 40 %) y `RANGO_DOSIS_MES` v1 nacional en `BORRADOR`. Hoy las reglas solo se cargan con `mongosh`, y `backend/openapi.yaml` no tiene endpoints de reglas.

El motor que ejecuta las reglas es HU-25 (Christian). Este spec define **qué reglas existen y cuáles aplican**. No ejecuta ninguna regla ni escribe en `resultado_validacion`.

**Conceptos** (aclarados al definir el spec):

- Una **regla** es un código (`codigo`) con una o más **versiones**. Cada versión es un documento de `reglas_validacion`.
- El **tipo** elige el validador del backend (HU-25), y los **parámetros** lo configuran. El código, el tipo y el ámbito de una regla no cambian entre versiones.
- El **territorio** de una versión es `NACIONAL` o una DDRISS. Para una DDRISS, manda su `VIGENTE` si existe; si no, el `VIGENTE` nacional del mismo código. A esa versión se le llama aquí la **versión que aplica**.
- Una regla está **activa** en una DDRISS si tiene versión que aplica, e **inactiva** si no.
- **Desactivar** es pasar el `VIGENTE` de la DDRISS a `HISTORICO`, sin reemplazo. Si hay un `VIGENTE` nacional del mismo código, vuelve a aplicar ese.
- **Activar** es publicar una versión nueva de la DDRISS con el mismo contenido de su última versión.

**Qué reglas ejecuta el motor (contrato para HU-25).** Al validar una vacuna de un reporte, el motor usa las versiones que aplican a la DDRISS del establecimiento **en ese momento**, cuyo `aplica_a.vacunas` contiene la vacuna o `"*"`. `resultado_validacion` guarda el código y la versión que usó. `esquemas_captura.reglas[]` (y su `severidad_override`) ya **no decide** qué reglas se ejecutan: queda como dato de cada versión publicada.

**Diferencias con la historia y con la documentación** (mandan `AGENTS.md`, `CONTEXTO BD.md` y lo que decidió el equipo):

- «Puedo crear reglas»: solo se crean códigos nuevos de los tipos con parámetros (`RANGO`, `SECUENCIA_DOSIS`, `VARIACION_HISTORICA` y `TOTAL_CUADRA`). Las reglas de los otros cinco tipos se consultan, se publican en versiones nuevas y se activan o desactivan, pero no se crean otras.
- «Puedo activar o desactivar una regla»: solo las versiones de la DDRISS del usuario. Una regla nacional no se apaga desde una DDRISS. Su DDRISS puede publicar una versión propia que la reemplace (por ejemplo, como advertencia o para algunas vacunas).
- No hay borradores: cada cambio publica una versión `VIGENTE` al guardar. El borrador `RANGO_DOSIS_MES` del 04 no se lista ni se usa.
- `CONTEXTO BD.md` §7 dice que al enviar «se ejecutan las reglas del esquema», y el 02 describe `esquemas_captura.reglas` como «Reglas de reglas_validacion que aplica esta versión». Desde este spec las reglas se resuelven por territorio y vacuna, como se dijo arriba. Se corrige `CONTEXTO BD.md`. **El 02 no cambia** (zona protegida): su descripción queda desactualizada y se señala en «Riesgos».

No hay mockup. La pantalla sigue el estilo general de `descripcion_pantallas.md` y el patrón de las listas de «Administración» (SPEC 30), con el editor y el historial en un panel lateral (`Sheet`).

## Alcance

**Entra:**

- Endpoints:
  - `GET /reglas-validacion`: una fila por código visible para la DDRISS del usuario;
  - `GET /reglas-validacion/{codigo}/historial`: las versiones nacionales y de la DDRISS del código;
  - `POST /reglas-validacion`: crea una regla nueva de la DDRISS (código generado, versión 1);
  - `POST /reglas-validacion/{codigo}/versiones`: publica una versión nueva de la DDRISS;
  - `POST /reglas-validacion/{codigo}/desactivar`: el `VIGENTE` de la DDRISS pasa a `HISTORICO`;
  - `POST /reglas-validacion/{codigo}/activar`: publica una copia de la última versión de la DDRISS.
- El catálogo de tipos (`tiposRegla.js`), con sus parámetros, su ámbito y sus marcadores, en el backend y en el frontend.
- Las reglas de formato `validarNombreRegla`, `validarDescripcionRegla` y `validarMensajeRegla` en los dos `campos.js` y en las dos tablas `CASOS`.
- Permisos `REGLA_CONSULTAR`, `REGLA_CREAR` y `REGLA_EDITAR`, solo para el Administrador, en `05_permisos_mysql.sql`.
- Bitácora de cada escritura (módulo `CONFIGURACION`, entidad `reglas_validacion`, `entidad_id` el ObjectId).
- Hijo «Reglas de validación» de «Administración» en `/administracion/reglas`, con la tabla, el panel del editor, el panel del historial y el diálogo de activar o desactivar.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-24, nota en HU-25, corrección de `CONTEXTO BD.md` y nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Ejecutar las reglas, `POST /reportes/{id}/validar` y escribir `resultado_validacion` (HU-25).
- Mostrar los resultados al Personal o al revisor (HU-25, HU-26, HU-28).
- Borradores de reglas, publicar el borrador `RANGO_DOSIS_MES` del 04 o una vigencia futura.
- Crear, publicar, activar o desactivar reglas nacionales o de otra DDRISS.
- Crear códigos nuevos de `CAMPOS_COMPLETOS`, `DIMENSIONES_VALIDAS`, `NO_NEGATIVO`, `SIN_DUPLICADOS` o `PROCEDENCIA_VALIDA`.
- Tipos de validador nuevos.
- Editar `esquemas_captura.reglas[]` o `severidad_override`, o quitarlos de los esquemas.
- Permisos de reglas para el Revisor u otros roles.
- Paginar la lista o el historial.
- Cambios al modelo de datos, al validador o a los índices de `reglas_validacion`, y a las semillas de `backend/db/01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Usa la colección del script 02 tal como está:

```js
// reglas_validacion (MongoDB, base vacunacion_config) — una versión publicada aquí
{
  _id: ObjectId,
  codigo: "RANGO_01",                                          // generado; ver «Código»
  version: 1,                                                  // Int32; mayor versión del código en todo el país + 1
  nombre: "Rango mensual de BCG",
  descripcion: "Advierte cuando una celda supera 300 dosis.",  // opcional
  tipo: "RANGO",
  ambito: "DETALLE",                                           // lo fija el tipo
  severidad: "ADVERTENCIA",                                    // ERROR | ADVERTENCIA
  aplica_a: { vacunas: ["BCG"] },                              // ["*"] = todas
  parametros: { minimo: 0, maximo: 300 },
  mensaje: "{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).",
  territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" }, // siempre la DDRISS del usuario
  estado: "VIGENTE",                                           // VIGENTE al publicar; HISTORICO al reemplazarla o desactivarla
  vigencia: { desde: ISODate("2026-10-30T16:20:00Z"), hasta: null },
  auditoria: { creado_por: 1, creado_en: ISODate, publicado_por: 1, publicado_en: ISODate, motivo_cambio: "…" }
}
```

- `version` y `auditoria.creado_por`/`publicado_por` van con `Int32` (nota del 2026-10-24). Los parámetros se guardan como números de JavaScript, como en la semilla.
- `vigencia.desde` es el **instante** de la publicación (fecha y hora), y `auditoria.creado_en` y `publicado_en` son ese mismo instante. Es informativa: el motor usa el estado `VIGENTE` del momento en que valida.
- Al reemplazarse o desactivarse, una versión solo cambia `estado` a `HISTORICO` y `vigencia.hasta` al instante del cambio, como en el SPEC 20. Su contenido no cambia.

### Código y versión

- **Regla nueva.** El backend genera `{TIPO}_{NN}`: `NN` es el siguiente consecutivo del tipo en todo el país, con dos dígitos como mínimo, contando los códigos que siguen el formato `^{TIPO}_\d{2,}$` en cualquier territorio y estado. Los códigos que no lo siguen (`VARIACION_HISTORICA`, `RANGO_DOSIS_MES`) no cuentan, así que el primero de `RANGO` es `RANGO_01`. La versión es 1.
- **Versión nueva o activación.** `version` = la mayor `version` del código en toda la colección (todos los territorios y estados) + 1, como los esquemas (SPEC 19). Una versión de la DDRISS que reemplaza a una nacional usa el código nacional.
- Si dos escrituras chocan en `uq_regla_version` o en `uq_regla_vigente_territorio`, la segunda responde 409 `REGLA_DESACTUALIZADA` y no queda nada escrito.

### Catálogo de tipos (`tiposRegla.js`)

| Tipo | Se crea | Ámbito | Parámetros | Marcadores del mensaje |
|---|---|---|---|---|
| `RANGO` | Sí | `DETALLE` | `minimo` (entero, 0 a 100 000), `maximo` (entero, de `minimo` + 1 a 100 000) | `vacuna`, `dosis`, `valor`, `minimo`, `maximo` |
| `SECUENCIA_DOSIS` | Sí | `VACUNA` | `exceso_permitido_pct` (entero, 0 a 1000) | `vacuna`, `dosis_anterior`, `dosis_posterior`, `exceso_permitido_pct` |
| `VARIACION_HISTORICA` | Sí | `VACUNA` | `meses_referencia` (entero, 1 a 12), `variacion_max_pct` (entero, 1 a 1000), `minimo_dosis` (entero, 0 a 100 000) | `vacuna`, `variacion`, `meses_referencia`, `variacion_max_pct` |
| `TOTAL_CUADRA` | Sí | `VACUNA` | `tolerancia` (entero, 0 a 1000) | `vacuna`, `total`, `suma` |
| `CAMPOS_COMPLETOS` | No | `VACUNA` | `cero_explicito` (booleano) | `vacuna`, `n_faltantes` |
| `NO_NEGATIVO` | No | `DETALLE` | ninguno | `vacuna`, `dosis` |
| `DIMENSIONES_VALIDAS` | No | `DETALLE` | ninguno | `vacuna`, `dosis`, `version` |
| `PROCEDENCIA_VALIDA` | No | `DETALLE` | ninguno | `vacuna`, `dosis`, `municipio` |
| `SIN_DUPLICADOS` | No | `REPORTE` | ninguno | `establecimiento`, `periodo` |

- Los parámetros y marcadores coinciden con los de las reglas de la semilla. Qué significa cada parámetro al ejecutar la regla lo implementa HU-25.
- Los parámetros de un tipo son **todos obligatorios**, sin otros. Un parámetro de más, que falta o fuera de rango responde 400.
- El catálogo está en `backend/src/modulos/configuracion/tiposRegla.js` y en `frontend/src/paginas/configuracion/tiposRegla.js`, con la misma tabla `CASOS` en sus dos pruebas: un cambio va en los cuatro archivos.

### Contenido de una versión

Lo que se elige al crear o publicar una versión (el código, el tipo y el ámbito no cambian):

- `nombre`: `validarNombreRegla`.
- `descripcion`: `validarDescripcionRegla`; vacía o ausente no guarda el campo.
- `severidad`: `ERROR` o `ADVERTENCIA`.
- `vacunas`: `["*"]`, o una lista de códigos de vacunas **activas** de MySQL, sin repetir y con al menos uno. `"*"` no se combina con códigos.
- `parametros`: los del tipo.
- `mensaje`: `validarMensajeRegla`, y cada marcador `{x}` del texto debe estar en la lista del tipo ("El mensaje usa el marcador {dosis}, que no existe en las reglas de tipo TOTAL_CUADRA.").
- `motivoCambio`: `validarMotivoCambio` (SPEC 20). Se guarda en `auditoria.motivo_cambio`.

### Reglas de formato (`campos.js`)

| Regla | Acepta | Error |
|---|---|---|
| `validarNombreRegla` | recorta; de 3 a 100 caracteres | "El nombre de la regla debe tener entre 3 y 100 caracteres." |
| `validarDescripcionRegla` | recorta; vacío = sin descripción; hasta 300 caracteres | "La descripción de la regla debe tener como máximo 300 caracteres." |
| `validarMensajeRegla` | recorta; de 10 a 300 caracteres | "El mensaje de la regla debe tener entre 10 y 300 caracteres." |

Van en `backend/src/validaciones/campos.js` y `frontend/src/validaciones/campos.js`, con sus casos en las dos tablas `CASOS` (nota del 2026-10-22). Los marcadores no son regla de formato: los revisa `tiposRegla.js`.

### Permisos

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REGLA_CONSULTAR` | `CONFIGURACION_CATALOGOS` | Consultar las reglas de validación que aplican a su DDRISS y su historial | ADMINISTRADOR |
| `REGLA_CREAR` | `CONFIGURACION_CATALOGOS` | Crear reglas de validación para su DDRISS | ADMINISTRADOR |
| `REGLA_EDITAR` | `CONFIGURACION_CATALOGOS` | Publicar versiones de las reglas de validación para su DDRISS, y activar y desactivar las suyas | ADMINISTRADOR |

### Bitácora

Sin acciones nuevas en `ACCIONES`:

| Escritura | Filas |
|---|---|
| Regla nueva | `CREAR` del documento nuevo, completo |
| Versión nueva | `CREAR` del documento nuevo, y `ACTUALIZAR` del `VIGENTE` anterior de la DDRISS (si había) con `estado` y `vigencia.hasta` |
| Desactivar | `DESACTIVAR` del `VIGENTE` de la DDRISS, con `estado`, `vigencia.hasta` y `motivoCambio` en `valoresNuevos` |
| Activar | `REACTIVAR` del documento nuevo, completo |

Las escrituras de varios documentos usan `escribirEnTransaccionConBitacora` (`mongoBitacora.js`, SPEC 20), y las de uno, `escribirConBitacora`. Una transacción de MongoDB necesita el conjunto de réplicas de Atlas (nota del 2026-10-24).

### Respuestas

**Versión de una regla (esquema `ReglaValidacion`):**

```json
{
  "id": "6722b0c1a2b3c4d5e6f70a01",
  "codigo": "VARIACION_HISTORICA",
  "version": 2,
  "nombre": "Variación atípica frente al historial (San Marcos)",
  "descripcion": null,
  "tipo": "VARIACION_HISTORICA",
  "ambito": "VACUNA",
  "severidad": "ADVERTENCIA",
  "vacunas": ["*"],
  "parametros": { "meses_referencia": 3, "variacion_max_pct": 40, "minimo_dosis": 10 },
  "mensaje": "La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.",
  "territorio": { "nivel": "DDRISS", "ddrissCodigo": "DDRISS_SM" },
  "estado": "VIGENTE",
  "vigencia": { "desde": "2026-10-01T06:00:00.000Z", "hasta": null },
  "publicadoPor": { "id": 1, "nombre": "…" },
  "publicadoEn": "2026-10-01T06:00:00.000Z",
  "motivoCambio": "Prueba: umbral de 40 % pedido por la DDRISS."
}
```

- `parametros` conserva las claves en snake_case de la base: son datos de la regla, no campos de la API. Se documenta en el contrato.
- `publicadoPor` usa el esquema `PublicadoPor` del SPEC 20; en las versiones de la semilla sin `publicado_por`, es `null` y `publicadoEn` es `auditoria.creado_en`.

**Fila de `GET /reglas-validacion` (esquema `ReglaPorCodigo`):**

```json
{
  "codigo": "VARIACION_HISTORICA",
  "tipo": "VARIACION_HISTORICA",
  "ambito": "VACUNA",
  "aplica": { "...ReglaValidacion": "la versión que aplica, o null" },
  "ultimaDdriss": { "...ReglaValidacion": "la versión más reciente de la DDRISS, VIGENTE o HISTORICO, o null" },
  "vigenteNacional": { "version": 1 }
}
```

- Una fila por código que tenga al menos una versión `VIGENTE` o `HISTORICO` `NACIONAL` o de la DDRISS del usuario. Los códigos que solo tienen borradores (`RANGO_DOSIS_MES`) y los de otras DDRISS no aparecen (`AGENTS.md` §5.10).
- `vigenteNacional` es `{ version }` del `VIGENTE` nacional, o `null`.
- Orden: por el `nombre` de la primera que exista de `aplica`, `ultimaDdriss` o la última nacional.

**Versión del historial (esquema `ReglaEnHistorial`):** `ReglaValidacion` más `desactivacion`: `{ en, por: PublicadoPor, motivo }` si esa versión se desactivó (sale de la fila `DESACTIVAR` de la bitácora), o `null`.

### Endpoints

Todos devuelven y reciben camelCase, salvo `parametros`. Un `codigo` que no sigue `^[A-Z0-9_]{1,40}$`, que no existe o que no es visible para la DDRISS responde 404.

**`GET /reglas-validacion` (`REGLA_CONSULTAR`).** Sin parámetros (uno desconocido responde 400, con `revisarParametros`). Responde 200 con un arreglo de `ReglaPorCodigo`.

**`GET /reglas-validacion/{codigo}/historial` (`REGLA_CONSULTAR`).** Responde 200 con las versiones `NACIONAL` y de la DDRISS del código, sin borradores, de la más reciente a la más antigua.

**`POST /reglas-validacion` (`REGLA_CREAR`).**

- Cuerpo: `tipo`, `nombre`, `descripcion` (opcional), `severidad`, `vacunas`, `parametros`, `mensaje` y `motivoCambio`. Otro campo responde 400.
- Un `tipo` que no se crea responde 400 ("Solo se crean reglas de tipo RANGO, SECUENCIA_DOSIS, VARIACION_HISTORICA o TOTAL_CUADRA.").
- Genera el código y guarda la versión 1 `VIGENTE` de la DDRISS.
- Responde 201 con la `ReglaValidacion`. Bitácora: `CREAR`.

**`POST /reglas-validacion/{codigo}/versiones` (`REGLA_EDITAR`).**

- Cuerpo: `versionBase`, `nombre`, `descripcion` (opcional), `severidad`, `vacunas`, `parametros`, `mensaje` y `motivoCambio`. `tipo`, `codigo` u otro campo responden 400.
- `versionBase` es la versión que el editor cargó: la de `aplica`, o si no hay, la de `ultimaDdriss`, o si no hay, la última nacional. Si ya no es esa (alguien publicó o desactivó mientras se editaba), responde 409 `REGLA_DESACTUALIZADA`.
- Si el contenido es igual al de la versión que aplica, responde 422 `REGLA_SIN_CAMBIOS` ("La versión no cambia nada de la que aplica.").
- Guarda la versión nueva `VIGENTE` de la DDRISS. El `VIGENTE` anterior de la DDRISS, si había, pasa a `HISTORICO`. El nacional no se toca.
- Responde 201 con la `ReglaValidacion`. Bitácora: `CREAR` y, si había anterior, `ACTUALIZAR`.

**`POST /reglas-validacion/{codigo}/desactivar` (`REGLA_EDITAR`).**

- Cuerpo: `version` (la del `VIGENTE` de la DDRISS que se ve) y `motivoCambio`.
- Si la DDRISS no tiene `VIGENTE` del código, responde 409 `REGLA_SIN_VERSION_PROPIA` ("Su DDRISS no tiene una versión activa de esta regla; las reglas nacionales no se desactivan."). Si `version` no es la del `VIGENTE`, responde 409 `REGLA_DESACTUALIZADA`.
- El `updateOne` lleva la condición `estado: "VIGENTE"`; si no modifica nada, responde 409 `REGLA_DESACTUALIZADA`.
- Responde 200 con la fila `ReglaPorCodigo` actualizada. Bitácora: `DESACTIVAR`.

**`POST /reglas-validacion/{codigo}/activar` (`REGLA_EDITAR`).**

- Cuerpo: `version` (la de `ultimaDdriss`) y `motivoCambio`.
- Si la DDRISS ya tiene `VIGENTE` del código, o no tiene versiones, responde 409 `REGLA_SIN_VERSION_PROPIA` ("Solo se activa una regla de su DDRISS que esté desactivada."). Si `version` no es la de su última versión, responde 409 `REGLA_DESACTUALIZADA`.
- Copia el contenido de esa versión en una nueva `VIGENTE` de la DDRISS. Si la copia usa una vacuna ya inactiva, responde 422 `REGLA_INVALIDA`.
- Responde 201 con la `ReglaValidacion`. Bitácora: `REACTIVAR`.

**Orden de escritura.** El de las notas del 2026-10-24: lee y valida (incluidas las vacunas de MySQL y la DDRISS), abre `enTransaccion`, escribe la bitácora, escribe en MongoDB (en una transacción de MongoDB si son dos documentos), y si MongoDB falla o no cumple su condición, se deshace la bitácora.

### Errores de las reglas

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Parámetro o campo no permitido, tipo que no se crea, severidad, vacunas o parámetros mal formados, marcador desconocido, formato de nombre, descripción, mensaje o motivo | los de `campos.js` y `tiposRegla.js` |
| 404 | `NO_ENCONTRADO` | Código inexistente, inválido o no visible para la DDRISS | "El recurso solicitado no existe." |
| 409 | `REGLA_DESACTUALIZADA` | `versionBase` o `version` no son las actuales; choque en un índice único | "La regla {codigo} cambió mientras la editaba; vuelva a abrirla." |
| 409 | `REGLA_SIN_VERSION_PROPIA` | Desactivar sin `VIGENTE` de la DDRISS; activar con `VIGENTE` o sin versiones de la DDRISS | los de los endpoints |
| 422 | `REGLA_INVALIDA` | Una vacuna inexistente o inactiva | "La vacuna {codigo} no existe o está inactiva." |
| 422 | `REGLA_SIN_CAMBIOS` | La versión nueva es igual a la que aplica | el del endpoint |

Los 401 y 403 no cambian. Un usuario sin DDRISS recibe 403 `SIN_PERMISO`; hoy no pasa, porque `AUTORIDAD` no tiene los permisos de reglas.

### Frontend

**`src/api/configuracion.js`.** Funciones nuevas: `listarReglas()`, `historialRegla(codigo)`, `crearRegla(datos)`, `publicarVersionRegla(codigo, datos)`, `desactivarRegla(codigo, datos)` y `activarRegla(codigo, datos)`. Sin caché.

**Opción del menú.** Hijo «Reglas de validación» de «Administración» en `opcionesMenu.js`, después de «Esquemas», con la ruta `/administracion/reglas`, el icono `ListChecks` de `lucide-react`, la descripción "Los controles de calidad que se revisan antes de enviar un reporte." y los permisos `CONFIGURACION_CONSULTAR`, `REGLA_CONSULTAR` y `VACUNA_CONSULTAR` (el editor lista las vacunas). No tiene subrutas.

**Pantalla (`PaginaReglas.jsx`).**

- `EncabezadoPagina` con el antetítulo «Administración», el título «Reglas de validación» y la acción «Nueva regla» (con `REGLA_CREAR`).
- Card con el texto "Las reglas de error impiden enviar el reporte; las advertencias solo avisan. Una regla de su DDRISS reemplaza a la nacional del mismo código.".
- Tabla:

  | Regla | Severidad | Vacunas | Aplica | Estado | Acciones |
  |---|---|---|---|---|---|

  - Regla: el nombre, y debajo el código y el nombre del tipo.
  - Severidad: Badge «Error» (`destructive`) o «Advertencia» (`--advertencia`), de la versión que aplica; «—» si está inactiva.
  - Vacunas: «Todas» o los códigos.
  - Aplica: "Versión {n} · Nacional", "Versión {n} · {ddrissCodigo}" o "—".
  - Estado: Badge «Activa» o «Inactiva».
  - Acciones: un `DropdownMenu` (`modal={false}`) con:
    - «Nueva versión» (con `REGLA_EDITAR`): abre el editor con la versión base;
    - «Desactivar» (con `REGLA_EDITAR`, si la versión que aplica es de la DDRISS);
    - «Activar versión {n} de {ddrissCodigo}» (con `REGLA_EDITAR`, si `ultimaDdriss` está en `HISTORICO`);
    - «Historial».
- Carga: Skeleton. Error: `AvisoError` con `onReintentar`.
- Un 409 al guardar, activar o desactivar se muestra en el panel o el diálogo, con «Recargar», que vuelve a pedir la lista.

**Editor (`PanelRegla.jsx`, un `Sheet` a la derecha).**

- Dos modos:
  - **Nueva regla:** Select «Tipo» con los cuatro tipos que se crean. Al elegirlo, precarga los parámetros y el mensaje de ejemplo del tipo.
  - **Nueva versión:** el tipo y el código fijos, y todo precargado de la versión base. Si la base es nacional, el aviso "Esta versión reemplazará a la versión {n} nacional solo en {ddrissCodigo}.". Si la base tiene vacunas inactivas, se quitan con el aviso "Se quitaron vacunas inactivas: …".
- Campos: «Nombre», «Descripción» (Textarea), «Severidad» (RadioGroup «Error: impide enviar» / «Advertencia: solo avisa»), «Vacunas» (RadioGroup «Todas» / «Elegir», y con «Elegir», un Checkbox por vacuna activa), los parámetros del tipo (Input numérico o Switch, con su etiqueta y su rango de `tiposRegla.js`), «Mensaje» (Textarea, con la lista de marcadores del tipo debajo) y «Motivo del cambio» (Textarea).
- Botón «Crear regla» o «Publicar versión». Sigue las reglas de formularios de la nota del 2026-10-28 (habilitado salvo al enviar, todos los errores al enviar, foco en el primero, error de la API encima de los botones).
- Al guardar, cierra el panel, actualiza la lista y muestra `toast.success("Regla {codigo} publicada (versión {n}).")`.
- Con cambios, cerrar el panel pide confirmación ("¿Descartar los cambios?"), y `useAvisoCambiosSinGuardar` bloquea la salida de la ruta.

**Historial (`PanelHistorialRegla.jsx`, un `Sheet`).** Las versiones de `historialRegla`, de la más reciente a la más antigua. Cada una muestra versión, territorio, Badge de estado, severidad, vacunas, parámetros con sus etiquetas, vigencia (fecha y hora), publicada por y el motivo. Si se desactivó, "Desactivada el {fecha} por {nombre}: {motivo}".

**Diálogo de estado (`DialogoEstadoRegla.jsx`, un `AlertDialog`).** Pide el «Motivo del cambio» para activar o desactivar.

- Al desactivar, si hay un `VIGENTE` nacional: "Al desactivarla vuelve a aplicar la versión {n} nacional.". Si no: "Ninguna versión de esta regla revisará los reportes de {ddrissCodigo}.".
- Al activar: "Se publicará la versión {n+} con el mismo contenido de la versión {n}.".
- En el `AlertDialogAction` va `evento.preventDefault()`, para que un error no cierre el diálogo (nota del 2026-10-26).
- Al terminar, `toast.success` y actualiza la lista.

**`tiposRegla.js` (frontend).** El catálogo de la tabla de tipos, con la etiqueta de cada tipo y de cada parámetro en español, y `revisarParametros`/`marcadoresDesconocidos` con los mismos mensajes del backend.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                  ← /reglas-validacion y sus operaciones; ReglaValidacion, ReglaPorCodigo, ReglaEnHistorial, ReglaCrear, ReglaVersion, ReglaEstado
├── db/05_permisos_mysql.sql                      ← REGLA_CONSULTAR, REGLA_CREAR, REGLA_EDITAR y sus asignaciones
├── src/validaciones/campos.js                    ← validarNombreRegla, validarDescripcionRegla, validarMensajeRegla
├── src/modulos/configuracion/
│   ├── configuracion.routes.js                   ← rutas de reglas
│   ├── configuracion.controller.js               ← controladores de reglas
│   ├── esquemas.service.js                       ← exporta codigoDdriss (decidido al implementar)
│   ├── tiposRegla.js                             ← nuevo: catálogo de tipos
│   └── reglas.service.js                         ← nuevo: listar, historial, crear, publicar versión, desactivar, activar
└── tests/
    ├── campos.test.js                            ← casos nuevos
    ├── tiposRegla.test.js                        ← nuevo
    └── reglas.test.js                            ← nuevo
frontend/src/
├── api/configuracion.js                          ← funciones de reglas
├── validaciones/campos.js                        ← las tres reglas
├── validaciones/campos.test.js                   ← los mismos casos
├── componentes/layout/opcionesMenu.js            ← hijo «Reglas de validación»
├── componentes/layout/Layout.test.jsx            ← el hijo nuevo en el menú (decidido al implementar)
└── paginas/configuracion/
    ├── tiposRegla.js                             ← nuevo
    ├── tiposRegla.test.js                        ← nuevo
    ├── PaginaReglas.jsx                          ← nuevo
    ├── PaginaReglas.test.jsx                     ← nuevo
    ├── PanelRegla.jsx                            ← nuevo
    ├── PanelRegla.test.jsx                       ← nuevo
    ├── PanelHistorialRegla.jsx                   ← nuevo
    ├── presentacionRegla.jsx                     ← nuevo: severidad, territorio y vacunas (decidido al implementar)
    ├── DialogoEstadoRegla.jsx                    ← nuevo
    └── DialogoEstadoRegla.test.jsx               ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                ← avance y criterios de HU-24; nota en HU-25
docs/base-de-datos/CONTEXTO BD.md                 ← qué reglas se ejecutan y el papel de esquemas_captura.reglas
CLAUDE.md                                         ← nota de reglas
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, agregar las seis operaciones de este spec con sus esquemas, su `x-permiso`, sus respuestas y un ejemplo por cada error de la tabla. Documentar que `parametros` va en snake_case. Comprobación: `/api/docs` carga sin errores y muestra las operaciones.

2. **Permisos.** En `05_permisos_mysql.sql`, en un bloque "SPEC 32 (HU-24)": agregar `REGLA_CONSULTAR`, `REGLA_CREAR` y `REGLA_EDITAR` (módulo `CONFIGURACION_CATALOGOS`) y asignarlos al ADMINISTRADOR. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token del Administrador trae los tres códigos y el del Revisor no.

3. **Reglas de formato.** Las tres reglas en los dos `campos.js`, con los mismos casos en las dos tablas `CASOS`: un valor válido, uno con espacios alrededor, vacío, solo espacios, uno corto y uno largo (en la descripción, vacío es válido). Comprobación: `campos.test.js` pasa en los dos proyectos.

4. **Catálogo de tipos.** `tiposRegla.js` del backend y del frontend, con la tabla `CASOS` común en sus pruebas: parámetros completos y válidos, uno de más, uno que falta, fuera de rango, `maximo` igual a `minimo`, un booleano que no lo es, un marcador desconocido y un mensaje sin marcadores. Además, que las ocho reglas publicadas de la semilla (02 y 04) cumplan su tipo. Comprobación: `tiposRegla.test.js` pasa en los dos proyectos.

5. **Backend: consulta.** `reglas.service.js` con `listarReglas` e `historialRegla`, y sus rutas y controladores. Las pruebas de `tests/reglas.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes borran los restos de corridas anteriores):
   - en MySQL, por SQL: la vacuna activa `ZVT_HU24` y la inactiva `ZVT_HU24I`;
   - en MongoDB, insertados directamente: `ZVT_HU24_NAC` v1 `NACIONAL` `VIGENTE`; `ZVT_HU24_PROPIA` v1 `HISTORICO` y v2 `VIGENTE` de `DDRISS_SM`; `ZVT_HU24_OTRA` v1 `VIGENTE` de la DDRISS ficticia `ZVT_OTRA24`; `ZVT_HU24_BORR` v1 `NACIONAL` en `BORRADOR`;
   - borran los documentos cuyo código empiece con `ZVT_HU24` y los que tengan `nombre` que empiece con `vitest-hu24-` (los que crean las pruebas con código generado).

   Casos:
   - la lista trae `CAMPOS_COMPLETOS` con `aplica` nacional v1, `VARIACION_HISTORICA` con `aplica` v2 de `DDRISS_SM` y `vigenteNacional` v1, y `ZVT_HU24_PROPIA` con `aplica` v2;
   - `ZVT_HU24_OTRA`, `ZVT_HU24_BORR` y `RANGO_DOSIS_MES` no aparecen, y el historial de `ZVT_HU24_OTRA` responde 404;
   - el historial de `ZVT_HU24_PROPIA` trae v2 y v1, en ese orden;
   - un parámetro desconocido responde 400;
   - el Revisor de la semilla, con un token de `tokenDePrueba`, recibe 403.

   Comprobación: la prueba pasa.

6. **Backend: crear.** `crearRegla` y su ruta. Pruebas:
   - crear una regla `RANGO` para `ZVT_HU24` guarda `RANGO_{NN}` (el siguiente consecutivo), versión 1, `VIGENTE`, territorio `DDRISS_SM`, ámbito `DETALLE`, los tipos Int32, `vigencia.desde` igual a `publicado_en`, y una fila `CREAR`;
   - un tipo `NO_NEGATIVO` responde 400, y también un parámetro de más, un `maximo` menor que el `minimo`, un marcador desconocido y `"*"` con un código;
   - la vacuna `ZVT_HU24I` responde 422 `REGLA_INVALIDA`;
   - si MongoDB falla (`vi.spyOn` sobre la colección), no queda la fila de bitácora.

   Comprobación: la prueba pasa.

7. **Backend: versiones.** `publicarVersionRegla` y su ruta. Pruebas:
   - una versión de `ZVT_HU24_PROPIA` guarda v3 `VIGENTE`, pasa la v2 a `HISTORICO` con `vigencia.hasta` (sin cambiar su contenido) y deja `CREAR` y `ACTUALIZAR`;
   - una versión de `ZVT_HU24_NAC` guarda v2 de `DDRISS_SM` y no toca la nacional;
   - `versionBase` vieja responde 409 `REGLA_DESACTUALIZADA`, y un contenido igual al que aplica responde 422 `REGLA_SIN_CAMBIOS`;
   - un `tipo` en el cuerpo responde 400;
   - dos versiones en paralelo del mismo código: una 201 y otra 409, y queda un solo `VIGENTE` de la DDRISS;
   - si falla el segundo documento de la transacción de MongoDB, no queda ninguno escrito ni la bitácora.

   Comprobación: la prueba pasa.

8. **Backend: desactivar y activar.** `desactivarRegla` y `activarRegla` con sus rutas. Pruebas:
   - desactivar `ZVT_HU24_PROPIA` la deja sin `aplica`, con `DESACTIVAR` y el motivo en la bitácora; el historial trae su `desactivacion`;
   - desactivar la versión de `DDRISS_SM` de `ZVT_HU24_NAC` deja `aplica` en la nacional;
   - desactivar `ZVT_HU24_NAC` sin versión de la DDRISS responde 409 `REGLA_SIN_VERSION_PROPIA`;
   - activar `ZVT_HU24_PROPIA` publica la versión siguiente con el contenido de la última y deja `REACTIVAR`; activarla otra vez responde 409;
   - activar una copia con `ZVT_HU24I` (desactivada por SQL después de publicar) responde 422.

   Comprobación: `npm test` del backend pasa completo.

9. **Frontend: lista y diálogo.** Las funciones de `src/api/configuracion.js`, el hijo en `opcionesMenu.js`, `PaginaReglas.jsx` y `DialogoEstadoRegla.jsx`. Pruebas:
   - la tabla muestra la severidad, las vacunas, la versión que aplica con su territorio y el estado;
   - «Desactivar» solo aparece en una regla cuya versión que aplica es de la DDRISS, y «Activar versión {n}» solo con `ultimaDdriss` en `HISTORICO`;
   - el diálogo de desactivar avisa que vuelve la nacional cuando hay una, exige el motivo y llama a `desactivarRegla` con la versión;
   - un 409 se muestra en el diálogo con «Recargar»;
   - si falla la carga, «Reintentar» vuelve a pedir;
   - sin `REGLA_CREAR` o `REGLA_EDITAR` no aparecen sus acciones, y sin `REGLA_CONSULTAR` la opción no se ve en el menú.

   Comprobación: `npm test` del frontend pasa.

10. **Frontend: editor e historial.** `PanelRegla.jsx` y `PanelHistorialRegla.jsx`. Pruebas:
    - «Nueva regla» ofrece solo los cuatro tipos, y elegir uno muestra sus parámetros y precarga su mensaje;
    - un marcador desconocido, un parámetro fuera de rango o un motivo vacío se muestran al enviar, con el foco en el primero;
    - «Nueva versión» de una nacional precarga su contenido y muestra el aviso de reemplazo, y quita las vacunas inactivas con su aviso;
    - guardar llama a `publicarVersionRegla` con `versionBase`, cierra el panel y llama a `toast.success`;
    - cerrar con cambios pide confirmación;
    - el historial muestra las versiones y la desactivación.

    Comprobación: `npm test` del frontend pasa completo.

11. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), como Administrador:
    - abrir «Reglas de validación» y ver las seis nacionales y `VARIACION_HISTORICA` v2 de `DDRISS_SM`;
    - crear una regla `RANGO` con el nombre «Prueba manual HU-24» para BCG, como advertencia;
    - publicarle una versión nueva con otro máximo y ver las dos en el historial;
    - desactivarla, ver «Inactiva» y activarla de nuevo;
    - abrir «Nueva versión» de `SECUENCIA_DOSIS` y ver el aviso de reemplazo de la nacional, sin publicarla;
    - al terminar, desactivar «Prueba manual HU-24» y revisar por SQL las filas `CREAR`, `ACTUALIZAR`, `DESACTIVAR` y `REACTIVAR` de la bitácora.

    Como Revisor: la opción no aparece en el menú y `/administracion/reglas` no se abre.

    **No** publicar versiones de las reglas de la semilla: el motor de HU-25 las usará en sus pruebas.

    Documentación:
    - en HU-24, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
    - en HU-25, la nota: "Las reglas que se ejecutan son las que aplican a la DDRISS del establecimiento al validar (SPEC 32: la `VIGENTE` de la DDRISS antes que la nacional del mismo código), con `aplica_a.vacunas` que incluya la vacuna o `*`; `esquemas_captura.reglas[]` y `severidad_override` ya no deciden. Los parámetros y marcadores de cada tipo están en `tiposRegla.js`. Una regla `CAMPOS_COMPLETOS` o `NO_NEGATIVO` puede no aplicar si la DDRISS la desactivó.";
    - en `CONTEXTO BD.md`, corregir el flujo «Enviar» de §7 y la descripción de `reglas[]` en `esquemas_captura`, y anotar que el 02 conserva la descripción anterior;
    - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: qué reglas aplican, publicación directa sin borradores, desactivar = `HISTORICO` sin reemplazo, el código `{TIPO}_{NN}`, `tiposRegla.js` en cuatro archivos y los datos de prueba `ZVT_HU24*` / `vitest-hu24-`.

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta las seis operaciones de `/reglas-validacion` con su `x-permiso`, y `/api/docs` carga sin errores.
- [x] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan reglas `ZVT_HU24…` o `vitest-hu24-…` ni las vacunas de prueba.
- [x] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [x] Desde la pantalla, el Administrador crea una regla de tipo `RANGO`, `SECUENCIA_DOSIS`, `VARIACION_HISTORICA` o `TOTAL_CUADRA`, de error o de advertencia, para todas las vacunas o para algunas.
- [x] Una regla nueva queda con el código `{TIPO}_{NN}`, versión 1, `VIGENTE` y el territorio de la DDRISS del usuario.
- [x] Publicar una versión crea un documento nuevo con la versión siguiente; el `VIGENTE` anterior de la DDRISS pasa a `HISTORICO` sin cambiar su contenido, y el nacional no cambia.
- [x] Desactivar deja la regla sin versión de la DDRISS que aplique, y vuelve a aplicar la nacional del mismo código si existe. Activar publica una copia de la última versión de la DDRISS.
- [x] Una regla nacional no se puede desactivar (409), y las de otras DDRISS no se ven (404).
- [x] El backend rechaza parámetros fuera del tipo o de su rango, marcadores desconocidos (400) y vacunas inactivas (422).
- [x] El historial muestra todas las versiones nacionales y de la DDRISS del código, con quién y cuándo las publicó, su motivo y, si se desactivó, el motivo de la desactivación.
- [x] Cada escritura deja sus filas en la bitácora (`CREAR`, `ACTUALIZAR`, `DESACTIVAR`, `REACTIVAR`) con el módulo `CONFIGURACION` y el ObjectId como `entidad_id`, y un fallo de MongoDB no deja filas ni documentos a medias.
- [x] Sin `REGLA_CONSULTAR`, `REGLA_CREAR` o `REGLA_EDITAR`, sus endpoints responden 403 y la pantalla oculta la opción o las acciones. El Revisor no tiene esos permisos.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] HU-24 tiene su avance y sus criterios marcados, HU-25 tiene su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** desactivar = el `VIGENTE` de la DDRISS pasa a `HISTORICO` sin reemplazo, y activar = publicar una versión nueva (decidido en la fase de preguntas). No toca el modelo. **No:** un campo `activa` en `reglas_validacion`, que permitía apagar una nacional en una sola DDRISS pero cambia el 02 y `CONTEXTO BD.md`; **no:** `aplica_a.vacunas: []` como «desactivada», que confunde dos cosas.
- **Sí:** el motor de HU-25 ejecuta las reglas que aplican a la DDRISS por territorio y vacuna, y `esquemas_captura.reglas[]` deja de decidir (decidido en la fase de preguntas). Así, crear o desactivar una regla tiene efecto sin republicar esquemas. **No:** ejecutar solo `reglas[]` del esquema con su versión fijada, que obliga a publicar un esquema por cada regla nueva; **no:** el híbrido (códigos del esquema, versión por territorio), con el mismo problema.
- **Sí:** el motor usa las versiones que aplican en el momento de validar, y `resultado_validacion` guarda cuál usó. La vigencia es el instante de publicación y es informativa. **No:** elegir la versión por la fecha del periodo, como los esquemas, porque una regla nueva no aplicaría al mes en curso.
- **Sí:** publicación directa, con un motivo obligatorio, y la anterior de la DDRISS pasa a `HISTORICO` en una transacción de MongoDB, como el SPEC 20. **No:** borradores y publicar, que duplican las pantallas de esquemas y no caben en los 8 puntos.
- **Sí:** solo se crean códigos nuevos de los tipos con parámetros: `RANGO`, `SECUENCIA_DOSIS`, `VARIACION_HISTORICA` y `TOTAL_CUADRA`. Las reglas existentes de los otros tipos se publican en versiones nuevas y se activan o desactivan. **No:** los nueve tipos, porque otra regla sin parámetros no revisa nada distinto; **no:** ningún código nuevo, que no cumple la historia.
- **Sí:** el Administrador solo maneja reglas de su DDRISS, y una versión de la DDRISS reemplaza a la nacional del mismo código (como los esquemas del SPEC 19). Una regla nacional se ve pero no se apaga. **No:** publicar nacionales, que cambia la configuración de todo el país desde San Marcos; **no:** que todo sea nacional, que ignora el modelo por DDRISS.
- **Sí:** los permisos son solo del Administrador, como dice la historia (decidido en la fase de preguntas). **No:** darlos también al Revisor, como en esquemas y vacunas.
- **Sí:** el backend genera el código `{TIPO}_{NN}`, con el consecutivo en todo el país (decidido en la fase de preguntas). **No:** que lo escriba el usuario.
- **Sí:** en una versión nueva cambia todo menos el código, el tipo y el ámbito. El ámbito lo fija el tipo, y el mensaje solo acepta los marcadores del tipo. **No:** un mensaje fijo por tipo; **no:** cambiar solo la severidad y los parámetros, que pierde el «por vacuna» de la historia.
- **Sí:** el editor y el historial van en un `Sheet` lateral sobre la lista, sin subrutas (decidido en la fase de preguntas). **No:** subrutas `/nueva`, `/:codigo/nueva-version` y `/:codigo/historial`, como esquemas.
- **Sí:** el catálogo de tipos (parámetros, rangos, ámbito, marcadores) se fija aquí y se repite en el frontend, como `campos.js` y `coherenciaEsquema.js`. Los rangos de los parámetros se decidieron al escribir el spec, a partir de los valores de la semilla. **No:** un endpoint de tipos, que no sigue el patrón del proyecto y no evita las etiquetas del frontend.
- **Sí:** las acciones de la bitácora ya existentes (`CREAR`, `ACTUALIZAR`, `DESACTIVAR`, `REACTIVAR`), y el motivo de una desactivación solo en la bitácora, porque una versión `HISTORICO` solo cambia `estado` y `vigencia.hasta`. El historial lo lee de ahí. Decidido al escribir el spec. **No:** una acción `PUBLICAR_REGLA`; **no:** escribir el motivo en la `auditoria` de la versión desactivada.
- **Sí:** `versionBase` en las versiones y `version` en activar y desactivar, con 409 `REGLA_DESACTUALIZADA`, como `copiaDe` en los esquemas. Decidido al escribir el spec.
- **Sí:** una versión igual a la que aplica responde 422 `REGLA_SIN_CAMBIOS`, porque una versión vacía ensucia el historial. Decidido al escribir el spec.
- **Sí:** las pruebas insertan sus propias reglas `ZVT_HU24*`, su DDRISS ficticia `ZVT_OTRA24` y sus vacunas, y nombran `vitest-hu24-…` las que crean con código generado, para borrarlas. Así no publican versiones de las reglas de la semilla.

Decididas al implementar:

- **Sí:** los mensajes 400 que el spec no fijaba: "Solo se crean reglas de tipo RANGO, SECUENCIA_DOSIS, VARIACION_HISTORICA o TOTAL_CUADRA.", "La severidad debe ser ERROR o ADVERTENCIA." y "Indique * para todas las vacunas, o una lista de códigos sin repetir y sin *." (paso 6).
- **Sí:** dos altas simultáneas del mismo tipo responden 409 `REGLA_DESACTUALIZADA` con "Se creó otra regla del mismo tipo al mismo tiempo; intente de nuevo." (paso 6).
- **Sí:** "ocho reglas publicadas de la semilla" son en realidad siete publicadas más un borrador (`RANGO_DOSIS_MES`). La prueba de `tiposRegla.test.js` revisa todas las de Atlas, salvo las de prueba `ZVT_`/`vitest-` (paso 4).
- **Sí:** `codigoDdriss` de `esquemas.service.js` se exporta para que `reglas.service.js` lo reutilice (paso 5).
- **Sí:** el diálogo de activar dice "Se publicará una versión nueva con el mismo contenido de la versión {n}.", sin el número de la nueva: la mayor versión del código puede ser de otra DDRISS, y solo el backend la conoce (paso 9).
- **Sí:** el aviso de reemplazo dice "…solo en su DDRISS." en lugar del `ddrissCodigo`: si la DDRISS no tiene versiones del código, la pantalla no conoce su código, porque la sesión solo trae su id (paso 10).
- **Sí:** la insignia de severidad y los textos del territorio y las vacunas van en `presentacionRegla.jsx`, que usan la lista y el historial; así `PanelHistorialRegla.jsx` no importa `PaginaReglas.jsx`, que lo importa a él (paso 10).
- **Sí:** las pruebas del historial están en `PaginaReglas.test.jsx`, donde se abre, y esa prueba monta la página con `createMemoryRouter`, porque `PanelRegla` usa `useAvisoCambiosSinGuardar` (paso 10).
- **Sí:** en las filas `CREAR` y `REACTIVAR` de la bitácora, `publicadoPor` es el id del usuario (`aReglaBitacora`), no `{ id, nombreUsuario }` como en la API. La verificación manual encontró que salía `null`, porque la fila se armaba sin buscar los nombres (paso 11). **No:** quitar el campo, que ya está en `bitacora.usuario_id`.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El 02 sigue describiendo `esquemas_captura.reglas` como «las reglas que aplica esta versión», y `CONTEXTO BD.md` (corregido) dice otra cosa | `AGENTS.md` dice que mandan los scripts: la diferencia queda anotada en `CONTEXTO BD.md`, en HU-25 y en `CLAUDE.md`. Cambiar la descripción del 02 queda para cuando el equipo autorice tocar `backend/db/`. |
| HU-25 implementa el motor con `esquemas_captura.reglas[]`, como decía la documentación | La nota en HU-25 y la de `CLAUDE.md` fijan el contrato. |
| Una DDRISS desactiva `CAMPOS_COMPLETOS` o `NO_NEGATIVO` con su versión propia y deja de revisar algo básico | Es la decisión del equipo; el diálogo dice qué pasa al desactivar, y la bitácora guarda quién y por qué. `NO_NEGATIVO` ya lo garantiza el `PUT` de la captura. |
| El consecutivo del código choca entre dos altas simultáneas | El índice `uq_regla_version` rechaza la segunda (409) y la prueba de altas en paralelo lo cubre. |
| Las versiones publicadas en la verificación manual no se pueden borrar (§5.5) | Se usa una sola regla de prueba, «Prueba manual HU-24», y se deja desactivada. |
| MySQL se confirma después de escribir en MongoDB; si la confirmación falla, MongoDB queda cambiado sin su fila de bitácora | Es la regla acordada (nota del 2026-10-20) y la ventana es mínima. El caso inverso tiene prueba. |
| El catálogo de tipos del backend y el del frontend se separan | Las dos pruebas usan la misma tabla `CASOS`, y la nota de `CLAUDE.md` lo avisa. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- El motor de reglas, `POST /reportes/{id}/validar` y `resultado_validacion` (HU-25).
- Mostrar los resultados de la validación (HU-25, HU-26, HU-28).
- Borradores de reglas y vigencias futuras.
- Reglas nacionales o de otras DDRISS.
- Códigos nuevos de los tipos sin parámetros, o tipos de validador nuevos.
- Editar `esquemas_captura.reglas[]` o `severidad_override`.
- Permisos de reglas para el Revisor.
- Paginación de la lista o del historial.
- Cambios al modelo de datos, al validador, a los índices o a las semillas.

Cada uno, si se hace, va en su propio spec.
