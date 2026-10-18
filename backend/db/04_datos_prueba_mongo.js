// =============================================================================
// SIRCOVA - Datos de prueba para MongoDB (vacunacion_config)
// Requiere: 02_colecciones_mongodb.js ya ejecutado (MongoDB v0.6).
//
// Uso:  mongosh "<cadena de conexión de Atlas>" --file 04_datos_prueba_mongodb.js
//
// Todo lo que agrega este script es FICTICIO y lleva datos_prueba: true. Se
// puede ejecutar varias veces: primero borra los documentos de prueba
// anteriores y luego los vuelve a insertar. No toca los documentos del 02.
// Para quitar solo los datos de prueba: en cada colección,
//   deleteMany({ datos_prueba: true })
//
// Qué agrega (además de lo que ya trae el 02):
//   - Dimensión "pueblo" (ejemplo de dimensión nueva; solo la usa un borrador).
//   - Esquemas VIGENTES de Rotavirus, SPR y Neumococo pediátrico, para probar
//     el formulario dinámico con más vacunas.
//   - Hexavalente v3 en BORRADOR (propuesta que agrega "pueblo").
//   - VARIACION_HISTORICA v2 solo para DDRISS_SM (umbral de 40 %), para probar
//     que una regla de la DDRISS reemplaza a la nacional.
//   - Regla RANGO_DOSIS_MES en BORRADOR.
//   - Indicador COB_BCG vigente y AVANCE_HEXA3 v2 en BORRADOR con los rangos
//     del mapa ya confirmados (ejemplo de cómo se publicará el cambio).
//
// Los ids de usuario (creado_por, publicado_por) son los de
// 03_datos_prueba_mysql.sql: 1 = admin.prueba, 4 = epidemiologia.
// =============================================================================


const db_ = db.getSiblingDB("vacunacion_config");

const hexa_v2 = ObjectId("66f8a1c2e4b0a1b2c3d4e5f6");
if (!db_.esquemas_captura.findOne({ _id: hexa_v2 })) {
  print("ERROR: no se encontró el esquema Hexavalente v2. Ejecute primero 02_colecciones_mongodb.js.");
  quit(1);
}

const colecciones = ["catalogo_dimensiones", "esquemas_captura", "reglas_validacion", "configuracion_indicadores"];
colecciones.forEach((c) => db_[c].deleteMany({ datos_prueba: true }));

const fechaPrueba = new Date("2026-10-15T15:00:00Z");
const auditoriaPrueba = { creado_por: NumberInt(1), creado_en: fechaPrueba, publicado_por: NumberInt(1), publicado_en: fechaPrueba, motivo_cambio: null };
const auditoriaBorrador = { creado_por: NumberInt(1), creado_en: fechaPrueba, publicado_por: null, publicado_en: null, motivo_cambio: null };
const desdeOctubre = { desde: new Date("2026-10-01"), hasta: null };
const territorioNacional = { nivel: "NACIONAL", ddriss_codigo: null };
const reglasBasicas = [
  { codigo: "CAMPOS_COMPLETOS", version: NumberInt(1) },
  { codigo: "NO_NEGATIVO", version: NumberInt(1) },
  { codigo: "VARIACION_HISTORICA", version: NumberInt(1) }
];

// --- Catálogo de dimensiones ---------------------------------------------------
db_.catalogo_dimensiones.insertOne({
  codigo: "pueblo", nombre: "Pueblo de pertenencia", tipo: "CATEGORICA", activo: true,
  descripcion: "Dimensión de prueba: muestra cómo se agrega una dimensión nueva sin cambiar MySQL.",
  valores: [
    { codigo: "MAYA",          etiqueta: "Maya",            orden: NumberInt(1), activo: true },
    { codigo: "GARIFUNA",      etiqueta: "Garífuna",        orden: NumberInt(2), activo: true },
    { codigo: "XINKA",         etiqueta: "Xinka",           orden: NumberInt(3), activo: true },
    { codigo: "LADINO",        etiqueta: "Ladino / mestizo", orden: NumberInt(4), activo: true },
    { codigo: "NO_INDICA",     etiqueta: "No indica",       orden: NumberInt(5), activo: true }
  ],
  auditoria: auditoriaPrueba,
  datos_prueba: true
});

