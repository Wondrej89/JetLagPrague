import type { AreaGeometry, GameStop, GeoFeature, GeoLayer, HidingCoverage } from '@jetlag/geo-core';

export type TerritoryCommand = { action: 'prague'; layer: GeoLayer } | { action: 'coverage'; stops: GameStop[]; area: AreaGeometry; radius: number };
// A dedicated, disposable worker keeps large unions away from map interactions
// and PID refresh. Dependency changes cancel the computation, not just its result.
export function territoryTask<T extends GeoFeature | HidingCoverage>(command: TerritoryCommand, signal?: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./territory.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal?.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Výpočet byl zrušen.', 'AbortError')); };
    if (signal?.aborted) { cancel(); return; }
    signal?.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => { cleanup(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.value); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Geografický výpočet selhal.')); };
    worker.postMessage(command);
  });
}
