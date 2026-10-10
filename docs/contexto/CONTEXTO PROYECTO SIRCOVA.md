# Contexto del proyecto: Sistema web de producción de vacunación — DDRISS San Marcos

> Documento de contexto generado a partir de la propuesta *"Propuesta – Vacunas"* (versión recibida el 29 de septiembre de 2026), que ahora comprende la **Introducción y los Capítulos 1 (Marco contextual y conceptual), 2 (Diseño y método), 3 (Monografía de la institución) y 4 (Marco teórico)**. Sirve para que cualquier asistente o colaborador entienda **qué se va a construir, para quién, con qué tecnología y en qué plazos**. No sustituye al documento original: ante cualquier duda, manda el documento.
>
> **Versión 2.2 de este contexto** (10/10/2026). Mantiene el resumen de la propuesta de la v2 (29/09/2026), la **sección 13** con las decisiones de diseño posteriores (base de datos, backend y prototipo de pantallas) y agrega la **sección 14** con la información de campo reunida el 10/10/2026 (entrevistas a la estadígrafa y a Epidemiología, y fotografías de un 5C real). La sección 12.1 resume qué cambió de la v1 a la v2. Las versiones anteriores se conservan en `contexto/anteriores/`.

---

## 1. Ficha del proyecto

| Campo | Detalle |
|---|---|
| **Título** | Implementación de un **sistema web** para la gestión, validación y análisis de la producción de vacunación y la automatización de informes de cobertura en la Dirección Departamental de Redes Integradas de Servicios de Salud del departamento de San Marcos |
| **Institución beneficiaria** | DDRISS San Marcos (Dirección Departamental de Redes Integradas de Servicios de Salud), Ministerio de Salud Pública y Asistencia Social (MSPAS), Guatemala. Unidad Ejecutora 215 del MSPAS |
| **Director de la institución** | Dr. Mario Enrique Prado Quintanilla (a agosto de 2026) |
| **Universidad / Facultad** | Universidad Mesoamericana, sede Quetzaltenango — Facultad de Ingeniería — Ingeniería en Sistemas Informática y Ciencias de la Computación |
| **Equipo (4 integrantes)** | Andrea Gabriela López Hidalgo (202308101), Christian José Ramírez Solano (202308041), Kenneth David García Ramírez (202308009), Luis Emmanuel Suárez Menchú (202308019) |
| **Naturaleza** | Proyecto académico con cliente real y autorización de la institución |
| **Periodo de ejecución** | Fase inicial del 7 al 11 de agosto de 2026; desarrollo del 18 de septiembre al 30 de noviembre de 2026 |
| **Metodología** | Scrum: fase inicial + **5 sprints** + fase final de cierre |
| **Fecha del documento** | Quetzaltenango, agosto de 2026 |

> Nota sobre el título: la portada dice ahora "sistema web"; el cuerpo del documento sigue usando indistintamente "plataforma web", "aplicación web" y "sistema".

---

## 2. Resumen en un párrafo

Los 30 municipios de San Marcos reportan cada mes cuántas vacunas aplicaron mediante un formulario físico llamado **5C**. Una sola persona (la **estadígrafa** de la DDRISS) lo digita en tres archivos de Excel y de ahí sale el informe de cobertura que usa Epidemiología. Es lento, manual y propenso a errores. El proyecto construye una **aplicación web centralizada** donde los establecimientos registran su producción directamente, el sistema **valida** la calidad de los datos, la DDRISS **revisa y cierra** cada periodo, y un **motor de indicadores** calcula cobertura, brechas, deserción y proyecciones, que se muestran en **informes, alertas, tablero de control y un mapa** del departamento.

---

## 3. El problema (Capítulo 1)

### 3.1 Contexto institucional
- El **MSPAS** es el ente rector de la salud en Guatemala. La **Unidad de Vacunación** coordina los programas de inmunización a nivel nacional.
- El **Decreto 25-2024, Ley de Vacunación** (aprobado el 29/10/2024, vigente desde el 15/12/2024), garantiza acceso universal y gratuito a las vacunas y obliga al MSPAS a actualizar anualmente el esquema nacional. Su **artículo 24** exige "información periódica y actualizada sobre coberturas de vacunación" en los ámbitos nacional, departamental, municipal y comunitario, y que quienes vacunan notifiquen mediante los formularios oficiales y en los plazos del MSPAS.
- El país se organiza en **DDRISS** (antes "Direcciones de Área de Salud"). San Marcos está en el suroccidente y tiene **30 municipios**, cada uno con su distrito de salud y sus establecimientos.

### 3.2 Cómo funciona hoy el proceso
1. Cada centro de salud llena el formulario **5C / Consolidado Mensual de Vacunación (SIGSA-S5c)**: por **tipo de vacuna, dosis, sexo y grupo de edad**, registra (a) personas del propio municipio vacunadas, (b) personas de otros municipios vacunadas allí, y (c) total de dosis.
2. Los registros de los servicios se integran primero en un **consolidado municipal** que se remite a la DDRISS. Centros de salud, CAP y CAIMI usan el 5C; **algunos hospitales manejan sus propios formatos consolidados**.
3. La estadígrafa recibe las **30 hojas físicas** y las digita en **tres archivos de Excel independientes** (en uso hace más de 15 años):
   - Excel 1: producción de cada municipio a su **propia población**.
   - Excel 2: producción brindada a **personas de otros municipios**.
   - Excel 3: **consolidado total** por centro; es la base del informe de cobertura mensual.
4. Al inicio de cada mes se cita a un representante de cada municipio (**10 personas por día durante 3 días**) para verificar que la digitación del Excel 1 sea correcta.
5. Con lo verificado, la estadígrafa completa los otros dos archivos y consolida antes de fin de mes. El **área de tecnología e informática** hace una revisión posterior.
6. La **epidemióloga** usa ese informe en las reuniones del consejo técnico para mostrar el avance de cada municipio frente a la **meta de cobertura del MSPAS: más de 95% a nivel departamental, de forma homogénea entre municipios**.

