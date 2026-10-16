import type { ParkFileInfo, ParkImportOptions, ParkImportReport } from '../../../packages/geo-core/src/park-import';
export type ParkImportCommand = { action: 'inspect'; bytes: ArrayBuffer; filename: string } | { action: 'analyze'; bytes: ArrayBuffer; filename: string; options: ParkImportOptions };
export function parkImportTask<T extends ParkFileInfo | ParkImportReport>(command: ParkImportCommand, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./park-import.worker.ts', import.meta.url), { type: 'module' });
    const cleanup = () => { worker.terminate(); signal.removeEventListener('abort', cancel); };
    const cancel = () => { cleanup(); reject(new DOMException('Import byl zrušen.', 'AbortError')); };
    if (signal.aborted) { cancel(); return; }
    signal.addEventListener('abort', cancel, { once: true });
    worker.onmessage = event => { cleanup(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.value); };
    worker.onerror = event => { cleanup(); reject(new Error(event.message || 'Import parků selhal.')); };
    worker.postMessage(command, [command.bytes]);
  });
}
