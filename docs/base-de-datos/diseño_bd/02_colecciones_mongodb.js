// =============================================================================
//  Plataforma web de producción de vacunación — DDRISS San Marcos (MSPAS)
//  Diseño preliminar de colecciones MongoDB (MongoDB 7.x, ejecutar con mongosh)
//  Versión: 0.3 (propuesta para revisión)   Fecha: 2026-10-10
//  Cambios v0.3 (modelo preparado para varias DDRISS, igual que MySQL v0.5):
//  reglas_validacion y configuracion_indicadores agregan "territorio"
//  (NACIONAL o una DDRISS). Una versión vigente de una DDRISS prevalece sobre
//  la nacional del mismo código. Las semillas son todas NACIONAL; el proyecto
//  solo opera la DDRISS San Marcos. catalogo_dimensiones y esquemas_captura no
//  cambian, porque el formulario 5C es nacional.
//  Cambios v0.2: nueva colección catalogo_dimensiones; cada esquema de captura
//  declara sus propias dimensiones de desagregación (sexo, grupo de edad,
//  embarazo u otras nuevas) en lugar de usar sexo y grupo de edad fijos.
//
//  Alcance de este motor (sección 5.2 del documento de contexto):
//    1. catalogo_dimensiones      -> dimensiones de desagregación y sus valores
//    2. esquemas_captura          -> esquemas de captura por vacuna, versionados,
//                                    con las dimensiones que usa cada vacuna
//    3. reglas_validacion         -> reglas de validación configurables
//    4. configuracion_indicadores -> numerador, denominador, meta, periodicidad,
//                                    regla de atribución de cada indicador
//
//  Principios:
//    - MongoDB guarda CONFIGURACIÓN, nunca producción ni datos de pacientes.
//    - Las reglas e indicadores son DECLARATIVOS (tipo + parámetros); el backend
//      Node/Express los interpreta. No se almacena código ejecutable.
//    - Cada cambio crea un documento NUEVO con version+1; un documento con
//      estado VIGENTE o HISTORICO no se modifica (inmutabilidad de versiones).
//    - La unión con MySQL se hace por llaves estables: vacuna.codigo, dosis.codigo
//      y clasificacion_poblacion.codigo; en sentido inverso MySQL guarda el
//      ObjectId y el número de versión usados, y detalle_dimension guarda los
//      códigos de dimensión y valor definidos en catalogo_dimensiones.
//
//  Uso:  mongosh "mongodb://localhost:27017" 02_colecciones_mongodb.js
// =============================================================================

const db_ = db.getSiblingDB("vacunacion_config");
db_.dropDatabase();

// Subesquema reutilizable: vigencia de una versión
const vigencia = {
  bsonType: "object",
  required: ["desde"],
  properties: {
    desde: { bsonType: "date" },
    hasta: { bsonType: ["date", "null"], description: "null = vigente sin fecha de fin" }
  }
};

// Subesquema reutilizable: metadatos de auditoría (usuario_id es el id de MySQL)
const auditoria = {
  bsonType: "object",
  required: ["creado_por", "creado_en"],
  properties: {
    creado_por:    { bsonType: "int" },
    creado_en:     { bsonType: "date" },
    publicado_por: { bsonType: ["int", "null"] },
    publicado_en:  { bsonType: ["date", "null"] },
    motivo_cambio: { bsonType: ["string", "null"] }
  }
};

const estadoVersion = { enum: ["BORRADOR", "VIGENTE", "HISTORICO"] };

// Subesquema reutilizable: territorio al que aplica una regla o indicador.
// NACIONAL aplica a todas las DDRISS; DDRISS aplica solo a la indicada
// (ddriss_codigo = ddriss.codigo de MySQL, p. ej. "DDRISS_SM").
// Resolución en el backend: para una DDRISS se usa la versión VIGENTE con su
// ddriss_codigo si existe; si no, la VIGENTE NACIONAL del mismo código.
const territorio = {
  bsonType: "object",
  required: ["nivel", "ddriss_codigo"],
  properties: {
    nivel:         { enum: ["NACIONAL", "DDRISS"] },
    ddriss_codigo: { bsonType: ["string", "null"], description: "null cuando nivel = NACIONAL" }
  }
};