Flujo simplificado (sección 4.5.8): actividad de vacunación → registro en el servicio de salud → consolidación municipal → DDRISS San Marcos → revisión y procesamiento → análisis epidemiológico → utilización de resultados. El sistema interviene en el registro, la centralización y el procesamiento a nivel departamental.

### 3.3 Problemas identificados
- **Carga concentrada en una sola persona** (digitación, consolidación, revisión, llamadas para resolver dudas).
- **Verificación presencial** de 3 días al inicio de cada mes que retrasa todo.
- **Formulario 5C obsoleto** (vigente desde 2014): no permite agregar vacunas nuevas ni cambiar su clasificación; algunos centros entregan **formatos personalizados**, así que los datos no son uniformes.
- **Proceso manual, secuencial y propenso a errores**: el informe no siempre sale oportuno ni confiable.
- **SIGSA** (sistema oficial del MSPAS) **no cubre esta necesidad**: reporta vacunas suministradas para distribución, no vacunas efectivamente administradas.

### 3.4 Antecedentes que respaldan el enfoque
- **Castro Calderón (2026)**, USAC: sistema web de inventario para el Laboratorio y Banco de Sangre del Hospital de Villa Nueva; sustituyó Excel, con tablero de alertas.
- **Tucto Pinedo (2019)**, Universidad Nacional de San Martín (Perú): sistema de vigilancia web para DIRESA San Martín; redujo **78.13%** el tiempo de elaborar consolidados y **70.59%** el de análisis y toma de decisiones.
- **OPS / Ministerio de Salud del Perú (2025)** (citado en el marco teórico): una aplicación digital de inmunizaciones redujo **30%** el tiempo de ingreso de datos frente al papel.
- **Herramientas existentes y por qué no sirven:** Tablero Virtual de Cobertura del MSPAS/OPS (2023) y SIGSA (heredan la digitación manual), SIPAI (Nicaragua) y PAIWEB (Colombia) (sistemas nacionales de otros países, orientados al paciente individual, no adaptables a una dirección departamental).
- **Conclusión:** ninguna resuelve de forma adaptable el registro por municipio, los cambios de esquema, la validación, la atribución territorial, el cierre de periodos y el cálculo de indicadores; se justifica un desarrollo a la medida.

### 3.5 Beneficiarios
- **Directos:** estadígrafa, personal de registro en los establecimientos, área de tecnología e informática de la DDRISS, Departamento de Epidemiología.
- **Indirectos:** población de los 30 municipios (información más oportuna para orientar acciones de vacunación).

---

## 4. Objetivos

**General.** Implementar una plataforma web para la DDRISS San Marcos que permita gestionar, validar y analizar la producción de vacunación reportada por los establecimientos, mediante captura, control de calidad, cálculo de indicadores y proyección de cobertura, para automatizar los informes y apoyar la toma de decisiones.

**Específicos.**
1. Identificar el proceso actual de registro, revisión, consolidación y análisis, y definir requerimientos funcionales y no funcionales.
2. Diseñar la arquitectura, la **persistencia políglota (MySQL + MongoDB)**, el modelo de datos y los **esquemas dinámicos y versionados** de captura.
3. Desarrollar registro, **atribución territorial**, validación automática, revisión y **cierre de periodos**.
4. Implementar un **motor de indicadores** (cobertura, brechas, proyecciones, deserción entre dosis).
5. Desarrollar consulta y análisis: **informes automatizados, alertas, tablero de control y visualización territorial**.
6. Evaluar el sistema con **pruebas técnicas y con usuarios**.
7. **Desplegar** la aplicación en la nube.
8. **Capacitar** al personal responsable.

*(Sin cambios respecto a la versión anterior.)*

---

## 5. La solución (Capítulo 2)

### 5.1 Ideas de diseño clave
- **Formularios dinámicos y versionados:** en vez de un formulario fijo como el 5C, cada vacuna tiene un *esquema de captura* (campos, dosis, sexo, grupo de edad, validaciones) con **versión y vigencia**. Si cambia, se crea una nueva versión sin tocar los registros viejos, y cada registro guarda **qué versión de esquema se usó**.
- **No todas las vacunas usan las mismas categorías** (sección 4.2.4): unas se desagregan por sexo o edad, otras por primera, segunda o tercera dosis y refuerzos, y la cantidad y clasificación de los biológicos cambia con el tiempo.
- **Atribución territorial:** se registra tanto **dónde se aplicó** la vacuna como el **municipio de procedencia** de la persona atendida, para asignar bien la dosis al calcular cobertura.
- **Poblaciones objetivo:** los denominadores del cálculo de cobertura se administran por municipio, año, vacuna y clasificación.
- **Flujo de revisión con estados** (sección 5.4) para separar datos en elaboración de datos aprobados y cerrados.
- **Solo datos agregados:** el sistema **no almacena datos de pacientes** (ni expedientes, ni diagnósticos, ni datos personales); trabaja con cantidades por municipio y establecimiento.
- **Las proyecciones se muestran como estimaciones**, diferenciadas de los valores reales registrados.
- **Establecimientos de varios tipos:** el registro no debe diseñarse alrededor de una sola categoría de servicio. Se contemplan centros de salud, CAP, CAIMI y potencialmente hospitales, e incluso **un establecimiento de Coatepeque** (fuera del departamento) que atiende población originaria de San Marcos. El módulo de catálogos habla ahora de "establecimientos de salud **e instituciones**".

### 5.2 Arquitectura y tecnologías

Arquitectura web **cliente-servidor** en capas (presentación / lógica de negocio / persistencia). El marco teórico (4.1.4) declara que la arquitectura adopta el patrón **Modelo-Vista-Controlador (MVC)** como principio de organización.

