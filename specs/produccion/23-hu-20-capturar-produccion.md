# SPEC 23 — Capturar la producción con el formulario dinámico

> **Estado:** Implementado
> **Historia:** HU-20
> **Depende de:** SPEC 04, SPEC 05, SPEC 06, SPEC 15, SPEC 18, SPEC 19, SPEC 20, SPEC 21, SPEC 22
> **Fecha:** 2026-10-25
> **Objetivo:** Que el Personal de establecimiento llene en `/registro`, con el formulario generado desde la versión de esquema fijada en su reporte, las dosis aplicadas a residentes de su municipio por vacuna, y las guarde en `detalle_produccion` y `detalle_dimension` mientras el reporte está en Borrador.

## Por qué existe este spec

HU-20 es la primera historia que escribe cantidades. Las anteriores dejaron casi todo listo:

- SPEC 21 creó `armarFormulario` y `FormularioCaptura` (`frontend/src/componentes/formulario/`), con la `claveCombinacion` de cada celda y los totales.
- SPEC 22 fijó las vacunas y la versión del esquema al crear el reporte (`reporte_vacuna`), y `GET /reportes/{id}` ya trae los nombres de las dosis (con `activa`) y las etiquetas de las dimensiones de esa versión.

Falta lo que dice el «Cómo se hará» de la historia: `GET /reportes/{id}/formulario`, que trae el contenido del esquema y las cantidades guardadas, y guardar en `detalle_produccion` y `detalle_dimension`. El guardado (`PUT /reportes/{id}/vacunas/{vacunaId}`) entra aquí aunque HU-22 lo nombra: sin él no se puede comprobar la carga de cantidades ni la regla de las dosis inactivas. A HU-22 le queda el aviso de cambios sin guardar.

También se cierra el criterio que HU-19 trasladó: una **dosis inactiva** no aparece en un reporte, salvo que ese reporte ya tenga cantidades de ella.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- **Procedencia.** La historia habla de la producción en general. Aquí solo se capturan las dosis aplicadas a **residentes del municipio del establecimiento** (la tarjeta A del mockup). Las de otros municipios y Migrantes (la tarjeta B) son de HU-21.
- **Guardar** es de HU-22 según su «Cómo se hará», pero entra aquí, como dice el «Cómo se hará» de HU-20 (decidido en la fase de preguntas).
- **«Del esquema vigente»:** el formulario usa la versión fijada en el reporte (SPEC 22), aunque después se publique otra.
- **Total declarado.** El total no lo escribe el Personal: el backend guarda en `reporte_vacuna.total_declarado` la suma de las cantidades de la vacuna en cada guardado (decidido en la fase de preguntas).

## Alcance

**Entra:**

- `GET /reportes/{id}/formulario`: por cada vacuna del reporte, el contenido de su versión de esquema, sus celdas guardadas, sus datos adicionales y su total, más si el reporte se puede editar y el municipio propio.
- `PUT /reportes/{id}/vacunas/{vacunaId}`: reemplaza las celdas del municipio propio de esa vacuna y sus datos adicionales, y recalcula `total_declarado`. Valida contra el esquema y escribe `detalle_produccion` y `detalle_dimension` en una sola transacción con su fila en la bitácora.
- `backend/src/modulos/produccion/celdas.service.js`: las celdas válidas de un esquema con la misma regla que `armarFormulario`, incluida la deducción de secciones de una versión sin `secciones` (Hexavalente v1).
- El permiso nuevo `REPORTE_EDITAR` en `05_permisos_mysql.sql`, solo para `ESTABLECIMIENTO`. Es zona protegida y quedó autorizada en la fase de preguntas.
- En `/registro`, la captura de cada pestaña de vacuna:
  - la tarjeta «Dosis aplicadas a residentes de {municipio}»;
  - las cantidades guardadas;
  - los campos adicionales;
  - un botón «Guardar borrador» general;
  - en un reporte que no se puede editar, el formulario en solo lectura.
- `FormularioCaptura` y `CamposAdicionales` aceptan valores controlados desde afuera y un modo `soloLectura`, sin cambiar la vista previa del SPEC 21.
- Las dosis inactivas se ocultan salvo que el reporte tenga cantidades de ellas, en la pantalla y en el `PUT`.
- Pruebas de backend (`captura.test.js`, `celdas.test.js`) y de frontend.
- Verificación manual con Playwright sobre el reporte 287 de `cs1201`.
- La documentación:
  - el avance y los criterios de HU-20;
  - las notas en HU-10, HU-19, HU-21, HU-22 y HU-25;
  - una nota en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- La tarjeta B, que registra la procedencia de otros municipios y Migrantes (HU-21). El `PUT` responde 422 a una celda con otro municipio, y no toca las celdas de otras procedencias que ya existen.
- El aviso al salir con cambios sin guardar (HU-22).
- Ejecutar las reglas de validación y el panel «Validación automática» (HU-24 y HU-25). Que un campo «obligatorio» o una celda vacía impidan **enviar** es de HU-25: aquí no impiden guardar el borrador.
- Enviar a revisión y cualquier transición (HU-26 y siguientes). `transicion_estado` no se toca.
- El resumen del mockup («Vacunas completas», «Dosis a otros municipios») y las marcas ✓ de las pestañas.
- Mostrar las observaciones del revisor junto al formulario (HU-29).
- Capturar desde la DDRISS para otro establecimiento, y `REPORTE_EDITAR` para otros roles.
- Cambios al modelo (`01`, `02`) o a las semillas (`03`, `04`).

## Modelo de datos

Este spec **no cambia el modelo**. Escribe en tablas que ya existen en el 01:

```sql
detalle_produccion (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion, cantidad, actualizado_por)
                                                              -- uq_detalle (reporte_vacuna_id, dosis_id, municipio_procedencia_id, clave_combinacion)
detalle_dimension  (detalle_id, dimension_codigo, valor_codigo)   -- una fila por dimensión de la celda
reporte_vacuna     (datos_adicionales JSON, total_declarado)       -- se actualizan en cada guardado
reporte_produccion (version_fila + 1, actualizado_en)              -- control de concurrencia optimista
bitacora           (modulo = 'PRODUCCION', accion = 'ACTUALIZAR', entidad = 'reporte_vacuna')
```

Lee `reporte_produccion`, `cierre_periodo` (estado del mes en la DDRISS del establecimiento), `establecimiento` (municipio propio), `dosis`, `esquemas_captura` (la versión de `reporte_vacuna.esquema_mongo_id`) y `catalogo_dimensiones`. No escribe en MongoDB.

### Celdas y combinaciones

- **Una celda** es una cantidad por (dosis, municipio de procedencia, combinación de dimensiones).
- **Vacía ≠ 0** (decidido en la fase de preguntas):
  - una celda vacía no tiene fila en `detalle_produccion`;
  - una celda con 0 tiene fila con `cantidad = 0`;
  - al recargar, cada una vuelve como estaba, y así HU-25 distingue «no hubo» de «no llenó»;
  - en pantalla los totales cuentan la vacía como 0, como en el SPEC 21;
  - en la tarjeta B (HU-21) vale lo mismo, pero solo en las filas que agrega el Personal: un municipio sin fila no pide ceros.
- **`clave_combinacion`** sigue la regla de `CONTEXTO BD.md`: las dimensiones ordenadas por código, `codigo=valor` unidas con `|`, y `''` si la vacuna no desagrega. Incluye `grupo_edad` si la sección tiene un `grupoEdad`. La calcula el backend a partir de `dimensiones`, y las filas de `detalle_dimension` son exactamente esas mismas dimensiones.
- **Celdas válidas** (`celdas.service.js`) se calculan con la misma regla que `armarFormulario`:
  - cada dosis del esquema que está en la vacuna (tabla `dosis`), por cada sección que la incluye, por el producto de los valores de su desagregación (la propia o la general) sin `grupo_edad`;
  - lo que no está en el catálogo se omite;
  - una versión sin `secciones` las deduce como `deducirSecciones` (una por valor de `grupo_edad` en el orden del catálogo, con las dosis que lo admiten; sin `grupo_edad`, una sola con todas las dosis);
  - la regla está duplicada en el frontend (`armarFormulario.js`) y en el backend (`celdas.service.js`), y `celdas.test.js` repite los casos de `armarFormulario.test.js`: un cambio va en los dos.
- **Procedencia:** en este spec, toda celda del `PUT` lleva el `municipio_id` del establecimiento.

### Dosis inactivas

Una dosis con `activa = FALSE` en la tabla `dosis`:

- **en pantalla**, se oculta de las tablas, salvo que el reporte ya tenga alguna fila de esa dosis en esa vacuna, de cualquier procedencia;
- **en el `PUT`**, se acepta solo si el reporte tenía filas de esa dosis **antes** del guardado. Si no, responde 422. Si el Personal vacía todas sus celdas, al recargar la dosis desaparece.

### Datos adicionales y total

- **`datos_adicionales`** guarda los `camposAdicionales` del esquema como `{ clave: valor }`. Solo van las claves con valor, y sin ninguna queda `NULL`. Cada valor se valida por su tipo:
  - `entero`: un entero dentro de `minimo` y `maximo`;
  - `decimal`: un número dentro de `minimo` y `maximo`;
  - `texto`: un texto de 1 a 200 caracteres, sin los espacios de los extremos;
  - `booleano`: `true` o `false`;
  - `lista`: una de sus `opciones`.

  Una clave que no es del esquema responde 422. `requerido` no impide guardar el borrador: lo exige la validación (HU-25).
- **`total_declarado`** = la suma de `cantidad` de todas las filas de la vacuna después del guardado, de todas las procedencias. Queda `NULL` si la vacuna no tiene filas.

### Permisos

| Código | Módulo | Rol |
|---|---|---|
| `REPORTE_EDITAR` | `PRODUCCION` | `ESTABLECIMIENTO` |

Se agrega de forma idempotente en `05_permisos_mysql.sql` y aplica desde el siguiente inicio de sesión. `GET /reportes/{id}/formulario` usa `REPORTE_CONSULTAR`, que ya existe.

### Endpoints

| Método y ruta | Permiso | Qué hace |
|---|---|---|
| `GET /reportes/{id}/formulario` | `REPORTE_CONSULTAR` | Esquemas y cantidades de todas las vacunas del reporte; 404 si no existe o está fuera del alcance |
| `PUT /reportes/{id}/vacunas/{vacunaId}` | `REPORTE_EDITAR` | Guarda las celdas del municipio propio y los datos adicionales de una vacuna |

### Respuestas

`GET /reportes/{id}/formulario` (200):

