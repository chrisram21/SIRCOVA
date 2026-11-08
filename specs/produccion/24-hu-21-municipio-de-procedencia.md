# SPEC 24 — Registrar el municipio de procedencia

> **Estado:** Implementado
> **Historia:** HU-21
> **Depende de:** SPEC 05, SPEC 13, SPEC 19, SPEC 21, SPEC 22, SPEC 23
> **Fecha:** 2026-10-26
> **Objetivo:** Que el Personal de establecimiento registre en `/registro`, en la tarjeta B de cada vacuna, las dosis aplicadas a personas de otros municipios o Migrantes, con filas por municipio, dosis y grupo de edad que se guardan con su `municipio_procedencia_id` junto con las del municipio propio.

## Por qué existe este spec

El SPEC 23 dejó la captura lista, pero solo para el municipio del establecimiento (la tarjeta A):

- `PUT /reportes/{id}/vacunas/{vacunaId}` responde 422 `CELDA_INVALIDA` a una celda con otra procedencia, y no toca las celdas de otras procedencias que ya existen (las de la semilla).
- `GET /reportes/{id}/formulario` ya trae todas las celdas de la vacuna, de cualquier procedencia, pero la pantalla solo dibuja las del municipio propio.
- `total_declarado` ya suma todas las procedencias.

Falta la tarjeta B del mockup, «Dosis aplicadas a personas de otros municipios», y abrir el `PUT` a esas procedencias. Con eso, la cobertura (`v_produccion_atribuida`, Excel 3) atribuye cada dosis al municipio donde vive la persona.

**El modo de procedencia del esquema** (`procedencia.modo` y `permiteNoEspecificado`, SPEC 19) deja de ser solo una descripción (SPEC 21) y decide qué procedencias ofrece la tarjeta B:

- **`MUNICIPIO_DETALLADO`:** se elige el municipio. Se ofrecen los municipios activos del departamento sede de la DDRISS (sin el propio), y además el `9999` «Migrantes / fuera de San Marcos» si `permiteNoEspecificado` es `true`.
- **`PROPIO_Y_OTROS`:** es la réplica del 5C en papel, donde los «otros» se anotan juntos sin municipio. La única procedencia es el `9999`, sin tener en cuenta `permiteNoEspecificado`. Esas dosis suman en la producción total, pero no en la cobertura de ningún municipio, que es la misma limitación que tiene el 5C. Hoy solo Hexavalente v1 usa este modo, y sus reportes en la semilla están todos `CERRADO` o `RECTIFICACION`, pero el editor de esquemas permite publicar una versión nueva con él.

**Diferencias con la historia** (mandan `AGENTS.md`, el modelo y lo que decidió el equipo):

- La historia dice «otros municipios de San Marcos». Aquí son los municipios del **departamento sede de la DDRISS del establecimiento**, sacados de la tabla `ddriss`, sin fijar San Marcos (regla del proyecto). Para la DDRISS San Marcos es lo mismo.
- «Migrantes (fuera de San Marcos o procedencia desconocida)» es el municipio `9999`. Un municipio de otro departamento, como Coatepeque, no se elige: va como `9999`, igual que en el modelo y en `v_produccion_atribuida`.
- «No se permite repetir la misma combinación…»: la pantalla no deja crear la fila repetida, y el backend sigue respondiendo 422 `CELDA_REPETIDA`.

## Alcance

**Entra:**

- `GET /reportes/{id}/formulario` agrega:
  - `municipios`: los nombres de todos los municipios que puede necesitar la pantalla;
  - `procedenciasPermitidas` en cada vacuna, calculadas en el backend según el modo de su esquema.
- `PUT /reportes/{id}/vacunas/{vacunaId}` acepta celdas de **cualquier procedencia permitida** y reemplaza **todas** las celdas de la vacuna: lo que no viene se borra, de cualquier procedencia.
- Las procedencias **heredadas** (una celda guardada con una procedencia que hoy no se ofrece) siguen la regla de las dosis inactivas del SPEC 23: se ven, se editan y se quitan, y el `PUT` las acepta solo si la vacuna ya tenía filas de esa procedencia.
- `backend/src/modulos/produccion/procedencias.service.js`: el territorio de la DDRISS del establecimiento, el `9999` y las procedencias permitidas de un esquema.
- En `/registro`, la tarjeta B de cada pestaña de vacuna:
  - una tabla B por cada tabla de la tarjeta A (la general y las de las dosis con desagregación propia, como el refuerzo de Td);
  - filas por municipio + dosis + grupo de edad (o sección), con las demás dimensiones como columnas y el total por fila;
  - «+ Agregar municipio de procedencia», que abre un Dialog con tres Select;
  - «Quitar fila»;
  - solo lectura cuando el reporte no se puede editar.
