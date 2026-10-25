# SPEC 21 — Vista previa del formulario de un esquema de captura

> **Estado:** Aprobado
> **Historia:** HU-18
> **Depende de:** SPEC 06, SPEC 18, SPEC 19, SPEC 20
> **Fecha:** 2026-10-25
> **Objetivo:** Que el Administrador y el Revisor vean, desde el editor de un borrador o desde la vista de una versión, el formulario de captura de la vacuna como lo verá el establecimiento, con los totales calculados en pantalla y sin guardar nada.

## Por qué existe este spec

La historia dice que la vista previa «reutiliza el componente de formulario dinámico en modo de solo lectura». Ese componente es de HU-20 y todavía no existe. Por eso este spec lo crea:

- una función pura que convierte un esquema en la estructura del formulario (`armarFormulario`);
- un componente que la dibuja (`FormularioCaptura`).

HU-20 los reutiliza para la captura real.

Todo pasa en el frontend. Con eso, el editor también previsualiza los cambios que todavía no se guardan. El backend no cambia: la vista previa usa lo que ya cargan el editor y la vista de una versión (`GET /esquemas-captura/{id}`, `GET /vacunas/{id}` y `GET /dimensiones`).

**Diferencias con la historia** (mandan `AGENTS.md`, los mockups y lo que decidió el equipo):

- La historia es para el Administrador. Por decisión del equipo, el **Revisor** también la ve, como los demás permisos de esquemas (SPEC 19 y 20).
- «Modo de solo lectura»: por decisión del equipo, los campos numéricos **se pueden llenar** y los totales se calculan, para probar la tabla como la usará el establecimiento. Nada sale del navegador, y eso cumple «la vista previa no guarda datos».
- Además del borrador, se previsualiza cualquier versión (`VIGENTE` o `HISTORICO`) desde `/configuracion/esquemas/:id` (SPEC 20).

La referencia visual es la tarjeta A de `docs/mockups/pantallas/Registro.html` y `Registro-Td.html` (pantallas 4 y 4b de `descripcion_pantallas.md`), sin los pasos de estado, las pestañas de vacunas, la tarjeta B ni los botones de envío.

## Alcance

**Entra:**

- `frontend/src/componentes/formulario/armarFormulario.js`: del esquema, la vacuna y el catálogo de dimensiones, arma las tablas, sus columnas, sus filas y la `claveCombinacion` canónica de cada celda.
- `frontend/src/componentes/formulario/FormularioCaptura.jsx`: dibuja el formulario con sus campos numéricos, sus totales y sus campos adicionales, con el estado de las cantidades en memoria.
- `frontend/src/paginas/configuracion/VistaPreviaEsquema.jsx`: un Sheet con el encabezado de la vista previa, el aviso de problemas, el formulario, la descripción de la procedencia y la lista de reglas.
- Botón «Vista previa» en el editor del borrador (`PaginaEditarEsquema.jsx`), con los cambios sin guardar.
- Botón «Vista previa» en la vista de una versión (`PaginaVerEsquema.jsx`).
- En el editor, si hay problemas de coherencia, la vista previa se abre con un aviso que los lista.
- Pruebas del frontend con `vi.mock` sobre `src/api/`.
- Verificación manual con Playwright sobre los esquemas de la semilla, sin guardar.
- Avance y criterios de HU-18, una nota en HU-20 y una en HU-21, y una nota en "Notas de contexto" de `CLAUDE.md`.

**Fuera de alcance (para otros specs):**

- Cualquier cambio en el backend, `backend/openapi.yaml`, los permisos o `backend/db/`.
- La tarjeta B (dosis a personas de otros municipios): aquí solo se describe el modo de procedencia. La arma HU-21.
- Ejecutar las reglas de validación (HU-22 y siguientes): solo se listan.
- Los nombres de las reglas: el esquema solo trae código y versión, y no hay endpoint de `reglas_validacion`.
- Los pasos de estado, las pestañas de vacunas, «Guardar borrador» y «Enviar a revisión» del Registro (HU-19 y HU-20).
- `GET /reportes/{id}/formulario`, guardar cantidades y cargar las de un reporte (HU-20).
- La vista previa en la pantalla de crear un borrador (`PaginaRegistrarEsquema.jsx`) y en la fila de la pestaña «Esquemas».
- Editar los campos adicionales o las reglas del esquema.

