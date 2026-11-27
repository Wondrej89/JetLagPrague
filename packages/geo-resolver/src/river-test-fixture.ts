import {readFile} from 'node:fs/promises';
import {gameFixture,PRE_RIVER_RELEASE_ID} from '../../game-core/src/test-fixtures';
import {prepareRiverLayers,reviewRiverLayers} from '../../../scripts/river-release-preparation';

const riverReferenceId = 'release:b50f43e3da15d92eed74d2c6eed52f152aa162245da51c176f2393499bf6239d';

export async function riverFixture() {
  const base = await gameFixture(PRE_RIVER_RELEASE_ID);
  const feature:unknown = JSON.parse(await readFile('data/raw/vltava-berounka-approved.geojson','utf8'));
  const assembly:unknown = JSON.parse(await readFile('data/raw/reky-draft.json','utf8'));
  const candidate = await reviewRiverLayers(base.release.data,feature,assembly);
  const proof:unknown = JSON.parse(await readFile('data/source-metadata/vltava-berounka-review.json','utf8'));
  const layers = await prepareRiverLayers(candidate,proof);
  // The original geographic publication and its PID are part of this regression fixture.
  const {release} = await gameFixture(riverReferenceId);
  return {base,feature,assembly,candidate,proof,layers,release};
}
