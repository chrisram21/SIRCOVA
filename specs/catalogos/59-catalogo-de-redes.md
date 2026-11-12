# SPEC 59 — Catálogo de redes de municipios

> **Estado:** Implementado
> **Historia:** ninguna (correcciones del Sprint 4, documento «Spec G» de Chris, retroalimentación del sprint review con la DDRISS del 2026-11-10)
> **Depende de:** SPEC 04, SPEC 05, SPEC 13, SPEC 15 y SPEC 30
> **Fecha:** 2026-11-11
> **Objetivo:** Que el Administrador y Epidemiología creen, editen, desactiven y reactiven las redes de municipios de su DDRISS, cada una con sus municipios (cada municipio en una sola red) y sus dosis trazadoras.

## Por qué existe este spec

Es una corrección de la revisión del Sprint 4, no una historia nueva. La DDRISS trabaja los municipios por **redes** (por ejemplo, Red No. 1: Ixchiguán, Tajumulco, Sibinal, Tacaná y San José Ojetenam) y presenta la cobertura de cada red con sus vacunas trazadoras. Una red agrupa municipios, como un preset; no reemplaza a los distritos de salud.

Este spec solo crea el catálogo. Lo usan después el documento H (redes en Indicadores) y el documento I (filtro de red en Producción), que tendrán su propio spec. Chris lo dejó en `specs/spec-G-catalogo-de-redes.md`; este spec lo reemplaza y ese archivo se borra al implementarlo.

**Decisiones de Chris (2026-11-10), del documento G:**

- Un municipio pertenece a **una sola red**, y las redes son **por DDRISS**.
- Crean y editan redes el **Administrador** y **Epidemiología**. El Revisor y la Autoridad solo las consultan (las verán en Indicadores con el documento H).
- Las trazadoras de una red nueva son las dosis con `dosis.es_trazadora`, y cada red las puede ajustar.

**Lo que se decidió en la fase de preguntas (2026-11-11):**

- El código `RED_{NN}` lo genera el backend, como el de los distritos y los establecimientos; no se edita.
- Crear y editar van en páginas propias (subrutas), no en un diálogo, porque son hasta 30 casillas de municipios y unas 20 de trazadoras.
- **Desactivar libera los municipios** de la red (se borran sus filas de `red_municipio`) para que puedan pasar a otra. Las trazadoras se conservan.
- **Reactivar pide municipios:** la red se reactiva desde su página de edición, con al menos un municipio libre. Nunca hay una red activa sin municipios.
- Se ofrecen como trazadoras las dosis activas de vacunas activas, y una red necesita al menos una. Una ya guardada que se desactiva después se sigue viendo, marcada «(inactiva)», y se puede quitar.
- La lista muestra solo las activas, con la casilla «Mostrar inactivas».
- Los datos de prueba (Red No. 1) van en el script nuevo `12` (para la base actual) y en el `03` (para cuando se recree).

## Alcance

**Entra:**

- Las tablas `red`, `red_municipio` y `red_trazadora`:
  - en el script nuevo `backend/db/12_redes_mysql.sql`, idempotente, que también crea la Red No. 1;
  - en `01_modelo_relacional_mysql.sql` (versión 0.12);
  - en `03_datos_prueba_mysql.sql` (la Red No. 1);
  - en `docs/base-de-datos/CONTEXTO BD.md` y en el DBML de `docs/base-de-datos/`.
- Los permisos `RED_CONSULTAR`, `RED_CREAR` y `RED_EDITAR` en `backend/db/05_permisos_mysql.sql`.
- Primero en `backend/openapi.yaml` y después en el backend: `GET /redes`, `GET /redes/opciones`, `GET /redes/{id}`, `POST /redes`, `PATCH /redes/{id}`, `POST /redes/{id}/desactivar` y `POST /redes/{id}/reactivar`, en `backend/src/modulos/catalogos/redes.service.js` con sus rutas en `catalogos.routes.js`.
- La regla `validarNombreRed` en los dos `validaciones/campos.js` y sus casos en las dos tablas `CASOS`.
- La acción de bitácora que haga falta en `ACCIONES` (se reutilizan `CREAR`, `ACTUALIZAR`, `DESACTIVAR` y `REACTIVAR`).
- En el frontend:
  - las funciones de redes en `api/catalogos.js`, con `consultarConCache` y `yLuegoInvalidar`;
  - el hijo «Redes» de «Administración» en `componentes/layout/opcionesMenu.js`, con sus dos subrutas;
  - `paginas/configuracion/PaginaRedes.jsx`, `PaginaRegistrarRed.jsx`, `PaginaEditarRed.jsx` y `FormularioRed.jsx`.