| Capa | Tecnología |
|---|---|
| Interfaz web | **React** (opciones según rol) |
| API y lógica de negocio | **Node.js + Express.js** en **JavaScript**, API REST documentada con **OpenAPI 3** (ver sección 13) |
| Persistencia relacional | **MySQL** — datos estructurados y transaccionales |
| Persistencia documental | **MongoDB** — configuraciones flexibles y versionadas |
| Gráficos | Librería de gráficos compatible con React |
| Mapa territorial | **Leaflet + archivos GeoJSON** (municipios de San Marcos) |
| Exportación de informes | **Excel (prioritario)** y PDF, con librerías compatibles con Node.js (sin definir). La estadígrafa prefiere Excel (sección 14.1) |
| Contenedores | **Docker** |
| Nube | **DigitalOcean**, Droplet (servidor virtual) Linux |
| Herramientas de apoyo | Git/GitHub, Postman, MySQL Workbench, MongoDB Compass, Draw.io |

**Reparto de datos entre los dos motores (persistencia políglota, Figura 2.5):**
- **MySQL**, en cuatro grupos:
  - *Seguridad y organización:* usuarios, roles, establecimientos de salud, municipios.
  - *Catálogos sanitarios:* vacunas, población objetivo, periodos de reporte.
  - *Operación de vacunación:* producción registrada, resultados de indicadores, alertas automáticas.
  - *Trazabilidad y reportes:* bitácora de acciones, estados de reporte, historial de revisión y cierre.
- **MongoDB:** esquemas de captura por vacuna (vacuna asociada, versión y vigencia, campos requeridos, validaciones del formulario), reglas de validación configurables (restricciones obligatorias, advertencias, comprobaciones de consistencia), y configuración de indicadores (numerador, denominador, meta, periodicidad, regla de atribución).
- **La lógica de cálculo vive en el backend**; MongoDB solo guarda la *configuración* que dice cómo calcular. El backend consulta ambos motores de forma transparente para el usuario.
- **Trazabilidad de configuración:** cada registro de producción en MySQL conserva la referencia a la versión del esquema de captura de MongoDB con que se capturó.

### 5.3 Roles de usuario
| Rol | Qué hace |
|---|---|
| **Personal del establecimiento / municipio** | Registra y corrige la producción mensual |
| **Estadígrafa / personal revisor de la DDRISS** | Revisa, solicita correcciones, aprueba y cierra periodos |
| **Departamento de Epidemiología** | Consulta indicadores, mapas, alertas, brechas, proyecciones e informes |
| **Administrador** | Gestiona usuarios, catálogos y configuraciones; **registra y actualiza la población** por municipio y grupo de edad que el MSPAS envía cada año (sección 14.3; decisión provisional, sujeta a cambios) |
| **Autoridades (solo consulta)** | Acceden a resultados e informes |

Si un usuario no tiene credenciales, el administrador lo registra. Con credenciales incorrectas el sistema muestra error y permite reintentar. El área de tecnología e informática se menciona como beneficiaria de la trazabilidad y como posible responsable del mantenimiento posterior, aunque no aparece como rol propio.

### 5.4 Ciclo de vida de un reporte mensual (Figura 2.4)

```
Inicio (nuevo periodo)
   │
   ▼
Borrador ──Enviar reporte──► Enviado ──Asignar a revisor──► En revisión
   ▲                                                         │        │
   │                                    Se identifican       │        │ Información
   │                                    inconsistencias      ▼        │ correcta
   └──Realizar correcciones / devolver ◄── Corrección solicitada      ▼
       con observaciones                                          Aprobado
                                                                     │ Cierre del periodo
                                                                     ▼
                  Rectificación ◄──Solicitud (con justificación)── Cerrado ──► Fin
                        └──────────Aprobación de la rectificación──────┘
```

- **Borrador:** el establecimiento captura y edita.
- **Enviado:** solo si supera las validaciones automáticas **obligatorias**.
- **En revisión:** el reporte se asigna a un revisor; la estadígrafa verifica consistencia.
- **Corrección solicitada:** se devuelve con observaciones; según el diagrama, el reporte **vuelve a Borrador** para corregirlo y se envía de nuevo.
- **Aprobado:** pasó validaciones y revisión.
- **Cerrado:** ya no se edita por el procedimiento ordinario; es la base de indicadores e informes. Una vez aprobado, el periodo puede cerrarse para todos los establecimientos.
- **Rectificación:** cambios justificados **después** del cierre, con solicitud autorizada y registro en bitácora; al aprobarse, el reporte regresa a Cerrado.

Las validaciones distinguen **errores** (bloquean el envío: campos incompletos, cantidades negativas, totales que no cuadran, duplicados) de **advertencias** (requieren revisión).

### 5.5 Los ocho módulos

1. **Gestión de usuarios**: crear, actualizar, desactivar (lógico), restaurar, inicio de sesión, roles y permisos.
2. **Configuración y catálogos**: establecimientos de salud **e instituciones**, vacunas, esquemas de captura, versionado de esquemas, poblaciones objetivo, catálogos auxiliares.
3. **Registro de producción de vacunación**: formulario generado dinámicamente, selección del periodo (mes/año), captura por vacuna/dosis/sexo/grupo de edad, registro de procedencia territorial, consulta y modificación controlada según estado, referencia a la versión del esquema.
4. **Validación, revisión y cierre de reportes**: consulta de resultados de validación, envío a revisión, revisión, solicitud de corrección, corrección y reenvío, aprobación, cierre de periodo, gestión de rectificaciones.
5. **Indicadores y análisis de cobertura**: cálculo y consulta de cobertura (producción atribuible ÷ población objetivo), comparación con meta, **brecha** de dosis, **proyección** de cobertura, **tasa de deserción entre dosis**, análisis por municipio y vacuna, comparación entre periodos.
6. **Consultas y visualización**: consultas con filtros según rol, tablas, gráficos, **tablero de control**, **mapa territorial** de San Marcos, tendencias. (En esta versión, el texto del módulo lista además las mismas funciones de informes y alertas que el módulo 7; ver sección 10.)
7. **Reportes y alertas**: informe consolidado departamental, por establecimiento/municipio, por vacuna, por periodo (mensual/anual/intervalo), también por **distrito** y con totales agrupados por **sexo**; filtros por rango de fechas y por uno o varios municipios; **exportación a Excel (prioritaria) y PDF**; alertas de reportes pendientes, de calidad, de cobertura bajo meta y de proceso (periodos por cerrar, pendientes de revisión).
8. **Auditoría y trazabilidad**: bitácora general; filtros por usuario, fecha, tipo de acción, **módulo** o elemento afectado; historiales de producción, del flujo de revisión, de rectificaciones y de configuraciones. Los registros de auditoría **no se pueden modificar** con las funciones ordinarias.

