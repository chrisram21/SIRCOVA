// Las procedencias de la tarjeta B (HU-21): el territorio de la DDRISS del establecimiento y el 9999.
const MIGRANTES = '9999';

// Por nombre, con el 9999 al final.
const enOrden = (a, b) => (a.codigoIne === MIGRANTES) - (b.codigoIne === MIGRANTES) || a.nombre.localeCompare(b.nombre, 'es');

// territorio: los municipios activos del departamento de la DDRISS, sin el propio ni el 9999 (los que atribuye el
// Excel 3). municipios: el territorio, el 9999 y los de idsGuardados (aunque estén inactivos o sean de otro
// departamento), con su nombre, sin el propio.
export async function leerProcedencias(ejecutor, { ddrissId, municipioPropioId }, idsGuardados = []) {
  const [filas] = await ejecutor.query(
    `SELECT m.id, m.codigo_ine, m.nombre, m.activo, m.departamento_id = d.departamento_id AS del_departamento
       FROM municipio m
       JOIN ddriss d ON d.id = ?
      WHERE m.id <> ?
        AND ((m.activo = TRUE AND (m.codigo_ine = ? OR m.departamento_id = d.departamento_id)) OR m.id IN (?))`,
    [ddrissId, municipioPropioId, MIGRANTES, idsGuardados.length > 0 ? idsGuardados : [0]],
  );
  const municipios = filas
    .map((f) => ({ id: f.id, codigoIne: f.codigo_ine, nombre: f.nombre, activo: Boolean(f.activo), delDepartamento: Boolean(f.del_departamento) }))
    .sort(enOrden);
  return {
    territorio: municipios.filter((m) => m.activo && m.delDepartamento && m.codigoIne !== MIGRANTES).map((m) => m.id),
    migrantes: municipios.find((m) => m.activo && m.codigoIne === MIGRANTES)?.id ?? null,
    municipios: municipios.map(({ id, codigoIne, nombre }) => ({ id, codigoIne, nombre })),
  };
}

// PROPIO_Y_OTROS replica el 5C: los otros municipios van juntos en el 9999, sin importar permiteNoEspecificado.
export function procedenciasPermitidas(esquema, { territorio, migrantes }) {
  if (!esquema) return [];
  const conMigrantes = migrantes === null ? [] : [migrantes];
  if (esquema.procedencia.modo === 'PROPIO_Y_OTROS') return conMigrantes;
  return [...territorio, ...(esquema.procedencia.permiteNoEspecificado ? conMigrantes : [])];
}
