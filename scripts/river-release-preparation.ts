import { z } from 'zod';
import { canonicalJson } from '../packages/geo-core/src/administrative';
import { eligibleLandStops, type GameReleaseData } from '../packages/geo-core/src/game-release';
import { sha256 } from '../packages/geo-core/src/pid-snapshot';
import { landAreaAt } from '../packages/geo-core/src/river-land';
import { previewRiverLand } from '../packages/geo-core/src/river-land-topology';
import { vltavaSelectionChecksum } from '../packages/geo-core/src/vltava-assembly';
import { vltavaAssemblySchema, VLTAVA_SITES } from '../packages/geo-core/src/vltava-assembly-schema';
import { landLayerSchema, riverInputSchema, riverLayerSchema, riverMetadataReviewSchema, riverSourceProblems } from '../packages/geo-core/src/vltava';

type RiverBase = Pick<GameReleaseData, 'gameArea' | 'pidSnapshot' | 'pois'>;
const zofinId = 'park:ipr-mpp-100-parky:2261';

export async function reviewRiverLayers(data: RiverBase, featureInput: unknown, assemblyInput: unknown) {
  const feature = riverInputSchema.parse(featureInput);
  const draft = assemblyInput == null ? null : vltavaAssemblySchema.parse(assemblyInput);
  const geometryChecksum = await sha256(canonicalJson(feature.geometry));
  if (draft && (draft.status !== 'approved' || !draft.waterScope || draft.approval?.geometryChecksum !== geometryChecksum ||
      draft.approval.selectionChecksum !== await vltavaSelectionChecksum(draft) ||
      draft.source.rawChecksum !== feature.properties.source.rawChecksum ||
      canonicalJson([...draft.selectedIds].sort()) !== canonicalJson([...feature.properties.source.sourceFeatureIds].sort()))) {
    throw new Error('Export výběru řek neodpovídá schválenému polygonu nebo jeho zdrojovým GLOBALID.');
  }

  const approvals = draft?.separations?.filter(line => line.status === 'approved').sort((a,b)=>a.id.localeCompare(b.id)) ?? [];
  const boundary = data.gameArea.geometry;
  const stops = eligibleLandStops(data);
  const preview = await previewRiverLand({ boundary, water: feature.geometry, separations: approvals, stops });
  const landProblems = preview.problems.map(problem => `${problem.id}: ${problem.reason}`);
  if (!draft) landProblems.push('Chybí schválený JSON výběru řek s oddělovacími liniemi.');
  if (draft?.separations?.some(line=>line.status!=='approved')) landProblems.push('Některé oddělovací linie čekají na schválení.');

  const boundaryIds = new Set(preview.boundaryAreaIds);
  const sites = data.pois.filter(poi => (VLTAVA_SITES as readonly string[]).includes(poi.id));
  const zofinPoint = sites.find(site => site.id === zofinId)?.point;
  const zofin = zofinPoint && landAreaAt(preview.areas,zofinPoint);
  const zofinSeparated = !!zofin && !boundaryIds.has(zofin.id);
  if (!zofinSeparated) landProblems.push('Žofín nemá ověřenou samostatnou oblast. Zkontrolujte polygon a schválené oddělení u Mánesa.');
  if (preview.coverage?.unresolved.length) landProblems.push('Některá způsobilá stanoviště PID nemají jednoznačnou pevninskou oblast.');

  const names = new Map<string,string>();
  for (const site of sites) {
    const area = landAreaAt(preview.areas,site.point);
    if (area && !boundaryIds.has(area.id)) names.set(area.id,site.name);
  }
  let mainlandNumber = 0, islandNumber = 0;
  const areas = [...preview.areas].sort((a,b)=>b.areaM2-a.areaM2||a.id.localeCompare(b.id)).map(({id,geometry})=>{
    const kind = boundaryIds.has(id) ? 'main' as const : 'island' as const;
    const designation = kind === 'main' ? `Pevninská oblast ${++mainlandNumber}` : `Ostrovní plocha ${++islandNumber}`;
    return {id,geometry,kind,name:draft?.landNames?.[id]?.trim()||names.get(id)||designation};
  });
  const applied = new Set(preview.areas.flatMap(area=>area.separationIds));
  const separations = approvals.filter(line=>applied.has(line.id));
  const gameAreaChecksum = await sha256(canonicalJson(boundary));
  const areaChecksum = await sha256(canonicalJson(areas));
  const report = {
    river: { geometryChecksum, sourceFeatureCount: feature.properties.source.sourceFeatureIds.length,
      sourceProblems: riverSourceProblems(feature.properties.source) },
    land: { areaChecksum, inputChecksum: preview.inputChecksum, total: areas.length, boundaryComponents: mainlandNumber,
      islandComponents: islandNumber, zofinSeparated, zofinAreaId: zofin?.id ?? null,
      boundaryAreaSizesM2: preview.areas.filter(area=>boundaryIds.has(area.id)).map(area=>area.areaM2).sort((a,b)=>b-a),
      appliedSeparations: separations.map(({id,name})=>({id,name})), problems: landProblems },
    pid: { serviceDate: data.pidSnapshot.serviceDate, quality: data.pidSnapshot.quality, eligible: stops.length,
      ...preview.coverage },
  };
  return {feature, geometryChecksum, areas, separations, gameAreaChecksum, report};
}

const metadataInput = z.object({
  sourceUrl: riverInputSchema.shape.properties.shape.source.shape.url.optional(),
  review: riverMetadataReviewSchema,
  dataDate: riverInputSchema.shape.properties.shape.source.shape.dataDate,
  license: riverInputSchema.shape.properties.shape.source.shape.license,
}).strict();

export async function prepareRiverLayers(candidate: Awaited<ReturnType<typeof reviewRiverLayers>>, proof: unknown) {
  if (candidate.report.land.problems.length) throw new Error(candidate.report.land.problems.join(' '));
  const {review,dataDate,license,sourceUrl} = metadataInput.parse(proof);
  const {feature,geometryChecksum} = candidate;
  const source = feature.properties.source;
  const river = riverLayerSchema.parse({ geometryChecksum, metadataReview:review, feature:{
    ...feature, properties:{...feature.properties,source:{...source,url:sourceUrl??source.url,dataDate,license}},
  } });
  const land = landLayerSchema.parse({
    riverChecksum: await sha256(canonicalJson(river)), riverGeometryChecksum: geometryChecksum, gameAreaChecksum:candidate.gameAreaChecksum,
    areas:candidate.areas, separations:candidate.separations,
  });
  return {river,land};
}
