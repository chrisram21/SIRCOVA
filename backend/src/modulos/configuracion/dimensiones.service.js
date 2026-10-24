import { Int32, ObjectId } from 'mongodb';
import pool, { enTransaccion } from '../../config/mysql.js';
import { obtenerDb } from '../../config/mongodb.js';
import { ErrorApi } from '../../middlewares/errores.js';
import {
  validarCodigoDimension,
  validarCodigoValorDimension,
  validarDescripcionDimension,
  validarEdadMeses,
  validarEtiquetaValorDimension,
  validarNombreDimension,
} from '../../validaciones/campos.js';
import { registrarBitacora, diferencias, MODULOS, ACCIONES } from '../auditoria/auditoria.service.js';
import { entradaInvalida, leerBooleano, revisarCampos, revisarParametros } from '../catalogos/catalogos.service.js';

// El catálogo de dimensiones es nacional: ninguna consulta se filtra por DDRISS.

const RANGO_EDAD = 'RANGO_EDAD';
const ESTADOS_QUE_BLOQUEAN = ['VIGENTE', 'BORRADOR'];

const errores = {
  noEncontrado: () => new ErrorApi(404, 'NO_ENCONTRADO', 'El recurso solicitado no existe.'),
  dimensionDuplicada: (codigo) =>
    new ErrorApi(409, 'DIMENSION_DUPLICADA', `Ya existe una dimensión con el código ${codigo}.`),
  dimensionEnUso: (codigo) =>
    new ErrorApi(409, 'DIMENSION_EN_USO', `La dimensión ${codigo} la usa un esquema de captura vigente o en borrador.`),
  dimensionYaActiva: () => new ErrorApi(409, 'DIMENSION_YA_ACTIVA', 'La dimensión ya está activa.'),
  dimensionYaInactiva: () => new ErrorApi(409, 'DIMENSION_YA_INACTIVA', 'La dimensión ya está inactiva.'),
  valorDuplicado: (codigo) => new ErrorApi(409, 'VALOR_DUPLICADO', `La dimensión ya tiene el valor ${codigo}.`),
  valorEnUso: (codigo) =>
    new ErrorApi(409, 'VALOR_EN_USO', `El valor ${codigo} lo usa un esquema de captura vigente o en borrador.`),
  ultimoValorActivo: () =>
    new ErrorApi(409, 'ULTIMO_VALOR_ACTIVO', 'La dimensión debe conservar al menos un valor activo.'),
  valorYaActivo: () => new ErrorApi(409, 'VALOR_YA_ACTIVO', 'El valor ya está activo.'),
  valorYaInactivo: () => new ErrorApi(409, 'VALOR_YA_INACTIVO', 'El valor ya está inactivo.'),
};

const LISTA_ORDEN_INVALIDA = 'La lista debe traer cada valor de la dimensión una sola vez.';

const coleccion = async () => (await obtenerDb()).collection('catalogo_dimensiones');

const claveValor = (dimension, valor) => `${dimension}|${valor}`;

// Lo que usan los esquemas VIGENTE o BORRADOR de cualquier territorio: la desagregación general, la de cada
// dosis y el grupo_edad de cada sección, que cuenta como un valor de grupo_edad.
export async function usoEnEsquemas() {
  const esquemas = await (await obtenerDb())
    .collection('esquemas_captura')
    .find(
      { estado: { $in: ESTADOS_QUE_BLOQUEAN } },
      { projection: { 'dimensiones.desagregacion': 1, 'dimensiones.dosis.desagregacion': 1, 'secciones.grupo_edad': 1 } },
    )
    .toArray();
  const dimensiones = new Set();
  const valores = new Set();
  const anotar = (desagregacion = []) => {
    for (const { dimension, valores: codigos = [] } of desagregacion) {
      dimensiones.add(dimension);
      for (const codigo of codigos) valores.add(claveValor(dimension, codigo));
    }
  };
  for (const esquema of esquemas) {
    anotar(esquema.dimensiones?.desagregacion);
    for (const dosis of esquema.dimensiones?.dosis ?? []) anotar(dosis.desagregacion);
    for (const seccion of esquema.secciones ?? []) {
      if (!seccion.grupo_edad) continue;
      dimensiones.add('grupo_edad');
      valores.add(claveValor('grupo_edad', seccion.grupo_edad));
    }
  }
  return {
    dimensionEnUso: (codigo) => dimensiones.has(codigo),
    valorEnUso: (dimension, valor) => valores.has(claveValor(dimension, valor)),
  };
}

