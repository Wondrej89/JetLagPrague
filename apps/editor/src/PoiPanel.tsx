import { useState } from 'react';
import { defaultParkFilters, filterParkPois, parkHierarchy, parkMatchesHierarchy, type ParkFilters, type ParkHierarchy, type Poi, type PoiConfiguration, type PoiDecision, type ParkDataset } from '@jetlag/geo-core';
import { parkSourceStatus } from './poi-data';

const hierarchyNames: [ParkHierarchy, string][] = [[1, 'Hierarchie 1 – metropolitní'], [2, 'Hierarchie 2 – čtvrťové'], [3, 'Hierarchie 3 – lokalitní'], [4, 'Hierarchie 4 – místní'], ['unknown', 'Bez určené hierarchie']];
const statusName = { approved: 'Schváleno', review: 'K revizi', excluded: 'Vyloučeno' };
export function PoiControls({ pois, configuration, selected, disabled, drawing, onVisibility, onSelect, onAdd, onImport, onMerge, onFilters, onBulk, onUndoBulk, canUndoBulk, bulkBusy, bulkNotice }: {
  onFilters(value: ParkFilters): void; onBulk(status: 'approved' | 'excluded'): void; onUndoBulk(): void; canUndoBulk: boolean; bulkBusy: boolean; bulkNotice: { message: string; skipped: { id: string; name: string; reason: string }[] } | null;
  pois: Poi[]; configuration: PoiConfiguration; selected: string | null; disabled: boolean; drawing: boolean;
  onVisibility(value: PoiConfiguration['visibility']): void; onSelect(poi: Poi): void; onAdd(): void; onImport(): void; onMerge(ids: string[], name: string): void;
}) {
  const [search, setSearch] = useState('');
  const [members, setMembers] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState('');
  const filters = configuration.parkFilters ?? defaultParkFilters();
  const parks = pois.filter(poi => poi.category === 'park');
  const filtered = filterParkPois(pois, filters, 'list', search);
  const matching = parks.filter(poi => parkMatchesHierarchy(poi, filters.hierarchies)).length;
  const counts = { all: parks.length, approved: parks.filter(poi => poi.status === 'approved').length, excluded: parks.filter(poi => poi.status === 'excluded').length, review: parks.filter(poi => poi.status === 'review').length };
  return <section className="poi-controls" aria-label="Body zájmu">
    <h3>Body zájmu</h3>
    <fieldset disabled={disabled || bulkBusy} aria-busy={bulkBusy}>
      {(['airport', 'park'] as const).map(category => {
        const group = pois.filter(p => p.category === category);
        const key = category === 'airport' ? 'airports' : 'parks';
        return <div key={category}><label className="poi-toggle"><input type="checkbox" checked={configuration.visibility[key]} onChange={e => onVisibility({ ...configuration.visibility, [key]: e.target.checked })} />{category === 'airport' ? 'Letiště' : 'Parky'}</label><p className="poi-counts" data-testid={`poi-count-${category}`}>{group.filter(p => p.status === 'approved').length} schválených · {group.filter(p => p.status !== 'approved').length} neschválených</p></div>;
      })}
      <label className="poi-toggle"><input type="checkbox" checked={configuration.visibility.referencePoints} onChange={e => onVisibility({ ...configuration.visibility, referencePoints: e.target.checked })} />Referenční body parků</label>
      <label className="poi-toggle park-game-preview"><input type="checkbox" checked={filters.approvedOnlyMap} onChange={e => onFilters({ ...filters, approvedOnlyMap: e.target.checked })} />Zobrazit jen parky ve hře</label>
      {filters.approvedOnlyMap && <p role="status">Herní výběr má {counts.approved} schválených parků napříč hierarchiemi. Seznam má vlastní filtry. {configuration.visibility.parks ? 'Mapa ukazuje celý tento výběr.' : 'Vrstva Parky je skrytá; pro zobrazení ji zapněte.'}</p>}
      <p className="poi-source-warning">Parková data: {configuration.sources.length ? 'importovaní kandidáti; doložte původ a schvalujte po revizi' : 'ověřený import IPR je připraven; kandidáti zatím nejsou přiloženi'}. <a href={parkSourceStatus.documentationUrl} target="_blank" rel="noreferrer">{parkSourceStatus.layer}</a></p>
      <button className="wide" onClick={onImport}>Načíst / aktualizovat parky</button>
      <button className="wide" aria-pressed={drawing} onClick={onAdd}>{drawing ? 'Zrušit kreslení parku' : '+ Nakreslit park'}</button>
      {drawing && <p role="status">Nakreslete skutečnou hranici parku a polygon uzavřete prvním vrcholem. Potom doplňte název a schvalte.</p>}
      <section className="park-hierarchy" aria-label="Výběr parků podle hierarchie">
        <h4>Výběr parků podle hierarchie</h4>
        {hierarchyNames.map(([value, title]) => <label key={value} className="poi-toggle"><input type="checkbox" checked={filters.hierarchies.includes(value)} onChange={e => onFilters({ ...filters, hierarchies: e.target.checked ? [...filters.hierarchies, value] : filters.hierarchies.filter(item => item !== value) })} />{title} <span className="park-hierarchy-count">({parks.filter(poi => parkHierarchy(poi) === value).length})</span></label>)}
        <label className="poi-toggle"><input type="checkbox" checked={filters.showOutside} onChange={e => onFilters({ ...filters, showOutside: e.target.checked })} />Zobrazit také parky mimo vybrané hierarchie</label>
        <p>Vybrané hierarchie: {matching} parků. Hromadné akce zahrnou celý výběr bez ohledu na hledání, stav nebo mapový výřez.</p>
        <button className="primary wide" disabled={!matching} onClick={() => onBulk('approved')}>Schválit všechny parky vybraných hierarchií</button>
        <button className="wide" disabled={!matching} onClick={() => onBulk('excluded')}>Vyloučit všechny parky vybraných hierarchií</button>
        <button className="wide" disabled={!canUndoBulk} onClick={onUndoBulk}>Vrátit poslední hromadnou akci</button>
      </section>
      <dl className="park-summary" aria-label="Přehled parků"><dt>Všechny parky</dt><dd data-testid="park-total">{counts.all}</dd><dt>Schválené parky</dt><dd data-testid="park-approved">{counts.approved}</dd><dt>Vyloučené parky</dt><dd data-testid="park-excluded">{counts.excluded}</dd><dt>Parky k revizi</dt><dd data-testid="park-review">{counts.review}</dd></dl>
      <div className="park-status-filters" role="group" aria-label="Filtr stavu parků">{([['all', 'Vše'], ['approved', 'Schválené'], ['excluded', 'Vyloučené'], ['review', 'K revizi']] as const).map(([value, title]) => <button key={value} aria-pressed={filters.status === value} onClick={() => onFilters({ ...filters, status: value })}>{title}</button>)}</div>
      {bulkBusy && <p role="status">Zpracovávám parky v dávkách…</p>}
      {bulkNotice && <div className="park-bulk-notice" role="status"><p>{bulkNotice.message}</p>{bulkNotice.skipped.length > 0 && <details open><summary>Přeskočené objekty ({bulkNotice.skipped.length})</summary><ul>{bulkNotice.skipped.map(issue => <li key={issue.id}><strong>{issue.name || issue.id}</strong> · {issue.id}: {issue.reason}</li>)}</ul></details>}</div>}
      <label>Hledat POI<input value={search} onChange={e => setSearch(e.target.value)} placeholder="Název nebo ID…" /></label>
      <div className="poi-list">{filtered.slice(0, 100).map(poi => <div key={poi.id} className={`poi-row ${poi.status}`} data-poi-id={poi.id}>
        {poi.category === 'park' && <input type="checkbox" aria-label={`Sloučit ${poi.name || poi.sourceId}`} checked={members.includes(poi.id)} onChange={e => setMembers(values => e.target.checked ? [...values, poi.id] : values.filter(id => id !== poi.id))} />}
        <button className={selected === poi.id ? 'chosen' : ''} onClick={() => onSelect(poi)}><span>{poi.category === 'airport' ? '✈' : '♧'} {poi.name || `Bezejmenný park ${poi.sourceId}`}</span><small>{poi.id} · {statusName[poi.status]}</small></button>
      </div>)}</div>
      {filtered.length > 100 && <p>Zobrazeno prvních 100 z {filtered.length}; zpřesněte hledání.</p>}
      {members.length > 0 && <div className="poi-merge"><label>Společný název parku<input value={mergeName} onChange={e => setMergeName(e.target.value)} maxLength={200} /></label><button disabled={members.length < 2 || !mergeName.trim()} onClick={() => { onMerge(members, mergeName.trim()); setMembers([]); }}>Sloučit {members.length} částí parku</button><p>Skutečné sjednocení polygonů; původní části budou vyloučené. Výsledný park vyžaduje schválení.</p></div>}
    </fieldset>
  </section>;
}