```json
{
  "reporteId": 287,
  "versionFila": 3,
  "editable": true,
  "municipioPropio": { "id": 1, "nombre": "San Marcos" },
  "vacunas": [
    {
      "vacunaId": 2,
      "esquema": { "id": "6717…", "version": 2, "estado": "VIGENTE", "vigencia": { "desde": "2026-10-01", "hasta": null },
                   "procedencia": { "modo": "MUNICIPIO_DETALLADO", "permiteNoEspecificado": true },
                   "dosis": [{ "codigo": "D1", "etiqueta": "1.ª dosis", "desagregacion": null }],
                   "desagregacion": [{ "dimension": "grupo_edad", "valores": ["MENOR_1", "1_A_5"], "etiqueta": null }],
                   "secciones": [{ "codigo": "MENOR_1", "titulo": "< 1 año", "orden": 1, "grupoEdad": "MENOR_1", "dosis": ["D1", "D2", "D3"] }],
                   "camposAdicionales": [{ "clave": "total_dosis_declarado", "etiqueta": "Total de dosis aplicadas…", "tipo": "entero", "requerido": true, "minimo": 0, "maximo": null }],
                   "reglas": [{ "codigo": "CAMPOS_COMPLETOS", "version": 1, "severidadOverride": null }] },
      "celdas": [
        { "dosisCodigo": "D1", "municipioProcedenciaId": 1, "dimensiones": { "grupo_edad": "MENOR_1" },
          "claveCombinacion": "grupo_edad=MENOR_1", "cantidad": 78 }
      ],
      "datosAdicionales": { "total_dosis_declarado": 160 },
      "totalDeclarado": 82
    }
  ]
}
```

- `esquema` tiene la forma de `GET /esquemas-captura/{id}` y reutiliza `aEsquema` de `esquemas.service.js`, sin `publicacion` ni `auditoria`. Si el documento ya no está en MongoDB, la vacuna va con `esquema: null` y sus celdas, y la pantalla avisa que no se puede dibujar.
- `celdas` trae **todas** las filas de la vacuna, de cualquier procedencia, ordenadas por dosis y clave. La pantalla de este spec solo dibuja las del municipio propio.
- `editable` es `true` solo si el reporte está en `BORRADOR` y el mes está `ABIERTO` o `EN_CIERRE` en la DDRISS del establecimiento.
- `vacunas` va en el mismo orden que `GET /reportes/{id}`. Las etiquetas de las dosis y de las dimensiones no se repiten aquí: siguen saliendo de `GET /reportes/{id}`.
- Se lee cada esquema una sola vez por petición (`find` con `_id: { $in }`).

`PUT /reportes/{id}/vacunas/{vacunaId}`, cuerpo:

```json
{
  "versionFila": 3,
  "celdas": [
    { "dosisCodigo": "D1", "municipioProcedenciaId": 1, "dimensiones": { "grupo_edad": "MENOR_1" }, "cantidad": 78 },
    { "dosisCodigo": "D2", "municipioProcedenciaId": 1, "dimensiones": { "grupo_edad": "MENOR_1" }, "cantidad": 0 }
  ],
  "datosAdicionales": { "total_dosis_declarado": 160 }
}
```

- `celdas` son **todas** las celdas con valor del municipio propio de esa vacuna. Lo que no viene se borra, y una celda vacía simplemente no se manda.
- `datosAdicionales` es opcional. Si falta, se guarda `NULL`.
- `totalDeclarado` sale del contrato provisional: lo calcula el backend, y si viene en el cuerpo responde 400.
- Respuesta 200: `{ "versionFila": 4, "vacuna": { … } }`, donde `vacuna` es el elemento de `GET /reportes/{id}/formulario` ya actualizado. Si nada cambió, no se escribe nada, no se registra en la bitácora y `versionFila` sigue igual.

### Errores del `PUT`

Se revisan en este orden:

| Caso | Respuesta |
|---|---|
| Cuerpo mal formado: falta `versionFila` o `celdas`, hay un campo desconocido (incluido `totalDeclarado`), una celda mal formada, o una `cantidad` que no es un entero de 0 a 4 294 967 295 | 400 `ENTRADA_INVALIDA` |
| El reporte no existe o está fuera del alcance, o la vacuna no está en el reporte | 404 `NO_ENCONTRADO` |
| El reporte no está en `BORRADOR` | 409 `REPORTE_NO_EDITABLE` |
| El mes no está `ABIERTO` ni `EN_CIERRE` en la DDRISS del establecimiento | 409 `PERIODO_CERRADO` |
| `versionFila` no es la del reporte | 409 `REPORTE_DESACTUALIZADO` |
| Una celda no corresponde al esquema: la dosis no está en el esquema o en la vacuna, la combinación no existe, sobra o falta una dimensión, la procedencia no es el municipio propio, o la dosis está inactiva sin filas previas | 422 `CELDA_INVALIDA` |
| Dos celdas con la misma dosis, procedencia y dimensiones | 422 `CELDA_REPETIDA` |
| Un dato adicional que no es del esquema o que no cumple su tipo, mínimo, máximo u opciones | 422 `DATO_ADICIONAL_INVALIDO` |

Los mensajes van en español, sin datos internos, y nombran el primer problema:

- «El reporte ya no está en borrador y no se puede editar.»
- «El mes ya está cerrado.»
- «El reporte cambió desde que lo abrió; recárguelo.»
- «La celda 3.ª dosis · < 1 año no es parte del formulario.»
- «La celda … está repetida.»
- «El dato «…» no es válido.»

### Transacción del `PUT`

1. **Fuera de la transacción:**
   - validar el cuerpo (400);
   - leer el reporte con su alcance y la fila de `reporte_vacuna` (404);
   - leer el esquema de `esquema_mongo_id`, el catálogo de las dimensiones que usa y las dosis de la vacuna;
   - calcular las celdas válidas y validar las celdas y los datos adicionales, salvo la regla de las dosis inactivas (422).

   La versión del reporte no cambia, así que leerla antes es seguro.
