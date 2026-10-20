import { useState } from 'react';
import { isLibraryLocationVerified, libraryId, type NewLibrary, type Poi, type PoiDecision, type UnlocatedLibrary } from '@jetlag/geo-core';

type Placement = NewLibrary & { candidateId?: string };
export function LibraryProperties({ poi, moving, onMove, onDecision, onDelete }: { poi: Poi; moving: boolean; onMove(): void; onDecision(change: Partial<PoiDecision>, confirmLocation: boolean): void; onDelete?(): void }) {
  const [confirmed, setConfirmed] = useState(false);
  const verified = isLibraryLocationVerified(poi);
  return <div className="poi-properties library-properties">
    <h3>{poi.name}</h3><p className={`poi-status ${poi.status}`}>{({ approved: 'Schváleno', excluded: 'Vyloučeno', review: 'K revizi' })[poi.status]}</p>
    <dl className="feature-facts"><dt>ID</dt><dd className="mono">{poi.id}</dd><dt>Kategorie</dt><dd>Knihovny</dd><dt>Geometrie</dt><dd>Point</dd><dt>Referenční bod WGS84</dt><dd data-testid="poi-reference">{poi.point[1]}, {poi.point[0]}</dd><dt>Poloha</dt><dd>{verified ? 'Ověřena pro tento bod' : 'Neověřena – nevstupuje do hry'}</dd></dl>
    <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onDecision({ name: String(data.get('name')).trim(), address: String(data.get('address')).trim(), note: String(data.get('note')), point: [Number(data.get('lon')), Number(data.get('lat'))] }, confirmed); setConfirmed(false); }}>
      <label>Název knihovny<input name="name" required maxLength={10000} defaultValue={poi.name}/></label>
      <label>Adresa knihovny<input name="address" required maxLength={10000} defaultValue={poi.address}/></label>
      <label>Poznámka ke knihovně<textarea name="note" maxLength={10000} defaultValue={poi.note}/></label>
      <label>Zeměpisná šířka knihovny<input name="lat" type="number" step="any" min="-90" max="90" required defaultValue={poi.point[1]}/></label>
      <label>Zeměpisná délka knihovny<input name="lon" type="number" step="any" min="-180" max="180" required defaultValue={poi.point[0]}/></label>
      <label className="poi-toggle"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/>Ověřil(a) jsem přesnou polohu pobočky podle oficiálního detailu</label>
      <button className="wide">Uložit knihovnu</button>
    </form>
    <p>Změna GPS vyžaduje nové ověření polohy. Návrh z geokódování ani střed mapy nejsou ověřenou polohou.</p>
    <div className="poi-review-actions"><button className="primary" disabled={poi.status === 'approved' || (!verified && !confirmed)} onClick={() => onDecision({ status: 'approved' }, confirmed)}>{poi.status === 'excluded' ? 'Vrátit knihovnu do hry' : 'Schválit knihovnu'}</button><button className="danger" disabled={poi.status === 'excluded'} onClick={() => onDecision({ status: 'excluded' }, false)}>Vyřadit knihovnu ze hry</button><button disabled={poi.status === 'review'} onClick={() => onDecision({ status: 'review' }, false)}>Vrátit knihovnu k revizi</button></div>
    <button className="wide" aria-pressed={moving} onClick={onMove}>{moving ? 'Ukončit přesun bodu knihovny' : 'Přesunout bod knihovny v mapě'}</button>
    <p><a href={poi.library!.officialUrl} target="_blank" rel="noreferrer">Oficiální detail pobočky MKP</a></p>
    <details open><summary>Zdroj knihovny</summary><p>{poi.source.provider}</p><p>{poi.source.note}</p><p>Licence: {poi.source.license.name}<br/>Datum katalogu: {poi.source.dataDate ?? 'nedoloženo'}<br/>Kontrola polohy: {poi.library?.verification?.checkedAt ?? 'dosud neprovedena'}<br/>Metoda: {poi.library?.verification?.method ?? 'neověřeno'}</p></details>
    {onDelete && <button className="danger wide" onClick={onDelete}>Odstranit vlastní knihovnu</button>}
  </div>;
}

