import { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { registrarBitacora, MODULOS } from '../auditoria/auditoria.service.js';

// La fila de bitácora va primero, dentro de la transacción de MySQL; luego un solo cambio en la colección, que es
// atómico por documento. Si MongoDB falla o su condición no se cumple, escribirMongo lanza y la bitácora se deshace.
export async function escribirConBitacora(entidad, contexto, bitacora, escribirMongo) {
  await enTransaccion(async (conexion) => {
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.CONFIGURACION,
      entidad,
      ...bitacora,
    });
    await escribirMongo((await obtenerDb()).collection(entidad));
  });
}
