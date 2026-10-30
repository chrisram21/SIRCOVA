# Contexto de la base de datos — Plataforma de vacunación DDRISS San Marcos

> **Para qué sirve este documento.** Da contexto preciso sobre la base de datos del proyecto a otros agentes de IA y a los integrantes del equipo. Resume qué se trabajó, cómo está organizada la persistencia (MySQL + MongoDB) y qué es y para qué sirve cada tabla y cada colección.
>
> **Estado:** modelo preliminar **v0.10** (28 de octubre de 2026): v0.5 (preparado para varias DDRISS), los bloques A a D de la v0.6 (población por grupo de edad, dosis que cuentan para cobertura, secciones del formulario y avance contra la meta del mes) la v0.7 (Excel del 5C y semillas del Registro Único de Vacunación), la v0.8 (Hospital de San Marcos y vacuna Polio), la v0.9 (CUI del empleado como huella HMAC) y la v0.10 (sesiones en el servidor). Script de MongoDB **v0.8** (29 de octubre de 2026): las vacunas que entran en un reporte nuevo (`incluir_por_defecto`); la v0.7 (23 de octubre de 2026) trajo los formularios de captura por DDRISS. El modelo se sigue refinando por sprint.
>
> **Fuente de verdad:** si este resumen y los scripts difieren, mandan los scripts.
> - `01_modelo_relacional_mysql.sql`: DDL de MySQL 8.0.
> - `02_colecciones_mongodb.js`: colecciones, validadores e índices de MongoDB, para `mongosh`.
>
> Todos los archivos están en `/mnt/project-files/diseno-bd/`.

---

## 1. Lo esencial en once puntos

1. **Qué es el sistema.** Una plataforma web para que los establecimientos de salud de los 30 municipios de San Marcos (MSPAS, Guatemala) registren cada mes su **producción de vacunación**, que hoy se reporta en el formulario físico **5C (SIGSA-S5c)**. La DDRISS la valida, revisa y cierra, y un motor calcula **cobertura, brecha, deserción y proyección**.
2. **Solo datos agregados.** Ninguna tabla ni colección guarda datos personales ni clínicos de pacientes. La unidad mínima es *una cantidad de dosis*. Sí se guardan datos del **personal** que usa el sistema (`empleado`, `usuario`).
3. **Persistencia políglota.**
   - **MySQL** guarda lo transaccional: catálogos, usuarios, producción, estados, resultados, alertas y bitácora.
   - **MongoDB** guarda configuración versionada: dimensiones, esquemas de captura, reglas de validación e indicadores.
4. **La lógica vive en el backend** (Node.js + Express). MongoDB describe *cómo* capturar, validar y calcular; MySQL guarda *qué* se registró y *qué* resultó. MongoDB no contiene código ejecutable.
5. **Formularios dinámicos.** Cada vacuna define en MongoDB sus propias **dimensiones de desagregación** (sexo, grupo de edad, estado de embarazo u otras futuras). Agregar una vacuna es insertar una fila; agregar una dimensión es solo configuración. Ninguno de los dos cambia la estructura de las tablas.
6. **Hecho central.** `detalle_produccion` guarda una cantidad por (sección vacuna del reporte, dosis, municipio de procedencia, combinación de dimensiones). Los valores de las dimensiones van en `detalle_dimension`.
7. **Atribución territorial.** El **municipio de aplicación** es el del establecimiento. El **municipio de procedencia** de la persona vacunada se guarda en cada fila de detalle. La cobertura se calcula por procedencia.
8. **Ciclo de vida del reporte (7 estados).** Borrador → Enviado → En revisión → (Corrección solicitada → Borrador) | Aprobado → Cerrado → (Rectificación → Cerrado). Las transiciones permitidas por rol están en la tabla `transicion_estado`.
9. **Versionado e inmutabilidad.** Una versión publicada de esquema, regla o indicador no se edita: se crea una nueva. MySQL guarda la versión exacta que se usó.
10. **Sin llaves foráneas entre motores.** Los vínculos MySQL ↔ MongoDB son códigos o ObjectId que valida el backend (sección 7).
11. **Preparado para varias DDRISS (v0.5).** La tabla `ddriss` agrupa distritos, establecimientos y personal. El proyecto solo carga y opera la DDRISS San Marcos; agregar otra es cargar datos, no modificar tablas.

---

## 2. Qué se trabajó en este hilo (historial de versiones)

