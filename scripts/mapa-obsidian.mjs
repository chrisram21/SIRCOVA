// Genera la red de Obsidian en mapa/ a partir de los encabezados de specs/ y de las historias.
// Uso (desde la raíz del repo): node scripts/mapa-obsidian.mjs [--revisar]
// --revisar no escribe nada: termina con código 1 si mapa/ no está al día.
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const RAIZ = join(import.meta.dirname, '..');
const MAPA = join(RAIZ, 'mapa');
const CARPETAS_GENERADAS = ['specs', 'historias', 'modulos', 'origenes'];
const ARCHIVOS_GENERADOS = ['Inicio.md', 'Specs.base', 'Historias.base'];
const AVISO = '> [!info] Nota generada por `scripts/mapa-obsidian.mjs`: no la edites a mano, se reescribe.';

const MODULOS = {
  'acceso-y-seguridad': 'Acceso y seguridad',
  usuarios: 'Usuarios',
  catalogos: 'Catálogos',
  configuracion: 'Configuración',
  produccion: 'Producción',
  revision: 'Revisión',
  indicadores: 'Indicadores',
  informes: 'Informes',
  plataforma: 'Plataforma',
};

const ORIGENES = {
  historia: { nota: null, nombre: 'Historia de usuario', descripcion: 'Nace de una historia de usuario.' },
  ajuste: {
    nota: 'Origen - Ajuste de una HU',
    nombre: 'Ajuste de una HU',
    descripcion: 'Modifica una historia que ya estaba terminada (ajustes de un sprint, cambios pedidos después).',
  },
  correccion: {
    nota: 'Origen - Corrección',
    nombre: 'Corrección',
    descripcion: 'No nace de una historia: corrige o mejora algo ya hecho (documentos de correcciones del sprint).',
  },
  retroalimentacion: {
    nota: 'Origen - Retroalimentación',
    nombre: 'Retroalimentación',
    descripcion: 'No nace de una historia: sale de la retroalimentación de un sprint review con la DDRISS.',
  },
  hotfix: {
    nota: 'Origen - Hotfix',
    nombre: 'Hotfix',
    descripcion: 'No nace de una historia: mantenimiento o seguridad urgente.',
  },
};

const DOCUMENTOS_CLAVE = [
  ['AGENTS', 'Reglas del proyecto para agentes y equipo'],
  ['CLAUDE', 'Notas de contexto (decisiones y trampas)'],
  ['README', 'Alcance, tecnologías y estructura'],
  ['HISTORIAS_DE_USUARIO', 'Historias de usuario y criterios de aceptación'],
  ['INSTRUCCIONES_BACKEND', 'Capas, formato de error y reglas del backend'],
  ['CONTEXTO BD', 'Modelo de datos (MySQL y MongoDB)'],
  ['CONTEXTO PROYECTO SIRCOVA', 'Resumen de la propuesta del proyecto'],
  ['descripcion_pantallas', 'Descripción de las pantallas y su estilo'],
];

const leer = (ruta) => readFileSync(ruta, 'utf8').replace(/\r\n/g, '\n');
const numero = (n) => String(n).padStart(2, '0');
const notaSpec = (n) => `SPEC ${numero(n)}`;
const notaHu = (n) => `HU-${numero(n)}`;
const notaModulo = (carpeta) => `Módulo ${MODULOS[carpeta] ?? carpeta}`;
const sinExtension = (ruta) => ruta.replace(/\.md$/, '');
const yamlTexto = (texto) => JSON.stringify(texto);
const yamlLista = (lista) => (lista.length ? `[${lista.map(yamlTexto).join(', ')}]` : '[]');
const enlace = (nota) => `[[${nota}]]`;

function campo(encabezado, nombre) {
  const linea = encabezado.find((l) => l.startsWith(`> **${nombre}:**`));
  return linea ? linea.slice(`> **${nombre}:**`.length).trim() : null;
}

function numerosHu(texto) {
  return [...texto.matchAll(/HU-(\d+)/g)].map((m) => Number(m[1]));
}

