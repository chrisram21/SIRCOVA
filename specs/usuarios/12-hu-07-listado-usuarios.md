# SPEC 12 — Listado de usuarios con búsqueda, filtros y paginación

> **Estado:** Implementado
> **Historia:** HU-07
> **Depende de:** SPEC 04, SPEC 06, SPEC 07, SPEC 08, SPEC 10
> **Fecha:** 2026-10-22
> **Objetivo:** Que el Administrador encuentre una cuenta en `/usuarios` buscando por nombre o usuario y filtrando por rol, establecimiento y estado, con un listado paginado en el servidor.

## Por qué existe este spec

El SPEC 08 dejó un listado mínimo: `GET /usuarios` devuelve **un arreglo** con todas las cuentas de la DDRISS, sin parámetros, y `PaginaUsuarios.jsx` las muestra en una sola tabla con sus acciones. HU-07 agrega lo que falta: búsqueda, filtros y paginación.

La respuesta pasa de arreglo a objeto paginado. Es la primera respuesta paginada de la API, así que su forma (`{ elementos, total, pagina, porPagina }`) queda como **convención** para la bitácora, la bandeja de revisión y los demás listados. Por eso se define como un esquema reutilizable en el contrato.

No hay mockup de Usuarios. La barra de filtros y la paginación siguen el patrón del mockup de Auditoría (pantalla 7 de `descripcion_pantallas.md`): filtros arriba, "Mostrando 1 a 20 de 57", filas por página y Anterior/Siguiente con números.

## Alcance

**Entra:**

- Parámetros `busqueda`, `rolId`, `establecimientoId`, `estado`, `pagina` y `porPagina` en `GET /usuarios`, con filtro y paginación en SQL.
- Respuesta paginada `{ elementos, total, pagina, porPagina }` y el esquema `PaginaUsuarios` en `backend/openapi.yaml`, más los parámetros nuevos.
- 400 `ENTRADA_INVALIDA` ante un parámetro inválido.
- Barra de filtros en `/usuarios`: búsqueda, Select de rol, Select de establecimiento (con "Sede de la DDRISS") y Select de estado.
- Paginación con el componente Pagination de shadcn y selector de filas por página (10, 20 o 50).
- Búsqueda, filtros y página guardados en la URL con `useSearchParams`.
- Ajuste de las pruebas del backend y del frontend que usan `GET /usuarios` como arreglo; ningún caso se quita.
- Pruebas nuevas del backend (contra la base de prueba) y del frontend (con `vi.mock` sobre `src/api/`).
- Verificación manual con Playwright.
- Avance de HU-07 en `HISTORIAS_DE_USUARIO.md` y nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Ordenar por columna.
- Buscar por correo, cargo o CUI.
- Listar empleados sin cuenta (`GET /empleados` sigue sin implementar).
- Exportar el listado a Excel o PDF.
- Cambiar las acciones de cada fila (Editar, Desactivar, Restaurar, Desbloquear, Restablecer contraseña).
- Paginar otros endpoints (`/bitacora`, `/reportes`, `/empleados`); cada uno usa esta convención en su propio spec.
- Permisos nuevos o cambios a `05_permisos_mysql.sql`.

## Modelo de datos

Este spec **no cambia el modelo** ni los permisos: filtra las columnas que ya lee `CONSULTA_DETALLE` en `usuarios.service.js` (`usuario`, `empleado`, `rol`, `establecimiento`, `municipio`). `GET /usuarios` sigue con `USUARIO_CONSULTAR`.

### `GET /usuarios` (`USUARIO_CONSULTAR`)

**Parámetros** (todos opcionales, en la cadena de consulta):

| Parámetro | Valores | Filtro |
|---|---|---|
| `busqueda` | Texto de hasta 100 caracteres. Se quitan los espacios de los extremos y se reducen los dobles; vacío equivale a no enviarlo | `CONCAT(e.nombres, ' ', e.apellidos) LIKE ? OR u.nombre_usuario LIKE ?`, con `%texto%` |
| `rolId` | Entero positivo | `u.rol_id = ?` |
| `establecimientoId` | Entero positivo, o la palabra `ninguno` | `e.establecimiento_id = ?`, o `e.establecimiento_id IS NULL` con `ninguno` |
| `estado` | `ACTIVA`, `DESACTIVADA` o `BLOQUEADA` | Ver la tabla siguiente |
| `pagina` | Entero ≥ 1; por defecto 1 | `OFFSET (pagina - 1) * porPagina` |
| `porPagina` | Entero de 1 a 100; por defecto 20 | `LIMIT porPagina` |