| Versión | Fecha | Cambios y motivo |
|---|---|---|
| **v0.1** | 2026-09-29 | Primera propuesta a partir del documento de contexto. Modelo MySQL completo para los 8 módulos, 3 colecciones MongoDB, DDL probado en MariaDB y documento de diseño. Sexo y grupo de edad eran columnas fijas del detalle. |
| **v0.2** | 2026-09-29 | **Decisión del equipo:** los formularios deben admitir dimensiones nuevas por vacuna, y por eso se eligió MongoDB. Sexo y grupo de edad dejan de ser columnas: se crean la tabla genérica `detalle_dimension`, la colección `catalogo_dimensiones` y la regla `DIMENSIONES_VALIDAS`. Se elimina la tabla `grupo_edad`. |
| **v0.3** | 2026-09-29 | Alineación con la **propuesta v2**. "Corrección solicitada" regresa a **Borrador** (antes iba a Enviado). Se asigna un revisor al pasar a En revisión (`revisor_id`, `asignado_en`). Nuevos tipos de establecimiento (CAIMI, centro comunitario, casa materna, otra institución). Se admiten establecimientos **externos** (caso Coatepeque, Quetzaltenango). |
| **v0.4** | 2026-10-08 | **Normalización de usuario:** se separa `empleado` (datos del personal) de `usuario` (solo datos de acceso), con relación 1:1. Se agregan **dirección y contacto** a `establecimiento`. |
| **v0.5** | 2026-10-10 | **Modelo preparado para varias DDRISS**, operando solo San Marcos. Bloque A: tabla `ddriss`, `distrito_salud.ddriss_id`, `establecimiento.ddriss_id` (DDRISS a la que reporta) y se elimina `municipio.es_jurisdiccion`. Bloque B: `empleado.ddriss_id`; los 5 roles se conservan y `AUTORIDAD` sin DDRISS es la autoridad nacional. Bloque C: `periodo` queda como calendario común y la nueva tabla `cierre_periodo` guarda el estado del mes por DDRISS; `alerta.ddriss_id`; las vistas exponen la DDRISS. MongoDB (script v0.3): campo `territorio` en reglas e indicadores (los esquemas de captura lo reciben en el script v0.7). |
| **v0.6** | 2026-10-10 | Información de campo (entrevistas a la estadígrafa y a Epidemiología). **Bloque A:** `poblacion_objetivo` sin `vacuna_id` (población por municipio, año y grupo de edad), semillas de `clasificacion_poblacion` según los encabezados del 5C y permiso `POBLACION_REGISTRAR` solo para el Administrador (provisional). **Bloque B:** `dosis.completa_esquema` y `dosis.es_trazadora`; 13 vacunas del 5C como semillas de ejemplo. **Bloque C** (MongoDB, script v0.4): `esquemas_captura.secciones[]` y valores de `grupo_edad` con los códigos de `clasificacion_poblacion`; esquema de ejemplo de OPV. **Bloque D** (MongoDB): tipo `AVANCE_META_MES` e indicador `AVANCE_PENTA3` para el mapa, semáforo 80/90 provisional. Bloque E en pausa. |
| **v0.7** | 2026-10-17 | Excel del 5C y Registro Único de Vacunación. `establecimiento.reporta_5c` (el que envía el 5C de su municipio, uno por municipio); municipio `9999` = "Migrantes / fuera de San Marcos"; `v_produccion_atribuida` (Excel 3) solo cuenta procedencias del departamento de la DDRISS; grupo `1_A_4` → `1_A_5` ("De 1 a < 6 años"); 22 vacunas semilla (Hexavalente reemplaza a Pentavalente con el id 2, `INFLU` → `INFLU_PED`). MongoDB (script v0.5): `PENTA` → `HEXA` en ejemplos e indicadores; sexo solo en VPH (y Tdap de 10 años), nuevo esquema de ejemplo de VPH. |
| **v0.8** | 2026-10-18 | Hospitales e IPV/OPV. 31 formularios 5C (30 municipios y el Hospital de San Marcos), así que `reporta_5c` deja de ser uno por municipio; nueva marca `establecimiento.solo_cobertura` (su producción solo cuenta en el Excel 3; caso Hospital de San Marcos); `v_produccion` expone `solo_cobertura` y `v_consolidado_establecimiento` la excluye. IPV y OPV se fusionan en `POLIO` (id 6): 21 vacunas, 60 dosis. MongoDB (script v0.6): dimensión `presentacion` (IPV u OPV) en el esquema de Polio. |
| **v0.9** | 2026-10-22 | CUI del empleado (SPEC 11, asesoría del 2026-10-21). `empleado.codigo_empleado` pasa a `empleado.cui_hmac` `CHAR(64)` con el índice único `uq_empleado_cui`: la huella HMAC-SHA256 del CUI del DPI, para no registrar dos veces a la misma persona. El código de empleado no servía para eso: hay personas con dos códigos y el personal contratado usa otros. Se guarda la huella y no el CUI, con una clave secreta (`CUI_HMAC_CLAVE`), porque el CUI tiene pocas combinaciones y un SHA-256 simple se podría revertir. La columna es NULL en la base y la API la exige al crear. Las bases que ya existían se migran con `07_cui_empleado_mysql.sql`, que vacía los códigos anteriores. |
| **MongoDB v0.8** | 2026-10-29 | Solo cambia el script de MongoDB; el modelo MySQL sigue en v0.10 (SPEC 31). `esquemas_captura` agrega `incluir_por_defecto` (bool, opcional): marcada, la vacuna entra en cada reporte nuevo del mes que cubre la versión; sin marcar, el establecimiento la agrega si la aplica, y solo esas se pueden quitar del reporte. Si falta (documentos anteriores), el backend la toma como `true`: no hay migración y no se tocan versiones publicadas. Las semillas no cambian. |
| **MongoDB v0.7** | 2026-10-23 | Solo cambia el script de MongoDB; el modelo MySQL sigue en v0.9. **Decisión del equipo:** cada DDRISS puede tener su propio formulario de captura. `esquemas_captura` agrega `territorio` (el mismo subesquema de reglas e indicadores) y `basado_en` (versión nacional de la que se copió un formulario de DDRISS). El índice `uq_vigente_por_vacuna` se reemplaza por `uq_esquema_vigente_territorio` (una VIGENTE por vacuna y territorio) e `ix_vigencia` incluye `territorio.ddriss_codigo`; `uq_vacuna_version` no cambia, así que `reporte_vacuna.esquema_version` sigue sin ser ambiguo. Las dimensiones de un esquema solo pueden venir de `catalogo_dimensiones`. Las semillas del 02 son NACIONAL; en el 04, el borrador Hexavalente v3 pasa a ser el ejemplo de formulario de `DDRISS_SM`. |
| **v0.10** | 2026-10-28 | Sesiones en el servidor (SPEC 27, asesoría del 2026-10-28). Nueva tabla `sesion`: cada inicio de sesión crea una fila y el JWT lleva su id (`sid`), así que la sesión se puede cerrar antes de que venza el token. Una sola sesión abierta por usuario, garantizada por la columna generada `usuario_abierta` con el índice único `uq_sesion_una_abierta`: un inicio de sesión nuevo cierra el anterior. Guarda el SHA-256 del refresh token de la cookie, nunca el token. Las bases que ya existían la agregan con `08_sesion_mysql.sql`. |

Entregables generados en el hilo, todos en `/mnt/project-files/diseno-bd/`:

| Archivo | Contenido |
|---|---|
| `01_modelo_relacional_mysql.sql` | DDL de MySQL: 33 tablas (desde la v0.10), 4 vistas y datos semilla mínimos |
| `02_colecciones_mongodb.js` | 4 colecciones con validadores `$jsonSchema`, índices y documentos de ejemplo |
| `03_documento_diseno_bd.md` | Documento de diseño con justificación, decisiones, supuestos y preguntas abiertas |
| `04_modelo_relacional.dbml` | Modelo MySQL para dbdiagram.io, agrupado en los 4 grupos de la propuesta v2 |
| `05_contexto_base_de_datos.md` | Este documento |
| `diagrama_er.png` | Diagrama ER (Mermaid) |
| `06_guia_instalacion_local.docx` | Guía corta para crear ambas bases en local |
| `plan_v05_multi_ddriss.md` | Plan de la v0.5 y su avance por bloques |
| `propuesta_v06_nueva_info.md` | Propuesta de la v0.6 por bloques; A a D aplicados, E en pausa |
| `propuesta_v07_semillas_ruv.md` | Semillas de vacunas y dosis de la v0.7 (Registro Único de Vacunación), aplicada |
| `_archivo/diagramas_chen/` | Diagramas de Chen de la v0.4; archivados, ya no se actualizan |

**Verificación realizada:**
- El DDL v0.8 se ejecutó en MariaDB (sustituyendo la colación `utf8mb4_0900_ai_ci` por `utf8mb4_unicode_ci`). Crea 32 tablas, 4 vistas y 72 llaves foráneas; el permiso `POBLACION_REGISTRAR` queda asignado al Administrador; siembra 21 vacunas y 60 dosis.
- Con datos de prueba se comprobaron las vistas, el rechazo de duplicados y la restricción de una cuenta por empleado. En v0.5 también: establecimientos ligados a la DDRISS (incluido el externo de Coatepeque), rechazo de una DDRISS inexistente, un empleado sin DDRISS (autoridad nacional), dos DDRISS con estados distintos en el mismo mes, el rechazo de un cierre sin responsable o duplicado, y las vistas y alertas filtradas por DDRISS.
- El DBML se convierte de vuelta a SQL y produce las mismas 32 tablas y 72 llaves foráneas.
- El script de MongoDB **no se ha ejecutado contra un servidor MongoDB real**. En v0.4 se ejecutó con un simulador en Node que valida cada documento de ejemplo contra los `$jsonSchema` y comprueba que las secciones usen dosis y grupos de edad declarados en el esquema y en el catálogo.

