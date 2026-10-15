import { useState } from 'react';
import { compareAdministrativeLayers, readAdministrativeSnapshot, type GeoLayer, type WorldDraft } from '@jetlag/geo-core';

export function SourceMetadata({ layer }: { layer: GeoLayer }) {
  const source = layer.dataset;
  if (!source) return null;
  return <dl className="source-metadata">
    <dt>Poskytovatel</dt><dd>{source.provider}</dd>
    <dt>Zdroj</dt><dd><a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">Zdrojový soubor / datová sada ↗</a></dd>
    <dt>Licence</dt><dd>{source.license.url ? <a href={source.license.url} target="_blank" rel="noopener noreferrer">{source.license.name}</a> : <span className="unconfigured">{source.license.name}</span>}</dd>
    <dt>Datum dat</dt><dd>{source.dataDate ?? 'Datum platnosti není doložené'}</dd>
    <dt>Datum převzetí</dt><dd>{new Date(source.retrievedAt).toLocaleString('cs', { timeZone: 'Europe/Bratislava' })}</dd>
    <dt>Verze / počet území</dt><dd>{source.version} · {layer.features.length}</dd>
    <dt>Kontrolní součet SHA-256</dt><dd className="mono">{source.checksum}</dd>
    {source.processing && <><dt>Zpracování dat</dt><dd>{source.processing}</dd></>}
    {source.provenance && <><dt>Doklad původu</dt><dd>{source.provenance.status === 'provider_verified' ? 'Ověřeno u poskytovatele' : 'Soubor dodaný uživatelem'}<br />{source.provenance.note}{source.provenance.upstreamUrl && <><br /><a href={source.provenance.upstreamUrl} target="_blank" rel="noopener noreferrer">Nadřazený datový zdroj ↗</a></>}</dd></>}
  </dl>;
}

export function AdministrativeDialog({ world, bundled, loadError, onClose, onApply }: { world: WorldDraft; bundled: GeoLayer[]; loadError: string; onClose(): void; onApply(layer: GeoLayer): void }) {
  const [candidate, setCandidate] = useState<GeoLayer | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const previous = candidate ? world.layers.find(l => l.dataset?.id === candidate.dataset?.id) : undefined;
  const diff = candidate ? compareAdministrativeLayers(previous, candidate) : null;
  return <div className="modal-backdrop"><section className="import-dialog source-dialog" role="dialog" aria-modal="true" aria-labelledby="sources-title">
    <span className="eyebrow">ADMINISTRATIVNÍ ZDROJE</span><h2 id="sources-title">Správa administrativních hranic</h2>
    <p>Aktualizuje se pouze vybraný zdroj. Herní hranice a všechny vlastní objekty zůstávají zachované. Před použitím nové verze zkontrolujte rozdíly.</p>
    {loadError && <p className="inline-error">{loadError}</p>}
    <div className="source-cards">{bundled.map(layer => {
      const current = world.layers.find(l => l.dataset?.id === layer.dataset!.id);
      return <article key={layer.id}><h3>{layer.title}</h3><p>{layer.features.length} území · přibalená verze {layer.dataset!.version}<br />{current ? `V draftu: ${current.dataset!.version}` : 'Dosud nepřidáno do draftu'}</p><button onClick={() => { setCandidate(layer); setError(''); }}>Porovnat přibalenou verzi</button></article>;
    })}</div>
    <label>Nový ověřitelný datový balíček (.json)<input aria-label="Aktualizace administrativních dat" type="file" accept=".json,application/json" disabled={busy} onChange={async e => {
      const file = e.target.files?.[0]; if (!file) return;
      if (file.size > 100 * 1024 * 1024) { setError('Limit zdrojového balíčku je 100 MB.'); return; }
      setBusy(true); setError(''); setCandidate(null);
      try { setCandidate(await readAdministrativeSnapshot(await file.text())); }
      catch (error) { setError(error instanceof Error ? error.message : 'Balíček nelze načíst.'); }
      finally { setBusy(false); }
    }} /></label>
    <p>Balíček musí uvádět poskytovatele, licenci, datum, oficiální kódy a kontrolní součet. Kontrolní součet ověřuje integritu souboru, nikoli důvěryhodnost deklarovaného zdroje. Původ balíčku ověřte u poskytovatele.</p>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {busy && <p role="status">Validuji geometrie a kontrolní součet…</p>}
    {candidate && diff && <div className="source-comparison"><h3>{candidate.title}</h3><SourceMetadata layer={candidate} /><div className="diff-counts"><span>Nové: {diff.added.length}</span><span>Změněné: {diff.changed.length}</span><span>Odebrané: {diff.removed.length}</span><span>Beze změny: {diff.unchanged.length}</span></div>
      {(['added', 'changed', 'removed'] as const).map((type, i) => diff[type].length > 0 && <details key={type}><summary>{['Nová území', 'Změněná území', 'Odebraná území'][i]} ({diff[type].length})</summary><ul>{diff[type].map(id => <li key={id}>{(type === 'removed' ? previous : candidate)?.features.find(f => f.id === id)?.name} <code>{id}</code></li>)}</ul></details>)}
      <button className="primary wide" onClick={() => { try { onApply(candidate); setCandidate(null); } catch (error) { setError(error instanceof Error ? error.message : 'Aktualizace se nezdařila.'); } }}>Použít tuto verzi zdroje</button>
    </div>}
    <div className="dialog-actions"><button disabled={busy} onClick={onClose}>Zavřít správu zdrojů</button></div>
  </section></div>;
}