// --- Esquemas de captura ---------------------------------------------------------
db_.esquemas_captura.insertMany([
  {
    vacuna: { id: NumberInt(7), codigo: "ROTA", nombre: "Rotavirus" },
    version: NumberInt(1), estado: "VIGENTE", vigencia: desdeOctubre, version_anterior_id: null,
    dimensiones: {
      dosis: [{ codigo: "D1", etiqueta: "1.ª dosis" }, { codigo: "D2", etiqueta: "2.ª dosis" }],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [{ dimension: "grupo_edad", valores: ["MENOR_1"] }]
    },
    secciones: [
      { codigo: "MENOR_1", titulo: "< 1 año", orden: NumberInt(1), grupo_edad: "MENOR_1", dosis: ["D1", "D2"] }
    ],
    campos_adicionales: [],
    reglas: reglasBasicas,
    presentacion: { filas: "dosis", columnas: ["seccion"] },
    auditoria: auditoriaPrueba,
    datos_prueba: true
  },
  {
    vacuna: { id: NumberInt(3), codigo: "SPR", nombre: "Sarampión, Paperas y Rubéola (SPR)" },
    version: NumberInt(1), estado: "VIGENTE", vigencia: desdeOctubre, version_anterior_id: null,
    dimensiones: {
      dosis: [{ codigo: "D1", etiqueta: "1.ª dosis" }, { codigo: "D2", etiqueta: "2.ª dosis" }],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [{ dimension: "grupo_edad", valores: ["1_A_MENOR_2", "1_A_5"] }]
    },
    secciones: [
      { codigo: "1_A_MENOR_2", titulo: "De 1 a < 2 años", orden: NumberInt(1), grupo_edad: "1_A_MENOR_2", dosis: ["D1", "D2"] },
      { codigo: "1_A_5",       titulo: "De 1 a < 6 años", orden: NumberInt(2), grupo_edad: "1_A_5",       dosis: ["D1", "D2"] }
    ],
    campos_adicionales: [],
    reglas: [...reglasBasicas, { codigo: "SECUENCIA_DOSIS", version: NumberInt(1) }],
    presentacion: { filas: "dosis", columnas: ["seccion"] },
    auditoria: auditoriaPrueba,
    datos_prueba: true
  },
  {
    vacuna: { id: NumberInt(8), codigo: "NEUMO", nombre: "Neumococo pediátrico" },
    version: NumberInt(1), estado: "VIGENTE", vigencia: desdeOctubre, version_anterior_id: null,
    dimensiones: {
      dosis: [
        { codigo: "D1", etiqueta: "1.ª dosis" }, { codigo: "D2", etiqueta: "2.ª dosis" },
        { codigo: "R1", etiqueta: "Refuerzo" }
      ],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [{ dimension: "grupo_edad", valores: ["MENOR_1", "1_A_MENOR_2", "1_A_5"] }]
    },
    secciones: [
      { codigo: "MENOR_1",     titulo: "< 1 año",         orden: NumberInt(1), grupo_edad: "MENOR_1",     dosis: ["D1", "D2"] },
      { codigo: "1_A_MENOR_2", titulo: "De 1 a < 2 años", orden: NumberInt(2), grupo_edad: "1_A_MENOR_2", dosis: ["R1"] },
      { codigo: "1_A_5",       titulo: "De 1 a < 6 años", orden: NumberInt(3), grupo_edad: "1_A_5",       dosis: ["D1", "D2", "R1"] }
    ],
    campos_adicionales: [],
    reglas: reglasBasicas,
    presentacion: { filas: "dosis", columnas: ["seccion"] },
    auditoria: auditoriaPrueba,
    datos_prueba: true
  },
  {
    // Borrador: no se usa para capturar hasta que se publique.
    vacuna: { id: NumberInt(2), codigo: "HEXA", nombre: "Hexavalente" },
    version: NumberInt(3), estado: "BORRADOR",
    vigencia: { desde: new Date("2027-01-01"), hasta: null },
    version_anterior_id: hexa_v2,
    dimensiones: {
      dosis: [
        { codigo: "D1", etiqueta: "1.ª dosis" },
        { codigo: "D2", etiqueta: "2.ª dosis" },
        { codigo: "D3", etiqueta: "3.ª dosis" }
      ],
      procedencia: { modo: "MUNICIPIO_DETALLADO", permite_no_especificado: true },
      desagregacion: [
        { dimension: "grupo_edad", valores: ["MENOR_1", "1_A_5"] },
        { dimension: "pueblo",     valores: ["MAYA", "GARIFUNA", "XINKA", "LADINO", "NO_INDICA"] }
      ]
    },
    secciones: [
      { codigo: "MENOR_1", titulo: "< 1 año",         orden: NumberInt(1), grupo_edad: "MENOR_1", dosis: ["D1", "D2", "D3"] },
      { codigo: "1_A_5",   titulo: "De 1 a < 6 años", orden: NumberInt(2), grupo_edad: "1_A_5",   dosis: ["D1", "D2", "D3"] }
    ],
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
      { codigo: "VARIACION_HISTORICA", version: NumberInt(2) }
    ],
    presentacion: { filas: "dosis", columnas: ["seccion", "pueblo"], subtabla_por: "procedencia" },
    auditoria: { ...auditoriaBorrador, motivo_cambio: "Prueba: propuesta de desagregar por pueblo." },
    datos_prueba: true
  }
]);

