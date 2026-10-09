# Instrucciones del backend — versión preliminar

**Sistema web de producción de vacunación, DDRISS San Marcos** · v0.1 · 8 de octubre de 2026

Este documento indica cómo construir la primera versión del backend. Se entrega junto con dos archivos:

- `05_contexto_base_de_datos.md`: el modelo de datos (MySQL y MongoDB). Este documento no lo repite.
- `openapi.yaml`: la especificación OpenAPI con los endpoints principales.

El frontend queda fuera de esta versión.

---

## 1. Tecnología

| Elemento | Decisión |
|---|---|
| Lenguaje y entorno | JavaScript con **Node.js 22 LTS** |
| Framework | **Express** (API REST) |
| Base de datos relacional | **MySQL 8**, base `vacunacion_ddriss` (script `01_modelo_relacional_mysql.sql`) |
| Base de datos documental | **MongoDB 7**, base `vacunacion_config` (script `02_colecciones_mongodb.js`) |
| Conexión a MySQL | `mysql2`, siempre con consultas parametrizadas |
| Conexión a MongoDB | controlador oficial `mongodb` |
| Autenticación | JWT; contraseñas con bcrypt o argon2 |
| Documentación de endpoints | **OpenAPI 3** (`openapi.yaml`), visible con Swagger UI en `/api/docs` |
| Contenedores | Docker y Docker Compose (API, MySQL y MongoDB) |
| Despliegue | DigitalOcean (fase final) |

---

## 2. Estructura del proyecto

```
backend/
├── openapi.yaml
├── .env.example          ← variables de entorno sin valores reales
├── docker-compose.yml
├── db/                   ← scripts 01 (MySQL) y 02 (MongoDB)
└── src/
    ├── app.js            ← configuración de Express
    ├── server.js         ← arranque
    ├── config/           ← variables de entorno y conexiones
    ├── middlewares/      ← autenticación, permisos, manejo de errores
    └── modulos/
        ├── auth/
        ├── usuarios/
        ├── catalogos/
        ├── configuracion/
        ├── produccion/
        ├── revision/
        ├── indicadores/
        └── auditoria/
```

Cada módulo separa tres capas:

- **rutas**: declaran el endpoint.
- **controlador**: recibe la solicitud y responde.
- **servicio**: aplica las reglas del negocio y consulta la base de datos.

Los archivos usan sufijos técnicos en inglés (`.routes.js`, `.controller.js`, `.service.js`) y conservan el nombre del dominio en español, por ejemplo `sistema.controller.js`. El arranque está en `server.js` y la comprobación de conexiones en `test-connections.js`.

---

## 3. Endpoints

Todos los endpoints viven bajo `/api/v1` y están definidos en **`openapi.yaml`**. Para verlos de forma gráfica, se abre el archivo en [editor.swagger.io](https://editor.swagger.io) o en la ruta `/api/docs` de la API.

Resumen de los endpoints principales:

| Módulo | Endpoints |
|---|---|
| Sistema | `GET /salud` |
| Autenticación | `POST /auth/login`, `POST /auth/logout`, `GET /auth/yo` |
| Usuarios | `GET/POST /empleados`, `GET/POST /usuarios`, `PATCH /usuarios/{id}` |
| Catálogos | `GET /municipios`, `GET/POST /establecimientos`, `PATCH /establecimientos/{id}`, `GET/POST /vacunas`, `GET/POST /periodos`, `GET/POST /poblaciones-objetivo` |
| Configuración | `GET /dimensiones`, `GET /vacunas/{codigo}/esquema-vigente`, `POST /esquemas-captura`, `POST /esquemas-captura/{id}/publicar` |
| Producción | `GET/POST /reportes`, `GET /reportes/{id}`, `GET /reportes/{id}/formulario`, `PUT /reportes/{id}/vacunas/{vacunaId}` |
| Revisión | `POST /reportes/{id}/validar`, `POST /reportes/{id}/transiciones`, `GET /reportes/{id}/historial`, `POST /reportes/{id}/observaciones`, `POST /periodos/{id}/cerrar`, `POST /reportes/{id}/rectificaciones` |
| Indicadores | `POST /indicadores/corridas`, `GET /indicadores/resultados` |
| Alertas y auditoría | `GET /alertas`, `GET /auditoria/bitacora` |

Si se agrega o cambia un endpoint, primero se actualiza `openapi.yaml` y después se programa.

**Formato de error común:**

```json
{ "error": { "codigo": "TRANSICION_NO_PERMITIDA", "mensaje": "Texto para el usuario" } }
```

| Código HTTP | Uso |
|---|---|
| `400` | Datos mal formados |
| `401` | Sin sesión |
| `403` | Sin permiso |
| `404` | No existe o está fuera del alcance del usuario |
| `409` | Duplicado o versión desactualizada |
| `422` | Se incumple una regla del negocio |

---

## 4. Reglas que el backend debe cumplir

1. **Solo datos agregados.** Ningún endpoint, tabla, colección ni log maneja datos de pacientes.
2. **Permisos en el backend.** Cada endpoint revisa el rol del usuario. El personal de establecimiento solo ve y edita los reportes de su establecimiento.
3. **Estados del reporte.** Solo `POST /reportes/{id}/transiciones` cambia el estado, y solo si la transición existe en la tabla `transicion_estado` para el rol del usuario. No se envía un reporte con errores de validación.
4. **Captura dinámica.** Las cantidades se validan contra el esquema de captura de la vacuna en MongoDB. Se guardan en `detalle_produccion` y `detalle_dimension` dentro de una sola transacción. No se agregan columnas por dimensión.
5. **Versiones.** Una versión publicada de un esquema, una regla o un indicador no se edita; se crea una nueva.
6. **Bitácora.** Toda acción de escritura se registra en `bitacora`. La bitácora no se modifica ni se borra.
7. **Seguridad básica.** No se suben secretos ni archivos `.env` al repositorio, y no se concatenan datos del usuario en las consultas.

---

## 5. Instrucciones para agentes de IA

Estas reglas son la base de los archivos `AGENTS.md` y `CLAUDE.md` del repositorio.

**Antes de trabajar,** lee este documento, `05_contexto_base_de_datos.md` y `openapi.yaml`.

**Haz:**
- Respeta la estructura de carpetas y las capas de la sección 2.
- Mantén `openapi.yaml` al día con cada endpoint que crees o cambies.
- Cumple las reglas de la sección 4.
- Limita tus cambios a lo que pide la tarea.

**No hagas:**
- No cambies el modelo de datos ni los scripts de base de datos sin que la tarea lo pida.
- No borres ni reinicies bases de datos que no sean de prueba.
- No agregues librerías nuevas sin autorización.
- No desactives ni borres pruebas para que algo funcione.

**Antes de terminar:**
1. Verifica que la API arranca.
2. Verifica que los endpoints que tocaste responden como dice `openapi.yaml`.
3. Indica qué cambiaste y cómo lo comprobaste.

**Detente y pregunta** si la tarea contradice estos documentos o pide cambiar la base de datos, los permisos o los estados del reporte.