## Modelo de datos

Este spec **no cambia el modelo** ni la API. Lee los esquemas de `esquemas_captura` tal como los devuelve `GET /esquemas-captura/{id}` (SPEC 19 y 20).

### Entrada de `armarFormulario`

```js
armarFormulario({
  contenido,      // { procedencia, dosis: [{ codigo, desagregacion }], desagregacion, secciones: [{ titulo, grupoEdad, dosis }] }
                  //   la forma de contenidoDe (EditorEsquema.jsx): la del editor o la de una versión guardada
  vacuna,         // GET /vacunas/{id}: nombre y dosis con su código, nombre y orden
  dimensiones,    // GET /dimensiones: códigos, nombres, valores con etiqueta y orden
  camposAdicionales, reglas,   // del esquema cargado; el editor no los cambia
})
```

### Salida

```js
{
  dimensionesUsadas: ['Dosis', 'Grupo de edad', 'Sexo'],   // franja «Dimensiones de este esquema»
  tablas: [
    {
      clave: 'general',              // o 'dosis-R1' para una dosis con desagregación propia
      titulo: null,                  // o 'Refuerzo 1' en una tabla aparte
      encabezados: [                 // un nivel por sección (si hay más de una) y por dimensión
        [{ etiqueta: '< 1 año', columnas: 2 }, { etiqueta: 'De 1 a < 6 años', columnas: 2 }],
        [{ etiqueta: 'Masculino', columnas: 1 }, { etiqueta: 'Femenino', columnas: 1 }, /* … */],
      ],
      columnas: [{ seccion: 0, valores: { grupo_edad: 'MENOR_1', sexo: 'M' } }, /* … */],
      filas: [
        {
          dosis: 'D1', etiqueta: '1.ª dosis',
          celdas: [
            { claveCombinacion: 'grupo_edad=MENOR_1|sexo=M' },
            null,                    // la dosis no está en la sección de esa columna: se ve «—»
          ],
        },
      ],
    },
  ],
  procedencia: { modo: 'MUNICIPIO_DETALLADO', permiteNoEspecificado: true },
  camposAdicionales: [/* tal como vienen del esquema */],
  reglas: [{ codigo: 'CAMPOS_COMPLETOS', version: 1, severidadOverride: null }],
}
```

### Reglas para armar el formulario

- **Filas:** las dosis del esquema, en el `orden` de la vacuna. La etiqueta es el nombre de la dosis en la vacuna (`GET /vacunas/{id}`).
- **Tablas:** las dosis con `desagregacion: null` usan la general y van en la tabla `general`. Cada dosis con desagregación propia va en una tabla aparte, titulada con su nombre (como R1 de Td).
- **Columnas:** las secciones que tienen al menos una dosis de la tabla, en su orden, subdivididas por el producto de los valores de las dimensiones de esa desagregación, sin `grupo_edad`.
  - Las dimensiones y los valores van en el orden del catálogo (`orden`).
  - El encabezado de una dimensión es su `etiqueta` del esquema si la trae; si no, el `nombre` del catálogo.
  - Con una sola sección no hay nivel de secciones, como en `presentacion.columnas` (SPEC 19). Su título va encima de la tabla.
  - Sin otras dimensiones, cada sección es una columna.