export function PoiProperties({ poi, dataset, moving, onMove, onDecision }: { dataset?: ParkDataset; poi: Poi; moving: boolean; onMove(): void; onDecision(change: Partial<PoiDecision>): void }) {
  const isPark = poi.category === 'park';
  return <div className="poi-properties">
    <h3>{poi.name || 'Park bez doloženého názvu'}</h3>
    <p className={`poi-status ${poi.status}`}>{statusName[poi.status]}</p>
    {isPark && <p>Hierarchie: {hierarchyNames.find(([value]) => value === parkHierarchy(poi))?.[1]}</p>}
    <dl className="feature-facts"><dt>ID</dt><dd className="mono">{poi.id}</dd><dt>Původní ID</dt><dd>{poi.sourceId}</dd><dt>Kategorie</dt><dd>{poi.category}</dd><dt>Geometrie</dt><dd>{poi.geometry.type}</dd><dt>Referenční bod</dt><dd data-testid="poi-reference">{poi.point[1].toFixed(6)}, {poi.point[0].toFixed(6)}</dd><dt>Revize</dt><dd>{poi.reviewedAt ? new Date(poi.reviewedAt).toLocaleString('cs') : 'Dosud neprovedena'}</dd></dl>
    {isPark ? <>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onDecision({ name: String(data.get('name')).trim(), note: String(data.get('note')) }); }}>
        <label>Název parku<input name="name" defaultValue={poi.name} maxLength={10000} /></label><label>Poznámka k POI<textarea name="note" defaultValue={poi.note} maxLength={10000} /></label><button className="wide">Uložit park</button>
      </form>
      {poi.status === 'approved' && <button className="danger wide park-game-action" onClick={() => onDecision({ status: 'excluded' })}>Vyřadit ze hry</button>}
      {poi.status === 'excluded' && <button className="primary wide park-game-action" onClick={() => onDecision({ status: 'approved' })}>Vrátit do hry</button>}
      <div className="poi-review-actions"><button className="primary" onClick={() => onDecision({ status: 'approved' })}>Schválit park</button><button className="danger" onClick={() => onDecision({ status: 'excluded' })}>Vyloučit park</button><button onClick={() => onDecision({ status: 'review' })}>Vrátit k revizi</button></div>
      <button className="wide" aria-pressed={moving} onClick={onMove}>{moving ? 'Ukončit přesun bodu parku' : 'Přesunout bod parku v mapě'}</button>
      <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onDecision({ point: [Number(data.get('lon')), Number(data.get('lat'))] }); }}>
        <label>Délka referenčního bodu<input name="lon" type="number" step="any" min="-180" max="180" required defaultValue={poi.point[0]} /></label><label>Šířka referenčního bodu<input name="lat" type="number" step="any" min="-90" max="90" required defaultValue={poi.point[1]} /></label><button className="wide">Uložit referenční bod</button>
      </form><p>Bod musí zůstat striktně uvnitř parku, mimo otvory. Vzdálenosti otázek používají tento bod.</p>
    </> : <p>Schválený ARP lokální kategorie. Souřadnice ani seznam letišť se nemění podle komerčního provozu.</p>}
    <details open><summary>Zdroj a licence POI</summary><p>{poi.source.provider}</p>{poi.source.url && <a href={poi.source.url} target="_blank" rel="noreferrer">Dokumentace / zdroj</a>}<p>Licence: {poi.source.license.name}{poi.source.license.url && <> · <a href={poi.source.license.url} target="_blank" rel="noreferrer">Podmínky</a></>}</p><p>Datum dat: {poi.source.dataDate ?? 'nedoloženo'}<br />Zpracováno: {poi.source.retrievedAt}<br />Původ: {poi.source.verification}</p><p>{poi.source.note}</p>{poi.source.rawChecksum && <code className="poi-checksum">SHA-256: {poi.source.rawChecksum}</code>}</details>
    {poi.importAudit && <details><summary>Automatické zpracování geometrie a ID</summary><p>{poi.importAudit.merged ? 'Geometrické sjednocení záznamů se shodným ID.' : 'Jeden zdrojový záznam.'} {poi.importAudit.repairedRows.length > 0 && 'Geometrie automaticky opravena pomocí GEOS MakeValid a znovu ověřena.'}</p><p>Původní názvy: {poi.importAudit.sourceNames.filter(Boolean).join(' / ')}</p><pre>{JSON.stringify(poi.importAudit, null, 2)}</pre></details>}
    {poi.sourceIdentity && <p>Stabilní klíč: <code>{poi.sourceIdentity.key}</code><br />Původní ID se zachovává: {poi.sourceId}</p>}
    {dataset?.importRecord && <details><summary>Původní GIS import a souřadnice</summary><p>Záznam obsahuje původní souřadnice před transformací, atributy, PRJ, CPG, metadata a kontrolní součty. Originální CRS není automaticky WGS84.</p><button onClick={() => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(dataset.importRecord, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = 'park-original-import-audit.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    }}>Exportovat záznam původního importu</button></details>}
    <details><summary>Původní atributy</summary><pre>{JSON.stringify(poi.attributes, null, 2)}</pre></details>
  </div>;
}

export { ParkImportDialog } from './ParkImportDialog';
