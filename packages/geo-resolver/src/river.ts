import type { AreaGeometry } from '../../geo-core/src/index';
import { prepareArea } from './deduction/spatial-index';

/** Distance to the full water footprint, including every island ring.
 * Reuse the same geodesic edge queries for answers and the deduction worker. */
export function createRiverDistance(water: AreaGeometry) {
  const area = prepareArea(water);
  return { distanceToRiver: area.distance, errorMeters: area.errorMeters };
}