- `armarFormulario` agrega a cada tabla la lista de sus `secciones` (título y `grupoEdad`), sin cambiar lo demás.
- «Guardar borrador» manda en el mismo `PUT` las celdas de las dos tarjetas.
- Pruebas de backend (`procedencia.test.js` nuevo, y el ajuste de dos casos de `captura.test.js`) y de frontend.
- Verificación manual con Playwright sobre el reporte 287 de `cs1201`.
- La documentación:
  - el avance y los criterios de HU-21;
  - la nota en HU-25;
  - una nota en «Notas de contexto» de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- El resumen del mockup («Dosis a otros municipios», «Vacunas completas») y las marcas ✓ de las pestañas, que el SPEC 23 también dejó fuera.
- Ejecutar las reglas de validación (`PROCEDENCIA_VALIDA`, `CAMPOS_COMPLETOS`) y el panel «Validación automática» (HU-24 y HU-25).
- El aviso al salir con cambios sin guardar (HU-22).
- La tarjeta B en la vista previa del esquema (SPEC 21): sigue describiendo el modo de procedencia con su texto.
- Un total de la tarjeta B por columna; solo va el total por fila.
- Elegir un municipio de otro departamento: va como `9999`.
- Las rectificaciones de reportes cerrados (`rectificacion_detalle`), que tienen su propio flujo.
- Cambios al modelo (`01`, `02`), a las semillas (`03`, `04`) o a los permisos (`05`).

## Modelo de datos

Este spec **no cambia el modelo ni los permisos**. Escribe en las mismas tablas que el SPEC 23 (`detalle_produccion`, `detalle_dimension`, `reporte_vacuna`, `reporte_produccion` y `bitacora`). Ahora `municipio_procedencia_id` puede ser cualquier procedencia permitida, no solo el municipio del establecimiento.

Lee además `municipio` y `ddriss` (para conocer el departamento sede de la DDRISS del establecimiento).

### Procedencias

- **Territorio** de un reporte: los municipios con `activo = TRUE` del departamento de la DDRISS del establecimiento (`establecimiento.ddriss_id` → `ddriss.departamento_id`), sin el municipio del establecimiento y sin el `9999`, ordenados por nombre. Es la misma regla que `buscarMunicipios` de `poblacion.service.js`, pero tomada de la DDRISS del establecimiento y no de la del usuario.
- **Migrantes:** el municipio con `codigo_ine = '9999'`.
- **Procedencias permitidas** de una vacuna, según el esquema fijado en el reporte:

  | Modo | `permiteNoEspecificado` | Procedencias permitidas |
  |---|---|---|
  | `MUNICIPIO_DETALLADO` | `true` | territorio + `9999` |
  | `MUNICIPIO_DETALLADO` | `false` | territorio |
  | `PROPIO_Y_OTROS` | cualquiera | solo `9999` |

  Una vacuna con `esquema: null` no tiene procedencias permitidas.
- El municipio propio nunca está en la lista: va siempre en la tarjeta A.
- **Heredada:** una procedencia distinta de la propia que no está en la lista (un municipio desactivado, el `9999` con `permiteNoEspecificado: false`, un municipio del territorio en un esquema `PROPIO_Y_OTROS`, uno de otro departamento). Se trata como las dosis inactivas del SPEC 23:
  - **en pantalla**, sus filas aparecen en la tarjeta B con el nombre del municipio, se pueden editar y quitar, pero no se pueden volver a agregar desde el Dialog;
  - **en el `PUT`**, se acepta solo si la vacuna tenía alguna fila de esa procedencia **antes** del guardado. Si no, responde 422 `CELDA_INVALIDA`. Así, un id de municipio que no existe también da 422.

### Filas de la tarjeta B

Una fila de la tarjeta B es **municipio + dosis + sección**. Sus celdas son las de esa dosis en esa sección de la tabla, que son las mismas `claveCombinacion` de la tarjeta A. Las celdas válidas del backend (`celdas.service.js`) no cambian.