// -----------------------------------------------------------------------------
// 1. catalogo_dimensiones
//    Catálogo de dimensiones de desagregación reutilizables entre vacunas.
//    Agregar una dimensión nueva (p. ej. "pueblo" o "estado_embarazo") es
//    insertar un documento; agregar un valor es añadirlo al arreglo "valores".
//    Los valores no se borran ni se renombran: se desactivan (activo: false),
//    para que los códigos guardados en MySQL (detalle_dimension) sigan siendo
//    válidos. Cada cambio se registra en la bitácora de MySQL.
// -----------------------------------------------------------------------------
db_.createCollection("catalogo_dimensiones", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["codigo", "nombre", "tipo", "valores", "activo", "auditoria"],
      properties: {
        codigo: { bsonType: "string", pattern: "^[a-z][a-z0-9_]*$", description: "Llave usada en detalle_dimension.dimension_codigo" },
        nombre: { bsonType: "string" },
        descripcion: { bsonType: "string" },
        tipo: { enum: ["CATEGORICA", "RANGO_EDAD"], description: "RANGO_EDAD exige edad_min_meses/edad_max_meses en cada valor" },
        valores: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["codigo", "etiqueta", "activo"],
            properties: {
              codigo:         { bsonType: "string", pattern: "^[A-Z0-9_]+$" },
              etiqueta:       { bsonType: "string" },
              orden:          { bsonType: "int" },
              edad_min_meses: { bsonType: ["int", "null"] },
              edad_max_meses: { bsonType: ["int", "null"] },
              activo:         { bsonType: "bool" }
            }
          }
        },
        activo: { bsonType: "bool" },
        auditoria: auditoria
      }
    }
  }
});
db_.catalogo_dimensiones.createIndex({ codigo: 1 }, { unique: true, name: "uq_dimension_codigo" });

// -----------------------------------------------------------------------------
// 2. esquemas_captura
//    Define, para una vacuna y una versión, qué se captura: sus dosis, la
//    procedencia y LAS DIMENSIONES DE DESAGREGACIÓN QUE USA ESA VACUNA (con el
//    subconjunto de valores permitido), además de campos adicionales y reglas.
//    Las filas del formulario son el producto dosis x valores de cada
//    dimensión; una dosis puede restringir o quitar dimensiones. El formulario
//    de React se genera a partir de este documento.
// -----------------------------------------------------------------------------
db_.createCollection("esquemas_captura", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["vacuna", "version", "estado", "vigencia", "dimensiones", "reglas", "auditoria"],
      properties: {
        vacuna: {
          bsonType: "object",
          required: ["id", "codigo"],
          properties: {
            id:     { bsonType: "int", description: "vacuna.id en MySQL" },
            codigo: { bsonType: "string", description: "vacuna.codigo en MySQL" },
            nombre: { bsonType: "string" }
          }
        },
        version:  { bsonType: "int", minimum: 1 },
        estado:   estadoVersion,
        vigencia: vigencia,
        version_anterior_id: { bsonType: ["objectId", "null"] },
        dimensiones: {
          bsonType: "object",
          required: ["dosis", "procedencia", "desagregacion"],
          properties: {
            dosis: {
              bsonType: "array",
              minItems: 1,
              items: {
                bsonType: "object",
                required: ["codigo"],
                properties: {
                  codigo:   { bsonType: "string", description: "dosis.codigo en MySQL" },
                  etiqueta: { bsonType: "string" },
                  desagregacion: {
                    bsonType: "array",
                    description: "Opcional: reemplaza la desagregación general solo para esta dosis ([] = sin desagregar)"
                  }
                }
              }
            },
            procedencia: {
              bsonType: "object",
              required: ["modo"],
              properties: {
                modo: {
                  enum: ["MUNICIPIO_DETALLADO", "PROPIO_Y_OTROS"],
                  description: "MUNICIPIO_DETALLADO: se elige el municipio de procedencia; PROPIO_Y_OTROS: réplica del 5C (propio vs. otros)"
                },
                permite_no_especificado: { bsonType: "bool" }
              }
            },
            desagregacion: {
              bsonType: "array",
              description: "Dimensiones que usa esta vacuna; [] si solo se reporta el total por dosis",
              items: {
                bsonType: "object",
                required: ["dimension", "valores"],
                properties: {
                  dimension: { bsonType: "string", description: "catalogo_dimensiones.codigo" },
                  valores:   { bsonType: "array", minItems: 1, items: { bsonType: "string" }, description: "Subconjunto de valores del catálogo" },
                  etiqueta:  { bsonType: "string", description: "Texto a mostrar si difiere del catálogo" }
                }
              }
            }
          }
        },
        campos_adicionales: {
          bsonType: "array",
          items: {
            bsonType: "object",
            required: ["clave", "etiqueta", "tipo", "requerido"],
            properties: {
              clave:     { bsonType: "string", pattern: "^[a-z][a-z0-9_]*$" },
              etiqueta:  { bsonType: "string" },
              tipo:      { enum: ["entero", "decimal", "texto", "booleano", "lista"] },
              requerido: { bsonType: "bool" },
              minimo:    { bsonType: ["int", "double", "null"] },
              maximo:    { bsonType: ["int", "double", "null"] },
              opciones:  { bsonType: "array" },
              ayuda:     { bsonType: "string" }
            }
          }
        },
        reglas: {
          bsonType: "array",
          description: "Reglas de reglas_validacion que aplica esta versión",
          items: {
            bsonType: "object",
            required: ["codigo", "version"],
            properties: {
              codigo: { bsonType: "string" },
              version: { bsonType: "int" },
              severidad_override: { enum: ["ERROR", "ADVERTENCIA", null] }
            }
          }
        },
        presentacion: { bsonType: "object" },
        auditoria: auditoria
      }
    }
  },
  validationLevel: "strict",
  validationAction: "error"
});

