import { inspectPosition, inspectHidingPosition, isArea, type AreaResult, type WorldDraft, type GameStop } from '@jetlag/geo-core';
import type { Position } from 'geojson';

function Result({ result, game = false }: { result: AreaResult; game?: boolean }) {
  if (result.status === 'unknown') return <><strong>Nelze určit</strong><small>{result.reason}</small></>;
  if (result.status === 'ambiguous') return <><strong>Nelze jednoznačně určit</strong><small>{result.reason}</small><ul>{result.matches.map(m => <li key={m.id}>{m.name} ({m.code})</li>)}</ul></>;
  if (game) return <><strong>{result.status === 'outside' ? 'Ne · mimo herní oblast' : 'Ano · v herní oblasti'}</strong>{result.status === 'boundary' && <small>Bod na hranici se započítává dovnitř.</small>}</>;
  if (result.status === 'outside') return <strong>Mimo pokrytí vrstvy</strong>;
  return <><strong>{result.matches[0].name}</strong><small>Kód {result.matches[0].code}{result.status === 'boundary' ? ' · vnější hranice území' : ''}</small></>;
}
export function PositionInspector({ point, world, stop, radius = 400 }: { point: Position | null; world: WorldDraft; stop?: GameStop | null; radius?: number }) {
  const result = point ? inspectPosition(point, world) : null;
  const area = world.layers.find(layer => layer.kind === 'game_area')?.features[0]?.geometry;
  const hiding = point && stop ? inspectHidingPosition(point, stop, area && isArea(area) ? area : null, radius) : null;
  return <section className="position-inspector" aria-label="Výsledek ověření polohy" aria-live="polite"><span className="eyebrow">GEOGRAFICKÁ DIAGNOSTIKA</span><h2>Ověřit polohu</h2>
    {!point || !result ? <p>Klikněte na mapu. Testovací špendlík lze přetahovat; nepřidává se mezi vlastní objekty ani do exportu.</p> : <>
      <div className="position-coordinates"><span>GPS (šířka, délka)</span><code>{point[1].toFixed(7)}, {point[0].toFixed(7)}</code><small>GeoJSON: [{point[0].toFixed(7)}, {point[1].toFixed(7)}]</small></div>
      <div className="position-result" data-testid="position-game"><h3>Herní oblast</h3><Result result={result.gameArea} game /></div>
      <div className="position-result" data-testid="position-municipal"><h3>Městská část</h3><Result result={result.municipal} /></div>
      <div className="position-result" data-testid="position-cadastral"><h3>Katastrální území</h3><Result result={result.cadastral} /></div>
      <div className="position-result" data-testid="position-hiding"><h3>Úkrytová zóna {radius} m · {stop?.name ?? 'není vybraná zastávka'}</h3>{!hiding ? <p>Vyberte zastávku PID v mapě nebo v seznamu.</p> : <><strong>{hiding.status === 'allowed' ? 'Povolené místo' : hiding.status === 'forbidden' ? 'Nepovolené místo' : 'Nelze určit'}</strong><small>Vzdálenost: {hiding.distanceMeters === null ? 'nelze určit' : `${hiding.distanceMeters.toLocaleString('cs', { maximumFractionDigits: 2 })} m`}</small><small>Do {radius} m: {hiding.withinRadius === null ? 'nelze určit' : hiding.withinRadius ? 'ano' : 'ne'}</small><small>V herní oblasti: {hiding.insideGameArea === null ? 'nelze určit' : hiding.insideGameArea ? 'ano' : 'ne'}</small><small>{hiding.reason}</small></>}</div>
      <p>Vyhodnocení používá celé geometrie i u skrytých vrstev. Společná hranice nebo překryv více území vrací nejednoznačný výsledek. Pozice kurzoru není GPS měření zařízení.</p>
    </>}
  </section>;
}