- **Celdas:** una celda existe solo si su dosis está en la sección de la columna. Su `claveCombinacion` sigue la regla de `CONTEXTO BD.md`: las dimensiones ordenadas por código, `codigo=valor` unidas con `|`. Incluye `grupo_edad` si la sección tiene un `grupoEdad`. Queda `''` si la vacuna no desagrega.
- **Lo que no se puede armar se omite:**
  - un valor que no está en el catálogo;
  - una dosis que no está en la vacuna o en ninguna sección;
  - una sección sin dosis.

  Así el formulario se dibuja aunque el borrador tenga problemas; los problemas se listan aparte.
- **Totales** (los calcula `FormularioCaptura`, no `armarFormulario`): por fila, por columna y el general de cada tabla. Una celda vacía cuenta como 0.

### Campos del formulario

| Elemento | Comportamiento |
|---|---|
| Celda | `Input` numérico. Acepta solo enteros ≥ 0; otro valor muestra el borde de error y no suma. Las cifras van en IBM Plex Mono. |
| Celda inexistente | «—», sin campo. |
| Campo adicional `entero` / `decimal` | `Input` numérico con `minimo` y `maximo` si los trae. |
| Campo adicional `texto` | `Input`. |
| Campo adicional `booleano` | `Switch`. |
| Campo adicional `lista` | `Select` con sus `opciones`. |
| Campo adicional | Lleva su `etiqueta`, "(obligatorio)" si `requerido`, y su `ayuda` debajo. |

Las cantidades viven en un estado de React del componente. Se pierden al cerrar el Sheet y nunca se mandan a la API.

### Pantalla

**`VistaPreviaEsquema.jsx`** es un Sheet que se abre a la derecha y ocupa casi todo el ancho. Recibe `{ esquema, contenido, vacuna, dimensiones, problemas }`.

- **Encabezado:** "Vista previa · {vacuna}, versión {n}", con el Badge del estado ("Borrador", "Vigente" o "Histórica").
- **Aviso fijo** (Alert informativo): "Así verá el formulario el establecimiento. Los datos que escriba aquí no se guardan."
- **Problemas** (solo desde el editor, si `problemas` no está vacío): Alert de advertencia "Este borrador tiene {N} problemas; el formulario puede verse incompleto.", con la lista de los mensajes de `problemasDeCoherencia` (los mismos de la card «Problemas» del SPEC 19).
- **Tarjeta del formulario:**
  - título "Dosis aplicadas a residentes del municipio";
  - subtítulo "Formulario generado por el esquema de captura: {vacuna}, versión {n}" y, si tiene vigencia, ", vigente desde {DD/MM/AAAA}";
  - la franja celeste "Dimensiones de este esquema: Dosis · Grupo de edad · Sexo";
  - las tablas de `FormularioCaptura`.
- **Procedencia** (texto debajo de la tarjeta):
  - `MUNICIPIO_DETALLADO`: "Las dosis a personas de otros municipios se registran por municipio de procedencia.";
  - `PROPIO_Y_OTROS`: "Las dosis a personas de otros municipios se registran juntas, como en el 5C.";
  - si `permiteNoEspecificado`, se agrega: "Se admite procedencia no especificada.".
- **Campos adicionales:** una card "Datos adicionales", solo si hay.
- **Reglas:** una card "Validaciones que aplicará este esquema", con cada regla como "{codigo} · v{version}" y su severidad si la cambia. La nota dice "Las validaciones se ejecutan al capturar el reporte.".
- **Formulario vacío:** sin ninguna celda (por ejemplo, un borrador sin secciones), el formulario muestra "El esquema todavía no arma ninguna celda." en lugar de las tablas.
- **Botón "Cerrar".**

**Editor (`PaginaEditarEsquema.jsx`).**

- Botón "Vista previa" junto a "Guardar borrador".
- Usa el contenido actual del editor, con los cambios sin guardar, y los `camposAdicionales` y `reglas` del esquema cargado.
- Está habilitado aunque haya problemas, y le pasa a la vista previa los problemas de `problemasDeCoherencia`.
- Abrirla no guarda nada ni cambia el estado de «Guardar borrador».

**Versión (`PaginaVerEsquema.jsx`).**