---

## 3. Convenciones del modelo

- **Nombres** en español, `snake_case` y en singular (`reporte_produccion`, `detalle_dimension`).
- **Llave primaria** `id` autoincremental, salvo tres tablas:
  - `estado_reporte`: llave `codigo`.
  - `detalle_dimension`: llave (`detalle_id`, `dimension_codigo`).
  - Tablas de unión (`rol_permiso`, `transicion_estado`): llave compuesta.
- **Códigos estables** (`codigo`, `codigo_ine`) en los catálogos. Son las llaves que se comparten con MongoDB y con el GeoJSON.
- **Desactivación lógica** (`activo` / `activa`) en catálogos y cuentas. Los catálogos no se borran.
- **Auditoría por columnas:**
  - `creado_en` y `actualizado_en` en las tablas que cambian.
  - `*_por` apunta siempre a `usuario.id`, porque registra acciones hechas con una cuenta.
- **Referencias a MongoDB:**
  - `*_mongo_id` (CHAR(24)) guarda un ObjectId.
  - `*_codigo` + `*_version` identifican una versión de regla o indicador.
- **Migrantes, procedencia desconocida o de otro departamento:** municipio especial con `codigo_ine = '9999'` ("Migrantes / fuera de San Marcos"). Cuenta en la producción total, no en la cobertura.

---

## 4. MySQL: las 33 tablas

Base de datos `vacunacion_ddriss` (MySQL 8.0, InnoDB, utf8mb4). Las tablas se agrupan según los cuatro grupos de MySQL de la propuesta v2. "→" indica una llave foránea.

### 4.1 Seguridad y organización (12 tablas)

**`rol`**: catálogo de roles del sistema. Sirve para asignar a cada cuenta lo que puede hacer.
- Columnas: `id`, `codigo` (único), `nombre`, `descripcion`.
- Valores semilla: `ESTABLECIMIENTO` (personal del establecimiento), `REVISOR` (estadígrafa / revisor DDRISS), `EPIDEMIOLOGIA`, `ADMINISTRADOR` y `AUTORIDAD` (solo consulta). Los 5 roles funcionan. El alcance de `AUTORIDAD` lo da `empleado.ddriss_id`: con una DDRISS consulta esa DDRISS; sin DDRISS (NULL) consulta todo el país.

**`permiso`**: catálogo de acciones permitidas, por ejemplo `REPORTE_APROBAR`. Sirve para controlar el acceso fino por módulo.
- Columnas: `id`, `codigo` (único), `modulo`, `descripcion`.

**`rol_permiso`**: relación N:M entre roles y permisos; indica qué permisos tiene cada rol.
- Columnas: `rol_id` → rol, `permiso_id` → permiso. Llave compuesta.

**`empleado`** (nueva en v0.4): **datos del personal**, es decir quién es y dónde trabaja. Sirve para identificar y contactar a las personas, que no son pacientes. Un empleado puede existir **sin cuenta**, por ejemplo alguien que solo figura como contacto.
- Columnas: `id`, `cui_hmac` (v0.9, único; huella HMAC-SHA256 del CUI en hexadecimal; NULL en la base y obligatoria para la API al crear), `nombres`, `apellidos`, `cargo`, `correo` (único; NULL en la base y obligatorio para la API al crear; se usa para notificaciones y recuperación de contraseña), `telefono`, `activo`, `creado_en`, `actualizado_en`.
- `establecimiento_id` → establecimiento: lugar de trabajo; obligatorio en la práctica para el personal de establecimiento.
- `ddriss_id` → ddriss (v0.5, opcional): DDRISS donde trabaja; define el alcance de lo que ve. Solo el rol `AUTORIDAD` puede dejarlo NULL (autoridad nacional); lo valida el backend.
- `municipio_id` → municipio: alcance territorial opcional, por ejemplo un coordinador municipal.
- No guarda el DPI; solo una huella HMAC del CUI para evitar empleados repetidos. El sistema nunca muestra el CUI: solo indica si está registrado. La clave del HMAC (`CUI_HMAC_CLAVE`) es la misma para todo el equipo; si se pierde o se cambia, las huellas guardadas dejan de coincidir.

**`usuario`** (reducida en v0.4): **cuentas de acceso**, solo los datos para iniciar sesión y controlar la cuenta. Sirve para autenticación y autorización.
- Columnas: `id`, `nombre_usuario` (único), `hash_contrasena` (bcrypt/argon2), `activo`, `intentos_fallidos`, `bloqueado_hasta`, `debe_cambiar_contrasena`, `ultimo_acceso`, `creado_en`, `actualizado_en`, `desactivado_en`.
- `empleado_id` → empleado, **único**: relación 1:1, un empleado tiene a lo sumo una cuenta.
- `rol_id` → rol: un rol por cuenta.
- `creado_por` → usuario: el administrador que creó la cuenta.
- Nombre, correo y establecimiento se obtienen de `empleado`. Los permisos sobre reportes se deducen de `usuario.rol_id`, `empleado.establecimiento_id` y `empleado.ddriss_id`.

**`sesion`** (nueva en v0.10): **sesiones del personal**. Sirve para cerrar una sesión antes de que venza su token (cerrar sesión, otro inicio de sesión, acciones del administrador) y para que un usuario tenga una sola abierta.
- Columnas: `id` (el `sid` del JWT), `usuario_id` → usuario (sin `ON DELETE CASCADE`: MySQL no lo acepta en la base de la columna generada; las pruebas borran las sesiones antes que la cuenta), `hash_refresh` (único; SHA-256 del refresh token de la cookie), `hash_refresh_anterior` y `rotado_en` (el anterior se acepta 30 s después de rotar, para varias pestañas), `creada_en`, `ultimo_uso`, `expira_en` (fin de la jornada: inicio + 8 h), `cerrada_en`, `motivo_cierre` (MANUAL, INACTIVIDAD, REEMPLAZADA, CONTRASENA_RESTABLECIDA, CUENTA_DESACTIVADA, DATOS_CAMBIADOS), `ip_origen`, `agente_usuario`.
- `usuario_abierta`: columna generada (`usuario_id` mientras `cerrada_en` es NULL) con índice único; la base impide dos sesiones abiertas del mismo usuario.
- `cerrada_en` y `motivo_cierre` van juntos (`ck_sesion_cierre`). La jornada terminada (`expira_en <= NOW()`) y la inactividad (`ultimo_uso` de hace 30 min o más) se calculan; no se escriben.
- Nunca guarda el refresh token en claro. La renovación del token y `ultimo_uso` no van a la bitácora. Las filas no se borran.

