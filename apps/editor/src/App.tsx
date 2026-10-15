import { useEffect, useRef, useState, type FormEvent } from 'react';
import { addHole, exportWorld, importGeoJson, importWorld, isArea, loadDraft, makeMetricCircle, newFeature, newLayer, newWorld, applyAdministrativeUpdate, isManagedLayer, verifyAdministrativeSources, validateGeometry, validateWorld, type GeoFeature, type GeoLayer, type Geometry, type WorldDraft } from '@jetlag/geo-core';
import { MapCanvas, type MapHandle, type Selection, type Tool } from './MapCanvas';
import type { Position } from 'geojson';
import { readIndexedDraft, persistWorld } from './draft-store';
import { loadBundledAdministrativeData } from './administrative-data';
import { AdministrativeDialog, SourceMetadata } from './AdministrativePanel';
import { PositionInspector } from './PositionInspector';

interface History { past: WorldDraft[]; present: WorldDraft; future: WorldDraft[] }
const toolNames: Record<Tool, string> = { select: 'Výběr', point: 'Bod', line: 'Linie', polygon: 'Polygon', hole: 'Otvor', circle: 'Kruh', measure: 'Měření', edit: 'Úprava vrcholů', inspect: 'Ověřit polohu' };
function CursorIcon() { return <svg className="cursor-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 3 19 13 11 14 8 21Z" /></svg>; }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'Operace se nezdařila.'; }
function download(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function App() {
  const [initial] = useState(() => {
    try { return { world: loadDraft(localStorage) ?? newWorld(), error: '' }; }
    catch { return { world: newWorld(), error: 'Uložený draft nelze načíst. Původní záznam zůstal zachován; můžete importovat zálohu. Automatické ukládání je pozastavené.' }; }
  });
  const [history, setHistory] = useState<History>({ past: [], present: initial.world, future: [] });
  const world = history.present;
  const [activeId, setActiveId] = useState(world.layers.find(l => l.kind === 'custom')?.id ?? world.layers[0].id);
  const [selected, setSelected] = useState<Selection | null>(null);
  const [tool, setTool] = useState<Tool>('select');
  const [error, setError] = useState(initial.error);
  const [storageBlocked, setStorageBlocked] = useState(!!initial.error);
  const [saveStatus, setSaveStatus] = useState('');
  const [hydrating, setHydrating] = useState(true);
  const [bundled, setBundled] = useState<GeoLayer[]>([]);
  const [sourceError, setSourceError] = useState('');
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [testPoint, setTestPoint] = useState<Position | null>(null);
  const [radius, setRadius] = useState('250');
  const [measurement, setMeasurement] = useState<number | null>(null);
  const [tileStatus, setTileStatus] = useState<'missing' | 'loading' | 'ready' | 'error'>('missing');
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_MAPY_API_KEY ?? '');
  const [mapSettings, setMapSettings] = useState(false);
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState('');
  const map = useRef<MapHandle>(null);
  const active = world.layers.find(l => l.id === activeId) ?? world.layers[0];
  const selectedLayer = world.layers.find(l => l.id === selected?.layerId);
  const selectedFeature = selectedLayer?.features.find(f => f.id === selected?.featureId);
  const editing = tool === 'edit';

  useEffect(() => {
    let cancelled = false;
    readIndexedDraft().then(async saved => {
      if (cancelled) return;
      await verifyAdministrativeSources(saved ?? initial.world);
      if (cancelled || !saved) return;
      setHistory({ past: [], present: saved, future: [] });
      setActiveId(saved.layers.find(l => l.kind === 'custom')?.id ?? saved.layers[0].id);
      setStorageBlocked(false); setError('');
    }).catch(() => {
      if (cancelled) return;
      setStorageBlocked(true); setError('Uložený draft nelze bezpečně načíst nebo nesouhlasí kontrolní součet zdroje. Nebyl přepsán; importujte zálohu nebo obnovte původní data.');
    }).finally(() => { if (!cancelled) setHydrating(false); });
    return () => { cancelled = true; };
  }, [initial]);

  useEffect(() => {
    if (storageBlocked || hydrating) return;
    let cancelled = false;
    setSaveStatus('Ukládám…');
    persistWorld(world).then(status => { if (!cancelled) setSaveStatus(status); }).catch(() => { if (!cancelled) setSaveStatus('Neuloženo! Úložiště je nedostupné nebo plné. Exportujte zálohu.'); });
    return () => { cancelled = true; };
  }, [world, storageBlocked, hydrating]);

  useEffect(() => {
    const controller = new AbortController();
    loadBundledAdministrativeData(controller.signal).then(setBundled).catch(error => {
      if (!controller.signal.aborted) setSourceError(`Administrativní hranice nelze načíst: ${errorText(error)}`);
    });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (hydrating || tool !== 'select' || !bundled.length || !bundled.some(l => !world.layers.some(w => w.id === l.id))) return;
    try {
      let enriched = world;
      for (const layer of bundled) if (!enriched.layers.some(l => l.id === layer.id)) enriched = applyAdministrativeUpdate(enriched, layer);
      setHistory(h => ({ ...h, present: enriched }));
    } catch (error) { setSourceError(errorText(error)); }
  }, [bundled, world, hydrating, tool]);

  function commit(next: WorldDraft) {
    try {
      const validated = validateWorld({ ...next, updatedAt: new Date().toISOString() });
      setHistory(h => ({ past: [...h.past.slice(-49), h.present], present: validated, future: [] }));
      setError('');
    } catch (error) { setError(errorText(error)); throw error; }
  }
  function attempt(action: () => void) { try { action(); } catch (error) { setError(errorText(error)); } }
  function updateLayer(id: string, change: Partial<GeoLayer>) {
    commit({ ...world, layers: world.layers.map(l => l.id === id ? { ...l, ...change } : l) });
  }
  function updateFeature(change: Partial<GeoFeature>) {
    if (!selectedFeature || !selectedLayer) return;
    if (isManagedLayer(selectedLayer)) throw new Error('Oficiální hranice měňte pouze aktualizací zdroje. Pro vlastní geometrii použijte vlastní vrstvu.');
    updateLayer(selectedLayer.id, { features: selectedLayer.features.map(f => f.id === selectedFeature.id ? { ...f, ...change } : f) });
  }
  function addGeometry(geometry: Geometry, circle?: { center: Position; radiusMeters: number }) {
    if (tool === 'hole') {
      if (!selectedFeature || !isArea(selectedFeature.geometry) || geometry.type !== 'Polygon') throw new Error('Nejprve vyberte polygon, do kterého chcete nakreslit otvor.');
      updateFeature({ geometry: addHole(selectedFeature.geometry, geometry) });
    } else {
      if (isManagedLayer(active)) throw new Error('Do oficiální vrstvy nelze kreslit. Vyberte vlastní vrstvu nebo herní oblast.');
      if (!active.visible) throw new Error('Aktivní vrstva je skrytá. Nejprve ji zobrazte.');
      if (active.kind === 'game_area' && (!isArea(geometry) || active.features.length)) throw new Error('Herní oblast musí být jeden Polygon nebo MultiPolygon. Pro další objekty vyberte vlastní vrstvu.');
      const f = { ...newFeature(geometry, circle ? `Kruh ${circle.radiusMeters} m` : active.kind === 'game_area' ? 'Herní hranice' : 'Nový objekt', active.source), ...(circle ? { circle } : {}) };
      updateLayer(active.id, { features: [...active.features, f] });
      setSelected({ layerId: active.id, featureId: f.id });
    }
    setTool('select');
  }
  function undo(redo = false) {
    setTool('select'); setSelected(null);
    setHistory(h => redo
      ? h.future.length ? { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) } : h
      : h.past.length ? { past: h.past.slice(0, -1), present: h.past.at(-1)!, future: [h.present, ...h.future] } : h);
  }
  const areaReady = world.layers.find(l => l.kind === 'game_area')!.features.length > 0;

  return <div className="app-shell" aria-busy={hydrating}>
    {hydrating && <div className="modal-backdrop"><div className="import-dialog" role="status">Načítám uložený draft…</div></div>}
    <header className="app-header">
      <div className="brand-mark" aria-hidden="true">J<span><svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M3 13 13 3M3 3h10v10" /></svg></span></div>
      <div className="brand-copy"><span className="eyebrow">JET LAG / PRAHA</span><h1>Geografický editor</h1></div>
      <span className="version-tag">ITERACE 02 <span>·</span> DRAFT</span>
      <div className="header-actions">
        <button disabled={editing} onClick={() => setSourcesOpen(true)}>Správa zdrojů</button>
        <button onClick={() => setMapSettings(v => !v)}>Nastavení mapy</button>
        <button disabled={editing} onClick={() => setImporting(true)}>↓ Import</button>
        <button className="primary" disabled={editing} onClick={() => attempt(() => download(exportWorld(world), 'jetlag-praha-draft.json'))}>↑ Export zálohy</button>
      </div>
    </header>
    {error && <div className="message error" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="Zavřít chybu">×</button></div>}
    {storageBlocked && <div className="message warning">Automatické ukládání je pozastavené, aby zůstala zachována původní data. <button onClick={() => { if (confirm('Nahradit původní uložený záznam současným draftem?')) setStorageBlocked(false); }}>Nahradit uložený draft</button></div>}
    {mapSettings && <form className="map-settings" onSubmit={e => { e.preventDefault(); setApiKey(String(new FormData(e.currentTarget).get('key') ?? '')); setMapSettings(false); }}>
      <label>Klientský API klíč Mapy.com <input name="key" type="password" autoComplete="off" defaultValue={apiKey} /></label>
      <p>Klíč se použije jen do obnovení stránky. Pro trvalé nastavení použijte <code>.env.local</code>. Není součástí draftu ani exportu. Klientský klíč je viditelný v síťových požadavcích; omezte jeho referery a služby.</p>
      <button className="primary">Použít klíč</button><button type="button" onClick={() => setMapSettings(false)}>Zavřít</button>
    </form>}
    <div className="workspace">
      <aside className="left-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">PRACOVNÍ PROSTOR</span><h2>Vrstvy světa</h2></div><span className="count">{world.layers.length}</span></div>
        <label className="world-name">Název světa<input aria-label="Název světa" disabled={editing} key={world.id + world.title} defaultValue={world.title} onBlur={e => { if (e.target.value.trim() && e.target.value !== world.title) attempt(() => commit({ ...world, title: e.target.value.trim() })); }} /></label>
        <div className="layer-list" aria-label="Vrstvy">{world.layers.map(layer => <article key={layer.id} className={`layer-card ${active.id === layer.id ? 'active' : ''}`}>
          <div className="layer-topline"><input aria-label={`Zobrazit ${layer.title}`} type="checkbox" checked={layer.visible} disabled={editing} onChange={e => attempt(() => updateLayer(layer.id, { visible: e.target.checked }))} /><input className="color-input" aria-label={`Barva ${layer.title}`} type="color" value={layer.color} disabled={editing} onChange={e => attempt(() => updateLayer(layer.id, { color: e.target.value }))} /><button className="layer-select" disabled={editing} onClick={() => { setActiveId(layer.id); setTool('select'); }}>{layer.title}</button><span className="count small">{layer.features.length}</span></div>
          <div className="layer-meta"><span>{layer.dataset ? 'ZDROJOVÉ HRANICE' : layer.kind === 'game_area' ? 'HERNÍ OBLAST' : 'VLASTNÍ VRSTVA'}</span>{active.id === layer.id && <span className="active-label">AKTIVNÍ</span>}</div>
          {layer.dataset && active.id === layer.id && <details><summary>Zdroj a licence</summary><SourceMetadata layer={layer} /></details>}
          {!layer.dataset && active.id === layer.id && <details><summary>Nastavení vrstvy</summary><form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); attempt(() => updateLayer(layer.id, { title: String(data.get('title')).trim(), source: String(data.get('source')) })); }}><fieldset disabled={editing}>
            <label>Název vrstvy<input name="title" defaultValue={layer.title} required maxLength={200} /></label><label>Zdroj vrstvy<input name="source" defaultValue={layer.source} maxLength={10000} /></label><button>Uložit vrstvu</button>
            {layer.kind !== 'game_area' && <button type="button" className="danger" onClick={() => { if (confirm(`Smazat vrstvu „${layer.title}“ včetně ${layer.features.length} objektů?`)) { attempt(() => commit({ ...world, layers: world.layers.filter(l => l.id !== layer.id) })); setSelected(null); } }}>Smazat vrstvu</button>}
          </fieldset></form></details>}
        </article>)}</div>
        <button className="add-layer" disabled={editing} onClick={() => { const layer = newLayer(`Vrstva ${world.layers.length}`); attempt(() => commit({ ...world, layers: [...world.layers, layer] })); setActiveId(layer.id); }}>+ Přidat vrstvu</button>
        <div className="objects-heading"><h3>Objekty <span>{active.features.length}</span></h3><button onClick={() => map.current?.fit()}>Zobrazit vše</button></div>
        <label className="search-label"><input aria-label="Hledat objekty aktivní vrstvy" placeholder="Vyhledat oblast nebo objekt…" value={filter} onChange={e => setFilter(e.target.value)} /></label>
        <div className="object-list">{active.features.filter(f => f.name.toLocaleLowerCase('cs').includes(filter.toLocaleLowerCase('cs'))).map(f => <button disabled={editing} key={f.id} className={selected?.featureId === f.id && selected.layerId === active.id ? 'chosen' : ''} onClick={() => { setSelected({ layerId: active.id, featureId: f.id }); setTool('select'); }}><span aria-hidden="true">{f.geometry.type === 'Point' ? '●' : f.geometry.type === 'LineString' ? '╱' : '⬡'}</span><span>{f.name}<small>{f.circle ? 'Metrický kruh' : f.geometry.type}</small></span></button>)}
          {!active.features.length && <p className="empty-copy">Vrstva je zatím prázdná.<br />Nakreslete první objekt nebo importujte GeoJSON.</p>}
        </div>
        {sourceError && <div className="source-load-error" role="status">{sourceError}</div>}
        <div className="storage-note"><span className="status-dot" />{saveStatus || 'Lokální draft'}<p>Data zůstávají v tomto prohlížeči. Nejde o týmovou ani cloudovou databázi. Pravidelně exportujte zálohu.</p></div>
      </aside>
      <main className="map-panel">
        <div className="toolbar" aria-label="Geografické nástroje">
          {(['select', 'point', 'line', 'polygon', 'hole', 'circle', 'measure', 'inspect'] as Tool[]).map((item, i) => <button key={item} aria-label={toolNames[item]} aria-pressed={tool === item} disabled={editing || (isManagedLayer(active) && !['select', 'inspect', 'measure'].includes(item)) || (item === 'hole' && (!selectedFeature || !isArea(selectedFeature.geometry) || !!selectedFeature.circle))} onClick={() => { setTool(item); setError(''); }}><span aria-hidden="true">{item === 'select' ? <CursorIcon /> : ['', '●', '╱', '⬡', '◌', '◯', '↔', '⌖'][i]}</span>{toolNames[item]}</button>)}
          <div className="history-buttons"><button aria-label="Zpět" disabled={!history.past.length || editing} onClick={() => undo()}>↶</button><button aria-label="Znovu" disabled={!history.future.length || editing} onClick={() => undo(true)}>↷</button></div>
        </div>
        <div className="map-stage">
          <MapCanvas ref={map} testPoint={testPoint} onTestPoint={setTestPoint} world={world} selected={selected} tool={tool} apiKey={apiKey} onSelect={selection => { setSelected(selection); setActiveId(selection.layerId); }} onCreate={geometry => attempt(() => addGeometry(geometry))} onCircle={center => attempt(() => addGeometry(makeMetricCircle(center, Number(radius)), { center, radiusMeters: Number(radius) }))} onEdit={geometry => attempt(() => { updateFeature({ geometry }); setTool('select'); })} onMeasure={setMeasurement} onError={setError} onTileStatus={setTileStatus} />
          {tileStatus !== 'ready' && <div className={`map-notice ${tileStatus === 'error' ? 'warning' : ''}`} role="status"><strong>{tileStatus === 'missing' ? 'Chybí API klíč Mapy.com' : tileStatus === 'error' ? 'Mapový podklad se nepodařilo načíst' : 'Načítám mapový podklad…'}</strong><span>{tileStatus === 'missing' ? 'Přidejte klientský klíč v Nastavení mapy nebo do .env.local. Geometrie lze editovat i bez podkladu.' : tileStatus === 'error' ? 'Ověřte klíč, povolený HTTP referer, službu maptiles, limit a síťové připojení. Vaše geometrie zůstávají zachované.' : 'Mapy.com REST API'}</span></div>}
          <button className="prague-button" onClick={() => map.current?.prague()}>⌖ Zpět na Prahu</button>
          <div className="map-help" aria-live="polite"><strong>{toolNames[tool]}</strong><span>{tool === 'select' ? 'Kliknutím vyberte objekt. Pro kreslení zvolte nástroj.' : tool === 'inspect' ? 'Klikněte na mapu nebo přetáhněte testovací špendlík. Výsledky jsou vpravo.' : tool === 'point' ? 'Klikněte na mapu a vložte bod.' : tool === 'circle' ? 'Kliknutím určete střed kruhu.' : tool === 'measure' ? measurement === null ? 'Klikněte na dva body. Měří se vzdálenost po povrchu Země.' : `${measurement.toLocaleString('cs', { maximumFractionDigits: 1 })} m · ${(measurement / 1000).toLocaleString('cs', { maximumFractionDigits: 3 })} km. Další kliknutí začne nové měření.` : tool === 'edit' ? 'Přetáhněte vrcholy. Klik na hranu přidá vrchol, pravé tlačítko vrchol odstraní. Potom změny uložte.' : tool === 'hole' ? 'Nakreslete otvor uvnitř vybraného polygonu. Kliknutím na první vrchol jej uzavřete.' : 'Klikáním přidávejte vrcholy. Polygon dokončíte prvním, linii posledním vrcholem.'}</span>
            {tool === 'circle' && <label>Poloměr (m)<input aria-label="Poloměr nového kruhu (m)" type="number" min="1" max="100000" value={radius} onChange={e => setRadius(e.target.value)} /></label>}
            {tool !== 'select' && <button onClick={() => { setTool('select'); if (editing) setHistory(h => ({ ...h, present: structuredClone(h.present) })); }}>Zrušit nástroj</button>}
          </div>
          <div className="map-legend"><span className="legend-line" />Herní hranice <span className="legend-shape" />Vlastní geometrie</div>
        </div>
        <div className="map-footer"><span>WGS84 · [délka, šířka] · metry</span><span className={areaReady ? '' : 'unconfigured'}>{areaReady ? '● Herní oblast definována' : '○ Herní oblast zatím není definována'}</span></div>
      </main>
      <aside className="right-panel panel">
        <div className="panel-heading"><div><span className="eyebrow">VYBRANÝ OBJEKT</span><h2>Vlastnosti</h2></div><span className="draft-chip">draft</span></div>
        {tool === 'inspect' ? <PositionInspector point={testPoint} world={world} /> : selectedFeature && selectedLayer?.dataset ? <div className="managed-properties"><h3>{selectedFeature.name}</h3><p>Oficiální kód: <code>{String(selectedFeature.attributes.code)}</code><br />{selectedFeature.geometry.type}</p><SourceMetadata layer={selectedLayer} /><details><summary>Zdrojové atributy</summary><pre>{JSON.stringify(selectedFeature.attributes, null, 2)}</pre></details><p>Oficiální geometrii lze nahradit ověřenou aktualizací zdroje.</p><button onClick={() => setSourcesOpen(true)}>Porovnat / aktualizovat zdroj</button></div> : selectedFeature ? <FeatureProperties key={`${selectedLayer!.id}/${selectedFeature.id}/${world.updatedAt}`} feature={selectedFeature} editing={editing} onChange={change => attempt(() => updateFeature(change))} onEdit={() => { if (!selectedLayer?.visible) { setError('Vybraná vrstva je skrytá. Před úpravou vrcholů ji zobrazte.'); return; } setTool('edit'); }} onSaveEdit={() => map.current?.saveEdit()} onDelete={() => { attempt(() => updateLayer(selectedLayer!.id, { features: selectedLayer!.features.filter(f => f.id !== selectedFeature.id) })); setSelected(null); setTool('select'); }} /> : <div className="selection-empty"><div aria-hidden="true"><CursorIcon /></div><h3>Prostor pro vaše data</h3><p>Vyberte objekt v mapě nebo v seznamu. Zde uvidíte jeho geometrii, původ a vlastnosti.</p><hr /><span className="eyebrow">JAK ZAČÍT</span><ol><li>Vyberte vrstvu Herní oblast.</li><li>Nakreslete její polygon.</li><li>Do vlastní vrstvy přidejte další objekty.</li><li>Exportujte zálohu svého světa.</li></ol></div>}
        <div className="export-section"><h3>Přenosná data</h3><p>JSON obsahuje celý draft. GeoJSON navíc otevřete v běžných GIS nástrojích; metadata editoru jsou v rozšířených polích.</p><button disabled={editing} onClick={() => attempt(() => download(exportWorld(world, 'geojson'), 'jetlag-praha-draft.geojson'))}>Exportovat GeoJSON</button></div>
      </aside>
    </div>
    {sourcesOpen && <AdministrativeDialog world={world} bundled={bundled} loadError={sourceError} onClose={() => setSourcesOpen(false)} onApply={layer => { commit(applyAdministrativeUpdate(world, layer)); setSelected(null); setTool('select'); }} />}
    {importing && <ImportDialog onClose={() => setImporting(false)} onImport={async (contents, mode, title, source) => {
      if (mode === 'world') {
        const imported = importWorld(contents);
        await verifyAdministrativeSources(imported);
        if (!confirm('Nahradit současný draft importovaným světem? Změnu lze vrátit tlačítkem Zpět.')) return;
        commit(imported); setActiveId(imported.layers[0].id);
      } else {
        const layer = importGeoJson(contents, { title, source, kind: mode === 'game_area' ? 'game_area' : 'custom' });
        if (mode === 'game_area' && areaReady && !confirm('Nahradit současnou herní hranici importovanou geometrií?')) return;
        commit({ ...world, layers: mode === 'game_area' ? world.layers.map(l => l.kind === 'game_area' ? layer : l) : [...world.layers, layer] });
        setActiveId(layer.id);
      }
      setSelected(null); setTool('select'); setImporting(false);
    }} />}
  </div>;
}