- Botón "Vista previa" en la card "Versión {n}", con el contenido guardado.
- Usa las dimensiones sin filtro, como la vista en solo lectura (SPEC 20): una versión `HISTORICO` muestra las etiquetas de lo que ya está inactivo.
- No pasa problemas.

`EditorEsquema.jsx` expone el contenido actual al padre. Si ya lo hace para «Guardar y publicar» (SPEC 20), se reutiliza; si no, se agrega una prop `onCambio(contenido)` o una forma equivalente, sin cambiar su comportamiento.

Ninguna de las dos páginas pide un permiso nuevo: ya exigen `ESQUEMA_EDITAR` y `ESQUEMA_CONSULTAR`.

### Archivos que aparecen o cambian

```
frontend/src/
├── index.css                                  ← color de advertencia (decidido al implementar)
├── componentes/formulario/
│   ├── armarFormulario.js                     ← nuevo
│   ├── armarFormulario.test.js                ← nuevo
│   ├── FormularioCaptura.jsx                  ← nuevo
│   └── FormularioCaptura.test.jsx             ← nuevo
└── paginas/configuracion/
    ├── VistaPreviaEsquema.jsx                 ← nuevo
    ├── VistaPreviaEsquema.test.jsx            ← nuevo
    ├── EditorEsquema.jsx                      ← solo si hace falta exponer el contenido actual
    ├── PaginaEditarEsquema.jsx                ← botón "Vista previa"
    ├── PaginaEditarEsquema.test.jsx           ← casos nuevos
    ├── PaginaVerEsquema.jsx                   ← botón "Vista previa"
    └── PaginaVerEsquema.test.jsx              ← casos nuevos
docs/SPECS/HISTORIAS_DE_USUARIO.md             ← avance y criterios de HU-18; notas en HU-20 y HU-21
CLAUDE.md                                      ← nota de la vista previa
```

Usa componentes de shadcn que ya están en `components/ui/` (Sheet, Table, Input, Switch, Select, Card, Alert, Badge). No agrega dependencias.

## Plan de implementación

1. **`armarFormulario`.** La función pura y sus pruebas con esquemas armados a mano a partir de la semilla del 04:
   - Hexavalente v2: dos secciones (`MENOR_1`, `1_A_5`), D1 a D3, sin otras dimensiones. Da una tabla con dos columnas, tres filas y claves `grupo_edad=MENOR_1` y `grupo_edad=1_A_5`.
   - VPH: una sección sin `grupoEdad` y `sexo`. No hay nivel de secciones, y las claves son `sexo=M` y `sexo=F` en el orden del catálogo (Masculino primero aunque el esquema diga `["F", "M"]`).
   - BCG (`UNICA`, sin desagregación): una columna y clave `''`.
   - Una dosis con desagregación propia (como R1 de Td): va en su propia tabla.
   - Una dosis que no está en una sección: su celda de esa columna es `null`.
   - Dos dimensiones además de la edad: el producto ordenado por `orden`, y claves con las dimensiones ordenadas por código.
   - Un valor que no está en el catálogo, una dosis que no está en la vacuna y un esquema sin secciones: se omiten sin lanzar error.
   - La `etiqueta` de una desagregación del esquema reemplaza el nombre de la dimensión.

   Comprobación: `armarFormulario.test.js` pasa.

2. **`FormularioCaptura`.** El componente y sus pruebas:
   - dibuja los encabezados de varios niveles y «—» en las celdas inexistentes;
   - al escribir enteros, los totales por fila, por columna y el general cambian;
   - `-1`, `2.5` o letras muestran el error y no suman;
   - dibuja los campos adicionales según su tipo, con "(obligatorio)" y su ayuda;
   - sin celdas, muestra "El esquema todavía no arma ninguna celda.".

   Comprobación: `FormularioCaptura.test.jsx` pasa.

