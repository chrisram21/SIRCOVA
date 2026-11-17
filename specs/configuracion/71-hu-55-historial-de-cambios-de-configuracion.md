# SPEC 71 — HU-55 Historial de cambios de configuración

> **Estado:** Aprobado
> **Historia:** HU-55
> **Origen:** historia
> **Depende de:** SPEC 20, SPEC 30, SPEC 32, SPEC 43 y SPEC 70
> **Fecha:** 2026-11-16
> **Objetivo:** Que el Administrador vea las versiones de cada esquema, regla e indicador con su fecha y autor, compare dos versiones del esquema de una vacuna y llegue desde cada versión a sus registros en la bitácora, que pasa al desplegable «Administración».

## Por qué existe este spec

Los historiales ya existen, cada uno en su lugar:

- **Esquemas:** «Historial de esquemas» (SPEC 20), en `/administracion/esquemas/historial/:vacunaId`, con versión, territorio, estado, vigencia, fecha y usuario que publicó, motivo y reportes.
- **Reglas:** `PanelHistorialRegla` (SPEC 32).
- **Indicadores:** `PanelHistorialIndicador` (SPEC 43).

A la historia le faltan tres cosas:

- El Administrador no tiene `INDICADOR_CONFIG_CONSULTAR` (solo Epidemiología), así que no ve los indicadores ni su historial.
- No hay forma de comparar dos versiones de un esquema.
- Las versiones no llevan a sus registros de la bitácora, que la pantalla «Auditoría» (SPEC 70) ya filtra por entidad e id.

**Lo que se decidió en la fase de preguntas (2026-11-16):**

- Se amplía lo que existe, sin pantalla unificada nueva.
- El ADMINISTRADOR recibe solo `INDICADOR_CONFIG_CONSULTAR`: ve los indicadores y su historial, pero no los edita.
- La comparación es una lista de diferencias que calcula el frontend con dos `GET /esquemas-captura/{id}`, sin endpoint nuevo.
- Se comparan dos versiones cualesquiera del historial de la misma vacuna, borradores incluidos. Reglas e indicadores no se comparan.
- Cada fila del historial tiene «Comparar» (salvo la primera versión) y abre una pantalla con dos selectores y la anterior ya elegida. La URL se puede compartir.
- El autor queda como hoy: el usuario que publicó; un borrador, «—».
- Con `BITACORA_CONSULTAR`, cada versión de esquema, regla e indicador enlaza a «Auditoría» filtrada por su entidad y su id.
- La comparación muestra arriba los datos de las dos versiones y debajo los cambios de la captura. No incluye `reglas[]` incrustadas.
- Pedido del equipo: «Auditoría» deja de ser una opción del primer nivel del menú y pasa al final del desplegable «Administración» (después de «Roles y permisos»), porque no se consulta a menudo. Su ruta pasa a `/administracion/auditoria`, y `/auditoria` redirige a ella conservando los filtros.
- El spec va en `specs/configuracion/`, junto a los SPEC 19, 20, 32 y 43.

## Alcance

**Entra:**

- **Permisos** (zona protegida, autorizado por el equipo en esta fase): en `backend/db/05_permisos_mysql.sql`, asignar `INDICADOR_CONFIG_CONSULTAR` al ADMINISTRADOR con el comentario `-- SPEC 71 (HU-55)`. Ya tiene `CONFIGURACION_CONSULTAR`. En la base de prueba se corre solo ese `INSERT IGNORE`, no el script entero.
- **Contrato:** no cambia ningún endpoint. Se reutilizan:
  - `GET /esquemas-captura/historial` y `GET /esquemas-captura/{id}`;
  - `GET /reglas-validacion/{codigo}/historial`;
  - `GET /configuracion-indicadores` y `GET /configuracion-indicadores/{codigo}/historial`;
  - `GET /auditoria/bitacora`, a través de la pantalla.
