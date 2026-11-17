import ExcelJS from 'exceljs';
import { etiquetaAccion, etiquetaModulo, fechaYHora } from './textosBitacora.js';

// SPEC 70 (HU-54): el libro .xlsx de la bitácora filtrada. Recibe los registros en la forma de GET /auditoria/bitacora
// y no consulta nada.

export const COLUMNAS = [
  { titulo: 'Fecha y hora', ancho: 20, valor: (r) => fechaYHora(new Date(r.fecha)) },
  { titulo: 'Usuario', ancho: 30, valor: (r) => r.usuario?.nombre ?? `Intento: ${r.nombreUsuarioIntento ?? '—'}` },
  { titulo: 'Rol', ancho: 24, valor: (r) => r.usuario?.rol.nombre ?? '' },
  { titulo: 'Módulo', ancho: 16, valor: (r) => etiquetaModulo(r.modulo) },
  { titulo: 'Acción', ancho: 26, valor: (r) => etiquetaAccion(r.accion) },
  { titulo: 'Entidad', ancho: 24, valor: (r) => r.entidad },
  { titulo: 'Id', ancho: 14, valor: (r) => r.entidadId ?? '' },
  { titulo: 'Valores anteriores', ancho: 50, valor: (r) => aJson(r.valoresAnteriores) },
  { titulo: 'Valores nuevos', ancho: 50, valor: (r) => aJson(r.valoresNuevos) },
  { titulo: 'IP', ancho: 16, valor: (r) => r.ipOrigen ?? '' },
  { titulo: 'Agente', ancho: 40, valor: (r) => r.agenteUsuario ?? '' },
];

const aJson = (valor) => (valor == null ? '' : JSON.stringify(valor));

/**
 * registros: los elementos de GET /auditoria/bitacora, ya ordenados. datos: { ddriss, generadoPor, generadoEn (Date),
 * filtros: [[etiqueta, valor]] }.
 */
export function libroDeBitacora(registros, datos) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = datos.generadoEn;
  const hoja = libro.addWorksheet('Bitácora');

  hoja.addRow(['Bitácora del sistema']).font = { bold: true, size: 14 };
  const encabezado = [
    ['DDRISS', datos.ddriss],
    ...datos.filtros,
    ['Registros', registros.length],
    ['Generado', `${fechaYHora(datos.generadoEn)} por ${datos.generadoPor}`],
  ];
  for (const [etiqueta, valor] of encabezado) hoja.addRow([etiqueta, valor]).getCell(1).font = { bold: true };

  hoja.addRow([]);
  const titulos = hoja.addRow(COLUMNAS.map((c) => c.titulo));
  titulos.font = { bold: true };
  for (const registro of registros) hoja.addRow(COLUMNAS.map((c) => c.valor(registro)));

  COLUMNAS.forEach((c, i) => { hoja.getColumn(i + 1).width = c.ancho; });
  hoja.autoFilter = { from: { row: titulos.number, column: 1 }, to: { row: titulos.number, column: COLUMNAS.length } };
  hoja.views = [{ state: 'frozen', ySplit: titulos.number }];
  return libro;
}