3. **`VistaPreviaEsquema`.** El Sheet y sus pruebas:
   - el encabezado con la versión y el Badge, el aviso fijo, la franja de dimensiones y el subtítulo con la vigencia (sin vigencia en un borrador);
   - el texto de la procedencia para los dos modos y para `permiteNoEspecificado`;
   - la lista de reglas, y la card de campos adicionales solo si hay;
   - con problemas, el Alert con la cantidad y cada mensaje; sin problemas, no aparece;
   - ningún mock de `src/api/` se llama al abrirla, escribir cantidades o cerrarla.

   Comprobación: `VistaPreviaEsquema.test.jsx` pasa.

4. **Botones en el editor y en la versión.** Pruebas:
   - en el editor, "Vista previa" muestra un cambio sin guardar (por ejemplo, una sección agregada aparece como columna) y no llama a `editarEsquema`;
   - con un problema de coherencia, el botón sigue habilitado y la vista previa lista el mensaje;
   - en la versión, "Vista previa" muestra el contenido guardado con su vigencia, y una versión `HISTORICO` con una dimensión inactiva muestra su etiqueta.

   Comprobación: `npm test` del frontend pasa completo.

5. **Verificación manual y documentación.** Con el backend contra Aiven y Atlas y Playwright (la persona inicia sesión a mano). No se guarda nada: el borrador Hexavalente v3 del 04 se abre en el editor sin guardar.
   - **Como Administrador:**
     - en la versión de Hexavalente v2, abrir la vista previa: columnas "< 1 año" y "De 1 a < 6 años", filas 1.ª a 3.ª dosis; escribir cantidades y ver los totales; cerrar y volver a abrir, con las cantidades vacías;
     - en la versión de VPH, ver las columnas por sexo; en la de Polio, por presentación; en la de Td, la tabla aparte de su refuerzo si la semilla la trae;
     - en el borrador Hexavalente v3, quitar una dosis de todas las secciones sin guardar, abrir la vista previa y ver el aviso con "La dosis … no aparece en ninguna sección."; salir sin guardar;
     - revisar en las peticiones de red de Playwright que abrir la vista previa y escribir cantidades no hace ninguna petición.
   - **Como Revisor:** abrir la vista previa de una versión.

   Documentación:
   - en HU-18, marcar los criterios y escribir su "Avance" con las diferencias de este spec;
   - en HU-20, la nota: "El formulario se arma con `armarFormulario` y se dibuja con `FormularioCaptura` (`componentes/formulario/`, SPEC 21), que ya calculan la `claveCombinacion` de cada celda y los totales; la captura agrega guardar, cargar las cantidades del reporte y las validaciones.";
   - en HU-21, la nota: "La vista previa (SPEC 21) solo describe el modo de procedencia; la tarjeta B se agrega a `FormularioCaptura`.";
   - en "Notas de contexto" de `CLAUDE.md`, una nota con lo esencial:
     - el formulario dinámico es `armarFormulario` + `FormularioCaptura` en `componentes/formulario/`;
     - la `claveCombinacion` sigue `CONTEXTO BD.md` y lo que no se puede armar se omite sin error;
     - la vista previa no llama a la API.

## Criterios de aceptación