db_.esquemas_captura.createIndex({ "vacuna.codigo": 1, version: 1 }, { unique: true, name: "uq_vacuna_version" });
// Solo una versión VIGENTE por vacuna
db_.esquemas_captura.createIndex(
  { "vacuna.codigo": 1 },
  { unique: true, partialFilterExpression: { estado: "VIGENTE" }, name: "uq_vigente_por_vacuna" }
);
db_.esquemas_captura.createIndex({ "vacuna.codigo": 1, "vigencia.desde": -1 }, { name: "ix_vigencia" });

// -----------------------------------------------------------------------------
// 3. reglas_validacion
//    Catálogo de reglas declarativas. "tipo" selecciona el validador que el
//    backend ya implementa; "parametros" lo configura. "severidad" decide si
//    bloquea el envío (ERROR) o solo exige revisión (ADVERTENCIA).
// -----------------------------------------------------------------------------
db_.createCollection("reglas_validacion", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["codigo", "version", "nombre", "tipo", "ambito", "severidad", "mensaje", "territorio", "estado", "vigencia", "auditoria"],
      properties: {
        codigo:      { bsonType: "string", pattern: "^[A-Z0-9_]+$" },
        version:     { bsonType: "int", minimum: 1 },
        nombre:      { bsonType: "string" },
        descripcion: { bsonType: "string" },
        tipo: {
          enum: [
            "CAMPOS_COMPLETOS",     // todas las combinaciones del esquema tienen valor
            "NO_NEGATIVO",          // cantidades >= 0
            "TOTAL_CUADRA",         // suma del detalle = total declarado
            "SIN_DUPLICADOS",       // un reporte por establecimiento y periodo
            "SECUENCIA_DOSIS",      // dosis posterior no supera a la anterior en X %
            "VARIACION_HISTORICA",  // variación frente al promedio de meses anteriores
            "RANGO",                // valor dentro de un mínimo y máximo
            "PROCEDENCIA_VALIDA",   // municipio de procedencia existe y está activo
            "DIMENSIONES_VALIDAS"   // dimensiones y valores del detalle coinciden con el esquema
          ]
        },
        ambito:     { enum: ["DETALLE", "VACUNA", "REPORTE"] },
        severidad:  { enum: ["ERROR", "ADVERTENCIA"] },
        aplica_a: {
          bsonType: "object",
          properties: {
            vacunas: { bsonType: "array", items: { bsonType: "string" }, description: "['*'] = todas" }
          }
        },
        parametros: { bsonType: "object" },
        mensaje:    { bsonType: "string", description: "Plantilla con marcadores {vacuna}, {dosis}, {valor}..." },
        territorio: territorio,
        estado:     estadoVersion,
        vigencia:   vigencia,
        auditoria:  auditoria
      }
    }
  }
});

