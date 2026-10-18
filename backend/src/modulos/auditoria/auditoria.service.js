function aJson(valor) {
  return valor == null ? null : JSON.stringify(valor);
}

function recortar(texto, largo) {
  return texto == null ? null : String(texto).slice(0, largo);
}

// Recibe la conexión de la transacción en curso para que la fila se confirme o se revierta junto con el cambio.
export async function registrarBitacora(conexion, datos) {
  await conexion.query(
    `INSERT INTO bitacora
       (usuario_id, nombre_usuario_intento, modulo, accion, entidad, entidad_id,
        valores_anteriores, valores_nuevos, ip_origen, agente_usuario)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.usuarioId ?? null,
      // Las columnas tienen largo fijo; un texto más largo haría fallar el INSERT.
      recortar(datos.nombreUsuarioIntento, 50),
      datos.modulo,
      datos.accion,
      datos.entidad,
      datos.entidadId == null ? null : String(datos.entidadId),
      aJson(datos.valoresAnteriores),
      aJson(datos.valoresNuevos),
      recortar(datos.ipOrigen, 45),
      recortar(datos.agenteUsuario, 255),
    ],
  );
}
