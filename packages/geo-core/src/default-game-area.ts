import { z } from 'zod';
import { canonicalJson } from './administrative';
import { sha256 } from './pid-snapshot';
import { municipalGameArea } from './territory';
import { isArea, newFeature, sourceDatasetSchema, validateGeometry, type AreaGeometry, type GeoLayer } from './index';

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const propertiesSchema = z.object({
  format: z.literal('jetlag-praha-default-game-area'), schemaVersion: z.literal(1),
  name: z.string().min(1), preparedAt: z.iso.datetime(),
  processing: z.string().min(1), dataset: z.lazy(() => sourceDatasetSchema),
  codes: z.array(z.string().min(1)).length(57).refine(codes => new Set(codes).size === 57, 'Kódy městských částí musí být jedinečné.'),
  geometryChecksum: digest, checksum: digest,
});
const defaultAreaSchema = z.object({ type: z.literal('Feature'), id: z.literal('praha-default-game-area:v1'), properties: propertiesSchema, geometry: z.unknown() });
export type DefaultGameArea = Omit<z.infer<typeof defaultAreaSchema>, 'geometry'> & { geometry: AreaGeometry };
function checksumContent(value: DefaultGameArea) {
  return { ...value, properties: { ...value.properties, checksum: undefined } };
}
/** Build-time only: the application reads the prepared polygon, never repeats
 * a 57-part union during startup or restoration. Coordinates are not simplified. */
export async function prepareDefaultGameArea(layer: GeoLayer): Promise<DefaultGameArea> {
  const boundary = municipalGameArea(layer);
  if (!isArea(boundary.geometry)) throw new Error('Výchozí oblast musí být polygon.');
  const value: DefaultGameArea = {
    type: 'Feature', id: 'praha-default-game-area:v1', geometry: boundary.geometry,
    properties: { format: 'jetlag-praha-default-game-area', schemaVersion: 1, name: boundary.name,
      preparedAt: new Date().toISOString(), processing: 'municipalGameArea(): skutečné sjednocení všech 57 městských částí, WGS84 / RFC 7946, bez zjednodušení a zaokrouhlení; zachovány otvory a nesouvislé části.',
      dataset: layer.dataset!, codes: boundary.attributes.codes as string[], geometryChecksum: await sha256(canonicalJson(boundary.geometry)), checksum: '0'.repeat(64) },
  };
  value.properties.checksum = await sha256(canonicalJson(checksumContent(value)));
  return readDefaultGameArea(value);
}
export async function readDefaultGameArea(input: unknown): Promise<DefaultGameArea> {
  const parsed = defaultAreaSchema.parse(typeof input === 'string' ? JSON.parse(input) : input);
  const geometry = validateGeometry(parsed.geometry);
  if (!isArea(geometry)) throw new Error('Výchozí herní oblast musí být polygon.');
  const value: DefaultGameArea = { ...parsed, geometry };
  if (value.properties.dataset.id !== 'praha-municipal' || value.properties.dataset.featureCount !== 57) throw new Error('Výchozí Praha nemá doložený zdroj všech 57 městských částí.');
  if (await sha256(canonicalJson(geometry)) !== value.properties.geometryChecksum || await sha256(canonicalJson(checksumContent(value))) !== value.properties.checksum) throw new Error('Kontrolní součet výchozí herní oblasti Prahy nesouhlasí.');
  return value;
}
/** Every world gets its own feature ID; the prepared source and geometry stay
 * unchanged and all provenance is retained in standard GeoJSON attributes. */
export function defaultGameAreaFeature(value: DefaultGameArea) {
  const { dataset, codes, checksum, geometryChecksum, schemaVersion, preparedAt } = value.properties;
  return { ...newFeature(value.geometry, value.properties.name, `${dataset.provider} · ${dataset.sourceUrl}`),
    note: 'Výchozí hranice Prahy předpočítaná ze všech 57 městských částí. Zdrojové aktualizace ani nasazení tuto uloženou hranici automaticky nemění.',
    attributes: { preset: 'praha-municipal-union', datasetId: dataset.id, datasetVersion: dataset.version, datasetChecksum: dataset.checksum,
      provider: dataset.provider, sourceUrl: dataset.sourceUrl, license: { ...dataset.license }, dataDate: dataset.dataDate, retrievedAt: dataset.retrievedAt,
      codes: [...codes], defaultAreaVersion: schemaVersion, defaultAreaChecksum: checksum, defaultAreaGeometryChecksum: geometryChecksum, defaultAreaPreparedAt: preparedAt },
  };
}