**Cómo encajan:** configuración y registro *generan* la información → validación/revisión/cierre *controla su validez* → indicadores *la procesan* → consultas, reportes y alertas *la presentan* → auditoría *deja evidencia de todo el ciclo*.

### 5.6 Cálculo de cobertura y metas (marco teórico 4.4)
- **Cobertura (%) = dosis administradas a la población objetivo ÷ población objetivo estimada × 100**, siempre especificada por vacuna, dosis, grupo poblacional, periodo y territorio.
- La propuesta **no documenta la fórmula particular de cada vacuna y dosis**. La entrevista con Epidemiología del 10/10/2026 aclaró el método (población anual ÷ 12 × meses transcurridos, igual para todas las vacunas, cada una con su meta) y que cuenta la dosis que **completa el esquema**; el detalle está en la sección 14.3.
- Coberturas **mayores a 100%** son señal de problemas en el denominador o en los registros y deben revisarse, no aceptarse automáticamente.
- **Metas:** la DDRISS usa >95% departamental y homogéneo entre municipios; la Agenda de Inmunización 2030 (OMS) fija 90% para indicadores concretos (DTP3, sarampión 2.ª dosis, neumococo 3.ª dosis, VPH). Las metas dependen del indicador, no son un valor universal.
- **Homogeneidad:** el promedio departamental puede ocultar municipios con cobertura baja; hay que analizar cada municipio.
- **Producción ≠ cobertura:** la producción son cantidades de dosis aplicadas; la cobertura se obtiene después al relacionarlas con la población objetivo. Producción tampoco es distribución ni inventario.

---

## 6. Método y cronograma

**Scrum** (Schwaber y Sutherland, 2020). Product Owner (mantiene y prioriza el Product Backlog), Scrum Master (facilita el marco y elimina impedimentos), Developers (los integrantes: analizan, diseñan, programan, integran, prueban y documentan). Artefactos: Product Backlog (con **historias de usuario** como técnica), Sprint Backlog, Incremento.

**Cambio de enfoque respecto a la versión anterior:** los sprints ya **no son fases** (requerimientos, diseño, desarrollo, pruebas). Cada sprint produce un **incremento funcional** e incluye su propio refinamiento, diseño, desarrollo frontend y backend, cambios a estructuras de datos, integración, pruebas unitarias y de integración, corrección y documentación. Eventos por sprint: Sprint Planning (Sprint Goal), Daily Scrum de 15 minutos, Sprint Review con el encargado de la institución (con evidencia), Sprint Retrospective.

| Etapa | Fechas | Incremento / enfoque |
|---|---|---|
| **Fase inicial** | 07/08 – 11/08 | Visita a la DDRISS, investigación del proceso, revisión del 5C y los Excel, requerimientos iniciales, historias de usuario preliminares y Product Backlog inicial |
| **Sprint 1** | 24/09 – 03/10 | **Acceso, gestión de usuarios y configuración básica:** inicio de sesión, CRUD de usuarios, roles y permisos; catálogos básicos de establecimientos, municipios y vacunas (MySQL) |
| **Sprint 2** | 04/10 – 13/10 | **Configuración dinámica y registro de producción:** diseño de estructuras MySQL/MongoDB, esquemas de captura y versiones, poblaciones objetivo, registro de producción con periodo y procedencia territorial |
| **Sprint 3** | 14/10 – 23/10 | **Validación, revisión y cierre de reportes:** reglas de validación (error/advertencia), control de estados, envío, revisión, corrección, aprobación, cierre, rectificación y registro automático de trazabilidad |
| **Sprint 4** | 24/10 – 02/11 | **Indicadores, análisis y visualización:** motor de indicadores (cobertura, metas, brechas, deserción, proyección), consultas, tablero, tendencias y mapa Leaflet/GeoJSON |
| **Sprint 5** | 03/11 – 12/11 | **Reportes, alertas, auditoría y trazabilidad:** informes y exportación a Excel y PDF, alertas de calidad/cobertura/proceso, consultas de auditoría |
| **Fase final** (no es sprint) | 13/11 – 30/11 | Integración y pruebas de sistema (13–16/11), **pruebas de carga y estrés** y verificación de permisos (16–17/11), **pruebas con usuarios** (18–20/11), ajustes (20–23/11), documentación técnica y manual de usuario (18–24/11), **despliegue en DigitalOcean** (24–25/11), verificación en producción (25–26/11), **capacitación** (27–28/11), revisión final y entrega (29–30/11) |

Todas las actividades del cronograma tienen como responsable a "Todos".

**Implicación para el diseño de base de datos:** ya no hay un sprint dedicado exclusivamente al diseño. El modelo se refina por incremento: el Sprint 1 fija usuarios, roles, establecimientos, municipios y vacunas; el Sprint 2 define las estructuras de esquemas versionados (MongoDB), poblaciones objetivo y producción; el Sprint 3, estados, observaciones y bitácora del flujo. El documento prevé que los "modelos preliminares elaborados durante la actividad inicial" se ajusten en cada sprint.

---

## 7. Viabilidad (resumen)