- **Las filas existen solo en la pantalla.** La base guarda celdas. Al cargar, las celdas con procedencia distinta de la propia se agrupan en filas por (municipio, dosis, sección):
  - la sección de una celda es la que tiene su valor de `grupo_edad`;
  - si la vacuna no separa por edad, es la única sección.
- **Vacía ≠ 0** dentro de cada fila, como en el SPEC 23. Una celda vacía no se manda, y una con 0 sí.
- **Una fila con todas sus celdas vacías no se guarda.** No se manda ninguna celda suya, así que al recargar ya no aparece. No impide guardar.
- **Orden.** Al cargar, las filas van por nombre de municipio (el `9999` al final), después por el orden de la dosis y después por el de la sección. Una fila agregada va al final.
- **Repetidos.** En el Dialog, una combinación municipio + dosis + sección que ya está en la tabla aparece deshabilitada.

### Endpoints

Los mismos del SPEC 23, con los mismos permisos (`REPORTE_CONSULTAR` y `REPORTE_EDITAR`).

`GET /reportes/{id}/formulario` (200) agrega dos campos:

```json
{
  "reporteId": 287,
  "versionFila": 5,
  "editable": true,
  "municipioPropio": { "id": 1, "nombre": "San Marcos" },
  "municipios": [
    { "id": 2,  "codigoIne": "1202", "nombre": "San Pedro Sacatepéquez" },
    { "id": 31, "codigoIne": "9999", "nombre": "Migrantes / fuera de San Marcos" }
  ],
  "vacunas": [
    {
      "vacunaId": 2,
      "esquema": { "…": "igual que en el SPEC 23" },
      "procedenciasPermitidas": [2, 3, 31],
      "celdas": [
        { "dosisCodigo": "D1", "municipioProcedenciaId": 13, "dimensiones": { "grupo_edad": "MENOR_1" },
          "claveCombinacion": "grupo_edad=MENOR_1", "cantidad": 3 }
      ],
      "datosAdicionales": null,
      "totalDeclarado": 3
    }
  ]
}
```

- `municipios` trae el territorio, el `9999` y todo municipio que aparezca en las `celdas` de alguna vacuna (también uno desactivado o de otro departamento), sin el propio. Va ordenada por nombre, con el `9999` al final.
- `procedenciasPermitidas` son los ids de la tabla de arriba, en el orden de `municipios`.

`PUT /reportes/{id}/vacunas/{vacunaId}`: el cuerpo no cambia.

- `celdas` son **todas** las celdas con valor de la vacuna, de las dos tarjetas. Lo que no viene se borra, de cualquier procedencia.
- Las demás reglas del SPEC 23 siguen igual:
  - las dosis inactivas;
  - `versionFila`;
  - `datosAdicionales`;
  - `total_declarado`;
  - la fila `ACTUALIZAR`, con las claves `celda:{dosis}|{procedenciaId}|{clave_combinacion}`;
  - sin cambios, no se escribe nada.

### Errores del `PUT` que cambian

| Caso | Antes (SPEC 23) | Ahora |
|---|---|---|
| Una celda de un municipio del territorio, o el `9999` permitido | 422 `CELDA_INVALIDA` | Se guarda |
| Una celda con una procedencia que no es la propia, no está permitida y no tenía filas antes del guardado | 422 `CELDA_INVALIDA` | 422 `CELDA_INVALIDA`, con el mensaje «La celda {dosis} · {columna} tiene una procedencia que no se puede usar en esta vacuna.» |
| Las celdas de otras procedencias que no vienen en el cuerpo | No se tocaban | Se borran |

La revisión de las procedencias heredadas va dentro de la transacción, después de leer las filas actuales y junto con la de las dosis inactivas (paso 3 de la transacción del SPEC 23). La de las procedencias permitidas va fuera, con las demás validaciones de contenido.

### Pantalla `/registro`

Referencia: la tarjeta B de `docs/mockups/pantallas/Registro.html` y de `Registro-Td.html`, sin el resumen ni el panel de validación.