- Pruebas del backend (`backend/tests/redes.test.js`, archivo nuevo) y del frontend (lista y formulario).
- La nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-G-catalogo-de-redes.md`.

**Fuera de alcance (para otros specs):**

- El filtro «Red», la pestaña «Redes» y el total de la red en Indicadores (documento H).
- El filtro de red en la pestaña Producción (documento I).
- El semáforo contra lo esperado del mes y los indicadores con prorrateo `NINGUNO` (documento H).
- Las redes y municipios reales distintos de la Red No. 1: los da la DDRISS y se cargan desde la pantalla.
- Que un municipio esté en dos redes, o redes que crucen DDRISS.
- Cambiar los distritos de salud o relacionar una red con un distrito.
- Borrar redes: solo se desactivan (regla 6).
- Mostrar las redes en el mapa o en el Inicio.

## Modelo de datos

### Tablas (MySQL v0.12)

Los tipos de las llaves son los reales del 01: `ddriss.id` es `TINYINT UNSIGNED`; `municipio.id` y `dosis.id` son `SMALLINT UNSIGNED`.

```sql
CREATE TABLE red (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ddriss_id   TINYINT UNSIGNED  NOT NULL,
  codigo      VARCHAR(20)       NOT NULL COMMENT 'RED_{NN}, lo genera el backend por DDRISS',
  nombre      VARCHAR(120)      NOT NULL COMMENT 'P. ej. Red No. 1',
  activo      BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_red_ddriss_codigo (ddriss_id, codigo),
  UNIQUE KEY uq_red_ddriss_nombre (ddriss_id, nombre),
  CONSTRAINT fk_red_ddriss FOREIGN KEY (ddriss_id) REFERENCES ddriss (id)
) ENGINE=InnoDB;

-- Un municipio, una sola red. Una red inactiva no tiene filas aquí.
CREATE TABLE red_municipio (
  red_id       SMALLINT UNSIGNED NOT NULL,
  municipio_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, municipio_id),
  UNIQUE KEY uq_red_municipio (municipio_id),
  CONSTRAINT fk_redmun_red       FOREIGN KEY (red_id)       REFERENCES red (id),
  CONSTRAINT fk_redmun_municipio FOREIGN KEY (municipio_id) REFERENCES municipio (id)
) ENGINE=InnoDB;

