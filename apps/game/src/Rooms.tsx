import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Fix, GameSize } from '../../../packages/game-core/src/index';
import type { RoomSession, RoomSnapshot, RoomCredentials } from '../../../packages/game-core/src/room-protocol';
import { loadGameDataRelease, type GameDataRelease } from '../../../packages/geo-core/src/game-release';
import { GamePhone } from '../../../packages/game-ui/src/Phone';
import { browserLocationProvider } from '../../../packages/game-ui/src/runtime';
import { apiBase, enterRoom, getStatus, readSession, remember, RoomTransport, type LinkState } from './room-client';

const releaseBase = new URL(`${import.meta.env.BASE_URL}releases/`, document.baseURI).href;
const displayError = (error: unknown) => error instanceof Error ? error.message : 'Akce se nezdařila.';

function founderFix(): Promise<Fix> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error('Prohlížeč neposkytuje GPS.')); return; }
    navigator.geolocation.getCurrentPosition(position => resolve({
      point: [position.coords.longitude, position.coords.latitude],
      at: position.timestamp, accuracy: position.coords.accuracy,
    }), error => reject(new Error(error.code === 1
      ? 'Povol přístup k poloze a spusť měření znovu.' : 'GPS se nepodařilo změřit. Zkus to znovu.')),
    { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 });
  });
}