- [ ] `npm test` pasa en `frontend/` sin desactivar ni quitar ninguna prueba.
- [ ] `backend/`, `backend/openapi.yaml`, `frontend/package.json` y `backend/package.json` no cambian.
- [ ] La vista previa muestra las secciones, las dosis y las dimensiones del esquema en una tabla con dosis en filas y secciones subdivididas por dimensiones en columnas, como la tarjeta A del mockup de Registro.
- [ ] Una celda solo existe si su dosis está en la sección de su columna; las demás se ven como «—».
- [ ] Una dosis con desagregación propia aparece en una tabla aparte.
- [ ] Cada celda tiene la `claveCombinacion` canónica de `CONTEXTO BD.md` (dimensiones ordenadas por código), y una vacuna sin desagregar da `''`.
- [ ] Los campos aceptan solo enteros ≥ 0, y los totales por fila, por columna y el general se calculan en pantalla.
- [ ] Abrir la vista previa, escribir cantidades y cerrarla no hace ninguna petición a la API, y al volver a abrirla las cantidades están vacías.
- [ ] Desde el editor, la vista previa muestra los cambios sin guardar. Si hay problemas de coherencia, se abre igual y lista cada problema.
- [ ] Desde `/configuracion/esquemas/:id`, la vista previa muestra cualquier versión, también una `HISTORICO` con valores inactivos.
- [ ] La vista previa muestra el modo de procedencia, los campos adicionales según su tipo y la lista de reglas con su versión.
- [ ] El Administrador y el Revisor pueden abrirla.
- [ ] Ningún componente propio tiene colores escritos a mano ni llama a `fetch` directamente.
- [ ] HU-18 tiene su avance y sus criterios marcados, HU-20 y HU-21 tienen su nota y `CLAUDE.md` tiene la nota.

## Decisiones

- **Sí:** el formulario se arma en el frontend con una función pura (`armarFormulario`) y un componente (`FormularioCaptura`) en `componentes/formulario/`, reutilizables por HU-20 (decidido en la fase de preguntas). Permite previsualizar los cambios sin guardar. **No:** un endpoint `GET /esquemas-captura/{id}/formulario`, que solo previsualiza lo guardado y obliga a guardar antes.
- **Sí:** la vista previa se abre desde el editor del borrador y desde la vista de cualquier versión (decidido en la fase de preguntas). **No:** solo el editor; **no:** una subruta propia, que pierde los cambios sin guardar.
- **Sí:** los campos se pueden llenar y los totales se calculan, sin guardar nada (decidido en la fase de preguntas). Así se prueba la tabla como la usará el establecimiento. **No:** campos deshabilitados, que no muestran si los totales cuadran.
- **Sí:** una tabla con las secciones como grupos de columnas, como el mockup y `presentacion.columnas` (decidido en la fase de preguntas). **No:** una tabla por sección.
- **Sí:** las dosis con desagregación propia van en una tabla aparte, porque sus columnas no coinciden con las de la general.
- **Sí:** de la procedencia solo se muestra una descripción del modo (decidido en la fase de preguntas). La tarjeta B es de HU-21. **No:** una tarjeta B de ejemplo; **no:** omitir la procedencia.
- **Sí:** se dibujan los campos adicionales y se listan las reglas (código y versión) sin ejecutarlas (decidido en la fase de preguntas). Ejecutarlas es de HU-22 y siguientes, y sus nombres necesitarían un endpoint de `reglas_validacion` que no existe.
- **Sí:** con problemas de coherencia, la vista previa se abre igual y lista cada problema con los mensajes del SPEC 19 (decidido en la fase de preguntas). Lo que no se puede armar se omite. **No:** deshabilitar el botón, que esconde lo que la historia quiere detectar.
- **Sí:** solo la tarjeta de la vacuna, sin pasos de estado, pestañas de vacunas ni botones de envío (decidido en la fase de preguntas). Esos son de HU-19 y HU-20.
- **Sí:** un Sheet a la derecha, que ya está en `components/ui/` y deja ver tablas anchas. **No:** un Dialog, que queda angosto para las tablas de varias dimensiones.
- **Sí:** el Revisor también la ve, como los demás permisos de esquemas. No hace falta un permiso nuevo, porque no hay endpoint nuevo.
- **Sí:** la vista previa no está en la pantalla de crear un borrador ni en la fila de la pestaña. Al crear todavía no hay campos adicionales ni reglas, y la fila no carga el contenido.
- **Sí:** las dimensiones y los valores van en el orden del catálogo, no en el del esquema, para que todas las vacunas muestren las columnas igual.

Decididas al implementar:

