# SPEC 33 — Validación automática del reporte en borrador

> **Estado:** Aprobado
> **Historia:** HU-25
> **Depende de:** SPEC 04, SPEC 05, SPEC 22, SPEC 23, SPEC 24, SPEC 25, SPEC 31 y SPEC 32
> **Fecha:** 2026-10-30
> **Objetivo:** Que el Personal del establecimiento vea, en la captura de su reporte en borrador, los errores y las advertencias que encuentra un motor de reglas del backend sobre lo guardado, con la vacuna, la dosis, la regla y las casillas de cada uno.

## Por qué existe este spec

El SPEC 32 definió **qué reglas aplican** a una DDRISS: por código, la `VIGENTE` de la DDRISS antes que la nacional, con `aplica_a.vacunas` que contenga la vacuna o `"*"`. Nadie las ejecuta todavía. `backend/openapi.yaml` ya tiene `POST /reportes/{id}/validar`, sin implementar y sin `x-permiso`, que responde un arreglo de `ResultadoValidacion`.

La tabla `resultado_validacion` (01) existe, con `regla_codigo`, `regla_version`, `severidad`, `mensaje`, `estado` (`ABIERTO`, `CORREGIDO`, `JUSTIFICADO`), `justificacion` y las llaves opcionales `reporte_vacuna_id` y `detalle_id`. El 03 trae tres filas de ejemplo en reportes de la semilla.

Este spec construye el motor y lo muestra en la captura. **No envía el reporte:** HU-26 (`POST /reportes/{id}/transiciones` con ENVIAR) llamará al mismo motor y rechazará el envío si quedan errores abiertos.

**Conceptos:**

- Una **corrida** es una ejecución del motor sobre todo el reporte, con lo **guardado** (nunca con lo que está sin guardar en la pantalla).
- Un **resultado** es una fila de `resultado_validacion`. Su **llave** es (`regla_codigo`, `reporte_vacuna_id`, `detalle_id`, `mensaje`).
- Los resultados **actuales** de un reporte son los que produjo su última corrida, en estado `ABIERTO` o `JUSTIFICADO`.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- «Campos obligatorios vacíos»: los marca `CAMPOS_COMPLETOS`. Con `cero_explicito: true` cuenta las casillas vacías de la tarjeta A y las de las filas guardadas de la tarjeta B (nota del 2026-10-26), más los campos adicionales `requerido` sin valor.
- «Cantidades negativas» y «duplicados»: el `PUT` de la captura ya no deja guardarlos (400 y 422 `CELDA_REPETIDA`, SPEC 23) y el índice único de `reporte_produccion` impide dos reportes del mismo mes. `NO_NEGATIVO` y `SIN_DUPLICADOS` tienen su validador, pero en la práctica no producen resultados. La semilla no tiene ninguna regla `SIN_DUPLICADOS`: el validador se prueba con una regla de prueba.
- «Totales que no cuadran»: `reporte_vacuna.total_declarado` es la suma del detalle (SPEC 23), así que no sirve para comparar. `TOTAL_CUADRA` compara el campo adicional `total_dosis_declarado` (Hexavalente v2) con la suma del detalle.
- «Con colores distintos»: los errores en rojo (`destructive`) y las advertencias en ámbar (`--advertencia`), como el mockup `Registro.html`.

## Alcance

**Entra:**