- **Tarjeta B**, debajo de la tarjeta A en cada pestaña de vacuna con esquema:
  - **Título y subtítulo.** El título es «Dosis aplicadas a personas de otros municipios». El subtítulo es «Se atribuyen al municipio de procedencia al calcular la cobertura. Solo cantidades, sin datos personales.».
  - **Modo `PROPIO_Y_OTROS`.** Se agrega la nota «Este esquema registra juntas las dosis de otros municipios, como en el 5C.».
  - **Una tabla por cada tabla de la tarjeta A** que tenga filas, con el mismo título que en la A (por ejemplo, el refuerzo de Td aparte). Sus columnas son:
    - Municipio de procedencia, Dosis y Grupo de edad. «Grupo de edad» muestra el título de la sección, y solo aparece si la tabla tiene más de una sección o su sección tiene `grupoEdad`;
    - una columna por combinación de las demás dimensiones, con los encabezados de la tabla A sin el nivel de las secciones (por ejemplo, Hombres y Mujeres), o una sola columna «Cantidad» si no hay más dimensiones;
    - Total;
    - «Quitar fila».
  - Una tabla sin filas no se dibuja. Si la tarjeta no tiene filas, se ve «No hay dosis de otros municipios.».
  - **«+ Agregar municipio de procedencia»** abre un Dialog con tres Select:
    - Municipio, con las `procedenciasPermitidas` de la vacuna (en `PROPIO_Y_OTROS`, solo el `9999`, ya elegido);
    - Dosis, con las dosis que se ven en la tarjeta A;
    - Grupo de edad, con las secciones que incluyen esa dosis. No aparece si la vacuna tiene una sola sección.

    Las combinaciones que ya existen aparecen deshabilitadas. «Agregar» agrega la fila con sus celdas vacías en la tabla que corresponde a la dosis. El botón no aparece si la vacuna no tiene procedencias permitidas.
- **Estado.** Las filas de la tarjeta B y sus cantidades viven en el estado de `CapturaReporte`, junto a las de la tarjeta A. Las cantidades usan la llave `{dosis}|{municipioId}|{claveCombinacion}`. Cambiar de pestaña no las pierde.
- **Celdas.** Las celdas aceptan lo mismo que en la tarjeta A, con `leerCantidad`:
  - un valor inválido se marca y deshabilita «Guardar borrador» con la misma nota del SPEC 23;
  - el total de la fila cuenta la vacía como 0.
- **«Guardar borrador»** (el mismo del SPEC 23):
  - Cuenta como cambio cualquier diferencia en las cantidades de las dos tarjetas. Agregar una fila vacía no es un cambio.
  - Manda las celdas con valor de la tarjeta A (con el municipio propio) y de la B (con el municipio de su fila). Una fila quitada no manda sus celdas, así que se borran.
  - Al terminar, la tarjeta B se vuelve a armar con lo guardado: las filas vacías desaparecen.
- **Solo lectura** (`editable: false`): las filas con sus cantidades, los campos deshabilitados, y sin «Agregar» ni «Quitar fila».
- **Componentes.** La tarjeta va en `componentes/formulario/TarjetaProcedencias.jsx`, con el Dialog. La vista previa del SPEC 21 no la usa. Se usan los componentes que ya están en `components/ui/` (Card, Table, Dialog, Select, Button, Input). No se agregan dependencias. Para que las pruebas los cambien con el `<select>` nativo, los Select del Dialog van dentro de un `<form>` (nota del 2026-10-22).

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                   ← FormularioReporte: municipios; VacunaDeFormulario: procedenciasPermitidas;
│                                                    descripción y errores del PUT (todas las procedencias)
├── src/modulos/produccion/
│   ├── procedencias.service.js                    ← nuevo: territorio, 9999 y procedencias permitidas
│   └── captura.service.js                         ← GET con municipios y procedenciasPermitidas; PUT con todas las procedencias
└── tests/
    ├── procedencia.test.js                        ← nuevo
    └── captura.test.js                            ← ajuste de dos casos (ver el plan)
frontend/src/
├── api/produccion.js                              ← comentario de guardarVacuna (todas las procedencias)
├── componentes/formulario/
│   ├── armarFormulario.js                         ← cada tabla agrega sus secciones
│   ├── armarFormulario.test.js                    ← casos de las secciones
│   ├── TarjetaProcedencias.jsx                    ← nuevo: tablas B, Dialog, quitar fila, solo lectura
│   └── TarjetaProcedencias.test.jsx               ← nuevo
└── paginas/registro/
    ├── CapturaReporte.jsx                         ← estado de la tarjeta B y celdas de las dos tarjetas en el PUT
    └── CapturaReporte.test.jsx                    ← casos nuevos
