# Propuesta para el spec de Node.js 24 · Hotfix de seguridad

> **Para qué sirve:** es la base para escribir el spec con `/spec`. Reúne lo que decidió el equipo el 2026-10-29. No es el spec: el spec se escribe en `specs/29-node-24.md` con el formato de los anteriores y queda en Borrador hasta que el equipo lo apruebe.
> **Historia:** ninguna. Es un hotfix de mantenimiento y seguridad del sprint 3; el encabezado del spec lo dice así (excepción a la regla de una HU por spec de `CLAUDE.md`).
> **Depende de:** los SPEC 27 y 28 (sesiones), ya en `main`. No depende de ningún spec de pantalla.
> **Rama sugerida:** `spec-29-node-24`, desde `main`.
> **Toca una zona protegida:** los dos `package.json` (solo el campo `engines`, sin dependencias). El equipo lo autorizó el 2026-10-29; el spec igual pide confirmación antes de editarlos.

## 1. Por qué existe

El 21 de octubre de 2026, Node.js publicó una actualización de seguridad para las líneas 22, 24 y 26, con 10 CVE corregidas. La más grave es la **CVE-2026-111497**:

- Es un error de escritura fuera de límites en el **descompresor Brotli** de Node, que permite ejecutar código en el servidor.
- CISA la agregó el 27 de octubre a su lista de fallas que ya se están explotando.
- Las otras incluyen formas de saltarse la validación del certificado TLS. El backend se conecta por TLS a Aiven y a Atlas.

**SIRCOVA está expuesto de forma directa.**

- Express 5 usa `body-parser` 2, y `express.json()` **descomprime solo** los cuerpos que llegan con `Content-Encoding: br`, `gzip` o `deflate`.
- Cualquier persona, sin cuenta, puede mandar a `POST /api/v1/auth/login` un cuerpo Brotli preparado y hacer que Node lo descomprima.

El equipo decidió:

1. **Pasar a Node.js 24 LTS**, versión **24.22.1 o posterior** (la que trae la corrección), en lugar del parche 22.23.4. La línea 22 deja de recibir parches en abril de 2027; la 24 los recibe hasta abril de 2028.
2. **`express.json({ inflate: false })`**: el backend deja de aceptar cuerpos comprimidos.
   - El frontend nunca los manda, así que no se pierde nada.
   - Si mañana sale otra falla en un descompresor (Brotli, gzip o deflate), o alguien manda una "bomba de descompresión", ya no llega a Node.
   - El SPEC 27 lo dejó expresamente para este hotfix.
3. **Plan B:** si con Node 24 el sistema deja de funcionar de cualquier forma, se vuelve a la **22.23.4**, que también trae la corrección. `inflate: false` entra igual.

## 2. Decisiones del equipo (2026-10-29)

| Tema | Decisión |
|---|---|
| Versión | Node.js **24.22.1 o posterior** de la línea 24 LTS |
| Cómo se instala | El **instalador de Windows** de nodejs.org (reemplaza a la 22). Sin nvm ni otro gestor |
| Fijar la versión en el repositorio | **`.nvmrc`** con `24` en la raíz, y **`"engines": { "node": ">=24.22.1" }`** en `backend/package.json` y `frontend/package.json` |
| `package-lock.json` | **No se tocan.** Solo se usa `npm ci` (sección 4) |
| Cuerpos comprimidos | `express.json({ inflate: false })`; un cuerpo comprimido responde **415** `CODIFICACION_NO_ADMITIDA` |
| Cuerpo demasiado grande | Se corrige en el mismo cambio: responde **413** `CUERPO_DEMASIADO_GRANDE` en lugar de 500. El límite sube a 1 MB (sección 5) |
| Línea base con Node 22 | **No se corre.** Las dos suites completas pasaron con Node 22 al integrar los SPEC 27 y 28 y el rediseño, el 2026-10-29; ese resultado es la línea base |
| Cuándo se vuelve a Node 22.23.4 | Si el sistema deja de funcionar de cualquier forma (sección 6) |
| Documentos | `AGENTS.md`, `README.md` e `INSTRUCCIONES_BACKEND.md` pasan a Node.js 24 LTS. `CONTEXTO PROYECTO SIRCOVA.md` solo recibe una nota. Los specs viejos no se tocan |
| Verificación | Las dos suites completas, `vite build`, la API y `/api/docs`, y una prueba manual con Playwright (sección 7) |

## 3. Instalar Node no es parte del repositorio

