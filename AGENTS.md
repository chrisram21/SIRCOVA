# AGENTS.md · SIRCOVA

Reglas para cualquier agente de IA que trabaje en este repositorio. Este archivo es la fuente de verdad para agentes; si algo aquí contradice la documentación de `docs/`, detente y pregunta.

## 1. Qué es el proyecto

Sistema web para la **DDRISS San Marcos** (MSPAS, Guatemala) que reemplaza el formulario físico **5C (SIGSA-S5c)** y los Excel de la estadígrafa. Los establecimientos de los 30 municipios registran su producción mensual de vacunación en formularios dinámicos por vacuna; el sistema la valida, la DDRISS la revisa, aprueba y cierra, y un motor calcula cobertura, brecha, deserción y proyección.

El modelo de datos (desde la v0.5) está **preparado para varias DDRISS**, pero el proyecto implementa y opera solo la DDRISS San Marcos. No escribas código que dé por hecho una sola DDRISS ni que fije San Marcos: usa la tabla `ddriss`.

Proyecto de fin de carrera (Universidad Mesoamericana, Quetzaltenango, 2026). **Orden de trabajo: backend y frontend en paralelo.** En cada spec el orden es: primero el contrato en `backend/openapi.yaml`, después el endpoint y después la pantalla, que consume la API real conectada a las bases de prueba (Aiven MySQL y MongoDB Atlas). No se usan servidores simulados. El backend se rehace desde cero; el código anterior no sirve como referencia.

## 2. Lee antes de trabajar

| Archivo | Para qué |
|---|---|
| `README.md` | Alcance, tecnologías acordadas, estructura del repositorio |
| `docs/backend/INSTRUCCIONES_BACKEND.md` | Estructura del backend, capas, formato de error, reglas |
| `backend/openapi.yaml` | Contrato de la API: todos los endpoints bajo `/api/v1` |
| `docs/base-de-datos/CONTEXTO BD.md` | Modelo de datos (MySQL v0.8, MongoDB v0.6) y reglas del modelo |
| `backend/db/01_modelo_relacional_mysql.sql`, `backend/db/02_colecciones_mongodb.js` | Scripts de BD; **ante cualquier diferencia, mandan los scripts** |
| `docs/contexto/` | Resumen de la propuesta del proyecto (roles, ciclo del reporte, módulos) |
| `docs/mockups/descripcion_pantallas.md` | Descripción de las pantallas, estilo general y su implementación en React |
| `docs/mockups/pantallas/*.html` | Pantallas de referencia del frontend. `Plan.html` es el plan de gráficas, no una pantalla |
| `docs/SPECS/HISTORIAS_DE_USUARIO.md` | Historias de usuario (HU-01 a HU-60) con sus criterios de aceptación |
| `specs/NN-slug.md` | Specs: uno por historia de usuario; describe qué se implementa y cómo se verifica |

## 3. Stack (no agregar nada fuera de esta lista sin autorización)

- Node.js 22 LTS + Express, en **JavaScript**. API REST bajo `/api/v1`.
- MySQL 8, base `vacunacion_ddriss`, con `mysql2` (consultas siempre parametrizadas).
- MongoDB 7, base `vacunacion_config`, con el controlador oficial `mongodb`.
- JWT para autenticación; contraseñas con bcrypt.
- OpenAPI 3 (`backend/openapi.yaml`), visible con Swagger UI en `/api/docs`.
- Frontend: React con Vite, en JavaScript (JSX), con Tailwind CSS, shadcn/ui y Radix UI. Mapa con Leaflet + GeoJSON.
- Gráficos: Recharts, siempre a través del componente Chart de shadcn, con los colores del tema.
- Informes en Excel: ExcelJS, en el backend. Informes en PDF: pdfmake, en el backend.
- Docker y Docker Compose.

Los Excel y PDF se generan en el backend (un endpoint devuelve el archivo) para que respeten los permisos y el alcance por DDRISS y para que la exportación quede en la bitácora; el frontend solo los descarga.

**Dependencias permitidas:**

- **Backend:** `express`, `mysql2`, `mongodb`, `jsonwebtoken`, `bcrypt`, `cors`, `swagger-ui-express`, `yaml`, `exceljs`, `pdfmake`. Pruebas: `vitest` y `supertest`.
- **Frontend:** `react`, `react-dom`, `react-router-dom`, `tailwindcss`, `@tailwindcss/vite`, las que instala la CLI de shadcn al agregar un componente (`radix-ui`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `tw-animate-css`, y `recharts` con el componente Chart), `leaflet` y `react-leaflet`. Desarrollo y pruebas: `vite`, `@vitejs/plugin-react`, `vitest`, `@testing-library/react` y `jsdom`.