// --- Reglas de validación --------------------------------------------------------
db_.reglas_validacion.insertMany([
  {
    // Misma regla que la v1 nacional, con un umbral más estricto solo para San Marcos.
    codigo: "VARIACION_HISTORICA", version: NumberInt(2), nombre: "Variación atípica frente al historial (San Marcos)",
    tipo: "VARIACION_HISTORICA", ambito: "VACUNA", severidad: "ADVERTENCIA",
    aplica_a: { vacunas: ["*"] }, parametros: { meses_referencia: 3, variacion_max_pct: 40, minimo_dosis: 10 },
    mensaje: "La producción de {vacuna} varía {variacion} % respecto al promedio de los últimos {meses_referencia} meses.",
    territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" },
    estado: "VIGENTE", vigencia: desdeOctubre,
    auditoria: { ...auditoriaPrueba, motivo_cambio: "Prueba: umbral de 40 % pedido por la DDRISS." },
    datos_prueba: true
  },
  {
    codigo: "RANGO_DOSIS_MES", version: NumberInt(1), nombre: "Cantidad mensual dentro de un rango razonable",
    descripcion: "Advierte cuando una celda supera el máximo esperado para un establecimiento en un mes.",
    tipo: "RANGO", ambito: "DETALLE", severidad: "ADVERTENCIA",
    aplica_a: { vacunas: ["BCG", "HEXA"] }, parametros: { minimo: 0, maximo: 500 },
    mensaje: "{vacuna} {dosis}: {valor} dosis está fuera del rango esperado ({minimo} a {maximo}).",
    territorio: territorioNacional,
    estado: "BORRADOR", vigencia: { desde: new Date("2026-11-01"), hasta: null },
    auditoria: auditoriaBorrador,
    datos_prueba: true
  }
]);

// --- Configuración de indicadores ------------------------------------------------
db_.configuracion_indicadores.insertMany([
  {
    codigo: "COB_BCG", version: NumberInt(1), nombre: "Cobertura de BCG en nacidos vivos",
    tipo_calculo: "COBERTURA",
    aplica_a: [{ vacuna: "BCG", dosis: "UNICA", clasificacion_poblacion: "NACIDOS_VIVOS" }],
    numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
    denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "MENSUAL_LINEAL" },
    meta: { valor: 95, unidad: "PORCENTAJE", comparador: ">", homogeneidad_municipal: true },
    umbrales: [
      { color: "verde",    desde: 90, hasta: null },
      { color: "amarillo", desde: 80, hasta: 90 },
      { color: "rojo",     desde: 0,  hasta: 80 }
    ],
    umbrales_provisionales: true,
    niveles: ["MUNICIPIO", "DEPARTAMENTO"], periodicidad: "MENSUAL",
    alerta: { generar: false },
    es_estimacion: false,
    territorio: territorioNacional, estado: "VIGENTE", vigencia: desdeOctubre,
    auditoria: auditoriaPrueba,
    datos_prueba: true
  },
  {
    // Ejemplo de cómo quedará AVANCE_HEXA3 cuando Epidemiología confirme los rangos.
    codigo: "AVANCE_HEXA3", version: NumberInt(2), nombre: "Avance de Hexavalente 3.ª dosis contra la meta del mes",
    descripcion: "Dosis acumuladas al mes ÷ (población ÷ 12 × número de mes) × 100. La meta del mes vale 100 %.",
    tipo_calculo: "AVANCE_META_MES",
    aplica_a: [{ vacuna: "HEXA", dosis: "D3", clasificacion_poblacion: "MENOR_1", filtros_dimension: { grupo_edad: ["MENOR_1"] } }],
    numerador:   { fuente: "PRODUCCION", estados_reporte: ["CERRADO"], atribucion: "PROCEDENCIA", acumulado: "ANUAL" },
    denominador: { fuente: "POBLACION_OBJETIVO", prorrateo: "MENSUAL_LINEAL" },
    meta: { valor: 100, unidad: "PORCENTAJE", comparador: ">=", homogeneidad_municipal: true },
    umbrales: [
      { color: "verde",    desde: 90, hasta: null },
      { color: "amarillo", desde: 80, hasta: 90 },
      { color: "rojo",     desde: 0,  hasta: 80 }
    ],
    umbrales_provisionales: false,
    es_indicador_mapa: true,
    parametros: { mostrar_diferencia: true, redondeo: "ARRIBA", minimo_cero: true },
    niveles: ["MUNICIPIO", "DEPARTAMENTO"], periodicidad: "MENSUAL",
    alerta: { generar: true, tipo: "COBERTURA_BAJO_META", rol_destino: ["EPIDEMIOLOGIA", "REVISOR"] },
    es_estimacion: false,
    territorio: territorioNacional, estado: "BORRADOR",
    vigencia: { desde: new Date("2027-01-01"), hasta: null },
    auditoria: { creado_por: NumberInt(4), creado_en: fechaPrueba, publicado_por: null, publicado_en: null,
                 motivo_cambio: "Prueba: rangos del semáforo confirmados por Epidemiología." },
    datos_prueba: true
  }
]);

print("Datos de prueba cargados en vacunacion_config:");
colecciones.forEach((c) =>
  print("  " + c + ": " + db_[c].countDocuments() + " documentos (" + db_[c].countDocuments({ datos_prueba: true }) + " de prueba)"));
