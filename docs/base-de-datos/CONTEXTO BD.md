# Contexto de la base de datos — Plataforma de vacunación DDRISS San Marcos

> **Para qué sirve este documento.** Da contexto preciso sobre la base de datos del proyecto a otros agentes de IA y a los integrantes del equipo. Resume qué se trabajó, cómo está organizada la persistencia (MySQL + MongoDB) y qué es y para qué sirve cada tabla y cada colección.
>
> **Estado:** modelo preliminar **v0.5** (10 de octubre de 2026), preparado para varias DDRISS. El modelo se sigue refinando por sprint.
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
| **v0.5** | 2026-10-10 | **Modelo preparado para varias DDRISS**, operando solo San Marcos. Bloque A: tabla `ddriss`, `distrito_salud.ddriss_id`, `establecimiento.ddriss_id` (DDRISS a la que reporta) y se elimina `municipio.es_jurisdiccion`. Bloque B: `empleado.ddriss_id`; los 5 roles se conservan y `AUTORIDAD` sin DDRISS es la autoridad nacional. Bloque C: `periodo` queda como calendario común y la nueva tabla `cierre_periodo` guarda el estado del mes por DDRISS; `alerta.ddriss_id`; las vistas exponen la DDRISS. MongoDB (script v0.3): campo `territorio` en reglas e indicadores. |

Entregables generados en el hilo, todos en `/mnt/project-files/diseno-bd/`:

| Archivo | Contenido |
|---|---|
| `01_modelo_relacional_mysql.sql` | DDL de MySQL: 32 tablas, 4 vistas y datos semilla mínimos |
| `02_colecciones_mongodb.js` | 4 colecciones con validadores `$jsonSchema`, índices y documentos de ejemplo |
| `03_documento_diseno_bd.md` | Documento de diseño con justificación, decisiones, supuestos y preguntas abiertas |
| `04_modelo_relacional.dbml` | Modelo MySQL para dbdiagram.io, agrupado en los 4 grupos de la propuesta v2 |
| `05_contexto_base_de_datos.md` | Este documento |
| `diagrama_er.png` | Diagrama ER (Mermaid) |
| `06_guia_instalacion_local.docx` | Guía corta para crear ambas bases en local |
| `plan_v05_multi_ddriss.md` | Plan de la v0.5 y su avance por bloques |
| `_archivo/diagramas_chen/` | Diagramas de Chen de la v0.4; archivados, ya no se actualizan |

**Verificación realizada:**
- El DDL v0.5 se ejecutó en MariaDB 10.11 (sustituyendo la colación `utf8mb4_0900_ai_ci` por `utf8mb4_unicode_ci`). Crea 32 tablas, 4 vistas y 73 llaves foráneas.
- Con datos de prueba se comprobaron las vistas, el rechazo de duplicados y la restricción de una cuenta por empleado. En v0.5 también: establecimientos ligados a la DDRISS (incluido el externo de Coatepeque), rechazo de una DDRISS inexistente, un empleado sin DDRISS (autoridad nacional), dos DDRISS con estados distintos en el mismo mes, el rechazo de un cierre sin responsable o duplicado, y las vistas y alertas filtradas por DDRISS.
- El DBML se convierte de vuelta a SQL y produce las mismas 32 tablas y 73 llaves foráneas.
- El script de MongoDB **no se ha ejecutado contra un servidor MongoDB real**; solo se verificó su sintaxis JavaScript.

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
- **Procedencia desconocida o de otro departamento:** municipio especial con `codigo_ine = '9999'`.

---

## 4. MySQL: las 32 tablas

Base de datos `vacunacion_ddriss` (MySQL 8.0, InnoDB, utf8mb4). Las tablas se agrupan según los cuatro grupos de MySQL de la propuesta v2. "→" indica una llave foránea.

### 4.1 Seguridad y organización (11 tablas)