## 4. Estructura y capas

```
backend/
├── openapi.yaml
├── .env.example        ← variables sin valores reales
├── docker-compose.yml
├── db/                 ← scripts 01 (MySQL) y 02 (MongoDB)
└── src/
    ├── app.js, server.js
    ├── config/         ← variables de entorno y conexiones
    ├── middlewares/    ← autenticación, permisos, errores
    └── modulos/        ← auth, usuarios, catalogos, configuracion,
                          produccion, revision, indicadores, auditoria
```

Cada módulo separa **rutas** (declaran el endpoint), **controlador** (recibe y responde) y **servicio** (reglas del negocio y acceso a datos). No mezcles capas.

Los archivos de cada módulo usan sufijos técnicos en inglés (`.routes.js`, `.controller.js`, `.service.js`) y conservan el nombre del dominio en español, por ejemplo `sistema.controller.js`.

Errores con el formato común: `{ "error": { "codigo": "...", "mensaje": "..." } }` y los códigos HTTP 400, 401, 403, 404, 409 y 422 según `INSTRUCCIONES_BACKEND.md`.

```
frontend/
├── components.json      ← configuración de shadcn
├── .env.example
└── src/
    ├── main.jsx, App.jsx
    ├── index.css        ← Tailwind y variables del tema (colores del MSPAS)
    ├── api/             ← cliente único de la API; ninguna pantalla usa fetch directamente
    ├── components/ui/   ← componentes generados por shadcn (nombres de su CLI)
    ├── lib/utils.js     ← función cn de shadcn
    ├── componentes/     ← componentes propios (layout, menú, insignia de estado...)
    └── paginas/         ← una carpeta por pantalla
```

`components/ui/` y `lib/` quedan en inglés porque los genera shadcn; el resto del código propio va en español.

Reglas del frontend:

- Los colores y la fuente salen de las variables del tema en `index.css`, nunca de colores escritos a mano en los componentes.
- Se usa primero un componente de shadcn; solo se crea uno propio si no existe.
- Cada pantalla reproduce el aspecto de su HTML en `docs/mockups/pantallas/`, pero no sus medidas fijas de 1440 px ni sus datos de ejemplo.
- El formulario de Registro se genera desde el esquema de captura de MongoDB, nunca con columnas fijas.

**Nombres:** el JSON de la API va en camelCase y la BD en snake_case; la conversión la hace el servicio del backend.

## 5. Reglas inquebrantables

1. **Solo datos agregados.** Ninguna tabla, colección, endpoint ni log guarda datos de pacientes (nombre, DPI, fecha de nacimiento, diagnóstico, etc.). La unidad mínima es una cantidad de dosis. Solo se guardan datos del personal (`empleado`, `usuario`).
2. **Permisos en el backend.** Cada endpoint revisa el rol. El personal de establecimiento solo ve y edita los reportes de su establecimiento.
3. **Estados del reporte.** El estado solo cambia con `POST /reportes/{id}/transiciones`, y solo si la transición existe en `transicion_estado` para el rol del usuario. No se envía un reporte con errores de validación abiertos. Ciclo: Borrador → Enviado → En revisión → (Corrección solicitada → Borrador) o Aprobado → Cerrado → (Rectificación → Cerrado).
4. **Captura dinámica.** Las cantidades se validan contra el esquema de captura de la vacuna en MongoDB y se guardan en `detalle_produccion` + `detalle_dimension` en **una sola transacción**, manteniendo coherente `clave_combinacion`. Nunca agregues columnas fijas por dimensión (sexo, edad, embarazo…).
5. **Versiones inmutables.** Una versión publicada (VIGENTE o HISTORICO) de esquema, regla o indicador no se edita ni se borra; se crea una nueva. MySQL guarda la versión usada.
6. **Catálogos.** Los códigos de catálogos y valores de dimensiones no se borran ni se renombran; se desactivan (`activo`/`activa`).
7. **Bitácora.** Toda escritura se registra en `bitacora`, que no se modifica ni se borra. Las acciones auditables apuntan a `usuario`; los datos de la persona están en `empleado`.
8. **Sin llaves foráneas entre motores.** Los vínculos MySQL ↔ MongoDB son códigos u ObjectId que valida el backend.
9. **Seguridad.** No subas secretos ni archivos `.env`. No concatenes datos del usuario en consultas. La conexión a Aiven exige SSL con el certificado indicado en `MYSQL_SSL_CA`; la carpeta `certs/` no se sube.
10. **Alcance por DDRISS.** Toda consulta, bandeja y alerta se filtra por la DDRISS del usuario (`empleado.ddriss_id`). Solo el rol `AUTORIDAD` puede no tener DDRISS (NULL), y entonces consulta todo el país; los otros cuatro roles siempre tienen una. Esta regla la valida el backend, porque la base no puede expresarla. El estado del mes (abierto, en cierre, cerrado) y la fecha límite se leen y cambian en `cierre_periodo` de la DDRISS, nunca en `periodo`.