async function gruposPoblacion() {
  const [filas] = await pool.query('SELECT codigo, descripcion FROM clasificacion_poblacion ORDER BY id');
  return filas;
}

// La dimensión en camelCase, sin lo que depende de otras colecciones; es lo que se guarda en la bitácora.
function aDatos(doc) {
  const esRango = doc.tipo === RANGO_EDAD;
  return {
    codigo: doc.codigo,
    nombre: doc.nombre,
    descripcion: doc.descripcion ?? null,
    tipo: doc.tipo,
    activa: doc.activo,
    valores: [...doc.valores]
      .sort((a, b) => a.orden - b.orden)
      .map((v) => ({
        codigo: v.codigo,
        etiqueta: v.etiqueta,
        orden: v.orden,
        activo: v.activo,
        ...(esRango && { edadMinMeses: v.edad_min_meses, edadMaxMeses: v.edad_max_meses }),
      })),
  };
}

function aDimension(doc, uso, codigosPoblacion) {
  const datos = aDatos(doc);
  const esRango = doc.tipo === RANGO_EDAD;
  return {
    id: doc._id.toString(),
    ...datos,
    enUso: uso.dimensionEnUso(doc.codigo),
    valores: datos.valores.map((v) => ({
      ...v,
      enUso: uso.valorEnUso(doc.codigo, v.codigo),
      ...(esRango && { sinPoblacion: !codigosPoblacion.has(v.codigo) }),
    })),
  };
}