**Node.js se instala en cada computadora, no en el proyecto.** El repositorio no lleva Node; lleva el código y la lista de dependencias. Por eso:

- **Cada integrante instala Node 24 en su máquina**, una sola vez, con el instalador.
- **Lo que viaja en el repositorio** es el aviso:
  - `.nvmrc` dice qué versión usar;
  - `engines` hace que `npm ci` muestre un aviso `EBADENGINE` si alguien sigue con Node 22.

  El aviso no bloquea: el proyecto se instala igual, pero queda escrito que falta actualizar.
- **Después de hacer pull, cada integrante corre `npm ci`** en `backend/` y `frontend/` con Node 24 ya instalado. `npm ci` borra `node_modules` y lo vuelve a armar según el `package-lock.json`.

Los pasos para el equipo están en la sección 8.

## 4. npm 11 y los `package-lock.json`

Node 24 trae **npm 11**; hoy el equipo usa npm 10.9.8. Se probó el 2026-10-29 con `npx npm@11` (11.21.1), sobre copias de los lock en una carpeta temporal:

| Prueba | Resultado |
|---|---|
| `npm ci` con los lock actuales | **No escribe el lock** (`npm ci` nunca lo hace) y acepta los dos `package.json`, también con `engines` agregado |
| `npm install` en `backend/` | El lock queda **idéntico** |
| `npm install` en `frontend/` | Agrega unas 60 líneas: dependencias internas de `@tailwindcss/oxide-wasm32-wasi`, un paquete opcional que en Windows no se instala. npm 11 las anota y npm 10 no |
| `npm install` con `engines` agregado | Agrega 3 líneas al lock (el `engines` de la raíz) |
| Fin de línea | Los lock están guardados con LF y `core.autocrlf` los convierte; no aparece como cambio |

**Conclusión:**

- **Con `npm ci` los lock no cambian.** Es el único comando que se usa en este spec y el que usa el equipo después del pull.
- **Por qué el lock no recibe `engines`:** `npm ci` no lo exige, y agregarlo obligaría a regenerar el lock con `npm install`. La regla de no tocar los lock pesa más que tener ahí esas 3 líneas.
- **Qué pasará más adelante:** el primer spec que agregue una dependencia con `npm install` va a ver en su diff las líneas de npm 11 (el `engines` y, en el frontend, las de `oxide-wasm32-wasi`). Es normal, se deja anotado en `CLAUDE.md`, y no hay que revertirlo.
- **Durante el spec:** si en algún paso un lock aparece modificado en `git status`, se detiene el trabajo y se decide.

## 5. `inflate: false` y los errores del cuerpo

**Lo que pasa hoy:**

- Con `inflate: false`, `body-parser` rechaza un cuerpo comprimido con un error `type: 'encoding.unsupported'` y estado **415**.
- Un cuerpo de más de 100 KB (el `limit` por defecto de `express.json()`, que hoy no se cambia) da un error `type: 'entity.too.large'` y estado **413**.
- `manejarErrores` (`middlewares/errores.js`) solo reconoce `ErrorApi` y `entity.parse.failed`. Lo demás lo responde como **500 `ERROR_INTERNO`** y lo escribe en la consola, así que **los dos casos de arriba hoy salen como 500**.

**Decisión del equipo (2026-10-29):**

- `app.use(express.json({ inflate: false, limit: '1mb' }))`. **El límite sube de 100 KB a 1 MB** (decisión del equipo, 2026-10-29), porque hoy 100 KB queda justo:
  - El cuerpo más grande de la API es el `PUT /reportes/{id}/vacunas/{vacunaId}` de la captura. Cada celda con valor pesa unos 110 a 130 bytes (`dosisCodigo`, `municipioProcedenciaId`, `dimensiones`, `cantidad`), así que 100 KB alcanzan para unas 800 celdas.
  - Una vacuna con 4 dosis, 2 sexos y 3 grupos de edad tiene 24 celdas por municipio. Un establecimiento que reciba personas de los 29 municipios del departamento, además del suyo, puede acercarse a ese número.
  - Con el límite de hoy, ese guardado ya fallaría (como 500). Con 1 MB queda margen de sobra, y sigue cortando un cuerpo absurdo antes de leerlo.