2. **Dentro de `enTransaccion`**, la **primera** consulta es `SELECT … FROM reporte_produccion WHERE id = ? FOR UPDATE` (nota del 2026-10-23 sobre REPEATABLE READ). Después, en orden:
   - el estado del reporte (409 `REPORTE_NO_EDITABLE`);
   - `cierre_periodo` (409 `PERIODO_CERRADO`);
   - `versionFila` (409 `REPORTE_DESACTUALIZADO`).
3. **Leer las filas actuales** de la vacuna con sus dimensiones y aplicar la regla de las dosis inactivas (422).
4. **Comparar** con lo pedido:
   - las celdas del municipio propio que ya no vienen se borran (`detalle_dimension` cae por `ON DELETE CASCADE`);
   - las que cambian de cantidad se actualizan;
   - las nuevas se insertan con sus filas de `detalle_dimension`.

   Las de otras procedencias no se tocan.
5. **Si algo cambió:**
   - se actualizan `datos_adicionales` y `total_declarado`, y `version_fila = version_fila + 1`;
   - `registrarBitacora(conexion, { …contextoAuditoria(req), modulo: MODULOS.PRODUCCION, accion: ACCIONES.ACTUALIZAR, entidad: 'reporte_vacuna', … })` lleva `diferencias(antes, despues)`.

   Los dos objetos son planos:
   - una clave `celda:{dosis}|{procedenciaId}|{clave_combinacion}` → cantidad por celda;
   - `datosAdicionales`;
   - `totalDeclarado`.

   Si `diferencias` da `null`, no se escribe nada y se responde con la misma `versionFila`.

### Pantalla `/registro`

Referencia: la tarjeta A de `docs/mockups/pantallas/Registro.html` y `Registro-Td.html` (pantallas 4 y 4b de `descripcion_pantallas.md`), sin la tarjeta B, el panel de validación, el resumen ni «Enviar a revisión».

- **Carga.** Con el reporte de `GET /reportes/{id}`, la pantalla pide `GET /reportes/{id}/formulario`. Mientras carga, se ve un Skeleton.
- **Componente.** La captura va en `paginas/registro/CapturaReporte.jsx`. `PaginaRegistro.jsx` conserva el encabezado, el mes y los pasos, y monta la captura en lugar del texto «La captura de esta vacuna se habilita con el formulario de registro.».
- **Pestaña de cada vacuna:**
  - la franja «Dimensiones de este esquema:» del SPEC 22;
  - la tarjeta «Dosis aplicadas a residentes de {municipio}», con el subtítulo «Formulario generado por el esquema de captura: {vacuna}, versión {n}, vigente desde {DD/MM/AAAA}»;
  - las tablas de `FormularioCaptura`, armadas con `armarFormulario`, que recibe:
    - `contenido = contenidoDe(esquema)`;
    - `vacuna` con las dosis de `GET /reportes/{id}`, sin las inactivas que no tienen filas;
    - `dimensiones` de `GET /reportes/{id}`;
    - `deducirSecciones: true`;
  - la card «Datos adicionales» con `CamposAdicionales`, solo si el esquema trae campos.
- **Estado.** Las cantidades de todas las pestañas viven en un estado de `CapturaReporte`, con la llave `{dosis}|{claveCombinacion}` de `FormularioCaptura`. Cambiar de pestaña no las pierde. Se cargan con las celdas del municipio propio, y 0 se ve como «0».
- **«Guardar borrador»** va al pie, fuera de las pestañas, solo si `editable`:
  - Se deshabilita si no hay cambios o si alguna celda tiene un valor inválido. En el segundo caso, la nota dice «Corrija las cantidades marcadas para guardar.».
  - Manda un `PUT` por cada vacuna con cambios, uno tras otro, y cada uno usa la `versionFila` que devolvió el anterior.
  - Las celdas vacías no se mandan, y cada celda lleva `municipioProcedenciaId` = el municipio propio.
  - Al terminar, se muestra «Borrador guardado.» y las vacunas guardadas pasan a ser la nueva base.
  - Si un `PUT` falla, se detiene y muestra en un Alert la vacuna y el mensaje del backend. Las anteriores quedan guardadas.
  - Un 409 `REPORTE_DESACTUALIZADO` o `REPORTE_NO_EDITABLE` ofrece «Recargar reporte», que vuelve a pedir todo y descarta los cambios.
- **Solo lectura** (`editable: false`, por ejemplo septiembre `APROBADO` de la semilla con Hexavalente v1):
  - las mismas tablas con las cantidades guardadas, los campos deshabilitados y sin «Guardar borrador»;
  - la nota «Este reporte no se puede editar en su estado actual.».
- **Esquema que falta** (`esquema: null`): en la pestaña, «No se encontró el formulario de esta vacuna.».
- **Componentes.** `FormularioCaptura` recibe las props opcionales `cantidades`, `alCambiar` y `soloLectura`. Sin ellas, guarda su propio estado como hoy, así que la vista previa del SPEC 21 no cambia. `CamposAdicionales` recibe `valores`, `alCambiar` y `soloLectura` de la misma forma.
- Se usan componentes de shadcn que ya están en `components/ui/` (Tabs, Card, Button, Alert, Skeleton, Input, Switch, Select). No se agregan dependencias.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← GET /reportes/{id}/formulario y PUT /reportes/{id}/vacunas/{vacunaId}
│                                                    completos; esquemas FormularioReporte, VacunaDeFormulario, Celda
│                                                    (+ claveCombinacion de solo lectura); sin totalDeclarado en el cuerpo
├── db/05_permisos_mysql.sql                       ← REPORTE_EDITAR para ESTABLECIMIENTO
├── src/modulos/produccion/
│   ├── produccion.routes.js                       ← las dos rutas
│   ├── produccion.controller.js                   ← los dos controladores
│   ├── captura.service.js                         ← nuevo: obtenerFormulario, guardarVacuna
│   └── celdas.service.js                          ← nuevo: celdas válidas de un esquema
├── src/modulos/configuracion/esquemas.service.js  ← exporta aEsquema (si no lo está)
└── tests/
    ├── celdas.test.js                             ← nuevo
    └── captura.test.js                            ← nuevo