export function Rooms({ release }: { release: GameDataRelease | null }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<RoomSession | null>(() => apiBase ? readSession() : null);
  const [backup, setBackup] = useState('');
  const [code, setCode] = useState(() => (new URL(location.href).searchParams.get('join') ?? '').replace(/[^A-Z]/gi,'').toUpperCase().slice(0,4));
  const [size, setSize] = useState<GameSize>('medium');
  const [recovery, setRecovery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const section = useRef<HTMLElement>(null);
  useEffect(() => { if (session) section.current?.scrollIntoView(); }, [session]);
  useEffect(() => {
    if (!apiBase) return;
    let current = true;
    void getStatus().then(status => { if (current) setReady(status.configured); }).catch(() => {});
    return () => { current = false; };
  }, []);

  async function enter(action: () => Promise<RoomCredentials>) {
    setBusy(true); setError('');
    try {
      const auth = await action();
      try { remember(auth); } catch { setError('Prohlížeč neuložil relaci. Pro návrat si uschovej obnovovací kód.'); }
      setBackup(auth.recoveryCode);
      setSession(auth);
    } catch (error) { setError(displayError(error)); }
    finally { setBusy(false); }
  }

  function leave() {
    try { remember(null); } catch { /* The active connection is still closed. */ }
    setSession(null); setBackup(''); setError('');
  }

  function join(event: FormEvent) {
    event.preventDefault();
    if (/^[A-Z]{4}$/.test(code)) void enter(() => enterRoom(`/rooms/${code}/join`));
  }

  function restore(event: FormEvent) {
    event.preventDefault();
    const [code, roomId, secret, extra] = recovery.trim().split('.');
    if (!/^[A-Z]{4}$/.test(code) || !roomId || !secret || extra !== undefined) {
      setError('Zadej kompletní obnovovací kód týmu.'); return;
    }
    void enter(() => enterRoom(`/rooms/${code}/recover`, { roomId, secret }));
  }

  return <section ref={section} className="play-section" aria-labelledby="play-title">
    <div>
      <h2 id="play-title">JetLagPrague – hra na území Prahy</h2>
      <p>Hrají dva soupeřící týmy, každý alespoň s jedním hráčem, ideálně se dvěma. Pro vytvoření nové hry musíš být na území Prahy.</p>
      <a className="text-link" href="./simulator/">Otevřít simulátor</a>
      {!session && <p className="preview-links"><a href="?role=hunter">Mobilní náhled hledačů</a> · <a href="?role=hider">Mobilní náhled schovaného</a></p>}
    </div>
    <div className="room-ui">
      {error && <p role="alert" className="room-note">{error}</p>}
      {session ? <ActiveRoom key={session.token} session={session} backup={backup} release={release} onLeave={leave}/> : <>
        {!ready && <p role="status" className="room-note">Herní server zatím není dostupný.</p>}
        <div className="play-options room-actions">
          <article>
            <h3>Vlastní místnost</h3>
            <label>Velikost partie<select value={size} onChange={event => setSize(event.target.value as GameSize)}>
              <option value="small">Small</option><option value="medium">Medium</option><option value="large">Large</option>
            </select></label>
            <button disabled={!ready || busy} onClick={() => void enter(async () => enterRoom('/rooms', { fix: await founderFix(), size }))}>Vytvořit místnost</button>
          </article>
          <article>
            <h3>Připojení k týmu</h3>
            <form onSubmit={join}>
              <label>Čtyřpísmenný kód<input autoComplete="off" autoCapitalize="characters" maxLength={4} value={code} onChange={event => setCode(event.target.value.replace(/[^A-Z]/gi,'').toUpperCase())}/></label>
              <button disabled={!ready || busy || code.length !== 4}>Připojit se</button>
            </form>
          </article>
        </div>
        <details className="room-recovery">
          <summary>Obnovit tým na tomto telefonu</summary>
          <form onSubmit={restore}>
            <label>Obnovovací kód týmu<input autoComplete="off" spellCheck={false} maxLength={90} value={recovery} onChange={event => setRecovery(event.target.value)}/></label>
            <button disabled={!ready || busy || !recovery}>Obnovit relaci</button>
          </form>
        </details>
        {busy && <p role="status">Ověřuji požadavek…</p>}
      </>}
    </div>
  </section>;
}

function ActiveRoom({ session, backup, release, onLeave }: { session: RoomSession; backup: string; release: GameDataRelease | null; onLeave(): void }) {
  const [snapshot, setSnapshot] = useState<RoomSnapshot>();
  const [link, setLink] = useState<LinkState>('connecting');
  const [transport, setTransport] = useState<RoomTransport>();
  const [attempt, setAttempt] = useState(0);
  const [pinned, setPinned] = useState<GameDataRelease>();
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [gps, setGps] = useState('');
  const [gpsAttempt, setGpsAttempt] = useState(0);
  const lastSent = useRef(0);
  useEffect(() => {
    const transport = new RoomTransport(session, setSnapshot, setLink);
    setTransport(transport);
    transport.start();
    return () => transport.dispose();
  }, [session, attempt]);

  const releaseId = snapshot?.view.releaseId;
  useEffect(() => {
    if (!releaseId || release?.releaseId === releaseId) return;
    let current = true;
    void loadGameDataRelease(releaseBase, fetch, releaseId).then(result => {
      if (current) setPinned(result.release);
    }).catch(error => { if (current) setError(displayError(error)); });
    return () => { current = false; };
  }, [release,releaseId]);

  const playing = snapshot?.status === 'playing';
  useEffect(() => {
    if (!playing || !transport || link !== 'online') return;
    let timer: number | undefined;
    const stop = browserLocationProvider().start(fix => {
      if (!fix) return;
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        lastSent.current = Date.now();
        setGps('');
        void transport.send({ type: 'location', role: transport.getView().role, fix }).catch(error => setGps(displayError(error)));
      }, Math.max(0, 5000 - (Date.now() - lastSent.current)));
    }, setGps);
    return () => { clearTimeout(timer); stop(); };
  }, [gpsAttempt,link,playing,transport]);

  const invitation = new URL(location.pathname, location.origin);
  invitation.searchParams.set('join',session.code);
  async function copy(value: string, success: string) {
    try { await navigator.clipboard.writeText(value); setNotice(success); }
    catch { setError('Kopírování není dostupné. Označ a zkopíruj text ručně.'); }
  }

  const data = release?.releaseId === releaseId ? release : pinned?.releaseId === releaseId ? pinned : undefined;
  const waiting = snapshot?.status === 'waiting';
  const expired = link === 'expired';
  return <div className="active-room">
    <h3>{waiting ? 'Místnost vytvořena' : 'Herní místnost'} <code data-testid="room-code">{session.code}</code></h3>
    {link !== 'online' && <p role="status" className="room-note">{expired ? 'Týmová relace už neplatí.'
      : link === 'replaced' ? 'Tento tým se připojil v jiném okně.' : link === 'offline' ? 'Spojení vypadlo. Obnovuji relaci…' : 'Připojuji tým…'}</p>}
    {snapshot?.reference && <p className="room-note">Testovací místnost s referenčními podklady.</p>}
    {error && <p role="alert" className="room-note">{error}</p>}
    {gps && playing && <div className="room-note"><p role="status">{gps}</p><button onClick={() => setGpsAttempt(old => old+1)}>Znovu zapnout GPS</button></div>}
    {snapshot && !expired && <ul className="room-teams" aria-label="Stav obou týmů">
      {(['team-a','team-b'] as const).map((id,index) => <li key={id}>
        {snapshot.view.match?.teams.find(team => team.id === id)?.name ?? `Tým ${index+1}`}{snapshot.team === id ? ' (ty)' : ''}
        {' · '}{snapshot.connectedTeams.includes(id) ? 'připojen' : waiting && id === 'team-b' ? 'volné místo' : 'odpojen'}
      </li>)}
    </ul>}
    {!expired && waiting && <>
      <p>Čekám na protihráče.</p>
      <div className="room-buttons">
        <button onClick={() => void copy(session.code,'Kód zkopírován.')}>Kopírovat kód</button>
        <button onClick={() => void copy(invitation.href,'Odkaz zkopírován.')}>Sdílet odkaz</button>
        <button disabled={link !== 'online'} onClick={() => void transport?.cancel().then(onLeave).catch(error => setError(displayError(error)))}>Zrušit čekající místnost</button>
      </div>
      <input aria-label="Odkaz k připojení" readOnly value={invitation.href} onFocus={event => event.target.select()}/>
    </>}
    {backup && !expired && <details className="room-recovery">
      <summary>Záloha týmové relace</summary>
      <p>Uschovej si tento kód odděleně. Kdo ho použije, převezme ovládání týmu a získá nový obnovovací kód.</p>
      <input aria-label="Vlastní obnovovací kód" readOnly value={backup} onFocus={event => event.target.select()}/>
      <button onClick={() => void copy(backup,'Obnovovací kód zkopírován.')}>Kopírovat obnovovací kód</button>
    </details>}
    {notice && <p role="status">{notice}</p>}
    {link === 'replaced' && <button onClick={() => { setSnapshot(undefined); setAttempt(old => old+1); }}>Obnovit spojení</button>}
    {expired && <button onClick={onLeave}>Zavřít neplatnou relaci</button>}
    {snapshot && !waiting && !expired && transport && <div className="live-phone" inert={link !== 'online'}>
      <GamePhone transport={transport} apiKey={import.meta.env.VITE_MAPY_API_KEY} photos={transport.media} release={data ?? undefined}/>
    </div>}
    {snapshot?.previousRound && !expired && <details className="room-recovery">
      <summary>Historie prvního kola</summary>
      <ol>{snapshot.previousRound.events.map(event => <li key={event.id}>{event.text}</li>)}</ol>
    </details>}
  </div>;
}
