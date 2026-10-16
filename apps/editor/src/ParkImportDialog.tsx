import { useEffect, useRef, useState, type FormEvent } from 'react';
import { compareParkUpdate, isArea, validateGeometry, type AreaGeometry, type ParkDataset, type PoiConfiguration } from '@jetlag/geo-core';
import type { ParkFileInfo, ParkImportOptions, ParkImportReport } from '../../../packages/geo-core/src/park-import';
import { parkImportTask } from './park-import-task';

const metadataUrl = 'https://geoportalpraha.cz/data-a-sluzby/35e82d77fbd44d96b470bf5731fbb0d4';
export function ParkImportDialog({ configuration, onClose, onApply, onPreview }: { configuration: PoiConfiguration; onClose(): void; onApply(dataset: ParkDataset): void; onPreview?(geometry: AreaGeometry | null): void }) {
  const [file, setFile] = useState<File | null>(null);
  const [info, setInfo] = useState<ParkFileInfo | null>(null);
  const [report, setReport] = useState<ParkImportReport | null>(null);
  const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  const [previewing, setPreviewing] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const [fields, setFields] = useState({ sourceId: 'ipr-mpp-100-parky', provider: 'IPR Praha – MPP_100_Parky_p', url: metadataUrl, idField: '', nameField: '', license: 'Nedoložena', licenseUrl: '', dataDate: '' });
  useEffect(() => () => { controller.current?.abort(); }, []);
  function cancel() { controller.current?.abort(); setBusy(''); }
  function close() { cancel(); onPreview?.(null); onClose(); }
  async function inspect(selected: File | null) {
    cancel(); setFile(selected); setInfo(null); setReport(null); setError('');
    if (!selected) return;
    if (!selected.size || selected.size > 20 * 1024 ** 2) { setError('Vyberte neprázdný ZIP / GeoJSON nejvýše 20 MB.'); return; }
    const task = new AbortController(); controller.current = task; setBusy('Čtu strukturu, CRS a kódování souboru…');
    try {
      const value = await parkImportTask<ParkFileInfo>({ action: 'inspect', bytes: await selected.arrayBuffer(), filename: selected.name }, task.signal);
      if (task.signal.aborted) return;
      setInfo(value); const mpp = /^MPP_100_Parky_p$/i.test(value.layerName);
      const nextFields = { ...fields, ...(mpp ? { sourceId: 'ipr-mpp-100-parky', provider: 'IPR Praha – MPP_100_Parky_p', url: metadataUrl } : {}), idField: value.suggestedId, nameField: value.suggestedName };
      setFields(nextFields);
      if (value.format === 'shapefile-zip' && nextFields.idField) await runAnalysis(selected, nextFields, task);
    } catch (error) { if (!task.signal.aborted) setError((error as Error).message); }
    finally { if (!task.signal.aborted) setBusy(''); }
  }
  async function runAnalysis(selected: File, values: typeof fields, task: AbortController) {
    setBusy('Opravuji geometrie pomocí GEOS, slučuji shodná ID a kontroluji výsledek…'); setError('');
    const options: ParkImportOptions = { idField: values.idField.trim(), nameField: values.nameField.trim(),
      source: { id: values.sourceId.trim(), provider: values.provider.trim(), url: values.url.trim(), license: { name: values.license.trim(), url: values.licenseUrl.trim() || null }, dataDate: values.dataDate || null, retrievedAt: new Date().toISOString(), verification: 'user_supplied', note: `Uživatelský import ${selected.name}; doložte původ a licenci. Zpracování ani název souboru nepotvrzují oficiální původ.` } };
    const value = await parkImportTask<ParkImportReport>({ action: 'analyze', bytes: await selected.arrayBuffer(), filename: selected.name, options }, task.signal);
    if (!task.signal.aborted) setReport(value);
  }
  async function analyze(event?: FormEvent) {
    event?.preventDefault(); if (!file || !info) return;
    cancel(); const task = new AbortController(); controller.current = task;
    try { await runAnalysis(file, fields, task); }
    catch (error) { if (!task.signal.aborted) setError((error as Error).message); }
    finally { if (!task.signal.aborted) setBusy(''); }
  }
  async function apply() {
    const candidate = report?.candidate; if (!candidate) return;
    const task = new AbortController(); controller.current = task; setBusy('Připravuji bezpečné uložení kandidátů…'); setError('');
    try {
      // Structured cloning loses the immutable geometry cache. Warm it in small
      // yielding batches before the world's synchronous schema validation.
      for (let index = 0; index < candidate.records.length; index++) {
        if (task.signal.aborted) return;
        const geometry = validateGeometry(candidate.records[index].geometry);
        if (!isArea(geometry)) throw new Error('Park musí být polygon.');
        candidate.records[index].geometry = geometry;
        if (index % 8 === 0) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      }
      if (!task.signal.aborted) onApply(candidate);
    } catch (error) { if (!task.signal.aborted) setError((error as Error).message); }
    finally { if (!task.signal.aborted) setBusy(''); }
  }
  function preview(geometry: AreaGeometry | null) { if (geometry) { onPreview?.(geometry); setPreviewing(true); } }
  const difference = report?.candidate && compareParkUpdate(configuration.sources.find(source => source.source.id === report.candidate!.source.id), report.candidate);
  const input = (key: keyof typeof fields, title: string, options: { required?: boolean; type?: string } = {}) => <label>{title}<input name={key} type={options.type ?? 'text'} required={options.required} value={fields[key]} maxLength={key === 'sourceId' ? 70 : 10000} onChange={e => setFields(values => ({ ...values, [key]: e.target.value }))} /></label>;
  if (previewing) return <section className="park-import-map-preview" role="region" aria-label="Problémový objekt v mapě"><h3>Náhled geometrie importu</h3><p>Červená geometrie slouží pouze ke kontrole. Parková databáze se nezměnila.</p><button onClick={() => { onPreview?.(null); setPreviewing(false); }}>Zpět k náhledu importu</button><button onClick={close}>Zrušit celý import</button></section>;
  return <div className="modal-backdrop"><section className="import-dialog park-import-dialog" role="dialog" aria-modal="true" aria-labelledby="park-import-title"><h2 id="park-import-title">Import a aktualizace parků</h2>
    <p>Nahrajte původní Shapefile ZIP přímo z Geoportálu, nebo GeoJSON WGS84. ZIP musí obsahovat SHP, SHX, DBF, PRJ a CPG stejné vrstvy. Vrstva <strong>MPP_100_Parky_p</strong> se po výběru ZIPu zpracuje automaticky. Bezpečné opravy a sloučení shodných ID nevyžadují jednotlivé potvrzení. Metadata, licenci a datum před použitím ověřte.</p>
    {!report && <form onSubmit={analyze}><fieldset disabled={!!busy}>
      <label>GeoJSON parků / Shapefile ZIP<input name="file" type="file" accept=".zip,.geojson,.json,application/zip,application/geo+json,application/json" required={!file} onChange={e => void inspect(e.target.files?.[0] ?? null)} /></label>
      {info && <p role="status">{info.layerName} · {info.count} objektů · {info.originalCrs} · {info.encoding}</p>}
      {input('sourceId', 'Stálé ID zdroje', { required: true })}{input('provider', 'Poskytovatel', { required: true })}{input('url', 'URL zdroje / metadat', { required: true, type: 'url' })}
      {input('idField', 'Pole stabilního ID', { required: true })}{input('nameField', 'Pole názvu')}
      {info?.fields.length ? <p>Dostupné atributy: {info.fields.join(', ')}. Pro GeoJSON Feature.id použijte $id.</p> : null}
      {input('license', 'Licence', { required: true })}{input('licenseUrl', 'URL licence', { type: 'url' })}{input('dataDate', 'Datum dat (pokud doloženo)', { type: 'date' })}
      <button className="primary" disabled={!info}>Zkontrolovat import</button>
    </fieldset></form>}
    {report && <div><h3>Kontrola rozdílů</h3><dl className="feature-facts"><dt>Vrstva</dt><dd>{report.info.layerName}</dd><dt>Načtené objekty</dt><dd>{report.info.count}</dd><dt>Původní CRS</dt><dd>{report.info.originalCrs}</dd><dt>Kódování</dt><dd>{report.info.encoding}</dd><dt>Platné / neplatné zdrojové geometrie po opravě</dt><dd>{report.valid} / {report.invalid}</dd><dt>Sloučená ID</dt><dd>{report.merges.length} skupin · {report.merges.reduce((sum, group) => sum + group.rows.length, 0)} zdrojových objektů</dd><dt>Bez názvu</dt><dd>{report.unnamed}</dd></dl>
      {difference ? <p>{report.candidate!.records.length} kandidátů · {difference.added} nových · {difference.changed} změněných · {difference.removed} chybějících</p> : <p>Nové / změněné / odstraněné: nelze spolehlivě určit, dokud nevyřešíte blokující chyby. Databáze zůstává beze změny.</p>}
      {report.repairs.length > 0 && <div className="park-issues"><h3>Automatické opravy geometrie</h3>{report.repairs.map(repair => <article key={repair.row}><strong>ID {repair.sourceId} · {repair.name || 'bez názvu'} · {repair.accepted ? 'Opraveno a ověřeno' : 'Vyžaduje revizi'}</strong><p>{repair.engine}; změna plochy {repair.areaDifferenceM2.toPrecision(3)} m². {repair.warning ?? 'Všechny polygonové části zachovány, bez zjednodušování.'}</p></article>)}</div>}
      {report.merges.length > 0 && <div className="park-issues"><h3>Automatické sloučení shodných ID</h3>{report.merges.map(merge => <article key={merge.sourceId}><strong>ID {merge.sourceId} · {merge.rows.length} záznamů → 1 park</strong><p>{merge.names.filter(Boolean).join(' / ')}</p><p>Geometrický union · {merge.geometry.type} · jeden vnitřní referenční bod. Původní názvy i atributy jsou zachovány.</p><button onClick={() => preview(merge.geometry)}>Zobrazit sloučený park {merge.sourceId} v mapě</button></article>)}</div>}
      {report.issues.length > 0 && <div className="park-issues"><h3>Problémové objekty</h3>{report.issues.map((issue, i) => <article key={i}><strong>Objekt {issue.row} · ID {issue.sourceId || 'chybí'} · {issue.name || 'bez názvu'}</strong><p>{issue.message}</p>{issue.geometry && <button onClick={() => preview(issue.geometry)}>Zobrazit objekt {issue.row} v mapě</button>}</article>)}</div>}
      <p>Geometrické opravy se přijímají jen bez nepolygonových zbytků a při změně plochy nejvýše 0,1 % (s numerickou tolerancí 0,01 m²). Import vytvoří kandidáty k revizi; herní schválení zůstává samostatné.</p>
      <button onClick={() => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'park-import-diagnostics.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      }}>Stáhnout diagnostiku a audit</button>
      {report.candidate && <><code className="poi-checksum">SHA-256 originálu: {report.info.originalChecksum}</code><code className="poi-checksum">SHA-256 datasetu: {report.candidate.checksum}</code><button className="primary" disabled={!!busy} onClick={() => void apply()}>Použít parkový zdroj</button></>}
      <button disabled={!!busy} onClick={() => { setReport(null); setError(''); }}>Upravit parametry / vybrat jiný soubor</button>
    </div>}
    {busy && <p role="status">{busy}</p>}{error && <p role="alert" className="inline-error">{error}</p>}<button onClick={close}>{busy ? 'Zrušit zpracování a zavřít' : 'Zavřít import parků'}</button>
  </section></div>;
}