**`rol`**: catálogo de roles del sistema. Sirve para asignar a cada cuenta lo que puede hacer.
- Columnas: `id`, `codigo` (único), `nombre`, `descripcion`.
- Valores semilla: `ESTABLECIMIENTO` (personal del establecimiento), `REVISOR` (estadígrafa / revisor DDRISS), `EPIDEMIOLOGIA`, `ADMINISTRADOR` y `AUTORIDAD` (solo consulta). Los 5 roles funcionan. El alcance de `AUTORIDAD` lo da `empleado.ddriss_id`: con una DDRISS consulta esa DDRISS; sin DDRISS (NULL) consulta todo el país.

**`permiso`**: catálogo de acciones permitidas, por ejemplo `REPORTE_APROBAR`. Sirve para controlar el acceso fino por módulo.
- Columnas: `id`, `codigo` (único), `modulo`, `descripcion`.

**`rol_permiso`**: relación N:M entre roles y permisos; indica qué permisos tiene cada rol.
- Columnas: `rol_id` → rol, `permiso_id` → permiso. Llave compuesta.

**`empleado`** (nueva en v0.4): **datos del personal**, es decir quién es y dónde trabaja. Sirve para identificar y contactar a las personas, que no son pacientes. Un empleado puede existir **sin cuenta**, por ejemplo alguien que solo figura como contacto.
- Columnas: `id`, `codigo_empleado` (único, opcional), `nombres`, `apellidos`, `cargo`, `correo` (único, opcional; se usa para notificaciones y recuperación de contraseña), `telefono`, `activo`, `creado_en`, `actualizado_en`.
- `establecimiento_id` → establecimiento: lugar de trabajo; obligatorio en la práctica para el personal de establecimiento.
- `ddriss_id` → ddriss (v0.5, opcional): DDRISS donde trabaja; define el alcance de lo que ve. Solo el rol `AUTORIDAD` puede dejarlo NULL (autoridad nacional); lo valida el backend.
- `municipio_id` → municipio: alcance territorial opcional, por ejemplo un coordinador municipal.
- No guarda DPI ni otros datos personales innecesarios.

**`usuario`** (reducida en v0.4): **cuentas de acceso**, solo los datos para iniciar sesión y controlar la cuenta. Sirve para autenticación y autorización.
- Columnas: `id`, `nombre_usuario` (único), `hash_contrasena` (bcrypt/argon2), `activo`, `intentos_fallidos`, `bloqueado_hasta`, `debe_cambiar_contrasena`, `ultimo_acceso`, `creado_en`, `actualizado_en`, `desactivado_en`.
- `empleado_id` → empleado, **único**: relación 1:1, un empleado tiene a lo sumo una cuenta.
- `rol_id` → rol: un rol por cuenta.
- `creado_por` → usuario: el administrador que creó la cuenta.
- Nombre, correo y establecimiento se obtienen de `empleado`. Los permisos sobre reportes se deducen de `usuario.rol_id`, `empleado.establecimiento_id` y `empleado.ddriss_id`.

**`departamento`**: catálogo de departamentos.
- Columnas: `id`, `codigo_ine` (único), `nombre`.
- Semillas: `12` San Marcos, `09` Quetzaltenango (por Coatepeque) y `99` No especificado.

**`municipio`**: catálogo de municipios (INE). Incluye municipios de fuera de la DDRISS para registrar la procedencia.
- Columnas: `id`, `departamento_id` → departamento, `codigo_ine` (único; también es la llave del GeoJSON de Leaflet), `nombre`, `activo`.
- En v0.5 se eliminó `es_jurisdiccion`: un municipio pertenece a una DDRISS si alguno de sus distritos de salud pertenece a ella.
- Semillas: los 30 municipios de San Marcos (códigos 1201 a 1230), `9999` Procedencia no especificada y `0920` Coatepeque.

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
- Banderas: `reporta_produccion` (FALSE si otro establecimiento consolida su producción), `es_externo` (TRUE si su municipio no pertenece al territorio de la DDRISS a la que reporta, como Coatepeque con San Marcos; lo valida el backend), `activo`.
- **Dirección y contacto (v0.4):** `direccion` (dirección física; el municipio va aparte), `telefono`, `correo`, `nombre_contacto` (persona de contacto en texto libre).
- Auditoría: `creado_en`, `actualizado_en`.

