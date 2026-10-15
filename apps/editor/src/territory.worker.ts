import { hidingCoverage, municipalGameArea } from '@jetlag/geo-core';
import type { TerritoryCommand } from './territory-task';

self.onmessage = (event: MessageEvent<TerritoryCommand>) => {
  try {
    const command = event.data;
    const value = command.action === 'prague' ? municipalGameArea(command.layer) : hidingCoverage(command.stops, command.area, command.radius);
    self.postMessage({ value });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : 'Geografický výpočet selhal.' }); }
};
