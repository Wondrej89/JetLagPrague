import type { Poi, PoiDecision } from '@jetlag/geo-core';

export function CinemaProperties({ poi, moving, onMove, onDecision, onDelete }: { poi: Poi; moving: boolean; onMove(): void; onDecision(change: Partial<PoiDecision>): void; onDelete?(): void }) {
  return <div className="poi-properties cinema-properties">
    <h3>{poi.name || 'Nové kino'}</h3>
    <p className={`poi-status ${poi.status}`}>{({ approved: 'Schváleno', review: 'K revizi', excluded: 'Vyloučeno' })[poi.status]}</p>
    <dl className="feature-facts"><dt>ID</dt><dd className="mono">{poi.id}</dd><dt>Kategorie</dt><dd>Kina</dd><dt>Geometrie</dt><dd>Point</dd><dt>Referenční bod WGS84</dt><dd data-testid="poi-reference">{poi.point[1]}, {poi.point[0]}</dd></dl>
    <form onSubmit={event => {
      event.preventDefault(); const data = new FormData(event.currentTarget);
      onDecision({ name: String(data.get('name')).trim(), address: String(data.get('address')).trim(), note: String(data.get('note')), point: [Number(data.get('longitude')), Number(data.get('latitude'))] });
    }}>
      <label>Název kina<input name="name" defaultValue={poi.name} maxLength={10000} required /></label>
      <label>Adresa kina<input name="address" defaultValue={poi.address ?? ''} maxLength={10000} required /></label>
      <label>Poznámka ke kinu<textarea name="note" defaultValue={poi.note} maxLength={10000} /></label>
      <label>Zeměpisná šířka kina<input name="latitude" type="number" step="any" min="-90" max="90" required defaultValue={poi.point[1]} /></label>
      <label>Zeměpisná délka kina<input name="longitude" type="number" step="any" min="-180" max="180" required defaultValue={poi.point[0]} /></label>
      <button className="wide">Uložit kino</button>
    </form>
    <div className="poi-review-actions"><button className="primary" disabled={poi.status === 'approved'} onClick={() => onDecision({ status: 'approved' })}>{poi.status === 'excluded' ? 'Vrátit kino do hry' : 'Schválit kino'}</button><button className="danger" disabled={poi.status === 'excluded'} onClick={() => onDecision({ status: 'excluded' })}>Vyřadit kino ze hry</button><button disabled={poi.status === 'review'} onClick={() => onDecision({ status: 'review' })}>Vrátit kino k revizi</button></div>
    <button className="wide" aria-pressed={moving} onClick={onMove}>{moving ? 'Ukončit přesun bodu kina' : 'Přesunout bod kina v mapě'}</button>
    {moving && <p role="status">Přetáhněte vybraný bod kina v mapě. Souřadnice se okamžitě uloží.</p>}
    <p>Vzdálenosti se počítají k referenčnímu bodu. Multiplex je jedno kino bez ohledu na počet sálů; bod neurčuje hranice budovy.</p>
    <details open><summary>Zdroj kina</summary><p>{poi.source.provider}</p>{poi.source.url && <a href={poi.source.url} target="_blank" rel="noreferrer">Zdroj souřadnic</a>}<p>{poi.source.note}</p><p>Licence: {poi.source.license.name}<br/>Datum dat: {poi.source.dataDate ?? 'nedoloženo'}<br/>Převzato: {poi.source.retrievedAt}<br/>Původ: {poi.source.verification}</p>{poi.source.rawChecksum && <code className="poi-checksum">SHA-256: {poi.source.rawChecksum}</code>}<p>Revize: {poi.reviewedAt ? new Date(poi.reviewedAt).toLocaleString('cs-CZ') : 'Dosud neprovedena'}</p></details>
    {onDelete && <button className="danger wide" onClick={onDelete}>Odstranit ručně vytvořené kino</button>}
  </div>;
}
