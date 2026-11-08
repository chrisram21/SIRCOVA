# SPEC 05 — Bitácora de auditoría

> **Estado:** Implementado
> **Historia:** HU-53 (solo backend; la consulta de la bitácora es HU-54)
> **Depende de:** SPEC 01, SPEC 03, SPEC 04
> **Fecha:** 2026-10-20
> **Objetivo:** Fijar desde ahora cómo se registra la bitácora: `registrarBitacora` dentro de la transacción del cambio, con módulos y acciones validados, solo los campos que cambiaron y sin datos sensibles, más el registro de los accesos denegados y triggers que impiden modificarla o borrarla.

## Por qué existe este spec

HU-53 estaba planeada para el Sprint 5, pero cada endpoint nuevo tiene que escribir en la bitácora desde ya (regla 7 de `AGENTS.md`). Los specs 01 y 03 ya lo hacen con `registrarBitacora`. Este spec convierte esa práctica en la regla definitiva, para que los endpoints que vienen la usen igual y no haya que volver a tocarla al final.

La historia decía "middleware de Express". Un middleware no conoce los valores anteriores ni comparte la transacción del cambio, así que se mantiene la función del servicio. HU-53 ya se ajustó en `HISTORIAS_DE_USUARIO.md`.

## Alcance

**Entra:**

- Constantes `MODULOS` y `ACCIONES` en el servicio de auditoría; `registrarBitacora` rechaza un módulo o una acción desconocidos.
- Limpieza automática de campos sensibles en `valoresAnteriores` y `valoresNuevos`.
- `diferencias(antes, despues)`: calcula solo los campos que cambiaron.
- `contextoAuditoria(req)`: usuario, IP y agente de la petición. Login y logout pasan a usarlo.
- `enTransaccion(fn)` en `src/config/mysql.js`, para el patrón "cambio + bitácora (+ MongoDB) y confirmar".
- Registro de los accesos denegados (403) en `requierePermiso`.
- Script `backend/db/06_bitacora_inmutable_mysql.sql` con dos triggers que impiden `UPDATE` y `DELETE` sobre `bitacora`.
- Pruebas de todo lo anterior, incluida una que intenta modificar y borrar la bitácora y espera el error.
- Una línea en `info.description` de `backend/openapi.yaml`, una nota en `CLAUDE.md` y el avance de HU-53.

**Fuera de alcance (para otros specs):**

- `GET /auditoria/bitacora` y la pantalla de auditoría (HU-54).
- Historial de cambios de configuración (HU-55).
- Registrar las escrituras de endpoints que todavía no existen: cada spec registra las suyas con esta convención.
- Escrituras reales en MongoDB: este spec deja la regla y el helper; el primer spec que escriba en MongoDB la aplica.
- Registrar consultas (`GET`) y los 401.
- Un usuario de MySQL sin `UPDATE`/`DELETE` sobre `bitacora` (despliegue, HU-56 y HU-57).
- Migrar `iniciarSesion` a `enTransaccion`.
- Cambios a `01_modelo_relacional_mysql.sql` o a las columnas de `bitacora`.

## Modelo de datos

Este spec **no cambia tablas ni columnas**. Usa `bitacora` del script `01_modelo_relacional_mysql.sql` (v0.8). Solo agrega dos triggers con el script 06.

### Regla para cada escritura

1. El servicio hace el cambio y llama a `registrarBitacora(conexion, datos)` con **la misma conexión**, dentro de `enTransaccion`. Si algo falla, se revierten el cambio y la fila.
2. **Escritura en MongoDB:** dentro de `enTransaccion`, primero `registrarBitacora`, luego la escritura en MongoDB y al final se confirma MySQL. Si MongoDB falla, se revierte y no queda fila.
3. **Crear:** `valoresNuevos` lleva el objeto creado. **Actualizar, desactivar o reactivar:** `valoresAnteriores` y `valoresNuevos` salen de `diferencias(antes, despues)`. Si no cambió nada, no se escribe ni se registra.
4. **Exportar:** acción `EXPORTAR`, con los filtros usados en `valoresNuevos`.
5. Las consultas y los 401 no se registran.

### Servicio de auditoría (`src/modulos/auditoria/auditoria.service.js`)

```js
// Objetos congelados { CLAVE: 'CLAVE' } construidos desde la lista de valores.
export const MODULOS = aEnumeracion(['USUARIOS', 'CONFIGURACION', 'PRODUCCION', 'REVISION',
  'RECTIFICACION', 'INDICADORES', 'REPORTES', 'SISTEMA']);          // el ENUM de bitacora.modulo

export const ACCIONES = aEnumeracion(['LOGIN_OK', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'LOGOUT',
  'CREAR', 'ACTUALIZAR', 'DESACTIVAR', 'REACTIVAR', 'CAMBIO_ESTADO',
  'PUBLICAR_ESQUEMA', 'EXPORTAR', 'ACCESO_DENEGADO']);
```