CREATE TABLE red_trazadora (
  red_id   SMALLINT UNSIGNED NOT NULL,
  dosis_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, dosis_id),
  CONSTRAINT fk_redtraz_red   FOREIGN KEY (red_id)   REFERENCES red (id),
  CONSTRAINT fk_redtraz_dosis FOREIGN KEY (dosis_id) REFERENCES dosis (id)
) ENGINE=InnoDB;
```

Reglas que valida el backend (la base no puede expresarlas):

- Los municipios de una red son **activos**, del **departamento sede** de su DDRISS y no son el `9999`.
- Una red activa tiene al menos un municipio y al menos una trazadora.
- Una trazadora nueva es una dosis activa de una vacuna activa. Una que ya estaba guardada se puede conservar aunque se haya desactivado.
- El código es `RED_{NN}` (dos dígitos como mínimo), el siguiente de la DDRISS contando las inactivas. No se reutiliza ni se cambia.
- Toda escritura de redes bloquea primero la fila de su `ddriss` (`SELECT … FOR UPDATE` como **primera** consulta de la transacción, nota del 2026-10-23). Así, dos altas no chocan en el código y dos ediciones no ponen el mismo municipio en dos redes. El `UNIQUE` de `red_municipio` queda como respaldo: un `ER_DUP_ENTRY` responde 409.

### Script `12_redes_mysql.sql`

- Crea las tres tablas con `CREATE TABLE IF NOT EXISTS`.
- Crea la Red No. 1 (`RED_01`) de `DDRISS_SM` si no existe, con Ixchiguán, Tajumulco, Sibinal, Tacaná y San José Ojetenam (buscados por código INE, no por id) y con las dosis activas `es_trazadora` como trazadoras.
- No borra nada y se puede correr dos veces. Se corre con `mysql2` y `multipleStatements`, como el 05.

### Permisos (en el 05)

| Permiso | Grupo | Roles |
|---|---|---|
| `RED_CONSULTAR` | `CONFIGURACION_CATALOGOS` | ADMINISTRADOR, EPIDEMIOLOGIA, REVISOR, AUTORIDAD |
| `RED_CREAR` | `CONFIGURACION_CATALOGOS` | ADMINISTRADOR, EPIDEMIOLOGIA |
| `RED_EDITAR` | `CONFIGURACION_CATALOGOS` | ADMINISTRADOR, EPIDEMIOLOGIA |

### API (JSON en camelCase)

```js
// Red, en GET /redes, GET /redes/{id} y las respuestas de las escrituras
{
  id: 1,
  codigo: 'RED_01',
  nombre: 'Red No. 1',
  activo: true,
  ddriss: { id: 1, codigo: 'DDRISS_SM', nombre: 'DDRISS San Marcos' },
  municipios: [{ id: 15, codigoIne: '1215', nombre: 'Tacaná' }],   // por nombre; [] si está inactiva
  trazadoras: [                                                    // por vacuna.ordenInforme y dosis.orden
    { dosisId: 7, codigo: 'D3', nombre: 'Tercera dosis', activa: true,
      vacuna: { id: 3, codigo: 'HEXA', nombre: 'Hexavalente', activa: true } },
  ],
}
```

| Endpoint | Permiso | Qué hace |
|---|---|---|
| `GET /redes?activo=&ddrissId=` | `RED_CONSULTAR` | Las redes de la DDRISS del usuario, por nombre. `activo` es opcional (sin él, todas). `ddrissId` solo lo usa la Autoridad nacional; sin él, ve todas las del país. |
| `GET /redes/opciones` | `RED_EDITAR` | Lo que necesita el formulario: los municipios elegibles con `red: { id, nombre } \| null` (la red activa en la que están) y las vacunas activas con sus dosis activas (`esTrazadora` en cada una). |
| `GET /redes/{id}` | `RED_CONSULTAR` | Una red de su ámbito (404 si no existe o es de otra DDRISS). |
| `POST /redes` | `RED_CREAR` | `{ nombre, municipioIds }`. Genera el código y pone como trazadoras las dosis activas `es_trazadora` de vacunas activas. Responde 201 con la red. |
| `PATCH /redes/{id}` | `RED_EDITAR` | `{ nombre?, municipioIds?, dosisIds? }`, cada lista como reemplazo completo. Solo en una red activa (409 `RED_INACTIVA`). Si nada cambia, no escribe. |
| `POST /redes/{id}/desactivar` | `RED_EDITAR` | Pasa `activo` a `FALSE` y borra sus filas de `red_municipio`. |
| `POST /redes/{id}/reactivar` | `RED_EDITAR` | `{ municipioIds, nombre?, dosisIds? }`: la reactiva con al menos un municipio libre. |

`GET /redes/opciones` existe para que Epidemiología, que no tiene `MUNICIPIO_CONSULTAR` ni `VACUNA_CONSULTAR`, pueda armar el formulario sin ampliar sus permisos, como `/configuracion-indicadores/opciones` (SPEC 43).

### Errores

| Caso | Respuesta |
|---|---|
| Cuerpo o parámetro inválido, desconocido o con `codigo`; lista de municipios o de trazadoras vacía, repetida o con ids que no son enteros positivos | 400 `ENTRADA_INVALIDA` |
| Red que no existe o de otra DDRISS | 404 `NO_ENCONTRADO` |
| Nombre repetido en la DDRISS | 409 `RED_DUPLICADA` («Ya hay una red con ese nombre en la DDRISS.») |
| Municipio que ya está en otra red | 409 `MUNICIPIO_EN_OTRA_RED` («Tacaná ya pertenece a la Red No. 2.», con el primero que choca) |
| Editar una red inactiva, o reactivar una activa | 409 `RED_INACTIVA` / `RED_ACTIVA` |
| Municipio que no existe, inactivo, de otro departamento o el `9999` | 422 `MUNICIPIO_INVALIDO` (el mismo código que los distritos) |
| Dosis nueva que no existe, inactiva o de una vacuna inactiva | 422 `DOSIS_INVALIDA` |

### Bitácora

Todo en `enTransaccion`, con `modulo: MODULOS.CONFIGURACION` y `entidad: 'red'`:

- `CREAR`: la red completa (`codigo`, `nombre`, `municipioIds`, `dosisIds`).
- `ACTUALIZAR`: `diferencias(antes, despues)` sobre `nombre`, `municipioIds` y `dosisIds` (listas ordenadas); si da `null`, no se escribe ni se registra.
- `DESACTIVAR`: `activo` y los `municipioIds` que se liberan.
- `REACTIVAR`: `activo`, los `municipioIds` nuevos y lo que cambie de nombre o trazadoras.

### Frontend

- **Menú:** hijo «Redes» de «Administración», ruta `/administracion/redes`, `permisos: ['CONFIGURACION_CONSULTAR', 'RED_CONSULTAR', 'RED_EDITAR']`. Así solo lo ven el Administrador y Epidemiología. Subrutas `/administracion/redes/nueva` (`RED_CREAR`) y `/administracion/redes/:id/editar` (`RED_EDITAR`). La pantalla lleva el antetítulo «Administración».
- **`PaginaRedes`:** tabla con nombre, código, municipios (insignias), número de trazadoras, estado y acciones:
  - activa: «Editar» y «Desactivar» (con un `AlertDialog` que avisa que sus municipios quedan libres);
  - inactiva: «Reactivar», que abre la página de edición.

  Arriba, «Nueva red» (con `RED_CREAR`) y la casilla «Mostrar inactivas» (en la URL, como `inactivas=1`). Sin redes: «Todavía no hay redes en la DDRISS.».
- **`FormularioRed`** (lo usan alta y edición):
  - Nombre (y el código, solo de lectura, al editar).
  - Municipios: casillas de los municipios de `GET /redes/opciones`. Los que están en otra red aparecen deshabilitados con «· Red No. 2». Los de la propia red se pueden quitar.
  - Trazadoras (solo al editar y reactivar; al crear se usan las de por defecto, con un texto que lo dice): casillas agrupadas por vacuna, con las de la red marcadas, las guardadas inactivas al final con «(inactiva)» y el botón «Restablecer trazadoras por defecto» (marca solo las `esTrazadora`).
  - Al editar una red inactiva, el botón principal es «Reactivar red» y llama a `/reactivar`.
  - Sigue la UX común: errores al enviar con foco en el primero, error de la API encima de los botones, `useAvisoCambiosSinGuardar`, `toast.success` al guardar y vuelta a la lista con su búsqueda (`state.volverA`).

## Plan de implementación

1. **Base de datos** (zona protegida: confirmar con Chris antes de editar `backend/db/`).
   - Escribir `12_redes_mysql.sql` y agregar las tablas al 01 (v0.12, con su nota de cambios), la Red No. 1 al 03 y los permisos al 05.
   - Actualizar `CONTEXTO BD.md` y el DBML.
   - Con autorización de Chris, correr el 12 y el 05 en Aiven y comprobar las tablas, la Red No. 1 y los permisos por rol.
2. **Contrato.** Los siete endpoints, el esquema `Red`, `OpcionesRed` y los errores en `backend/openapi.yaml`, con `x-permiso`.
3. **Lectura en el backend.** `redes.service.js` con `listarRedes`, `obtenerRed` y `opcionesRed`, sus rutas y su controlador. Pruebas en `redes.test.js`: el ámbito por DDRISS, la Autoridad nacional con y sin `ddrissId`, `activo`, y los 403 por permiso.
4. **Alta y edición.** `validarNombreRed` en los cuatro archivos de validaciones. `crearRed` (código, trazadoras por defecto, bloqueo de la `ddriss`) y `editarRed` (reemplazo de listas, `diferencias`). Pruebas:
   - el código consecutivo, contando las inactivas, y dos altas en paralelo;
   - las trazadoras por defecto;
   - el municipio en otra red, el de otro departamento y el `9999`;
   - el nombre repetido y las listas vacías;
   - la dosis inactiva nueva frente a la ya guardada;
   - la bitácora de cada caso, y que un `PATCH` sin cambios no escribe.
5. **Desactivar y reactivar.** `desactivarRed` y `reactivarRed`. Pruebas: desactivar libera los municipios y otra red los puede tomar; reactivar sin municipios o con uno ocupado falla; los 409 de estado; la bitácora.
6. **API del frontend y menú.** Funciones en `api/catalogos.js` (`/redes` con caché e invalidación) y el hijo «Redes» en `opcionesMenu.js`, primero sin `pagina` («En construcción»). Comprobar que Revisor y Autoridad no lo ven.
7. **Lista.** `PaginaRedes.jsx` con su prueba: lista, «Mostrar inactivas», desactivar con su diálogo y el enlace a reactivar.
8. **Formulario.** `FormularioRed.jsx`, `PaginaRegistrarRed.jsx` y `PaginaEditarRed.jsx` con sus pruebas: municipios ocupados deshabilitados, trazadoras agrupadas, «Restablecer trazadoras por defecto», reactivar desde la edición y el error de la API.
9. **Verificación manual** con la API real y Playwright:
   - con el acceso rápido del Administrador y de Epidemiología: crear una red de prueba, editarla, desactivarla y reactivarla;
   - comprobar el mensaje «… ya pertenece a la Red No. 1» al intentar tomar Tacaná;
   - con el Revisor, que «Redes» no está en el menú y que la ruta lo lleva a Inicio, como cualquier ruta sin permiso;
   - a 390 px, la lista y el formulario no desbordan.

   Al terminar, desactivar la red de prueba.
10. **Cierre.** La nota en «Notas de contexto» de `CLAUDE.md` y borrar `specs/spec-G-catalogo-de-redes.md`.

## Criterios de aceptación

- [x] El 12 crea las tres tablas y la Red No. 1 en una base existente, y correrlo otra vez no cambia nada.
- [x] El 01 (v0.12) y el 03 traen las tablas y la Red No. 1, y `CONTEXTO BD.md` y el DBML las describen.
- [x] El Administrador y Epidemiología tienen `RED_CONSULTAR`, `RED_CREAR` y `RED_EDITAR`; el Revisor y la Autoridad solo `RED_CONSULTAR`.
- [x] `GET /redes` devuelve solo las redes de la DDRISS del usuario; la Autoridad nacional ve todas o las de `ddrissId`.
- [x] Una red nueva recibe el siguiente `RED_{NN}` de su DDRISS, contando las inactivas, y dos altas simultáneas no chocan.
- [x] Una red nueva trae como trazadoras las dosis activas `es_trazadora` de vacunas activas, y al editarla se pueden quitar y agregar.
- [x] No se puede poner un municipio en dos redes: responde 409 «{Municipio} ya pertenece a {Red}.».
- [x] No se puede poner un municipio inactivo, de otro departamento o el `9999` (422).
- [x] Una red activa no queda nunca sin municipios ni sin trazadoras (400).
- [x] Desactivar una red libera sus municipios, que otra red puede tomar, y conserva sus trazadoras.
- [x] Reactivar exige al menos un municipio libre.
- [x] El Revisor y la Autoridad reciben 403 en `POST` y `PATCH` de redes y en `GET /redes/opciones`.
- [x] Cada escritura deja su fila en la bitácora, y un `PATCH` sin cambios no deja ninguna.
- [x] «Redes» aparece en «Administración» solo para el Administrador y Epidemiología.
- [x] En el formulario, los municipios de otra red se ven deshabilitados con el nombre de su red.
- [x] «Restablecer trazadoras por defecto» deja marcadas solo las `es_trazadora`.
- [x] A 390 px la lista y el formulario no tienen desborde horizontal.
- [x] Pasan `redes.test.js`, `campos.test.js` (los dos), las pruebas de las pantallas nuevas y la suite del frontend.
  La suite del frontend (2026-11-11): 1728 de 1729; fallaba por tiempo «/administracion/usuarios muestra "Registrar personal" solo con EMPLEADO_CREAR» de `Layout.test.jsx` (también en `main`): la primera carga `lazy` pasaba de 1 s. Se le dio más espera (8 s al `findBy`, 10 s a la prueba) y pasa.

## Decisiones

- **Sí:** el código `RED_{NN}` lo genera el backend. Es el patrón de distritos y establecimientos, y evita códigos inventados o repetidos.
- **No:** que el usuario escriba el código, como sugería el documento G.
- **Sí:** páginas propias para crear y editar. Caben las casillas de 30 municipios y unas 20 trazadoras sin un diálogo con barra de desplazamiento.
- **No:** un diálogo como `DialogoDistrito.jsx`, como sugería el documento G.
- **Sí:** desactivar libera los municipios. Así un municipio puede pasar a otra red sin editar antes una red que ya no se usa.
- **No:** conservar los municipios en la red inactiva. Habría que explicar por qué un municipio está ocupado por una red que no se ve.
- **Sí:** reactivar pide municipios, desde la página de edición. Nunca hay una red activa vacía que los filtros de H e I tendrían que esconder.
- **Sí:** las trazadoras se conservan al desactivar. Son la configuración de la red y no chocan con otras redes.
- **Sí:** al menos una trazadora, y solo dosis activas de vacunas activas como nuevas. Una red sin trazadoras dejaría vacía la tabla del documento H.
- **Sí:** una trazadora guardada que se desactiva después se conserva y se muestra «(inactiva)». Es lo mismo que hacen las dosis inactivas en otros catálogos.
- **Sí:** `GET /redes/opciones` con `RED_EDITAR`. Epidemiología arma el formulario sin recibir `MUNICIPIO_CONSULTAR` ni `VACUNA_CONSULTAR`, como en la configuración de indicadores.
- **No:** dar a Epidemiología `MUNICIPIO_CONSULTAR` y `VACUNA_CONSULTAR`. Ampliaría sus permisos más de lo que necesita.
- **Sí:** bloquear la fila de `ddriss` al empezar cada escritura. Ordena altas y ediciones simultáneas, y el `UNIQUE` de `red_municipio` queda de respaldo.
- **Sí:** un script nuevo `12` además del 01 y el 03. La base actual no se recrea, y el 12 la pone al día sin borrar nada.
- **Sí:** `validarNombreRed` propia en `campos.js`. El mensaje de error habla de la red, no del distrito.
- **Sí:** «Mostrar inactivas» en la URL. Es la regla de los filtros de las listas.
- **Sí:** la red no se relaciona con los distritos. El documento G dice que una red no los reemplaza.

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Los nombres de los cinco municipios de la Red No. 1 no coinciden con los del catálogo (tildes, «San José Ojetenam») | El 12 y el 03 los buscan por código INE (1207, 1208, 1209, 1223 y 1224), no por nombre, y el 12 falla con un mensaje si falta alguno. Se comprobó al correrlo en el paso 1. |
| Las pruebas usan municipios reales de San Marcos y chocan con la Red No. 1 o con una red de la prueba manual | `redes.test.js` crea un departamento, una DDRISS (`ZVT_RED`) y municipios propios (código que empieza con `Z`), y los borra al inicio y al final con sus redes. |
| Recrear la base con el 01 sin el 12 deja la base sin la Red No. 1 | El 03 también la trae. La nota de `CLAUDE.md` dice qué scripts correr después del 01. |
| La caché de catálogos muestra una red vieja en la lista o en las opciones | Cada escritura de `api/catalogos.js` invalida `/redes` (incluido `/redes/opciones`). |
| Los documentos H e I esperan campos que este spec no da | `GET /redes` ya trae los municipios y las trazadoras con vacuna y dosis, que es lo que piden. Lo demás va en sus specs. |

## Lo que **no** entra en este spec

- El filtro y la pestaña de redes en Indicadores, ni el semáforo contra lo esperado del mes (documento H).
- El filtro de red en la pestaña Producción (documento I).
- Las redes reales de la DDRISS aparte de la Red No. 1.
- Borrar redes, cruzarlas entre DDRISS o poner un municipio en dos.
- Relacionar redes con distritos, o mostrarlas en el mapa o en el Inicio.

Cada uno de esos, si se hace, va en su propio spec.