- **Técnica:** tecnologías abiertas y disponibles; equipos de la institución con 16 GB RAM, 1 TB y Core i7 de 10.ª gen.; el usuario solo necesita navegador e internet porque el sistema corre en la nube. Se validará la capacidad del servidor para correr MySQL + MongoDB + app juntos.
- **Operativa:** responde a un proceso real, hay usuarios definidos por etapa, se capacitará por rol y el personal mostró disposición a colaborar. Los municipios cuentan con computadoras y acceso a Internet.
- **Económica:** casi todo es software libre o gratuito. Los estudiantes pagan el alojamiento durante 12 meses; la DDRISS **no** paga desarrollo.
- **Legal:** con autorización de la DDRISS; **no se almacenan datos personales ni clínicos de pacientes**; autenticación, roles, trazabilidad y restricciones de edición; respeto de licencias de software.
- **Ética:** participación voluntaria e informada, confidencialidad, datos agregados, proyecciones diferenciadas de datos reales, rectificaciones con evidencia del dato anterior y del responsable.

### Presupuesto estimado (12 meses) — sin cambios

| Concepto | Monto (GTQ) |
|---|---|
| Dominio web (12 meses) | 120.00 |
| Alojamiento en la nube (12 meses) | 1,200.00 |
| Certificado SSL, MySQL + MongoDB, herramientas de desarrollo, visualización/mapas, diseño de interfaz | 0.00 |
| Material de capacitación | 150.00 |
| Transporte y validación con usuarios | 300.00 |
| Documentación técnica y manual de usuario | 100.00 |
| Recurso humano (140 h × 4 integrantes, referencia Q100/h; aporte valorizado) | 56,000.00 |
| **Subtotal** | **57,870.00** |
| Contingencia (15% de costos desembolsables, sin recurso humano) | 280.50 |
| **Total estimado** | **58,150.50** |

Desembolso real en efectivo: ≈ Q1,870 (dominio + hosting + capacitación + transporte + documentación); el resto es el valor del trabajo del equipo.

---

## 8. La institución (Capítulo 3, nuevo)

Fuentes: entrevista a Manfredo Solís (24 de agosto de 2026), Chávez Hernández (2025, CUSAM), documentos del MSPAS, SEGEPLAN, OPS y Contraloría General de Cuentas.

- **Historia:** inicia operaciones el 1 de enero de 1976 como *Jefatura del Área de Salud*, anexa al Hospital Nacional Regional Dr. Moisés Villagrán Mazariegos; primer jefe, Dr. Rudy Amílcar de León López. Cambios de sede en 1979 y 1984; segundo nivel construido en 1997; el **terremoto del 7 de noviembre de 2012** dañó gravemente el edificio.
- **De Área de Salud a DDRISS:** Acuerdo Gubernativo **59-2023** (Reglamento Orgánico Interno del MSPAS) y Acuerdo Ministerial **171-2023** establecen el modelo de Redes Integradas de Servicios de Salud. Las DDRISS son órganos técnico-administrativos que planifican, dirigen, supervisan y evalúan las acciones de salud del departamento y gestionan los Distritos Municipales de Salud.
- **Sede:** Calzada Revolución del 71, 2-81, zona 1, San Marcos.
- **Cobertura:** 30 municipios, **≈1,271,154 habitantes**.
- **Programas:** salud reproductiva, salud mental, bucodental, zoonosis y saneamiento, control de vectores, **inmunizaciones** (el ámbito del proyecto), tuberculosis, cáncer cervicouterino, VIH, laboratorio.
- **Misión y visión:** las placas de la sede corresponden al área de Enfermería; como referencia general se usa la misión y visión documentadas por Chávez Hernández (2025). Valores destacados: **calidad y calidez**, inclusión, respeto, vocación de servicio, compromiso, integridad, justicia, lealtad.
- **Estructura:** Dirección Departamental Ejecutiva, 3 órganos de asesoría, 2 de apoyo (Tecnologías de la Información y Jurídico) y 8 departamentos: Redes Integradas; **Epidemiología y Gestión de Riesgos**; Calidad en Salud; Recursos Humanos; Planificación; Vigilancia del Cumplimiento de Regulaciones Sanitarias; Promoción y Educación; Administrativo Financiero. ≈150 trabajadores en la sede.
- **Financiamiento:** 100% presupuesto del MSPAS; cooperación de la OPS (equipo de cómputo en 2020, telemedicina en Comitancillo, Concepción Tutuapa y Tejutla, capacitación epidemiológica en 2025).
- **Red de establecimientos (aprox.):** 6 centros de salud, 16 CAP, 2 CAIMI, 73 puestos de salud, 91 centros comunitarios, 5 casas maternas y 2 hospitales. La red cambia con el tiempo (p. ej., nuevo puesto de salud en Nueva Esperanza, Concepción Tutuapa, mayo de 2026).

---

## 9. Marco teórico (Capítulo 4, nuevo) — temas cubiertos

- **4.1 Aplicación web:** evolución, arquitectura web, cliente-servidor, **MVC**, frontend, backend, bases de datos relacionales, comunicación entre componentes, autenticación y autorización, usabilidad y diseño adaptable, seguridad, despliegue en la nube, tecnologías del proyecto.
- **4.2 Registro de producción de vacunación:** vacunación e inmunización, producción de vacunación, **datos que integran un registro** (municipio, establecimiento, vacuna, dosis, sexo, grupo de edad, periodo, cantidad, procedencia), estandarización, calidad de datos según la OMS (exactitud, completitud, oportunidad, consistencia), validación e integridad, consolidación, centralización, digitalización, **formulario SIGSA 5C** (Manual de llenado SIGSA V1.0-2014).
- **4.3 Automatización de procesos de información:** procesamiento, reglas de negocio, validación automática, consolidación y cálculo, automatización de reportes, beneficios, **limitaciones y supervisión humana**.
- **4.4 Informes y cobertura de vacunación:** informes sanitarios, periodicidad, indicadores, cálculo e interpretación de cobertura, metas, homogeneidad, visualización, tableros de control, toma de decisiones (ver sección 5.6).
- **4.5 DDRISS San Marcos y gestión de información sanitaria:** sistemas de información en salud, organización del sistema de salud, MSPAS, **SIGSA** (Resolución 5095 de 1997; Acuerdo Ministerial 192-2015), DDRISS, flujo de información, municipios y establecimientos como unidades de reporte, vigilancia epidemiológica, marco normativo (Decreto 25-2024, arts. 23 y 24).

