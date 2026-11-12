# Spec G. Catálogo de redes de municipios

> **Fecha:** 2026-11-10 · **Base:** repo `chrisram21/SIRCOVA`, commit `a5cf45c` (FIX A-D de las correcciones del Sprint 4 ya integrados).
> **Origen:** retroalimentación del sprint review con la DDRISS (2026-11-10). Rutas relativas a `frontend/src/` salvo que digan `backend/`.
> **Lo usan:** spec H (redes en Indicadores) y spec I (filtro de red en Producción).

## Por qué

La DDRISS trabaja los municipios por **redes** (p. ej. Red No. 1: Ixchiguán, Tajumulco, Sibinal, Tacaná y San José Ojetenam) y presenta la cobertura de cada red con sus vacunas trazadoras. Una red agrupa municipios, como un preset de municipios; no reemplaza a los distritos.

## Decisiones (Chris, 2026-11-10)

- Un municipio pertenece a **una sola red**. Las redes son **por DDRISS**.
- Crean y editan redes: **Administrador** y **Epidemiología**. Revisor y Autoridad solo las ven en Indicadores.
- Trazadoras: casi siempre son las que ya tienen `dosis.es_trazadora`, pero cada red se puede ajustar.

## Modelo de datos

Nuevo script numerado en `backend/db/` (el siguiente después de `11_…`), y se refleja en `01_modelo_relacional_mysql.sql`, en el DBML de `docs/base-de-datos/` y en `CONTEXTO BD.md`.

```sql
CREATE TABLE red (
  id          SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  ddriss_id   TINYINT UNSIGNED  NOT NULL,
  codigo      VARCHAR(20)       NOT NULL,   -- p. ej. RED_01
  nombre      VARCHAR(120)      NOT NULL,   -- p. ej. Red No. 1
  activo      BOOLEAN           NOT NULL DEFAULT TRUE,
  PRIMARY KEY (id),
  UNIQUE KEY uq_red_ddriss_codigo (ddriss_id, codigo),
  UNIQUE KEY uq_red_ddriss_nombre (ddriss_id, nombre),
  CONSTRAINT fk_red_ddriss FOREIGN KEY (ddriss_id) REFERENCES ddriss (id)
) ENGINE=InnoDB;

-- Un municipio, una sola red (UNIQUE en municipio_id).
CREATE TABLE red_municipio (
  red_id       SMALLINT UNSIGNED NOT NULL,
  municipio_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, municipio_id),
  UNIQUE KEY uq_red_municipio (municipio_id),
  CONSTRAINT fk_redmun_red       FOREIGN KEY (red_id)       REFERENCES red (id),
  CONSTRAINT fk_redmun_municipio FOREIGN KEY (municipio_id) REFERENCES municipio (id)
) ENGINE=InnoDB;

-- Dosis trazadoras de la red (columnas de la tabla de cobertura de la red).
CREATE TABLE red_trazadora (
  red_id   SMALLINT UNSIGNED NOT NULL,
  dosis_id SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (red_id, dosis_id),
  CONSTRAINT fk_redtraz_red   FOREIGN KEY (red_id)   REFERENCES red (id),
  CONSTRAINT fk_redtraz_dosis FOREIGN KEY (dosis_id) REFERENCES dosis (id)
) ENGINE=InnoDB;
```

- Ajustar los tipos de las FK a los de `ddriss.id`, `municipio.id` y `dosis.id` reales.
- Al **crear** una red, sus trazadoras se llenan con las dosis activas que tienen `es_trazadora = TRUE`. Después se editan.
- Los municipios de una red deben ser del departamento de su DDRISS (validado en el backend).
- Datos de prueba: Red No. 1 con los cinco municipios de arriba. El resto de redes y sus municipios se piden a la DDRISS.

## Permisos

En `backend/db/05_permisos_mysql.sql`:

| Permiso | Roles |
|---|---|
| `RED_CONSULTAR` | Administrador, Epidemiología, Revisor, Autoridad |
| `RED_CREAR` | Administrador, Epidemiología |
| `RED_EDITAR` | Administrador, Epidemiología |

## Backend

En `backend/src/modulos/catalogos/` (nuevo `redes.service.js`), siguiendo el patrón de `distritos.service.js` y sus rutas en `catalogos.routes.js`:

- `GET /redes?activo=` (RED_CONSULTAR): redes de la DDRISS del usuario (la autoridad nacional pasa `ddrissId`), con `municipios[]` y `trazadoras[]` (vacuna, dosis, nombres).
- `POST /redes` (RED_CREAR): `codigo`, `nombre`, `municipioIds[]`; trazadoras por defecto.
- `PATCH /redes/:id` (RED_EDITAR): nombre, `municipioIds[]`, `dosisIds[]` (reemplazo completo de cada lista).
- `POST /redes/:id/desactivar` y `/reactivar` (RED_EDITAR), como los distritos. Una red desactivada no aparece en los filtros.
- Errores claros: municipio ya asignado a otra red («Tacaná ya pertenece a la Red No. 2»), municipio de otro departamento, nombre o código repetido, red sin municipios.
- Cada cambio va a la bitácora de auditoría (`modulo = 'CONFIGURACION'`).
- Actualizar `backend/openapi.yaml`.

## Frontend

- Pantalla **Redes** en **Administración** (`componentes/layout/opcionesMenu.js`, como hijo con `permisos: ['RED_CONSULTAR', 'RED_EDITAR']` para que solo la vean Administrador y Epidemiología). Componente nuevo `paginas/configuracion/PaginaRedes.jsx`.
- Lista de redes: nombre, código, municipios (chips), número de trazadoras, estado y acciones (Editar, Desactivar/Reactivar).
- Crear / editar en un diálogo o página (como `DialogoDistrito.jsx`):
  - Nombre y código.
  - Municipios: casillas con los municipios del departamento. Los que ya están en otra red aparecen deshabilitados con el nombre de su red.
  - Trazadoras: casillas agrupadas por vacuna (como el encabezado de la imagen: Hepatitis, BCG, Hexa, Rotavirus 2, Neumococo 2, SPR, Neumococo R, OPV R1, DPT R1, OPV R2, DPT R2, SPR 2), marcadas por defecto las `es_trazadora`, y el botón «Restablecer trazadoras por defecto».

## Criterios de aceptación

- Administrador y Epidemiología crean, editan, desactivan y reactivan redes; Revisor y Autoridad no ven la pantalla y la API les responde 403 al escribir.
- No se puede poner un municipio en dos redes ni uno de otro departamento.
- Una red nueva trae como trazadoras las dosis `es_trazadora`; se pueden quitar y agregar.
- `GET /redes` devuelve solo las redes de la DDRISS del usuario.
- Pruebas del backend (servicio y rutas) y del frontend (pantalla y diálogo).
