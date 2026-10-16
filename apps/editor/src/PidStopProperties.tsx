import { useState } from 'react';
import { defaultGameStopConfiguration, type GameStop, type GameStopConfiguration, type PidPlatform, type TransportMode } from '@jetlag/geo-core';
import { modeLabels } from './PidPanel';

export function PidStopProperties({ stop, configuration, allStops, platforms, point, moving, showPlatforms, showZone, disabled, onPoint, onMove, onPlatforms, onZone, onConfiguration }: {
  stop: GameStop; configuration: GameStopConfiguration; allStops: GameStop[]; platforms: PidPlatform[]; point: [number, number] | null; moving: boolean; showPlatforms: boolean; showZone: boolean; disabled: boolean;
  onPoint(point: [number, number] | null): void; onMove(value: boolean): void; onPlatforms(value: boolean): void; onZone(value: boolean): void; onConfiguration(value: GameStopConfiguration): void;
}) {
  const override = configuration.overrides.find(value => value.stopId === stop.id);
  const [reason, setReason] = useState(override?.justification ?? '');
  const [decision, setDecision] = useState(override?.decision ?? 'automatic');
  const [mode, setMode] = useState<TransportMode | ''>(override?.mode ?? '');
  const [groupSearch, setGroupSearch] = useState('');
  const [linked, setLinked] = useState(stop.groupIds);
  const [name, setName] = useState(stop.name);
  function saveOverride() {
    if (!reason.trim()) return;
    const value: GameStopConfiguration['overrides'][number] = {
      stopId: stop.id, decision: decision as 'automatic' | 'allowed' | 'excluded', mode: mode && stop.modes.includes(mode) ? mode : undefined,
      point: point ?? (override?.sourceSignature === stop.sourceSignature ? override.point : undefined), justification: reason.trim(), approvedAt: new Date().toISOString(), sourceSignature: stop.sourceSignature,
    };
    onConfiguration({ ...configuration, overrides: [...configuration.overrides.filter(value => value.stopId !== stop.id), value] });
    onPoint(null); onMove(false);
  }
  return <section className="pid-properties" aria-label="Vlastnosti zastávky PID"><span className="eyebrow">HERNÍ ZASTÁVKA PID</span><h2>{stop.name}</h2>
    <dl className="feature-facts"><dt>ID</dt><dd><code>{stop.id}</code></dd><dt>Plánovaná obsluha</dt><dd>{stop.activity === 'active' ? 'Aktivní' : stop.activity === 'inactive' ? 'Neaktivní · bez plánované obsluhy' : 'Nelze určit'}</dd><dt>Aktivní druhy dopravy ve snapshotu</dt><dd>{stop.modes.map(mode => modeLabels[mode]).join(', ') || 'Nelze určit'}</dd><dt>Dominantní doprava</dt><dd>{stop.dominantMode ? modeLabels[stop.dominantMode] : 'Nutné ruční rozhodnutí'}{stop.referenceModes.length > 1 ? ' · společná priorita autobusu a trolejbusu' : ''}</dd><dt>Stanoviště</dt><dd>{stop.relevantPlatformIds.length} relevantních · {stop.platformIds.length} aktivních · {platforms.length} zdrojových</dd><dt>Referenční bod [délka, šířka]</dt><dd>{stop.point?.map(value => value.toFixed(7)).join(', ') ?? 'Nelze určit'}</dd><dt>Automaticky vypočtený bod</dt><dd>{stop.automaticPoint?.map(value => value.toFixed(7)).join(', ') ?? 'Nelze určit'}</dd><dt>Metoda</dt><dd>{stop.pointMethod === 'platform-mean' ? 'Aritmetický průměr aktivních stanovišť dominantní dopravy' : stop.pointMethod === 'official' ? 'Doložený oficiální bod příslušné dopravy' : stop.pointMethod === 'manual' ? 'Ručně schválený bod' : 'Nelze určit'}</dd><dt>Den snapshotu</dt><dd>{stop.snapshotDate}</dd><dt>Způsobilost</dt><dd>{stop.eligibility === 'allowed' ? 'Povolená zastávka' : stop.eligibility === 'excluded' ? 'Ručně vyloučená' : 'Vyžaduje revizi · nelze určit'}{stop.reasons.map(reason => <p className="pid-warning" key={reason}>{reason}</p>)}</dd></dl>
    <label className="pid-check"><input type="checkbox" checked={showPlatforms} onChange={event => onPlatforms(event.target.checked)} />Zobrazit zdrojová stanoviště</label>
    <button className="wide" aria-pressed={showZone} onClick={() => onZone(!showZone)}>{showZone ? 'Skrýt zónu' : `Zobrazit úkrytovou zónu ${configuration.radiusMeters} m`}</button>
    {stop.eligibility !== 'allowed' && showZone && <p className="pid-warning">Geometrická ukázka kruhu v herní oblasti. Povolenost místa vyžaduje spolehlivá data a schválenou zastávku.</p>}
    <details><summary>Referenční bod a ruční rozhodnutí</summary><fieldset disabled={disabled}>
      <button className="wide" disabled={!stop.point} aria-pressed={moving} onClick={() => onMove(!moving)}>{moving ? 'Ukončit přesun bodu' : 'Přesunout referenční bod v mapě'}</button>
      {moving && <p>Přetáhněte značku referenčního bodu. Potom vyplňte zdůvodnění a změnu schvalte.</p>}
      <label>Délka referenčního bodu<input disabled={!point && !stop.point} type="number" step="any" min="-180" max="180" aria-label="Délka referenčního bodu" value={(point ?? stop.point)?.[0] ?? ''} onChange={event => { const previous = point ?? stop.point; if (previous) onPoint([Number(event.target.value), previous[1]]); }} /></label>
      <label>Šířka referenčního bodu<input disabled={!point && !stop.point} type="number" step="any" min="-90" max="90" aria-label="Šířka referenčního bodu" value={(point ?? stop.point)?.[1] ?? ''} onChange={event => { const previous = point ?? stop.point; if (previous) onPoint([previous[0], Number(event.target.value)]); }} /></label>
      {point && <p>Neuložený návrh: {point.map(value => value.toFixed(7)).join(', ')}.</p>}
      {override?.point && override.sourceSignature !== stop.sourceSignature && <div className="pid-warning"><p>Uložený ruční bod čeká na revizi: [{override.point.join(', ')}].</p><button onClick={() => onPoint(override.point!)}>Převzít uložený bod k novému schválení</button></div>}
      <label>Herní rozhodnutí<select value={decision} onChange={event => setDecision(event.target.value as typeof decision)}><option value="automatic">Automaticky podle pravidel</option><option value="allowed">Ručně povolit</option><option value="excluded">Ručně vyloučit</option></select></label>
      <label>Pravidlo pro přívoz / lanovku nebo kombinovaný uzel<select value={mode && stop.modes.includes(mode) ? mode : ''} onChange={event => setMode(event.target.value as TransportMode | '')}><option value="">Automatická dopravní priorita</option>{stop.modes.map(mode => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
      <form onSubmit={event => { event.preventDefault(); saveOverride(); }}><label>Zdůvodnění ruční úpravy<textarea aria-label="Zdůvodnění ruční úpravy" value={reason} onChange={event => setReason(event.target.value)} required maxLength={10000} /></label><button className="primary wide">Schválit ruční úpravu</button></form>
      <button className="wide" disabled={!override?.point && !point} onClick={() => {
        onPoint(null); onMove(false);
        if (override?.point) onConfiguration({ ...configuration, overrides: configuration.overrides.map(value => value.stopId === stop.id ? { ...value, point: undefined } : value) });
      }}>Vrátit automatický bod</button>
      {point && <button className="wide" onClick={() => { onPoint(null); onMove(false); }}>Zahodit návrh bodu</button>}
    </fieldset></details>
    <details><summary>Propojit nebo oddělit zdrojové skupiny</summary><fieldset disabled={disabled}><p>Skupiny se neslučují podle názvu ani blízkosti. Propojení je výslovné rozhodnutí správce.</p>
      {stop.groupIds.map(id => <label className="pid-check" key={id}><input type="checkbox" checked={linked.includes(id)} onChange={event => setLinked(event.target.checked ? [...linked, id] : linked.filter(value => value !== id))} /><code>{id}</code></label>)}
      <label>Vyhledat další uzel<input aria-label="Vyhledat skupinu k propojení" value={groupSearch} onChange={event => setGroupSearch(event.target.value)} /></label>
      {groupSearch && allStops.filter(value => value.id !== stop.id && value.platformIds.length && value.name.toLocaleLowerCase('cs').includes(groupSearch.toLocaleLowerCase('cs'))).slice(0, 12).map(value => <label className="pid-check" key={value.id}><input type="checkbox" checked={value.groupIds.every(id => linked.includes(id))} onChange={event => setLinked(event.target.checked ? [...new Set([...linked, ...value.groupIds])] : linked.filter(id => !value.groupIds.includes(id)))} />{value.name} · {value.modes.map(mode => modeLabels[mode]).join(', ')}</label>)}
      <form onSubmit={event => { event.preventDefault(); if (!linked.length || !reason.trim()) return;
        const next = { ...(configuration ?? defaultGameStopConfiguration()), nodes: configuration.nodes.filter(node => !node.groupIds.some(id => linked.includes(id)) && node.id !== stop.id) };
        next.nodes.push({ id: stop.id.startsWith('manual:') ? stop.id : `manual:${crypto.randomUUID()}`, name, groupIds: linked, justification: reason.trim() }); onConfiguration(next);
      }}><label>Název propojeného uzlu<input value={name} onChange={event => setName(event.target.value)} required /></label><label>Zdůvodnění propojení<textarea aria-label="Zdůvodnění propojení" value={reason} onChange={event => setReason(event.target.value)} required maxLength={10000} /></label><button className="wide" disabled={!linked.length}>Uložit propojení skupin</button></form>
      {stop.id.startsWith('manual:') && <button className="wide" onClick={() => onConfiguration({ ...configuration, nodes: configuration.nodes.filter(node => node.id !== stop.id) })}>Oddělit všechny skupiny tohoto uzlu</button>}
    </fieldset></details>
    <details><summary>Souřadnice originálních stanovišť</summary>{platforms.map(platform => <p key={platform.id}><code>{platform.id}</code> · {platform.services.length ? platform.services.map(service => modeLabels[service.mode]).join(', ') : 'bez doložené aktivní obsluhy'}<br />Zdroj skupin: [{platform.point.join(', ')}]{platform.activePoint && <><br />Zdroj aktivních: [{platform.activePoint.join(', ')}]</>}<br />Vazba: {platform.joinMethod ?? 'pouze zdrojová skupina'}</p>)}</details>
  </section>;
}