frontend/src/
├── api/produccion.js                              ← obtenerFormulario, guardarVacuna
├── componentes/formulario/
│   ├── FormularioCaptura.jsx                      ← cantidades, alCambiar y soloLectura opcionales (también CamposAdicionales)
│   └── FormularioCaptura.test.jsx                 ← casos nuevos
└── paginas/registro/
    ├── CapturaReporte.jsx                         ← nuevo
    ├── CapturaReporte.test.jsx                    ← nuevo
    ├── PaginaRegistro.jsx                         ← monta CapturaReporte
    └── PaginaRegistro.test.jsx                    ← ajuste del texto que reemplaza
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance y criterios de HU-20; notas en HU-10, HU-19, HU-21, HU-22 y HU-25
CLAUDE.md                                          ← nota de la captura
```

## Plan de implementación

1. **Contrato y permiso.**
   - En `openapi.yaml`, los dos endpoints con sus cuerpos, respuestas, errores y `x-permiso`.
   - En `05_permisos_mysql.sql`, `REPORTE_EDITAR` para `ESTABLECIMIENTO`.
   - Correr el 05 contra Aiven (idempotente) **con aprobación explícita**.

   Comprobación: `/api/docs` muestra los endpoints, y `permisos.test.js` pasa.

2. **`celdas.service.js`.** La función que da las celdas válidas de un esquema (dosis, dimensiones y `claveCombinacion`). Sus pruebas en `celdas.test.js` repiten los casos de `armarFormulario.test.js`:
   - Hexavalente v2: dos secciones, D1 a D3;
   - VPH por sexo;
   - BCG con clave `''`;
   - una dosis con desagregación propia;
   - una dosis fuera de una sección;
   - dos dimensiones además de la edad;
   - lo que no está en el catálogo se omite;
   - Hexavalente v1 sin secciones, deducidas.

   Comprobación: `celdas.test.js` pasa y da las mismas claves que `armarFormulario` en cada caso.

3. **`GET /reportes/{id}/formulario`.** Servicio, controlador y ruta. Las pruebas (`captura.test.js`):
   - **Datos.**
     - Firman el token de `cs1201` y usan el año 2023. Crean sus meses en `periodo` y sus filas en `cierre_periodo` de la DDRISS 1, y los borran al inicio y al final, con sus reportes.
     - Usan dos vacunas, que se insertan en MySQL y en MongoDB y se borran:
       - `ZVT_HU20`, con un esquema con secciones, `sexo` en una dosis y un campo adicional de cada tipo;
       - `ZVT_HU20S`, con un esquema sin `secciones`.
     - Las filas de la bitácora quedan.
   - **Casos.**
     - un reporte recién creado trae los dos esquemas, `celdas: []`, `datosAdicionales: null`, `totalDeclarado: null`, `editable: true` y el municipio de `CS-1201`;
     - con filas insertadas por SQL (una de otra procedencia), las trae todas con su `claveCombinacion`;
     - en `ENVIADO` o con el mes `CERRADO`, `editable: false`;
     - `cs1202` recibe 404, y el Revisor 403.

   Comprobación: `captura.test.js` pasa.

4. **`PUT /reportes/{id}/vacunas/{vacunaId}`: guardar.** Casos:
   - guarda celdas con 78 y con 0: las dos tienen fila, con su `detalle_dimension` coherente con la clave, y una celda omitida no tiene fila;
   - un segundo `PUT` sin la celda de 0 la borra, y uno que cambia una cantidad la actualiza;
   - `total_declarado` es la suma, incluida la fila de otra procedencia, que no se toca;
   - `datos_adicionales` guarda solo las claves con valor;
   - `version_fila` sube en 1, y hay una fila `ACTUALIZAR` con solo las celdas que cambiaron;
   - repetir el mismo `PUT` no escribe nada, no deja fila en la bitácora y no sube `versionFila`;
   - un esquema sin `secciones` (`ZVT_HU20S`) acepta las celdas deducidas.

   Comprobación: `captura.test.js` pasa.

5. **`PUT`: errores y dosis inactivas.** Casos:
   - **400:** `totalDeclarado` en el cuerpo, una cantidad de `-1`, `2.5` o `"7"`, y un campo desconocido;
   - **404:** una vacuna que no está en el reporte;
   - **409:**
     - `REPORTE_NO_EDITABLE`, con el estado cambiado por SQL;
     - `PERIODO_CERRADO`, con `cierre_periodo` en `CERRADO`;
     - `EN_CIERRE` sí guarda;
     - `REPORTE_DESACTUALIZADO`, con una `versionFila` vieja, y dos `PUT` en paralelo con la misma versión dan un 200 y un 409;
   - **422:**
     - `CELDA_INVALIDA` con una dosis fuera del esquema, una combinación inexistente, una dimensión de más y otro municipio de procedencia;
     - `CELDA_REPETIDA`;
     - `DATO_ADICIONAL_INVALIDO` con una clave desconocida, un entero fuera de rango y una opción que no está en la lista;
   - **dosis inactiva:**
     - desactivada antes de tener filas, responde 422;
     - con filas previas, se acepta;
     - al vaciarla, se borra, y un `PUT` siguiente con ella da 422.

   Comprobación: `captura.test.js` pasa. Después, la suite completa del backend.

6. **`FormularioCaptura` controlado.** Las props `cantidades`, `alCambiar` y `soloLectura` en `FormularioCaptura` y `valores`, `alCambiar` y `soloLectura` en `CamposAdicionales`. Pruebas nuevas:
   - con valores controlados, muestra los valores recibidos y llama a `alCambiar`;
   - en `soloLectura`, los campos están deshabilitados;
   - sin las props, se comporta como antes.

   Comprobación: `FormularioCaptura.test.jsx` y `VistaPreviaEsquema.test.jsx` pasan sin cambios en sus casos anteriores.

7. **`CapturaReporte` en `/registro`.** `api/produccion.js` y `CapturaReporte.jsx`, con pruebas con `vi.mock` sobre `src/api/`:
   - carga las cantidades guardadas, y un 0 se ve como «0» y una vacía, vacía;
   - una dosis inactiva sin filas no aparece, y con filas sí;
   - cambiar de pestaña conserva lo escrito;
   - «Guardar borrador»:
     - está deshabilitado sin cambios y con una celda inválida;
     - llama a `guardarVacuna` solo por las vacunas con cambios, en orden y con la `versionFila` encadenada;
     - el cuerpo no lleva las vacías, lleva el 0 y el municipio propio, y lleva los datos adicionales;
   - un 422 muestra la vacuna y su mensaje, y un 409 `REPORTE_DESACTUALIZADO` ofrece «Recargar reporte»;
   - con `editable: false`, no hay botón, los campos están deshabilitados y se ve la nota;
   - con `esquema: null`, se ve el aviso de la pestaña.

   Comprobación: `npm test` del frontend pasa completo.

8. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), con `cs1201`:
   - **Reporte 287** (octubre de 2026, Hexavalente v2):
     - escribir cantidades en Hexavalente, VPH y Td, con algún 0 y alguna vacía;
     - guardar y recargar: siguen igual;
     - revisar en la base `detalle_produccion`, `detalle_dimension`, `total_declarado` y la fila `ACTUALIZAR`;
     - escribir `2.5` y ver «Guardar borrador» deshabilitado.

     Las cantidades quedan guardadas para HU-21, HU-22 y HU-25.
   - **Septiembre** (`APROBADO`, Hexavalente v1): el formulario en solo lectura con las cantidades de la semilla, con sus secciones deducidas.

   Documentación:
   - en HU-20, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-10 y HU-19, una línea que diga que la parte de las dosis inactivas se cumplió en el spec 23, y marcar ese criterio en HU-19;
   - en HU-21, la nota:
     - el `PUT` de HU-20 solo acepta el municipio propio y no toca las demás procedencias;
     - HU-21 lo extiende para reemplazar también las celdas que maneje la tarjeta B;
     - `GET /reportes/{id}/formulario` ya trae todas las celdas;
     - la diferencia entre vacía y 0 también vale en la tarjeta B, dentro de cada fila que agrega el Personal; una procedencia que no se agregó no tiene filas;
   - en HU-22, la nota: guardar, retomar y «solo en Borrador» ya los cumple el spec 23, y queda el aviso de cambios sin guardar;
   - en HU-25, la nota:
     - vacía ≠ 0, y vacía no tiene fila;
     - `CAMPOS_COMPLETOS` revisa todas las celdas de la tarjeta A y, en la B, solo las de las filas agregadas, nunca combinaciones de municipios sin fila;
     - `total_declarado` lo calcula el backend;
     - el campo adicional `total_dosis_declarado` de Hexavalente v2 sigue en esa versión, que no se edita: quitarlo pide publicar otra;
     - `requerido` no impide guardar el borrador;
   - en «Notas de contexto» de `CLAUDE.md`, una nota con lo esencial:
     - la captura en `captura.service.js`;
     - la regla de celdas duplicada en `celdas.service.js` y `armarFormulario.js`;
     - vacía ≠ 0;
     - el `PUT` solo reemplaza el municipio propio;
     - `versionFila`;
     - las pruebas usan `cs1201`, el año 2023 y las vacunas `ZVT_HU20*`.

## Criterios de aceptación

- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba.
- [ ] `backend/db/01`, `02`, `03` y `04`, `transicion_estado` y los dos `package.json` no cambian.
- [ ] El formulario de cada vacuna muestra solo las dosis y las dimensiones de la versión de esquema fijada en el reporte: sexo solo en las vacunas que lo usan y la presentación de Polio en sus secciones.
- [ ] Una dosis inactiva no aparece en el formulario, salvo que el reporte ya tenga filas de ella. El `PUT` responde 422 a una dosis inactiva sin filas previas.
- [ ] Las celdas solo aceptan enteros ≥ 0: en pantalla un valor inválido se marca y deshabilita «Guardar borrador», y el backend responde 400.
- [ ] Los totales por fila, por columna y el general se calculan en pantalla.
- [ ] Guardar escribe una fila de `detalle_produccion` por celda con valor (incluido el 0), con la `clave_combinacion` canónica y sus filas de `detalle_dimension` iguales a sus dimensiones, en una sola transacción. Una celda vacía no tiene fila.
- [ ] Al recargar, cada cantidad guardada aparece en su celda, y las vacías siguen vacías.
- [ ] El `PUT` borra las celdas del municipio propio que ya no vienen y no toca las de otras procedencias.
- [ ] `total_declarado` es la suma de las cantidades de la vacuna después de cada guardado, y `datos_adicionales` guarda los campos adicionales validados por su tipo.
- [ ] Una celda que no es del esquema, repetida o de otro municipio responde 422.
- [ ] Solo se guarda en un reporte `BORRADOR` con el mes `ABIERTO` o `EN_CIERRE` (409 si no). Una `versionFila` vieja responde 409 `REPORTE_DESACTUALIZADO`, también con dos guardados en paralelo.
- [ ] Cada guardado que cambia algo deja una fila `ACTUALIZAR` con las celdas cambiadas. Uno sin cambios no escribe nada.
- [ ] Un reporte que no se puede editar se ve en solo lectura, sin «Guardar borrador».
- [ ] Un esquema publicado sin `secciones` (Hexavalente v1) se dibuja y se guarda con sus secciones deducidas, igual en el frontend y en el backend.
- [ ] Ninguna tabla, endpoint ni fila de la bitácora guarda datos de pacientes: solo cantidades, códigos y datos adicionales del esquema.
- [ ] El Personal de establecimiento tiene `REPORTE_EDITAR`, y ningún otro rol lo tiene.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-20 tiene su avance y sus criterios marcados, HU-10, HU-19, HU-21, HU-22 y HU-25 tienen su nota, y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** HU-20 incluye `GET /reportes/{id}/formulario` y `PUT /reportes/{id}/vacunas/{vacunaId}` (decidido en la fase de preguntas). Lo dice el «Cómo se hará» de la historia, y sin guardar no se verifica la carga ni la regla de las dosis inactivas. A HU-22 le queda el aviso de cambios sin guardar. **No:** dejar el `PUT` a HU-22, que deja la captura sin poder probarse.
- **Sí:** solo el municipio propio. El `PUT` responde 422 a otra procedencia (decidido en la fase de preguntas), y HU-21 lo abre. **No:** aceptar cualquier procedencia sin pantalla que la use.
- **Sí:** vacía ≠ 0. Una vacía no tiene fila (decidido en la fase de preguntas), y HU-25 puede detectar los campos sin llenar, como pide el mockup («Escriba 0 si no hubo»). **No:** tratar la vacía como 0.
- **Sí:** la diferencia vale en la tarjeta A y en la B. En la B, solo dentro de las filas que agrega el Personal (decidido después de escribir el spec), así que no se piden ceros por municipio. **No:** un botón «Completar vacías con 0». **No:** tratar la vacía como 0 en la tarjeta B.
- **Sí:** el `PUT` reemplaza las celdas de la vacuna: lo que no viene se borra (decidido en la fase de preguntas). **No:** solo actualizar las celdas enviadas, que necesita una forma de vaciar una celda.
- **Sí:** el reemplazo es solo de las celdas del **municipio propio**. Las de otras procedencias no se tocan (decidido al escribir el spec, porque los reportes de la semilla ya tienen celdas de otros municipios y de Migrantes). **No:** reemplazar todas las procedencias, que borraría esas celdas en los borradores de la semilla antes de que exista la tarjeta B.
- **Sí:** el permiso nuevo `REPORTE_EDITAR`, solo para `ESTABLECIMIENTO` (decidido en la fase de preguntas). **No:** reutilizar `REPORTE_CREAR`, que mezcla crear y capturar.
- **Sí:** un «Guardar borrador» general que manda un `PUT` por vacuna con cambios (decidido en la fase de preguntas), como el mockup. **No:** un botón por pestaña.
- **Sí:** los `PUT` van uno tras otro con la `versionFila` encadenada. Así el control optimista sirve entre pestañas sin un endpoint de guardado múltiple. **No:** mandarlos en paralelo, que chocarían con su propia versión.
- **Sí:** se puede guardar en `BORRADOR` con el mes `ABIERTO` o `EN_CIERRE`, con `versionFila` (decidido en la fase de preguntas). Así se corrige un reporte devuelto después de la fecha límite. **No:** solo `ABIERTO`; **no:** ignorar el estado del mes.
- **Sí:** se dibujan y se guardan los campos adicionales del esquema en `datos_adicionales`, validados por tipo (decidido en la fase de preguntas). `requerido` no impide guardar el borrador. **No:** dejarlos fuera, que haría que la captura no reproduzca el esquema.
- **Sí:** el backend guarda en `total_declarado` la suma calculada del detalle (decidido en la fase de preguntas). El equipo no quiere que el Personal haga la suma a mano. **No:** un campo «Total declarado» que escribe el Personal; **no:** dejarlo `NULL`.
- **Sí:** el campo adicional `total_dosis_declarado` de Hexavalente v2 se dibuja como cualquier otro, porque la versión publicada no se edita (regla 5). Quitarlo pide publicar otra versión, y queda en la nota de HU-25.
- **Sí:** un reporte que no se puede editar se ve en solo lectura con sus cantidades (decidido en la fase de preguntas). **No:** un mensaje sin tabla.
- **Sí:** el `PUT` acepta una dosis inactiva solo si el reporte ya tenía filas de ella, en simetría con la pantalla (decidido en la fase de preguntas). **No:** aceptarla siempre, que dejaría capturar por la API lo que la pantalla oculta.
- **Sí:** el backend duplica la regla de las celdas, incluida la deducción de secciones, y sus pruebas repiten los casos del frontend (decidido en la fase de preguntas). Es el mismo patrón que `campos.js` y las reglas de coherencia. **No:** responder 422 a un esquema sin `secciones`, que dejaría sin captura los borradores de la semilla con Hexavalente v1.
- **Sí:** `GET /reportes/{id}/formulario` trae todas las vacunas en una llamada (decidido en la fase de preguntas). **No:** una llamada por pestaña.
- **Sí:** una fila `ACTUALIZAR` por vacuna con `diferencias` sobre un objeto plano de celdas, datos adicionales y total (decidido en la fase de preguntas). `diferencias` compara claves de primer nivel, por eso el objeto es plano. Un guardado sin cambios no escribe nada. **No:** solo un resumen.
- **Sí:** el `PUT` calcula `clave_combinacion` a partir de `dimensiones` y escribe `detalle_dimension` con esas mismas dimensiones, para que nunca se contradigan (regla de `CONTEXTO BD.md`). **No:** recibir la clave desde el cliente.
- **Sí:** `esquema` reutiliza `aEsquema`, así que el frontend usa `contenidoDe` sin una conversión nueva. **No:** una forma propia del formulario.
- **Sí:** las pruebas usan `cs1201`, el año 2023 y las vacunas `ZVT_HU20*` (decidido al escribir el spec). El año 2022 ya lo usa `reportes.test.js`, que borra sus datos al inicio y al final: con el mismo año, cada archivo borraría los del otro. Los archivos corren en serie (`fileParallelism: false` en `vitest.config.js`), así que el problema no es la concurrencia sino que los datos se mezclen.
- **Sí:** el reporte 287 conserva las cantidades de la prueba manual para HU-21, HU-22 y HU-25 (decidido en la fase de preguntas).
- **Sí:** los errores de contenido son 422 y nombran el primer problema, como `revisarCoherencia` (SPEC 19). **No:** devolver la lista de todos.

Decididas al implementar:

- **Sí:** el `PUT` se programó completo en el paso 4, con sus validaciones, porque son el mismo camino de código. El paso 5 agregó sus pruebas de error, y todas pasaron sin cambiar el servicio (pasos 4 y 5).
- **Sí:** un dato adicional `null` o un texto vacío (sin los espacios de los extremos) cuentan como sin llenar y no se guardan (paso 4).
- **Sí:** las claves de `datos_adicionales` se guardan ordenadas. MySQL reordena las claves de un JSON, y sin esto repetir el mismo guardado habría dejado una fila `ACTUALIZAR` sin cambios reales (paso 4).
- **Sí:** si la versión del reporte ya no está en MongoDB, el `PUT` responde 422 `CELDA_INVALIDA` con «No se encontró el formulario de esta vacuna.» (paso 4).
- **Sí:** las pruebas cambian el mes a `CERRADO` con `cerrado_por` y `cerrado_en`, que exige `ck_cierre_cerrado` (paso 3).
- **Sí:** `esquemas.service.js` exporta `aEsquema`, y `FormularioCaptura.jsx` exporta `leerCantidad`, para que la pantalla use la misma regla de celda inválida (pasos 3 y 7).
- **Sí:** `CapturaReporte.jsx` reemplaza `PestanaVacuna` y `DetalleReporte` del SPEC 22. La lista de dosis y valores de cada pestaña la reemplaza la tabla, y la comprobación de la franja de dimensiones pasó a `CapturaReporte.test.jsx` (paso 7).
- **Sí:** mientras se guarda, la tabla y los datos adicionales se deshabilitan, para que lo guardado no reemplace lo que se escribe en ese momento (pedido al revisar el paso 7).
- **Sí:** la v1 de Hexavalente se comprobó con el reporte 218 (agosto, `CERRADO`) pidiendo su formulario a la API, porque `/registro` solo abre meses abiertos y ningún reporte abierto de `cs1201` la usa. En la semilla, los reportes de septiembre de 2026 tienen fijada la v2, aunque su vigencia empieza en octubre: es una incoherencia de los datos de prueba, no de la captura (paso 8).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| La regla de celdas del backend se aparta de la de `armarFormulario` y el `PUT` rechaza celdas que la pantalla dibuja | `celdas.test.js` repite los casos de `armarFormulario.test.js`, y la nota de `CLAUDE.md` dice que un cambio va en los dos. |
| Dos pestañas o dos personas guardan el mismo reporte a la vez | `versionFila` con `FOR UPDATE` como primera consulta: el segundo recibe 409 y la pantalla ofrece recargar. Lo cubre la prueba en paralelo. |
| Un `PUT` de varios falla a mitad del «Guardar borrador» | Cada vacuna es su propia transacción: las anteriores quedan guardadas, y la pantalla dice cuál falló y conserva sus cambios. |
| Un campo adicional `texto` se usa para escribir datos de un paciente | Se limita a 200 caracteres. Los esquemas de la semilla no tienen campos de texto, y crear uno es una decisión del Administrador. Queda como riesgo para la DDRISS al configurar esquemas. |
| Borrar celdas del municipio propio borra datos de la semilla que el Personal no quería quitar | Solo se borra lo que la pantalla muestra y el Personal vació. Las demás procedencias no se tocan. |
| El mes pasa a `CERRADO` mientras se guarda | El estado del mes se lee dentro de la transacción, después del bloqueo del reporte. |
| La versión del reporte ya no está en MongoDB | Las versiones publicadas no se borran (regla 5). Si falta, el GET devuelve `esquema: null`, la pestaña avisa y el `PUT` responde 422. |
| Las pruebas cambian el estado del reporte o de `cierre_periodo` y fallan antes de restaurarlo | Todo es del año 2023 y de las vacunas de prueba, y se borra al inicio y al final. |

## Lo que **no** entra en este spec

- La tarjeta B, otros municipios y Migrantes (HU-21).
- El aviso al salir con cambios sin guardar (HU-22).
- Ejecutar las validaciones y el panel de validación (HU-24 y HU-25).
- Enviar a revisión y las transiciones (HU-26 y siguientes).
- El resumen del mockup y las marcas de las pestañas.
- Las observaciones del revisor junto al formulario (HU-29).
- Capturar desde la DDRISS.

Cada uno, si se hace, va en su propio spec.
