// Parte la documentación en fragmentos, calcula sus embeddings con Ollama y guarda el índice en JSON.
// No toca ninguna base de datos.
import fs from 'node:fs';
import path from 'node:path';
import { embeber, MODELO_EMBEDDINGS } from './ollama.js';

const raizRepo = path.resolve(import.meta.dirname, '..', '..', '..');
export const RUTA_INDICE = path.join(import.meta.dirname, 'indice-rag.json');

const FUENTES = [
  'docs/contexto/CONTEXTO PROYECTO SIRCOVA.md',
  'docs/SPECS/HISTORIAS_DE_USUARIO.md',
  'docs/mockups/descripcion_pantallas.md',
];
const LARGO_MAXIMO = 1500;
const LARGO_MINIMO = 80;
const LOTE = 16;

function partirEnSecciones(texto) {
  const secciones = [];
  let titulo = '';
  let lineas = [];
  const cerrar = () => {
    const cuerpo = lineas.join('\n').trim();
    if (cuerpo.length >= LARGO_MINIMO) secciones.push({ titulo, cuerpo });
  };
  for (const linea of texto.split(/\r?\n/)) {
    const encabezado = /^#{1,4}\s+(.*)/.exec(linea);
    if (encabezado) {
      cerrar();
      titulo = encabezado[1].trim();
      lineas = [];
    } else {
      lineas.push(linea);
    }
  }
  cerrar();
  return secciones;
}

// Las secciones largas se cortan por párrafos para que cada fragmento quepa en el contexto del modelo.
function partirLargas({ titulo, cuerpo }) {
  if (cuerpo.length <= LARGO_MAXIMO) return [{ titulo, cuerpo }];
  const piezas = [];
  let actual = '';
  for (const parrafo of cuerpo.split(/\n\s*\n/)) {
    if (actual && actual.length + parrafo.length > LARGO_MAXIMO) {
      piezas.push(actual);
      actual = '';
    }
    actual += (actual ? '\n\n' : '') + parrafo;
  }
  if (actual) piezas.push(actual);
  return piezas.map((pieza) => ({ titulo, cuerpo: pieza }));
}

async function indexar() {
  const fragmentos = FUENTES.flatMap((fuente) => {
    const texto = fs.readFileSync(path.join(raizRepo, fuente), 'utf8');
    return partirEnSecciones(texto)
      .flatMap(partirLargas)
      .map((seccion) => ({ fuente, ...seccion }));
  });

  console.log(`${fragmentos.length} fragmentos de ${FUENTES.length} documentos; calculando embeddings con ${MODELO_EMBEDDINGS}…`);
  for (let i = 0; i < fragmentos.length; i += LOTE) {
    const lote = fragmentos.slice(i, i + LOTE);
    const vectores = await embeber(lote.map((f) => `${f.titulo}\n${f.cuerpo}`));
    lote.forEach((fragmento, j) => (fragmento.vector = vectores[j]));
    process.stdout.write(`\r  ${Math.min(i + LOTE, fragmentos.length)}/${fragmentos.length}`);
  }

  fs.writeFileSync(RUTA_INDICE, JSON.stringify({ modelo: MODELO_EMBEDDINGS, fragmentos }));
  console.log(`\nÍndice guardado en ${path.relative(process.cwd(), RUTA_INDICE)}`);
}

if (import.meta.main) {
  indexar().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