- Los servicios escriben `modulo: MODULOS.USUARIOS, accion: ACCIONES.LOGOUT`, nunca el texto literal. Un error de dedo da `undefined` y la validación lo rechaza.
- Cada spec que necesite una acción nueva la agrega a `ACCIONES` (máximo 40 caracteres, `MAYUSCULAS_CON_GUION`).
- `registrarBitacora` lanza un `Error` si `modulo` no es un valor de `MODULOS` o `accion` no es un valor de `ACCIONES`. Es un error de programación: dentro de una transacción la revierte y responde 500.
- **Campos sensibles:** antes de guardar, `registrarBitacora` quita de `valoresAnteriores` y `valoresNuevos`, en cualquier nivel del objeto y de sus listas, las claves `contrasena`, `contrasenaActual`, `contrasenaNueva`, `hashContrasena`, `hash_contrasena` y `token`. La comparación ignora mayúsculas y guiones bajos. Claves como `debeCambiarContrasena` no se quitan.
- `diferencias(antes, despues)` compara campo por campo los dos objetos (sin bajar de nivel; las fechas, listas y objetos se comparan por su JSON) y devuelve `{ anteriores, nuevos }` solo con las claves que cambiaron, o `null` si no cambió nada.
- `contextoAuditoria(req)` devuelve `{ usuarioId: req.usuario?.id ?? null, ipOrigen: req.ip, agenteUsuario: req.get('user-agent') ?? null }`. Los controladores se lo pasan al servicio, que lo mezcla con los datos de la fila.

### Transacción (`src/config/mysql.js`)

`enTransaccion(fn)` toma una conexión del pool, abre la transacción, ejecuta `await fn(conexion)`, confirma y devuelve su resultado. Si `fn` lanza un error, revierte y lo vuelve a lanzar. Siempre libera la conexión.

### Accesos denegados (`src/middlewares/permisos.js`)

Cuando `requierePermiso` responde 403, primero escribe con el pool:

| `modulo` | `accion` | `entidad` | `entidad_id` | `usuario_id` | `valores_nuevos` |
|---|---|---|---|---|---|
| `SISTEMA` | `ACCESO_DENEGADO` | `permiso` | código del permiso | id del token | `{ metodo, ruta, motivo: 'SIN_PERMISO' \| 'SOLO_CONSULTA' }` |

- `ruta` es `req.baseUrl + req.path`, sin la cadena de consulta.
- `motivo` es `SOLO_CONSULTA` cuando el 403 se debe a la guardia de `AUTORIDAD`, y `SIN_PERMISO` en los demás casos.
- Si la escritura falla, se anota con `console.error` y se responde 403 igual.
- La respuesta 403 no cambia.

### Script `backend/db/06_bitacora_inmutable_mysql.sql`

- Solo crea triggers: **no borra ni recrea la base y no toca datos**. Se corre después del 01 y se puede volver a correr encima.
- `DROP TRIGGER IF EXISTS` y `CREATE TRIGGER` para:
  - `trg_bitacora_sin_update`, `BEFORE UPDATE ON bitacora`;
  - `trg_bitacora_sin_delete`, `BEFORE DELETE ON bitacora`.
- Ambos hacen `SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La bitácora no se puede modificar ni borrar.'`. Son de una sola sentencia, así que el script no necesita `DELIMITER`.
- `DROP DATABASE`, que usa el 01 para recrear la base, sigue funcionando.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                                ← una línea sobre la bitácora en info.description
├── db/06_bitacora_inmutable_mysql.sql          ← nuevo
├── scripts/crear-usuario.js                    ← usa las constantes
├── src/
│   ├── config/mysql.js                         ← enTransaccion
│   ├── middlewares/permisos.js                 ← registra ACCESO_DENEGADO
│   └── modulos/
│       ├── auditoria/auditoria.service.js      ← MODULOS, ACCIONES, validación, limpieza, diferencias, contextoAuditoria
│       └── auth/auth.controller.js, auth.service.js  ← contextoAuditoria y constantes
└── tests/
    ├── auditoria.test.js                       ← nuevo
    ├── bitacora-inmutable.test.js              ← nuevo
    └── permisos.test.js                        ← casos de ACCESO_DENEGADO
