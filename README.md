# SIRCOVA · Sistema web de producción de vacunación, DDRISS San Marcos

Proyecto de fin de carrera de Ingeniería en Sistemas Informática y Ciencias de la Computación, Universidad Mesoamericana, sede Quetzaltenango (2026).

> **Estado:** en desarrollo. Modelo de datos preliminar v0.4 y backend preliminar v0.1 (8 de octubre de 2026). Este documento resume lo acordado por el equipo y funciona como **contrato técnico**: cualquier cambio a lo que aquí se fija se discute y se registra antes de aplicarse.

---

## 1. Descripción

Los 30 municipios del departamento de San Marcos reportan cada mes su producción de vacunación en el formulario físico **5C (SIGSA-S5c)**. La estadígrafa de la DDRISS lo digita en tres archivos de Excel, de los que sale el informe de cobertura que utiliza Epidemiología. El proceso es manual, lento y propenso a errores.

SIRCOVA es un sistema web centralizado para la **DDRISS San Marcos** (Dirección Departamental de Redes Integradas de Servicios de Salud, MSPAS, Guatemala) en el que:

1. los establecimientos registran su producción mensual en formularios dinámicos por vacuna;
2. el sistema valida la calidad de los datos;
3. la DDRISS revisa, aprueba y cierra cada periodo;
4. un motor de indicadores calcula cobertura, brecha, deserción y proyección, y los presenta en tablero, mapa, alertas e informes.

**Usuarios (roles):** personal del establecimiento, estadígrafa o revisor de la DDRISS, Epidemiología, Administrador y Autoridades (solo consulta).

## 2. Alcance

**Incluye:** captura dinámica por establecimiento, validación, flujo de revisión, cierre y rectificación, atribución territorial (municipio de aplicación y de procedencia), poblaciones objetivo, indicadores, informes PDF, alertas, tablero, mapa, auditoría, pruebas de carga y estrés, despliegue en la nube, manuales y capacitación.

**No incluye:** historia vacunal por paciente, expedientes, integración directa con SIGSA, reemplazo del sistema nacional del MSPAS ni análisis epidemiológico automático.

> **Restricción principal: solo datos agregados.** Ninguna tabla, colección, endpoint ni log almacena datos personales o clínicos de pacientes. La unidad mínima de información es una cantidad de dosis. Solo se guardan datos del personal que usa el sistema.

## 3. Tecnologías acordadas

| Capa | Tecnología |
|---|---|
| Interfaz web | React |
| API y lógica de negocio | Node.js 22 LTS + Express, en JavaScript (API REST) |
| Documentación de la API | OpenAPI 3 (`openapi.yaml`), visible con Swagger UI en `/api/docs` |
| Base de datos relacional | MySQL 8 (`vacunacion_ddriss`), conexión con `mysql2` |
| Base de datos documental | MongoDB 7 (`vacunacion_config`), controlador oficial `mongodb` |
| Autenticación | JWT; contraseñas con bcrypt o argon2 |
| Mapa | Leaflet + GeoJSON de los municipios de San Marcos |
| Contenedores | Docker y Docker Compose |
| Despliegue | DigitalOcean, Droplet Linux (fase final) |
| Apoyo | Git/GitHub, Postman, MySQL Workbench, MongoDB Compass, Draw.io |

**Pendientes de decisión:** librería de gráficos para React y herramienta de generación de PDF. No se agregan librerías fuera de esta lista sin acuerdo del equipo.

## 4. Bases de datos

El sistema usa **persistencia políglota**: cada motor tiene un rol fijo.

| Motor | Rol | Contenido |
|---|---|---|
| **MySQL** | Datos transaccionales | Usuarios y empleados, roles, municipios, establecimientos, vacunas, periodos, poblaciones objetivo, producción, estados y transiciones del reporte, resultados de indicadores, alertas y bitácora (30 tablas, 4 vistas) |
| **MongoDB** | Configuración versionada | Catálogo de dimensiones, esquemas de captura por vacuna, reglas de validación y configuración de indicadores (4 colecciones) |

Principios del modelo:
- **Formularios dinámicos.** Cada vacuna declara en MongoDB sus dimensiones (sexo, grupo de edad, embarazo, etc.). Agregar una vacuna es una fila nueva; agregar una dimensión es solo configuración. No se agregan columnas por dimensión.
- **La lógica vive en el backend.** MongoDB describe cómo capturar, validar y calcular; MySQL guarda qué se registró y qué resultó.
- **Versionado.** Una versión publicada de un esquema, regla o indicador no se edita; se crea una nueva, y MySQL guarda la versión usada.
- **Ciclo del reporte (7 estados):** Borrador → Enviado → En revisión → (Corrección solicitada → Borrador) o Aprobado → Cerrado → (Rectificación → Cerrado).
- **Bitácora inmodificable** para toda acción de escritura.

Detalle completo en [`docs/base-de-datos/05_contexto_base_de_datos.md`](docs/base-de-datos/05_contexto_base_de_datos.md). Ante cualquier diferencia, mandan los scripts.

## 5. Enfoque de desarrollo

- **Metodología:** Scrum por incrementos funcionales (5 sprints entre el 24 de septiembre y el 12 de noviembre de 2026, más una fase final de pruebas, despliegue y capacitación hasta el 30 de noviembre).
- **Orden actual:** primero el **backend** (API documentada en OpenAPI); el **frontend** en React se construye después, sobre esa API. La regla es *contrato primero*: si se agrega o cambia un endpoint, se actualiza `openapi.yaml` antes de programarlo.

## 6. Trabajo con agentes de IA

El equipo usa agentes de IA como apoyo al desarrollo. Las reglas para ellos viven **dentro del repositorio** y son la fuente de verdad:

- **`AGENTS.md`**: reglas comunes para cualquier agente.
- **`CLAUDE.md`**: mismas reglas, para Claude Code.

Resumen de esas reglas:
1. Antes de trabajar, leer la documentación de `docs/` y `openapi.yaml`.
2. Respetar la estructura de carpetas y las capas (rutas, controlador, servicio).
3. Cumplir las reglas del negocio: solo datos agregados, permisos en el backend, cambios de estado solo por `POST /reportes/{id}/transiciones`, versiones inmutables y bitácora.
4. No cambiar el modelo de datos ni los scripts de BD, no agregar librerías y no desactivar pruebas sin autorización.
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
│   └── mockups/           ← descripción de pantallas
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
└── frontend/              ← pendiente (React)
```

La estructura interna de `frontend/` se definirá cuando inicie su desarrollo.

## 8. Entorno local (resumen)

Requisitos: Docker Desktop (recomendado) o MySQL 8 y MongoDB 7 instalados, y Node.js 22 LTS.

1. Crear las bases con los scripts de `backend/db/` siguiendo la [guía de instalación local](docs/base-de-datos/06_guia_instalacion_local.docx). Atención: cada script borra y recrea su base.
2. Copiar `backend/.env.example` a `backend/.env` y completar los datos de conexión locales.
3. Levantar la API (`docker compose up` o `npm install` y arranque desde `backend/`) y abrir `/api/docs`.

Los comandos exactos del paso 3 quedan **pendientes** hasta que exista el código inicial del backend.

## 9. Convenciones

- Documentación y mensajes de la API en español; nombres de carpetas y módulos en español.
- Los archivos de cada módulo usan sufijos técnicos en inglés (`.routes.js`, `.controller.js`, `.service.js`), por ejemplo `sistema.controller.js`.
- No se suben secretos ni archivos `.env`.
- Consultas a la base siempre parametrizadas.
- **Pendientes:** estrategia de ramas, formato de commits, revisión de código y licencia del repositorio.

## 10. Equipo

Proyecto desarrollado por cuatro estudiantes de la Facultad de Ingeniería de la Universidad Mesoamericana, sede Quetzaltenango:

- Andrea Gabriela López Hidalgo
- Christian José Ramírez Solano
- Kenneth David García Ramírez
- Luis Emmanuel Suárez Menchú

Institución beneficiaria: DDRISS San Marcos, Ministerio de Salud Pública y Asistencia Social, Guatemala.