- **Frontend:**
  - `paginas/configuracion/compararEsquemas.js`, con las funciones puras: `compararEsquemas(a, b)` devuelve la lista de diferencias y `versionAnterior(versiones, id)` da la versión que se compara por defecto.
  - Pantalla nueva `paginas/configuracion/PaginaCompararEsquemas.jsx`, como subruta «Comparar versiones de esquema» en `/administracion/esquemas/historial/:vacunaId/comparar` (permiso `ESQUEMA_CONSULTAR`) en `opcionesMenu.js`.
  - `PaginaHistorialEsquemas.jsx`: botón «Comparar» en cada fila salvo la de la primera versión, y «Ver en la bitácora» con `BITACORA_CONSULTAR`.
  - `PanelHistorialRegla.jsx` y `PanelHistorialIndicador.jsx`: «Ver en la bitácora» en cada versión, con `BITACORA_CONSULTAR`.
  - Una función común `enlaceBitacora(entidad, id)` en `paginas/auditoria/auditoria.js`, que arma `/administracion/auditoria?entidad=…&entidadId=…&desde=&hasta=` (todo el historial).
  - **Menú:**
    - en `opcionesMenu.js`, «Auditoría» pasa de opción de primer nivel a último hijo de «Administración», con `ruta: '/administracion/auditoria'` y `permisos: ['BITACORA_CONSULTAR']`; conserva su `descripcion`, su icono y su `pagina`;
    - la ruta de la pantalla se guarda en una constante (`RUTA_AUDITORIA`) que usan las tarjetas del Inicio del Administrador (`InicioAdministrador.jsx`) y `enlaceBitacora`, en vez de `/auditoria` escrito a mano;
    - `RedireccionRutaVieja.jsx`: `/auditoria` entra en `RUTAS_VIEJAS` y `destinoDeRutaVieja` lo lleva a `/administracion/auditoria` con la misma búsqueda.
- **Pruebas:**
  - `compararEsquemas.test.js` y `PaginaCompararEsquemas.test.jsx`.
  - Ampliar `PaginaHistorialEsquemas.test.jsx`, y `PanelRegla.test.jsx` y `PanelIndicador.test.jsx` (o los que monten los paneles de historial).
  - `PaginaConfigIndicadores.test.jsx`: el Administrador ve la lista sin botones de edición.
  - Ajustar `Layout.test.jsx` y `RutaConPermiso.test.jsx` si dejan de cuadrar.
  - Por el menú, ajustar:
    - `Layout.test.jsx`: «Auditoría» ya no está en el primer nivel, sino dentro de «Administración»;
    - `RutaConPermiso.test.jsx`: la ruta nueva;
    - `RedireccionRutaVieja.test.jsx`: `/auditoria?…` lleva a la ruta nueva con sus filtros;
    - `PaginaInicio.test.jsx`: los enlaces de las tarjetas del Administrador y sus accesos.