- El motor: un validador por cada uno de los nueve tipos de `tiposRegla.js`.
- `POST /reportes/{id}/validar`, solo con el reporte en `BORRADOR` y el mes `ABIERTO` o `EN_CIERRE` (como el `PUT`), que escribe los resultados en `resultado_validacion` y responde los actuales.
- Comparar con la corrida anterior: lo que ya no aparece pasa a `CORREGIDO`, lo que se repite se conserva, lo nuevo se inserta.
- El permiso `REPORTE_VALIDAR` (módulo `PRODUCCION`), solo para el Personal del establecimiento, en `05_permisos_mysql.sql`.
- La acción `VALIDAR` en `ACCIONES`, con una fila por corrida que cambia algo.
- `reglasQueAplican` en `reglas.service.js`, que resuelve las reglas de una DDRISS con la regla del SPEC 32.
- En la captura: la validación al abrir el reporte y después de guardar, agregar o quitar una vacuna; el botón «Validar de nuevo»; el panel «Validación automática» en una columna derecha; el borde rojo o ámbar en las casillas de cada resultado; y un clic en un resultado que abre su pestaña y enfoca su primera casilla.
- Pruebas del backend (contra las bases de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance y criterios de HU-25, nota en HU-26, y notas en `CONTEXTO BD.md` y en `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Enviar el reporte, el botón «Enviar a revisión» y la transición ENVIAR (HU-26).
- Justificar advertencias (`estado = JUSTIFICADO`, `justificacion`): HU-26 o HU-28.
- Mostrar los resultados al revisor o en la bandeja (HU-27, HU-28), y un `GET` de los resultados sin ejecutar el motor.
- Validar un reporte que no está en `BORRADOR`, o validar lo que está sin guardar.
- La tarjeta «validaciones pendientes» del Inicio del Personal.
- Validar en el `PUT` de cada vacuna.
- Tipos de regla nuevos o cambios a `tiposRegla.js`.
- Cambios al modelo de datos (tablas, columnas, índices, colecciones) y a las semillas `01` a `04`.

## Modelo de datos

Este spec **no cambia el modelo**. Escribe en la tabla del 01 tal como está:

```sql
-- resultado_validacion (MySQL) — una fila por resultado
id, reporte_id, reporte_vacuna_id,   -- NULL en las reglas de ámbito REPORTE
detalle_id,                          -- solo en las de ámbito DETALLE con una celda guardada
regla_codigo, regla_version,         -- la versión que aplicó en la corrida
severidad,                           -- la de esa versión
mensaje,                             -- con los marcadores ya reemplazados, hasta 500 caracteres
estado,                              -- ABIERTO al insertar; CORREGIDO cuando deja de aparecer
justificacion,                       -- no se toca (HU-26/HU-28)
ejecutado_en                         -- la primera vez que se detectó
```

- `reporte_vacuna_id` y `detalle_id` se borran en cascada con su vacuna o su celda (01): quitar una vacuna o vaciar una celda borra sus resultados.
- Un resultado `CORREGIDO` no vuelve a `ABIERTO`: si reaparece, se inserta otro.

Sí cambia el catálogo de permisos (`05_permisos_mysql.sql`, autorizado al definir el spec):

| Código | Módulo | Descripción | Roles |
|---|---|---|---|
| `REPORTE_VALIDAR` | `PRODUCCION` | Ejecutar las reglas de validación sobre el reporte en borrador de su establecimiento | ESTABLECIMIENTO |

### Reglas que se ejecutan

Al validar, el motor:

1. Lee la DDRISS del **establecimiento** del reporte.
2. Pide `reglasQueAplican(ddrissCodigo)`: por código, la `VIGENTE` de la DDRISS o, si no hay, la `VIGENTE` nacional (SPEC 32). Sin borradores.
3. Para cada vacuna del reporte (`reporte_vacuna`), ejecuta las reglas de ámbito `VACUNA` y `DETALLE` cuyo `aplica_a.vacunas` contiene su código o `"*"`. Las de ámbito `REPORTE` se ejecutan una vez.
4. Usa la versión del esquema fijada en `reporte_vacuna` (SPEC 22), nunca la vigente.

Una regla con un `tipo` que el motor no conoce se salta y se escribe en `console.error`; no hace fallar la corrida.

### Validadores

Los validadores son funciones puras, sin acceso a la base. Reciben la regla, el esquema de la vacuna, sus celdas válidas (`celdasDelEsquema`, SPEC 23) y lo guardado, y devuelven sus resultados.

| Tipo | Ámbito | Qué produce un resultado | Marcadores |
|---|---|---|---|
| `CAMPOS_COMPLETOS` | `VACUNA` | Con `cero_explicito: true`: hay casillas vacías en la tarjeta A (municipio propio) o en una fila guardada de la tarjeta B (procedencia + dosis + sección con al menos una celda), o campos adicionales `requerido` sin valor. Con `false`: solo los campos adicionales. Un resultado por vacuna. | `n_faltantes`: casillas más campos |
| `NO_NEGATIVO` | `DETALLE` | Una celda con cantidad menor que 0. | `dosis` |
| `DIMENSIONES_VALIDAS` | `DETALLE` | Una celda guardada cuya (dosis, `clave_combinacion`) no está en las celdas válidas de la versión fijada. No revisa si el valor sigue activo en el catálogo. | `dosis`, `version` |
| `PROCEDENCIA_VALIDA` | `DETALLE` | Una celda con una procedencia que ya no está permitida (heredada, SPEC 24), según `procedenciasPermitidas`. | `dosis`, `municipio` |
| `RANGO` | `DETALLE` | Una celda con cantidad menor que `minimo` o mayor que `maximo`. | `dosis`, `valor`, `minimo`, `maximo` |
| `TOTAL_CUADRA` | `VACUNA` | La versión tiene el campo adicional `total_dosis_declarado`, tiene valor, y difiere de la suma del detalle en más de `tolerancia`. Sin el campo o sin valor, nada. | `total`, `suma` |
| `SECUENCIA_DOSIS` | `VACUNA` | Por sección, para cada par de dosis **consecutivas** del esquema que sean `D{n}` activas (sin refuerzos ni `UNICA`), sumando procedencias y las otras dimensiones: la posterior supera a la anterior × (1 + `exceso_permitido_pct` / 100). Un resultado por par y sección. Si la vacuna tiene más de una sección, el mensaje empieza con su título ("< 1 año: …"). | `dosis_anterior`, `dosis_posterior`, `exceso_permitido_pct` |
| `VARIACION_HISTORICA` | `VACUNA` | El promedio de `total_declarado` de la misma vacuna en los `meses_referencia` meses anteriores del mismo establecimiento, contando solo reportes en `ENVIADO`, `EN_REVISION`, `CORRECCION_SOLICITADA`, `APROBADO`, `CERRADO` o `RECTIFICACION` que tengan la vacuna, difiere del total del mes en más de `variacion_max_pct` %. Nada si no hay meses con datos, o si el total del mes y el promedio son ambos menores que `minimo_dosis`. | `variacion` (entero, sin signo), `meses_referencia`, `variacion_max_pct` |
| `SIN_DUPLICADOS` | `REPORTE` | Otro reporte del mismo establecimiento y periodo, o dos celdas del reporte con la misma (vacuna, procedencia, dosis, `clave_combinacion`). | `establecimiento`, `periodo` |

- Los marcadores comunes son `vacuna` (el nombre), `dosis` (la etiqueta de la versión fijada), `municipio` (el nombre, o "Otro departamento o desconocido" para el `9999`), `periodo` ("septiembre de 2026") y `establecimiento` (el nombre). Los parámetros de la regla también son marcadores (`minimo`, `tolerancia`…).
- Un marcador sin valor se reemplaza por "—". El mensaje se corta a 500 caracteres.
- `n_faltantes`, `valor`, `total`, `suma` y `variacion` van como enteros, sin separador de miles.

### Comparar con la corrida anterior

En una transacción (`enTransaccion`), cuya **primera** consulta es `SELECT … FROM reporte_produccion WHERE id = ? FOR UPDATE` (nota del 2026-10-23), para que dos corridas del mismo reporte no se crucen:

1. Lee los resultados `ABIERTO` y `JUSTIFICADO` del reporte.
2. Ejecuta el motor.
3. Un resultado nuevo cuya llave ya existe se conserva: si cambió la `regla_version` o la `severidad`, se actualizan esas dos columnas. No se duplica.
4. Uno nuevo cuya llave no existe se inserta `ABIERTO`.
5. Uno anterior cuya llave ya no aparece pasa a `CORREGIDO` (también un `JUSTIFICADO`).
6. Si hubo inserciones, actualizaciones o correcciones, escribe una fila `VALIDAR` en la bitácora y confirma. Si no, no escribe nada.

La corrida no cambia `version_fila` del reporte: no es una edición de la captura.

### Bitácora

| Escritura | Fila |
|---|---|
| Corrida con cambios | `VALIDAR`, módulo `PRODUCCION`, entidad `reporte_produccion`, `entidad_id` el id del reporte, `valoresNuevos` `{ errores, advertencias, nuevos, actualizados, corregidos }` |

`VALIDAR` se agrega a `ACCIONES` (`auditoria.service.js`). La columna `bitacora.accion` es `VARCHAR(40)`, así que no cambia el modelo.

### Respuesta

`POST /reportes/{id}/validar` (`REPORTE_VALIDAR`), sin cuerpo y sin parámetros de consulta (uno desconocido responde 400). Responde 200 con el esquema `Validacion`, que reemplaza al arreglo del contrato actual:

```json
{
  "validadoEn": "2026-10-30T15:42:10.000Z",
  "errores": 1,
  "advertencias": 2,
  "corregidos": 1,
  "resultados": [
    {
      "id": 412,
      "regla": { "codigo": "CAMPOS_COMPLETOS", "version": 1, "nombre": "Campos completos", "tipo": "CAMPOS_COMPLETOS" },
      "severidad": "ERROR",
      "estado": "ABIERTO",
      "mensaje": "Faltan valores en Hexavalente: 1 combinaciones sin registrar.",
      "vacuna": { "id": 2, "codigo": "HEXA", "nombre": "Hexavalente" },
      "dosis": null,
      "celdas": [
        { "municipioId": 1201, "dosis": "D3", "claveCombinacion": "grupo_edad=MENOR_1" }
      ],
      "campos": []
    }
  ]
}
```

- `resultados` son los actuales: primero los errores y después las advertencias; dentro, en el orden de las vacunas del reporte y luego por código de regla. Los de ámbito `REPORTE` van al final de su severidad.
- `vacuna` es `null` en las de ámbito `REPORTE`. `dosis` es `{ codigo, etiqueta }` cuando el resultado es de una sola dosis (`DETALLE`), y `null` si no.
- `celdas` (las casillas que lo causan) y `campos` (las claves de los campos adicionales que faltan o no cuadran) **solo van en la respuesta**: no se guardan. `municipioId` es el de la procedencia (`9999` incluido). En `SECUENCIA_DOSIS`, `celdas` son las casillas de la dosis posterior en esa sección.
- `regla.nombre` y `regla.tipo` salen del documento de la versión usada.
- `corregidos` es cuántos pasaron a `CORREGIDO` en esta corrida.
- `validadoEn` es el instante de la corrida (de Node), aunque no se haya escrito nada.

`ResultadoValidacion` del contrato se reemplaza por el elemento de `resultados`.

### Errores

Los mismos del `PUT` de la captura (SPEC 23), en el mismo orden de revisión:

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | Id inválido, parámetro de consulta o cuerpo no vacío | los comunes |
| 404 | `NO_ENCONTRADO` | El reporte no existe o no es del establecimiento del usuario | "El recurso solicitado no existe." |
| 409 | `REPORTE_NO_EDITABLE` | El reporte no está en `BORRADOR` | "El reporte ya no está en borrador y no se puede editar." |
| 409 | `PERIODO_CERRADO` | El mes de la DDRISS no está `ABIERTO` ni `EN_CIERRE` (`MESES_EDITABLES`) | "El mes ya está cerrado." |

### Frontend

**`src/api/produccion.js`.** `validarReporte(id)`, sin caché.

**Cuándo valida `CapturaReporte.jsx`.** Solo si el reporte es editable (no `soloLectura`) y el usuario tiene `REPORTE_VALIDAR`:

- al terminar de cargar el reporte;
- después de un «Guardar borrador» exitoso (cuando terminan todos sus `PUT`);
- después de agregar o quitar una vacuna;
- con el botón «Validar de nuevo» del panel.

Una corrida en curso deshabilita «Validar de nuevo». Si llega otra petición mientras tanto, se descarta la respuesta vieja (gana la última).

**Panel «Validación automática» (`paginas/registro/PanelValidacion.jsx`).**

- En pantallas anchas (`xl:`), una columna a la derecha de las pestañas, `sticky`; en angostas, debajo de las pestañas y arriba de la barra de guardar.
- Encabezado «Validación automática», con «Validada a las {hh:mm}» y el botón «Validar de nuevo».
- Un `Alert` por resultado: los errores en rojo (`destructive`) con «Error · impide enviar», y las advertencias en ámbar (`--advertencia` / `--advertencia-foreground`) con «Advertencia». Cada uno muestra el mensaje, la vacuna, la dosis (si hay) y la regla ("Regla Campos completos · CAMPOS_COMPLETOS v1").
- Sin errores: «Sin errores» en verde, con `AvisoExito tono="verde"` (`--exito` / `--exito-foreground`, nuevos en `index.css`), y debajo las advertencias, si hay.
- Pie: "Corrija los errores para poder enviar. Las advertencias no bloquean el envío."
- Si hay cambios sin guardar (`conCambios`), el aviso "Los resultados son de lo guardado. Guarde el borrador para validar los cambios.".
- Mientras carga la primera vez: Skeleton. Si falla: `AvisoError` con `onReintentar`; un fallo no bloquea la captura.
- `corregidos > 0` muestra "{n} resultados corregidos desde la última validación.".

**Casillas.** `FormularioCaptura` y `TarjetaProcedencias` reciben una prop opcional con la severidad por casilla y ponen borde rojo (error) o ámbar (advertencia), con `aria-invalid` en los errores. Si una casilla tiene las dos, gana el error. La vista previa (SPEC 21) no pasa la prop.

**Clic en un resultado.** Abre la pestaña de su vacuna y enfoca la primera de sus casillas (o su primer campo adicional). Un resultado sin casillas ni vacuna no es un botón.

**Pestañas.** Una pestaña con errores muestra un punto rojo (con texto para lectores de pantalla), además del ✓ actual.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                  ← /reportes/{id}/validar con x-permiso, Validacion, ResultadoValidacion nuevo, errores
├── db/05_permisos_mysql.sql                      ← REPORTE_VALIDAR y su asignación
├── src/modulos/auditoria/auditoria.service.js    ← VALIDAR en ACCIONES
├── src/modulos/configuracion/reglas.service.js   ← reglasQueAplican
├── src/modulos/produccion/
│   ├── produccion.routes.js                      ← la ruta
│   ├── produccion.controller.js                  ← el controlador
│   ├── validadores.js                            ← nuevo: un validador puro por tipo y los marcadores
│   └── validacion.service.js                     ← nuevo: lee, ejecuta, compara y escribe
└── tests/
    ├── validadores.test.js                       ← nuevo: casos de cada tipo, sin base
    └── validacion.test.js                        ← nuevo: el endpoint contra las bases de prueba
frontend/src/
├── api/produccion.js                             ← validarReporte
├── index.css                                     ← --exito y --exito-foreground (decidido al implementar)
├── componentes/Avisos.jsx                        ← prop tono en AvisoExito (decidido al implementar)
├── componentes/formulario/FormularioCaptura.jsx  ← severidad por casilla
├── componentes/formulario/TarjetaProcedencias.jsx← severidad por casilla
└── paginas/registro/
    ├── CapturaReporte.jsx                        ← cuándo valida, columna derecha, clic, punto en la pestaña
    ├── CapturaReporte.test.jsx                   ← casos nuevos
    ├── PanelValidacion.jsx                       ← nuevo
    └── PanelValidacion.test.jsx                  ← nuevo
docs/SPECS/HISTORIAS_DE_USUARIO.md                ← avance y criterios de HU-25; nota en HU-26
docs/base-de-datos/CONTEXTO BD.md                 ← la validación en borrador y los estados de resultado_validacion
CLAUDE.md                                         ← nota del motor
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`: `x-permiso: REPORTE_VALIDAR` en `POST /reportes/{id}/validar`, la descripción de cuándo se ejecuta y qué escribe, el esquema `Validacion`, el `ResultadoValidacion` nuevo y un ejemplo por cada error de la tabla. Comprobación: `/api/docs` carga sin errores y muestra la operación.

2. **Permiso.** En `05_permisos_mysql.sql`, un bloque "SPEC 33 (HU-25)" con `REPORTE_VALIDAR` (módulo `PRODUCCION`) asignado a ESTABLECIMIENTO. **Pedir autorización antes de correr el 05** en la base de prueba (con `mysql2` y `multipleStatements`). Comprobación: después del siguiente login, el token del Personal trae `REPORTE_VALIDAR` y el del Revisor no.

3. **Validadores.** `validadores.js` con los nueve tipos y el reemplazo de marcadores. `validadores.test.js` arma esquemas y celdas en memoria (como `celdas.test.js`) y prueba, por tipo, un caso que produce resultado y uno que no:
   - `CAMPOS_COMPLETOS`: una casilla vacía en la tarjeta A; una fila de la tarjeta B con una celda vacía; una combinación de municipio sin fila (no cuenta); un campo `requerido` vacío; `cero_explicito: false`;
   - `RANGO` en el límite (igual al máximo no es resultado);
   - `TOTAL_CUADRA` dentro y fuera de la tolerancia, y sin el campo;
   - `SECUENCIA_DOSIS` por sección, sin contar refuerzos ni dosis inactivas;
   - `VARIACION_HISTORICA` sobre y bajo el umbral, sin historial y bajo `minimo_dosis`;
   - `DIMENSIONES_VALIDAS`, `PROCEDENCIA_VALIDA`, `NO_NEGATIVO` y `SIN_DUPLICADOS` con datos armados a mano;
   - un marcador sin valor y un mensaje de más de 500 caracteres.

   Comprobación: la prueba pasa.

4. **Reglas que aplican.** `reglasQueAplican(ddrissCodigo)` en `reglas.service.js`, con la misma resolución de `listarReglas`. Prueba en `validacion.test.js`: con la `VARIACION_HISTORICA` v2 de `DDRISS_SM`, devuelve esa y no la nacional; un `BORRADOR` no aparece. Comprobación: la prueba pasa.

5. **Backend: endpoint.** `validacion.service.js`, la ruta y el controlador, y `VALIDAR` en `ACCIONES`. Las pruebas de `tests/validacion.test.js` preparan sus datos al inicio y los borran en `afterAll` (antes, los restos de corridas anteriores):
   - en MySQL, por SQL: el año 2019 en `periodo` con sus filas de `cierre_periodo` de `DDRISS_SM`, las vacunas `ZVT_HU25` (con dosis D1 a D3) y `ZVT_HU25B`, reportes de `CS-1201` en `ENVIADO` de los tres meses anteriores (para `VARIACION_HISTORICA`) y el reporte en `BORRADOR` del mes que se valida;
   - en MongoDB: un esquema `VIGENTE` de `ZVT_HU25` con dos secciones y un campo `total_dosis_declarado` requerido, y las reglas `ZVT_HU25_RANGO` y `ZVT_HU25_DUP` (`SIN_DUPLICADOS`) `VIGENTE` de `DDRISS_SM`, con `aplica_a.vacunas` solo de las vacunas de prueba (al implementar se agregaron `ZVT_HU25_NAC`, nacional con una versión de `DDRISS_SM` que la reemplaza, y `ZVT_HU25_OFF`, de `DDRISS_SM` en `HISTORICO`);
   - el token se firma con `tokenDePrueba` para `cs1201`.

   Casos:
   - la primera corrida inserta los resultados `ABIERTO` (`CAMPOS_COMPLETOS`, `TOTAL_CUADRA`, el `RANGO` de prueba) con su `regla_version`, y deja una fila `VALIDAR`;
   - la respuesta trae `vacuna`, `dosis`, `regla` y `celdas`, con los errores primero;
   - una segunda corrida sin cambios no escribe nada ni deja otra fila `VALIDAR`;
   - después de llenar la casilla vacía con el `PUT` (SPEC 23), el resultado de `CAMPOS_COMPLETOS` pasa a `CORREGIDO` (en la prueba también `TOTAL_CUADRA`, porque la suma pasa a cuadrar: `corregidos` es 2) y los demás se conservan;
   - una regla de la DDRISS desactivada (`HISTORICO`, sin nacional) no se ejecuta, y de una nacional reemplazada por la DDRISS solo se ejecuta la versión de la DDRISS;
   - una versión nueva de una regla con el mismo mensaje conserva el resultado y le actualiza la versión;
   - un reporte en `ENVIADO` responde 409 `REPORTE_NO_EDITABLE`, uno de un mes `CERRADO` 409 `PERIODO_CERRADO`, uno de otro establecimiento 404, y un cuerpo no vacío 400;
   - el Revisor de la semilla recibe 403;
   - dos corridas en paralelo dejan una sola fila por llave.

   Comprobación: `npm test` del backend pasa completo.

6. **Frontend: panel.** `validarReporte` en `src/api/produccion.js` y `PanelValidacion.jsx`. Pruebas en `PanelValidacion.test.jsx`:
   - un error y una advertencia se muestran con sus textos de severidad, su vacuna, su dosis y su regla;
   - sin errores se ve «Sin errores» y las advertencias;
   - con cambios sin guardar se ve el aviso;
   - un fallo muestra `AvisoError` y «Reintentar» vuelve a llamar;
   - «Validar de nuevo» llama una vez y queda deshabilitado mientras espera.

   Comprobación: la prueba pasa.

7. **Frontend: captura.** En `CapturaReporte.jsx`, las llamadas a `validarReporte`, la columna derecha, la severidad por casilla en `FormularioCaptura` y `TarjetaProcedencias`, el clic y el punto en la pestaña. Las pruebas existentes que hacen `vi.mock('@/api/produccion.js')` agregan `validarReporte`. Casos nuevos en `CapturaReporte.test.jsx`:
   - al cargar un borrador llama a `validarReporte` una vez; un reporte de solo lectura no la llama ni muestra el panel;
   - sin `REPORTE_VALIDAR` no la llama;
   - después de guardar vuelve a llamarla;
   - la casilla de un error tiene `aria-invalid="true"`;
   - el clic en un resultado de otra vacuna cambia de pestaña y enfoca la casilla.

   Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), como Personal del establecimiento, en un reporte en borrador de un mes abierto:
   - al abrirlo, ver el panel con sus resultados y una fila `VALIDAR` en la bitácora;
   - dejar una casilla vacía y guardar: aparece el error con borde rojo en la casilla, y el clic lleva a ella;
   - llenarla y guardar: el error desaparece y el panel dice "1 resultados corregidos…";
   - con un cambio sin guardar, ver el aviso;
   - revisar por SQL las filas `ABIERTO` y `CORREGIDO` de `resultado_validacion`.

   Como Revisor: `POST /reportes/{id}/validar` responde 403.

   Documentación:
   - en HU-25, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-26, la nota: "El envío llama al motor del SPEC 33 (`validacion.service.js`) con lo guardado y se rechaza si quedan resultados `ERROR` en `ABIERTO`. Las advertencias se envían; justificarlas (`JUSTIFICADO`) queda por decidir.";
   - en `CONTEXTO BD.md`, que la validación también corre en borrador y qué significan `CORREGIDO` y la llave de un resultado;
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial: el motor, la llave, la comparación, `celdas` solo en la respuesta, `REPORTE_VALIDAR`, `TOTAL_CUADRA` contra `total_dosis_declarado` y los datos de prueba (año 2019, `ZVT_HU25*`).

