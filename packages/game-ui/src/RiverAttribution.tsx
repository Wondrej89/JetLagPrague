import type { GameDataRelease } from '../../geo-core/src/game-release';

export function RiverAttribution({river,land}:{river:NonNullable<GameDataRelease['data']['riverArea']>;land:boolean}) {
  const {source} = river.feature.properties;
  return <p>
    Říční data od <a href={source.url} target="_blank" rel="noreferrer">{source.provider}</a> ·{' '}
    <a href={source.license.url} target="_blank" rel="noreferrer">{source.license.name}</a>.
    {' '}JetLagPrague vybral a sjednotil toky, převedl je do WGS84{land ? ' a odvodil pevninu' : ''}.
  </p>;
}