**`departamento`**: catálogo de departamentos.
- Columnas: `id`, `codigo_ine` (único), `nombre`.
- Semillas: `12` San Marcos, `09` Quetzaltenango (por Coatepeque) y `99` No especificado.

**`municipio`**: catálogo de municipios (INE). Incluye municipios de fuera de la DDRISS para registrar la procedencia.
- Columnas: `id`, `departamento_id` → departamento, `codigo_ine` (único; también es la llave del GeoJSON de Leaflet), `nombre`, `activo`.
- En v0.5 se eliminó `es_jurisdiccion`: un municipio pertenece a una DDRISS si alguno de sus distritos de salud pertenece a ella.
- Semillas: los 30 municipios de San Marcos (códigos 1201 a 1230), `9999` Migrantes / fuera de San Marcos y `0920` Coatepeque.

**`ddriss`** (nueva en v0.5): Direcciones Departamentales de Redes Integradas de Servicios de Salud. Sirve para que el modelo admita varias DDRISS; su territorio son los municipios de sus distritos.
- Columnas: `id`, `codigo` (único; provisional `DDRISS_SM`), `nombre`, `departamento_id` → departamento (sede; un departamento puede tener más de una DDRISS), `activo`.
- Semilla: una sola fila, DDRISS San Marcos. Es la única que opera el proyecto.

**`distrito_salud`**: distritos de salud, cada uno dentro de un municipio. Sirve para agrupar establecimientos y definir el territorio de cada DDRISS.
- Columnas: `id`, `ddriss_id` → ddriss (v0.5, obligatorio), `municipio_id` → municipio, `codigo` (único), `nombre`, `activo`.

**`tipo_establecimiento`**: catálogo de tipos de servicio.
- Columnas: `id`, `codigo` (único), `nombre`.
- Semillas: HOSP, CAP, CS, PS, CAIMI, CC (centro comunitario), CM (casa materna), UM (unidad mínima), INST (otra institución).

**`establecimiento`**: establecimientos de salud e instituciones que reportan producción.
- Identificación: `id`, `codigo` (único), `nombre`.
- Ubicación y clasificación: `tipo_establecimiento_id` → tipo_establecimiento, `ddriss_id` → ddriss (v0.5, obligatorio: DDRISS **a la que reporta**; coincide con la de su distrito salvo en los externos), `distrito_salud_id` → distrito_salud (NULL solo si es externo), `municipio_id` → municipio (es el **municipio de aplicación** de sus dosis).
- Banderas: `reporta_produccion` (FALSE si otro establecimiento consolida su producción), `reporta_5c` (TRUE si envía un 5C a la DDRISS: son 31, el establecimiento que centraliza cada municipio, casi siempre el centro de salud, y el Hospital de San Marcos; alimenta las alertas de reporte pendiente), `solo_cobertura` (v0.8: TRUE si su producción solo cuenta en la cobertura, Excel 3, y no en los Excel 1 y 2; caso Hospital de San Marcos), `es_externo` (TRUE si su municipio no pertenece al territorio de la DDRISS a la que reporta, como Coatepeque con San Marcos; lo valida el backend), `activo`.
- **Dirección y contacto (v0.4):** `direccion` (dirección física; el municipio va aparte), `telefono`, `correo`, `nombre_contacto` (persona de contacto en texto libre).
- Auditoría: `creado_en`, `actualizado_en`.

### 4.2 Catálogos sanitarios (6 tablas)

**`vacuna`**: catálogo de vacunas, la *identidad* de cada una. Cómo se captura cada vacuna está en MongoDB.
- Columnas: `id`, `codigo` (único; llave compartida con MongoDB, por ejemplo `HEXA`), `nombre`, `descripcion`, `orden_informe`, `activa`, `creado_en`.
- Semillas de ejemplo (v0.8, Registro Único de Vacunación más las del 5C que no aparecen en él; sujetas a cambios), 21 vacunas: BCG, HEXA, SPR, TD, HEPB (recién nacido), POLIO (IPV u OPV por dosis, v0.8), ROTA, NEUMO (pediátrico), INFLU_PED, DPT (refuerzos), VPH, TDAP, SR, HEPB_PED, HEPB_ADU, INFLU_EST, NEUMO13, NEUMO23, VARICELA, COVID19 y FA. Hexavalente reemplaza a Pentavalente; los ids 1 a 4 (BCG, HEXA, SPR, TD) se conservan porque MongoDB los usa. Detalle de dosis en `propuesta_v07_semillas_ruv.md`.

**`dosis`**: dosis de cada vacuna. Su `orden` sostiene el cálculo de deserción entre dosis.
- Columnas: `id`, `vacuna_id` → vacuna, `codigo` (D1, D2, D3, R1, UNICA…), `nombre`, `orden`, `completa_esquema` (v0.6: la dosis que cierra el esquema; con ella la persona cuenta para la cobertura), `es_trazadora` (v0.6: dosis con "porcentaje del mes" en el 5C; puede haber varias por vacuna), `activa`.
- Las marcas de las semillas son ejemplos hasta que la DDRISS entregue el número de dosis de cada vacuna.
- Único (`vacuna_id`, `codigo`).

**`clasificacion_poblacion`**: tipos de población que sirven de **denominador** de la cobertura.
- Columnas: `id`, `codigo` (único), `descripcion`.
- Semillas (v0.6, encabezados del 5C; mismos códigos que `grupo_edad` en MongoDB): `NACIDOS_VIVOS`, `MENOR_1`, `1_A_MENOR_2`, `4_ANIOS`, `1_A_5` (v0.7: "De 1 a < 6 años", antes `1_A_4`), `MEF_15_49`, `EMBARAZADAS`.
- No confundir con `tipo_establecimiento` ni con las dimensiones de MongoDB: estas desagregan el *numerador*.

**`poblacion_objetivo`**: denominadores de cobertura, es decir cuántas personas hay por municipio, año y grupo de edad. El MSPAS la envía a inicios de año y es la misma para todas las vacunas; la registra y actualiza el Administrador (permiso `POBLACION_REGISTRAR`, provisional).
- Columnas: `id`, `municipio_id` → municipio, `anio`, `clasificacion_poblacion_id` → clasificacion_poblacion, `cantidad`, `fuente`, `registrado_por` → usuario, `creado_en`, `actualizado_en`.
- Único (`municipio_id`, `anio`, `clasificacion_poblacion_id`). En v0.6 se quitó `vacuna_id`: qué grupo usa cada vacuna lo dice `configuracion_indicadores.aplica_a.clasificacion_poblacion`.

**`periodo`**: calendario común de periodos mensuales de reporte (una fila por mes para todo el país). Los reportes apuntan aquí.
- Columnas: `id`, `anio`, `mes` (1 a 12), `fecha_inicio`, `fecha_fin`.
- Único (`anio`, `mes`). En v0.5 la fecha límite, el estado y el cierre pasaron a `cierre_periodo`.