## 6. Zonas protegidas (solo con autorización explícita en la tarea)

- `backend/db/` y cualquier cambio al modelo de datos (tablas, columnas, colecciones, índices).
- Permisos por rol y la tabla `transicion_estado` (estados del reporte).
- `package.json`: solo dependencias de la lista de la sección 3; cualquier otra, con autorización.
- Pruebas existentes: no las desactives ni las borres para que algo pase.
- Bases de datos: no borres ni reinicies ninguna que no sea de prueba. Los scripts de `backend/db/` **borran y recrean** su base al ejecutarse.

## 7. Cómo trabajar

- **Specs y ramas:** cada historia de usuario se trabaja como un spec en `specs/NN-slug.md`, y cada spec en su propia rama `spec-NN-slug`, creada desde `main`. Solo se implementa un spec en estado Aprobado. La rama se integra a `main` cuando el spec cumple sus criterios de aceptación y pasa a Implementado.
- **Pull requests:** cada rama se integra a `main` siempre mediante un pull request, que queda como registro del cambio. No necesita la aprobación de otro integrante: quien lo abre puede integrarlo, para no frenar a quien trabaja solo. La revisión de otro integrante es opcional.
- **Integración:** se usa *squash and merge*, de modo que cada spec queda en `main` como un solo commit cuyo mensaje es el título del PR (por ejemplo, `SPEC 01 · HU-01 Inicio de sesión (backend)`). Al integrar, la rama se borra en GitHub y en local (`git branch -D`); el PR conserva sus commits. No se sigue trabajando en una rama ya integrada: un spec nuevo o una corrección van en una rama nueva desde `main`.
- **Contrato primero:** si creas o cambias un endpoint, actualiza `backend/openapi.yaml` antes de programarlo.
- Limita tus cambios a lo que pide la tarea.
- Documentación, mensajes de la API y nombres de carpetas y módulos en **español**. En la BD: `snake_case`, singular.
- **Comentarios en el código:** cortos, precisos y solo donde el código no se explica solo (una regla del negocio, un caso raro, el porqué de una decisión). Nada de comentarios que repitan lo que hace el código, ni bloques largos, ni encabezados decorativos. Lo que haga falta recordar para trabajar después (decisiones, convenciones, trampas) se anota en una línea en la sección "Notas de contexto" de `CLAUDE.md`, no en el código.

## 8. Cómo verificar antes de terminar

Backend:

1. La API arranca.
2. Los endpoints que tocaste responden como dice `backend/openapi.yaml` (por ejemplo, desde `/api/docs` o Postman).

Frontend:

1. La app arranca con Vite.
2. La pantalla que tocaste carga datos reales de la API.
3. Las pruebas pasan.

Al terminar, indica qué cambiaste y cómo lo comprobaste.

Entorno de desarrollo: se trabaja contra las bases de prueba en Aiven (MySQL) y MongoDB Atlas, con `backend/.env` copiado de `backend/.env.example` y el certificado de Aiven en `backend/certs/`. Como alternativa, se pueden usar bases locales según `docs/base-de-datos/GUIA DE INSTALACION DE BASE DE DATOS.docx` (MySQL en `localhost:3306`, MongoDB en `mongodb://localhost:27017/vacunacion_config`).

**Pendiente:** los comandos exactos de instalación, arranque, pruebas y lint del backend y del frontend se definirán cuando exista el código inicial. No los inventes; si los necesitas y no están aquí, pregunta.

## 9. Detente y pregunta si

- la tarea contradice este archivo, el README o la documentación de `docs/`;
- la tarea toca la base de datos, los permisos o los estados del reporte;
- necesitas una librería nueva o una decisión marcada como pendiente;
- un dato del dominio (vacunas, dosis, grupos de edad, códigos INE, umbrales de indicadores) no está confirmado: en los scripts son **ejemplos** por validar con la DDRISS.

## 10. Pendientes del equipo (no los asumas)

Formato de commits y licencia.