export async function listarDimensiones(query = {}) {
  revisarParametros(query, ['activa']);
  const activa = leerBooleano(query, 'activa');
  const filtro = activa === undefined ? {} : { activo: activa };
  const [documentos, uso, grupos] = await Promise.all([
    (await coleccion()).find(filtro).toArray(),
    usoEnEsquemas(),
    gruposPoblacion(),
  ]);
  const codigosPoblacion = new Set(grupos.map((g) => g.codigo));
  return documentos
    .map((doc) => aDimension(doc, uso, codigosPoblacion))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

export async function obtenerDimension(codigo) {
  const [doc, uso, grupos] = await Promise.all([
    (await coleccion()).findOne({ codigo: String(codigo) }),
    usoEnEsquemas(),
    gruposPoblacion(),
  ]);
  if (!doc) throw errores.noEncontrado();
  const dimension = aDimension(doc, uso, new Set(grupos.map((g) => g.codigo)));
  if (doc.tipo !== RANGO_EDAD) return dimension;
  const yaEstan = new Set(doc.valores.map((v) => v.codigo));
  return { ...dimension, gruposPoblacionDisponibles: grupos.filter((g) => !yaEstan.has(g.codigo)) };
}

function aplicarRegla(regla, valor) {
  const resultado = regla(valor);
  if (resultado.error) throw entradaInvalida(resultado.error);
  return resultado.valor;
}

async function buscarDimension(codigo) {
  const doc = await (await coleccion()).findOne({ codigo: String(codigo) });
  if (!doc) throw errores.noEncontrado();
  return doc;
}

// La fila de bitácora va primero, dentro de la transacción de MySQL; luego un solo cambio en MongoDB, que es atómico
// por documento. Si MongoDB falla o su condición no se cumple, escribirMongo lanza y la bitácora se deshace.
async function escribirConBitacora(contexto, bitacora, escribirMongo) {
  await enTransaccion(async (conexion) => {
    await registrarBitacora(conexion, {
      ...contexto,
      modulo: MODULOS.CONFIGURACION,
      entidad: 'catalogo_dimensiones',
      ...bitacora,
    });
    await escribirMongo(await coleccion());
  });
}

function leerValoresNuevos(valores) {
  if (!Array.isArray(valores) || valores.length === 0) throw entradaInvalida('Indique al menos un valor.');
  const vistos = new Set();
  return valores.map((cuerpo) => {
    if (cuerpo === null || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      throw entradaInvalida('Cada valor debe ser un objeto JSON.');
    }
    revisarCampos(cuerpo, ['codigo', 'etiqueta']);
    const codigo = aplicarRegla(validarCodigoValorDimension, cuerpo.codigo);
    if (vistos.has(codigo)) throw entradaInvalida(`El valor ${codigo} está repetido.`);
    vistos.add(codigo);
    return { codigo, etiqueta: aplicarRegla(validarEtiquetaValorDimension, cuerpo.etiqueta) };
  });
}

// Las dimensiones nuevas son siempre CATEGORICA: grupo_edad es la única RANGO_EDAD.
export async function crearDimension(cuerpo, contexto) {
  revisarCampos(cuerpo, ['codigo', 'nombre', 'descripcion', 'valores']);
  const codigo = aplicarRegla(validarCodigoDimension, cuerpo.codigo);
  const nombre = aplicarRegla(validarNombreDimension, cuerpo.nombre);
  const descripcion = aplicarRegla(validarDescripcionDimension, cuerpo.descripcion);
  const valores = leerValoresNuevos(cuerpo.valores);

  if (await (await coleccion()).findOne({ codigo }, { projection: { _id: 1 } })) {
    throw errores.dimensionDuplicada(codigo);
  }
  // El validador de la colección exige int: sin Int32, el driver mandaría un double.
  const doc = {
    _id: new ObjectId(),
    codigo,
    nombre,
    ...(descripcion !== null && { descripcion }),
    tipo: 'CATEGORICA',
    activo: true,
    valores: valores.map((v, i) => ({ ...v, orden: new Int32(i + 1), activo: true })),
    auditoria: {
      creado_por: new Int32(contexto.usuarioId),
      creado_en: new Date(),
      publicado_por: null,
      publicado_en: null,
      motivo_cambio: null,
    },
  };

  try {
    await escribirConBitacora(
      contexto,
      { accion: ACCIONES.CREAR, entidadId: doc._id.toString(), valoresNuevos: aDatos(doc) },
      (dimensiones) => dimensiones.insertOne(doc),
    );
  } catch (err) {
    // Dos altas a la vez con el mismo código: el índice único uq_dimension_codigo es la última barrera.
    if (err.code === 11000) throw errores.dimensionDuplicada(codigo);
    throw err;
  }
  return obtenerDimension(codigo);
}

// También con la dimensión inactiva. Un valor igual al guardado no se valida.
export async function editarDimension(codigo, cuerpo, contexto) {
  revisarCampos(cuerpo, ['nombre', 'descripcion']);
  if (Object.keys(cuerpo).length === 0) throw entradaInvalida('Indique al menos un dato de la dimensión.');
  const doc = await buscarDimension(codigo);

  const antes = { nombre: doc.nombre, descripcion: doc.descripcion ?? null };
  const despues = { ...antes };
  if (Object.hasOwn(cuerpo, 'nombre') && cuerpo.nombre !== antes.nombre) {
    despues.nombre = aplicarRegla(validarNombreDimension, cuerpo.nombre);
  }
  if (Object.hasOwn(cuerpo, 'descripcion') && cuerpo.descripcion !== antes.descripcion) {
    despues.descripcion = aplicarRegla(validarDescripcionDimension, cuerpo.descripcion);
  }

  const cambios = diferencias(antes, despues);
  if (cambios) {
    const actualizacion = { $set: { nombre: despues.nombre } };
    if (despues.descripcion === null) actualizacion.$unset = { descripcion: '' };
    else actualizacion.$set.descripcion = despues.descripcion;

    await escribirConBitacora(
      contexto,
      {
        accion: ACCIONES.ACTUALIZAR,
        entidadId: doc._id.toString(),
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      },
      async (dimensiones) => {
        const { matchedCount } = await dimensiones.updateOne({ _id: doc._id }, actualizacion);
        if (matchedCount === 0) throw errores.noEncontrado();
      },
    );
  }
  return obtenerDimension(doc.codigo);
}

// Solo cambia el activo de la dimensión: sus valores quedan como están, así vuelve igual al reactivarla.
async function cambiarEstadoDimension(codigo, activa, contexto) {
  const doc = await buscarDimension(codigo);
  if (doc.activo === activa) throw activa ? errores.dimensionYaActiva() : errores.dimensionYaInactiva();
  if (!activa && (await usoEnEsquemas()).dimensionEnUso(doc.codigo)) throw errores.dimensionEnUso(doc.codigo);

  await escribirConBitacora(
    contexto,
    {
      accion: activa ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR,
      entidadId: doc._id.toString(),
      valoresAnteriores: { activa: !activa },
      valoresNuevos: { activa },
    },
    async (dimensiones) => {
      // La condición sobre activo evita registrar dos veces el mismo cambio si llegan dos peticiones a la vez.
      const filtro = { _id: doc._id, activo: !activa };
      const { modifiedCount } = await dimensiones.updateOne(filtro, { $set: { activo: activa } });
      if (modifiedCount === 0) throw activa ? errores.dimensionYaActiva() : errores.dimensionYaInactiva();
    },
  );
  return obtenerDimension(doc.codigo);
}

export const desactivarDimension = (codigo, contexto) => cambiarEstadoDimension(codigo, false, contexto);
export const reactivarDimension = (codigo, contexto) => cambiarEstadoDimension(codigo, true, contexto);

function buscarValor(doc, valor) {
  const encontrado = doc.valores.find((v) => v.codigo === String(valor));
  if (!encontrado) throw errores.noEncontrado();
  return encontrado;
}

// La API exige un número: un texto de dígitos solo se acepta desde el Input del frontend.
function leerEdad(valor) {
  if (!Number.isInteger(valor)) throw entradaInvalida(validarEdadMeses(null).error);
  return aplicarRegla(validarEdadMeses, valor);
}

// Las edades solo van en la dimensión RANGO_EDAD, cuyo código debe ser un grupo de clasificacion_poblacion.
async function leerValorNuevo(doc, cuerpo) {
  const esRango = doc.tipo === RANGO_EDAD;
  revisarCampos(cuerpo, esRango ? ['codigo', 'etiqueta', 'edadMinMeses', 'edadMaxMeses'] : ['codigo', 'etiqueta']);
  const valor = {
    codigo: aplicarRegla(validarCodigoValorDimension, cuerpo.codigo),
    etiqueta: aplicarRegla(validarEtiquetaValorDimension, cuerpo.etiqueta),
  };
  if (!esRango) return valor;

  const edadMinMeses = leerEdad(cuerpo.edadMinMeses);
  const edadMaxMeses = leerEdad(cuerpo.edadMaxMeses);
  if (edadMinMeses >= edadMaxMeses) throw entradaInvalida('La edad mínima debe ser menor que la máxima.');
  if (!(await gruposPoblacion()).some((g) => g.codigo === valor.codigo)) {
    throw entradaInvalida(`El grupo ${valor.codigo} no existe en la clasificación de población.`);
  }
  return { ...valor, edadMinMeses, edadMaxMeses };
}

// También en una dimensión inactiva. El valor va al final y queda activo.
export async function agregarValor(codigo, cuerpo, contexto) {
  const doc = await buscarDimension(codigo);
  const valor = await leerValorNuevo(doc, cuerpo);
  if (doc.valores.some((v) => v.codigo === valor.codigo)) throw errores.valorDuplicado(valor.codigo);

  const orden = Math.max(0, ...doc.valores.map((v) => v.orden)) + 1;
  const nuevo = {
    codigo: valor.codigo,
    etiqueta: valor.etiqueta,
    orden: new Int32(orden),
    ...(doc.tipo === RANGO_EDAD && {
      edad_min_meses: new Int32(valor.edadMinMeses),
      edad_max_meses: new Int32(valor.edadMaxMeses),
    }),
    activo: true,
  };

  await escribirConBitacora(
    contexto,
    {
      accion: ACCIONES.ACTUALIZAR,
      entidadId: doc._id.toString(),
      valoresAnteriores: null,
      valoresNuevos: { valor: { ...valor, orden, activo: true } },
    },
    async (dimensiones) => {
      // La condición $ne impide que dos altas simultáneas dejen el mismo código dos veces.
      const { modifiedCount } = await dimensiones.updateOne(
        { _id: doc._id, 'valores.codigo': { $ne: valor.codigo } },
        { $push: { valores: nuevo } },
      );
      if (modifiedCount === 0) throw errores.valorDuplicado(valor.codigo);
    },
  );
  return obtenerDimension(doc.codigo);
}

// El código, el orden y el rango de edad no se cambian por aquí. Una etiqueta igual a la guardada no se valida.
export async function editarValor(codigo, valorCodigo, cuerpo, contexto) {
  revisarCampos(cuerpo, ['etiqueta']);
  const doc = await buscarDimension(codigo);
  const valor = buscarValor(doc, valorCodigo);
  const etiqueta = cuerpo.etiqueta === valor.etiqueta
    ? valor.etiqueta
    : aplicarRegla(validarEtiquetaValorDimension, cuerpo.etiqueta);

  if (etiqueta !== valor.etiqueta) {
    await escribirConBitacora(
      contexto,
      {
        accion: ACCIONES.ACTUALIZAR,
        entidadId: doc._id.toString(),
        valoresAnteriores: { valor: valor.codigo, etiqueta: valor.etiqueta },
        valoresNuevos: { valor: valor.codigo, etiqueta },
      },
      async (dimensiones) => {
        const { matchedCount } = await dimensiones.updateOne(
          { _id: doc._id, 'valores.codigo': valor.codigo },
          { $set: { 'valores.$.etiqueta': etiqueta } },
        );
        if (matchedCount === 0) throw errores.noEncontrado();
      },
    );
  }
  return obtenerDimension(doc.codigo);
}

// La lista trae todos los valores (activos e inactivos) en el orden nuevo; se numeran 1…n.
export async function ordenarValores(codigo, cuerpo, contexto) {
  revisarCampos(cuerpo, ['codigos']);
  const doc = await buscarDimension(codigo);
  const { codigos } = cuerpo;
  const actuales = aDatos(doc).valores.map((v) => v.codigo);
  if (
    !Array.isArray(codigos)
    || codigos.length !== actuales.length
    || new Set(codigos).size !== codigos.length
    || !codigos.every((c) => actuales.includes(c))
  ) {
    throw entradaInvalida(LISTA_ORDEN_INVALIDA);
  }

  const cambios = diferencias({ orden: actuales }, { orden: codigos });
  if (cambios) {
    const asignaciones = Object.fromEntries(codigos.map((_, i) => [`valores.$[v${i}].orden`, new Int32(i + 1)]));
    const filtros = codigos.map((c, i) => ({ [`v${i}.codigo`]: c }));
    await escribirConBitacora(
      contexto,
      {
        accion: ACCIONES.ACTUALIZAR,
        entidadId: doc._id.toString(),
        valoresAnteriores: cambios.anteriores,
        valoresNuevos: cambios.nuevos,
      },
      async (dimensiones) => {
        // Si otra petición agregó un valor mientras tanto, la lista ya no está completa.
        const { matchedCount } = await dimensiones.updateOne(
          { _id: doc._id, valores: { $size: actuales.length } },
          { $set: asignaciones },
          { arrayFilters: filtros },
        );
        if (matchedCount === 0) throw entradaInvalida(LISTA_ORDEN_INVALIDA);
      },
    );
  }
  return obtenerDimension(doc.codigo);
}

function revisarDesactivacion(doc, valor, uso) {
  if (!valor.activo) throw errores.valorYaInactivo();
  if (uso.valorEnUso(doc.codigo, valor.codigo)) throw errores.valorEnUso(valor.codigo);
  if (!doc.valores.some((v) => v.activo && v.codigo !== valor.codigo)) throw errores.ultimoValorActivo();
}

async function cambiarEstadoValor(codigo, valorCodigo, activo, contexto) {
  const doc = await buscarDimension(codigo);
  const valor = buscarValor(doc, valorCodigo);
  if (activo && valor.activo) throw errores.valorYaActivo();
  if (!activo) revisarDesactivacion(doc, valor, await usoEnEsquemas());

  // Desactivar exige que quede otro valor activo también en el momento de escribir: dos desactivaciones
  // simultáneas no pueden dejar la dimensión sin valores.
  const condicion = activo
    ? { valores: { $elemMatch: { codigo: valor.codigo, activo: false } } }
    : {
      valores: {
        $all: [
          { $elemMatch: { codigo: valor.codigo, activo: true } },
          { $elemMatch: { codigo: { $ne: valor.codigo }, activo: true } },
        ],
      },
    };

  await escribirConBitacora(
    contexto,
    {
      accion: activo ? ACCIONES.REACTIVAR : ACCIONES.DESACTIVAR,
      entidadId: doc._id.toString(),
      valoresAnteriores: { valor: valor.codigo, activo: !activo },
      valoresNuevos: { valor: valor.codigo, activo },
    },
    async (dimensiones) => {
      const { modifiedCount } = await dimensiones.updateOne(
        { _id: doc._id, ...condicion },
        { $set: { 'valores.$[v].activo': activo } },
        { arrayFilters: [{ 'v.codigo': valor.codigo }] },
      );
      if (modifiedCount > 0) return;
      // Otra petición cambió la dimensión entre la lectura y la escritura.
      if (activo) throw errores.valorYaActivo();
      const actual = buscarValor(await buscarDimension(doc.codigo), valor.codigo);
      throw actual.activo ? errores.ultimoValorActivo() : errores.valorYaInactivo();
    },
  );
  return obtenerDimension(doc.codigo);
}

export const desactivarValor = (codigo, valor, contexto) => cambiarEstadoValor(codigo, valor, false, contexto);
export const reactivarValor = (codigo, valor, contexto) => cambiarEstadoValor(codigo, valor, true, contexto);
