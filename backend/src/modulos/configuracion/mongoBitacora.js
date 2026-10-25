import { enTransaccion } from '../../config/mysql.js';
import { cliente, obtenerDb } from '../../config/mongodb.js';
import { registrarBitacora, MODULOS } from '../auditoria/auditoria.service.js';

const filaDeBitacora = (contexto, entidad, bitacora) => ({
  ...contexto,
  modulo: MODULOS.CONFIGURACION,
  entidad,
  ...bitacora,
});

// La fila de bitácora va primero, dentro de la transacción de MySQL; luego un solo cambio en la colección, que es
// atómico por documento. Si MongoDB falla o su condición no se cumple, escribirMongo lanza y la bitácora se deshace.
export async function escribirConBitacora(entidad, contexto, bitacora, escribirMongo) {
  await enTransaccion(async (conexion) => {
    await registrarBitacora(conexion, filaDeBitacora(contexto, entidad, bitacora));
    await escribirMongo((await obtenerDb()).collection(entidad));
  });
}

// Igual, para cambiar varios documentos: van en una transacción de MongoDB, que exige un conjunto de réplicas (Atlas
// lo es; un MongoDB local suelto no). escribirMongo recibe la sesión y la pasa a cada operación.
export async function escribirEnTransaccionConBitacora(entidad, contexto, filas, escribirMongo) {
  await enTransaccion(async (conexion) => {
    for (const fila of filas) await registrarBitacora(conexion, filaDeBitacora(contexto, entidad, fila));
    const coleccion = (await obtenerDb()).collection(entidad);
    const sesion = cliente.startSession();
    try {
      await sesion.withTransaction(() => escribirMongo(coleccion, sesion));
    } finally {
      await sesion.endSession();
    }
  });
}
