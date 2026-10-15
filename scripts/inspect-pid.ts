import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readPidInput } from './pid-input';

// Discover the actual source schema before writing a source-specific adapter.
// No inferred identifiers, mode codes, joins or eligibility decisions are produced.
const directory = resolve(process.argv[2] ?? 'data/raw/pid');
const names = ['Zastavky_WGS84.json', 'stops.json', 'Linky_7d_WGS84.json'];
const report: Record<string, unknown> = {};
let missing = false;
let inspected = 0;
function typeOf(value: unknown): string { return value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value; }
function structure(value: unknown, path: string, output: Record<string, unknown>, depth = 0): void {
  if (depth > 7) return;
  if (Array.isArray(value)) {
    output[path || '/'] = { type: 'array', length: value.length };
    if (value.length) structure(value[0], `${path}/*`, output, depth + 1);
  } else if (value && typeof value === 'object') {
    output[path || '/'] = { type: 'object', keys: Object.keys(value) };
    for (const [key, child] of Object.entries(value)) structure(child, `${path}/${key.replace(/~/g, '~0').replace(/\//g, '~1')}`, output, depth + 1);
  } else output[path || '/'] = { type: typeOf(value), example: value };
}
for (const name of names) {
  let input;
  try { input = await readPidInput(directory, name); }
  catch (error) {
    const message = error instanceof Error ? error.message : 'Zdroj nelze načíst.';
    console.error(message); report[name] = { error: message }; missing = true; continue;
  }
  const { json, ...metadata } = input;
  for (const file of input.ignoredEmptyFiles) console.warn(`${file}: prázdný soubor ignorován, použito ${input.sourceFile}.`);
  const schema: Record<string, unknown> = {};
  structure(json, '', schema);
  const source: Record<string, unknown> = { ...metadata, schema };
  if (json && typeof json === 'object' && 'type' in json && json.type === 'FeatureCollection' && 'features' in json && Array.isArray(json.features)) {
    const features = json.features as { geometry?: { type?: string }; properties?: Record<string, unknown> }[];
    const attributes: Record<string, { types: Set<string>; present: number; distinct: Set<string> }> = {};
    const geometries: Record<string, number> = {};
    for (const feature of features) {
      const geometry = feature.geometry?.type ?? 'missing'; geometries[geometry] = (geometries[geometry] ?? 0) + 1;
      for (const [key, value] of Object.entries(feature.properties ?? {})) {
        const field = attributes[key] ??= { types: new Set(), present: 0, distinct: new Set() };
        field.types.add(typeOf(value)); field.present++;
        if (typeof value !== 'object') field.distinct.add(JSON.stringify(value));
      }
    }
    source.features = features.length; source.geometries = geometries;
    source.attributes = Object.fromEntries(Object.entries(attributes).map(([key, value]) => [key, { types: [...value.types], present: value.present, distinctValues: value.distinct.size, examples: [...value.distinct].slice(0, 5).map(value => JSON.parse(value)) }]));
  }
  report[name] = source;
  inspected++;
}
if (missing) { console.error('Importér PID zatím nelze ověřit. Doplňte všechny tři nezměněné oficiální soubory; žádná data editoru nebyla změněna.'); process.exitCode = 1; }
await mkdir('data/reports', { recursive: true });
await writeFile('data/reports/pid-inspection.json', `${JSON.stringify(report, null, 2)}\n`);
console.log(`Prozkoumáno ${inspected}/${names.length} zdrojů. Report: data/reports/pid-inspection.json`);
