import { readDefaultGameArea } from '@jetlag/geo-core';

export async function loadDefaultGameArea(signal?: AbortSignal) {
  const response = await fetch(`${import.meta.env.BASE_URL}defaults/prague-game-area.geojson`, { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error(`Výchozí hranice Prahy není dostupná (HTTP ${response.status}).`);
  return readDefaultGameArea(await response.json());
}