- **Documentación:** nota en `backend/src/modulos/configuracion/CLAUDE.md`, avance de HU-55 en `docs/SPECS/HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

**Fuera de alcance (para otros specs):**

- Una pantalla unificada «Historial de configuración» con todas las versiones juntas y filtros.
- Comparar versiones de reglas o de indicadores.
- Un endpoint de comparación en el backend.
- Nombre completo del autor, o creador y fecha de creación de los borradores, en los historiales (cambio de contrato).
- Comparar esquemas de vacunas distintas.
- Comparar `reglas[]` incrustadas del esquema, `camposAdicionales` (los copia la base y ningún spec los edita) o `presentacion` (la deduce el backend).
- `INDICADOR_CONFIG_EDITAR` para el Administrador, o cualquier otro cambio de permisos.
- Relacionar las versiones con los resultados de una corrida («por qué cambió este resultado»): eso ya lo da la versión guardada en MySQL que se ve en Indicadores.

## Modelo de datos

No cambia el modelo. Lo único nuevo en la base es la fila de `rol_permiso` (ADMINISTRADOR, `INDICADOR_CONFIG_CONSULTAR`).

### Diferencias (`compararEsquemas(a, b)`)

`a` es la versión de la izquierda («Desde») y `b` la de la derecha («Hasta»), las dos como las devuelve `GET /esquemas-captura/{id}`. Devuelve una lista ordenada de diferencias:

```js
[
  { grupo: 'procedencia', tipo: 'cambiado', etiqueta: 'Modo de procedencia', antes: 'Propio y otros', despues: 'Municipio detallado' },
  { grupo: 'desagregacion', tipo: 'agregado', etiqueta: 'Dimensión pueblo', despues: 'Maya, Garífuna, Xinka, Mestizo' },
  { grupo: 'dosis', tipo: 'quitado', etiqueta: 'Dosis R2', antes: 'Refuerzo 2' },
  { grupo: 'dosis', tipo: 'cambiado', etiqueta: 'Desagregación de D1', antes: 'General', despues: 'Sin desagregar' },
  { grupo: 'secciones', tipo: 'cambiado', etiqueta: 'Sección «< 1 año»', antes: 'D1, D2', despues: 'D1, D2, D3' }
]
```

| Grupo | Qué se compara | Clave |
|---|---|---|
| `procedencia` | `modo` y `permiteNoEspecificado` | el campo |
| `desagregacion` | dimensiones de la desagregación general: agregadas, quitadas, y valores o etiqueta cambiados | código de la dimensión |
| `dosis` | dosis agregadas o quitadas, su `etiqueta` y su desagregación propia (`null` = general, `[]` = sin desagregar, o una lista) | código de la dosis |
| `secciones` | secciones agregadas o quitadas, y su `titulo`, `orden` y `dosis` | `codigo` de la sección |
| `inclusion` | `incluirPorDefecto` | el campo |

- Los valores se muestran con sus etiquetas, no con códigos, cuando el documento las trae.
- Si `a` y `b` no tienen diferencias de captura, la lista está vacía.
- Comparar una versión consigo misma o versiones de vacunas distintas no se permite desde la pantalla (ver abajo). La función no lanza: compara lo que recibe.

`versionAnterior(versiones, id)` busca la versión de `version` inmediatamente menor en el historial (de cualquier territorio). En la primera versión devuelve `null`.

### Pantalla «Comparar versiones de esquema»

Ruta: `/administracion/esquemas/historial/:vacunaId/comparar?a={id}&b={id}`.

- **Encabezado:** «Comparar versiones», con el nombre de la vacuna, y el botón «Volver» al historial. La miga vuelve al historial como las demás subrutas.
- **Selectores:** «Desde» y «Hasta», dos `Select` de shadcn con las versiones del historial (`v{version} · {territorio} · {estado}`). Al cambiar uno, se escribe en la URL. En cada uno no aparece la versión elegida en el otro.
- **Valores por defecto:**
  - si falta `b`, la versión más reciente;
  - si falta `a`, `versionAnterior` de `b`;
  - un id que no está en el historial de esa vacuna muestra el aviso «La versión elegida no es de esta vacuna.» y los selectores, para elegir otra.
- **Datos de la versión:** dos columnas (una debajo de la otra a 390 px) con versión, territorio, estado (`Badge`), vigencia, «Publicada» (`textoPublicacion`) y motivo.
- **Diferencias:** agrupadas por grupo, con un título por grupo («Procedencia», «Desagregación», «Dosis», «Secciones», «Inclusión en reportes nuevos»), y en cada fila:
  - la etiqueta;
  - una insignia «Agregado», «Quitado» o «Cambiado», con colores del tema;
  - el antes y el después.
  - Sin diferencias: «Las dos versiones capturan lo mismo.».
- **Estados:** cargando (el de las demás pantallas), error con «Reintentar», y 404 de la vacuna como el historial.

### Enlaces a la bitácora

Solo se ven con `BITACORA_CONSULTAR`.

| Dónde | Entidad | Id |
|---|---|---|
| Fila del historial de esquemas | `esquemas_captura` | `id` de la versión |
| Versión en `PanelHistorialRegla` | `reglas_validacion` | `id` de la versión |
| Versión en `PanelHistorialIndicador` | `configuracion_indicadores` | `id` de la versión |

El enlace es `enlaceBitacora(entidad, id)`: `/administracion/auditoria?entidad={entidad}&entidadId={id}&desde=&hasta=`. Los `desde` y `hasta` vacíos son todo el historial, según el SPEC 70.

### «Auditoría» en el menú

| | Antes (SPEC 70) | Después |
|---|---|---|
| Lugar | Opción de primer nivel, entre «Alertas» y «Administración» | Último hijo de «Administración», después de «Roles y permisos» |
| Ruta | `/auditoria` | `/administracion/auditoria` (`/auditoria` redirige, con su búsqueda) |
| Miga | «Auditoría» | «Administración › Auditoría» |
| Permiso | `BITACORA_CONSULTAR` | igual, como `permisos: ['BITACORA_CONSULTAR']` del hijo |

- La pantalla no cambia.
- Un rol con `BITACORA_CONSULTAR` y ningún otro hijo de «Administración» ve el desplegable solo con «Auditoría». Hoy el permiso es solo del ADMINISTRADOR, que ya tiene otros hijos.

## Plan de implementación

1. **Permiso.** Agregar la asignación de `INDICADOR_CONFIG_CONSULTAR` al ADMINISTRADOR en el 05 y correr solo ese `INSERT IGNORE` en la base de prueba. Comprobar con el login:
   - el Administrador lo trae;
   - `GET /configuracion-indicadores` y su historial le responden 200;
   - `POST /configuracion-indicadores/{codigo}/versiones` le sigue respondiendo 403;
   - correr solo las pruebas del backend de configuración de indicadores.
2. **Indicadores para el Administrador.** Confirmar que «Configuración de indicadores» aparece en su menú y que `PaginaConfigIndicadores` y `PanelIndicador` no le muestran crear, publicar, activar ni desactivar (`puedeEditar`). Agregar la prueba en `PaginaConfigIndicadores.test.jsx` y ajustar `Layout.test.jsx` si hace falta.
3. **Diferencias.** `compararEsquemas.js` con `compararEsquemas` y `versionAnterior`. En `compararEsquemas.test.js`, un caso por grupo y tipo:
   - procedencia cambiada;
   - dimensión agregada, quitada y con valores cambiados;
   - dosis agregada, quitada y con etiqueta o desagregación cambiada (general, sin desagregar, lista);
   - sección agregada, quitada y con dosis cambiadas;
   - `incluirPorDefecto`;
   - sin diferencias;
   - `versionAnterior` con la primera versión y con versiones de distinto territorio.
4. **Pantalla de comparación.** `PaginaCompararEsquemas.jsx` y su subruta en `opcionesMenu.js`, antes de `/administracion/esquemas/:id`. Pruebas en `PaginaCompararEsquemas.test.jsx`:
   - los valores por defecto sin `a` o sin `b`;
   - los selectores escriben en la URL y no ofrecen la versión del otro;
   - los datos de las dos versiones;
   - las diferencias agrupadas con su insignia;
   - sin diferencias;
   - el id de otra vacuna;
   - el error con «Reintentar».
   
   Ajustar `RutaConPermiso.test.jsx`.
5. **Historial de esquemas.** «Comparar» en cada fila salvo la primera versión, que abre la comparación con `a` = la anterior y `b` = esa fila, y «Ver en la bitácora» con `BITACORA_CONSULTAR`. Ampliar `PaginaHistorialEsquemas.test.jsx`: enlaces correctos y sin «Ver en la bitácora» cuando falta el permiso.
6. **Auditoría en «Administración».**
   - Mover la opción en `opcionesMenu.js` con su ruta nueva y crear `RUTA_AUDITORIA`.
   - Cambiar los enlaces de `InicioAdministrador.jsx` a esa constante.
   - Agregar `/auditoria` a `RedireccionRutaVieja.jsx`.
   - Ajustar `Layout.test.jsx`, `RutaConPermiso.test.jsx`, `RedireccionRutaVieja.test.jsx` y `PaginaInicio.test.jsx`.
   - Buscar en `frontend/src` que no quede `/auditoria` escrito a mano fuera de la redirección.
   - Este paso va antes de los enlaces a la bitácora, para que estos nazcan con la ruta nueva.
7. **Reglas e indicadores.** `enlaceBitacora` en `paginas/auditoria/auditoria.js` (con `RUTA_AUDITORIA`), con su prueba en `auditoria.test.js`, y «Ver en la bitácora» en `PanelHistorialRegla.jsx` y `PanelHistorialIndicador.jsx`, con sus pruebas con y sin el permiso. El «Ver en la bitácora» del historial de esquemas (paso 5) pasa a usar `enlaceBitacora`.
8. **Verificación manual** con la API real, Vite y Playwright:
   - como Administrador:
     - comparar dos versiones reales de Hexavalente o Td y revisar cada diferencia contra «Ver» de cada versión;
     - cambiar los selectores y recargar la URL;
     - abrir «Ver en la bitácora» de un esquema, una regla y un indicador, y comprobar que la Auditoría trae sus filas `CREAR`/`ACTUALIZAR`;
     - abrir «Configuración de indicadores» y comprobar que no hay botones de edición;
     - comprobar que «Auditoría» ya no está en el primer nivel del menú y aparece al final de «Administración», con la miga «Administración › Auditoría»;
     - comprobar que abrir `/auditoria?modulo=RECTIFICACION` lleva a la ruta nueva con ese filtro, y que las tarjetas del Inicio enlazan a ella;
   - como Revisor (tiene `ESQUEMA_CONSULTAR` y no `BITACORA_CONSULTAR`): la comparación funciona y no hay «Ver en la bitácora»;
   - a 390 px nada desborda.
9. **Documentación.** Nota en `backend/src/modulos/configuracion/CLAUDE.md` (y una línea en `backend/src/modulos/auth/CLAUDE.md` por la ruta nueva de «Auditoría»), avance de HU-55 en `HISTORIAS_DE_USUARIO.md` y `node scripts/mapa-obsidian.mjs`.

## Criterios de aceptación

- [ ] `INDICADOR_CONFIG_CONSULTAR` está asignado al ADMINISTRADOR en el 05 y en la base de prueba, y el ADMINISTRADOR sigue sin `INDICADOR_CONFIG_EDITAR`.
- [ ] El Administrador ve las versiones de cada esquema, regla e indicador con su fecha y su autor (historial de esquemas, `PanelHistorialRegla` y `PanelHistorialIndicador`).
- [ ] En «Configuración de indicadores» el Administrador no ve acciones de edición, y publicar una versión le responde 403.
- [ ] Cada fila del historial de esquemas, salvo la primera versión, tiene «Comparar», que abre la comparación con la versión anterior ya elegida.
- [ ] La pantalla de comparación permite elegir cualquier par de versiones de la vacuna (borradores incluidos), guarda la elección en la URL y no ofrece comparar una versión consigo misma.
- [ ] La comparación muestra los datos de las dos versiones y las diferencias de procedencia, desagregación, dosis, secciones e inclusión, agrupadas y marcadas como agregado, quitado o cambiado; sin diferencias, lo dice.
- [ ] Con `BITACORA_CONSULTAR`, cada versión de esquema, regla e indicador enlaza a «Auditoría» filtrada por su entidad y su id en todo el historial; sin el permiso, el enlace no aparece.
- [ ] «Auditoría» aparece al final del desplegable «Administración» y no en el primer nivel del menú; su pantalla abre en `/administracion/auditoria`, y `/auditoria` redirige a ella con sus filtros.
- [ ] Las tarjetas del Inicio del Administrador y los «Ver en la bitácora» enlazan a `/administracion/auditoria`.
- [ ] No cambia ningún endpoint de `backend/openapi.yaml` y la API arranca.
- [ ] Los colores salen de las variables del tema y a 390 px la comparación no tiene desplazamiento horizontal.
- [ ] Pasan las pruebas del backend de configuración de indicadores, `compararEsquemas.test.js`, `PaginaCompararEsquemas.test.jsx`, `PaginaHistorialEsquemas.test.jsx`, las de los paneles de historial, `PaginaConfigIndicadores.test.jsx`, `auditoria.test.js` (frontend), `RutaConPermiso.test.jsx`, `Layout.test.jsx`, `RedireccionRutaVieja.test.jsx`, `PaginaInicio.test.jsx` y la suite del frontend.
- [ ] `node scripts/mapa-obsidian.mjs --revisar` dice que `mapa/` está al día.

## Decisiones

- **Sí:** ampliar los historiales existentes. Ya muestran fecha y autor. Una pantalla unificada repetiría lo que hacen y pediría un endpoint nuevo que junte tres colecciones.
- **Sí:** `INDICADOR_CONFIG_CONSULTAR` para el ADMINISTRADOR, solo para consultar. La historia es suya y pide ver los indicadores; configurarlos sigue siendo de Epidemiología (SPEC 43).
- **No:** `INDICADOR_CONFIG_EDITAR` para el ADMINISTRADOR. La historia no lo pide.
- **Sí:** diferencias calculadas en el frontend. `GET /esquemas-captura/{id}` ya trae todo lo que se compara; un endpoint de comparación no agrega datos ni permisos.
- **No:** dos vistas previas lado a lado. A 390 px no caben y los cambios pequeños, como una etiqueta o un valor de dimensión, no se ven.
- **Sí:** cualquier par de versiones de la misma vacuna, borradores incluidos. Permite ver qué cambiará al publicar un borrador. Comparar vacunas distintas no tiene sentido.
- **No:** comparar reglas o indicadores. La historia solo pide esquemas; su panel ya muestra el contenido de cada versión.
- **Sí:** «Comparar» por fila más una pantalla con dos selectores y la elección en la URL. Es el caso común en un clic, deja elegir otro par y se puede compartir.
- **No:** casillas en la tabla ni un diálogo. Las casillas piden dos pasos para el caso común; el diálogo no deja un enlace.
- **Sí:** `versionAnterior` por número de versión, de cualquier territorio. En el historial se mezclan nacional y DDRISS, y la anterior en número es la que el Administrador ve justo debajo.
- **No:** cambiar el autor de los historiales. Ya muestran quién publicó; el creador de un borrador cambiaría el contrato de tres endpoints sin que la historia lo pida.
- **Sí:** «Ver en la bitácora» con `BITACORA_CONSULTAR`. Cumple lo de «junto con sus registros en la bitácora» con la pantalla del SPEC 70, sin endpoint nuevo.
- **No:** comparar `reglas[]` incrustadas, `camposAdicionales` ni `presentacion`. El motor de validación usa la colección de reglas (SPEC 32), los campos adicionales no se editan y la presentación la deduce el backend.
- **Sí:** «Auditoría» dentro de «Administración», al final. Pedido del equipo: no se consulta a menudo y no necesita lugar en el primer nivel. Entra en este spec porque es un cambio corto que toca los mismos enlaces a la bitácora.
- **Sí:** ruta `/administracion/auditoria`, con `/auditoria` redirigiendo a ella. Queda como los demás hijos y su miga sale bien, y los enlaces guardados siguen funcionando, como se hizo con `/configuracion` y `/usuarios`.
- **No:** dejar `/auditoria`. Sería el único hijo de «Administración» con una ruta fuera de `/administracion`.
- **Sí:** el spec en `configuracion`. Esquemas, reglas e indicadores configurables son de ese módulo (sección 7 de `AGENTS.md`).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| Al Administrador le aparece «Configuración de indicadores» en el menú y alguna prueba de menú o de Inicio cuenta sus opciones | Se revisan `Layout.test.jsx` y `PaginaInicio.test.jsx` en el paso 2 y se ajustan sin cambiar lo que comprueban. |
| Algún botón de edición de indicadores no depende de `puedeEditar` y el Administrador lo ve (y recibe 403 al usarlo) | El paso 2 lo revisa en el código y en la verificación manual; el backend sigue respondiendo 403. |
| Versiones viejas sin `secciones` (Hexavalente v1) o sin `incluirPorDefecto` | Se comparan con lo que devuelve la API: `GET /esquemas-captura/{id}` ya responde `incluirPorDefecto: true` sin el campo, y la falta de `secciones` se toma como lista vacía. Se prueba con un caso así. |
| Las filas de bitácora de las versiones de la semilla no existen (se insertaron sin bitácora) | La Auditoría muestra su vacío («No hay registros con estos filtros.»); se anota en la nota del módulo si pasa. |
| Queda algún `/auditoria` escrito a mano (Inicio, pruebas, notas) y lleva a la redirección en vez de a la ruta | El paso 6 los busca en `frontend/src` y los cambia a `RUTA_AUDITORIA`; la redirección cubre los que queden fuera del código. |
| `ubicarRuta` o la miga no reconocen un hijo que antes era opción de primer nivel | Se prueba la miga «Administración › Auditoría» en `Layout.test.jsx` y en la verificación manual. |
| La subruta `…/historial/:vacunaId/comparar` choca con `/administracion/esquemas/:id` | Va antes en `subrutas`, y React Router prefiere los segmentos fijos; se prueba en `RutaConPermiso.test.jsx`. |