### 4.2 Catálogos sanitarios (6 tablas)

**`vacuna`**: catálogo de vacunas, la *identidad* de cada una. Cómo se captura cada vacuna está en MongoDB.
- Columnas: `id`, `codigo` (único; llave compartida con MongoDB, por ejemplo `PENTA`), `nombre`, `descripcion`, `orden_informe`, `activa`, `creado_en`.
- Semillas de ejemplo: BCG, PENTA, SPR y TD.

**`dosis`**: dosis de cada vacuna. Su `orden` sostiene el cálculo de deserción entre dosis.
- Columnas: `id`, `vacuna_id` → vacuna, `codigo` (D1, D2, D3, R1, UNICA…), `nombre`, `orden`, `activa`.
- Único (`vacuna_id`, `codigo`).

**`clasificacion_poblacion`**: tipos de población que sirven de **denominador** de la cobertura.
- Columnas: `id`, `codigo` (único), `descripcion`.
- Semillas: `MENOR_1`, `UN_ANIO`, `EMBARAZADAS`, `MEF` (mujeres en edad fértil, 15 a 49 años).
- No confundir con `tipo_establecimiento` ni con las dimensiones de MongoDB: estas desagregan el *numerador*.

**`poblacion_objetivo`**: denominadores de cobertura, es decir cuántas personas hay por municipio, año, vacuna y clasificación.
- Columnas: `id`, `municipio_id` → municipio, `anio`, `vacuna_id` → vacuna, `clasificacion_poblacion_id` → clasificacion_poblacion, `cantidad`, `fuente`, `registrado_por` → usuario, `creado_en`, `actualizado_en`.
- Único (`municipio_id`, `anio`, `vacuna_id`, `clasificacion_poblacion_id`).

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
| `v_produccion` | Une detalle, reporte, periodo, DDRISS que recibió el reporte (`ddriss_id`, `ddriss_codigo`), establecimiento, municipios de aplicación y procedencia, vacuna y dosis. Incluye `es_poblacion_propia` (procedencia = municipio de aplicación). Es la base de las demás vistas. |
| `v_produccion_dimension` | `v_produccion` más una fila por dimensión (`dimension_codigo`, `valor_codigo`). Sirve para filtrar o agrupar por cualquier dimensión, por ejemplo `dimension_codigo='grupo_edad' AND valor_codigo='MENOR_1'`. |
| `v_consolidado_establecimiento` | Reproduce los **tres Excel** que hoy lleva la estadígrafa: dosis a población propia (Excel 1), dosis a otros municipios (Excel 2) y total (Excel 3). Toma reportes APROBADO, CERRADO y RECTIFICACION. Agrupa también por DDRISS. |
| `v_produccion_atribuida` | Numerador de cobertura **por municipio de procedencia** y DDRISS que recibió el reporte. Solo toma reportes CERRADO. Para la cobertura nacional de un municipio se suma sobre todas las DDRISS. |

---

## 6. MongoDB: las 4 colecciones

Base de datos `vacunacion_config`. Las cuatro colecciones guardan configuración, nunca producción.

Mecánica de versionado, común a las tres últimas:
- Llave única (`codigo`, `version`); en esquemas, (`vacuna.codigo`, `version`).
- `estado`: BORRADOR, VIGENTE o HISTORICO. Un índice único parcial asegura **una sola versión VIGENTE** por código (en reglas e indicadores, por código y territorio).
- Subdocumento `vigencia` (`desde`, `hasta`).
- Subdocumento `auditoria`: `creado_por` y `publicado_por` son ids de `usuario` en MySQL, más `motivo_cambio`.

