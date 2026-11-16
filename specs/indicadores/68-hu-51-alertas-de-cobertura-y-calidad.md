# SPEC 68 — HU-51 Alertas de cobertura y de calidad

> **Estado:** Implementado
> **Historia:** HU-51
> **Origen:** historia
> **Depende de:** SPEC 44, SPEC 48, SPEC 52, SPEC 60 y SPEC 67
> **Fecha:** 2026-11-15
> **Objetivo:** Que cada corrida de indicadores no parcial cree, actualice y descarte en `alerta` los avisos «Municipio bajo la meta» (franja roja del semáforo) y «Cobertura mayor al 100 %» de los indicadores con `alerta.generar`, para los roles de su `alerta.rol_destino`, y que Epidemiología los vea en la tarjeta «Alertas activas» de su Inicio.

## Por qué existe este spec

Epidemiología revisa a mano en «Indicadores» y en el mapa qué municipios quedan en rojo y cuáles pasan del 100 %. La configuración de cada indicador ya trae `alerta: { generar, tipo, rol_destino }` (SPEC 44), pero el motor no la usa. El SPEC 52 dejó `mayorACien` para reutilizarla aquí, y el SPEC 67 dejó el módulo `alertas`, `GET /alertas` y `TarjetaAlertas`.

Este spec agrega la generación al guardar la corrida, el permiso de Epidemiología para ver sus alertas y su tarjeta del Inicio. La pantalla de alertas, los filtros y «marcar como atendida» siguen en HU-52.

**Lo que se decidió en la fase de preguntas (2026-11-15):**

- «Bajo la meta» = la fila del municipio cae en la franja `rojo` del semáforo del indicador, en todo indicador con `alerta.generar = true` (hoy `COB_HEXA3`, `AVANCE_HEXA3` y `DES_HEXA1_3`). La cobertura anual se pinta contra lo esperado del mes, como en pantalla (SPEC 60).
- «Mayor al 100 %» = `mayorACien` de la fila, solo en indicadores con `alerta.generar = true`. Una alerta por indicador, aunque varios del mismo municipio pasen de 100.
- Destinatarios: una fila por cada rol de `alerta.rol_destino` (hoy EPIDEMIOLOGIA y REVISOR).
- Permiso `ALERTA_CONSULTAR` para EPIDEMIOLOGIA en `05_permisos_mysql.sql` (zona protegida, autorizado por el equipo en esta fase).
- Severidades: bajo la meta `CRITICA`; mayor al 100 % `ADVERTENCIA`.
- Una corrida nueva del mismo mes mantiene y actualiza la alerta activa, no recrea una atendida o descartada y descarta la que ya no aplica.
- Solo generan las corridas no parciales (`parcial = false`).
- Se generan dentro de la transacción de `guardarCorrida`: si fallan, la corrida queda `FALLIDA`.
- Solo filas municipales; ni la departamental ni las proyecciones.
- «Datos sospechosos» se limita a la cobertura mayor al 100 %.
- Frontend: la tarjeta «Alertas activas» de Epidemiología usa `TarjetaAlertas`.
- Las 9 alertas `COBERTURA_BAJO_META` de ejemplo de la semilla (otros títulos) se dejan como están.

## Alcance

**Entra:**