export function UnlocatedLibraryProperties({ row, onDecision, onPlace, onLocate }: { row: UnlocatedLibrary; onDecision(change: Partial<PoiDecision>): void; onPlace(value: Placement): void; onLocate(point: [number, number], value: Placement): void }) {
  const [error, setError] = useState('');
  return <div className="poi-properties library-properties"><h3>{row.name}</h3><p className={`poi-status ${row.status}`}>{row.status === 'excluded' ? 'Vyloučeno' : 'K revizi – poloha není ověřena'}</p><p>{row.address}</p><p>Bez doloženého bodu se pobočka nezobrazuje v mapě a nevstupuje do hry. Pracovní ID <code>{row.id}</code> není oficiální identita. Ta vznikne až ze skutečného URL detailu.</p>
    <form onSubmit={event => { event.preventDefault(); const data = new FormData(event.currentTarget); onDecision({ name: String(data.get('name')).trim(), address: String(data.get('address')).trim(), note: String(data.get('note')) }); }}>
      <label>Název neověřené knihovny<input name="name" required defaultValue={row.name}/></label><label>Adresa neověřené knihovny<input name="address" required defaultValue={row.address}/></label><label>Poznámka k neověřené knihovně<textarea name="note" defaultValue={row.note}/></label><button className="wide">Uložit neověřenou knihovnu</button>
    </form>
    <form onSubmit={event => { event.preventDefault(); setError(''); const data = new FormData(event.currentTarget); try { const officialUrl = String(data.get('url')).trim(); libraryId(officialUrl); const input = { name: row.name, address: row.address, note: row.note, officialUrl, candidateId: row.id }; const action = (event.nativeEvent as SubmitEvent).submitter?.getAttribute('value'); if (action === 'map') onPlace(input); else { const lat = String(data.get('lat')), lon = String(data.get('lon')); if (!lat || !lon) throw new Error('Doplňte obě skutečné GPS souřadnice nebo umístěte bod v mapě.'); onLocate([Number(lon), Number(lat)], input); } } catch (error) { setError((error as Error).message); } }}>
      <label>URL oficiálního detailu knihovny<input name="url" type="url" required defaultValue={row.officialUrl ?? ''} placeholder="Skutečný odkaz z mlp.cz"/></label>
      <label>Zeměpisná šířka nové polohy knihovny<input name="lat" type="number" step="any" min="-90" max="90"/></label><label>Zeměpisná délka nové polohy knihovny<input name="lon" type="number" step="any" min="-180" max="180"/></label>
      <button className="wide" name="action" value="coordinates">Uložit polohu knihovny k revizi</button><button className="wide" name="action" value="map">Umístit bod knihovny v mapě</button>
    </form>{error && <p role="alert">{error}</p>}
    <button className="danger wide" disabled={row.status === 'excluded'} onClick={() => onDecision({ status: 'excluded' })}>Vyřadit neověřenou knihovnu</button><button className="wide" disabled={row.status === 'review'} onClick={() => onDecision({ status: 'review' })}>Vrátit neověřenou knihovnu k revizi</button>
    <p><a href={row.source.url!} target="_blank" rel="noreferrer">Oficiální přehled poboček MKP</a></p><p>{row.source.note}</p>
  </div>;
}

export function NewLibraryDialog({ onPlace, onClose }: { onPlace(value: Placement): void; onClose(): void }) {
  const [error, setError] = useState('');
  return <div className="modal-backdrop"><section className="import-dialog library-dialog" role="dialog" aria-modal="true" aria-label="Přidat knihovnu"><div className="dialog-heading"><h2>Přidat knihovnu</h2><button onClick={onClose}>Zavřít</button></div><p>Přidejte skutečnou pobočku MKP. Oficiální URL určuje stabilní ID; existující pobočku vraťte do hry v jejích vlastnostech.</p><form onSubmit={event => { event.preventDefault(); try { const data = new FormData(event.currentTarget), officialUrl = String(data.get('url')).trim(); libraryId(officialUrl); onPlace({ name: String(data.get('name')).trim(), address: String(data.get('address')).trim(), officialUrl }); } catch (error) { setError((error as Error).message); } }}><label>Název nové knihovny<input name="name" required/></label><label>Adresa nové knihovny<input name="address" required/></label><label>URL oficiálního detailu nové knihovny<input name="url" type="url" required/></label><button className="primary wide">Vložit bod nové knihovny v mapě</button></form>{error && <p role="alert">{error}</p>}</section></div>;
}
export type LibraryPlacement = Placement;