// (codigo, version) sigue siendo único en todo el país: MySQL guarda
// regla_codigo + regla_version y con eso identifica la versión sin ambigüedad.
db_.reglas_validacion.createIndex({ codigo: 1, version: 1 }, { unique: true, name: "uq_regla_version" });
// Una sola versión VIGENTE por código y territorio (una nacional y, si hace
// falta, una por DDRISS).
db_.reglas_validacion.createIndex(
  { codigo: 1, "territorio.nivel": 1, "territorio.ddriss_codigo": 1 },
  { unique: true, partialFilterExpression: { estado: "VIGENTE" }, name: "uq_regla_vigente_territorio" }
);
db_.reglas_validacion.createIndex({ "aplica_a.vacunas": 1, estado: 1 }, { name: "ix_regla_vacuna" });

// -----------------------------------------------------------------------------
// 4. configuracion_indicadores
//    Dice CÓMO calcular cada indicador; el cálculo lo ejecuta el backend y
//    guarda el resultado en MySQL (resultado_indicador).
// -----------------------------------------------------------------------------
db_.createCollection("configuracion_indicadores", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["codigo", "version", "nombre", "tipo_calculo", "aplica_a", "periodicidad", "territorio", "estado", "vigencia", "auditoria"],
      properties: {
        codigo:       { bsonType: "string", pattern: "^[A-Z0-9_]+$" },
        version:      { bsonType: "int", minimum: 1 },
        nombre:       { bsonType: "string" },
        descripcion:  { bsonType: "string" },
        tipo_calculo: { enum: ["COBERTURA", "BRECHA", "DESERCION", "PROYECCION"] },
        aplica_a: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["vacuna"],
            properties: {
              vacuna:                  { bsonType: "string" },
              dosis:                   { bsonType: ["string", "null"] },
              dosis_inicial:           { bsonType: ["string", "null"] },
              dosis_final:             { bsonType: ["string", "null"] },
              clasificacion_poblacion: { bsonType: ["string", "null"] },
              filtros_dimension: {
                bsonType: "object",
                description: "Filtro sobre dimensiones dinámicas: { grupo_edad: ['MENOR_1'] }"
              }
            }
          }
        },
        numerador: {
          bsonType: "object",
          properties: {
            fuente:      { enum: ["PRODUCCION", "INDICADOR"] },
            estados_reporte: { bsonType: "array", items: { bsonType: "string" } },
            atribucion:  { enum: ["PROCEDENCIA", "APLICACION"], description: "Regla de atribución territorial" },
            acumulado:   { enum: ["MENSUAL", "ANUAL"] }
          }
        },
        denominador: {
          bsonType: "object",
          properties: {
            fuente:   { enum: ["POBLACION_OBJETIVO", "PRODUCCION", "INDICADOR"] },
            prorrateo: { enum: ["NINGUNO", "MENSUAL_LINEAL"], description: "MENSUAL_LINEAL: población / 12 x meses transcurridos" }
          }
        },
        meta: {
          bsonType: "object",
          properties: {
            valor:      { bsonType: ["int", "double"] },
            unidad:     { enum: ["PORCENTAJE", "DOSIS"] },
            comparador: { enum: [">", ">=", "<", "<="] },
            homogeneidad_municipal: { bsonType: "bool" }
          }
        },
        umbrales: { bsonType: "array", description: "Semáforo para tablero y mapa" },
        parametros:   { bsonType: "object" },
        niveles:      { bsonType: "array", items: { enum: ["MUNICIPIO", "DEPARTAMENTO", "ESTABLECIMIENTO"] } },
        periodicidad: { enum: ["MENSUAL", "TRIMESTRAL", "ANUAL"] },
        alerta: {
          bsonType: "object",
          properties: {
            generar: { bsonType: "bool" },
            tipo:    { enum: ["COBERTURA_BAJO_META", "CALIDAD", "PROCESO"] },
            rol_destino: { bsonType: "array", items: { bsonType: "string" } }
          }
        },
        es_estimacion: { bsonType: "bool", description: "TRUE: el resultado se muestra como proyección" },
        territorio: territorio,
        estado:    estadoVersion,
        vigencia:  vigencia,
        auditoria: auditoria
      }
    }
  }
});