- **Permiso** (zona protegida, autorizado): en `backend/db/05_permisos_mysql.sql`, asignar `ALERTA_CONSULTAR` también a EPIDEMIOLOGIA, en un bloque nuevo `-- SPEC 68 (HU-51)`. En la base de prueba se corre solo ese `INSERT IGNORE`, no el script entero.
- **Contrato** en `backend/openapi.yaml`: la descripción de `GET /alertas` nombra los tres roles con el permiso y las dos clases nuevas; el esquema `Alerta` no cambia.
- **Backend:**
  - `backend/src/modulos/indicadores/calculadores.js`: pasar ahí `esCoberturaAnual` y `colorDe` de `corridas.service.js`, exportados como `esCoberturaAnual` y `colorDelIndicador(doc, valor, mes)`, para que el módulo `alertas` los use sin importar `corridas.service.js` (evita una importación circular). `corridas.service.js` los importa de ahí; su comportamiento no cambia.
  - `backend/src/modulos/alertas/cobertura.service.js` (nuevo): constantes (`TITULOS_COBERTURA`, `CLASES_COBERTURA` con el `tipo` y la `severidad` de cada clase, `FRANJA_BAJO_META = 'rojo'`), la función pura `candidatosDeAlerta({ versiones, filas, mes })` y `alertarCorrida(conexion, { corridaId, ddrissId, anio, mes, versiones }, contexto)`.
  - `backend/src/modulos/indicadores/corridas.service.js`: `guardarCorrida` llama a `alertarCorrida` después de `insertarResultados` y antes de su bitácora, solo si `datos.mesesSinCerrar.length === 0`; la bitácora de la corrida agrega `alertas: { creadas, actualizadas, descartadas }`.
  - `backend/src/modulos/auditoria/auditoria.service.js`: `registrarBitacoras(conexion, lista)`, que escribe varias filas de la bitácora en un solo `INSERT` con las mismas validaciones que `registrarBitacora` (decisión del equipo en el paso 5, 2026-11-15). `alertarCorrida` la usa al crear, actualizar y descartar: con una `registrarBitacora` por alerta, una corrida de `proyeccion.test.js` que crea unas 120 alertas (población `MENOR_1` de 2003 en los 30 municipios, `COB_HEXA3` y `AVANCE_HEXA3` en 0 %) pasaba de los 15 s de la prueba.
  - Nota en `backend/src/modulos/alertas/CLAUDE.md`.
- **Frontend:** en `frontend/src/paginas/inicio/roles/InicioEpidemiologia.jsx`, la tarjeta «Alertas activas» con `Datos: TarjetaAlertas` y `permisos: ['ALERTA_CONSULTAR']`; se quita el comentario «Las alertas llegan con HU-50 a HU-52».
- **Pruebas:** `backend/tests/alertasCobertura.test.js` (nuevo); en `backend/tests/alertas.test.js`, la prueba de 403 pasa de Epidemiología a la Autoridad; en `frontend/src/paginas/inicio/PaginaInicio.test.jsx`, el Inicio de Epidemiología con y sin `ALERTA_CONSULTAR` (con el mock de `@/api/alertas.js`); una prueba de `candidatosDeAlerta` en el mismo archivo del backend.
- **Limpieza de otras pruebas** (decisión del equipo en el paso 5, 2026-11-15): las alertas apuntan a `resultado_indicador` y a `periodo`, así que las 7 pruebas que borran resultados de sus corridas (`cierrePeriodo`, `configIndicadores`, `corridas`, `proyeccion`, `redesEnIndicadores`, `resolverRectificacion` y `serie`) borran antes las `alerta` que apuntan a esos mismos resultados. Sin esto, una corrida no parcial con los indicadores reales de HEXA (por ejemplo, la población `MENOR_1` de 2006 en `corridas.test.js`) deja alertas y la limpieza falla por las llaves foráneas.
- **Documentación:** avance de HU-51 y nota en HU-52 en `docs/SPECS/HISTORIAS_DE_USUARIO.md`; `node scripts/mapa-obsidian.mjs`.

**Fuera de alcance (para otros specs):**

- La pantalla «Alertas», el ícono de la barra, los filtros y marcar como atendida (HU-52).
- Otros «datos sospechosos»: deserción negativa, variación histórica de la validación, población en cero.
- Alertas de la fila departamental, de la «Total de la red» o de las proyecciones.
- Alertas de corridas parciales.
- Editar `alerta.generar` y `alerta.rol_destino` desde «Configuración de indicadores» (hoy se copian de la versión anterior).
- Dar `ALERTA_CONSULTAR` a la Autoridad o al Administrador.
- Limpiar las alertas de ejemplo de la semilla.
- Notificaciones por correo o en tiempo real.
- Cambios al modelo de datos, a `transicion_estado` o a `package.json`.