**`catalogo_dimensiones`**: las formas de desagregar la producción y sus valores permitidos. Una dimensión se reutiliza entre vacunas.
- Campos: `codigo` (único; por ejemplo `sexo`, `grupo_edad`, `estado_embarazo`), `nombre`, `tipo` (CATEGORICA o RANGO_EDAD), `valores[]` con `codigo`, `etiqueta`, `orden`, `activo` y, si es rango de edad, `edad_min_meses` y `edad_max_meses`.
- No se versiona: los valores solo se agregan o se desactivan, nunca se borran ni renombran, para que los códigos guardados en `detalle_dimension` sigan siendo válidos.

**`esquemas_captura`**: el "molde" del formulario de cada vacuna. A partir de él, React genera el formulario.
- `vacuna` (`id` y `codigo` de MySQL), `version`, `estado`, `vigencia`, `version_anterior_id`.
- `dimensiones.dosis[]`: cada dosis puede traer su propia `desagregacion`, que reemplaza la general.
- `dimensiones.procedencia.modo`: `MUNICIPIO_DETALLADO` o `PROPIO_Y_OTROS` (réplica del 5C).
- `dimensiones.desagregacion[]`: qué dimensiones usa la vacuna y con qué subconjunto de valores.
- `campos_adicionales[]`, `reglas[]` (código y versión de cada regla), `presentacion`.
- Las celdas del formulario son las dosis × los valores de cada dimensión.

Ejemplos incluidos en el script:

| Vacuna | Dosis | Desagregación |
|---|---|---|
| Pentavalente v1 (histórica) | D1 a D3 | Sexo y grupo de edad |
| Pentavalente v2 (vigente) | D1 a D3 | Sexo y grupo de edad |
| BCG | Única | Solo sexo |
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
| COB_PENTA3 | Cobertura de D3 en menores de 1 año; meta > 95 % |
| BRECHA_PENTA3 | Dosis faltantes para alcanzar la meta |
| DES_PENTA1_3 | Deserción (D1 − D3) / D1; aceptable ≤ 10 % |
| PROY_COB_PENTA3 | Proyección a fin de año, marcada como estimación |

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
1. **Abrir un formulario.** El backend lee el esquema VIGENTE de la vacuna y el catálogo de dimensiones, y genera las celdas. Si el reporte ya existe, usa la versión guardada en `reporte_vacuna`.
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
- No borrar ni renombrar códigos de catálogos ni valores de dimensiones; desactivarlos.
- Los cambios de estado de un reporte solo se hacen si existen en `transicion_estado` para el rol del usuario.
- Las acciones auditables apuntan a `usuario`. Los datos de la persona se consultan en `empleado`.
- Toda consulta y bandeja se filtra por la DDRISS del usuario (`empleado.ddriss_id`); solo `AUTORIDAD` sin DDRISS ve todas. No volver a guardar banderas fijas de San Marcos: la jurisdicción se deduce de `ddriss`.
- El estado del mes (abierto, en cierre, cerrado) y la fecha límite se leen y cambian en `cierre_periodo` para la DDRISS correspondiente, nunca en `periodo`.
- La cobertura usa reportes **CERRADO** y atribución por **procedencia**, salvo que la configuración del indicador diga otra cosa.

---

## 9. Supuestos y pendientes

Valores elegidos por el equipo de diseño que deben validarse:
- Grupos de edad, vacunas y dosis de las semillas son **ejemplos**; deben sustituirse por los del 5C vigente.
- Códigos INE de los municipios (1201 a 1230, y 0920 para Coatepeque) **por verificar** contra el catálogo INE y el GeoJSON.
- Umbral de deserción ≤ 10 %, semáforo 95/80 %, prorrateo mensual lineal del denominador y proyección por promedio móvil de 3 meses: **por confirmar con Epidemiología**.
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