docs/SPECS/HISTORIAS_DE_USUARIO.md                 ← avance y criterios de HU-21; nota en HU-25
CLAUDE.md                                          ← nota de la procedencia
```

## Plan de implementación

1. **Contrato.** En `openapi.yaml`:
   - `municipios` en `FormularioReporte` y `procedenciasPermitidas` en `VacunaDeFormulario`;
   - el `PUT` con la nueva descripción (todas las procedencias) y su error de procedencia.

   Comprobación: `/api/docs` muestra los campos nuevos.

2. **`procedencias.service.js` y el `GET`.** Una función lee el territorio de la DDRISS del establecimiento y el `9999`, y otra da las procedencias permitidas de un esquema. `obtenerFormulario` agrega `municipios` (con los de las celdas) y `procedenciasPermitidas`. Pruebas en `procedencia.test.js`:
   - **Datos.**
     - Firman el token de `cs1201` y usan el año 2024. Crean sus meses en `periodo` y sus filas en `cierre_periodo` de la DDRISS 1, y los borran al inicio y al final, con sus reportes.
     - Usan tres vacunas, que se insertan en MySQL y en MongoDB y se borran:
       - `ZVT_HU21`: `MUNICIPIO_DETALLADO` con `permiteNoEspecificado: true`, dos secciones con `grupo_edad` y `sexo`;
       - `ZVT_HU21N`: `MUNICIPIO_DETALLADO` con `permiteNoEspecificado: false`;
       - `ZVT_HU21P`: `PROPIO_Y_OTROS`.
     - Las filas de la bitácora quedan.
   - **Casos.**
     - `ZVT_HU21` permite `1202` y `9999`, y no permite `1201` (el propio) ni `0920` (Coatepeque);
     - `ZVT_HU21N` permite `1202` y no permite `9999`;
     - `ZVT_HU21P` solo permite `9999`;
     - `municipios` trae el territorio y el `9999`, sin el propio;
     - con una fila de Coatepeque insertada por SQL, `municipios` también trae Coatepeque.

   Comprobación: `procedencia.test.js` pasa.

3. **El `PUT` con todas las procedencias.** La validación de procedencias (permitida, propia o heredada), el reemplazo de todas las celdas y el mensaje nuevo. Casos en `procedencia.test.js`:
   - guarda en una misma vacuna celdas del propio, de `1202` y del `9999`, cada una con su `municipio_procedencia_id` y su `detalle_dimension`, y `total_declarado` suma las tres;
   - un segundo `PUT` sin las celdas de `1202` las borra;
   - repetir el mismo `PUT` no escribe nada;
   - la fila `ACTUALIZAR` tiene claves `celda:…` con la procedencia de cada celda;
   - **422 `CELDA_INVALIDA`:**
     - Coatepeque sin filas previas;
     - el `9999` en `ZVT_HU21N`;
     - `1202` en `ZVT_HU21P`;
     - un id de municipio que no existe;
   - **422 `CELDA_REPETIDA`:** dos celdas iguales de `1202`;
   - **heredada:**
     - con una fila de Coatepeque insertada por SQL, el `PUT` que la trae (con otra cantidad) se acepta;
     - el `PUT` que la omite la borra;
     - un `PUT` siguiente con ella responde 422.

   Ajuste de `captura.test.js`, porque el comportamiento cambia a propósito (decidido en la fase de preguntas):
   - «sin la celda de 0 la borra…; la de otra procedencia no se toca y suma al total» pasa a mandar también la celda de otra procedencia: se conserva y suma al total;
   - «422 CELDA_INVALIDA … o de otro municipio» usa un municipio que no está permitido ni tenía filas (Coatepeque) en lugar de uno del territorio.

   Comprobación: `procedencia.test.js` y `captura.test.js` pasan. Después, la suite completa del backend.

4. **`armarFormulario` con secciones por tabla.** Cada tabla agrega `secciones: [{ titulo, grupoEdad }]` con las secciones de sus columnas, en orden. Casos nuevos en `armarFormulario.test.js`:
   - Hexavalente v2: la general con «< 1 año» y «De 1 a < 6 años»;
   - BCG: una sección sin `grupoEdad`;
   - Td: la tabla del refuerzo, con sus secciones.

   Comprobación: `armarFormulario.test.js`, `FormularioCaptura.test.jsx` y `VistaPreviaEsquema.test.jsx` pasan sin cambios en sus casos anteriores.

5. **`TarjetaProcedencias`.** El componente, con sus pruebas:
   - dibuja una tabla por tabla A con filas, con las columnas de las dimensiones, el total por fila y la columna «Grupo de edad» solo cuando corresponde;
   - el Dialog ofrece solo las procedencias permitidas, ya elegido el `9999` en `PROPIO_Y_OTROS`, y deshabilita una combinación existente;
   - «Agregar» crea la fila vacía en la tabla de su dosis (el refuerzo de Td, en la suya);
   - «Quitar fila» la quita;
   - una fila heredada se ve con su nombre y se puede quitar;
   - en solo lectura, no hay «Agregar» ni «Quitar fila», y los campos están deshabilitados;
   - sin filas, se ve «No hay dosis de otros municipios.».

   Comprobación: `TarjetaProcedencias.test.jsx` pasa.

6. **`CapturaReporte` con las dos tarjetas.** Pruebas con `vi.mock` sobre `src/api/`:
   - las celdas guardadas de otras procedencias se agrupan en filas por municipio, dosis y sección;
   - el cuerpo del `PUT` lleva las celdas de la A con el municipio propio y las de la B con el de su fila, sin las vacías;
   - una fila quitada no manda sus celdas;
   - una fila vacía agregada no cuenta como cambio y desaparece después de guardar;
   - un valor inválido en la tarjeta B deshabilita «Guardar borrador».

   Comprobación: `npm test` del frontend pasa completo.

7. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano), con `cs1201`:
   - **Reporte 287** (octubre de 2026):
     - en Hexavalente, agregar filas de dos municipios y de Migrantes, con algún 0 y alguna vacía, e intentar repetir una combinación (aparece deshabilitada);
     - en Td, agregar una fila del refuerzo (tabla aparte);
     - agregar una fila y dejarla vacía;
     - guardar y recargar: las filas siguen, la vacía no;
     - revisar en la base `municipio_procedencia_id`, `detalle_dimension`, `total_declarado` y la fila `ACTUALIZAR`;
     - quitar una fila, guardar y comprobar que sus filas se borraron.

     Las cantidades quedan guardadas para HU-22 y HU-25.
   - **Septiembre** (`APROBADO`): la tarjeta B en solo lectura, con las celdas de otros municipios y de Migrantes de la semilla agrupadas en filas.

   Documentación:
   - en HU-21, marcar los criterios y escribir su «Avance» con las diferencias de este spec;
   - en HU-25, la nota:
     - las filas de la tarjeta B solo existen en la pantalla;
     - para el backend, una fila es (procedencia, dosis, sección) con al menos una celda guardada, y sus celdas que faltan son vacías;
     - `CAMPOS_COMPLETOS` debe revisar así la tarjeta B, nunca combinaciones de municipios sin filas;
     - `PROCEDENCIA_VALIDA` puede reutilizar `procedencias.service.js`, y las heredadas ya se aceptan al guardar;
   - en «Notas de contexto» de `CLAUDE.md`, una nota con lo esencial:
     - las procedencias en `procedencias.service.js` (territorio de la DDRISS del establecimiento, `9999` y modo del esquema);
     - el `PUT` reemplaza ahora todas las procedencias;
     - las heredadas como las dosis inactivas;
     - las filas de la tarjeta B solo en la pantalla;
     - las pruebas usan `cs1201`, el año 2024 y las vacunas `ZVT_HU21*`.

## Criterios de aceptación

- [ ] `npm test` pasa en `backend/` y en `frontend/`. Ninguna prueba se desactiva ni se quita, y los dos casos de `captura.test.js` que cambian lo hacen solo como dice el plan.
- [ ] `backend/db/` (incluido `05_permisos_mysql.sql`), `transicion_estado` y los dos `package.json` no cambian.
- [ ] Por defecto, las cantidades de la tarjeta A se guardan con el municipio del establecimiento.
- [ ] En `MUNICIPIO_DETALLADO`, el Dialog ofrece los municipios activos del departamento sede de la DDRISS (sin el propio) y el `9999` solo si `permiteNoEspecificado` es `true`. En `PROPIO_Y_OTROS`, solo el `9999`.
- [ ] Una fila agregada aparece con sus celdas vacías en la tabla de su dosis, y una combinación municipio + dosis + sección que ya existe no se puede volver a agregar.
- [ ] Guardar escribe las celdas de las dos tarjetas con su `municipio_procedencia_id`, su `clave_combinacion` canónica y su `detalle_dimension`, en una sola transacción por vacuna. Una fila vacía no deja filas, y al recargar ya no aparece.
- [ ] Una fila quitada se borra de `detalle_produccion` al guardar. El `PUT` borra las celdas de cualquier procedencia que no vienen.
- [ ] Al recargar, cada celda de otra procedencia vuelve a su fila (municipio, dosis, sección), con el 0 como «0» y las vacías vacías.
- [ ] El `PUT` responde 422 `CELDA_INVALIDA` a una procedencia que no es la propia, no está permitida y no tenía filas, y 422 `CELDA_REPETIDA` a una celda repetida.
- [ ] Una procedencia heredada con filas previas se puede editar y quitar. Una vez vaciada, el `PUT` la rechaza.
- [ ] `total_declarado` suma las cantidades de todas las procedencias, y la fila `ACTUALIZAR` lleva la procedencia en cada clave de celda.
- [ ] Un reporte que no se puede editar muestra la tarjeta B en solo lectura, sin «Agregar» ni «Quitar fila».
- [ ] Ninguna tabla, endpoint ni fila de la bitácora guarda datos de pacientes: solo cantidades, códigos y municipios.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-21 tiene su avance y sus criterios marcados, HU-25 tiene su nota, y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** la tarjeta B con filas municipio + dosis + sección y las demás dimensiones como columnas, como el mockup, con una tabla B por cada tabla A (decidido en la fase de preguntas). Cada fila solo pide sus pocas celdas. **No:** copiar la tarjeta A completa por municipio, que haría que HU-25 pidiera ceros en todas sus celdas.
- **Sí:** en `PROPIO_Y_OTROS`, la única procedencia es el `9999` (decidido en la fase de preguntas). Es lo que guarda la semilla para Hexavalente v1, y respeta el esquema: el 5C no identifica el municipio, así que esas dosis no se atribuyen a ninguno. **No:** ignorar el modo y pedir siempre el municipio.
- **Sí:** con `permiteNoEspecificado: false` no se ofrece el `9999`, y el `PUT` lo rechaza salvo que sea heredado (decidido en la fase de preguntas). **No:** ofrecerlo siempre, que dejaría la bandera sin efecto.
- **Sí:** el formulario trae `municipios` y `procedenciasPermitidas`, y la regla vive solo en el backend (decidido en la fase de preguntas). No cambia permisos, como hizo el SPEC 22 con las etiquetas. **No:** dar `MUNICIPIO_CONSULTAR` al Personal, que toca una zona protegida y filtra por otro ámbito.
- **Sí:** el territorio sale del departamento de la DDRISS **del establecimiento** (decidido al escribir el spec). Es el reporte el que se atribuye, y así no se fija San Marcos. **No:** la DDRISS del usuario, que para el Personal es la misma pero no lo sería si otro rol capturara.
- **Sí:** el `PUT` reemplaza todas las procedencias de la vacuna (decidido en la fase de preguntas). Las filas de la semilla aparecen en la tarjeta B, así que solo se borran si el Personal las quita. **No:** un campo `alcance` para reemplazar por tarjeta.
- **Sí:** la pantalla deshabilita en el Dialog las combinaciones que ya existen, y el backend sigue respondiendo `CELDA_REPETIDA` (decidido en la fase de preguntas). **No:** dejar crear la fila y marcarla en rojo.
- **Sí:** una fila con todas sus celdas vacías no se guarda y no impide guardar (decidido en la fase de preguntas). Es coherente con «vacía = sin fila» del SPEC 23. **No:** impedir el guardado hasta llenarla o quitarla.
- **Sí:** las procedencias heredadas siguen la regla de las dosis inactivas (decidido en la fase de preguntas). **No:** dejarlas en solo lectura, que volvería a tener celdas que el `PUT` no reemplaza. **No:** rechazarlas, que impediría guardar un borrador sin borrar datos.
- **Sí:** «+ Agregar municipio de procedencia» abre un Dialog con tres Select (decidido en la fase de preguntas). **No:** una fila con Select dentro de la tabla, que la carga más y es más difícil de probar con Radix.
- **Sí:** solo el total por fila (decidido en la fase de preguntas), como el mockup. **No:** una fila de totales de la tarjeta.
- **Sí:** las filas de la tarjeta B existen solo en la pantalla, y la base sigue guardando celdas (decidido al escribir el spec). La sección de una celda se deduce de su `grupo_edad`, que las secciones no repiten. **No:** una tabla o un campo nuevo para las filas, que cambiaría el modelo.
- **Sí:** `armarFormulario` agrega `secciones` a cada tabla, y la tarjeta B reutiliza sus columnas y encabezados (decidido al escribir el spec). **No:** una segunda función que repita la regla de las celdas.
- **Sí:** las pruebas van en `procedencia.test.js` con el año 2024 y las vacunas `ZVT_HU21*`, y se ajustan los dos casos de `captura.test.js` cuyo comportamiento cambia a propósito (decidido en la fase de preguntas). Ningún otro archivo de pruebas usa 2024. **No:** agregar todo a `captura.test.js`.
- **Sí:** la vista previa del esquema (SPEC 21) no muestra la tarjeta B: sigue describiendo el modo de procedencia (decidido al escribir el spec, como decidió el SPEC 21).

Decididas al implementar:

- **Sí:** `leerProcedencias` trae en una sola consulta el territorio, el `9999` y los municipios de las celdas guardadas (paso 2).
- **Sí:** el caso de `captura.test.js` sobre la celda de otra procedencia hace dos `PUT`: con la celda (se conserva y suma al total) y sin ella (se borra). Así los casos que siguen, que mandan solo las celdas del propio, reciben el mismo estado que antes y no hubo que tocarlos (paso 3).
- **Sí:** el Select «Grupo de edad» del Dialog aparece cuando la tabla de la dosis elegida tiene más de una sección; con una sola, se elige sola. Si la dosis está en una sola sección de una tabla con varias, el Select aparece con esa opción ya elegida (paso 5).
- **Sí:** `FormularioCaptura.jsx` exporta `etiquetaDeColumna`, y `TarjetaProcedencias.jsx` exporta `filasDeCeldas`, `cantidadesDeOtras` y `llavesDeFila` para `CapturaReporte`. `cantidadesDeOtras` solo toma las celdas que tienen fila, así que una celda que no se puede dibujar tampoco se manda (pasos 5 y 6).
- **Sí:** en `CapturaReporte.test.jsx`, la simulación del `GET` agrega `municipios` y `procedenciasPermitidas`, y el caso «guarda solo las vacunas con cambios…» espera también la celda de otro municipio que ya traía la simulación, porque ahora se manda en el `PUT` (paso 6).
- **Sí:** `PROPIO_Y_OTROS` no se verificó a mano: ningún reporte editable lo usa. Lo cubren las pruebas (paso 7).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| El `PUT` ahora borra celdas de otras procedencias, y una pantalla vieja o un cliente que solo manda la tarjeta A borraría la B | La pantalla siempre manda las dos tarjetas. `versionFila` evita guardar sobre datos que el cliente no cargó, y la prueba de `captura.test.js` ajustada cubre que la celda de otra procedencia se conserva si viene. |
| Las procedencias de la pantalla y las del backend se apartan | La pantalla no calcula la regla: usa `procedenciasPermitidas` del backend. |
| Una celda guardada no encuentra su fila en la tarjeta B (una clave que no está en ninguna sección) y no se dibuja, así que un guardado la borraría | Las celdas válidas del backend son las mismas que dibuja la tabla A, así que el `PUT` nunca guarda una celda sin sección. Una celda de la semilla fuera del esquema ya se perdía igual en la tarjeta A (SPEC 23). |
| El `9999` en `PROPIO_Y_OTROS` deja dosis sin atribuir a la cobertura | Es la limitación del 5C, y el esquema la elige. Para atribuirlas hay que publicar una versión con `MUNICIPIO_DETALLADO`. |
| Un municipio se desactiva con filas guardadas | Queda como heredado: se ve, se edita y se quita, pero no se vuelve a agregar. |
| Los Select de Radix dentro de un Dialog son difíciles de probar | Van dentro de un `<form>`, y las pruebas los cambian con el `<select>` nativo (nota del 2026-10-22). Mientras el Dialog está abierto, el resto de la página queda `aria-hidden` (nota del 2026-10-22). |
| Las pruebas mezclan sus datos con los de otro archivo | Año 2024 y vacunas `ZVT_HU21*` propias, que se borran al inicio y al final. |

## Lo que **no** entra en este spec

- El resumen «Dosis a otros municipios» y las marcas de las pestañas.
- Ejecutar `PROCEDENCIA_VALIDA`, `CAMPOS_COMPLETOS` y el panel de validación (HU-24 y HU-25).
- El aviso de cambios sin guardar (HU-22).
- La tarjeta B en la vista previa del esquema.
- Elegir un municipio de otro departamento.
- Las rectificaciones de reportes cerrados.
- Cambios al modelo, a las semillas o a los permisos.

Cada uno, si se hace, va en su propio spec.
