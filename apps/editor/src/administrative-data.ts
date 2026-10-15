import { readAdministrativeSnapshot, type GeoLayer } from '@jetlag/geo-core';

export async function loadBundledAdministrativeData(signal?: AbortSignal): Promise<GeoLayer[]> {
  const base = `${import.meta.env.BASE_URL}administrative/`;
  const indexResponse = await fetch(`${base}index.json`, { signal, cache: 'no-cache' });
  if (!indexResponse.ok) throw new Error('Přibalené administrativní hranice nejsou dostupné. Vlastní objekty a herní oblast zůstávají funkční.');
  if (!indexResponse.headers.get('content-type')?.includes('json')) throw new Error('V sestavení chybí katalog oficiálních hranic.');
  const index = await indexResponse.json() as { schemaVersion?: number; datasets?: { id: string; file: string }[] };
  if (index.schemaVersion !== 1 || index.datasets?.length !== 2 || new Set(index.datasets.map(d => d.id)).size !== 2) throw new Error('Katalog hranic musí obsahovat městské části i katastrální území.');
  return Promise.all(index.datasets.map(async entry => {
    if (!/^[a-z0-9-]+\.json$/.test(entry.file)) throw new Error('Neplatná cesta k přibaleným datům.');
    const response = await fetch(base + entry.file, { signal });
    if (!response.ok) throw new Error(`Nepodařilo se načíst ${entry.file}.`);
    const layer = await readAdministrativeSnapshot(await response.json());
    if (layer.dataset?.id !== entry.id) throw new Error('Identita datasetu neodpovídá katalogu.');
    return layer;
  }));
}
