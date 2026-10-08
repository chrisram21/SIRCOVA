# AGENTS.md · SIRCOVA

Reglas para cualquier agente de IA que trabaje en este repositorio. Este archivo es la fuente de verdad para agentes; si algo aquí contradice la documentación de `docs/`, detente y pregunta.

## 1. Qué es el proyecto

Sistema web para la **DDRISS San Marcos** (MSPAS, Guatemala) que reemplaza el formulario físico **5C (SIGSA-S5c)** y los Excel de la estadígrafa. Los establecimientos de los 30 municipios registran su producción mensual de vacunación en formularios dinámicos por vacuna; el sistema la valida, la DDRISS la revisa, aprueba y cierra, y un motor calcula cobertura, brecha, deserción y proyección.

Proyecto de fin de carrera (Universidad Mesoamericana, Quetzaltenango, 2026). **Orden de trabajo actual: primero el backend** (API documentada en OpenAPI); el frontend en React viene después, sobre esa API.

## 2. Lee antes de trabajar

| Archivo | Para qué |
|---|---|
| `README.md` | Alcance, tecnologías acordadas, estructura del repositorio |
| `docs/backend/INSTRUCCIONES_BACKEND.md` | Estructura del backend, capas, formato de error, reglas |
| `backend/openapi.yaml` | Contrato de la API: todos los endpoints bajo `/api/v1` |
| `docs/base-de-datos/05_contexto_base_de_datos.md` | Modelo de datos MySQL + MongoDB y reglas del modelo |
| `backend/db/01_modelo_relacional_mysql.sql`, `backend/db/02_colecciones_mongodb.js` | Scripts de BD; **ante cualquier diferencia, mandan los scripts** |
| `docs/contexto/` | Resumen de la propuesta del proyecto (roles, ciclo del reporte, módulos) |

## 3. Stack (no agregar nada fuera de esta lista sin autorización)

- Node.js 22 LTS + Express, en **JavaScript**. API REST bajo `/api/v1`.
- MySQL 8, base `vacunacion_ddriss`, con `mysql2` (consultas siempre parametrizadas).
- MongoDB 7, base `vacunacion_config`, con el controlador oficial `mongodb`.
- JWT para autenticación; contraseñas con bcrypt o argon2.
- OpenAPI 3 (`backend/openapi.yaml`), visible con Swagger UI en `/api/docs`.
- Docker y Docker Compose. Frontend: React, Leaflet + GeoJSON (pendiente).
- **Pendientes de decisión:** librería de gráficos y herramienta de PDF. No las elijas tú.

## 4. Estructura y capas

```
backend/
├── openapi.yaml
├── .env.example        ← variables sin valores reales
├── docker-compose.yml
├── db/                 ← scripts 01 (MySQL) y 02 (MongoDB)
└── src/
    ├── app.js, servidor.js
    ├── config/         ← variables de entorno y conexiones
    ├── middlewares/    ← autenticación, permisos, errores
    └── modulos/        ← auth, usuarios, catalogos, configuracion,
                          produccion, revision, indicadores, auditoria
```

Cada módulo separa **rutas** (declaran el endpoint), **controlador** (recibe y responde) y **servicio** (reglas del negocio y acceso a datos). No mezcles capas. La estructura de `frontend/` aún no está definida.

Errores con el formato común: `{ "error": { "codigo": "...", "mensaje": "..." } }` y los códigos HTTP 400, 401, 403, 404, 409 y 422 según `INSTRUCCIONES_BACKEND.md`.

## 5. Reglas inquebrantables

1. **Solo datos agregados.** Ninguna tabla, colección, endpoint ni log guarda datos de pacientes (nombre, DPI, fecha de nacimiento, diagnóstico, etc.). La unidad mínima es una cantidad de dosis. Solo se guardan datos del personal (`empleado`, `usuario`).
2. **Permisos en el backend.** Cada endpoint revisa el rol. El personal de establecimiento solo ve y edita los reportes de su establecimiento.
3. **Estados del reporte.** El estado solo cambia con `POST /reportes/{id}/transiciones`, y solo si la transición existe en `transicion_estado` para el rol del usuario. No se envía un reporte con errores de validación abiertos. Ciclo: Borrador → Enviado → En revisión → (Corrección solicitada → Borrador) o Aprobado → Cerrado → (Rectificación → Cerrado).
4. **Captura dinámica.** Las cantidades se validan contra el esquema de captura de la vacuna en MongoDB y se guardan en `detalle_produccion` + `detalle_dimension` en **una sola transacción**, manteniendo coherente `clave_combinacion`. Nunca agregues columnas fijas por dimensión (sexo, edad, embarazo…).
5. **Versiones inmutables.** Una versión publicada (VIGENTE o HISTORICO) de esquema, regla o indicador no se edita ni se borra; se crea una nueva. MySQL guarda la versión usada.
6. **Catálogos.** Los códigos de catálogos y valores de dimensiones no se borran ni se renombran; se desactivan (`activo`/`activa`).
7. **Bitácora.** Toda escritura se registra en `bitacora`, que no se modifica ni se borra. Las acciones auditables apuntan a `usuario`; los datos de la persona están en `empleado`.
8. **Sin llaves foráneas entre motores.** Los vínculos MySQL ↔ MongoDB son códigos u ObjectId que valida el backend.
9. **Seguridad.** No subas secretos ni archivos `.env`. No concatenes datos del usuario en consultas.

## 6. Zonas protegidas (solo con autorización explícita en la tarea)

- `backend/db/` y cualquier cambio al modelo de datos (tablas, columnas, colecciones, índices).
- Permisos por rol y la tabla `transicion_estado` (estados del reporte).
- `package.json`: no agregues dependencias nuevas.
- Pruebas existentes: no las desactives ni las borres para que algo pase.
- Bases de datos: no borres ni reinicies ninguna que no sea de prueba. Los scripts de `backend/db/` **borran y recrean** su base al ejecutarse.

## 7. Cómo trabajar

- **Contrato primero:** si creas o cambias un endpoint, actualiza `backend/openapi.yaml` antes de programarlo.
- Limita tus cambios a lo que pide la tarea.
- Documentación, mensajes de la API y nombres de carpetas y módulos en **español**. En la BD: `snake_case`, singular.

## 8. Cómo verificar antes de terminar

1. La API arranca.
2. Los endpoints que tocaste responden como dice `backend/openapi.yaml` (por ejemplo, desde `/api/docs` o Postman).
3. Indica qué cambiaste y cómo lo comprobaste.

Entorno local: bases según `docs/base-de-datos/06_guia_instalacion_local.docx` (MySQL en `localhost:3306`, MongoDB en `mongodb://localhost:27017/vacunacion_config`) y `backend/.env` copiado de `backend/.env.example`.

**Pendiente:** los comandos exactos de instalación, arranque, pruebas y lint se definirán cuando exista el código inicial del backend. No los inventes; si los necesitas y no están aquí, pregunta.

## 9. Detente y pregunta si

- la tarea contradice este archivo, el README o la documentación de `docs/`;
- la tarea toca la base de datos, los permisos o los estados del reporte;
- necesitas una librería nueva o una decisión marcada como pendiente;
- un dato del dominio (vacunas, dosis, grupos de edad, códigos INE, umbrales de indicadores) no está confirmado: en los scripts son **ejemplos** por validar con la DDRISS.

## 10. Pendientes del equipo (no los asumas)

Estrategia de ramas, formato de commits, revisión de código, licencia, comandos de arranque y pruebas, estructura del frontend, librería de gráficos y herramienta de PDF.
