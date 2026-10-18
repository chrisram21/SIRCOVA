# SIRCOVA · Sistema web de producción de vacunación, DDRISS San Marcos

Proyecto de fin de carrera de Ingeniería en Sistemas Informática y Ciencias de la Computación, Universidad Mesoamericana, sede Quetzaltenango (2026).

> **Estado:** en desarrollo. Modelo de datos preliminar: MySQL v0.8 y MongoDB v0.6 (18 de octubre de 2026), preparado para varias DDRISS. El backend se rehace desde cero sobre este modelo y se desarrolla en paralelo con el frontend. Este documento resume lo acordado por el equipo y funciona como **contrato técnico**: cualquier cambio a lo que aquí se fija se discute y se registra antes de aplicarse.

---

## 1. Descripción

Los 30 municipios del departamento de San Marcos reportan cada mes su producción de vacunación en el formulario físico **5C (SIGSA-S5c)**. La estadígrafa de la DDRISS lo digita en tres archivos de Excel, de los que sale el informe de cobertura que utiliza Epidemiología. El proceso es manual, lento y propenso a errores.

SIRCOVA es un sistema web centralizado para la **DDRISS San Marcos** (Dirección Departamental de Redes Integradas de Servicios de Salud, MSPAS, Guatemala) en el que:

1. los establecimientos registran su producción mensual en formularios dinámicos por vacuna;
2. el sistema valida la calidad de los datos;
3. la DDRISS revisa, aprueba y cierra cada periodo;
4. un motor de indicadores calcula cobertura, brecha, deserción y proyección, y los presenta en tablero, mapa, alertas e informes.

**Usuarios (roles):** personal del establecimiento, estadígrafa o revisor de la DDRISS, Epidemiología, Administrador y Autoridades (solo consulta: de su DDRISS o, si no tiene DDRISS asignada, de todo el país). Los cinco roles están en uso.

## 2. Alcance

**Incluye:** captura dinámica por establecimiento, validación, flujo de revisión, cierre y rectificación, atribución territorial (municipio de aplicación y de procedencia), poblaciones objetivo, indicadores, informes PDF, alertas, tablero, mapa, auditoría, pruebas de carga y estrés, despliegue en la nube, manuales y capacitación.

**Escalabilidad:** el modelo de datos está preparado para varias DDRISS (tabla `ddriss`, alcance del personal por DDRISS y cierre de periodos por DDRISS). El proyecto implementa y opera **solo la DDRISS San Marcos**; incorporar otra DDRISS sería cargar datos, no modificar tablas.

**No incluye:** historia vacunal por paciente, expedientes, integración directa con SIGSA, reemplazo del sistema nacional del MSPAS ni análisis epidemiológico automático.

> **Restricción principal: solo datos agregados.** Ninguna tabla, colección, endpoint ni log almacena datos personales o clínicos de pacientes. La unidad mínima de información es una cantidad de dosis. Solo se guardan datos del personal que usa el sistema.

## 3. Tecnologías acordadas

| Capa | Tecnología |
|---|---|
| Interfaz web | React con Vite, en JavaScript (JSX), con Tailwind CSS, shadcn/ui y Radix UI |
| API y lógica de negocio | Node.js 22 LTS + Express, en JavaScript (API REST) |
| Documentación de la API | OpenAPI 3 (`openapi.yaml`), visible con Swagger UI en `/api/docs` |
| Base de datos relacional | MySQL 8 (`vacunacion_ddriss`), conexión con `mysql2` |
| Base de datos documental | MongoDB 7 (`vacunacion_config`), controlador oficial `mongodb` |
| Autenticación | JWT; contraseñas con bcrypt |
| Mapa | Leaflet + GeoJSON de los municipios de San Marcos |
| Gráficos | Recharts, a través del componente Chart de shadcn |
| Informes | Excel con ExcelJS y PDF con pdfmake, generados en el backend |
| Contenedores | Docker y Docker Compose |
| Despliegue | DigitalOcean, Droplet Linux (fase final) |
| Apoyo | Git/GitHub, Postman, MySQL Workbench, MongoDB Compass, Draw.io |

