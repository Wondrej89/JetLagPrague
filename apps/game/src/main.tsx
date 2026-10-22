import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { gamePublicationErrors, loadGameDataRelease, type GameDataRelease } from '../../../packages/geo-core/src/game-release';
import { pragueDate } from '../../../packages/geo-core/src/pid-snapshot';
import './styles.css';
import {MobilePreview} from '../../../packages/game-ui/src/Phone';
import '../../../packages/game-ui/src/styles.css';

function Arrow({ down = false }: { down?: boolean }) { return <svg className={down ? 'link-arrow down' : 'link-arrow'} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M4 16 16 4M4 4h12v12"/></svg>; }
function App() {
  const [today, setToday] = useState(() => pragueDate());
  useEffect(() => { const timer = setInterval(() => setToday(pragueDate()), 60000); return () => clearInterval(timer); }, []);
  const [release, setRelease] = useState<GameDataRelease | null>(null), [error, setError] = useState('');
  useEffect(() => { let cancelled = false;
    loadGameDataRelease(new URL(`${import.meta.env.BASE_URL}releases/`, document.baseURI).href).then(({ release }) => { if (!cancelled) setRelease(release); }).catch(error => { if (!cancelled) setError(error instanceof Error ? error.message : 'Podklady se nepodařilo ověřit.'); });
    return () => { cancelled = true; };
  }, []);
  const issues = release ? gamePublicationErrors(release, today) : [];
  return <div className="game-shell" data-release-id={release?.releaseId ?? ''}>
    <header className="game-header"><a className="game-brand" href="./"><span className="brand-symbol">J<Arrow/></span><span>JETLAG<span className="brand-prague">PRAGUE</span></span></a><span className="header-note">MĚSTO. POHYB. STRATEGIE.</span></header>
    <main>
      <section className="hero"><div className="hero-copy"><p className="eyebrow">GEOGRAFICKÁ HRA / PRAHA</p><h1>Celá Praha.<br/>Jeden velký<br/><em>herní plán.</em></h1><p className="hero-description">Poznej město jinak. Parky, pražské čtvrti a veřejná doprava tvoří podklady pro hru inspirovanou Jet Lag: The Game.</p><a className="text-link" href="#podklady">Prohlédnout stav herních podkladů <Arrow down/></a></div>
        <div className="city-art" aria-hidden="true"><div className="art-grid"/><svg viewBox="0 0 540 580" fill="none"><path d="M255-20C370 85 155 135 283 233S389 350 249 432 334 542 302 610" stroke="#bad3cc" strokeWidth="45"/><path d="M45 150 136 105 264 153 401 73 492 163 446 261 503 375 411 493 286 469 182 528 81 416 100 305 35 247Z" fill="#497966" fillOpacity=".25" stroke="#98b7a0" strokeWidth="2" strokeDasharray="7 8"/><path d="M117 390 200 325 245 236 329 183 428 148M130 158 247 236 338 341 416 425M200 325 338 341" stroke="#e4bb75" strokeWidth="4"/>{[[117,390],[200,325],[245,236],[329,183],[428,148],[130,158],[338,341],[416,425]].map(([x,y],i)=><g key={i}><circle cx={x} cy={y} r="8" fill="#e7ede0"/><circle cx={x} cy={y} r="3" fill="#284b40"/></g>)}</svg><span className="art-label">PRAHA <span>50°05′ N · 14°25′ E</span></span><span className="art-caption">ILUSTRACE MĚSTA · NEJDE O MAPOVÝ PODKLAD</span></div>
      </section>
      <section className="play-section" aria-labelledby="play-title"><div><p className="eyebrow">PŘÍŠTÍ ZASTÁVKA: HRA</p><h2 id="play-title">Vyrazíme společně.</h2><p><a href="?role=hunter">Mobilní pohled hledačů</a> · <a href="?role=hider">Mobilní pohled schovaného</a> · <a href="./simulator/">Lokální herní simulátor</a></p><p id="multiplayer-note">Herní místnosti a multiplayer připravujeme. V této verzi ještě nelze vytvořit partii ani se připojit.</p></div><div className="play-options"><article><span className="option-number">01</span><h3>Vlastní partie</h3><p>Sestavit skupinu a vydat se do ulic.</p><button disabled aria-describedby="multiplayer-note">Vytvořit hru <span>Připravujeme</span></button></article><article><span className="option-number">02</span><h3>Připojit se k přátelům</h3><p>Společný herní plán pro celou skupinu.</p><button disabled aria-describedby="multiplayer-note">Připojit se <span>Připravujeme</span></button></article></div></section>
      <section className="data-section" id="podklady" aria-labelledby="data-title"><div className="data-heading"><div><p className="eyebrow">JEDNA VERZE PRO CELOU PARTII</p><h2 id="data-title">Podklady, na které navážeme.</h2></div><span className={`data-badge ${issues.length ? 'reference' : ''}`}>{release ? issues.length ? 'Referenční podklady' : 'Schválená publikace' : error ? 'Nedostupné' : 'Ověřuji integritu…'}</span></div>
        <p>Veřejná aplikace načítá centrálně publikovanou verzi. Žádný vlastní svět ani import geografických souborů nejsou potřeba.</p>
        {error && <p role="alert" className="data-warning">{error} Herní data nebyla nahrazena odhadem.</p>}
        {release && <><dl className="data-counts"><div><dt>Schválené parky</dt><dd>{release.data.pois.filter(p=>p.category==='park').length}</dd></div><div><dt>Letiště</dt><dd>{release.data.pois.filter(p=>p.category==='airport').length}</dd></div><div><dt>Zoo a místa se zvířaty</dt><dd>{release.data.pois.filter(p=>p.category==='zoo').length}</dd></div><div><dt>Nemocnice</dt><dd>{release.data.pois.filter(p=>p.category==='hospital').length}</dd></div><div><dt>Knihovny</dt><dd>{release.data.pois.filter(p=>p.category==='library').length}</dd></div><div><dt>Kina</dt><dd>{release.data.pois.filter(p=>p.category==='cinema').length}</dd></div><div><dt>Vodní plochy</dt><dd>{release.data.pois.filter(p=>p.category==='waterbody').length}</dd></div><div><dt>Zastávky v herní oblasti</dt><dd>{release.data.pidSnapshot.stops.length}</dd></div><div><dt>Administrativní území</dt><dd>{release.data.administrativeAreas.length}</dd></div></dl>
          {issues.length > 0 && <div role="status" className="data-warning"><strong>{release.data.pidSnapshot.serviceDate !== today ? 'Historická referenční data – neověřeno' : 'Podklady zatím nejsou připravené pro ostrou hru.'}</strong><ul>{issues.map(issue=><li key={issue}>{issue}</li>)}</ul></div>}
          <p className="pin-note">Zoo tvoří ruční výběr správce s body převzatými z Mapy.com; nejde o oficiální dataset ani hranice areálů. Nemocnice jsou rovněž ručním herním výběrem z Mapy.com, nikoli úplným registrem zdravotnických zařízení. Kina jsou ručním výběrem správce; multiplex se počítá jako jedno kino.</p>{!release.data.pois.some(p=>p.category==='library') && <p className="pin-note">Katalog zatím neobsahuje ověřené knihovny. Geografické otázky pro knihovny vracejí „nelze určit“.</p>}<div className="release-info"><span>Publikováno {new Date(release.publishedAt).toLocaleString('cs-CZ')}</span><span>PID: {release.data.pidSnapshot.serviceDate}</span><span>Verze <code title={release.releaseId}>{release.releaseId.slice(8,20)}</code></span><span>Kontrolní součty ověřeny</span></div><p className="pin-note">Načtená verze zůstává po dobu otevření stránky uzamčená. Budoucí partie si uchová toto ID podkladů.</p></>}
      </section>
    </main><footer><span>JetLagPrague <span>·</span> Praha je herní plán.</span><a href="./editor/">Geografický editor <Arrow/></a></footer>
  </div>;
}
const role=new URLSearchParams(location.search).get('role');
createRoot(document.getElementById('root')!).render(<StrictMode>{role==='hunter'||role==='hider'?<MobilePreview role={role}/>:<App/>}</StrictMode>);