db_.configuracion_indicadores.createIndex({ codigo: 1, version: 1 }, { unique: true, name: "uq_indicador_version" });
db_.configuracion_indicadores.createIndex(
  { codigo: 1, "territorio.nivel": 1, "territorio.ddriss_codigo": 1 },
  { unique: true, partialFilterExpression: { estado: "VIGENTE" }, name: "uq_indicador_vigente_territorio" }
);
db_.configuracion_indicadores.createIndex({ "aplica_a.vacuna": 1, estado: 1 }, { name: "ix_indicador_vacuna" });

// =============================================================================
// DOCUMENTOS DE EJEMPLO
// =============================================================================

const ahora = new Date("2026-10-01T00:00:00Z");
const auditoriaEjemplo = { creado_por: NumberInt(1), creado_en: ahora, publicado_por: NumberInt(1), publicado_en: ahora, motivo_cambio: null };
// Todas las reglas e indicadores de ejemplo son nacionales.
const territorioNacional = { nivel: "NACIONAL", ddriss_codigo: null };
const conTerritorioNacional = (doc) => ({ ...doc, territorio: territorioNacional });

// --- Catálogo de dimensiones ---------------------------------------------------
db_.catalogo_dimensiones.insertMany([
  {
    codigo: "sexo", nombre: "Sexo", tipo: "CATEGORICA", activo: true,
    valores: [
      { codigo: "M", etiqueta: "Masculino", orden: NumberInt(1), activo: true },
      { codigo: "F", etiqueta: "Femenino",  orden: NumberInt(2), activo: true }
    ],
    auditoria: auditoriaEjemplo
  },
  {
    codigo: "grupo_edad", nombre: "Grupo de edad", tipo: "RANGO_EDAD", activo: true,
    valores: [
      { codigo: "MENOR_1", etiqueta: "Menor de 1 año", orden: NumberInt(1), edad_min_meses: NumberInt(0),   edad_max_meses: NumberInt(12),  activo: true },
      { codigo: "1_ANIO",  etiqueta: "1 año",          orden: NumberInt(2), edad_min_meses: NumberInt(12),  edad_max_meses: NumberInt(24),  activo: true },
      { codigo: "2_4",     etiqueta: "2 a 4 años",     orden: NumberInt(3), edad_min_meses: NumberInt(24),  edad_max_meses: NumberInt(60),  activo: true },
      { codigo: "10_14",   etiqueta: "10 a 14 años",   orden: NumberInt(4), edad_min_meses: NumberInt(120), edad_max_meses: NumberInt(180), activo: true },
      { codigo: "15_49",   etiqueta: "15 a 49 años",   orden: NumberInt(5), edad_min_meses: NumberInt(180), edad_max_meses: NumberInt(600), activo: true }
    ],
    auditoria: auditoriaEjemplo
  },
  {
    codigo: "estado_embarazo", nombre: "Estado de embarazo", tipo: "CATEGORICA", activo: true,
    descripcion: "Solo para vacunas que se aplican a mujeres en edad fértil.",
    valores: [
      { codigo: "EMBARAZADA",    etiqueta: "Embarazada",    orden: NumberInt(1), activo: true },
      { codigo: "NO_EMBARAZADA", etiqueta: "No embarazada", orden: NumberInt(2), activo: true }
    ],
    auditoria: auditoriaEjemplo
  }
]);

