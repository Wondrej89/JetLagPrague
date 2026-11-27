import { booleanPointInPolygon, pointToPolygonDistance } from '@turf/turf';
import { deckRules, type Fix } from '../../../packages/game-core/src/index';
import { PUBLIC_GAME_SIZE } from '../../../packages/game-core/src/room-protocol';
import { gamePublicationErrors, loadGameDataRelease, type GameDataRelease } from '../../../packages/geo-core/src/game-release';
import { createGeoResolver } from '../../../packages/geo-resolver/src/index';
import { requireRequest, RequestError } from './http';
import type { MultiplayerEnvironment } from './platform';

export function testConfiguration(env: MultiplayerEnvironment) {
  return env.ALLOW_REFERENCE_RELEASE === 'true' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(env.ALLOWED_ORIGIN);
}

export function configured(env: MultiplayerEnvironment) {
  try {
    const base = new URL(env.RELEASE_BASE_URL);
    return new URL(env.ALLOWED_ORIGIN).origin === env.ALLOWED_ORIGIN &&
      (base.protocol === 'https:' || testConfiguration(env)) && base.pathname.endsWith('/');
  } catch { return false; }
}

export class RoomCatalog {
  private pinned?: ReturnType<typeof this.load>;
  private pinnedId?: string;

  constructor(private env: MultiplayerEnvironment) {}

  async current() {
    const loaded = await this.load();
    this.pinnedId = loaded.release.releaseId;
    this.pinned = Promise.resolve(loaded);
    return loaded;
  }

  forRelease(id: string) {
    if (this.pinnedId !== id || !this.pinned) {
      this.pinnedId = id;
      this.pinned = this.load(id).catch(error => {
        if (this.pinnedId === id) this.pinned = undefined;
        throw error;
      });
    }
    return this.pinned;
  }

  private async load(id?: string) {
    try {
      requireRequest(configured(this.env), 503, 'Herní server čeká na konfiguraci katalogu.');
      const { release } = await loadGameDataRelease(this.env.RELEASE_BASE_URL, async (url, init) => {
        const request = new Request(url, { ...init, redirect: 'manual', credentials: 'omit' });
        return this.env.RELEASES ? this.env.RELEASES.fetch(request) : fetch(request);
      }, id);
      return { release, resolver: createGeoResolver(release) };
    } catch {
      throw new RequestError(503, 'Publikované herní podklady se nepodařilo ověřit.');
    }
  }
}

export function validateFounderMeasurement(fix: Fix, now: number) {
  requireRequest(fix.at <= now + 5000 && fix.at >= now - 30_000, 422, 'GPS je zastaralá nebo má neplatný čas. Změřte polohu znovu.');
  requireRequest(fix.accuracy <= 100, 422, 'GPS je nepřesná. Potřebujeme přesnost nejvýše 100 m.');
}

export function validateFounderLocation(release: GameDataRelease, fix: Fix) {
  const area = release.data.gameArea.geometry;
  requireRequest(booleanPointInPolygon(fix.point, area, { ignoreBoundary: true }), 422, 'Pro vytvoření místnosti musíte být uvnitř herního území Prahy.');
  const distance = pointToPolygonDistance(fix.point, area, { units: 'meters', method: 'geodesic' });
  requireRequest(Number.isFinite(distance) && distance < -Math.max(2, fix.accuracy), 422,
    'Poloha je příliš blízko hranice herního území. Změřte ji opět s větší přesností nebo uvnitř Prahy.');
}

export function liveRules(release: GameDataRelease, env: MultiplayerEnvironment) {
  const reference = gamePublicationErrors(release).length > 0;
  requireRequest(!reference || testConfiguration(env), 409, 'Nové místnosti vyžadují schválené herní podklady s aktuálními daty PID.');
  const rules = deckRules(PUBLIC_GAME_SIZE);
  rules.testOnly = false;
  rules.label = 'Dvě kola · 100 karet · Medium';
  rules.id = `${rules.id}:live-v1`;
  rules.questions = rules.questions.filter(question => !question.testOnly);
  // Available only with a loopback origin and the explicit test setting.
  if (testConfiguration(env) && env.TEST_HIDE_MS) {
    const duration = Number(env.TEST_HIDE_MS);
    if (Number.isSafeInteger(duration) && duration >= 1000 && duration < rules.hideMs) rules.hideMs = duration;
  }
  return { rules, reference };
}