Idea transversal: el sistema **no sustituye a SIGSA** ni es un sistema nacional paralelo; atiende una necesidad interna de consolidación de la DDRISS.

---

## 10. Glosario rápido

| Término | Significado |
|---|---|
| **5C / SIGSA-S5c** | Formulario oficial "Consolidado Mensual de Vacunación" del MSPAS |
| **SIGSA** | Sistema de Información Gerencial en Salud del MSPAS |
| **DDRISS** | Dirección Departamental de Redes Integradas de Servicios de Salud |
| **MSPAS** | Ministerio de Salud Pública y Asistencia Social |
| **CAP / CAIMI** | Centro de Atención Permanente / Centro de Atención Integral Materno Infantil |
| **Estadígrafa** | Persona de la DDRISS que digita y consolida hoy los 5C |
| **Producción de vacunación** | Cantidad de dosis efectivamente administradas en un periodo (no fabricación ni distribución) |
| **Cobertura** | % de la población objetivo vacunada; meta del MSPAS > 95% |
| **Brecha** | Dosis aproximadas que faltan para alcanzar la meta |
| **Deserción entre dosis** | Pérdida de continuidad entre dosis sucesivas de un esquema |
| **Población objetivo** | Denominador del cálculo de cobertura, por municipio, año y grupo de edad (los mismos grupos que los encabezados del 5C); el MSPAS la envía cada año y la registra el Administrador |
| **Meta mensual acumulada** | Población ÷ 12 × número de mes: vacunas que deberían llevarse al corte del mes; es el "100 %" de ese mes |
| **Esquema completo** | Una persona cuenta para la cobertura de una vacuna cuando recibe la dosis que completa su esquema |
| **Encabezado del 5C** | Título de grupo de edad (p. ej. "< 1 año", "4 años") que agrupa columnas del formulario; no se llena |
| **Atribución territorial** | Asignar la dosis al municipio de procedencia de la persona, no solo al lugar de aplicación |
| **Homogeneidad** | Que la meta se cumpla en cada municipio, no solo en el promedio departamental |
| **Persistencia políglota** | Usar más de un tipo de base de datos según la naturaleza de los datos (aquí MySQL + MongoDB) |
| **Esquema versionado** | Definición de campos/validaciones de una vacuna con versión y vigencia |
| **Incremento** | Conjunto de funcionalidades completadas, integradas y verificadas al final de un sprint |

---

## 11. Alcance: lo que sí y lo que no

**Sí incluye:** captura dinámica por establecimiento, validación, flujo de revisión/cierre/rectificación, atribución territorial, poblaciones objetivo, indicadores (cobertura, brecha, deserción, proyección), informes en Excel y PDF, alertas, tablero, mapa, auditoría, pruebas de carga y estrés, despliegue en la nube, manuales y capacitación.

**No incluye:** historia vacunal por paciente, datos personales o clínicos, expedientes, integración directa con SIGSA, reemplazo del sistema nacional del MSPAS, ni análisis epidemiológico automático (el sistema proporciona la información; el análisis lo hace Epidemiología).

---

## 12. Puntos a tener en cuenta al trabajar con este documento

### 12.1 Qué cambió respecto a la versión 1 de este contexto
- **Capítulos nuevos:** 3 (Monografía de la institución) y 4 (Marco teórico), resumidos en las secciones 8 y 9.
- **Título:** "plataforma web" pasa a "**sistema web**" en la portada.
- **Sprints reorganizados:** de sprints por fase (requerimientos, diseño, desarrollo, analítica, cierre) a **sprints por incremento funcional** con fechas nuevas (Sprint 1: 24/09–03/10 … Sprint 5: 03/11–12/11), más una **fase inicial** (7–11 de agosto) y una **fase final** (13–30 de noviembre) que no son sprints. El antiguo "Sprint 2 = diseño (25/09–05/10)" ya no existe.
- **Fase final ampliada:** agrega pruebas de carga y estrés y verificación de permisos.
- **Diagrama de estados:** "Corrección solicitada" regresa a **Borrador** (antes se resumía como regreso a Enviado) y aparece la transición "Asignar a revisor" entre Enviado y En revisión.
- **Establecimientos:** se explicitan varios tipos (centro de salud, CAP, CAIMI, hospital) y el posible caso de un **establecimiento de Coatepeque** que atiende población de San Marcos; el catálogo pasa a "establecimientos **e instituciones**".
- **Cálculo de cobertura:** se aclara que la fórmula por vacuna y dosis **no está documentada** y debe configurarse con criterios institucionales; coberturas >100% requieren revisión.
- **Auditoría:** filtro adicional por módulo; los registros de auditoría son inmodificables.
- Sin cambios: objetivos, roles, reparto MySQL/MongoDB, presupuesto, alcance general.

### 12.2 Inconsistencias detectadas en el texto de la propuesta (revisar antes de entregar)
- La **Introducción** sigue diciendo **cuatro sprints**; el Capítulo 2 y el cronograma usan **cinco**.
- El **índice (TDC) está desactualizado**: aún muestra "2.2.1 Sprint 1: levantamiento de requerimientos…" y dos apartados titulados "Sprint 4", mientras que el cuerpo ya tiene 2.2.1 Desarrollo de los sprints, 2.2.2 a 2.2.6 (Sprints 1 a 5) y "Finalización del proyecto". Falta actualizar el campo del índice en Word.
- **Numeración de figuras duplicada:** "Figura 2.4" se usa para el diagrama de estados y para el diagrama de Gantt; los pies de figura conservan además textos residuales ("Ilustración 2/3…").
- El **cronograma** declara el periodo 18/09–30/11, pero el Sprint 1 inicia el **24/09** (del 18 al 23 de septiembre no hay actividad) y la fase inicial (agosto) aparece dibujada en la columna de la semana 1 de septiembre.
- En el diagrama de estados, "**APROVADO**" está escrito con v.
- Los **módulos f (Consultas y visualización) y g (Reportes y alertas)** listan las mismas funciones de informes y alertas; el módulo f debería describir consultas, tablero, mapa y tendencias.
- El **marco teórico (4.1.7 y 4.1.13) solo menciona MySQL**; no desarrolla MongoDB, bases de datos documentales ni la persistencia políglota que el Capítulo 2 establece.
- El Sprint 3 contiene una frase de borrador: "El documento actual ya contempla que estas operaciones formen parte de la trazabilidad…". También hay restos como "En El primer sprint", "Este El tercer sprint" y "p permite".
- El texto de la sección 2.1.1 (Figura 2.3) todavía describe el acceso con "registro de producción mediante el formulario 5C", mientras el resto del documento habla de formularios dinámicos.

**Convenciones para futuros entregables:** escribir en español, con tono académico; usar los términos de este glosario; mantener siempre la restricción de que el sistema maneja **solo datos agregados**; y citar el modelo de datos como dividido entre MySQL (transaccional) y MongoDB (configuración versionada).

**Fuentes del documento original (comunicaciones personales):** M. Solís, 7 de agosto de 2026 (proceso 5C y estructura de los Excel) y 24 de agosto de 2026 (monografía institucional); A. Floria, 7 de agosto de 2026 (estadígrafa; necesidades del proceso).

---

## 13. Decisiones de diseño posteriores a la propuesta (v2.1)

Estas decisiones no están en el documento de la propuesta; las tomó el equipo durante los Sprints 1 y 2. Los detalles viven en los archivos indicados, que mandan sobre este resumen.

**Base de datos (modelo preliminar v0.4, 08/10/2026)** · `diseno-bd/05_contexto_base_de_datos.md`
- Se confirma **MySQL** como motor relacional. **MongoDB** se justifica porque cada vacuna usa dimensiones distintas (sexo, grupo de edad, embarazo, etc.): las dimensiones se declaran en el esquema de captura y no como columnas fijas. Una vacuna nueva es una fila nueva en MySQL.
- **`usuario` y `empleado` separados (1:1).** `empleado` guarda los datos del personal (nombre, cargo, correo, teléfono, establecimiento) y puede existir sin cuenta; `usuario` guarda solo el acceso (credenciales, rol, estado). La bitácora y las demás acciones auditables apuntan a `usuario`. Son datos del personal, no de pacientes, así que la restricción de solo datos agregados se mantiene.
- **`establecimiento`** agrega `direccion`, `telefono`, `correo` y `nombre_contacto` (contacto en texto libre; queda pendiente si pasa a ser una llave foránea a `empleado`).
- **v0.5 (10/10/2026), varias DDRISS:** el modelo queda preparado para escalar a otras DDRISS aunque solo opere San Marcos (tabla `ddriss`, `cierre_periodo` por mes y DDRISS, `empleado.ddriss_id`; se mantienen los 5 roles). 32 tablas y 4 vistas. Plan en `diseno-bd/plan_v05_multi_ddriss.md`.

**Backend (versión preliminar v0.1, 08/10/2026)** · `backend/INSTRUCCIONES_BACKEND.md` y `backend/openapi.yaml`
- Node.js 22 LTS + Express en **JavaScript**; MySQL 8 y MongoDB 7; autenticación con JWT.
- Endpoints bajo `/api/v1`, definidos en **OpenAPI 3** (38 operaciones principales) y visibles con Swagger UI en `/api/docs`.
- El estado de un reporte **solo cambia por un endpoint** (`POST /reportes/{id}/transiciones`), y solo si la transición está permitida para el rol del usuario.

**Prototipo de pantallas** · `mockups/descripcion_pantallas.md`
- Paleta verde pastel y celeste, a juego con los colores de la DDRISS. La pantalla de inicio es ligera; las gráficas van en pantallas propias del menú (Indicadores, Mapa territorial).
- Siete pantallas: inicio de sesión, inicio, indicadores, registro de producción (con una variante de dimensiones), bandeja de revisión, mapa territorial y **auditoría** (bitácora con filtros por fecha, usuario, tipo de acción y elemento afectado, y paginación).

---

## 14. Información de campo del 10/10/2026

Fuente: documento *"Nueva info – SIRCOVA"* redactado por el equipo el 10/10/2026, con entrevistas a la estadígrafa y a la epidemióloga de la DDRISS y tres fotografías de un 5C real (Catarina, julio de 2026). Lo marcado como **pendiente** debe confirmarse con la DDRISS.

### 14.1 Estadígrafa: informes
- **Formato:** prefiere **Excel**. El PDF sigue siendo útil, pero la exportación a Excel tiene prioridad.
- **Niveles:** además de la cobertura departamental, quiere ver los datos de cada **municipio** y de cada **distrito**. El mapa cubre parte de esto, pero los informes también deben generarse en esos niveles.
- **Totales por sexo:** el sistema guarda el detalle (sexo y edad), pero a ella le interesa sobre todo el total por sexo. Ejemplo: 5 niñas de 7 años, 6 de 12 y 3 de 3 suman **14 niñas**; 8 niños de 5 años suman **8 niños**. El informe debe permitir sumar por una dimensión elegida sin perder el detalle almacenado.
- **Filtros** al generar informes: rango de fechas (mes inicial y final) y uno o varios municipios.

### 14.2 Encabezados del formulario 5C
Las fotografías muestran que el 5C agrupa sus columnas bajo **encabezados de grupo de edad** que no se llenan, pero orientan al establecimiento:

