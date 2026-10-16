import type { HidingCoverage } from '@jetlag/geo-core';

export function TerritoryControls({ hasArea, hasMunicipal, busy, disabled, onPrague, onFit, territoryOnly, onFilter, filterError, membershipStatus, showCoverage, onCoverage, radius, coverage, coverageStatus }: {
  hasArea: boolean; hasMunicipal: boolean; busy: boolean; disabled: boolean; onPrague(): void;
  onFit(): void;
  territoryOnly: boolean; onFilter(value: boolean): void; membershipStatus: string;
  filterError: boolean;
  showCoverage: boolean; onCoverage(value: boolean): void; radius: number; coverage: HidingCoverage | null; coverageStatus: string;
}) {
  return <section className="pid-controls territory-controls" aria-label="Herní území a pokrytí"><fieldset disabled={disabled || busy}>
    <h3>Herní území a pokrytí</h3>
    <button className="wide" disabled={!hasMunicipal} onClick={onPrague}>{busy ? 'Sjednocuji 57 městských částí…' : 'Použít celé území Prahy'}</button>
    <p>Předvolba sjednotí skutečné hranice všech 57 městských částí. Vlastní objekty zůstanou zachované; změnu hranice lze vrátit tlačítkem Zpět.</p>
    <button className="wide" disabled={!hasArea} onClick={onFit}>Zobrazit celé herní území</button>
    <label className="pid-check"><input type="checkbox" checked={territoryOnly} onChange={event => onFilter(event.target.checked)} />Pouze PID v herní oblasti</label>
    <small>Zastávky podle referenčního bodu, linky při jakémkoliv dotyku nebo průniku s oblastí. Započítává se i hranice; linky se neořezávají.</small>
    {territoryOnly && <p role="status" data-testid="territory-status">{membershipStatus}</p>}
    {territoryOnly && filterError && <button onClick={() => onFilter(false)}>Vypnout filtr a zobrazit dostupná PID data</button>}
    <label className="pid-check"><input type="checkbox" disabled={!hasArea} checked={showCoverage} onChange={event => onCoverage(event.target.checked)} />Zobrazit všechny úkrytové zóny</label>
    <small>Sjednocení kruhů {radius} m kolem všech nevyloučených zastávek s bodem uvnitř herní oblasti, oříznuté její hranicí. Hledání a přepínače dopravy tuto plochu neomezují.</small>
    {!hasArea && <p>Nejprve použijte předvolbu Prahy nebo nakreslete herní oblast.</p>}
    {showCoverage && <div role="status" data-testid="coverage-status"><p>{coverageStatus}</p>{coverage && <>
      <p>{coverage.usedStops.toLocaleString('cs')} zastávek · {(coverage.areaSquareMeters / 1e6).toLocaleString('cs', { maximumFractionDigits: 2 })} km²</p>
      <small>Povoleno: {coverage.allowedStops} · k revizi: {coverage.reviewStops} · vyloučeno uvnitř: {coverage.excludedStops} · mimo oblast: {coverage.outsideStops} · neurčený bod: {coverage.unknownStops}</small>
      {coverage.reviewStops > 0 && <p className="pid-warning">Geometrický náhled obsahuje zastávky vyžadující revizi. Neprokazuje aktuální povolenost úkrytu.</p>}
    </>}</div>}
  </fieldset></section>;
}