| `estado` | Condición |
|---|---|
| `ACTIVA` | `u.activo = TRUE` (incluye las bloqueadas, que siguen activas) |
| `DESACTIVADA` | `u.activo = FALSE` |
| `BLOQUEADA` | `u.activo = TRUE AND u.bloqueado_hasta > NOW()`, la misma condición de `CUENTA_BLOQUEADA` |

- Los parámetros usan los nombres de `components/parameters/Pagina` y `PorPagina`, que ya existen en el contrato.
- En `busqueda`, los caracteres `\`, `%` y `_` se escapan antes de armar el patrón, así que se buscan tal cual. La intercalación `utf8mb4_0900_ai_ci` de la base ya compara sin distinguir mayúsculas ni tildes: `lopez` encuentra "López".
- El ámbito por DDRISS (`filtroAlcance` sobre `e.ddriss_id`) se aplica siempre, antes de los filtros. Un `rolId` o un `establecimientoId` que no existe o que es de otra DDRISS no es un error: devuelve una lista vacía.
- El orden no cambia: `e.apellidos, e.nombres, u.id`.
- Las condiciones se arman en el servicio con `?` y un arreglo de parámetros, sin concatenar valores del usuario.
- `total` sale de un `SELECT COUNT(*)` con el mismo `WHERE`. Las dos consultas usan el mismo armado de condiciones.

**Respuesta 200** (esquema `PaginaUsuarios`):

```json
{
  "elementos": [ /* UsuarioDetalle, igual que en el SPEC 08 y el SPEC 10 */ ],
  "total": 57,
  "pagina": 2,
  "porPagina": 20
}
```

- `total` es el número de cuentas que cumplen los filtros, sin paginar.
- Una `pagina` mayor que la última **no** es un error: responde 200 con `elementos: []` y el `total` real.
- `UsuarioDetalle` no cambia: nunca devuelve el hash, los intentos fallidos ni la fecha del bloqueo.

**Errores:**

| HTTP | `codigo` | Caso | Mensaje |
|---|---|---|---|
| 400 | `ENTRADA_INVALIDA` | `pagina` no es un entero ≥ 1 | "pagina debe ser un número entero mayor o igual a 1." |
| 400 | `ENTRADA_INVALIDA` | `porPagina` no es un entero de 1 a 100 | "porPagina debe ser un número entero entre 1 y 100." |
| 400 | `ENTRADA_INVALIDA` | `rolId` no es un entero positivo | "rolId debe ser un número entero positivo." |
| 400 | `ENTRADA_INVALIDA` | `establecimientoId` no es un entero positivo ni `ninguno` | "establecimientoId debe ser un número entero positivo o 'ninguno'." |
| 400 | `ENTRADA_INVALIDA` | `estado` no es uno de los tres valores | "estado debe ser ACTIVA, DESACTIVADA o BLOQUEADA." |
| 400 | `ENTRADA_INVALIDA` | `busqueda` tiene más de 100 caracteres | "busqueda: como máximo 100 caracteres." |
| 400 | `ENTRADA_INVALIDA` | Un parámetro que no está en la lista, o uno repetido (`?estado=ACTIVA&estado=BLOQUEADA`) | "Parámetro no permitido: {nombre}." o "{nombre} no se puede repetir." |

Los 401 y 403 no cambian.

### Esquemas nuevos en el contrato

- `PaginaUsuarios`: `{ elementos: UsuarioDetalle[], total: integer, pagina: integer, porPagina: integer }`, todos obligatorios.
- La descripción de `PaginaUsuarios` dice que es la forma de toda respuesta paginada de la API, para que los specs siguientes la copien con su propio tipo de elemento.

### Frontend

**`src/api/usuarios.js`.** `listarUsuarios(filtros)` recibe `{ busqueda, rolId, establecimientoId, estado, pagina, porPagina }`, arma la cadena de consulta solo con los valores que tienen algo y devuelve la respuesta paginada.

**URL.** Los filtros viven en la cadena de consulta de `/usuarios`, con los mismos nombres que la API: `/usuarios?busqueda=ana&rolId=3&establecimientoId=ninguno&estado=ACTIVA&pagina=2&porPagina=50`.

- Se leen y escriben con `useSearchParams` de `react-router-dom`.
- Un valor por defecto no se escribe en la URL (`pagina=1`, `porPagina=20`, filtros vacíos).
- Un valor inválido en la URL (por ejemplo `pagina=abc` o `estado=OTRO`) se ignora y se usa el valor por defecto. El frontend nunca envía a la API un parámetro inválido.
- Cambiar la búsqueda, un filtro o las filas por página vuelve a la página 1.
- Al volver de `/usuarios/:id/editar` con "Volver a Usuarios" o con Atrás, el navegador conserva la URL anterior. Los enlaces "Volver a Usuarios" siguen apuntando a `/usuarios` (sin filtros), como hoy.

**Barra de filtros** (encima de la tabla, en una fila que se acomoda en varias líneas en pantallas angostas):

| Control | Componente | Opciones |
|---|---|---|
| Búsqueda | Input con el ícono `Search` y `aria-label="Buscar por nombre o usuario"`; placeholder "Buscar por nombre o usuario" | Pide a la API 300 ms después de la última tecla |
| Rol | Select, `aria-label="Filtrar por rol"` | "Todos los roles" y los roles de `GET /roles` |
| Establecimiento | Select, `aria-label="Filtrar por establecimiento"` | "Todos los establecimientos", "Sede de la DDRISS" (`ninguno`) y los establecimientos de `GET /establecimientos`, activos e inactivos; los inactivos con " (inactivo)" al final |
| Estado | Select, `aria-label="Filtrar por estado"` | "Todos los estados", "Activas", "Desactivadas", "Bloqueadas" |
| Limpiar | Button `variant="ghost"`, "Limpiar filtros" | Solo aparece si hay algún filtro o búsqueda; deja la URL en `/usuarios` |

- Los catálogos de los Select se piden una vez al cargar la página, en paralelo con el listado.
- El Select de rol solo aparece con `ROL_CONSULTAR`, y el de establecimiento solo con `ESTABLECIMIENTO_CONSULTAR`. Hoy el Administrador tiene los dos.
- Si falla un catálogo, su Select queda deshabilitado y se muestra un Alert "No se pudieron cargar los filtros: {mensaje}". El listado sigue funcionando.

**Tabla.** Las columnas, los Badge y las acciones de cada fila no cambian (SPEC 08 y SPEC 10).

- **Cuentas bloqueadas:** con cualquier filtro de estado, y en particular con "Activas", una cuenta bloqueada muestra los dos Badge de la columna Estado, "Activa" y "Bloqueada" (`variant="destructive"`), como desde el SPEC 10. Así se distingue de las activas sin bloqueo aunque el filtro "Activas" las incluya.

- **Carga:** al cambiar la URL se pide `listarUsuarios(filtros)`. La primera vez se ven los Skeleton de hoy. En las siguientes, la tabla anterior queda visible con `aria-busy="true"` hasta que llega la respuesta, para que no salte.
- **Respuestas viejas:** si llega la respuesta de una petición que ya no corresponde a la URL actual, se descarta.
- **Error:** el Alert de hoy, "No se pudieron cargar las cuentas: {mensaje}". La barra de filtros sigue visible para poder cambiarlos.
- **Sin cuentas y sin filtros:** "No hay cuentas registradas en su DDRISS." (como hoy).
- **Sin cuentas con filtros:** "No hay cuentas que coincidan con la búsqueda o los filtros." y el botón "Limpiar filtros".
- **Página fuera de rango** (`elementos` vacío y `total` > 0): la URL se reemplaza por la última página (`replace`, sin agregar al historial).
- **Después de una acción** (Desactivar, Restaurar, Desbloquear, Restablecer contraseña): la fila se reemplaza en su lugar con la respuesta, como hoy, aunque ya no cumpla el filtro. No se vuelve a pedir la página. Al cambiar un filtro o la página, la lista se actualiza.

**Pie de la tabla** (solo si `total` > 0):

- A la izquierda, "Mostrando {desde} a {hasta} de {total}" (por ejemplo, "Mostrando 21 a 40 de 57").
- En el centro o a la derecha, "Filas por página" con un Select de 10, 20 y 50.
- A la derecha, el componente Pagination de shadcn: "Anterior", los números de página y "Siguiente". Se ven la primera y la última página, la actual y una a cada lado, y elipsis donde faltan números (`1 … 4 5 6 … 12`). "Anterior" está deshabilitado en la página 1 y "Siguiente" en la última. La página actual lleva `aria-current="page"`.
- Con una sola página, la paginación no se muestra, pero el texto "Mostrando…" y "Filas por página" sí.

### Archivos que aparecen o cambian

```
backend/
├── openapi.yaml                               ← parámetros de GET /usuarios, PaginaUsuarios, 400
├── src/modulos/usuarios/
│   ├── usuarios.controller.js                 ← pasa req.query al servicio
│   └── usuarios.service.js                    ← leerFiltros, condiciones, COUNT y LIMIT/OFFSET
└── tests/usuarios.test.js                     ← casos de HU-07; casos de SPEC 08 y 10 ajustados
frontend/src/
├── components/ui/pagination.jsx               ← shadcn
├── api/usuarios.js                            ← listarUsuarios(filtros)
├── componentes/RutaProtegida.test.jsx         ← el mock de listarUsuarios, si hace falta
└── paginas/usuarios/
    ├── PaginaUsuarios.jsx                     ← URL, carga paginada, estados vacíos
    ├── FiltrosUsuarios.jsx                    ← nuevo: barra de filtros
    ├── PaginacionUsuarios.jsx                 ← nuevo: pie con "Mostrando…", filas por página y Pagination
    └── PaginaUsuarios.test.jsx                ← casos de HU-07; casos de SPEC 08 y 10 ajustados
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-07
CLAUDE.md                                      ← nota sobre la respuesta paginada
```

## Plan de implementación

1. **Contrato.** En `backend/openapi.yaml`, en `GET /usuarios`: los parámetros `busqueda`, `rolId`, `establecimientoId` (entero o `ninguno`), `estado` (enum) y los `$ref` a `Pagina` y `PorPagina`; la respuesta 200 con el esquema nuevo `PaginaUsuarios`; la respuesta 400 con un ejemplo por tipo de parámetro inválido. Quitar de la descripción "Versión mínima, sin búsqueda, filtros ni paginación" y explicar el escape de la búsqueda, el estado `BLOQUEADA` y la página fuera de rango. Comprobación: `/api/docs` carga sin errores y muestra los parámetros y el esquema.
2. **Backend: filtros y paginación.** En `usuarios.service.js`, una función `leerFiltros(query)` que valida y limpia los parámetros (400 `ENTRADA_INVALIDA` con los mensajes del "Modelo de datos") y una que arma `{ condicion, parametros }` a partir del ámbito y los filtros. `listarUsuarios(usuario, query)` corre el `COUNT(*)` y la consulta con `LIMIT ? OFFSET ?`, y devuelve `{ elementos, total, pagina, porPagina }`. El controlador pasa `req.query`. En el mismo paso se **ajustan** las pruebas que leían el arreglo (`tests/usuarios.test.js`, hoy en los casos de "GET /usuarios devuelve…", "GET /usuarios/{id} devuelve la misma cuenta que el listado" y "GET /usuarios trae bloqueada…"): leen `res.body.elementos` y buscan la cuenta creada con `?busqueda={nombreUsuario}`, para no depender de que quepa en la primera página; el que compara con el total de la DDRISS compara con `res.body.total`. Ningún caso se quita. Comprobación: `npm test` del backend pasa completo.
3. **Backend: pruebas de HU-07.** En `tests/usuarios.test.js`, un `describe` con el prefijo `vitest-hu07-`, que crea sus cuentas por la API o por SQL (con `debe_cambiar_contrasena = FALSE`) y las borra en `afterAll`, sin iniciar sesión con ellas:
   - `busqueda` con parte del nombre y apellido juntos ("Ana López") encuentra la cuenta, y con parte del nombre de usuario también;
   - `busqueda` sin tildes ni mayúsculas (`lopez`) encuentra "López";
   - `busqueda` con `%` o `_` no se toma como comodín: `%` no devuelve todas las cuentas;
   - `rolId` devuelve solo cuentas de ese rol;
   - `establecimientoId` devuelve solo cuentas de ese establecimiento, y `ninguno` solo las que no tienen;
   - `estado=ACTIVA`, `DESACTIVADA` y `BLOQUEADA` devuelven lo que dice la tabla; una bloqueada aparece en `ACTIVA` y en `BLOQUEADA`;
   - con `porPagina=2`, las páginas 1 y 2 no repiten cuentas, `total` es el mismo en las dos y `elementos` tiene como máximo 2;
   - una página mayor que la última responde 200 con `elementos: []` y el `total` real;
   - con un token de otra DDRISS (como en el SPEC 08), las cuentas del prefijo no aparecen ni cuentan en `total`;
   - `pagina=0`, `porPagina=101`, `rolId=abc`, `establecimientoId=otro`, `estado=OTRO`, `busqueda` de 101 caracteres, un parámetro desconocido y un parámetro repetido responden 400 `ENTRADA_INVALIDA`;
   - ningún elemento trae `hashContrasena`, `intentosFallidos` ni `bloqueadoHasta`.
   Comprobación: `npm test` del backend pasa y no deja cuentas ni empleados del prefijo en la base.
4. **Frontend: API y paginación en la URL.** `npx shadcn@latest add pagination` y revisar que `package.json` no cambie fuera de la lista de `AGENTS.md`. `listarUsuarios(filtros)` en `src/api/usuarios.js`. En `PaginaUsuarios.jsx`: leer los filtros de la URL, pedir la página, descartar respuestas viejas, los estados vacíos y la página fuera de rango. Crear `PaginacionUsuarios.jsx` con el pie. **Ajustar** las pruebas de `PaginaUsuarios.test.jsx` para que el mock de `listarUsuarios` devuelva `{ elementos, total, pagina, porPagina }`; ningún caso se quita. Agregar:
   - al cargar `/usuarios`, `listarUsuarios` recibe `{ pagina: 1, porPagina: 20 }`;
   - con 57 cuentas, el pie muestra "Mostrando 1 a 20 de 57" y la paginación; "Siguiente" pone `pagina=2` en la URL y vuelve a pedir;
   - "Anterior" está deshabilitado en la página 1;
   - con una sola página, no hay paginación pero sí "Mostrando…";
   - cambiar "Filas por página" a 50 pide `porPagina: 50` y `pagina: 1`;
   - con la URL `?pagina=abc`, se pide la página 1;
   - si la página pedida viene vacía con `total` > 0, se pide la última;
   - si la respuesta de una petición vieja llega después de la nueva, la tabla muestra la nueva.
   Comprobación: `npm test` del frontend pasa.
5. **Frontend: barra de filtros.** Crear `FiltrosUsuarios.jsx` y usarlo en `PaginaUsuarios.jsx`, con los catálogos de `@/api/catalogos.js` (o donde ya estén `listarRoles` y `listarEstablecimientos`). Pruebas en `PaginaUsuarios.test.jsx`, con `vi.mock` sobre `@/api/usuarios.js` y `@/api/catalogos.js` y temporizadores falsos para la espera:
   - escribir en la búsqueda no pide nada antes de 300 ms y después pide una sola vez con `busqueda` y `pagina: 1`;
   - elegir un rol, "Sede de la DDRISS" o "Bloqueadas" pide con `rolId`, `establecimientoId: 'ninguno'` o `estado: 'BLOQUEADA'`, y vuelve a la página 1;
   - con el filtro "Activas" y una respuesta con una cuenta bloqueada y otra sin bloqueo, la bloqueada muestra los Badge "Activa" y "Bloqueada", y la otra solo "Activa";
   - con la URL `?estado=DESACTIVADA&busqueda=ana`, los controles muestran esos valores y se pide con ellos;
   - "Limpiar filtros" aparece solo con un filtro activo y deja la URL en `/usuarios`;
   - sin resultados con filtros, se ve "No hay cuentas que coincidan con la búsqueda o los filtros.";
   - sin `ROL_CONSULTAR` no aparece el Select de rol;
   - si falla `GET /roles`, el Select de rol queda deshabilitado, aparece el aviso y la tabla se carga igual;
   - después de desactivar una cuenta con el filtro "Activas", la fila sigue visible con el Badge "Desactivada" y `listarUsuarios` no se vuelve a llamar.
   Comprobación: `npm test` del frontend pasa completo.
6. **Verificación manual y documentación.** Con el backend contra Aiven y Playwright, como Administrador: buscar `prueba.hu05` y "lopez" sin tilde; filtrar por rol Revisor, por "Sede de la DDRISS" y por "Desactivadas"; poner 10 filas por página y pasar a la página 2 si hay más de 10 cuentas; entrar a "Editar" de una cuenta filtrada y volver con Atrás, comprobando que se conservan la búsqueda, los filtros y la página; abrir en `/api/docs` un `GET /usuarios?pagina=0` y ver el 400. Marcar los criterios de HU-07 y escribir su "Avance" en `HISTORIAS_DE_USUARIO.md`. Nota en "Notas de contexto" de `CLAUDE.md`: la forma `{ elementos, total, pagina, porPagina }` es la convención de toda respuesta paginada, los parámetros inválidos responden 400 y una página fuera de rango responde 200 vacía.

## Criterios de aceptación

- [ ] `backend/openapi.yaml` documenta los parámetros de `GET /usuarios`, el esquema `PaginaUsuarios` y la respuesta 400, y `/api/docs` carga sin errores.
- [ ] `npm test` pasa en `backend/` y en `frontend/` sin desactivar ni quitar ninguna prueba, y las pruebas del backend no dejan cuentas ni empleados en la base.
- [ ] `frontend/package.json` solo contiene dependencias de la lista de `AGENTS.md`.
- [ ] `GET /usuarios` responde `{ elementos, total, pagina, porPagina }`, con `pagina` 1 y `porPagina` 20 si no se envían.
- [ ] `busqueda` encuentra una cuenta por parte del nombre completo o del nombre de usuario, sin distinguir mayúsculas ni tildes, y trata `%` y `_` como texto.
- [ ] `rolId`, `establecimientoId` (incluido `ninguno`) y `estado` (`ACTIVA`, `DESACTIVADA`, `BLOQUEADA`) devuelven solo las cuentas que los cumplen, y se pueden combinar entre sí y con la búsqueda.
- [ ] `total` cuenta todas las cuentas que cumplen los filtros dentro del ámbito, y dos páginas seguidas no repiten cuentas.
- [ ] Una página mayor que la última responde 200 con `elementos: []` y el `total` real.
- [ ] Un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA`.
- [ ] Ninguna cuenta de otra DDRISS aparece ni se cuenta en `total`.
- [ ] Ningún elemento de la respuesta contiene el hash, los intentos fallidos ni la fecha del bloqueo.
- [ ] En `/usuarios` puedo buscar por nombre o usuario y filtrar por rol, establecimiento ("Sede de la DDRISS" incluida) y estado, y la tabla se actualiza sin pulsar un botón.
- [ ] Con el filtro "Activas" también salen las cuentas bloqueadas, y cada una muestra el Badge "Bloqueada" junto a "Activa".
- [ ] La búsqueda pide a la API una sola vez, 300 ms después de la última tecla.
- [ ] Cambiar la búsqueda, un filtro o las filas por página vuelve a la página 1.
- [ ] El pie muestra "Mostrando X a Y de Z", el selector de 10, 20 o 50 filas y la paginación con Anterior, números y Siguiente.
- [ ] La búsqueda, los filtros y la página quedan en la URL, y se conservan al recargar y al volver con Atrás desde "Editar".
- [ ] Un valor inválido en la URL no llega a la API: se usa el valor por defecto.
- [ ] Sin resultados con filtros se ve "No hay cuentas que coincidan con la búsqueda o los filtros." con "Limpiar filtros".
- [ ] Después de una acción en una fila, la fila se actualiza en su lugar y no se vuelve a pedir la página.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-07 tiene su avance y sus tres criterios marcados, y `CLAUDE.md` tiene la nota de la respuesta paginada.