## Criterios de aceptación

- [x] `backend/openapi.yaml` documenta `POST /reportes/{id}/validar` con `x-permiso: REPORTE_VALIDAR`, el esquema `Validacion` y sus errores, y `/api/docs` carga sin errores.
- [x] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas no dejan datos del año 2019 ni `ZVT_HU25…`.
- [x] `frontend/package.json` y `backend/package.json` no cambian, y nada en `backend/db/` cambia salvo `05_permisos_mysql.sql`.
- [x] El motor ejecuta los nueve tipos con las reglas que aplican a la DDRISS del establecimiento, y no ejecuta las desactivadas ni los borradores.
- [x] Se detectan casillas vacías y campos obligatorios sin valor (`CAMPOS_COMPLETOS`), cantidades fuera de rango, un `total_dosis_declarado` que no cuadra con el detalle, y duplicados (`SIN_DUPLICADOS`, con la regla de prueba).
- [x] Cada resultado guarda el código y la versión de la regla, y la respuesta trae la vacuna, la dosis (si es de una sola) y la regla.
- [x] Una corrida sin cambios no escribe en `resultado_validacion` ni en la bitácora; una con cambios deja una sola fila `VALIDAR`.
- [x] Un resultado que deja de aparecer pasa a `CORREGIDO`, y uno que se repite no se duplica.
- [x] Un reporte que no está en `BORRADOR`, o de un mes que no está `ABIERTO` ni `EN_CIERRE`, responde 409; uno de otro establecimiento, 404; sin `REPORTE_VALIDAR`, 403.
- [x] La captura valida al abrir un borrador y después de guardar, agregar o quitar una vacuna, y no valida un reporte de solo lectura.
- [x] El panel muestra los errores en rojo y las advertencias en ámbar, y «Sin errores» en verde cuando no hay errores.
- [x] Las casillas de un error tienen borde rojo y `aria-invalid`, las de una advertencia borde ámbar, y el clic en un resultado lleva a su primera casilla.
- [x] Con cambios sin guardar, el panel avisa que los resultados son de lo guardado.
- [x] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [x] HU-25 tiene su avance y sus criterios marcados, HU-26 su nota, y `CONTEXTO BD.md` y `CLAUDE.md` están actualizados.