Los Excel y PDF se generan en el backend (un endpoint devuelve el archivo) para que respeten los permisos y el alcance por DDRISS y para que la exportación quede en la bitácora; el frontend solo los descarga.

La lista de dependencias permitidas del backend y del frontend está en `AGENTS.md` (sección 3). No se agregan librerías fuera de esa lista sin acuerdo del equipo.

## 4. Bases de datos

El sistema usa **persistencia políglota**: cada motor tiene un rol fijo.

| Motor | Rol | Contenido |
|---|---|---|
| **MySQL** | Datos transaccionales | Usuarios y empleados, roles, municipios, establecimientos, vacunas, periodos, poblaciones objetivo, producción, estados y transiciones del reporte, resultados de indicadores, alertas y bitácora, además de las DDRISS y el cierre de periodos por DDRISS (32 tablas, 4 vistas) |
| **MongoDB** | Configuración versionada | Catálogo de dimensiones, esquemas de captura por vacuna, reglas de validación y configuración de indicadores (4 colecciones) |

Principios del modelo:
- **Formularios dinámicos.** Cada vacuna declara en MongoDB sus dimensiones (sexo, grupo de edad, embarazo, etc.). Agregar una vacuna es una fila nueva; agregar una dimensión es solo configuración. No se agregan columnas por dimensión.
- **La lógica vive en el backend.** MongoDB describe cómo capturar, validar y calcular; MySQL guarda qué se registró y qué resultó.
- **Versionado.** Una versión publicada de un esquema, regla o indicador no se edita; se crea una nueva, y MySQL guarda la versión usada.
- **Ciclo del reporte (7 estados):** Borrador → Enviado → En revisión → (Corrección solicitada → Borrador) o Aprobado → Cerrado → (Rectificación → Cerrado).
- **Bitácora inmodificable** para toda acción de escritura.
- **Preparado para varias DDRISS.** Distritos, establecimientos, personal y alertas pertenecen a una DDRISS; cada DDRISS cierra sus periodos por separado (`cierre_periodo`). Las reglas e indicadores de MongoDB pueden ser nacionales o propios de una DDRISS.

Detalle completo en [`docs/base-de-datos/CONTEXTO BD.md`](docs/base-de-datos/CONTEXTO%20BD.md). Ante cualquier diferencia, mandan los scripts.

## 5. Enfoque de desarrollo

- **Metodología:** Scrum por incrementos funcionales (5 sprints entre el 24 de septiembre y el 12 de noviembre de 2026, más una fase final de pruebas, despliegue y capacitación hasta el 30 de noviembre).
- **Orden de trabajo:** backend y frontend se desarrollan **en paralelo**. En cada spec, primero se escribe el contrato en `backend/openapi.yaml`, después el endpoint y después la pantalla, que consume la API real conectada a las bases de prueba (Aiven MySQL y MongoDB Atlas). No se usan servidores simulados. La regla es *contrato primero*: si se agrega o cambia un endpoint, se actualiza `openapi.yaml` antes de programarlo.

## 6. Trabajo con agentes de IA

El equipo usa agentes de IA como apoyo al desarrollo. Las reglas para ellos viven **dentro del repositorio** y son la fuente de verdad:

- **`AGENTS.md`**: reglas comunes para cualquier agente.
- **`CLAUDE.md`**: mismas reglas, para Claude Code.

Resumen de esas reglas:
1. Antes de trabajar, leer la documentación de `docs/` y `openapi.yaml`.
2. Respetar la estructura de carpetas y las capas (rutas, controlador, servicio).
3. Cumplir las reglas del negocio: solo datos agregados, permisos en el backend, cambios de estado solo por `POST /reportes/{id}/transiciones`, versiones inmutables y bitácora.
4. No cambiar el modelo de datos ni los scripts de BD, no agregar librerías fuera de la lista de `AGENTS.md` y no desactivar pruebas sin autorización.
5. Limitar los cambios a la tarea, verificar que la API arranca y que los endpoints tocados responden según `openapi.yaml`, e indicar qué se cambió y cómo se comprobó.
6. Detenerse y preguntar si la tarea contradice la documentación o toca la base de datos, los permisos o los estados del reporte.

