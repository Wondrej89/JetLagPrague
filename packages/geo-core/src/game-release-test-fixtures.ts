import catalog from '../../../apps/editor/src/data/poi-catalog.json' with { type: 'json' };
import { newWorld, newFeature, type AreaGeometry } from './index';
import { defaultPoiConfiguration, createManualPark, poiSchema } from './poi';
import { testSnapshot, testPlatform } from './pid-test-fixtures';
import { buildGameDataRelease } from './game-release';
export const releaseTestDate = '2026-10-15T08:00:00.000Z';
export const releaseTestArea: AreaGeometry = { type: 'Polygon', coordinates: [[[14.3,50],[14.5,50],[14.5,50.2],[14.3,50.2],[14.3,50]], [[14.45,50.1],[14.45,50.15],[14.48,50.15],[14.48,50.1],[14.45,50.1]]] };
export const releaseTestAirports = catalog.airports.map(poi => poiSchema.parse(poi));
export async function releaseTestInput() {
  const world = newWorld(); world.layers[0].features = [newFeature(releaseTestArea, 'Test Praha')];
  const park = createManualPark({ type: 'Polygon', coordinates: [[[14.39,50.05],[14.41,50.05],[14.41,50.09],[14.39,50.09],[14.39,50.05]]] }, 'Schválený park');
  park.id = 'manual-park:approved'; park.status = 'approved'; park.reviewedAt = releaseTestDate;
  park.attributes.privateAudit = 'NEZVEREJNOVAT'; park.note = 'PRIVATE NOTE';
  world.poi = { ...defaultPoiConfiguration(), manual: [park, { ...park, id: 'manual-park:excluded', status: 'excluded' }, { ...park, id: 'manual-park:review', status: 'review' }] };
  const snapshot = await testSnapshot([testPlatform('inside', 'inside', 'tram'), testPlatform('outside','outside','bus',[15,50]),testPlatform('hole','hole','tram',[14.46,50.12]),testPlatform('edge','edge','bus',[14.3,50.1])]);
  return { world, snapshot };
}
export async function releaseTestFixture() { const {world,snapshot} = await releaseTestInput(); return buildGameDataRelease(world,releaseTestAirports,snapshot,releaseTestDate); }