**`cierre_periodo`** (nueva en v0.5): estado del mes **para cada DDRISS**. Sirve para que cada DDRISS abra, cierre y fije su fecha límite por separado. Mientras está ABIERTO sus establecimientos envían y corrigen; CERRADO solo admite rectificación.
- Columnas: `id`, `periodo_id` → periodo, `ddriss_id` → ddriss, `fecha_limite_envio` (base de las alertas de reportes pendientes de esa DDRISS), `estado` (ABIERTO, EN_CIERRE, CERRADO), `cerrado_por` → usuario, `cerrado_en`.
- Único (`periodo_id`, `ddriss_id`). `CHECK`: si el estado es CERRADO, `cerrado_por` y `cerrado_en` son obligatorios.
- El backend crea la fila al abrir el mes, una por DDRISS activa (en el proyecto, solo San Marcos).

### 4.3 Operación de vacunación (7 tablas)

**`reporte_produccion`**: el reporte mensual de un establecimiento, equivalente digital de un formulario 5C. Es la unidad que pasa por el ciclo de estados.
- Llaves: `id`, `establecimiento_id` → establecimiento, `periodo_id` → periodo. Único (`establecimiento_id`, `periodo_id`), lo que evita reportes duplicados.
- Estado: `estado` → estado_reporte, `numero_rectificacion`, `observaciones`.
- Responsables y fechas: `creado_por` → usuario, `revisor_id` → usuario, `asignado_en`, `aprobado_por` → usuario, `enviado_en`, `aprobado_en`, `cerrado_en`, `creado_en`, `actualizado_en`.
- `version_fila`: control de concurrencia optimista.

**`reporte_vacuna`**: la sección de un reporte que corresponde a **una vacuna**, capturada con **una versión** de su esquema. Es el vínculo principal con MongoDB.
- Columnas: `id`, `reporte_id` → reporte_produccion, `vacuna_id` → vacuna.
- `esquema_mongo_id` (ObjectId en `esquemas_captura`) y `esquema_version`: la versión exacta del esquema que se usó.
- `datos_adicionales` (JSON con campos no dimensionales del esquema) y `total_declarado` (se contrasta con la suma del detalle).
- Único (`reporte_id`, `vacuna_id`).

**`detalle_produccion`**: **el hecho central**. Cada fila es una celda del formulario: una cantidad de dosis.
- Columnas fijas: `id`, `reporte_vacuna_id` → reporte_vacuna, `dosis_id` → dosis, `municipio_procedencia_id` → municipio, `cantidad`.
- `clave_combinacion`: texto canónico con las dimensiones ordenadas por código, por ejemplo `grupo_edad=MENOR_1|sexo=F`. Queda vacío si la vacuna no desagrega.
- Auditoría: `actualizado_por` → usuario, `actualizado_en`.
- Único (`reporte_vacuna_id`, `dosis_id`, `municipio_procedencia_id`, `clave_combinacion`): impide celdas duplicadas aunque las dimensiones varíen.

**`detalle_dimension`**: los valores de las dimensiones dinámicas de cada celda, una fila por dimensión. Es la forma consultable de `clave_combinacion`.
- Columnas: `detalle_id` → detalle_produccion, `dimension_codigo` (código en `catalogo_dimensiones`), `valor_codigo`. Llave (`detalle_id`, `dimension_codigo`).
- Es una entidad débil y se borra en cascada con su detalle. Los códigos no tienen llave foránea porque viven en MongoDB; los valida el backend.

**`corrida_calculo`**: cada ejecución del motor de indicadores. Hace los resultados reproducibles.
- Columnas: `id`, `anio`, `mes_hasta` (mes de corte), `disparada_por` → usuario (NULL si fue automática), `motivo` (CIERRE_PERIODO, RECTIFICACION, MANUAL, PROGRAMADA), `estado` (EN_PROCESO, COMPLETADA, FALLIDA), `iniciada_en`, `finalizada_en`, `vigente`.

**`resultado_indicador`**: resultados calculados (cobertura, brecha, deserción, proyección) por municipio o a nivel departamental. De aquí leen el tablero y el mapa.
- Llaves y configuración: `id`, `corrida_id` → corrida_calculo, `indicador_codigo` + `indicador_version` (en `configuracion_indicadores`).
- Alcance: `municipio_id` → municipio (NULL = departamental), `vacuna_id` → vacuna, `dosis_id` → dosis, `filtro_dimensiones`, `anio`, `mes`.
- Valores: `es_proyeccion` (TRUE = estimación), `numerador`, `denominador`, `valor`, `meta`, `brecha_dosis`, `cumple_meta`, `calculado_en`.

**`alerta`**: alertas automáticas.
- Contenido: `id`, `tipo` (REPORTE_PENDIENTE, CALIDAD, COBERTURA_BAJO_META, PROCESO), `severidad` (INFO, ADVERTENCIA, CRITICA), `titulo`, `mensaje`.
- A qué se refiere, todo opcional: `ddriss_id` → ddriss (v0.5; bandeja de la DDRISS, NULL = nivel nacional), `periodo_id`, `municipio_id`, `establecimiento_id`, `reporte_id`, `resultado_indicador_id`.
- Destino y atención: `rol_destino_id` → rol, `estado` (ACTIVA, ATENDIDA, DESCARTADA), `atendida_por` → usuario, `atendida_en`, `generada_en`.

### 4.4 Trazabilidad y reportes (8 tablas)

**`estado_reporte`**: catálogo de los 7 estados del reporte.
- Columnas: `codigo` (PK), `nombre`, `permite_edicion`, `orden`.
- Códigos: BORRADOR, ENVIADO, EN_REVISION, CORRECCION_SOLICITADA, APROBADO, CERRADO, RECTIFICACION. Solo BORRADOR y RECTIFICACION permiten edición.

**`transicion_estado`**: qué cambios de estado puede hacer cada rol. El backend la consulta antes de cada transición.
- Columnas: `estado_origen` → estado_reporte, `estado_destino` → estado_reporte, `rol_id` → rol, `requiere_comentario`. Llave compuesta.
- Semillas:

| Origen → destino | Rol |
|---|---|
| BORRADOR → ENVIADO | Establecimiento |
| ENVIADO → EN_REVISION | Revisor |
| EN_REVISION → CORRECCION_SOLICITADA | Revisor, con comentario |
| EN_REVISION → APROBADO | Revisor |
| CORRECCION_SOLICITADA → BORRADOR | Establecimiento |
| APROBADO → CERRADO | Revisor |
| CERRADO → RECTIFICACION | Revisor, con comentario |
| RECTIFICACION → CERRADO | Revisor, con comentario |

**`historial_estado_reporte`**: registro de cada transición de estado de un reporte.
- Columnas: `id`, `reporte_id` → reporte_produccion, `estado_anterior` → estado_reporte, `estado_nuevo` → estado_reporte, `usuario_id` → usuario, `comentario`, `fecha`.