- En `manejarErrores`, con el formato común y sin escribir en la consola:

  | `err.type` | Estado | `codigo` | `mensaje` |
  |---|---|---|---|
  | `encoding.unsupported` | **415** | `CODIFICACION_NO_ADMITIDA` | El servidor no acepta cuerpos comprimidos. |
  | `entity.too.large` | **413** | `CUERPO_DEMASIADO_GRANDE` | El cuerpo de la solicitud es demasiado grande. |

  415 y 413 son los códigos HTTP que corresponden. Se suman a los de la lista de `AGENTS.md`, como ya pasó con el 423 de la cuenta bloqueada.
- En el contrato (`openapi.yaml`): dos respuestas comunes, `CodificacionNoAdmitida` (415) y `CuerpoDemasiadoGrande` (413). La descripción general dice que ningún endpoint acepta `Content-Encoding` y que el cuerpo no puede pasar de 1 MB. No hace falta agregarlas a cada operación.
- **Pruebas** (`tests/cuerpoDeLaSolicitud.test.js`), contra `POST /api/v1/auth/login` y sin iniciar sesión con ninguna cuenta real:
  - un cuerpo comprimido con `zlib.brotliCompressSync` y `Content-Encoding: br` → 415 `CODIFICACION_NO_ADMITIDA`;
  - lo mismo con `gzip`;
  - un JSON de más de 1 MB → 413 `CUERPO_DEMASIADO_GRANDE`;
  - un JSON de unos 200 KB (más que el límite anterior) **no** responde 413;
  - el mismo login sin comprimir y de tamaño normal sigue respondiendo como siempre (400 o 401).

## 6. Cuándo se vuelve a Node 22.23.4 (plan B)

Se vuelve si con Node 24 **el sistema deja de funcionar de cualquier forma**. Por ejemplo:

- `npm ci` no instala alguna dependencia (por ejemplo `bcrypt`, el único módulo nativo; su versión 6 trae binarios ya compilados que no dependen de la versión de Node);
- falla una prueba que en Node 22 pasa;
- falla la conexión TLS con Aiven o con Atlas (Node 24 trae un OpenSSL más estricto);
- la API no arranca, Vite no arranca o `vite build` falla;
- algo de la prueba manual no funciona.

**No cuentan como falla:**

- los timeouts sueltos de Aiven en la suite del backend: se repite solo ese archivo;
- los timeouts de las pantallas `lazy` en la suite del frontend: se repiten solas o con `--maxWorkers=2` (notas del 2026-10-22 y del 2026-10-29).

**Los avisos de obsolescencia** (`DeprecationWarning`, `ExperimentalWarning`) se anotan en el spec pero no son motivo para volver.

**Cómo se vuelve:**

1. Instalar el MSI de la **22.23.4** encima.
2. Correr `npm ci` en los dos proyectos.
3. Cambiar `.nvmrc` a `22` y `engines` a `>=22.23.4 <23`.
4. Dejar los documentos en "Node.js 22 LTS".

`inflate: false` se mantiene igual.

**Línea base:** las dos suites completas pasaron con Node 22 el 2026-10-29, al integrar los SPEC 27 y 28 y el rediseño. Una prueba que falle con Node 24 y no sea uno de los timeouts conocidos se trata como falla nueva.

## 7. Plan tentativo (pasos del spec)

La línea base con Node 22 ya existe (sección 6): no se vuelven a correr las suites antes de cambiar de versión.

1. **Instalar Node 24.**
   - Anotar antes `node -v` y `npm -v` (hoy v22.23.2 y 10.9.8).
   - Bajar el MSI de nodejs.org (24.22.1 o posterior) e instalarlo.
   - Cerrar y volver a abrir VS Code, para que las terminales tomen la ruta nueva.
   - Comprobación: `node -v` ≥ 24.22.1 y `npm -v` 11.x. Verificar que no queda ningún `node` corriendo de la versión anterior (nota de memoria sobre procesos en Windows).
2. **Reinstalar las dependencias.**
   - `npm ci` en `backend/` y en `frontend/`.
   - Comprobación: termina sin errores y `git status` no muestra cambios en los `package-lock.json`.
3. **Fijar la versión.**
   - Pedir confirmación y agregar `engines` a los dos `package.json`.
   - Crear `.nvmrc` en la raíz.
   - Comprobación: `npm ci` vuelve a pasar, y con Node 22 mostraría el aviso `EBADENGINE`. Esto se probó con `npx npm@11 ci --dry-run`; no hace falta reinstalar Node 22.
4. **`inflate: false`, 415 y 413.**
   - El contrato primero, después `app.js` y `manejarErrores`, y al final las pruebas de la sección 5.
   - Comprobación: el archivo de prueba pasa solo.
