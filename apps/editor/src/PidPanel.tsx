import { useState } from 'react';
import { PID_URLS, orphanedOverrides, pragueDate, transportModes, type GameStop, type GameStopConfiguration, type TransportMode } from '@jetlag/geo-core';
import type { PidComparison, PidFilters, PidSummary, PidView } from './pid-types';

export const modeLabels: Record<TransportMode, string> = { train: 'Vlak', metro: 'Metro', tram: 'Tramvaj', bus: 'Autobus', trolleybus: 'Trolejbus', ferry: 'Přívoz', funicular: 'Lanovka' };
export const modeColors: Record<TransportMode, string> = { train: '#205899', metro: '#b6292b', tram: '#7a0603', bus: '#007d98', trolleybus: '#80166f', ferry: '#00959b', funicular: '#946600' };
export const defaultPidFilters = (): PidFilters => ({ visible: false, modes: [...transportModes], dominant: '', period: 'all', search: '', routesVisible: false, routeSearch: '', selectedRoute: '', onlySelectedRoute: false });

export function PidControls({ view, filters, onChange, onSelect, selected, onSources, busy, error, radius, onRadius, disabled }: {
  view: PidView | null; filters: PidFilters; onChange(value: PidFilters): void; onSelect(stop: GameStop): void; selected: string | null; onSources(): void; busy: boolean; error: string;
  radius: number; onRadius(radius: number): void;
  disabled: boolean;
}) {
  const search = filters.search.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
  const stops = view?.stops.filter(stop => stop.platformIds.length && (!search || stop.name.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().includes(search)) && (!filters.dominant || stop.referenceModes.includes(filters.dominant)) && (filters.period === 'all' || stop.service === 'both' || stop.service === filters.period) && stop.modes.some(mode => filters.modes.includes(mode))) ?? [];
  const routes = view?.routes.filter(route => !filters.routeSearch || route.number.toLowerCase().includes(filters.routeSearch.toLowerCase())) ?? [];
  const toggle = (mode: TransportMode) => onChange({ ...filters, modes: filters.modes.includes(mode) ? filters.modes.filter(value => value !== mode) : [...filters.modes, mode] });
  return <section className="pid-controls" aria-label="Veřejná doprava PID"><fieldset disabled={disabled}><h3>Veřejná doprava PID</h3>
    <label className="pid-check"><input type="checkbox" checked={filters.visible} onChange={event => onChange({ ...filters, visible: event.target.checked })} />Zobrazit zastávky PID</label>
    {!view ? <p>{error || 'Načítám a ověřuji PID na pozadí…'}</p> : <>
      <p className="pid-count" data-testid="pid-count">{stops.length} / {view.stops.filter(stop => stop.platformIds.length).length} doložených herních zastávek</p>
      <small>Snapshot {view.summary.serviceDate}{view.summary.serviceDate !== pragueDate() ? ' · datum neodpovídá dnešku' : ''}{view.summary.quality?.status === 'review' ? ' · vyžaduje revizi' : ''}</small>
      <label>Hledat zastávku<input aria-label="Hledat zastávku PID" value={filters.search} onChange={event => onChange({ ...filters, search: event.target.value })} placeholder="Anděl, Karlín…" /></label>
      <details><summary>Druhy dopravy a provoz</summary><div className="pid-mode-grid">{transportModes.map(mode => <label className="pid-check" key={mode}><input type="checkbox" checked={filters.modes.includes(mode)} onChange={() => toggle(mode)} /><i style={{ background: modeColors[mode] }} />{modeLabels[mode]}</label>)}</div>
        <div className="pid-actions"><button onClick={() => onChange({ ...filters, visible: true, modes: [...transportModes] })}>Zapnout všechny</button><button onClick={() => onChange({ ...filters, visible: false, routesVisible: false })}>Vypnout všechny</button></div>
        <label>Provoz<select aria-label="Provoz PID" value={filters.period} onChange={event => onChange({ ...filters, period: event.target.value as PidFilters['period'] })}><option value="all">Denní i noční</option><option value="day">Denní</option><option value="night">Noční</option></select></label>
        <label>Dominantní doprava<select aria-label="Dominantní doprava PID" value={filters.dominant} onChange={event => onChange({ ...filters, dominant: event.target.value as TransportMode | '' })}><option value="">Všechny priority</option>{transportModes.map(mode => <option key={mode} value={mode}>{modeLabels[mode]}</option>)}</select></label>
      </details>
      {(filters.visible || filters.search) && <div className="pid-stop-list">{stops.slice(0, 60).map(stop => <button className={selected === stop.id ? 'chosen' : ''} key={stop.id} onClick={() => onSelect(stop)}><span>{stop.name}</span><small>{stop.dominantMode ? modeLabels[stop.dominantMode] : 'Revize'}{stop.eligibility !== 'allowed' ? ' · ' + (stop.eligibility === 'excluded' ? 'vyloučeno' : 'revize') : ''}</small></button>)}{stops.length > 60 && <p>Zobrazeno prvních 60; upřesněte hledání. Mapa používá všechny odpovídající body.</p>}</div>}
      <details><summary>Trasy linek · sedmidenní podoba</summary><label className="pid-check"><input type="checkbox" checked={filters.routesVisible} onChange={event => onChange({ ...filters, routesVisible: event.target.checked })} />Zobrazit trasy PID</label><p>Stejné přepínače dopravy filtrují i trasy. Trasy mohou patřit různým dnům uvedeného sedmidenního období.</p>
        <label>Číslo linky<input aria-label="Hledat linku PID" value={filters.routeSearch} onChange={event => onChange({ ...filters, routeSearch: event.target.value })} /></label>
        <label>Zvýrazněná linka<select aria-label="Vybrat linku PID" value={filters.selectedRoute} onChange={event => onChange({ ...filters, routesVisible: true, selectedRoute: event.target.value })}><option value="">Bez zvýraznění</option>{routes.map(route => <option value={route.id} key={route.id}>{route.number} · {modeLabels[route.mode]} · {route.id}</option>)}</select></label>
        <label className="pid-check"><input type="checkbox" checked={filters.onlySelectedRoute} onChange={event => onChange({ ...filters, onlySelectedRoute: event.target.checked })} />Skrýt ostatní linky</label>
      </details>
    </>}
    <details><summary>Pravidla úkrytu</summary><form onSubmit={event => { event.preventDefault(); onRadius(Number(new FormData(event.currentTarget).get('radius'))); }}><label>Poloměr úkrytové zóny (m)<input name="radius" aria-label="Poloměr úkrytové zóny (m)" type="number" min="0.01" max="100000" step="any" defaultValue={radius} key={radius} required /></label><button>Uložit poloměr</button></form></details>
    <button className="wide" onClick={onSources}>Zdroje a aktualizace PID{busy ? ' · aktualizuji…' : ''}</button>{error && view && <small className="pid-warning">Aktualizace selhala; poslední snapshot je zachován. Podrobnosti ve správě PID.</small>}
  </fieldset></section>;
}
function Metadata({ summary }: { summary: PidSummary }) {
  return <><dl className="feature-facts"><dt>Den obsluhy snapshotu</dt><dd>{summary.serviceDate}{summary.serviceDate !== pragueDate() ? ' · datum neodpovídá dnešku' : ''}</dd><dt>Stažení ze zdroje</dt><dd>{summary.downloadedAt ? new Date(summary.downloadedAt).toLocaleString('cs', { timeZone: 'Europe/Prague' }) : 'Čas stažení dodaných souborů není doložen'}</dd><dt>Příprava snapshotu</dt><dd>{summary.preparedAt ? new Date(summary.preparedAt).toLocaleString('cs', { timeZone: 'Europe/Prague' }) : 'neuvedeno'}</dd><dt>Obsah</dt><dd>{summary.groupCount} skupin · {summary.platformCount} stanovišť · {summary.routeCount} linek</dd><dt>Adaptér</dt><dd>{summary.adapterVersion}</dd><dt>SHA-256 / neměnná verze</dt><dd><code>{summary.checksum}</code></dd></dl>
    {summary.quality?.issues.map(issue => <p className="pid-warning" key={issue}>{issue}</p>)}
    <details><summary>Zdroje, licence a deklarovaná platnost</summary>{summary.sources.map(source => <div key={source.id}><h3>{source.id}</h3><a href={source.url} target="_blank" rel="noreferrer">{source.url}</a><p>Platnost zdroje: {source.declaredValidity ?? 'neuvedená'}<br />Verze: {source.version ?? 'neuvedená'}<br />Licence: {source.license?.name ?? 'nedoložená ve vstupních souborech'}</p><code>{source.sha256}</code></div>)}</details>
  </>;
}
export function PidSourceDialog({ view, busy, error, configuration, onClose, onRefresh, onCompare, onApply, onExport, onReview }: {
  view: PidView | null; busy: boolean; error: string; configuration: GameStopConfiguration; onClose(): void; onRefresh(): Promise<void>; onCompare(data: ArrayBuffer): Promise<PidComparison>; onApply(): Promise<void>; onExport(): Promise<void>;
  onReview(stop: GameStop): void;
}) {
  const [comparison, setComparison] = useState<PidComparison | null>(null); const [localError, setLocalError] = useState(''); const [working, setWorking] = useState(false);
  const run = async (action: () => Promise<void>) => { setWorking(true); setLocalError(''); try { await action(); } catch (error) { setLocalError(error instanceof Error ? error.message : String(error)); } finally { setWorking(false); } };
  const orphans = view ? orphanedOverrides(view.stops, configuration) : [];
  const manualReviews = view?.stops.filter(stop => (stop.id.startsWith('manual:') || configuration.overrides.some(override => override.stopId === stop.id)) && stop.reasons.length) ?? [];
  return <div className="modal-backdrop"><section className="import-dialog source-dialog" role="dialog" aria-modal="true" aria-labelledby="pid-source-title"><span className="eyebrow">SPRAVOVANÝ ZDROJ</span><h2 id="pid-source-title">Zdroje a aktualizace PID</h2><p>Aktualizace pracuje pouze s PID snapshotem. Herní hranice, vlastní objekty, administrativní vrstvy a uložené ruční výjimky zůstávají zachované.</p>
    <button disabled={busy || working} onClick={() => void onRefresh()}>{busy ? 'Stahuji a ověřuji…' : 'Aktualizovat z URL'}</button>
    <p>Nejprve se zkusí všechny tři oficiální URL; při síťové chybě nebo CORS se použije denní snapshot ze stejného hostingu. Starší či nekonzistentní data se automaticky nevydávají za aktuální.</p>
    {(error || localError) && <div role="alert" className="inline-error">{localError || error}</div>}
    {view && <Metadata summary={view.summary} />}
    <details><summary>Oficiální URL</summary>{Object.values(PID_URLS).map(url => <p key={url}><a href={url} target="_blank" rel="noreferrer">{url}</a></p>)}</details>
    {orphans.length > 0 && <div className="pid-warning"><strong>Osiřelé výjimky k revizi ({orphans.length})</strong>{orphans.map(override => <p key={override.stopId}>{override.stopId}: {override.justification}</p>)}</div>}
    {manualReviews.length > 0 && <details><summary>Ruční úpravy k revizi ({manualReviews.length})</summary>{manualReviews.map(stop => <div key={stop.id}><p>{stop.name}: {stop.reasons.join(' ')}</p><button onClick={() => onReview(stop)}>Otevřít revizi {stop.name}</button></div>)}</details>}
    <label>Porovnat nový snapshot PID (.json nebo .json.gz)<input type="file" accept=".json,.gz,application/json,application/gzip" disabled={working || busy} onChange={event => { const file = event.target.files?.[0]; if (!file) return; void run(async () => { if (file.size > 100 * 1024 * 1024) throw new Error('Limit snapshotu je 100 MiB.'); setComparison(await onCompare(await file.arrayBuffer())); }); }} /></label>
    {comparison && <section className="source-comparison"><h3>Porovnání s {comparison.summary.serviceDate}</h3><Metadata summary={comparison.summary} /><div className="diff-counts">{(['added', 'changed', 'removed', 'unchanged'] as const).map((key, index) => <span key={key}>{['Nové', 'Změněné', 'Odebrané', 'Beze změny'][index]}: {comparison.diff[key].length}</span>)}</div>
      {(['added', 'changed', 'removed'] as const).map((key, index) => <details key={key}><summary>{['Nové skupiny', 'Změněné skupiny', 'Odebrané skupiny'][index]}</summary><ul>{comparison.diff[key].slice(0, 100).map(id => <li key={id}>{comparison.names[id] ?? id}<br /><code>{id}</code></li>)}</ul>{comparison.diff[key].length > 100 && <p>Seznam omezen na prvních 100 záznamů.</p>}</details>)}
      <button className="primary" disabled={working || busy} onClick={() => void run(async () => { await onApply(); setComparison(null); })}>Použít porovnaný snapshot{comparison.summary.quality?.status === 'review' ? ' jako neověřenou referenci' : ''}</button></section>}
    <div className="dialog-actions"><button disabled={!view || working} onClick={() => void run(onExport)}>Export snapshotu PID</button><button onClick={onClose}>Zavřít správu PID</button></div>
  </section></div>;
}
