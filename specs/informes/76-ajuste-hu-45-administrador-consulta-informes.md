# SPEC 76 — Ajuste HU-45 El Administrador consulta Informes

> **Estado:** Implementado
> **Historia:** HU-45
> **Origen:** ajuste
> **Depende de:** SPEC 62, SPEC 64, SPEC 65 y SPEC 66
> **Fecha:** 2026-11-26
> **Objetivo:** Dar al rol Administrador el permiso `INFORME_CONSULTAR`, para que vea «Informes» en el menú y genere y exporte los informes de producción y el acumulado anual de su DDRISS, como el Revisor y Epidemiología.

## Por qué existe este spec

El SPEC 62 dejó fuera al Administrador a propósito («**No:** el Administrador, que gestiona catálogos y no consolida producción», en sus Decisiones), y las pruebas de `backend/tests/informes.test.js` comprueban que recibe 403. Al revisar el sistema, el equipo decidió (2026-11-26) que el Administrador también cumple un papel de consulta de informes, así que necesita el módulo. Este spec cambia esa decisión.

Todo el módulo depende de un solo permiso, `INFORME_CONSULTAR`. Lo piden los siete endpoints de informes (`/informes/opciones`, `/informes/produccion`, `/informes/acumulado-anual` y sus `/excel` y `/pdf`), y la opción del menú (`frontend/src/componentes/layout/opcionesMenu.js`, `permiso: 'INFORME_CONSULTAR'`). Por eso el cambio de fondo es asignarle ese permiso al rol, sin tocar el código de los endpoints ni el de la pantalla.

**Lo que se decidió en la conversación previa y en la fase de preguntas (2026-11-26):**

- El Administrador ve los informes **solo de su DDRISS**, como el Revisor y Epidemiología. Lo da la regla 10 de `AGENTS.md`, que el servicio de informes ya aplica con `empleado.ddriss_id`.
- Entra **todo el módulo**: los cuatro informes de la pantalla (población propia, total, residencia y acumulado anual), con su Excel y su PDF.
- El menú y la ruta salen solos con el permiso. Si no fuera así, se ajustan en este spec.
- El permiso se aplica en Aiven **volviendo a correr `05_permisos_mysql.sql`**, como en los specs anteriores que agregaron permisos, y se comprueba que dos corridas seguidas no dan errores ni duplicados.
- La descripción del rol en la semilla del `01` cambia a «Gestiona usuarios, catálogos y configuraciones, y consulta informes», y se actualiza también la fila de Aiven.
- La verificación manual con Playwright cubre el menú, los dos tipos de informe y las dos exportaciones.

## Alcance

**Entra:**

- `backend/db/05_permisos_mysql.sql`: `'ADMINISTRADOR'` en el `INSERT IGNORE` de `INFORME_CONSULTAR` (bloque «SPEC 62 (HU-45)»), y su comentario actualizado.
- `backend/db/01_modelo_relacional_mysql.sql`: la descripción del rol `ADMINISTRADOR` en el `INSERT INTO rol` de la semilla.
- Base de prueba en Aiven: correr el `05` dos veces y un `UPDATE` de la descripción del rol (los dos con autorización explícita en la implementación).
- `backend/tests/informes.test.js`: el Administrador pasa de los casos de 403 a los de 200 en los seis `describe` que revisan el permiso.
- Una nota en HU-45 de `docs/SPECS/HISTORIAS_DE_USUARIO.md` y una en `backend/src/modulos/informes/CLAUDE.md`.

**No entra (para otros specs):**

- Permisos nuevos o separados por informe o por formato (por ejemplo, ver sin exportar).
- Que el Administrador vea informes de otras DDRISS.
- Cambios en los endpoints de informes, en `backend/openapi.yaml` o en la pantalla «Informes».
- Otros permisos de consulta para el Administrador (Indicadores, Mapa, Alertas).
- El formulario para agregar municipios y el Excel con una hoja por mes, que van en sus propios specs.

## Modelo de datos

Este spec **no cambia el modelo**: no agrega tablas, columnas, colecciones ni índices. Solo cambia datos semilla:

| Tabla | Cambio |
|---|---|
| `rol_permiso` | Una fila nueva: (`ADMINISTRADOR`, `INFORME_CONSULTAR`) |
| `rol` | `descripcion` de `ADMINISTRADOR`: «Gestiona usuarios, catálogos y configuraciones» → «Gestiona usuarios, catálogos y configuraciones, y consulta informes» |

El bloque del `05` queda así:

```sql
-- SPEC 62 (HU-45): la estadígrafa (Revisor), Epidemiología y la Autoridad generan los informes;
-- SPEC 76: también el Administrador
INSERT IGNORE INTO rol_permiso (rol_id, permiso_id)
SELECT r.id, p.id FROM rol r JOIN permiso p
 WHERE r.codigo IN ('REVISOR', 'EPIDEMIOLOGIA', 'AUTORIDAD', 'ADMINISTRADOR')
   AND p.codigo = 'INFORME_CONSULTAR';
```

La llave primaria de `rol_permiso` es (`rol_id`, `permiso_id`), así que el `INSERT IGNORE` no duplica la fila al volver a correr el `05`.

En Aiven, la descripción se cambia con una sola sentencia, porque el `01` recrea la base y no se vuelve a correr:

```sql
UPDATE rol SET descripcion = 'Gestiona usuarios, catálogos y configuraciones, y consulta informes'
 WHERE codigo = 'ADMINISTRADOR';
```

`backend/openapi.yaml` no cambia: los endpoints siguen con `x-permiso: INFORME_CONSULTAR` y su texto no nombra los roles.

## Plan de implementación

1. **Scripts de la base.** El `INSERT IGNORE` del `05` con `'ADMINISTRADOR'`, con el comentario de arriba, y la descripción del rol en la semilla del `01`. Comprobación: `git diff backend/db/` muestra solo esas dos partes.
2. **Aplicar en Aiven (con autorización).** Correr `05_permisos_mysql.sql` una vez y el `UPDATE` de la descripción. Después, correr el `05` una segunda vez. Comprobación:
   - las dos corridas terminan sin errores;
   - `SELECT r.codigo, COUNT(*) FROM rol_permiso rp JOIN rol r ON r.id = rp.rol_id JOIN permiso p ON p.id = rp.permiso_id WHERE p.codigo = 'INFORME_CONSULTAR' GROUP BY r.codigo` da una fila con 1 para cada uno de `REVISOR`, `EPIDEMIOLOGIA`, `AUTORIDAD` y `ADMINISTRADOR`, y ninguna para `ESTABLECIMIENTO`;
   - el número total de filas de `rol_permiso` es el mismo después de la primera y de la segunda corrida;
   - `SELECT descripcion FROM rol WHERE codigo = 'ADMINISTRADOR'` da la descripción nueva.
3. **Pruebas del backend.** En `backend/tests/informes.test.js`, en los seis casos «el Personal del establecimiento y el Administrador reciben 403» (`/informes/opciones`, `/informes/produccion`, `/excel`, `/pdf`, `/informes/acumulado-anual` y sus exportaciones), queda solo `ESTABLECIMIENTO` y el título pasa a «el Personal del establecimiento recibe 403». El Administrador se agrega a los casos que ya revisan el 200 de los otros roles en cada uno. Comprobación: `informes.test.js` pasa completo.
4. **Frontend.** No cambia código: la opción «Informes» y la ruta `/informes` dependen de `INFORME_CONSULTAR`. Si en la verificación del paso 5 no aparecen para el Administrador, se ajusta `opcionesMenu.js` o la ruta en este paso, con su prueba. Comprobación: `npm test` del frontend pasa completo.
5. **Verificación manual.** Con el backend contra Aiven y Atlas, Vite y Playwright (la persona inicia sesión a mano), como Administrador:
   - «Informes» aparece en el menú y `/informes` abre la pantalla;
   - generar un informe de producción (por ejemplo, población propia) con datos de su DDRISS;
   - generar el acumulado anual;
   - exportar un informe a Excel y otro a PDF, y ver que los archivos se descargan y abren;
   - revisar en la base que las dos exportaciones dejaron su fila `EXPORTAR` en la bitácora con el usuario del Administrador.