## Modelo de datos

No cambia el modelo: se escribe en la tabla `alerta` existente. Lo único nuevo en la base es la asignación de `ALERTA_CONSULTAR` a EPIDEMIOLOGIA.

### Clases de alerta

Cada clase se identifica por su `titulo` constante, como en el SPEC 67.

| Clase | `tipo` | `severidad` | `titulo` | Condición sobre la fila |
|---|---|---|---|---|
| Bajo la meta | `COBERTURA_BAJO_META` | `CRITICA` | `Municipio bajo la meta` | `colorDelIndicador(doc, valor, mes) === 'rojo'` |
| Mayor al 100 % | `CALIDAD` | `ADVERTENCIA` | `Cobertura mayor al 100 %` | `mayorACien({ tipoCalculo, valor, esProyeccion })` |

Las dos solo para filas con `municipioId`, sin `esProyeccion`, de un indicador cuya versión usada tiene `alerta.generar === true`. Una fila puede dar las dos clases solo si los umbrales lo permiten (en la práctica, no). `alerta.tipo` de la configuración no se usa: el `tipo` lo fija la clase.

Por cada candidato se crea una fila por cada código de `alerta.rol_destino` que exista en `rol`; un código desconocido se ignora. Referencias: `ddriss_id` de la corrida, `periodo_id` del `periodo` (`anio`, `mes_hasta`), `municipio_id` y `resultado_indicador_id` de la fila recién insertada; `establecimiento_id` y `reporte_id` en `NULL`.

Mensajes (el valor con un decimal y punto, como en pantalla; el mes con `NOMBRES_MES`):

- Bajo la meta: «{Municipio}: {nombre del indicador} ({vacuna}) en {mes} de {año} quedó en {valor} %, en la franja más baja del semáforo (meta {meta} %).»
- Mayor al 100 %: «{Municipio}: {nombre del indicador} ({vacuna}) en {mes} de {año} da {valor} %; revise la población o los registros.»

Así cada alerta indica municipio, vacuna, periodo y valor (criterio 3 de la historia).

### Candidatos

`candidatosDeAlerta({ versiones, filas, mes })` es pura (sin base) y devuelve `{ clase, codigo, version, nombre, municipioId, vacunaId, dosisId, filtro, valor, meta, rolesDestino }` por cada fila que cumple. `nombre` es el del indicador, para el mensaje (agregado en el paso 4, 2026-11-15). Lo usa `alertarCorrida`, que lee los ids de `resultado_indicador` de la corrida (`WHERE corrida_id = ?`) y los nombres de municipios y vacunas con dos consultas.

### Clave, actualización y descarte

La clave de una alerta es `titulo`, `rol_destino_id`, `ddriss_id`, `periodo_id`, `municipio_id` y, por su `resultado_indicador_id`, `indicador_codigo`, `vacuna_id`, `dosis_id` y `filtro_dimensiones` de `resultado_indicador` (la fila de la corrida anterior sigue existiendo). Se buscan con una consulta por corrida, de las dos clases, de la DDRISS y el mes, en cualquier estado.

| Caso | Qué hace |
|---|---|
| Candidato sin alerta con su clave | `INSERT` `ACTIVA`, bitácora `CREAR` |
| Candidato con alerta `ACTIVA` | `UPDATE` de `mensaje` y `resultado_indicador_id`; `generada_en` no cambia. Bitácora `ACTUALIZAR` con los valores anteriores y nuevos |
| Candidato con alerta `ATENDIDA` o `DESCARTADA` | Nada: no se recrea |
| Alerta `ACTIVA` de las dos clases, de la DDRISS y el mes, sin candidato | `DESCARTADA`, sin `atendida_por`; bitácora `ACTUALIZAR` (`{ estado: 'ACTIVA' }` → `{ estado: 'DESCARTADA' }`) |

Un indicador que deja de tener `alerta.generar` o deja de aplicar descarta sus alertas activas en la corrida siguiente del mes. Una corrida parcial no crea, no actualiza ni descarta.