- **Sí:** cada tabla de `armarFormulario` trae `seccion`, el título de su única sección (`null` si tiene varias), para ponerlo encima de la tabla (paso 1).
- **Sí:** `armarFormulario.js` define su propio `GRUPO_EDAD`, para que un componente compartido no dependa de `paginas/configuracion/coherenciaEsquema.js` (paso 1).
- **Sí:** la API no devuelve la `etiqueta` de una desagregación, así que hoy la franja muestra siempre el `nombre` del catálogo; `armarFormulario` ya la usa si viene. Agregarla a `GET /esquemas-captura/{id}` va en el spec de HU-19, hecho y probado antes de HU-20 (nota en HU-19). **No:** cambiar el backend en este spec, que es solo de frontend (paso 1).
- **Sí:** `FormularioCaptura.jsx` exporta además `CamposAdicionales`, para que la vista previa ponga los campos en su card «Datos adicionales» sin anidarla en la del formulario. Cada uno guarda sus valores en su propio estado (paso 2).
- **Sí:** el aviso de problemas usa el color nuevo de advertencia del tema, `--advertencia` (#fff5dd) y `--advertencia-foreground` (#7a4a06) en `index.css`, tomados del recuadro de advertencias de `Registro.html` («advertencia en ámbar» del estilo general). El tema no tenía uno, y HU-20 lo reutiliza para las advertencias de validación. **No:** el tono `destructive` atenuado del editor, que confunde un aviso con un error (paso 3).
- **Sí:** `VistaPreviaEsquema` recibe además `abierta` y `alCambiarAbierta`, y cada página la monta solo mientras está abierta, así que no recalcula el formulario en cada cambio del editor (pasos 3 y 4).
- **Sí:** `EditorEsquema.jsx` agrega la prop `onVistaPrevia(contenido, problemas)` y dibuja «Vista previa» en su pie, junto a «Guardar borrador». No había otra forma de leer el contenido sin guardar: `onPublicar` solo lo entrega al publicar. Los problemas que pasa son los de la card «Problemas», que incluyen los errores de título de sección (paso 4).
- **Sí:** en `/configuracion/esquemas/:id`, «Vista previa» va como `CardAction` en la card "Versión {n}" (paso 4).
- **Sí:** una celda es un `Input` de texto con `inputMode="numeric"`, no `type="number"`, para conservar lo que se escribe (`2.5`, letras) y marcarlo con `aria-invalid` (paso 2).

## Riesgos

| Riesgo | Mitigación |
|---|---|
| HU-20 necesita algo que `armarFormulario` no da (cantidades guardadas, procedencia, errores por celda) | Cada celda ya lleva `dosis` y `claveCombinacion`, que son la llave de `detalle_produccion`. La nota de HU-20 dice qué falta agregar. |
| La `claveCombinacion` del frontend no coincide con la que guardará el backend en HU-20 | Sigue la regla de `CONTEXTO BD.md` y tiene pruebas. HU-20 debe usar la misma regla en el backend (queda en su nota). |
| Un borrador con muchos valores en varias dimensiones arma una tabla muy ancha | El Sheet ocupa casi todo el ancho y la tabla se desplaza horizontalmente. El límite de 255 caracteres de la combinación (SPEC 19) acota el producto. |
| Una versión publicada usa una dimensión o un valor que ya no está en el catálogo | La versión usa las dimensiones sin filtro; lo que no aparece se omite sin error. |
| Alguien guarda el borrador Hexavalente v3 del 04 durante la prueba manual | La verificación sale del editor sin guardar. |

## Lo que **no** entra en este spec

- Cambios en el backend, el contrato, los permisos o la base de datos.
- La tarjeta B de otros municipios (HU-21).
- Ejecutar reglas de validación y mostrar sus nombres.
- Pasos de estado, pestañas de vacunas y botones de envío del Registro.
- Guardar o cargar cantidades de un reporte (HU-20).
- Vista previa al crear un borrador o desde la fila de la pestaña.
- Editar campos adicionales o reglas.

Cada uno, si se hace, va en su propio spec.
