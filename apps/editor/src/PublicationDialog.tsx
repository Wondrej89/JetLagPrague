import { useCallback, useEffect, useRef, useState } from 'react';
import { defaultGameStopConfiguration, compareGameReleases, gamePublicationErrors, loadGameDataRelease, readGameReleaseIndex, transportModes, type GameDataRelease, type GameReleaseIndex, type GameStopConfiguration, type WorldDraft } from '@jetlag/geo-core';

interface Session { token: string; csrf: string; expiresAt: number; login: string }
interface Repository { commit: string; index: GameReleaseIndex | null; deployment: { status: string; conclusion: string | null; url: string } | null }
const publisher = (import.meta.env.VITE_PUBLISHER_URL ?? '').replace(/\/$/, '');
const publicBase = new URL(import.meta.env.DEV ? '/releases/' : '../releases/', document.baseURI).href;
const message = (error: unknown) => error instanceof Error ? error.message : 'Operace se nezdařila.';

export function PublicationDialog({ world, pidKey, onBuild, onRules, onClose, onBackup }: { world: WorldDraft; pidKey: string; onBuild(): Promise<GameDataRelease>; onRules(value: GameStopConfiguration): void; onClose(): void; onBackup(): void }) {
  const [configured, setConfigured] = useState(false), [session, setSession] = useState<Session | null>(null);
  const [repository, setRepository] = useState<Repository | null>(null), [published, setPublished] = useState<GameDataRelease | null>(null);
  const [proposal, setProposal] = useState<{ release: GameDataRelease; world: WorldDraft; pidKey: string } | null>(null);
  const [error, setError] = useState(''), [publicError, setPublicError] = useState(''), [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false), [rollbackId, setRollbackId] = useState('');
  const popup = useRef<Window | null>(null);
  const request = useCallback(async (path: string, data?: unknown, auth = session) => {
    if (!publisher) throw new Error('Publikace není nakonfigurována.');
    const response = await fetch(`${publisher}${path}`, { method: data === undefined ? 'GET' : 'POST', credentials: 'omit', signal: AbortSignal.timeout(120000), headers: { ...(auth ? { Authorization: `Bearer ${auth.token}`, 'X-CSRF-Token': auth.csrf } : {}), ...(data === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
    const result = await response.json(); if (!response.ok) throw new Error(result.error ?? `Publikace selhala (HTTP ${response.status}).`); return result;
  }, [session]);
  const refreshPublic = useCallback(async () => {
    try { const result = await loadGameDataRelease(publicBase); setPublished(result.release); setPublicError(''); }
    catch (error) { setPublicError(message(error)); }
  }, []);
  useEffect(() => { void refreshPublic(); if (publisher) void request('/status').then(result => setConfigured(result.configured === true)).catch(error => setError(message(error))); }, [request, refreshPublic]);
  useEffect(() => {
    if (!publisher) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== new URL(publisher).origin || event.source !== popup.current || !popup.current) return;
      const value = event.data;
      if (value?.type !== 'jetlag-publisher-session' || !/^[A-Za-z0-9_-]{43}$/.test(value.token) || !/^[A-Za-z0-9_-]{43}$/.test(value.csrf) || typeof value.login !== 'string' || typeof value.expiresAt !== 'number' || value.expiresAt <= Date.now() || value.expiresAt > Date.now() + 16 * 60000) return;
      void request('/session', undefined, value).then(() => { setSession(value); setError(''); }).catch(error => setError(message(error)));
      popup.current = null;
    };
    window.addEventListener('message', receive); return () => window.removeEventListener('message', receive);
  }, [request]);
  useEffect(() => {
    if (!session) return;
    const timeout = setTimeout(() => { setSession(null); setRepository(null); setNotice('Relace vypršela. Přihlaste se znovu.'); }, Math.max(0, session.expiresAt - Date.now()));
    let cancelled = false;
    const refresh = async () => {
      try { const result = await request('/publication'); if (cancelled) return; if (result.index) readGameReleaseIndex(result.index); setRepository(result); await refreshPublic(); }
      catch (error) { if (!cancelled) setError(message(error)); }
    };
    void refresh(); const timer = setInterval(() => void refresh(), 20000);
    return () => { cancelled = true; clearTimeout(timeout); clearInterval(timer); };
  }, [session, request, refreshPublic]);
  const stale = !!proposal && (proposal.world !== world || proposal.pidKey !== pidKey);
  const release = proposal?.release;
  const issues = release ? gamePublicationErrors(release) : [];
  const diff = release && published ? compareGameReleases(published, release) : null;
  async function check() {
    setBusy(true); setError(''); setProposal(null);
    try { const result = await onBuild(); await refreshPublic(); setProposal({ release: result, world, pidKey }); }
    catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  async function mutate(rollback = false) {
    if (!session || !repository || (!rollback && (!release || stale || issues.length))) return;
    if (!confirm(rollback ? 'Vrátit veřejné podklady na vybranou neměnnou verzi? Změna se projeví až po úspěšném nasazení.' : `Publikovat ${release!.data.pois.length} POI a ${release!.data.pidSnapshot.stops.length} zastávek? Vznikne nová verze v repozitáři.`)) return;
    setBusy(true); setError('');
    try {
      const result = await request(rollback ? '/rollback' : '/publish', rollback ? { expectedCommit: repository.commit, releaseId: rollbackId } : { expectedCommit: repository.commit, release });
      setNotice(result.message); setRepository(await request('/publication'));
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  const currentId = repository?.index?.current.releaseId;
  const deployed = currentId && currentId === published?.releaseId;
  const rules = world.gameStops ?? defaultGameStopConfiguration();
  return <div className="modal-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="publication-title" className="import-dialog publication-dialog">
    <div className="dialog-heading"><h2 id="publication-title">Publikace herních podkladů</h2><button onClick={onClose}>Zavřít</button></div>
    <p>Pracovní svět zůstává v tomto prohlížeči. Publikace obsahuje schválené POI, hranice a ověřené herní zastávky; úplný GIS audit se neposílá.</p>
    <p className={configured ? '' : 'message warning'}>{configured ? session ? `Správce: ${session.login} · relace platí do ${new Date(session.expiresAt).toLocaleTimeString('cs-CZ')}` : 'Publikace vyžaduje přihlášení správce.' : 'Publikace není nakonfigurována'}</p>
    <div className="publication-actions"><button disabled={!configured || !!session || busy} onClick={() => { popup.current = window.open(`${publisher}/auth/start`, 'jetlag-publisher', 'popup,width=620,height=760'); if (!popup.current) setError('Pro přihlášení povolte vyskakovací okno.'); }}>Přihlásit přes GitHub</button>{session && <button onClick={() => { void request('/logout', {}).catch(error => setError(message(error))); setSession(null); setRepository(null); }}>Odhlásit</button>}<button onClick={onBackup}>Stáhnout úplnou zálohu světa</button></div>
    <h3>Veřejně dostupná verze</h3>{published ? <p><code>{published.releaseId}</code><br/>{new Date(published.publishedAt).toLocaleString('cs-CZ')} · {published.kind === 'reference' ? 'Referenční podklady' : 'Schválená publikace'}</p> : <p role="status">{publicError || 'Načítám poslední publikaci…'}</p>}
    {repository && <div className="message warning">{deployed ? 'Aktuální verze repozitáře je dostupná ve veřejné aplikaci.' : repository.deployment?.conclusion && repository.deployment.conclusion !== 'success' ? 'Nasazení nebylo úspěšné. Předchozí veřejné podklady zůstávají dostupné.' : 'Verze repozitáře zatím není potvrzena ve veřejné aplikaci. Čeká na nasazení.'}{repository.deployment && <a href={repository.deployment.url} target="_blank" rel="noreferrer">Průběh GitHub Actions ↗</a>}</div>}
    {rules && <fieldset><legend>Povolené dopravní prostředky pro publikaci</legend><div className="publication-modes">{transportModes.map(mode => <label key={mode}><input type="checkbox" checked={!rules.allowedModes || rules.allowedModes.includes(mode)} onChange={event => { const modes = new Set(rules.allowedModes ?? transportModes); if (event.target.checked) modes.add(mode); else modes.delete(mode); if (modes.size) onRules({ ...rules, allowedModes: [...modes] }); else setError('Povolte alespoň jeden dopravní prostředek.'); }}/>{({ metro: 'Metro', tram: 'Tramvaj', bus: 'Autobus', trolleybus: 'Trolejbus', train: 'Vlak', ferry: 'Přívoz', funicular: 'Lanovka', unknown: 'Neznámý' } as Record<string,string>)[mode] ?? mode}</label>)}</div></fieldset>}
    <div className="publication-actions"><button className="primary" disabled={busy || !pidKey} onClick={() => void check()}>{busy ? 'Zpracovávám…' : 'Zkontrolovat data k publikaci'}</button><button className="primary" disabled={!configured || !session || !repository || !release || stale || issues.length > 0 || busy || (!!publicError && !!repository?.index) || !!repository.index?.versions.some(entry => entry.releaseId === release.releaseId)} onClick={() => void mutate()}>Publikovat změny</button></div>
    {!pidKey && <p>Nejprve načtěte platný snapshot PID.</p>}{notice && <p role="status">{notice}</p>}{error && <p className="message error" role="alert">{error}</p>}
    {stale && <p role="alert">Svět nebo PID se od kontroly změnil. Znovu zkontrolujte data.</p>}
    {release && <><h3>{diff?.identical ? 'Žádné nepublikované změny' : 'Návrh publikace · lokální změny'}</h3><dl className="publication-counts"><dt>Schválené parky</dt><dd>{release.data.pois.filter(p=>p.category==='park').length}</dd><dt>Letiště</dt><dd>{release.data.pois.filter(p=>p.category==='airport').length}</dd><dt>Herní zastávky</dt><dd>{release.data.pidSnapshot.stops.length}</dd><dt>Herní oblast</dt><dd>{release.data.gameArea.name}<br/><code>{release.data.gameArea.id}</code></dd><dt>Verze návrhu</dt><dd><code>{release.releaseId}</code></dd></dl>
    {diff ? <table><thead><tr><th>Objekty</th><th>Přidané</th><th>Změněné</th><th>Odstraněné</th></tr></thead><tbody>{([['POI',diff.pois],['PID',diff.pid],['Administrativní území',diff.areas]] as const).map(([name,counts])=><tr key={name}><th>{name}</th><td>{counts.added}</td><td>{counts.changed}</td><td>{counts.removed}</td></tr>)}</tbody></table> : <p>Porovnání není dostupné: {publicError || 'chybí předchozí veřejná verze'}. Návrh nebyl prohlášen za shodný.</p>}
    {diff?.gameAreaChanged && <p>Herní hranice se proti veřejné verzi mění.</p>}
    {issues.length ? <div role="alert" className="message error"><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div> : <p>Kontrola návrhu prošla. Server před zápisem znovu ověří identitu, data, aktuální PID a očekávaný commit.</p>}
    <details><summary>Verze a licence zdrojů ({release.data.sourceVersions.length})</summary>{release.data.sourceVersions.map(source=><p key={source.key}><strong>{source.provider} · {source.key}</strong><br/><code>{source.version}</code><br/>{source.dataDate ?? 'Datum nedoloženo'} · {source.license.name}{source.url && <> · <a href={source.url} target="_blank" rel="noreferrer">Zdroj</a></>}</p>)}</details></>}
    {session && repository?.index && repository.index.versions.length > 1 && <fieldset><legend>Návrat na předchozí publikaci</legend><select aria-label="Předchozí publikace" value={rollbackId} onChange={e=>setRollbackId(e.target.value)}><option value="">Vyberte verzi</option>{repository.index.versions.filter(entry=>entry.releaseId!==currentId).map(entry=><option key={entry.releaseId} value={entry.releaseId}>{entry.publishedAt} · {entry.releaseId.slice(8,20)}</option>)}</select><button disabled={!rollbackId || busy} onClick={()=>void mutate(true)}>Obnovit vybranou publikaci</button><p>Starší PID po návratu zůstává historickou referencí. Rollback nemění pracovní svět.</p></fieldset>}
  </section></div>;
}