La bitácora va con `modulo: INDICADORES`, `entidad: 'alerta'` y el `contexto` de la corrida (el usuario que la pidió, o sin usuario en el cierre automático). `alertarCorrida` devuelve `{ creadas, actualizadas, descartadas }`.

### `GET /alertas`

No cambia: Epidemiología, con el permiso, ve las `ACTIVA` con `rol_destino_id` EPIDEMIOLOGIA de su DDRISS (`filtroAlcance`). El Revisor verá también las de cobertura y calidad dirigidas a REVISOR, en su tarjeta «Alertas de calidad y de proceso».

### Pantalla

La tarjeta «Alertas activas» de Epidemiología es la misma `TarjetaAlertas` del SPEC 67 (total, desglose, la alerta de mayor severidad y «Ver alertas»). Sin el permiso, la tarjeta no pide nada, como las demás.

## Plan de implementación

1. **Permiso.** Agregar el bloque `-- SPEC 68 (HU-51)` con `ALERTA_CONSULTAR` para EPIDEMIOLOGIA en el 05 y correr solo ese `INSERT IGNORE` en la base de prueba. Cambiar la prueba de 403 de `alertas.test.js` a la Autoridad y comprobar que un login de `epidemiologia` trae el permiso y que `alertas.test.js` pasa.
2. **Contrato.** Actualizar la descripción de `GET /alertas` en `openapi.yaml`.
3. **Color compartido.** Pasar `esCoberturaAnual` y `colorDe` a `calculadores.js` como `colorDelIndicador`. Comprobar que `corridas.test.js` y `redesEnIndicadores.test.js` pasan igual.
4. **Candidatos.** Crear `modulos/alertas/cobertura.service.js` con las constantes y `candidatosDeAlerta`. Pruebas puras en `alertasCobertura.test.js`:
   - franja roja con `generar: true` da «bajo la meta» con sus `rolesDestino`; amarilla o verde, nada; `generar: false`, nada;
   - valor 100.9 de `COBERTURA` o `AVANCE_META_MES` da «mayor al 100 %»; 100.0, no; una proyección, no;
   - la fila departamental (`municipioId: null`) no da nada;
   - la cobertura anual (`NINGUNO`) usa el color contra lo esperado del mes;
   - la deserción en rojo (descendente) da «bajo la meta».
5. **Escritura.** `alertarCorrida` (crear, actualizar, no recrear, descartar, bitácora) y su llamada en `guardarCorrida`. Pruebas en el mismo archivo con la DDRISS ficticia `ZVT_HU51`, el año **1997** y los indicadores `ZVT_HU51_*` en `configuracion_indicadores`, preparados como en `corridas.test.js` (el año 1997 no lo usa ninguna otra prueba); la limpieza borra las `alerta` de la DDRISS antes que sus resultados y corridas:
   - una corrida no parcial crea las dos clases para cada rol de `rol_destino`, con municipio, vacuna, periodo, valor y `resultado_indicador_id`;
   - una corrida parcial no crea ni descarta nada;
   - recalcular el mes sin cambios no duplica: la `ACTIVA` apunta al resultado nuevo y su mensaje se actualiza;
   - una alerta `ATENDIDA` no se recrea;
   - si el municipio sale del rojo (más producción), su alerta pasa a `DESCARTADA`;
   - cada creación, actualización y descarte deja su bitácora con el usuario de la corrida;
   - si `alertarCorrida` falla (`vi.spyOn`), la corrida queda `FALLIDA` y no queda ninguna alerta;
   - la bitácora de la corrida trae `alertas: { creadas, actualizadas, descartadas }`;
   - `GET /alertas` como Epidemiología devuelve solo las de EPIDEMIOLOGIA de su DDRISS.
