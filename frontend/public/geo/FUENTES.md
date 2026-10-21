# Fuentes de datos geográficos

## `san-marcos.geojson`

Límites de los 30 municipios del departamento de San Marcos que usa el mapa territorial (HU-42). Es una **adaptación** de un conjunto de datos de terceros y conserva su licencia.

### Fuente

| Campo | Valor |
|---|---|
| Título | Guatemala - Subnational Administrative Boundaries (COD-AB), versión v01 |
| Autor de los datos | Coordinadora Nacional para la Reducción de Desastres (CONRED) |
| Publicado por | OCHA Field Information Services Section (FISS), en Humanitarian Data Exchange (HDX) |
| Enlace | https://data.humdata.org/dataset/cod-ab-gtm |
| Archivo original | `gtm_admin_boundaries.geojson.zip` → `gtm_admin2.geojson` (342 municipios) |
| Válido desde | 2019-02-07 |
| Última revisión de OCHA | 2025-10-30 |
| Descargado | 2026-10-20 |

### Licencia

[Creative Commons Attribution 3.0 IGO (CC BY 3.0 IGO)](https://creativecommons.org/licenses/by/3.0/igo/) · [texto legal](https://creativecommons.org/licenses/by/3.0/igo/legalcode)

Permite usar, adaptar y redistribuir los datos, incluso con fines comerciales, siempre que se cumpla lo siguiente:

1. Dar crédito al autor y a la fuente.
2. Incluir el enlace a la licencia.
3. Indicar que los datos fueron modificados.
4. No dar a entender que CONRED, OCHA, HDX o las Naciones Unidas respaldan el sistema ni su uso. No se usan sus logos.
5. Retirar el crédito si el autor lo solicita.

Los datos se entregan "tal cual", sin garantía. Son límites de referencia: no constituyen límites legales oficiales.

### Cambios respecto al original

1. Se conservaron solo los 30 municipios de San Marcos (`adm1_pcode = GT12`).
2. Se reemplazaron los atributos por `codigo_ine` (`adm2_pcode` sin el prefijo `GT`) y `nombre` (`adm2_name`).
3. Se simplificaron los contornos al 20 % de los vértices con mapshaper 0.6.121 (`-simplify 20% keep-shapes`), conservando los bordes compartidos entre municipios.
4. Se redujeron las coordenadas a 5 decimales (precisión aproximada de 1 m).
5. Se ordenaron los municipios por `codigo_ine` y se agregó el objeto `metadatos` con esta información al inicio del archivo. Leaflet lo ignora.

Resultado: 30 polígonos, 1676 vértices, unos 40 KB. Al unir los 30 municipios queda un solo polígono sin huecos.

### Correspondencia con la base de datos

`codigo_ine` coincide con `municipio.codigo_ine` de `backend/db/01_modelo_relacional_mysql.sql` en los 30 municipios, del 1201 (San Marcos) al 1230 (La Blanca), en código y nombre. Se comprobó el 2026-10-20. Los registros especiales `9999` (Migrantes) y `0920` (Coatepeque) no tienen polígono en este archivo.

### Crédito que muestra el sistema

En el control de atribución del mapa de Leaflet, junto al crédito propio de Leaflet:

> Límites: [CONRED / OCHA (HDX)](https://data.humdata.org/dataset/cod-ab-gtm) · [CC BY 3.0 IGO](https://creativecommons.org/licenses/by/3.0/igo/) · adaptado

El crédito completo, con la nota de que los límites son de referencia, va también en la sección de créditos del sistema y en el manual de usuario.
