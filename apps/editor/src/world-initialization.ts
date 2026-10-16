import { defaultGameAreaFeature, setGameArea, validateWorld, verifyAdministrativeSources, verifyPoiSources, type DefaultGameArea, type WorldDraft } from '@jetlag/geo-core';

export class DefaultAreaLoadError extends Error {
  constructor(public readonly world: WorldDraft, cause: unknown) {
    super(`Výchozí herní oblast Prahy se nepodařila načíst. Automatické ukládání je pozastavené. Zkuste „Obnovit výchozí území Prahy“. ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}
export function withDefaultGameArea(world: WorldDraft, value: DefaultGameArea): WorldDraft {
  return { ...setGameArea(world, defaultGameAreaFeature(value)), gameAreaInitialization: { version: 1, state: 'initialized' } };
}
/** Storage must be resolved before fetching defaults or enabling autosave.
 * Legacy empty drafts have neither creation history nor a deletion marker: their
 * emptiness is ambiguous. Migrate the marker once, keeping all their content.
 * Only a genuinely new world receives the default automatically. */
export async function initializeEditorWorld(options: {
  placeholder: WorldDraft; readIndexed(): Promise<WorldDraft | null>; readLegacy(): WorldDraft | null; loadDefault(): Promise<DefaultGameArea>;
}): Promise<WorldDraft> {
  const indexed = await options.readIndexed();
  const saved = indexed ?? options.readLegacy();
  const world = validateWorld(saved ?? options.placeholder);
  await verifyAdministrativeSources(world);
  await verifyPoiSources(world.poi);
  if (saved) {
    if (world.layers.find(layer => layer.kind === 'game_area')!.features.length || world.gameAreaInitialization) return world;
    return { ...world, gameAreaInitialization: { version: 1, state: 'legacy-empty' } };
  }
  try { return withDefaultGameArea(world, await options.loadDefault()); }
  catch (error) { throw new DefaultAreaLoadError(world, error); }
}
/** Record explicit edits/imports; undo/redo retains the marker in history too. */
export function recordGameAreaChoice(previous: WorldDraft, next: WorldDraft): WorldDraft {
  const hasArea = next.layers.some(layer => layer.kind === 'game_area' && layer.features.length);
  const removed = previous.layers.some(layer => layer.kind === 'game_area' && layer.features.length) && !hasArea;
  if (!hasArea && !removed && next.gameAreaInitialization) return next;
  return { ...next, gameAreaInitialization: { version: 1, state: hasArea ? 'initialized' : 'intentionally-empty' } };
}
