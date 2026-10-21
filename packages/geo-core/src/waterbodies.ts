import { canonicalJson } from './administrative';
import { type Poi, type PoiConfiguration, type ParkDataset } from './poi';
import rules from './waterbody-rules.json' with { type: 'json' };

export const WATER_RULES = rules;
export const waterNameKey = (name: string) => name.normalize('NFC').trim().replace(/\s+/g, ' ').replace(/[–—]/g, '-').toLocaleLowerCase('cs');
export type WaterClassification = { status: Poi['status']; reason: string; rule: string };
export function classifyWaterbody(name: string, sameNameCount = 1): WaterClassification {
  const key = waterNameKey(name);
  if (rules.allow.some(name => waterNameKey(name) === key) || /^biotop\b/iu.test(key)) return { status: 'approved', reason: 'Biotop nebo výslovně ponechané přírodní koupaliště.', rule: 'natural-bathing' };
  if (rules.excluded.some(name => waterNameKey(name) === key)) return { status: 'excluded', reason: 'Název areálu z výslovného seznamu správce; geometrie a GLOBALID zůstávají zachované.', rule: 'excluded-area-name' };
  const review = Object.entries(rules.review).find(([name]) => waterNameKey(name) === key);
  if (review) return { status: 'review', reason: review[1], rule: 'explicit-review' };
  // A coordinate/area threshold and the word "koupaliště" are never evidence
  // of a swimming pool. Only an explicit pool designation permits exclusion.
  if (/\bbaz[eé]n(?:y|ů|ový|ové|ového)?\b/iu.test(key)) return { status: 'excluded', reason: 'Výslovné označení bazénu ve zdrojovém názvu.', rule: 'explicit-pool' };
  if (/golf|koupaliště|hotel|areál|zahrad|čov/iu.test(key)) return { status: 'review', reason: 'Charakter vodní plochy nebo pojmenování je nutné doložit; samotné slovo koupaliště není důvodem vyloučení.', rule: 'ambiguous-use' };
  if (!key || /^(?:rybník|rybníček|nádrž|jezírko|jezero|tůň|tůně|vodní plocha|[a-z]{1,3}|[\d? -]+)$/iu.test(key) || /^(?:rn|pn|vn)\s+(?:[a-z]{1,3}|[\d -]+)$/iu.test(key)) return { status: 'review', reason: 'Chybí jednoznačné vlastní pojmenování.', rule: 'ambiguous-name' };
  if (sameNameCount > 1) return { status: 'review', reason: 'Více zdrojových polygonů má stejný název; ověřte, zda tvoří jednu lokalitu. Automatické sloučení napříč Prahou se neprovádí.', rule: 'multiple-parts' };
  return { status: 'approved', reason: 'Jednoznačně pojmenovaný polygon vodní plochy; RN/PN/VN nejsou důvodem vyloučení.', rule: 'named-waterbody' };
}

export function withPublishedWaterbodies(configuration: PoiConfiguration, source: ParkDataset): PoiConfiguration {
  if (source.records.some(p => p.category !== 'waterbody')) throw new Error('Zdroj obsahuje jinou kategorii než vodní plochy.');
  return configuration.waterSources?.some(s => s.source.id === source.source.id) ? configuration : { ...configuration, waterSources: [...(configuration.waterSources ?? []), source] };
}
export function applyWaterUpdate(configuration: PoiConfiguration, source: ParkDataset): PoiConfiguration {
  const previous = configuration.waterSources?.find(s => s.source.id === source.source.id);
  const missing = previous?.records.filter(p => !source.records.some(n => n.id === p.id)) ?? [];
  const changed = new Set(source.records.filter(p=>{const old=previous?.records.find(o=>o.id===p.id);return old&&canonicalJson(old.geometry)!==canonicalJson(p.geometry);}).map(p=>p.id));
  return { ...configuration, decisions:configuration.decisions.map(d=>changed.has(d.id)&&d.status==='approved'?{...d,status:'review' as const}:d),waterSources: [...(configuration.waterSources ?? []).filter(s => s.source.id !== source.source.id), source],
    manual: [...configuration.manual.filter(p => !(p.category === 'waterbody' && p.attributes.sourceMissing && source.records.some(n => n.id === p.id))), ...missing.filter(p => !configuration.manual.some(m => m.id === p.id)).map(p => ({ ...p, status: 'review' as const, attributes: { ...p.attributes, sourceMissing: true } }))] };
}
export function filterWaterbodies(pois: Poi[], status: PoiConfiguration['waterStatusFilter'] = 'all', search = ''): Poi[] {
  const query = search.trim().toLocaleLowerCase('cs');
  return pois.filter(p => p.category === 'waterbody' && (status === 'all' || p.status === status) && `${p.name} ${p.id} ${p.waterbody?.globalIds.join(' ')}`.toLocaleLowerCase('cs').includes(query));
}
export function splitWaterbody(configuration: PoiConfiguration, poi: Poi): PoiConfiguration {
  if (poi.category !== 'waterbody' || !poi.memberIds?.length || !Array.isArray(poi.attributes.previousDecisions)) throw new Error('Rozdělit lze ručně sloučenou lokalitu na původní zdrojové objekty.');
  const previous = poi.attributes.previousDecisions as unknown as {id:string;decision:PoiConfiguration['decisions'][number]|null}[];
  const applied=(poi.attributes.mergeDecisions??[]) as unknown as PoiConfiguration['decisions'];
  const unchanged=new Set(previous.filter(p=>canonicalJson(configuration.decisions.find(d=>d.id===p.id))===canonicalJson(applied.find(d=>d.id===p.id))).map(p=>p.id));
  return { ...configuration, manual: configuration.manual.filter(p => p.id !== poi.id), decisions: [...configuration.decisions.filter(d => d.id !== poi.id && !unchanged.has(d.id)), ...previous.flatMap(p => unchanged.has(p.id)&&p.decision ? [p.decision] : [])] };
}