## Decisiones

- **Sí:** este spec solo valida; el envío y la transición ENVIAR son de HU-26, que llamará al mismo motor (decidido en la fase de preguntas). **No:** validar y enviar juntos, que toca `transicion_estado` (zona protegida) y duplica el tamaño.
- **Sí:** un validador para cada uno de los nueve tipos (decidido en la fase de preguntas). Una regla que una DDRISS publica sin validador fallaría en silencio. **No:** solo los cuatro de la historia, que dejan sin ejecutar las advertencias de la semilla y las reglas que crea el Administrador.
- **Sí:** cada corrida se compara con la anterior por la llave (`regla_codigo`, `reporte_vacuna_id`, `detalle_id`, `mensaje`): lo que desaparece pasa a `CORREGIDO`, lo que se repite se conserva (decidido en la fase de preguntas). **No:** borrar y reinsertar, que nunca usa `CORREGIDO` y pierde cuándo se detectó cada resultado.
- **Sí:** la llave lleva el `mensaje`, porque `resultado_validacion` no guarda la dosis ni la celda vacía, y dos resultados de la misma regla y vacuna se distinguen por él. Si cambia una cifra del mensaje (de 3 a 2 faltantes), el anterior pasa a `CORREGIDO` y se inserta otro. Decidido al escribir el spec. **No:** la llave sin mensaje, que junta los pares de `SECUENCIA_DOSIS` de una vacuna en un solo resultado.
- **Sí:** la llave no lleva `regla_version`: si el Administrador publica una versión nueva con el mismo mensaje, el resultado se conserva y se le actualiza la versión. Decidido al escribir el spec. **No:** marcarlo `CORREGIDO`, que diría que el Personal corrigió algo que no tocó.
- **Sí:** la captura valida al abrir el borrador y después de guardar, agregar o quitar una vacuna, más un botón (decidido en la fase de preguntas). Siempre sobre lo guardado. **No:** solo con un botón, que no es automático; **no:** dentro del `PUT`, que cambia el contrato de los SPEC 23 y 24 y valida vacuna por vacuna.
- **Sí:** el permiso nuevo `REPORTE_VALIDAR`, solo para el Personal (decidido en la fase de preguntas; autoriza cambiar el 05). **No:** reutilizar `REPORTE_EDITAR`.
- **Sí:** solo en `BORRADOR` y con el mes `ABIERTO` o `EN_CIERRE`, con los errores del `PUT` (decidido en la fase de preguntas; `EN_CIERRE` se agregó al implementar, porque el `PUT` también edita en ese estado). **No:** en cualquier estado, que escribiría resultados sobre un reporte que ya no cambia.
- **Sí:** `TOTAL_CUADRA` compara el campo adicional `total_dosis_declarado` con la suma del detalle; sin ese campo o sin valor, no produce nada (decidido en la fase de preguntas). **No:** una marca de «campo total» en el esquema, que cambia el modelo; **no:** compararlo con `total_declarado`, que es la misma suma.
- **Sí:** una fila `VALIDAR` por corrida que cambia algo, con los conteos (decidido en la fase de preguntas). **No:** una fila en cada corrida, que llenaría la bitácora con la validación al abrir; **no:** sin bitácora, que rompe la regla 7 de `AGENTS.md`.
- **Sí:** `VARIACION_HISTORICA` promedia los reportes del establecimiento que ya salieron de `BORRADOR` (decidido en la fase de preguntas). **No:** solo los `CERRADO`, porque el mes anterior casi nunca está cerrado al capturar el siguiente; **no:** cualquier estado, que mezcla borradores a medias.
- **Sí:** `SECUENCIA_DOSIS` compara dosis `D{n}` consecutivas por sección (decidido en la fase de preguntas), como el «En 1 año…» del mockup. **No:** en total, que pierde la sección; **no:** contra la primera dosis.
- **Sí:** el panel en una columna derecha, como el mockup, y debajo en pantallas angostas (decidido en la fase de preguntas). **No:** arriba de las pestañas o dentro de cada pestaña.
- **Sí:** cada resultado trae sus `celdas` y `campos` solo en la respuesta, para el borde y el clic (decidido en la fase de preguntas). No se guardan porque una celda vacía no tiene `detalle_id`. **No:** marcar solo la pestaña.
- **Sí:** el motor usa la versión del esquema fijada en `reporte_vacuna` y las reglas que aplican en el momento de validar (SPEC 22 y SPEC 32).
- **Sí:** `DIMENSIONES_VALIDAS` revisa las celdas contra la versión fijada, no contra el estado actual del catálogo. Decidido al escribir el spec. Un valor que se desactivó después de crear el reporte no debe bloquear el envío de un dato que el Personal no puede corregir.
- **Sí:** los validadores son funciones puras en `validadores.js`, y el acceso a datos va en `validacion.service.js`, para probar cada tipo sin la base. Decidido al escribir el spec.
- **Sí:** la corrida bloquea la fila del reporte con `FOR UPDATE` como primera consulta, para que dos corridas (dos pestañas) no dupliquen resultados. Decidido al escribir el spec.
- **Sí:** las pruebas usan el año 2019, las vacunas `ZVT_HU25*` y reglas `ZVT_HU25_*` de `DDRISS_SM` con `aplica_a.vacunas` solo de las vacunas de prueba, para no afectar los reportes reales mientras corren. Decidido al escribir el spec.