// --- Reglas de validación ----------------------------------------------------
db_.reglas_validacion.insertMany([
  {
    codigo: "CAMPOS_COMPLETOS", version: NumberInt(1), nombre: "Campos completos",
    descripcion: "Toda combinación dosis x valores de dimensiones definida por el esquema debe tener un valor (0 si no hubo dosis).",
    tipo: "CAMPOS_COMPLETOS", ambito: "VACUNA", severidad: "ERROR",
    aplica_a: { vacunas: ["*"] }, parametros: { cero_explicito: true },
    mensaje: "Faltan valores en {vacuna}: {n_faltantes} combinaciones sin registrar.",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  },
  {
    codigo: "DIMENSIONES_VALIDAS", version: NumberInt(1), nombre: "Dimensiones acordes al esquema",
    descripcion: "Cada fila de detalle trae exactamente las dimensiones que el esquema (y la dosis) exige, con valores activos del catálogo.",
    tipo: "DIMENSIONES_VALIDAS", ambito: "DETALLE", severidad: "ERROR",
    aplica_a: { vacunas: ["*"] }, parametros: {},
    mensaje: "La fila de {vacuna} {dosis} tiene dimensiones que no corresponden a la versión {version} del esquema.",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  },
  {
    codigo: "NO_NEGATIVO", version: NumberInt(1), nombre: "Cantidades no negativas",
    tipo: "NO_NEGATIVO", ambito: "DETALLE", severidad: "ERROR",
    aplica_a: { vacunas: ["*"] }, parametros: {},
    mensaje: "La cantidad de {vacuna} {dosis} no puede ser negativa.",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  },
  {
    codigo: "TOTAL_CUADRA", version: NumberInt(1), nombre: "El total cuadra con el detalle",
    tipo: "TOTAL_CUADRA", ambito: "VACUNA", severidad: "ERROR",
    aplica_a: { vacunas: ["*"] }, parametros: { tolerancia: 0 },
    mensaje: "El total declarado de {vacuna} ({total}) no coincide con la suma del detalle ({suma}).",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  },
  {
    codigo: "SECUENCIA_DOSIS", version: NumberInt(1), nombre: "Coherencia entre dosis sucesivas",
    descripcion: "Advierte cuando una dosis posterior supera de forma notable a la anterior en el mismo mes.",
    tipo: "SECUENCIA_DOSIS", ambito: "VACUNA", severidad: "ADVERTENCIA",
    aplica_a: { vacunas: ["PENTA", "SPR"] }, parametros: { exceso_permitido_pct: 20 },
    mensaje: "{dosis_posterior} de {vacuna} supera a {dosis_anterior} en más de {exceso_permitido_pct} %.",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  },
  {
    codigo: "VARIACION_HISTORICA", version: NumberInt(1), nombre: "Variación atípica frente al historial",
    tipo: "VARIACION_HISTORICA", ambito: "VACUNA", severidad: "ADVERTENCIA",
    aplica_a: { vacunas: ["*"] }, parametros: { meses_referencia: 3, variacion_max_pct: 50, minimo_dosis: 10 },
    mensaje: "La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.",
    estado: "VIGENTE", vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
  }
].map(conTerritorioNacional));

// --- Esquemas de captura (Pentavalente: versión 1 histórica y versión 2 vigente)
const penta_v1 = ObjectId("66f8a1c2e4b0a1b2c3d4e5f5");
const penta_v2 = ObjectId("66f8a1c2e4b0a1b2c3d4e5f6"); // el mismo id que usa el ejemplo de reporte_vacuna en MySQL

