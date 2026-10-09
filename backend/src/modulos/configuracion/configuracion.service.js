const { baseMongo } = require('../../config/mongodb');

async function obtenerDimensiones() {
  const documentos = await baseMongo
    .collection('catalogo_dimensiones')
    .find(
      {},
      {
        projection: {
          _id: 0,
          auditoria: 0
        }
      }
    )
    .sort({ codigo: 1 })
    .toArray();

  return documentos.map((dimension) => ({
    codigo: dimension.codigo,
    nombre: dimension.nombre,
    descripcion: dimension.descripcion ?? null,
    tipo: dimension.tipo,
    activo: dimension.activo,

    valores: dimension.valores
      .map((valor) => ({
        codigo: valor.codigo,
        etiqueta: valor.etiqueta,
        orden: valor.orden,
        activo: valor.activo,

        ...(valor.edad_min_meses !== undefined
          ? { edadMinMeses: valor.edad_min_meses }
          : {}),

        ...(valor.edad_max_meses !== undefined
          ? { edadMaxMeses: valor.edad_max_meses }
          : {})
      }))
      .sort((a, b) => a.orden - b.orden)
  }));
}

module.exports = { obtenerDimensiones };