function FeatureProperties({ feature: f, editing, onChange, onEdit, onSaveEdit, onDelete }: { feature: GeoFeature; editing: boolean; onChange(change: Partial<GeoFeature>): void; onEdit(): void; onSaveEdit(): void; onDelete(): void }) {
  const [geometryError, setGeometryError] = useState('');
  return <div className="feature-properties">
    <dl className="feature-facts"><dt>ID</dt><dd className="mono">{f.id}</dd><dt>Geometrie</dt><dd>{f.circle ? 'Polygon · metrický kruh' : f.geometry.type}</dd><dt>Datum importu / vytvoření</dt><dd>{new Date(f.importedAt).toLocaleString('cs', { timeZone: 'Europe/Prague' })}</dd></dl>
    <form onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); onChange({ name: String(data.get('name')), note: String(data.get('note')), source: String(data.get('source')) }); }}><fieldset disabled={editing}>
      <label>Jméno<input name="name" defaultValue={f.name} required maxLength={10000} /></label><label>Poznámka<textarea name="note" defaultValue={f.note} rows={3} maxLength={10000} /></label><label>Zdroj objektu<input name="source" defaultValue={f.source} maxLength={10000} /></label><button className="wide">Uložit vlastnosti</button>
    </fieldset></form>
    {editing ? <button className="primary wide" onClick={onSaveEdit}>Uložit geometrii</button> : !f.circle && <button className="wide" onClick={onEdit}>Upravit vrcholy v mapě</button>}
    {f.circle && <form className="circle-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); const center = [Number(data.get('lon')), Number(data.get('lat'))]; const radiusMeters = Number(data.get('radius')); try { onChange({ circle: { center, radiusMeters }, geometry: makeMetricCircle(center, radiusMeters) }); setGeometryError(''); } catch (error) { setGeometryError(errorText(error)); } }}><fieldset disabled={editing}><h3>Metrický kruh</h3><label>Zeměpisná délka<input name="lon" type="number" step="any" min="-180" max="180" required defaultValue={f.circle.center[0]} /></label><label>Zeměpisná šířka<input name="lat" type="number" step="any" min="-90" max="90" required defaultValue={f.circle.center[1]} /></label><label>Poloměr (m)<input name="radius" type="number" step="any" min="0.01" max="100000" required defaultValue={f.circle.radiusMeters} /></label><button>Přepočítat kruh</button><p>128 geodeticky vypočtených úseků. Střed a poloměr se zachovávají i v exportu.</p></fieldset></form>}
    {geometryError && <p className="inline-error" role="alert">{geometryError}</p>}
    <details className="raw-geometry"><summary>Souřadnice GeoJSON</summary><form onSubmit={e => { e.preventDefault(); try { const geometry = validateGeometry(JSON.parse(String(new FormData(e.currentTarget).get('geometry')))); onChange({ geometry }); setGeometryError(''); } catch (error) { setGeometryError(errorText(error)); } }}><textarea aria-label="Geometrie GeoJSON" name="geometry" rows={9} defaultValue={JSON.stringify(f.geometry, null, 2)} readOnly={!!f.circle || editing} />{!f.circle && <button disabled={editing}>Použít geometrii</button>}</form></details>
    <details><summary>Zdrojové atributy ({Object.keys(f.attributes).length})</summary><pre>{JSON.stringify(f.attributes, null, 2)}</pre></details>
    <button className="danger wide" disabled={editing} onClick={() => { if (confirm(`Smazat objekt „${f.name}“?`)) onDelete(); }}>Smazat objekt</button>
  </div>;
}