db_.esquemas_captura.insertMany([
  {
    _id: penta_v1,
    vacuna: { id: NumberInt(2), codigo: "PENTA", nombre: "Pentavalente (DPT-HepB-Hib)" },
    version: NumberInt(1), estado: "HISTORICO",
    vigencia: { desde: new Date("2026-01-01"), hasta: new Date("2026-09-30") },
    version_anterior_id: null,
    dimensiones: {
      dosis: [
        { codigo: "D1", etiqueta: "1.ª dosis" },
        { codigo: "D2", etiqueta: "2.ª dosis" },
        { codigo: "D3", etiqueta: "3.ª dosis" }
      ],
      procedencia: { modo: "PROPIO_Y_OTROS", permite_no_especificado: true },
      desagregacion: [
        { dimension: "sexo",       valores: ["M", "F"] },
        { dimension: "grupo_edad", valores: ["MENOR_1"] }
      ]
    },
    campos_adicionales: [],
    reglas: [
      { codigo: "CAMPOS_COMPLETOS", version: NumberInt(1) },
      { codigo: "NO_NEGATIVO", version: NumberInt(1) }
    ],
    presentacion: { filas: "dosis", columnas: ["grupo_edad", "sexo"] },
    auditoria: auditoriaEjemplo
  },
  {
    _id: penta_v2,
    vacuna: { id: NumberInt(2), codigo: "PENTA", nombre: "Pentavalente (DPT-HepB-Hib)" },
    version: NumberInt(2), estado: "VIGENTE",
    vigencia: { desde: new Date("2026-10-01"), hasta: null },
    version_anterior_id: penta_v1,
    dimensiones: {
      dosis: [
        { codigo: "D1", etiqueta: "1.ª dosis" },
        { codigo: "D2", etiqueta: "2.ª dosis" },
        { codigo: "D3", etiqueta: "3.ª dosis" }
      ],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [
        { dimension: "sexo",       valores: ["M", "F"] },
        { dimension: "grupo_edad", valores: ["MENOR_1", "1_ANIO"] }
      ]
    },
    campos_adicionales: [
      { clave: "total_dosis_declarado", etiqueta: "Total de dosis aplicadas (según registro del establecimiento)",
        tipo: "entero", requerido: true, minimo: NumberInt(0), maximo: null,
        ayuda: "Se contrasta con la suma del detalle mediante la regla TOTAL_CUADRA." }
    ],
    reglas: [
      { codigo: "CAMPOS_COMPLETOS",    version: NumberInt(1) },
      { codigo: "NO_NEGATIVO",         version: NumberInt(1) },
      { codigo: "TOTAL_CUADRA",        version: NumberInt(1) },
      { codigo: "SECUENCIA_DOSIS",     version: NumberInt(1) },
      { codigo: "VARIACION_HISTORICA", version: NumberInt(1) }
    ],
    presentacion: { filas: "dosis", columnas: ["grupo_edad", "sexo"], subtabla_por: "procedencia" },
    auditoria: { ...auditoriaEjemplo, motivo_cambio: "Se agrega el grupo de 1 año (esquema tardío) y la procedencia por municipio." }
  }
]);

// --- Esquemas con dimensiones distintas ----------------------------------------
// BCG: solo sexo, sin grupo de edad (dosis única al nacer).
// Td:  sin sexo; se desagrega por embarazo y grupo de edad, y el refuerzo R1
//      solo se reporta por grupo de edad (ejemplo de restricción por dosis).
db_.esquemas_captura.insertMany([
  {
    _id: ObjectId("66f8a1c2e4b0a1b2c3d4e600"),
    vacuna: { id: NumberInt(1), codigo: "BCG", nombre: "BCG" },
    version: NumberInt(1), estado: "VIGENTE",
    vigencia: { desde: new Date("2026-10-01"), hasta: null },
    version_anterior_id: null,
    dimensiones: {
      dosis: [{ codigo: "UNICA", etiqueta: "Dosis única" }],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [
        { dimension: "sexo", valores: ["M", "F"] }
      ]
    },
    campos_adicionales: [],
    reglas: [
      { codigo: "CAMPOS_COMPLETOS", version: NumberInt(1) },
      { codigo: "NO_NEGATIVO", version: NumberInt(1) }
    ],
    presentacion: { filas: "dosis", columnas: ["sexo"] },
    auditoria: auditoriaEjemplo
  },
  {
    _id: ObjectId("66f8a1c2e4b0a1b2c3d4e601"),
    vacuna: { id: NumberInt(4), codigo: "TD", nombre: "Toxoide tetánico y diftérico (Td)" },
    version: NumberInt(1), estado: "VIGENTE",
    vigencia: { desde: new Date("2026-10-01"), hasta: null },
    version_anterior_id: null,
    dimensiones: {
      dosis: [
        { codigo: "D1", etiqueta: "1.ª dosis" },
        { codigo: "D2", etiqueta: "2.ª dosis" },
        { codigo: "R1", etiqueta: "1.er refuerzo",
          desagregacion: [ { dimension: "grupo_edad", valores: ["10_14", "15_49"] } ] }
      ],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [
        { dimension: "estado_embarazo", valores: ["EMBARAZADA", "NO_EMBARAZADA"] },
        { dimension: "grupo_edad",      valores: ["10_14", "15_49"] }
      ]
    },
    campos_adicionales: [],
    reglas: [
      { codigo: "CAMPOS_COMPLETOS", version: NumberInt(1) },
      { codigo: "NO_NEGATIVO", version: NumberInt(1) }
    ],
    presentacion: { filas: "dosis", columnas: ["estado_embarazo", "grupo_edad"] },
    auditoria: auditoriaEjemplo
  }
]);