6. **Frontend.** La tarjeta «Alertas activas» de `InicioEpidemiologia.jsx` con `TarjetaAlertas`. Pruebas en `PaginaInicio.test.jsx`: con el permiso, la tarjeta muestra la alerta del mock; sin él, no llama a `listarAlertas`.
7. **Verificación manual** con la API real, Vite y Playwright: como Epidemiología, recalcular agosto de 2026 desde «Indicadores» (no parcial). Comprobar en `alerta` las «Cobertura mayor al 100 %» de San Marcos, El Rodeo y Esquipulas Palo Gordo (los de la nota de HU-44) y las «Municipio bajo la meta» de los municipios en rojo; medir cuánto tarda la corrida contra la de antes; recalcular otra vez y ver que no se duplica; ver la tarjeta de Epidemiología y la del Revisor, y a 390 px que no desborda. Lo que quede en la base se anota en el `CLAUDE.md` del módulo `alertas`.
8. **Documentación.** Avance de HU-51 y nota en HU-52 en `HISTORIAS_DE_USUARIO.md`, nota en `modulos/alertas/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [ ] `ALERTA_CONSULTAR` está asignado a EPIDEMIOLOGIA en el 05 y en la base de prueba, además de REVISOR y ESTABLECIMIENTO.
- [ ] Una corrida no parcial crea una alerta `CRITICA` «Municipio bajo la meta» por cada municipio en la franja `rojo` de un indicador con `alerta.generar`, para cada rol de su `alerta.rol_destino`.
- [ ] Una corrida no parcial crea una alerta `ADVERTENCIA` «Cobertura mayor al 100 %» por cada municipio con `mayorACien` en un indicador con `alerta.generar`, para cada rol de su `alerta.rol_destino`.
- [ ] Cada alerta indica en su mensaje el municipio, la vacuna, el periodo y el valor, y guarda `municipio_id`, `periodo_id` y `resultado_indicador_id`.
- [ ] Ni la fila departamental, ni las proyecciones, ni los indicadores con `alerta.generar` distinto de `true` generan alertas.
- [ ] Una corrida parcial no crea, no actualiza ni descarta alertas.
- [ ] Recalcular el mismo mes no duplica: la alerta `ACTIVA` se actualiza al resultado nuevo, una `ATENDIDA` o `DESCARTADA` no se recrea y una cuya condición desapareció pasa a `DESCARTADA`.
- [ ] Cada alerta creada, actualizada o descartada deja su bitácora con `modulo: INDICADORES` y el usuario de la corrida.
- [ ] Si la generación falla, la corrida queda `FALLIDA` y no queda ninguna alerta suya.
- [ ] El Inicio de Epidemiología muestra en «Alertas activas» el total, el desglose, la alerta de mayor severidad y «Ver alertas».
- [ ] `GET /alertas` como Epidemiología devuelve solo las de su rol y su DDRISS, y la Autoridad recibe 403.
- [ ] El contrato describe los roles y las clases nuevas, y la API arranca.
- [ ] Pasan `alertasCobertura.test.js`, `alertas.test.js`, `corridas.test.js`, `redesEnIndicadores.test.js`, `PaginaInicio.test.jsx` y la suite del frontend.
- [ ] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** seguir `alerta.generar` y `alerta.rol_destino` de la configuración. Ya existen desde el SPEC 44 y respetan lo que decida Epidemiología en HU-35.
- **No:** solo los indicadores `AVANCE_META_MES`, como dice la historia literalmente. La configuración ya marca cuáles alertan, y la cobertura y la deserción también tienen semáforo.
- **Sí:** «rango más bajo» = la franja `rojo`. Es el color que el semáforo usa para lo peor en los tres tipos (también en la deserción descendente), y los umbrales siguen siendo configurables (80/90 % provisional).
- **Sí:** el color con la misma regla de la pantalla (`colorDelIndicador`), también la cobertura anual contra lo esperado (SPEC 60). La alerta no contradice lo que se ve en «Indicadores» y el mapa.
- **Sí:** mayor al 100 % con `mayorACien` (SPEC 52) y solo con `alerta.generar`. Reutiliza la marca de pantalla y no alerta de indicadores que Epidemiología no quiso vigilar.
- **No:** agrupar en una sola alerta por municipio y vacuna. Cada indicador tiene su propio resultado y su propio `resultado_indicador_id`.
- **Sí:** el `tipo` lo fija la clase, no `alerta.tipo`. La configuración solo admite un tipo por indicador y aquí hay dos clases.
- **Sí:** bajo la meta `CRITICA` y mayor al 100 % `ADVERTENCIA`. La segunda pide revisar sin afirmar un error.
- **Sí:** `ALERTA_CONSULTAR` para EPIDEMIOLOGIA. Es la destinataria de la historia; sin el permiso, sus alertas solo existirían en la tabla.
- **Sí:** mantener y actualizar la alerta activa en cada corrida nueva del mes. El mensaje muestra el valor vigente y una alerta atendida no reaparece.
- **No:** descartar todo y crear de nuevo en cada corrida. Las atendidas reaparecerían.
- **Sí:** solo corridas no parciales. Con meses sin cerrar faltan reportes y el avance sale bajo sin serlo; el cierre del mes y la rectificación ya calculan una corrida completa.
- **Sí:** dentro de la transacción de `guardarCorrida`. Corrida, resultados y alertas quedan coherentes, y un fallo no deja alertas de una corrida que no existe.
- **No:** una transacción aparte después de confirmar. Podría dejar una corrida vigente sin sus alertas.
- **Sí:** mover el cálculo del color a `calculadores.js`. El módulo `alertas` lo necesita y `corridas.service.js` importará `alertas`: dejarlo ahí haría una importación circular.
- **Sí:** solo filas municipales. La historia habla de municipios.
- **No:** otros datos sospechosos (deserción negativa, variación histórica). Los criterios piden solo dos alertas.
- **Sí:** bitácora con `modulo: INDICADORES` y el contexto de la corrida. La alerta nace del cálculo, que tiene usuario (o ninguno, en el cierre automático).
- **Sí:** dejar las alertas de ejemplo de la semilla, como en el SPEC 67. Se atienden desde la pantalla de HU-52.
- **Sí:** el spec va en `specs/indicadores/` y el código en `modulos/alertas/`. HU-51 es de indicadores; las alertas tienen su módulo desde el SPEC 67.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Muchas alertas por corrida (30 municipios × 3 indicadores × 2 roles) alargan la transacción, que bloquea `ddriss`; en Aiven cada viaje cuesta ~130 ms | Las alertas nuevas van en un solo `INSERT` de varias filas y los existentes se leen con una consulta; la bitácora va por alerta. En el paso 7 se mide la corrida y, si pasa de unos segundos, se anota y se decide con el equipo. |
| Un fallo de la generación hace `FALLIDA` una corrida que antes funcionaba | `candidatosDeAlerta` es pura y tiene sus pruebas; el fallo queda en la bitácora de la corrida `FALLIDA`, como cualquier otro. |
| El cierre automático y la rectificación calculan con `calcularSinFallar`: un fallo de alertas deja el mes cerrado sin corrida nueva | Es el comportamiento actual de cualquier fallo del cálculo; se puede recalcular desde «Indicadores». |
| La primera corrida en la base de prueba crea muchas alertas para el Revisor, que ya tiene más de 50 activas (corte de `GET /alertas`) | `total` y `porSeveridad` cuentan todas; la tarjeta solo muestra una. Se anota lo que quedó en el `CLAUDE.md` del módulo. |
| Recalcular agosto de 2026 en la verificación reemplaza la corrida vigente | Ya se hizo en otros specs; se anota el número de la corrida nueva. No se calcula 2025 (nota del SPEC 51). |
| Un `rol_destino` con un código mal escrito no llega a nadie | Se ignora sin fallar; la configuración la valida el SPEC 43. |

## Lo que **no** entra en este spec

- La pantalla Alertas, el ícono de la barra, los filtros y marcar como atendida (HU-52).
- Otros datos sospechosos, alertas departamentales, de red o de proyección.
- Alertas de corridas parciales.
- Editar la configuración de alertas de un indicador.
- Cambios al modelo de datos, a `transicion_estado` o a `package.json`.

Cada uno, si llega, va en su propio spec.