// "SPEC 13 a SPEC 21" cuenta como el rango completo.
function numerosSpec(texto) {
  const numeros = new Set();
  const sinRangos = texto.replace(/SPEC (\d+) a SPEC (\d+)/g, (_, desde, hasta) => {
    for (let n = Number(desde); n <= Number(hasta); n++) numeros.add(n);
    return '';
  });
  for (const m of sinRangos.matchAll(/SPEC (\d+)/g)) numeros.add(Number(m[1]));
  return [...numeros].sort((a, b) => a - b);
}

// Las HU principales son las de la primera frase, sin lo que va entre paréntesis;
// las demás (paréntesis o frases siguientes) solo se mencionan.
function historiasDe(textoHistoria) {
  if (!textoHistoria || /^ninguna/i.test(textoHistoria)) {
    return { principales: [], relacionadas: textoHistoria ? numerosHu(textoHistoria) : [] };
  }
  const primeraFrase = textoHistoria.replace(/\([^)]*\)/g, '').split(/[.:]/)[0];
  const principales = [...new Set(numerosHu(primeraFrase))];
  const relacionadas = [...new Set(numerosHu(textoHistoria))].filter((n) => !principales.includes(n));
  return { principales, relacionadas };
}

function origenDe(explicito, textoHistoria) {
  if (explicito) {
    const clave = explicito
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .match(/historia|ajuste|correccion|retroalimentacion|hotfix/)?.[0];
    if (clave) return clave;
    throw new Error(`Origen desconocido: «${explicito}». Usa: ${Object.keys(ORIGENES).join(', ')}.`);
  }
  const texto = textoHistoria ?? '';
  if (/^ninguna/i.test(texto)) {
    if (/hotfix/i.test(texto)) return 'hotfix';
    if (/retroalimentaci/i.test(texto)) return 'retroalimentacion';
    return 'correccion';
  }
  if (/ajuste del sprint|ya est[áa]n? terminad/i.test(texto)) return 'ajuste';
  return 'historia';
}