6. **Notas y mapa.** La nota en HU-45 (`HISTORIAS_DE_USUARIO.md`), la nota en `backend/src/modulos/informes/CLAUDE.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [x] `05_permisos_mysql.sql` asigna `INFORME_CONSULTAR` a `REVISOR`, `EPIDEMIOLOGIA`, `AUTORIDAD` y `ADMINISTRADOR`.
- [x] Correr el `05` dos veces seguidas en Aiven termina sin errores y no cambia el número de filas de `rol_permiso` en la segunda corrida.
- [x] En Aiven, `rol_permiso` tiene una sola fila (`ADMINISTRADOR`, `INFORME_CONSULTAR`).
- [x] La descripción del rol `ADMINISTRADOR` es «Gestiona usuarios, catálogos y configuraciones, y consulta informes», en el `01` y en Aiven.
- [x] Los siete endpoints de informes responden 200 al Administrador y siguen respondiendo 403 al Personal del establecimiento.
- [x] El Administrador ve solo los datos de su DDRISS en los informes.
- [x] «Informes» aparece en el menú del Administrador y la pantalla genera los cuatro informes y los exporta a Excel y PDF.
- [x] La exportación del Administrador queda en la bitácora como `EXPORTAR`.
- [x] `backend/tests/informes.test.js` y `npm test` del frontend pasan.
- [x] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** darle al Administrador el mismo `INFORME_CONSULTAR` (decidido en la conversación previa). Un solo permiso cubre todo el módulo. **No:** un permiso nuevo solo para el Administrador, que duplicaría las revisiones de los siete endpoints sin cambiar lo que puede hacer.
- **Sí:** todo el módulo, con las exportaciones (decidido en la conversación previa). **No:** ver sin exportar, que obligaría a separar el permiso.
- **Sí:** solo su DDRISS (decidido en la conversación previa). Es la regla 10 y no hay que programarla.
- **Sí:** aplicar el permiso volviendo a correr el `05`, que es idempotente (decidido en la conversación previa; así se hizo en los specs anteriores). **No:** un `INSERT` suelto a mano, que no dejaría el cambio en el script.
- **Sí:** cambiar la descripción del rol en el `01` y en Aiven (decidido en la fase de preguntas), para que no diga que el Administrador solo gestiona. **Sí:** en Aiven con un `UPDATE` de una sola fila (decidido al escribir el spec), porque el `01` recrea la base. **No:** poner el `UPDATE` en el `05`, que solo toca permisos y asignaciones.
- **Sí:** modificar las seis pruebas que esperaban 403 del Administrador (decidido al escribir el spec). El comportamiento cambia a propósito. Las pruebas no se borran ni se desactivan, y siguen revisando el 403 del Personal del establecimiento.
- **Sí:** origen `ajuste` sobre HU-45 (decidido en la fase de preguntas): la historia ya está terminada (SPEC 62), y este spec cambia una de sus decisiones, igual que el SPEC 73.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Una sesión de Administrador abierta antes del cambio no ve «Informes» hasta volver a cargar sus permisos | En la verificación manual se cierra la sesión y se vuelve a entrar después del paso 2. Si hiciera falta, se anota en la nota del módulo. |
| Correr el `05` en Aiven aplica también cualquier otro cambio que tenga el script y que aún no esté en la base | El `05` está al día con `main`, y sus «Asignaciones retiradas» ya se corrieron antes. Antes de correrlo se revisa `git diff main -- backend/db/05_permisos_mysql.sql`, que debe mostrar solo este cambio. |
| La cuenta de Administrador de prueba no tiene producción cerrada en su DDRISS y el informe sale vacío | Se elige un rango con meses cerrados de San Marcos, o se marca «Incluir aprobados sin cerrar». |

## Lo que **no** entra en este spec

- Permisos separados por informe o por formato.
- Informes de otras DDRISS para el Administrador.
- Cambios en los endpoints, el contrato o la pantalla de Informes.
- Otros módulos de consulta para el Administrador.
- El formulario de municipios y el Excel con una hoja por mes.
