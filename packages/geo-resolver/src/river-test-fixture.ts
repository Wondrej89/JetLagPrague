import {readFile} from 'node:fs/promises';
import {gameFixture,PRE_RIVER_RELEASE_ID} from '../../game-core/src/test-fixtures';
import {prepareRiverLayers,reviewRiverLayers} from '../../../scripts/river-release-preparation';

export async function riverFixture() {
  const base = await gameFixture(PRE_RIVER_RELEASE_ID);
  const feature:unknown = JSON.parse(await readFile('data/raw/vltava-berounka-approved.geojson','utf8'));
  const assembly:unknown = JSON.parse(await readFile('data/raw/reky-draft.json','utf8'));
  const candidate = await reviewRiverLayers(base.release.data,feature,assembly);
  const proof:unknown = JSON.parse(await readFile('data/source-metadata/vltava-berounka-review.json','utf8'));
  const layers = await prepareRiverLayers(candidate,proof);
  const {release} = await gameFixture();
  return {base,feature,assembly,candidate,proof,layers,release};
}