function ImportDialog({ onClose, onImport }: { onClose(): void; onImport(contents: string, mode: string, title: string, source: string): void | Promise<void> }) {
  const [mode, setMode] = useState('layer');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const data = new FormData(e.currentTarget); const file = data.get('file') as File;
    if (!file?.size) { setError('Vyberte neprázdný soubor.'); return; }
    if (file.size > (mode === 'world' ? 100 : 10) * 1024 * 1024) { setError(`Limit importu je ${mode === 'world' ? 100 : 10} MB. Pro větší soubory nejprve data rozdělte.`); return; }
    setBusy(true); setError('');
    try { await onImport(await file.text(), mode, String(data.get('title') ?? file.name), String(data.get('source') ?? '')); }
    catch (error) { setError(errorText(error)); }
    finally { setBusy(false); }
  }
  return <div className="modal-backdrop"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title"><span className="eyebrow">VLASTNÍ A OTEVŘENÁ DATA</span><h2 id="import-title">Import dat</h2><p>Geometrie se validují před uložením. Import chybných dat nezmění rozpracovaný svět.</p><form onSubmit={submit}><label>Co importovat<select value={mode} onChange={e => setMode(e.target.value)}><option value="layer">GeoJSON → nová vrstva</option><option value="game_area">GeoJSON → herní oblast</option><option value="world">Kompletní svět JSON / GeoJSON</option></select></label>
    {mode !== 'world' && <><label>Název importované vrstvy<input name="title" required maxLength={200} defaultValue="Importovaná vrstva" /></label><label>Popis zdroje / licence<input name="source" required maxLength={10000} placeholder="Vlastní data nebo název a licence otevřeného zdroje" /></label></>}
    <label>Soubor<input name="file" type="file" accept=".json,.geojson,application/json,application/geo+json" required /></label><p>WGS84 · [longitude, latitude] · Point, LineString, Polygon, MultiPolygon. Nejvýše 10 MB pro vlastní GeoJSON, 100 MB pro celý svět; 10 000 objektů na vrstvu.</p>{error && <div className="inline-error" role="alert">{error}</div>}<div className="dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Zrušit</button><button className="primary" disabled={busy}>{busy ? 'Validuji…' : 'Importovat'}</button></div></form></section></div>;
}
