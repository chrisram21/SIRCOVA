import ExcelJS from 'exceljs';
import { etiquetaAccion, etiquetaModulo, fechaYHora } from './textosBitacora.js';
import { hojaDeInformacion, pintarTabla, prepararHojaDeDatos } from '../informes/plantillaExcel.js';

// SPEC 70 (HU-54): el libro .xlsx de la bitácora filtrada. Recibe los registros en la forma de GET /auditoria/bitacora
// y no consulta nada. El aspecto sale de plantillaExcel.js, común con los informes: la hoja «Información» y la de
// los registros.

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
 * registros: los elementos de GET /auditoria/bitacora, ya ordenados. datos: { ddriss, ddrissCodigo (el logo, SPEC 78
 * o null), generadoPor, generadoEn (Date),
 * filtros: [[etiqueta, valor]] }; el de «Fechas» va arriba a la derecha como periodo.
 */
export function libroDeBitacora(registros, datos) {
  const libro = new ExcelJS.Workbook();
  libro.creator = 'SIRCOVA';
  libro.created = datos.generadoEn;
  const generado = `${fechaYHora(datos.generadoEn)} por ${datos.generadoPor}`;
  const titulo = 'Bitácora del sistema';
  hojaDeInformacion(libro, {
    marca: 'Auditoría del sistema',
    rotulo: 'AUDITORÍA',
    titulo,
    lineas: [
      ['DDRISS', datos.ddriss],
      ...datos.filtros,
      ['Registros', registros.length],
      ['Generado', generado],
    ],
    periodo: 'Fechas',
    hojasDeDatos: ['Bitácora'],
    ddrissCodigo: datos.ddrissCodigo,
  });

  const hoja = libro.addWorksheet('Bitácora');
  COLUMNAS.forEach((c, i) => { hoja.getColumn(i + 1).width = c.ancho; });
  hoja.addRow(COLUMNAS.map((c) => c.titulo)).alignment = { vertical: 'middle', wrapText: true };
  for (const registro of registros) {
    hoja.addRow(COLUMNAS.map((c) => c.valor(registro))).alignment = { vertical: 'top' };
  }
  pintarTabla(hoja, { desde: 1, filasEncabezado: 1, hasta: hoja.rowCount, columnas: COLUMNAS.length });
  hoja.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNAS.length } };
  prepararHojaDeDatos(hoja, { filasEncabezado: 1, titulo, generado });
  return libro;
}