**`observacion_revision`**: observaciones de la estadígrafa al solicitar correcciones. Pueden ser generales, de una vacuna o de una celda.
- Columnas: `id`, `reporte_id` → reporte_produccion, `reporte_vacuna_id` → reporte_vacuna (opcional), `detalle_id` → detalle_produccion (opcional), `usuario_id` → usuario, `texto`, `atendida`, `atendida_en`, `creado_en`.

**`resultado_validacion`**: errores y advertencias que produjo la ejecución de las reglas de MongoDB sobre un reporte.
- Llaves: `id`, `reporte_id` → reporte_produccion, `reporte_vacuna_id`, `detalle_id`.
- Regla y resultado: `regla_codigo` + `regla_version`, `severidad` (ERROR bloquea el envío; ADVERTENCIA exige revisión), `mensaje`, `estado` (ABIERTO, CORREGIDO, JUSTIFICADO), `justificacion`, `ejecutado_en`.

**`solicitud_rectificacion`**: pedido justificado de cambiar un reporte **ya cerrado**.
- Columnas: `id`, `reporte_id` → reporte_produccion, `solicitado_por` → usuario, `motivo`, `evidencia_ruta` (documento de respaldo, nunca datos de pacientes), `estado` (PENDIENTE, AUTORIZADA, RECHAZADA, APLICADA), `resuelto_por` → usuario, `comentario_resolucion`, `solicitado_en`, `resuelto_en`, `aplicado_en`.

**`rectificacion_detalle`**: evidencia, celda por celda, del dato anterior y el nuevo en una rectificación.
- Columnas: `id`, `solicitud_id` → solicitud_rectificacion, `detalle_id` → detalle_produccion (NULL si la celda es nueva), `reporte_vacuna_id`, `dosis_id`, `municipio_procedencia_id`, `clave_combinacion`, `cantidad_anterior`, `cantidad_nueva`.

**`bitacora`**: auditoría general de solo inserción. Cubre las bitácoras de usuarios, producción, revisión, rectificaciones y configuración, incluidos los cambios en MongoDB.
- Quién y cuándo: `id`, `fecha` (con milisegundos), `usuario_id` → usuario (NULL en accesos fallidos o procesos automáticos), `nombre_usuario_intento`.
- Qué se hizo: `modulo` (USUARIOS, CONFIGURACION, PRODUCCION, REVISION, RECTIFICACION, INDICADORES, REPORTES, SISTEMA), `accion` (por ejemplo LOGIN_OK, LOGIN_FALLIDO, CREAR, CAMBIO_ESTADO), `entidad` (tabla o colección), `entidad_id`.
- Cambio y origen: `valores_anteriores` y `valores_nuevos` (JSON), `ip_origen`, `agente_usuario`.
- El usuario de base de datos de la aplicación solo tendrá INSERT y SELECT sobre esta tabla.

---

## 5. Vistas de MySQL (4)

| Vista | Para qué sirve |
|---|---|
| `v_produccion` | Une detalle, reporte, periodo, DDRISS que recibió el reporte (`ddriss_id`, `ddriss_codigo`), establecimiento, municipios de aplicación y procedencia, vacuna y dosis. Incluye `es_poblacion_propia` (procedencia = municipio de aplicación) y `solo_cobertura` del establecimiento (v0.8). Es la base de las demás vistas. |
| `v_produccion_dimension` | `v_produccion` más una fila por dimensión (`dimension_codigo`, `valor_codigo`). Sirve para filtrar o agrupar por cualquier dimensión, por ejemplo `dimension_codigo='grupo_edad' AND valor_codigo='MENOR_1'`. |
| `v_consolidado_establecimiento` | Reproduce el **Excel 1** (`dosis_poblacion_propia`) y el **Excel 2**, que es la producción total incluidos Migrantes (`dosis_total`). Excluye los establecimientos con `solo_cobertura` (v0.8); `dosis_otros_municipios` es la diferencia. Toma reportes APROBADO, CERRADO y RECTIFICACION. Agrupa también por DDRISS. |
| `v_produccion_atribuida` | Reproduce el **Excel 3**: numerador de cobertura **por municipio de procedencia** y DDRISS que recibió el reporte. Solo toma reportes CERRADO y (v0.7) solo procedencias del departamento de esa DDRISS, así que Migrantes (9999) y otros departamentos quedan fuera. Incluye a los establecimientos con `solo_cobertura` (Hospital de San Marcos). |

---

## 6. MongoDB: las 4 colecciones

Base de datos `vacunacion_config`. Las cuatro colecciones guardan configuración, nunca producción.

Mecánica de versionado, común a las tres últimas:
- Llave única (`codigo`, `version`); en esquemas, (`vacuna.codigo`, `version`).
- `estado`: BORRADOR, VIGENTE o HISTORICO. Un índice único parcial asegura **una sola versión VIGENTE** por código y territorio (en esquemas, por vacuna y territorio desde el script v0.7).
- Subdocumento `vigencia` (`desde`, `hasta`).
- Subdocumento `auditoria`: `creado_por` y `publicado_por` son ids de `usuario` en MySQL, más `motivo_cambio`.

**`catalogo_dimensiones`**: las formas de desagregar la producción y sus valores permitidos. Una dimensión se reutiliza entre vacunas.
- Campos: `codigo` (único; por ejemplo `sexo`, `grupo_edad`, `estado_embarazo`), `nombre`, `tipo` (CATEGORICA o RANGO_EDAD), `valores[]` con `codigo`, `etiqueta`, `orden`, `activo` y, si es rango de edad, `edad_min_meses` y `edad_max_meses`.
- No se versiona: los valores solo se agregan o se desactivan, nunca se borran ni renombran, para que los códigos guardados en `detalle_dimension` sigan siendo válidos.

**`esquemas_captura`**: el "molde" del formulario de cada vacuna. A partir de él, React genera el formulario.
- `vacuna` (`id` y `codigo` de MySQL), `version`, `estado`, `vigencia`, `version_anterior_id` (la versión anterior **del mismo territorio**: la cadena de esa DDRISS o la nacional).
- `territorio` (script v0.7): igual que en `reglas_validacion`. El formulario NACIONAL es la base; una DDRISS puede tener el suyo.
- `basado_en` (script v0.7): `{ esquema_id, version }` de la versión NACIONAL de la que se copió un formulario de DDRISS; null en los nacionales.
- `dimensiones.dosis[]`: cada dosis puede traer su propia `desagregacion`, que reemplaza la general.
- `dimensiones.procedencia.modo`: `MUNICIPIO_DETALLADO` o `PROPIO_Y_OTROS` (réplica del 5C).
- `dimensiones.desagregacion[]`: qué dimensiones usa la vacuna y con qué subconjunto de valores.
- `secciones[]` (v0.4 del script): encabezados del 5C con `codigo`, `titulo` ("< 1 año"), `orden`, `grupo_edad` y `dosis[]`. La misma dosis puede estar en varias secciones; si la vacuna no desagrega por edad, `grupo_edad` es null.
- `campos_adicionales[]`, `reglas[]` (código y versión de cada regla), `presentacion`.
- `incluir_por_defecto` (script v0.8, opcional): `true` si la vacuna entra en cada reporte nuevo del mes que cubre la versión. Si falta, el backend la toma como `true`. Es parte de la versión: para cambiarla se publica una nueva. Un borrador vacío empieza en `false` y una copia la hereda.
- Las celdas del formulario son las dosis × los valores de cada dimensión; con secciones, una celda existe solo si su dosis está en la sección de su grupo de edad.

