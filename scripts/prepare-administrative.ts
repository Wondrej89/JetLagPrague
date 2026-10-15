import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { createAdministrativeSnapshot, readAdministrativeSnapshot, sourceDatasetSchema } from '../packages/geo-core/src/index';

const args = process.argv.slice(2);
function option(name: string, required = true): string | undefined {
  const index = args.indexOf(`--${name}`);
  if (index < 0 || !args[index + 1] || args[index + 1].startsWith('--')) {
    if (required) throw new Error(`Chybí --${name}. Použití: npm run data:prepare -- --input data.geojson --metadata source.json --code-field KOD --name-field NAZEV [--filter-field OBEC_KOD --filter-value 554782]`);
    return undefined;
  }
  return args[index + 1];
}
try {
  const inputPath = resolve(option('input')!);
  const metadata = sourceDatasetSchema.omit({ checksum: true, featureCount: true }).parse(JSON.parse(await readFile(resolve(option('metadata')!), 'utf8')));
  const code = option('code-field')!; const name = option('name-field')!;
  if (metadata.codeField !== code) throw new Error('Pole oficiálního kódu neodpovídá metadatům.');
  const rawInput = await readFile(inputPath);
  if (metadata.provenance && createHash('sha256').update(rawInput).digest('hex') !== metadata.provenance.rawSha256) throw new Error('SHA-256 původního souboru neodpovídá evidovaným metadatům.');
  const input = JSON.parse(rawInput.toString('utf8'));
  // CRS84 výslovně definuje WGS84 v pořadí délka/šířka. Nejde o transformaci souřadnic.
  if (input.crs?.type === 'name' && input.crs?.properties?.name === 'urn:ogc:def:crs:OGC:1.3:CRS84') delete input.crs;
  const filter = option('filter-field', false); const filterValue = option('filter-value', false);
  if (!!filter !== !!filterValue) throw new Error('Filtr potřebuje současně --filter-field a --filter-value.');
  if (filter && filterValue) {
    if (!Array.isArray(input.features) || input.features.some((f: { properties?: Record<string, unknown> }) => !f.properties || !(filter in f.properties))) throw new Error('Zdroj nemá uvedené pole filtru.');
    input.features = input.features.filter((f: { properties: Record<string, unknown> }) => String(f.properties[filter]) === filterValue);
  }
  const snapshot = await createAdministrativeSnapshot(input, metadata, { code, name });
  const output = resolve(option('output-dir', false) ?? 'apps/editor/public/administrative', metadata.id === 'praha-municipal' ? 'municipal.json' : 'cadastral.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output + '.tmp', JSON.stringify(snapshot)); await rename(output + '.tmp', output);
  console.log(`${basename(output)}: ${snapshot.features.length} území; SHA-256 ${snapshot.dataset.checksum}`);
  // Katalog vznikne teprve tehdy, jsou-li obě reálné sady připravené a validní.
  const other = resolve(dirname(output), metadata.id === 'praha-municipal' ? 'cadastral.json' : 'municipal.json');
  let otherContents: string | null = null;
  try { otherContents = await readFile(other, 'utf8'); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  if (otherContents) {
    await readAdministrativeSnapshot(otherContents);
    const indexPath = resolve(dirname(output), 'index.json');
    await writeFile(indexPath + '.tmp', JSON.stringify({ schemaVersion: 1, datasets: [{ id: 'praha-municipal', file: 'municipal.json' }, { id: 'praha-cadastral', file: 'cadastral.json' }] }, null, 2));
    await rename(indexPath + '.tmp', indexPath);
    console.log('Katalog obsahuje obě validované datové sady. Spusťte npm run data:check.');
  } else console.log('Druhá datová sada dosud chybí; katalog zatím nebyl vytvořen.');
} catch (error) { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }
