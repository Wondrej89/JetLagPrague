import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { unzipSync } from 'fflate';

const MAX_BYTES = 100 * 1024 * 1024;
const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export interface PidInput {
  json: unknown;
  sourceFile: string;
  archiveEntry: string | null;
  bytes: number;
  sha256: string;
  containerSha256: string | null;
  ignoredEmptyFiles: string[];
}

/** Read in memory only: archives never extract files onto the filesystem. */
export async function readPidInput(directory: string, name: string): Promise<PidInput> {
  let names: string[];
  try { names = await readdir(directory); }
  catch { throw new Error(`Chybí adresář ${directory}.`); }
  const matches: { bytes: Uint8Array; sourceFile: string; entry: string | null; containerSha256: string | null }[] = [];
  const ignoredEmptyFiles: string[] = [];
  for (const file of names.sort()) {
    if (file !== name && file !== `${name}.gz` && !file.toLowerCase().endsWith('.zip')) continue;
    const path = join(directory, file);
    const info = await stat(path);
    if (!info.isFile()) continue;
    if (info.size > MAX_BYTES) throw new Error(`${file}: limit zdrojového souboru je 100 MiB.`);
    const container = await readFile(path);
    if (file === name) {
      if (!container.toString('utf8').trim()) { ignoredEmptyFiles.push(file); continue; }
      matches.push({ bytes: container, sourceFile: file, entry: null, containerSha256: null });
    } else if (file === `${name}.gz`) {
      let bytes: Uint8Array;
      try { bytes = gunzipSync(container, { maxOutputLength: MAX_BYTES }); }
      catch { throw new Error(`${file}: poškozený GZIP nebo rozbalená data překračují 100 MiB.`); }
      matches.push({ bytes, sourceFile: file, entry: name, containerSha256: hash(container) });
    } else {
      let entries: Record<string, Uint8Array>;
      try {
        entries = unzipSync(container, { filter: entry => {
          if (basename(entry.name.replaceAll('\\', '/')) !== name) return false;
          if (entry.originalSize > MAX_BYTES) throw new Error('Rozbalený soubor překračuje limit.');
          return true;
        } });
      } catch { throw new Error(`${file}: neplatný ZIP nebo rozbalená data překračují 100 MiB.`); }
      for (const [entry, bytes] of Object.entries(entries)) matches.push({ bytes, sourceFile: file, entry, containerSha256: hash(container) });
    }
  }
  if (!matches.length) throw new Error(ignoredEmptyFiles.length ? `${name} je prázdný. Nahrajte skutečný JSON nebo ZIP obsahující ${name}.` : `Chybí ${name}, ${name}.gz nebo ZIP obsahující ${name}.`);
  const checksums = new Set(matches.map(match => hash(match.bytes)));
  if (checksums.size !== 1) throw new Error(`${name}: nalezeno více rozdílných verzí. Ponechte pouze zamýšlený JSON nebo archiv.`);
  const match = matches[0];
  let json: unknown;
  try { json = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(match.bytes).replace(/^\uFEFF/, '')); }
  catch { throw new Error(`${match.sourceFile}${match.entry ? ` → ${match.entry}` : ''}: neplatný UTF-8 JSON. Nahrajte originální soubor, nikoli uloženou HTML stránku.`); }
  if (!json || typeof json !== 'object') throw new Error(`${name}: očekáván JSON objekt nebo pole.`);
  return { json, sourceFile: match.sourceFile, archiveEntry: match.entry, bytes: match.bytes.length, sha256: hash(match.bytes), containerSha256: match.containerSha256, ignoredEmptyFiles };
}