| Encabezado | Vacunas y dosis que agrupa (según las fotos) |
|---|---|
| < 1 año | Hepatitis B, BCG, OPV 1.ª a 3.ª, Pentavalente 1.ª a 3.ª, Rotavirus (esquema de 2 dosis), Neumococo 1.ª y 2.ª, Influenza 1.ª y 2.ª |
| De 1 a < 2 años | SPR, Neumococo refuerzo, OPV R1, DPT R1 |
| 4 años | OPV R2, DPT R2 |
| De 1 a < 5 años | OPV 1.ª a 3.ª, R1 y R2; Pentavalente 1.ª a 3.ª; DPT R1 y R2; SPR (esquemas atrasados) |
| Mujer de 15 a 49 años · Otros grupos de edad | Td 1.ª a 3.ª, R1 y R2 |
| Otras vacunas (1) y (2) · Otras vacunas adultos | Columnas libres "especifique la vacuna" |

Consecuencias para el diseño:
- El **mismo par vacuna-dosis aparece bajo varios encabezados** (OPV 1.ª en "< 1 año" y en "De 1 a < 5 años"). El encabezado equivale a un grupo de edad: el formulario dinámico debe mostrarlo como sección y guardar el grupo de edad correspondiente.
- El 5C incluye columnas de **población** (N/V = nacidos vivos, 1 año, 4 años) y de **"Porcentaje del mes"** para dosis concretas (Hepatitis B, BCG, OPV 3, Penta 3, Rotavirus 2 o 3, Neumococo 2, Influenza 2, SPR, Neumococo R, OPV R1, DPT R1, OPV R2, DPT R2). En el sistema son valores **calculados**, no capturados, y la lista orienta sobre qué dosis cuentan para la cobertura.
- Las filas separan el **municipio propio** de "Otros municipios", con una fila por municipio de procedencia; esto confirma la atribución territorial ya diseñada.
- El formulario impreso (versión 2014) tiene **anotaciones a mano** por cambios del esquema nacional: "Hexa" sobre Pentavalente, columnas reutilizadas (la de Rotavirus de 3 dosis se usa para VPH niño/niña) y columnas libres usadas para Tdap en embarazadas, SPR y SR en adultos. Esto refuerza la necesidad de esquemas de captura versionados.

### 14.3 Epidemiología: cálculo de indicadores
- **Población:** a inicios de cada año el MSPAS envía la población de cada municipio por grupo de edad. Los grupos son **los mismos encabezados del 5C** (< 1 año, 1 a < 2 años, etc.). La recibe una administradora, así que por ahora la registra y actualiza solo el rol **Administrador** (decisión provisional del 10/10/2026, sujeta a cambios: el equipo no está del todo seguro de quién la registra).
- **Meta acumulada al mes:** población ÷ 12 = vacunas que deberían aplicarse por mes; multiplicado por el **número de mes** (junio = 6, julio = 7) da cuántas vacunas **deberían** llevarse al corte. Ejemplo: 541 ÷ 12 ≈ 45 al mes; a junio, (541 ÷ 12) × 6 ≈ 270. Con una población de 100, a junio deberían llevarse 50 vacunas: esas 50 son el **100 % de ese mes**.
- **Comparación para el mapa:** las vacunas reales acumuladas se comparan con esa meta del mes. La diferencia (y el porcentaje real ÷ meta del mes) es lo que colorea el mapa.
- El **mismo método** se aplica a todas las vacunas; cada una tiene su meta.
- Al terminar el año se presenta el **acumulado anual**, que es otro informe.
- Lo importante es que niñas y niños tengan el **esquema completo**: una vacuna cuenta para la cobertura cuando se aplica la dosis que completa el esquema. La DDRISS proporcionará cuántas dosis tiene cada vacuna vigente (**pendiente**).
- Les serviría ver **cuántas dosis faltan** para la meta (brecha) y, sobre todo, **proyecciones**, que hoy no hacen.
- **Semáforo del mapa (provisional; cambiará cuando confirmen los rangos exactos):** rojo por debajo de 80 %, amarillo entre 80 % y 90 %, verde por encima de 90 %, medido contra la meta del mes.
- **Distritos:** se necesitan producción **y** cobertura por distrito. **Pendiente:** el equipo debe confirmar con la DDRISS qué es exactamente un distrito de salud en San Marcos y cuántos municipios tienen más de uno. El encabezado del 5C ya pide "Área de Salud" y "Distrito de Salud" (en la foto: San Marcos y Catarina).

### 14.4 Qué confirma, qué cambia y qué queda pendiente
- **Confirma:** el prorrateo mensual lineal del denominador (`MENSUAL_LINEAL` en la configuración de indicadores) y la "meta proporcional" de los mockups; la brecha y la proyección; la atribución por procedencia; los esquemas versionados; la captura con detalle por dimensiones.
- **Cambia o agrega:** Excel como formato prioritario; informes por distrito; totales agrupados por sexo; filtros por fechas y municipios; secciones por grupo de edad en el formulario; población por grupo de edad (no por vacuna) registrada por el Administrador; avance del mapa medido contra la meta del mes (100 %) en lugar de la meta del 95 %; cobertura por distrito; marca de las dosis que cuentan para cobertura; semáforo 80/90 (los ejemplos actuales usan 80/95).
- **Base de datos (v0.6, 10/10/2026):** aplicados los bloques A (población por grupo de edad), B (dosis que completan el esquema y trazadoras), C (secciones del formulario) y D (avance contra la meta del mes, semáforo 80/90 provisional); el bloque E (cobertura por distrito) está en pausa. Las semillas de vacunas y los rangos del semáforo están sujetos a cambios. Detalle en `diseno-bd/propuesta_v06_nueva_info.md`.
- **Pendiente con la DDRISS:** número de dosis por vacuna vigente; confirmación del semáforo; cómo se obtiene la población de un distrito cuando no coincide con un municipio; una copia del archivo anual de población.
- **Aclarado por Chris (10/10/2026):** el multiplicador es el número de mes (no días); las 50 vacunas del ejemplo son una cantidad, no un porcentaje; por ahora la población la registra solo el Administrador (sujeto a cambios); la definición de distrito y su relación con los municipios quedan pendientes.