Reglas de los formularios por DDRISS (script v0.7):
- **Resolución.** Para capturar una vacuna en un establecimiento, el backend toma la DDRISS del establecimiento (`establecimiento.ddriss_id` → `ddriss.codigo`) y busca el esquema VIGENTE de esa vacuna con ese `ddriss_codigo`; si no hay, usa el VIGENTE NACIONAL. El reporte guarda el que usó en `reporte_vacuna.esquema_mongo_id` + `esquema_version`.
- **Crear o editar el formulario de una DDRISS.** Se copia el esquema VIGENTE (el de la DDRISS si ya tiene uno; si no, el nacional) a un documento nuevo en BORRADOR con el `territorio` de la DDRISS, `version` = la mayor versión de esa vacuna en todo el país + 1, `version_anterior_id` = la versión anterior de esa DDRISS (o null) y `basado_en` = la versión nacional de la que parte. Al publicarlo, la VIGENTE anterior de esa DDRISS pasa a HISTORICO. La nacional no se toca. Ejemplo: si HEXA v2 es nacional, el primer formulario de San Marcos para HEXA es v3 con territorio `DDRISS_SM`.
- **Desactualización (`basado_en`).** Cuando se publica una versión nacional nueva de una vacuna, los formularios de DDRISS cuyo `basado_en.esquema_id` ya no es la VIGENTE nacional quedan desactualizados. El sistema puede avisar a esa DDRISS para que revise si adopta los cambios; el aviso no cambia su formulario.
- **Dimensiones solo del catálogo (obligatoria).** Cada `dimensiones.desagregacion[].dimension`, y las de las desagregaciones por dosis, debe existir en `catalogo_dimensiones` con `activo: true`, y cada código de `valores` debe ser un valor activo de esa dimensión. Así el consolidado nacional y la comparación entre DDRISS siguen sumando. Una DDRISS puede usar cualquier dimensión del catálogo, pero no inventar una: agregar una dimensión al catálogo sigue siendo una acción global. `$jsonSchema` no puede validar contra otra colección, así que lo valida el backend al guardar o publicar un esquema.
- **Vacunas de un reporte nuevo (script v0.8).** Al crear el reporte, el backend fija en `reporte_vacuna` solo las vacunas cuyo esquema del mes (resuelto como arriba) tiene `incluir_por_defecto` en `true`. El establecimiento agrega las demás con esquema para el mes y puede quitar las que no son base; una vacuna es base si la versión fijada en su `reporte_vacuna` está marcada.
- **Lo que no cambia.** Las dosis siguen viniendo de MySQL (`vacuna`/`dosis`), así que una DDRISS no puede inventar dosis. Las reglas que referencia un esquema se siguen resolviendo por territorio.

Ejemplos incluidos en el script (todos NACIONAL; el 04 agrega Hexavalente v3 en BORRADOR como formulario de `DDRISS_SM`, basado en la v2 y con la dimensión `pueblo`):

| Vacuna | Dosis | Desagregación |
|---|---|---|
| Hexavalente v1 (histórica) | D1 a D3 | Grupo de edad |
| Hexavalente v2 (vigente) | D1 a D3 | Grupo de edad; secciones "< 1 año" y "De 1 a < 6 años" |
| BCG | Única | Sin desagregación |
| VPH | D1 a D3 | Sexo (en el 5C solo VPH y Tdap de 10 años lo usan) |
| Polio | D1 a D3, R1, R2 | Grupo de edad (cuatro secciones) y presentación (IPV u OPV) |
| Td | D1, D2, R1 | Estado de embarazo y grupo de edad, sin sexo; R1 solo por edad |

**`reglas_validacion`**: reglas declarativas que se ejecutan antes de enviar un reporte. `tipo` elige un validador que ya existe en el backend y `parametros` lo configura.
- Campos: `codigo`, `version`, `nombre`, `tipo`, `ambito` (DETALLE, VACUNA o REPORTE), `severidad` (ERROR o ADVERTENCIA), `aplica_a.vacunas`, `parametros`, `mensaje` (plantilla), `territorio`.
- `territorio` (script v0.3): `{ nivel: NACIONAL | DDRISS, ddriss_codigo }`; `ddriss_codigo` es `ddriss.codigo` de MySQL (p. ej. `DDRISS_SM`) y es null si es nacional. Para una DDRISS el backend usa la versión VIGENTE con su código si existe; si no, la NACIONAL. Todas las semillas son NACIONAL. `(codigo, version)` sigue siendo único en todo el país, por eso MySQL guarda solo código y versión.
- Reglas de ejemplo:

| Regla | Severidad |
|---|---|
| CAMPOS_COMPLETOS | Error |
| DIMENSIONES_VALIDAS | Error |
| NO_NEGATIVO | Error |
| TOTAL_CUADRA | Error |
| SECUENCIA_DOSIS | Advertencia |
| VARIACION_HISTORICA | Advertencia |

**`configuracion_indicadores`**: cómo calcular cada indicador. El cálculo lo hace el backend y escribe el resultado en `resultado_indicador`.
- `tipo_calculo` (COBERTURA, BRECHA, DESERCION, PROYECCION).
- `aplica_a[]`: vacuna, dosis o dosis inicial y final, `clasificacion_poblacion` y `filtros_dimension`, por ejemplo `{grupo_edad:["MENOR_1"]}`.
- `numerador` (fuente, estados del reporte, `atribucion` PROCEDENCIA o APLICACION, acumulado) y `denominador` (fuente, prorrateo).
- `meta`, `umbrales` (semáforo), `periodicidad`, `alerta` (si genera alertas y a qué roles) y `es_estimacion`.
- `territorio`: igual que en `reglas_validacion`, con la misma prioridad de la DDRISS sobre la nacional.

Ejemplos:

| Indicador | Cálculo |
|---|---|
| COB_HEXA3 | Cobertura de D3 en menores de 1 año; meta > 95 % |
| BRECHA_HEXA3 | Dosis faltantes para alcanzar la meta |
| DES_HEXA1_3 | Deserción (D1 − D3) / D1; aceptable ≤ 10 % |
| PROY_COB_HEXA3 | Proyección a fin de año, marcada como estimación |
| AVANCE_HEXA3 | (v0.6) Dosis acumuladas ÷ (población ÷ 12 × número de mes) × 100; la meta del mes vale 100 % y las vacunas que faltan van en `brecha_dosis`. Indicador por defecto del mapa (`es_indicador_mapa`); semáforo 80/90 **provisional** (`umbrales_provisionales: true`) |