function leerSpecs(documentosPropuesta) {
  const specs = [];
  for (const carpeta of readdirSync(join(RAIZ, 'specs'), { withFileTypes: true })) {
    if (!carpeta.isDirectory()) continue;
    for (const archivo of readdirSync(join(RAIZ, 'specs', carpeta.name))) {
      if (!/^\d+-.*\.md$/.test(archivo)) continue;
      const ruta = join(RAIZ, 'specs', carpeta.name, archivo);
      const contenido = leer(ruta);
      const lineas = contenido.split('\n');
      const titulo = lineas[0].match(/^# SPEC (\d+)\s*[—-]\s*(.+)$/);
      if (!titulo) throw new Error(`${relative(RAIZ, ruta)}: la primera línea no es «# SPEC NN — Título».`);
      const encabezado = lineas.slice(0, 15);
      const textoHistoria = campo(encabezado, 'Historia');
      const { principales, relacionadas } = historiasDe(textoHistoria);
      specs.push({
        numero: Number(titulo[1]),
        titulo: titulo[2].trim(),
        carpeta: carpeta.name,
        ruta: sinExtension(relative(RAIZ, ruta).replaceAll('\\', '/')),
        estado: campo(encabezado, 'Estado') ?? 'Sin estado',
        textoHistoria: textoHistoria ?? '—',
        origen: origenDe(campo(encabezado, 'Origen'), textoHistoria),
        historias: principales,
        relacionadas,
        dependeDe: numerosSpec(campo(encabezado, 'Depende de') ?? ''),
        documentos: documentosPropuesta.filter((doc) => contenido.includes(doc)),
      });
    }
  }
  return specs.sort((a, b) => a.numero - b.numero);
}

function leerHistorias() {
  const historias = new Map();
  let sprint = '';
  for (const linea of leer(join(RAIZ, 'docs/SPECS/HISTORIAS_DE_USUARIO.md')).split('\n')) {
    const seccion = linea.match(/^### (.+)$/);
    if (seccion) sprint = seccion[1].split(/[(:]/)[0].trim();
    const hu = linea.match(/^#### (HU-(\d+)\. (.+))$/);
    if (hu) historias.set(Number(hu[2]), { numero: Number(hu[2]), encabezado: hu[1], titulo: hu[3].trim(), sprint });
  }
  return historias;
}

function documentosDePropuesta() {
  return readdirSync(join(RAIZ, 'docs/SPECS'))
    .filter((a) => a.endsWith('.md') && a !== 'HISTORIAS_DE_USUARIO.md')
    .map((a) => basename(a, '.md'))
    .sort();
}

const lineaSpec = (s) => `- ${enlace(notaSpec(s.numero))} — ${s.titulo} · *${s.estado}*`;

function notaDeSpec(s, porNumero, usadoPor, historias) {
  const etiquetas = ['spec', `modulo/${s.carpeta}`, `origen/${s.origen}`];
  const lineas = [
    '---',
    `numero: ${s.numero}`,
    `titulo: ${yamlTexto(s.titulo)}`,
    `modulo: ${yamlTexto(MODULOS[s.carpeta] ?? s.carpeta)}`,
    `estado: ${yamlTexto(s.estado)}`,
    `origen: ${yamlTexto(ORIGENES[s.origen].nombre)}`,
    `historias: ${yamlLista(s.historias.map((n) => enlace(notaHu(n))))}`,
    `archivo: ${yamlTexto(`${s.ruta}.md`)}`,
    `tags: ${yamlLista(etiquetas)}`,
    '---',
    '',
    `# ${notaSpec(s.numero)} — ${s.titulo}`,
    '',
    AVISO,
    '',
    `- **Spec completo:** [[${s.ruta}|abrir el spec]]`,
    `- **Módulo:** ${enlace(notaModulo(s.carpeta))}`,
    `- **Estado:** ${s.estado}`,
  ];
  const origen = ORIGENES[s.origen];
  lineas.push(`- **Origen:** ${origen.nota ? enlace(origen.nota) : origen.nombre}`);
  if (s.historias.length) {
    const nombres = s.historias.map((n) => `${enlace(notaHu(n))} ${historias.get(n)?.titulo ?? '(no está en el backlog)'}`);
    lineas.push(`- **Historia:** ${nombres.join(' · ')}`);
  }
  lineas.push(`- **Texto del encabezado:** ${s.textoHistoria}`);
  if (s.relacionadas.length) lineas.push(`- **Toca también:** ${s.relacionadas.map((n) => enlace(notaHu(n))).join(', ')}`);

  lineas.push('', '## Depende de', '');
  lineas.push(...(s.dependeDe.length ? s.dependeDe.map((n) => (porNumero.get(n) ? lineaSpec(porNumero.get(n)) : `- SPEC ${numero(n)} (no existe)`)) : ['Ninguno.']));
  lineas.push('', '## Lo usan', '');
  const usan = usadoPor.get(s.numero) ?? [];
  lineas.push(...(usan.length ? usan.map(lineaSpec) : ['Ningún spec depende de este todavía.']));
  if (s.documentos.length) {
    lineas.push('', '## Documentos relacionados', '', ...s.documentos.map((d) => `- ${enlace(d)}`));
  }
  return lineas.join('\n') + '\n';
}

function notaDeHistoria(h, specs) {
  const implementan = specs.filter((s) => s.historias.includes(h.numero));
  const tocan = specs.filter((s) => s.relacionadas.includes(h.numero));
  const estado = implementan.length ? 'Con spec' : 'Sin spec';
  const lineas = [
    '---',
    `numero: ${h.numero}`,
    `titulo: ${yamlTexto(h.titulo)}`,
    `sprint: ${yamlTexto(h.sprint)}`,
    `estado: ${yamlTexto(estado)}`,
    `specs: ${yamlLista(implementan.map((s) => enlace(notaSpec(s.numero))))}`,
    `tags: ${yamlLista(['historia'])}`,
    '---',
    '',
    `# ${h.encabezado}`,
    '',
    AVISO,
    '',
    `- **Sprint:** ${h.sprint}`,
    `- **Criterios de aceptación:** [[HISTORIAS_DE_USUARIO#${h.encabezado}|ver la historia]]`,
    `- **Estado:** ${estado}`,
    '',
    '## Specs que la implementan',
    '',
    ...(implementan.length ? implementan.map(lineaSpec) : ['Todavía ninguno.']),
  ];
  if (tocan.length) lineas.push('', '## Specs que la ajustan o la mencionan', '', ...tocan.map(lineaSpec));
  return lineas.join('\n') + '\n';
}

function notaDeModulo(carpeta, specs) {
  const propios = specs.filter((s) => s.carpeta === carpeta);
  const lineas = [
    '---',
    `tags: ${yamlLista(['modulo', `modulo/${carpeta}`])}`,
    '---',
    '',
    `# ${notaModulo(carpeta)}`,
    '',
    AVISO,
    '',
    `Carpeta: \`specs/${carpeta}/\` · ${propios.length} specs · [[Inicio]]`,
    '',
    '## Specs',
    '',
    ...(propios.length ? propios.map((s) => {
      const origen = s.origen === 'historia'
        ? s.historias.map((n) => enlace(notaHu(n))).join(', ')
        : ORIGENES[s.origen].nombre;
      return `${lineaSpec(s)} · ${origen}`;
    }) : ['Todavía ninguno.']),
  ];
  return lineas.join('\n') + '\n';
}

function notaDeOrigen(clave, specs) {
  const origen = ORIGENES[clave];
  const propios = specs.filter((s) => s.origen === clave);
  return [
    '---',
    `tags: ${yamlLista(['origen', `origen/${clave}`])}`,
    '---',
    '',
    `# ${origen.nota}`,
    '',
    AVISO,
    '',
    origen.descripcion,
    '',
    ...(propios.length ? propios.map((s) => `${lineaSpec(s)}\n  - ${s.textoHistoria}`) : ['Todavía ninguno.']),
  ].join('\n') + '\n';
}

function notaDeInicio(specs, historias) {
  const conSpec = [...historias.values()].filter((h) => specs.some((s) => s.historias.includes(h.numero)));
  const conteo = (clave) => specs.filter((s) => s.origen === clave).length;
  const estados = [...new Set(specs.map((s) => s.estado))].sort();
  return [
    '---',
    `tags: ${yamlLista(['inicio'])}`,
    '---',
    '',
    '# SIRCOVA · Mapa de la documentación',
    '',
    AVISO,
    '',
    `${specs.length} specs · ${conSpec.length} de ${historias.size} historias con spec · ${estados.map((e) => `${specs.filter((s) => s.estado === e).length} ${e}`).join(' · ')}`,
    '',
    'Primera vez aquí: [[Cómo usar el mapa]].',
    '',
    '## Módulos',
    '',
    ...Object.keys(MODULOS).map((c) => `- ${enlace(notaModulo(c))} (${specs.filter((s) => s.carpeta === c).length})`),
    '',
    '## Por origen',
    '',
    `- ${ORIGENES.historia.nombre}: ${conteo('historia')}`,
    ...Object.keys(ORIGENES).filter((c) => ORIGENES[c].nota).map((c) => `- ${enlace(ORIGENES[c].nota)}: ${conteo(c)}`),
    '',
    '## Tablas',
    '',
    '- [[Specs.base]]: todos los specs, los que no nacieron de una HU y los pendientes',
    '- [[Historias.base]]: historias con y sin spec, por sprint',
    '',
    '![[Specs.base]]',
    '',
    '## Documentos clave',
    '',
    ...DOCUMENTOS_CLAVE.map(([nota, descripcion]) => `- ${enlace(nota)} — ${descripcion}`),
  ].join('\n') + '\n';
}

const BASE_SPECS = `filters:
  and:
    - file.inFolder("mapa/specs")
properties:
  file.name:
    displayName: Spec
views:
  - type: table
    name: Todos
    order:
      - file.name
      - titulo
      - modulo
      - estado
      - origen
      - historias
    sort:
      - property: numero
        direction: ASC
  - type: table
    name: Sin historia de usuario
    filters:
      and:
        - origen != "Historia de usuario"
    order:
      - file.name
      - titulo
      - modulo
      - origen
      - historias
    sort:
      - property: numero
        direction: ASC
  - type: table
    name: Pendientes
    filters:
      and:
        - estado != "Implementado"
    order:
      - file.name
      - titulo
      - modulo
      - estado
    sort:
      - property: numero
        direction: ASC
`;

const BASE_HISTORIAS = `filters:
  and:
    - file.inFolder("mapa/historias")
properties:
  file.name:
    displayName: Historia
views:
  - type: table
    name: Todas
    order:
      - file.name
      - titulo
      - sprint
      - estado
      - specs
    sort:
      - property: numero
        direction: ASC
  - type: table
    name: Sin spec
    filters:
      and:
        - estado == "Sin spec"
    order:
      - file.name
      - titulo
      - sprint
    sort:
      - property: numero
        direction: ASC
`;

function generar() {
  const documentos = documentosDePropuesta();
  const specs = leerSpecs(documentos);
  const historias = leerHistorias();
  const porNumero = new Map(specs.map((s) => [s.numero, s]));
  const usadoPor = new Map();
  for (const s of specs) {
    for (const n of s.dependeDe) usadoPor.set(n, [...(usadoPor.get(n) ?? []), s]);
  }

  const archivos = new Map();
  for (const s of specs) archivos.set(`specs/${notaSpec(s.numero)}.md`, notaDeSpec(s, porNumero, usadoPor, historias));
  for (const h of historias.values()) archivos.set(`historias/${notaHu(h.numero)}.md`, notaDeHistoria(h, specs));
  for (const c of Object.keys(MODULOS)) archivos.set(`modulos/${notaModulo(c)}.md`, notaDeModulo(c, specs));
  for (const c of Object.keys(ORIGENES).filter((c) => ORIGENES[c].nota)) {
    archivos.set(`origenes/${ORIGENES[c].nota}.md`, notaDeOrigen(c, specs));
  }
  archivos.set('Inicio.md', notaDeInicio(specs, historias));
  archivos.set('Specs.base', BASE_SPECS);
  archivos.set('Historias.base', BASE_HISTORIAS);

  const sinCarpeta = specs.filter((s) => !MODULOS[s.carpeta]).map((s) => `${notaSpec(s.numero)} (${s.carpeta})`);
  if (sinCarpeta.length) console.warn(`Aviso: carpeta de módulo no registrada en MODULOS: ${sinCarpeta.join(', ')}`);
  return archivos;
}

function existentes() {
  const actuales = new Map();
  for (const carpeta of CARPETAS_GENERADAS) {
    const ruta = join(MAPA, carpeta);
    if (!existsSync(ruta)) continue;
    for (const archivo of readdirSync(ruta)) actuales.set(`${carpeta}/${archivo}`, leer(join(ruta, archivo)));
  }
  for (const archivo of ARCHIVOS_GENERADOS) {
    if (existsSync(join(MAPA, archivo))) actuales.set(archivo, leer(join(MAPA, archivo)));
  }
  return actuales;
}

const archivos = generar();

if (process.argv.includes('--revisar')) {
  const actuales = existentes();
  const distintos = [...new Set([...archivos.keys(), ...actuales.keys()])]
    .filter((clave) => archivos.get(clave) !== actuales.get(clave));
  if (distintos.length) {
    console.error(`mapa/ no está al día (${distintos.length} archivos). Corre: node scripts/mapa-obsidian.mjs`);
    for (const clave of distintos.slice(0, 20)) console.error(`  ${clave}`);
    process.exit(1);
  }
  console.log('mapa/ está al día.');
} else {
  for (const carpeta of CARPETAS_GENERADAS) {
    rmSync(join(MAPA, carpeta), { recursive: true, force: true });
    mkdirSync(join(MAPA, carpeta), { recursive: true });
  }
  for (const [clave, contenido] of archivos) writeFileSync(join(MAPA, clave), contenido);
  console.log(`mapa/ actualizado: ${archivos.size} archivos.`);
}