## 7. Estructura del repositorio

```
/
├── README.md
├── AGENTS.md
├── CLAUDE.md
├── docs/
│   ├── contexto/          ← resumen de la propuesta del proyecto
│   ├── base-de-datos/     ← documento de diseño, contexto de BD, diagramas, guía de instalación local
│   ├── backend/           ← INSTRUCCIONES_BACKEND.md
│   ├── mockups/           ← descripción de pantallas y pantallas de referencia (pantallas/*.html)
│   └── SPECS/             ← HISTORIAS_DE_USUARIO.md
├── specs/                 ← un spec por historia de usuario (NN-slug.md)
├── backend/
│   ├── openapi.yaml
│   ├── .env.example       ← variables sin valores reales
│   ├── docker-compose.yml
│   ├── db/                ← 01_modelo_relacional_mysql.sql y 02_colecciones_mongodb.js
│   └── src/
│       ├── app.js, server.js
│       ├── config/, middlewares/
│       └── modulos/       ← auth, usuarios, catalogos, configuracion, produccion,
│                            revision, indicadores, auditoria
└── frontend/              ← React + Vite
    ├── components.json    ← configuración de shadcn
    ├── .env.example
    └── src/
        ├── main.jsx, App.jsx
        ├── index.css      ← Tailwind y variables del tema (colores del MSPAS)
        ├── api/           ← cliente único de la API
        ├── components/ui/ ← componentes generados por shadcn
        ├── lib/utils.js   ← función cn de shadcn
        ├── componentes/   ← componentes propios
        └── paginas/       ← una carpeta por pantalla
```

`components/ui/` y `lib/` quedan en inglés porque los genera shadcn; el resto del código propio va en español. Las reglas del frontend están en `AGENTS.md` (sección 4).

## 8. Entorno local (resumen)

Requisitos: Node.js 22 LTS. El desarrollo se hace contra las **bases de prueba** en Aiven (MySQL) y MongoDB Atlas.

1. Copiar `backend/.env.example` a `backend/.env` y completar los datos de conexión de las bases de prueba. Guardar el certificado CA de Aiven en `backend/certs/ca.pem` (la carpeta `certs/` no se sube).
2. Copiar `frontend/.env.example` a `frontend/.env`.
3. Levantar la API desde `backend/` y abrir `/api/docs`; levantar el frontend con Vite desde `frontend/`.

Alternativa sin conexión: Docker Desktop o MySQL 8 y MongoDB 7 instalados, con las bases creadas por los scripts de `backend/db/` según la [guía de instalación local](docs/base-de-datos/GUIA%20DE%20INSTALACION%20DE%20BASE%20DE%20DATOS.docx). Atención: cada script borra y recrea su base.

Los comandos exactos del paso 3 quedan **pendientes** hasta que exista el código inicial del backend y del frontend.

## 9. Convenciones

- Documentación y mensajes de la API en español; nombres de carpetas y módulos en español.
- Los archivos de cada módulo usan sufijos técnicos en inglés (`.routes.js`, `.controller.js`, `.service.js`), por ejemplo `sistema.controller.js`.
- No se suben secretos ni archivos `.env`.
- Consultas a la base siempre parametrizadas.
- **Ramas:** una por spec (`spec-NN-slug`), creada desde `main`; cada spec corresponde a una historia de usuario (detalle en `AGENTS.md`, sección 7).
- **Pull requests:** toda rama se integra a `main` mediante un pull request. No requiere aprobación de otro integrante; la revisión es opcional.
- **Pendientes:** formato de commits y licencia del repositorio.

## 10. Equipo

Proyecto desarrollado por cuatro estudiantes de la Facultad de Ingeniería de la Universidad Mesoamericana, sede Quetzaltenango:

- Andrea Gabriela López Hidalgo
- Christian José Ramírez Solano
- Kenneth David García Ramírez
- Luis Emmanuel Suárez Menchú

Institución beneficiaria: DDRISS San Marcos, Ministerio de Salud Pública y Asistencia Social, Guatemala.