## Decisiones

- **Sí:** búsqueda, filtros y paginación en el servidor, con `LIMIT`/`OFFSET` y un `COUNT(*)` con el mismo `WHERE`. Es lo que pide la HU y no depende de cuántas cuentas haya.
- **No:** filtrar y paginar en el cliente. No cumple "endpoint `GET /usuarios` con parámetros de filtro y paginación" y trae todas las cuentas en cada carga.
- **Sí:** respuesta `{ elementos, total, pagina, porPagina }`, documentada como la convención de toda respuesta paginada. Es plana, en español, y el frontend calcula las páginas con `total` y `porPagina`.
- **No:** `{ datos, paginacion: {...} }`. Agrega un nivel de anidación sin ganar nada.
- **No:** arreglo con el total en una cabecera `X-Total`. Hay que exponerla en CORS y no se ve bien en Swagger.
- **Sí:** reutilizar los parámetros `Pagina` y `PorPagina` que ya están en el contrato (por defecto 20, máximo 100).
- **Sí:** estado `ACTIVA`, `DESACTIVADA` o `BLOQUEADA`, en mayúsculas como los demás enum del contrato. `BLOQUEADA` es un subconjunto de `ACTIVA`, porque una cuenta bloqueada sigue activa. El filtro de bloqueadas sirve para encontrar las que hay que desbloquear (SPEC 10). Con "Activas", cada bloqueada se distingue por su Badge "Bloqueada" junto a "Activa"; lo pidió el equipo al revisar el spec.
- **Sí:** la búsqueda cubre el nombre completo (`nombres apellidos`) y el nombre de usuario, como dice la HU. **No:** el correo, el cargo ni el CUI (el CUI no se puede buscar: solo se guarda su huella).
- **Sí:** buscar en `CONCAT(nombres, ' ', apellidos)` y no en cada columna por separado, para que "Ana López" encuentre a la persona.
- **Sí:** escapar `\`, `%` y `_` en la búsqueda. Sin eso, buscar `%` devolvería todas las cuentas.
- **Sí:** confiar en `utf8mb4_0900_ai_ci` para ignorar mayúsculas y tildes. Es la intercalación del script 01; no hace falta normalizar en JavaScript.
- **Sí:** `establecimientoId=ninguno` para las cuentas de la sede de la DDRISS. La tabla ya muestra "DDRISS" en esas filas, y sin la opción solo se podrían encontrar filtrando por rol.
- **No:** `establecimientoId=0` para "sin establecimiento". Un número que no es un id confunde; `ninguno` se lee solo.
- **Sí:** un parámetro inválido, desconocido o repetido responde 400 `ENTRADA_INVALIDA`, como un cuerpo mal formado. **No:** corregirlo sin avisar, porque esconde errores del cliente.
- **Sí:** una página mayor que la última responde 200 vacía con el `total`. Puede pasar sin error del cliente, por ejemplo si se desactivan cuentas entre dos peticiones, y el frontend la corrige yendo a la última página.
- **Sí:** un `rolId` o `establecimientoId` que no existe, o de otra DDRISS, devuelve una lista vacía y no un 404 o un 422. Es un filtro, no un recurso; así tampoco se revela qué existe en otra DDRISS.
- **Sí:** orden fijo por apellidos, nombres e id. **No:** ordenar por columna; la HU no lo pide.
- **Sí:** los filtros se aplican al momento y la búsqueda espera 300 ms después de la última tecla. **No:** un botón "Buscar"; con cuatro controles, un paso más no aporta.
- **Sí:** búsqueda, filtros y página en la URL con `useSearchParams`. Se conservan al volver de "Editar", al recargar y con Atrás, y la URL se puede compartir.
- **No:** guardarlos en `useState`. Al volver de la edición se perderían.
- **Sí:** los enlaces "Volver a Usuarios" de las páginas de registro y edición siguen apuntando a `/usuarios` sin filtros. Atrás sí conserva los filtros, y cambiar esos enlaces obligaría a pasar los filtros entre páginas.
- **Sí:** cambiar la búsqueda, un filtro o las filas por página vuelve a la página 1. La página anterior puede no existir con el filtro nuevo.
- **Sí:** después de una acción, la fila se reemplaza en su lugar aunque ya no cumpla el filtro. El administrador ve el resultado de lo que hizo y no hay una petición extra. **No:** volver a pedir la página, porque la fila desaparecería junto con el aviso de lo que pasó.
- **Sí:** selector de 10, 20 o 50 filas por página, por defecto 20, como "filas por página" del mockup de Auditoría y el valor por defecto del contrato.
- **Sí:** el Pagination de shadcn, que ya figura en `descripcion_pantallas.md` para la paginación. Se instala con su CLI y no agrega dependencias fuera de la lista.
- **Sí:** la barra de filtros y el pie van en `FiltrosUsuarios.jsx` y `PaginacionUsuarios.jsx`, para que `PaginaUsuarios.jsx` (ya con cinco acciones y dos diálogos) no siga creciendo.
- **Sí:** los Select de rol y de establecimiento dependen de `ROL_CONSULTAR` y `ESTABLECIMIENTO_CONSULTAR`, los permisos de los endpoints que los llenan. Si un catálogo falla, el listado sigue funcionando.
- **Sí:** el Select de establecimiento incluye los inactivos, marcados "(inactivo)". Una cuenta puede seguir ligada a un establecimiento desactivado.
- **Sí:** las pruebas del SPEC 08 y del SPEC 10 que leían el arreglo se ajustan para leer `elementos` y buscar su cuenta con `busqueda`. Con la paginación, la cuenta creada puede no estar en la primera página.
- **Sí:** se ajustaron cuatro pruebas del backend, no tres: también "GET /usuarios/{id} de otra DDRISS o inexistente…", que esperaba `[]` del listado ajeno. Decidido durante la implementación.
- **Sí:** el parámetro común `PorPagina` del contrato recibe `minimum: 1`, para que coincida con el rango de 1 a 100. Ningún otro endpoint implementado lo usa todavía. Decidido durante la implementación.
- **Sí:** las pruebas de HU-07 usan cuatro cuentas con el mismo apellido, `López` más una marca de 10 letras al azar (la regla de apellidos no acepta números), para que la búsqueda no encuentre cuentas de otras corridas en la base compartida. Las de los comodines exigen `total: 0`, porque ningún nombre válido contiene `%`, `\` ni `L_pez`. Decidido durante la implementación.
- **Sí:** en la URL, `porPagina` solo vale si es 10, 20 o 50; otro valor se ignora y se usa 20. La API acepta de 1 a 100, pero el selector no puede mostrar otros valores. Decidido durante la implementación.
- **Sí:** los enlaces de la paginación llevan su URL real en `href` (se pueden abrir en otra pestaña) y navegan con React Router. Uno deshabilitado ("Anterior" en la página 1, "Siguiente" en la última) apunta a la página actual, porque su destino no existe; se encontró en la verificación manual. Decidido durante la implementación.
- **Sí:** `FiltrosUsuarios.jsx` pide sus propios catálogos al montarse, en paralelo con el listado, y solo los que su permiso permite. La barra y el selector de filas van dentro de un `<form>` para que Radix agregue el `<select>` nativo con el que las pruebas cambian el valor, como en las otras pantallas. Decidido durante la implementación.
- **Sí:** el efecto que pide la página depende solo de la consulta canónica de la URL, porque React Router 7 crea un `setSearchParams` nuevo en cada cambio de URL. Decidido durante la implementación.
- **Sí:** la verificación manual se hizo con Playwright contra Aiven; la persona inició sesión a mano en la pestaña, para que la contraseña de prueba no pasara por la conversación. `/api/docs` y los 400 se comprobaron con `fetch` desde la misma pestaña. Decidido durante la implementación.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Las pruebas de los SPEC 08 y 10 se rompen al cambiar la respuesta a objeto | El paso 2 las ajusta junto con el cambio del servicio, y corre toda la suite. Ningún caso se quita. |
| Las pruebas del backend encuentran cuentas de otras corridas o de otros integrantes en la base compartida | Cada caso busca con el prefijo `vitest-hu07-` y compara contra sus propias cuentas, no contra totales fijos. |
| El `COUNT(*)` y la consulta paginada usan condiciones distintas y `total` no cuadra | Las dos consultas usan el mismo armado de `{ condicion, parametros }`; una prueba compara `total` con las páginas. |
| Una búsqueda con `%` o `_` devuelve todo | Se escapan antes del `LIKE`; hay una prueba para cada uno. |
| Las respuestas llegan en otro orden y la tabla muestra filtros viejos | Se descarta toda respuesta que no corresponda a la URL actual; hay una prueba. |
| La espera de 300 ms vuelve frágiles las pruebas del frontend | Las pruebas usan temporizadores falsos de Vitest. |
| Una cuenta desactivada desaparece de la página entre dos peticiones y la página queda vacía | La API responde 200 vacía con `total` y el frontend va a la última página. |
| Otros specs inventan otra forma de respuesta paginada | La descripción de `PaginaUsuarios` y la nota de `CLAUDE.md` la fijan como convención. |

## Lo que **no** entra en este spec

- Ordenar por columna.
- Buscar por correo, cargo o CUI.
- Listar empleados sin cuenta.
- Exportar el listado.
- Cambiar las acciones de las filas.
- Paginar otros endpoints.
- Permisos nuevos.

Cada uno, si se hace, va en su propio spec.