docs/SPECS/HISTORIAS_DE_USUARIO.md              ← avance de HU-53 (la historia ya se ajustó)
CLAUDE.md                                       ← nota de contexto sobre la bitácora
```

## Plan de implementación

1. **Constantes, validación y limpieza.** En `auditoria.service.js`, agregar `MODULOS`, `ACCIONES`, la validación y la limpieza de campos sensibles en `registrarBitacora`. Pruebas en `tests/auditoria.test.js`, contra la base de prueba:
   - un módulo o una acción desconocidos lanzan un error y no escriben nada;
   - una fila con `contrasena`, `hash_contrasena` y `token` anidados en `valoresNuevos` se guarda sin esas claves y conserva `debeCambiarContrasena`.
   Comprobación: `npm test` del backend pasa, incluidas las pruebas actuales de login y logout.
2. **`diferencias` y `contextoAuditoria`.** Agregarlas en `auditoria.service.js`. Pruebas unitarias:
   - `diferencias` devuelve solo las claves que cambiaron;
   - devuelve `null` si no cambió nada;
   - detecta una clave nueva y una que pasó a `null`;
   - `contextoAuditoria` lee usuario, IP y agente de una petición con y sin `req.usuario`.
3. **Migrar auth y crear-usuario.** `auth.controller.js` usa `contextoAuditoria(req)` en lugar de `contextoDe`. `auth.service.js` y `scripts/crear-usuario.js` usan `MODULOS` y `ACCIONES`. Comprobación: las pruebas de `auth.login.test.js` y `auth.logout.test.js` pasan **sin cambios**.
4. **`enTransaccion`.** Agregarla en `src/config/mysql.js`. Pruebas en `tests/auditoria.test.js`:
   - una fila escrita con `registrarBitacora` dentro de `enTransaccion` queda guardada;
   - si `fn` lanza después de escribirla, la fila no existe y el error llega a quien llamó;
   - la conexión se libera en ambos casos.
5. **Accesos denegados.** En `requierePermiso`, registrar `ACCESO_DENEGADO` antes de responder 403. Pruebas en `tests/permisos.test.js`:
   - un token sin el permiso deja una fila con `motivo: SIN_PERMISO`, el `usuario_id` del token, la ruta sin cadena de consulta y el código del permiso;
   - `AUTORIDAD` en `POST` deja `motivo: SOLO_CONSULTA`;
   - un 200 y un 401 no dejan fila.
   Las pruebas de 403 del SPEC 04 siguen pasando sin cambios.
6. **Triggers.** Crear `backend/db/06_bitacora_inmutable_mysql.sql`. **Antes de crearlo y antes de correrlo, pedir confirmación** (zona protegida). Con autorización, correrlo dos veces sobre la base de prueba de Aiven. Pruebas en `tests/bitacora-inmutable.test.js`:
   - primero comprueba en `information_schema.TRIGGERS` que existen los dos triggers; si falta alguno, la prueba falla sin intentar nada;
   - dentro de una transacción que siempre se revierte, un `UPDATE` y un `DELETE` sobre una fila existente fallan con "La bitácora no se puede modificar ni borrar.";
   - ningún archivo de `src/` ni de `scripts/` contiene `UPDATE bitacora` ni `DELETE FROM bitacora`.
7. **Documentación.**
   - En `info.description` de `openapi.yaml`, agregar: "Toda escritura, cada exportación y cada acceso denegado quedan en la bitácora, que no se puede modificar ni borrar."
   - En "Notas de contexto" de `CLAUDE.md`, agregar la regla de escritura: `enTransaccion` + `registrarBitacora` + `diferencias`, constantes, MongoDB dentro de la transacción y el script 06.
   - Actualizar el "Avance" de HU-53 y marcar sus criterios cuando se cumplan los de este spec.

## Criterios de aceptación

- [ ] `npm test` pasa en `backend/` sin desactivar ninguna prueba, y las de login, logout y permisos del SPEC 04 pasan sin cambios.
- [ ] `registrarBitacora` lanza un error con un módulo o una acción que no están en `MODULOS` o `ACCIONES`, y no escribe la fila.
- [ ] Ninguna fila guarda `contrasena`, `contrasenaActual`, `contrasenaNueva`, `hashContrasena`, `hash_contrasena` ni `token`, en ningún nivel de `valores_anteriores` o `valores_nuevos`.
- [ ] `diferencias` devuelve solo los campos que cambiaron, o `null` si no cambió nada.
- [ ] Login y logout toman usuario, IP y agente de `contextoAuditoria(req)` y siguen dejando sus filas como antes.
- [ ] Una fila escrita dentro de `enTransaccion` se confirma con el cambio y desaparece si la función lanza un error.
- [ ] Cada 403 de `requierePermiso` deja una fila `SISTEMA`/`ACCESO_DENEGADO` con el código del permiso, el usuario, el método, la ruta y el motivo. Un 200 y un 401 no dejan fila.
- [ ] `06_bitacora_inmutable_mysql.sql` se puede correr dos veces seguidas sin error y deja los dos triggers en la base de prueba.
- [ ] Un `UPDATE` o un `DELETE` sobre `bitacora` falla con "La bitácora no se puede modificar ni borrar.".
- [ ] Ningún archivo de `src/` ni de `scripts/` contiene `UPDATE bitacora` ni `DELETE FROM bitacora`.
- [ ] `/api/docs` carga y su descripción menciona la bitácora.
- [ ] HU-53 en `HISTORIAS_DE_USUARIO.md` tiene su avance actualizado.

## Decisiones

- **Sí:** `registrarBitacora` dentro de la transacción del cambio, como ya hacen los specs 01 y 03. La fila y el cambio se confirman o se revierten juntos.
- **No:** un middleware de Express, como decía HU-53. No conoce los valores anteriores ni comparte la transacción.
- **Sí:** triggers `BEFORE UPDATE` y `BEFORE DELETE` en un script 06 idempotente. Protegen también contra sentencias escritas a mano.
- **No:** solo una prueba que revise el código. No protege la base. Se mantiene como prueba adicional.
- **No:** por ahora, un usuario de MySQL sin `UPDATE`/`DELETE`. Es lo más correcto, pero toca la configuración de Aiven y del despliegue (HU-56 y HU-57).
- **No:** agregar los triggers al 01. Obliga a recrear la base de prueba.
- **Sí:** solo los campos que cambiaron al actualizar, y el objeto completo al crear. Filas más chicas y fáciles de leer en HU-54.
- **No:** la fila completa antes y después. Repite datos y esconde qué cambió.
- **Sí:** constantes `MODULOS` y `ACCIONES` con validación. El ENUM de MySQL ya rechaza un módulo inválido, pero no una acción con un error de dedo.
- **Sí:** las constantes son objetos congelados (`ACCIONES.LOGOUT`), no listas. Una lista solo se lee por posición, así que los servicios no podrían usarla. Se decidió en el paso 3 de la implementación.
- **Sí:** en `diferencias`, una clave que existe solo de un lado se guarda como `null` del otro, para que no desaparezca del JSON. Se decidió en el paso 2 de la implementación.
- **Sí:** la limpieza de campos sensibles vive en `registrarBitacora`. Protege aunque un servicio los pase por error. Usa una lista de claves exactas para no quitar `debeCambiarContrasena`.
- **Sí:** `contextoAuditoria(req)` y migrar login y logout ahora. Un solo lugar para la IP y el agente.
- **Sí:** `enTransaccion(fn)` para los endpoints nuevos, sin migrar `iniciarSesion`. El login usa `SELECT ... FOR UPDATE` y ya está probado.
- **Sí:** con MongoDB, la fila de bitácora va en una transacción MySQL que se confirma después de escribir en MongoDB. Si MongoDB falla, no queda fila.
- **Sí:** registrar los accesos denegados, con `SISTEMA`/`ACCESO_DENEGADO`. Cambia la decisión del SPEC 04, que los había dejado fuera.
- **Sí:** si no se puede registrar un acceso denegado, se responde 403 igual. Un problema de la bitácora no debe convertir un 403 en 500.
- **Sí:** se registran también los inicios y cierres de sesión, que ya se registraban, y las exportaciones, como pide `AGENTS.md`.
- **No:** registrar las consultas ni los 401. Muchas filas y poco valor; un 401 no tiene un usuario confiable.
- **Sí:** HU-53 se adelanta del Sprint 5 para fijar la regla antes de crear endpoints.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Aiven no permite crear triggers al usuario de la aplicación (binlog) | Se detecta al correr el 06 en el paso 6. Si falla, se detiene el paso y se consulta al equipo antes de cambiar de enfoque. |
| La prueba de inmutabilidad modifica una fila real si faltan los triggers | Revisa primero que existan los dos triggers, y el intento va en una transacción que siempre se revierte. |
| Muchos 403 llenan la bitácora (por ejemplo, un frontend que reintenta) | Una fila por petición denegada. Si crece demasiado, otro spec puede agruparlas. |
| Falla el `COMMIT` de MySQL después de escribir en MongoDB | Caso raro: queda el cambio en MongoDB sin su fila. Se acepta y se anota; el spec que escriba en MongoDB puede agregar una compensación. |
| Un spec nuevo olvida registrar sus escrituras | La nota en `CLAUDE.md` y la regla 7 lo recuerdan; cada spec incluye una prueba que revisa su fila de bitácora. |
| La bitácora de la base de prueba crece con cada corrida de pruebas | Es esperado, igual que en los specs anteriores. |

## Lo que **no** entra en este spec

- `GET /auditoria/bitacora` y su pantalla (HU-54), y el historial de configuración (HU-55).
- Las escrituras de endpoints que aún no existen y las escrituras reales en MongoDB.
- Registrar consultas y 401.
- Un usuario de MySQL sin permisos de modificación sobre `bitacora`.
- Migrar el login a `enTransaccion` y cambiar las columnas de `bitacora`.

Cada uno, si se hace, va en su propio spec.
