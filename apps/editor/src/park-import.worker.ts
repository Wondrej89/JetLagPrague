import { analyzeParkFile, parkFileInfo, readParkFile } from '../../../packages/geo-core/src/park-import';
import type { ParkImportCommand } from './park-import-task';
self.onmessage = async (event: MessageEvent<ParkImportCommand>) => {
  try {
    const command = event.data;
    const file = await readParkFile(new Uint8Array(command.bytes), command.filename);
    const value = command.action === 'inspect' ? parkFileInfo(file) : await analyzeParkFile(file, command.options);
    self.postMessage({ value });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Import parků selhal.' }); }
};
