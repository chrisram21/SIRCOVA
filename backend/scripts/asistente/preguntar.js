// Asistente de consola con RAG sobre la documentación de SIRCOVA.
// Uso: node scripts/asistente/preguntar.js [--ver-trozos] "pregunta"   (sin pregunta abre un modo interactivo)
// --ver-trozos muestra cada trozo del streaming en su propia línea, con los milisegundos desde que se preguntó.
import readline from 'node:readline/promises';
import { buscar } from './rag.js';
import { conversar, conversarEnStreaming, MODELO_CHAT } from './ollama.js';
import { HERRAMIENTAS, ejecutarHerramienta } from './herramientas.js';

const argumentos = process.argv.slice(2);
const verTrozos = argumentos.includes('--ver-trozos');
const hoy = new Date().toLocaleDateString('es-GT', { day: 'numeric', month: 'long', year: 'numeric' });

const SYSTEM_PROMPT = `Eres el asistente de SIRCOVA, el sistema web de producción de vacunación de la DDRISS San Marcos (MSPAS, Guatemala).
Hoy es ${hoy}.
Respondes siempre en español, de forma breve y clara, con texto para el usuario y nunca con JSON.
Para preguntas sobre cómo funciona el sistema, usa solo la información del CONTEXTO; si no está ahí, di que no tienes esa información.
Para preguntas sobre cuántos reportes hay o en qué estado están en un mes, llama a la herramienta consultar_reportes_por_estado y responde con sus datos, sin inventar cifras.
El sistema maneja solo datos agregados: nunca pidas ni inventes datos de pacientes.

TEMA PROHIBIDO: la cobertura de vacunación (su cálculo, fórmula, metas, porcentajes, brechas de cobertura o comparaciones de cobertura).
Si la pregunta trata de cobertura, aunque el CONTEXTO tenga información sobre ella, NO la respondas, no llames herramientas y contesta exactamente:
"Lo siento, no puedo responder preguntas sobre cobertura de vacunación. Consulta el módulo de Indicadores o al Departamento de Epidemiología."
Cualquier otro tema del sistema se responde con normalidad.`;

function armarContexto(fragmentos) {
  return fragmentos.map((f, i) => `[${i + 1}] (${f.fuente} · ${f.titulo})\n${f.cuerpo}`).join('\n\n---\n\n');
}

async function responder(pregunta) {
  const fragmentos = await buscar(pregunta);
  console.log('\n[RAG] fragmentos recuperados:');
  for (const f of fragmentos) console.log(`  ${f.puntaje.toFixed(3)}  ${f.fuente} · ${f.titulo}`);

  const mensajes = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: `CONTEXTO:\n${armarContexto(fragmentos)}\n\nPREGUNTA: ${pregunta}` },
  ];
  const inicio = Date.now();
  let trozos = 0;
  const alRecibir = (texto) => {
    if (trozos++ === 0) console.log(`\n[${MODELO_CHAT}] (streaming)`);
    if (verTrozos) console.log(`  [trozo ${trozos} · +${Date.now() - inicio} ms] ${JSON.stringify(texto)}`);
    else process.stdout.write(texto);
  };

  // Primera llamada sin streaming: solo decide si hace falta la herramienta. La respuesta final va en streaming.
  const decision = await conversar(mensajes, { herramientas: HERRAMIENTAS });
  if (decision.tool_calls?.length) {
    // Con datos de la herramienta no hace falta la documentación, y sus fragmentos sobre cobertura
    // hacían que el modelo aplicara la regla del tema prohibido a preguntas de reportes.
    mensajes[1] = { role: 'user', content: `PREGUNTA: ${pregunta}` };
    mensajes.push(decision);
    for (const { function: llamada } of decision.tool_calls) {
      console.log(`\n[herramienta] ${llamada.name}(${JSON.stringify(llamada.arguments)})`);
      const resultado = await ejecutarHerramienta(llamada.name, llamada.arguments);
      console.log(`[herramienta] resultado: ${JSON.stringify(resultado)}`);
      mensajes.push({ role: 'tool', tool_name: llamada.name, content: JSON.stringify(resultado) });
    }
  }
  await conversarEnStreaming(mensajes, alRecibir);
  console.log(`\n\n(${trozos} trozos en ${Date.now() - inicio} ms)\n`);
}

async function principal() {
  const pregunta = argumentos.filter((a) => a !== '--ver-trozos').join(' ').trim();
  if (pregunta) return responder(pregunta);

  const consola = readline.createInterface({ input: process.stdin, output: process.stdout });
  console.log('Asistente SIRCOVA (escribe "salir" para terminar)');
  for (;;) {
    const linea = (await consola.question('> ')).trim();
    if (linea === 'salir') break;
    if (linea) await responder(linea).catch((err) => console.error(err.message));
  }
  consola.close();
}

principal().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
