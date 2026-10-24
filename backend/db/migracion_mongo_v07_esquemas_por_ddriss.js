// =============================================================================
//  SIRCOVA - Migración MongoDB v0.6 -> v0.7: formularios de captura por DDRISS
//  Aplica el cambio sobre una base que YA existe (no borra nada):
//    1. Agrega territorio NACIONAL y basado_en: null a los esquemas actuales.
//    2. Si están los datos de prueba, convierte el borrador HEXA v3 en el
//       ejemplo de formulario de DDRISS_SM.
//    3. Agrega territorio (obligatorio) y basado_en al validador.
//    4. Cambia los índices: una VIGENTE por vacuna y territorio.
//  Se puede ejecutar más de una vez.
//  Requiere un usuario con readWrite + dbAdmin en vacunacion_config.
// =============================================================================

const db_ = db.getSiblingDB("vacunacion_config");
const col = db_.esquemas_captura;
const territorioNacional = { nivel: "NACIONAL", ddriss_codigo: null };

// --- 1. Datos: los esquemas existentes son nacionales -------------------------
const r1 = col.updateMany(
  { territorio: { $exists: false } },
  { $set: { territorio: territorioNacional, basado_en: null } }
);
print(`Esquemas marcados como NACIONAL: ${r1.modifiedCount}`);

// --- 2. Datos de prueba: HEXA v3 (borrador) pasa a ser de DDRISS_SM -----------
const hexa_v2 = ObjectId("66f8a1c2e4b0a1b2c3d4e5f6");
const r2 = col.updateOne(
  { "vacuna.codigo": "HEXA", version: 3, estado: "BORRADOR", datos_prueba: true },
  { $set: {
      territorio: { nivel: "DDRISS", ddriss_codigo: "DDRISS_SM" },
      basado_en: { esquema_id: hexa_v2, version: NumberInt(2) },
      version_anterior_id: null
  } }
);
print(`Borrador HEXA v3 de prueba convertido a DDRISS_SM: ${r2.modifiedCount}`);

// --- 3. Validador: se toma el actual y se le agregan los campos nuevos --------
const validador = db_.getCollectionInfos({ name: "esquemas_captura" })[0].options.validator;
const js = validador.$jsonSchema;
if (!js.required.includes("territorio")) js.required.push("territorio");
js.properties.territorio = {
  bsonType: "object",
  required: ["nivel", "ddriss_codigo"],
  properties: {
    nivel:         { enum: ["NACIONAL", "DDRISS"] },
    ddriss_codigo: { bsonType: ["string", "null"], description: "null cuando nivel = NACIONAL" }
  }
};
js.properties.basado_en = {
  bsonType: ["object", "null"],
  description: "Versión NACIONAL de la que se copió este formulario de DDRISS; null en los nacionales",
  required: ["esquema_id", "version"],
  properties: {
    esquema_id: { bsonType: "objectId", description: "_id del esquema nacional usado como base" },
    version:    { bsonType: "int", description: "Copia del número de versión de la base" }
  }
};
db_.runCommand({ collMod: "esquemas_captura", validator: validador, validationLevel: "strict", validationAction: "error" });
print("Validador actualizado.");

// --- 4. Índices -----------------------------------------------------------------
const nombres = col.getIndexes().map((i) => i.name);
col.createIndex(
  { "vacuna.codigo": 1, "territorio.nivel": 1, "territorio.ddriss_codigo": 1 },
  { unique: true, partialFilterExpression: { estado: "VIGENTE" }, name: "uq_esquema_vigente_territorio" }
);
if (nombres.includes("uq_vigente_por_vacuna")) col.dropIndex("uq_vigente_por_vacuna");
const ixVigencia = col.getIndexes().find((i) => i.name === "ix_vigencia");
if (ixVigencia && !("territorio.ddriss_codigo" in ixVigencia.key)) col.dropIndex("ix_vigencia");
col.createIndex({ "vacuna.codigo": 1, "territorio.ddriss_codigo": 1, "vigencia.desde": -1 }, { name: "ix_vigencia" });
print("Índices: " + col.getIndexes().map((i) => i.name).join(", "));

// --- Comprobación -----------------------------------------------------------------
print(`Esquemas sin territorio (debe ser 0): ${col.countDocuments({ territorio: { $exists: false } })}`);