// --- Configuración de indicadores ---------------------------------------------
const baseIndicador = {
  version: NumberInt(1), periodicidad: "MENSUAL", estado: "VIGENTE",
  territorio: territorioNacional,
  niveles: ["MUNICIPIO", "DEPARTAMENTO"],
  vigencia: { desde: new Date("2026-01-01"), hasta: null }, auditoria: auditoriaEjemplo
};

db_.configuracion_indicadores.insertMany([
  {
    ...baseIndicador,
    codigo: "COB_PENTA3", nombre: "Cobertura de Pentavalente 3.ª dosis en menores de 1 año",
    tipo_calculo: "COBERTURA",
    aplica_a: [{ vacuna: "PENTA", dosis: "D3", clasificacion_poblacion: "MENOR_1", filtros_dimension: { grupo_edad: ["MENOR_1"] } }],
    numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
    denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "MENSUAL_LINEAL" },
    meta: { valor: 95, unidad: "PORCENTAJE", comparador: ">", homogeneidad_municipal: true },
    umbrales: [
      { color: "verde",    desde: 95, hasta: null },
      { color: "amarillo", desde: 80, hasta: 95 },
      { color: "rojo",     desde: 0,  hasta: 80 }
    ],
    alerta: { generar: true, tipo: "COBERTURA_BAJO_META", rol_destino: ["EPIDEMIOLOGIA", "REVISOR"] },
    es_estimacion: false
  },
  {
    ...baseIndicador,
    codigo: "BRECHA_PENTA3", nombre: "Brecha de Pentavalente 3.ª dosis",
    descripcion: "Dosis aproximadas que faltan para alcanzar la meta: ceil(meta x denominador) - numerador.",
    tipo_calculo: "BRECHA",
    aplica_a: [{ vacuna: "PENTA", dosis: "D3", clasificacion_poblacion: "MENOR_1", filtros_dimension: { grupo_edad: ["MENOR_1"] } }],
    numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
    denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "NINGUNO" },
    meta: { valor: 95, unidad: "PORCENTAJE", comparador: ">" },
    parametros: { redondeo: "ARRIBA", minimo_cero: true },
    es_estimacion: false
  },
  {
    ...baseIndicador,
    codigo: "DES_PENTA1_3", nombre: "Tasa de deserción Pentavalente 1.ª a 3.ª dosis",
    descripcion: "(D1 - D3) / D1 x 100, acumulado en el año.",
    tipo_calculo: "DESERCION",
    aplica_a: [{ vacuna: "PENTA", dosis_inicial: "D1", dosis_final: "D3", filtros_dimension: { grupo_edad: ["MENOR_1"] } }],
    numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
    denominador: { fuente: "PRODUCCION" },
    meta: { valor: 10, unidad: "PORCENTAJE", comparador: "<=" },
    umbrales: [
      { color: "verde", desde: null, hasta: 10 },
      { color: "rojo",  desde: 10,   hasta: null }
    ],
    alerta: { generar: true, tipo: "COBERTURA_BAJO_META", rol_destino: ["EPIDEMIOLOGIA"] },
    es_estimacion: false
  },
  {
    ...baseIndicador,
    codigo: "PROY_COB_PENTA3", nombre: "Proyección de cobertura anual de Pentavalente 3.ª dosis",
    descripcion: "Proyecta la cobertura al cierre del año con el ritmo mensual promedio observado.",
    tipo_calculo: "PROYECCION",
    aplica_a: [{ vacuna: "PENTA", dosis: "D3", clasificacion_poblacion: "MENOR_1" }],
    numerador:   { fuente: "INDICADOR" },
    denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "NINGUNO" },
    meta: { valor: 95, unidad: "PORCENTAJE", comparador: ">" },
    parametros: { indicador_base: "COB_PENTA3", metodo: "PROMEDIO_MOVIL", meses_ventana: NumberInt(3), horizonte: "FIN_DE_ANIO" },
    es_estimacion: true
  }
]);

print("Colecciones creadas:", db_.getCollectionNames().join(", "));
print("catalogo_dimensiones:", db_.catalogo_dimensiones.countDocuments(),
      "| esquemas_captura:", db_.esquemas_captura.countDocuments(),
      "| reglas_validacion:", db_.reglas_validacion.countDocuments(),
      "| configuracion_indicadores:", db_.configuracion_indicadores.countDocuments());