---

## 7. Cómo se relacionan MySQL y MongoDB

No hay llaves foráneas entre motores. Los vínculos son estos:

| En MySQL | Apunta a MongoDB |
|---|---|
| `reporte_vacuna.esquema_mongo_id` + `esquema_version` | `esquemas_captura._id` + `version` |
| `detalle_dimension.dimension_codigo` / `valor_codigo` | `catalogo_dimensiones.codigo` / `valores.codigo` |
| `resultado_validacion.regla_codigo` + `regla_version` | `reglas_validacion.codigo` + `version` |
| `resultado_indicador.indicador_codigo` + `indicador_version` | `configuracion_indicadores.codigo` + `version` |
| `bitacora.entidad` + `entidad_id` | nombre de colección + ObjectId |

| En MongoDB | Apunta a MySQL |
|---|---|
| `esquemas_captura.vacuna.id` / `.codigo` | `vacuna.id` / `vacuna.codigo` |
| Códigos de dosis en esquemas e indicadores | `dosis.codigo` |
| `aplica_a.clasificacion_poblacion` | `clasificacion_poblacion.codigo` |
| `auditoria.creado_por` / `publicado_por` | `usuario.id` |

**Flujos principales:**
1. **Abrir un formulario.** El backend lee el esquema VIGENTE de la vacuna para la DDRISS del establecimiento (o el NACIONAL si la DDRISS no tiene uno) y el catálogo de dimensiones, y genera las celdas. Si el reporte ya existe, usa la versión guardada en `reporte_vacuna`.
2. **Guardar.** Cada celda se escribe en `detalle_produccion` y `detalle_dimension` dentro de una misma transacción.
3. **Enviar.** Se ejecutan las reglas del esquema y se guardan en `resultado_validacion`. Si quedan errores abiertos, el envío se rechaza.
4. **Revisar y cerrar.** Cada transición se valida contra `transicion_estado` y se registra en `historial_estado_reporte` y en `bitacora`.
5. **Calcular indicadores.** Al cerrar un periodo o aplicar una rectificación, se crea una `corrida_calculo`, se leen las configuraciones vigentes, se traducen los `filtros_dimension` a condiciones sobre `detalle_dimension` y se escriben `resultado_indicador` y `alerta`.

---

## 8. Reglas que cualquier cambio o código debe respetar

- No agregar columnas ni colecciones con datos de pacientes (nombre, DPI, fecha de nacimiento, diagnóstico, etc.).
- No agregar columnas fijas por dimensión (sexo, edad…) a `detalle_produccion`. Las dimensiones nuevas van en `catalogo_dimensiones` y en el esquema de la vacuna.
- Toda escritura de celdas debe mantener coherentes `clave_combinacion` y las filas de `detalle_dimension`.
- No editar ni borrar versiones VIGENTE o HISTORICO en MongoDB; crear una versión nueva.
- Un esquema de captura solo usa dimensiones y valores activos de `catalogo_dimensiones`, sea nacional o de una DDRISS; lo valida el backend.
- No borrar ni renombrar códigos de catálogos ni valores de dimensiones; desactivarlos.
- Los cambios de estado de un reporte solo se hacen si existen en `transicion_estado` para el rol del usuario.
- Las acciones auditables apuntan a `usuario`. Los datos de la persona se consultan en `empleado`.
- Un usuario tiene a lo sumo una fila abierta en `sesion`; las fechas de la sesión se escriben y comparan con `NOW()` de MySQL. El refresh token nunca se guarda en claro.
- Toda consulta y bandeja se filtra por la DDRISS del usuario (`empleado.ddriss_id`); solo `AUTORIDAD` sin DDRISS ve todas. No volver a guardar banderas fijas de San Marcos: la jurisdicción se deduce de `ddriss`.
- El estado del mes (abierto, en cierre, cerrado) y la fecha límite se leen y cambian en `cierre_periodo` para la DDRISS correspondiente, nunca en `periodo`.
- La cobertura usa reportes **CERRADO** y atribución por **procedencia**, salvo que la configuración del indicador diga otra cosa.

---

## 9. Supuestos y pendientes

Valores elegidos por el equipo de diseño que deben validarse:
- Grupos de edad, vacunas y dosis de las semillas son **ejemplos**; deben sustituirse por los del 5C vigente.
- Códigos INE de los municipios (1201 a 1230, y 0920 para Coatepeque) **por verificar** contra el catálogo INE y el GeoJSON.
- Semáforo del mapa 80/90 % (provisional: cambiará cuando Epidemiología confirme los rangos exactos), umbral de deserción ≤ 10 %, semáforo 95/80 % de `COB_HEXA3`, prorrateo mensual lineal del denominador y proyección por promedio móvil de 3 meses: **por confirmar con Epidemiología**.
- El contacto del establecimiento es texto libre; podría pasar a ser una llave foránea a `empleado` si el equipo lo decide.
- El código de la DDRISS (`DDRISS_SM`) es provisional, y falta confirmar si algún departamento tiene más de una DDRISS.

Preguntas abiertas para la DDRISS (detalle en la sección 7 de `03_documento_diseno_bd.md`):
- ¿Qué dimensiones usa realmente cada vacuna?
- ¿Se puede identificar el municipio exacto de procedencia?
- ¿Quién reporta: cada establecimiento o el consolidado municipal?
- ¿Cómo reporta la institución de Coatepeque?
- ¿Cuál es la fuente oficial de la población objetivo?
- ¿Quién autoriza las rectificaciones?
- ¿Cuál es la fecha límite de envío de cada mes?

---

## 10. Glosario mínimo

| Término | Significado en este modelo |
|---|---|
| 5C / SIGSA-S5c | Formulario oficial de consolidado mensual de vacunación; `reporte_produccion` es su equivalente digital |
| Producción | Cantidad de dosis aplicadas (dato agregado) |
| Municipio de aplicación | Municipio del establecimiento que vacunó |
| Municipio de procedencia | Municipio donde vive la persona vacunada; se usa para atribuir la cobertura |
| Dimensión | Forma de desagregar una cantidad (sexo, grupo de edad, embarazo…); definida en MongoDB |
| Esquema de captura | Definición versionada del formulario de una vacuna |
| Población objetivo | Denominador de la cobertura por municipio, año, vacuna y clasificación |
| Cobertura / brecha / deserción / proyección | Indicadores calculados por el backend y guardados en `resultado_indicador` |
| Rectificación | Cambio justificado a un reporte cerrado, con evidencia del dato anterior |
| DDRISS | Dirección Departamental de Redes Integradas de Servicios de Salud; tabla `ddriss`. El proyecto opera solo la de San Marcos |