Decididas al implementar:

- **Sí:** se valida con el mes `ABIERTO` o `EN_CIERRE` (`MESES_EDITABLES` de `captura.service.js`), igual que el `PUT`: lo que se puede capturar se puede validar, y así se corrige un reporte devuelto después de la fecha límite (paso 3). **No:** solo `ABIERTO`, que dejaría el panel con 409 en un reporte que sí se edita.
- **Sí:** en `SECUENCIA_DOSIS`, si la vacuna tiene más de una sección, el motor antepone el título de la sección al mensaje ("< 1 año: 2.ª dosis de Hexavalente supera a 1.ª dosis en más de 20 %."). Sin eso, el mismo par en dos secciones da el mismo mensaje y la misma llave (paso 3). **No:** juntar las secciones en un resultado; **no:** un marcador `{seccion}`, que las reglas de la semilla no usan.
- **Sí:** `SECUENCIA_DOSIS` toma el orden de las dosis de la tabla `dosis` (`orden`), el mismo que muestra la captura (paso 3).
- **Sí:** `VARIACION_HISTORICA` no da resultado si el promedio del historial es 0, porque no hay con qué comparar (paso 3).
- **Sí:** `SIN_DUPLICADOS` da un solo resultado por reporte, con las celdas repetidas de todas las vacunas, y se ejecuta si su `vacunas` incluye alguna vacuna del reporte (paso 3).
- **Sí:** el historial de `VARIACION_HISTORICA` son los `meses_referencia` meses **calendario** anteriores: un mes sin reporte enviado no cuenta, y no se busca uno más atrás. Cada total lleva cuántos meses atrás queda (`{ atras, total }`), porque cada regla puede pedir otro número de meses (paso 5).
- **Sí:** la prueba «regla desactivada» usa una regla de la DDRISS en `HISTORICO` sin nacional. El plan decía «una regla nacional desactivada en la DDRISS», pero según el SPEC 32 desactivar la versión de la DDRISS vuelve a aplicar la nacional (paso 5).
- **Sí:** un id que no es un entero positivo responde 400 ("id debe ser un número entero positivo."), como dice la tabla de errores; el `PUT` de la captura responde 404 en ese caso (paso 5).
- **Sí:** `dosis.etiqueta` sale de la versión fijada del esquema y, si no la tiene, del `nombre` de la tabla `dosis` (paso 5).
- **Sí:** una vacuna del reporte cuyo esquema ya no está en MongoDB no se revisa, porque no tiene celdas válidas (paso 5).
- **Sí:** el «Sin errores» va en verde con una pareja nueva de variables, `--exito` (#e3f3e8) y `--exito-foreground` (#1e5b34), en `index.css`, y la prop `tono` de `AvisoExito` (`"marca"`, el celeste de siempre y el valor por defecto, o `"verde"`). El spec decía `--estado-aprobado`, que es azul, y el tema no tenía ningún verde. Decidido con el equipo para dar más color al diseño: un mensaje que debe resaltar usa `tono="verde"` (paso 6). **No:** un componente `AvisoExito2`, que duplica el aviso; **no:** el celeste de `AvisoExito`, que no se distingue de los demás avisos.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La validación al abrir y tras guardar suma una petición pesada (Mongo + MySQL) a cada guardado | Una sola corrida por evento, descartando respuestas viejas; si tarda, la captura sigue usable y el panel muestra su carga. |
| Una regla `VIGENTE` con parámetros que no cumplen `tiposRegla.js` (cargada a mano) rompe la corrida | El validador lee los parámetros del tipo; un tipo desconocido se salta con `console.error`. Las reglas creadas por la API ya se validan (SPEC 32). |
| Una corrida falla después de marcar `CORREGIDO` y antes de insertar | Todo va en una sola `enTransaccion`; si algo falla, se deshace completa. |
| `VARIACION_HISTORICA` da advertencias falsas con poco historial | `minimo_dosis` y «sin meses con datos, nada» lo limitan; es advertencia y no bloquea. |
| HU-26 implementa el envío con otro motor o sin comparar resultados | La nota en HU-26 y la de `CLAUDE.md` fijan que se reutiliza `validacion.service.js`. |
| El campo `total_dosis_declarado` queda fijo en el código | Es el único campo de total del 5C; otro nombre pide un cambio en `validadores.js` y se anota en `CLAUDE.md`. |
| Las pruebas insertan reglas `VIGENTE` de `DDRISS_SM` en Atlas mientras corren | Solo aplican a las vacunas `ZVT_HU25*` y se borran al inicio y al final. |
| Los permisos nuevos no llegan al token | Se corre el 05 con autorización en el paso 2 y se vuelve a iniciar sesión antes de probar. |

## Lo que **no** entra en este spec

- Enviar el reporte y la transición ENVIAR (HU-26).
- Justificar advertencias.
- Ver los resultados como revisor o en la bandeja, y un `GET` de resultados.
- Validar fuera de `BORRADOR` o validar lo que está sin guardar.
- La tarjeta de validaciones del Inicio.
- Tipos de regla nuevos.
- Cambios al modelo de datos o a las semillas.

Cada uno, si se hace, va en su propio spec.