5. **Verificación completa.**
   - `npm test` del backend y del frontend, completos.
   - `npx vite build` en `frontend/`.
   - `npm run dev` del backend (la API arranca, sin errores de TLS con Aiven y Atlas) y `/api/docs`.
   - `npm run dev` del frontend.
   - `npm audit` en los dos proyectos, solo como informe: lo que salga se anota y no se corrige en este spec.
6. **Prueba manual con Playwright** (la persona inicia sesión a mano):
   - iniciar sesión;
   - recargar (la sesión se recupera con la cookie `sircova_refresh`);
   - abrir una segunda pestaña;
   - en `/registro`, escribir una cantidad y guardar el borrador;
   - cerrar sesión y comprobar que una recarga no la recupera.
7. **Documentación.**
   - `AGENTS.md` §3, `README.md` (la tabla de tecnologías y los requisitos) e `INSTRUCCIONES_BACKEND.md`: "Node.js 24 LTS".
   - `CONTEXTO PROYECTO SIRCOVA.md`: una nota en la sección de decisiones del equipo, debajo de la línea de Node.js 22 del backend v0.1 (por ejemplo: «Sprint 3 (29/10/2026): se pasa a Node.js 24 LTS por la actualización de seguridad de octubre de 2026»).
   - «Notas de contexto» de `CLAUDE.md`, con estas notas:
     - Node 24.22.1 o posterior;
     - después de un pull que cambie la versión, `npm ci` y no `npm install`;
     - npm 11 agrega líneas al lock en el próximo `npm install`, y es normal;
     - `inflate: false`, el 415 y el 413.

## 8. Pasos para el equipo después del merge

Para el mensaje del PR o del grupo:

1. Cerrar VS Code y cualquier terminal con la API o Vite corriendo.
2. Instalar Node.js **24.22.1 o posterior** (LTS) con el instalador de nodejs.org; reemplaza a la 22.
3. Abrir una terminal nueva y comprobar `node -v` (v24.x) y `npm -v` (11.x).
4. Hacer pull de `main`.
5. Correr `npm ci` en `backend/` y otra vez en `frontend/`. **No usar `npm install`.**
6. Arrancar la API y el frontend como siempre. Los `.env` no cambian.
7. Si `npm ci` muestra `EBADENGINE`, la terminal sigue usando Node 22: cerrarla y abrir otra.

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Un integrante no actualiza y sigue con Node 22 vulnerable | El aviso `EBADENGINE` de `engines` y los pasos de la sección 8 en el PR |
| `npm install` con npm 11 ensucia los lock | El spec usa solo `npm ci`; la nota en `CLAUDE.md` explica las líneas que aparecerán más adelante |
| La terminal de VS Code sigue usando el Node viejo | Cerrar y volver a abrir VS Code después de instalar (paso 2) |
| Un `node` de la versión anterior queda ocupando el puerto | Revisarlo antes de arrancar (nota de memoria sobre procesos en Windows) |
| OpenSSL de Node 24 rechaza el certificado de Aiven o de Atlas | La suite completa y el arranque de la API lo detectan; si pasa, plan B |
| Una falla que ya existía se atribuye a Node 24 | La línea base del 2026-10-29 (sección 6): las dos suites pasaban completas con Node 22 |
| Aiven apagado (plan gratuito) se confunde con una falla de Node | Un `ENOTFOUND` es Aiven, no Node: se pide encenderlo y se repite |

## 10. Fuera de alcance

- Cambiar dependencias o sus versiones, y regenerar los `package-lock.json`.
- Corregir lo que reporte `npm audit`.
- Docker, CI o despliegue (no existen todavía; cuando lleguen, usarán Node 24).
- Pasar a Node 26.
- La vista previa obligatoria antes de publicar un esquema (spec congelado).

## Fuentes

- [Node.js October 2026 Security Release – Konfirmity](https://www.konfirmity.com/advisories/nodejs-october-2026-security-releases)
- [CVE-2026-111497 – Rapid7](https://www.rapid7.com/blog/post/etr-cve-2026-111497-critical-out-of-bounds-write-in-the-node-js-brotli-decoder/)
- [CloudLinux – Node.js October 2026](https://blog.cloudlinux.com/node-js-october-2026-security-releases)
- [Node.js 24 Becomes LTS – NodeSource](https://nodesource.com/blog/nodejs-24-becomes-lts)
