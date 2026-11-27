import {
  awaitingStart, completeMatchingReference, createServerLobbyGame, roleForTeam, transition, viewForRole,
  type GameEnvironment, type GameState,
} from '../../../packages/game-core/src/index';
import type { TeamId } from '../../../packages/game-core/src/match-types';
import type { RoomCredentials, RoomSnapshot } from '../../../packages/game-core/src/room-protocol';
import { sha256 } from '../../../packages/geo-core/src/pid-snapshot';
import { liveRules, RoomCatalog, validateFounderMeasurement, validateFounderLocation } from './catalog';
import { advanceDeadlines, clockRunning, nextDeadline } from './clock';
import { bearerHash, bytes, errorResponse, json, randomSecret, readJson, requireRequest, RequestError, secretPattern } from './http';
import { founderSchema, mediaReferences, parse, parseCommand, recoverySchema } from './input';
import { openPair, type DurableState, type MultiplayerEnvironment } from './platform';
import { allowed, clearRoom, getPayload, getRoom, putPayload, putRoom, setupStore, type Room, type Seat } from './store';

const HOUR = 3_600_000;
const WAITING_RETENTION = 2 * HOUR;
const GAME_RETENTION = 24 * HOUR;
const COMPLETED_RETENTION = 2 * HOUR;
const MAX_MEDIA = 8 * 1024 * 1024;
const MEDIA_TYPES = new Set(['image/jpeg','video/mp4','video/webm']);
const TEAMS = ['team-a','team-b'] as const;
interface SocketIdentity { roomId: string; team: TeamId; connection: string }
type Issue = { credentials: RoomCredentials; seat: Seat };

async function issue(room: Pick<Room,'id'|'code'>): Promise<Issue> {
  const token = randomSecret(), recovery = randomSecret();
  const [tokenHash, recoveryHash] = await Promise.all([sha256(token), sha256(recovery)]);
  return { credentials: { code: room.code, roomId: room.id, token, recoveryCode: `${room.code}.${room.id}.${recovery}` }, seat: { tokenHash, recoveryHash } };
}

function status(room: Room): RoomSnapshot['status'] {
  if (!room.seats['team-b']) return 'waiting';
  return room.game.phase === 'finished' && room.game.match?.round === 2 ? 'finished' : 'playing';
}

function applyManualStreetPreparation(game: GameState) {
  const prep = game.matchingPreparation;
  if (game.rules.questions.find(q => q.id === prep?.definitionId)?.category !== 'street' || !prep) return game;
  for (const role of ['hunter','hider'] as const) {
    if (!prep.references[role] && !prep.issues[role]) {
      game = completeMatchingReference(game, prep.id, role, { issue: 'Zadejte ručně ověřený název ulice.' });
    }
  }
  return game;
}

export class GameRoom {
  private readonly sql;
  private readonly catalog;
  private queue: Promise<unknown> = Promise.resolve();
  private queued = 0;

  constructor(private state: DurableState, private env: MultiplayerEnvironment) {
    this.sql = state.storage.sql;
    this.catalog = new RoomCatalog(env);
    setupStore(this.sql);
  }

  private serial<T>(action: () => Promise<T>): Promise<T> {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }

  async fetch(request: Request): Promise<Response> {
    try {
      const [, action, code, roomId, resource] = new URL(request.url).pathname.split('/');
      const input = ['init','recover','command'].includes(action) ? await readJson(request) : undefined;
      requireRequest(this.queued < 64, 429, 'Místnost právě zpracovává příliš mnoho požadavků.');
      this.queued++;
      try {
        return await this.serial(() => this.operate(action, code, roomId, resource, request, input));
      } finally { this.queued--; }
    } catch (error) { return errorResponse(error); }
  }

  private async operate(action: string, code: string, roomId: string, resource: string, request: Request, input: unknown) {
    const now = Date.now();
    let room = getRoom(this.sql);
    if (room && room.expiresAt <= now) { await this.remove(room); room = undefined; }
    if (action === 'init') {
      if (room) return json({ collision: true }, 409);
      const { fix, size } = parse(founderSchema, input, 'Je nutná platná GPS a velikost hry.');
      validateFounderMeasurement(fix, now);
      const { release } = await this.catalog.current();
      validateFounderLocation(release, fix);
      const { rules, reference } = liveRules(size, release, this.env);
      const id = crypto.randomUUID();
      const auth = await issue({ id, code });
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] || 1;
      const game = createServerLobbyGame({ id, releaseId: release.releaseId, now, seed, rules });
      room = { id, code, reference, expiresAt: now + WAITING_RETENTION, revision: 1, seats: { 'team-a': auth.seat }, game };
      // Code namespaces are single-writer SQLite objects, including after an eviction.
      await this.save(room);
      return json(auth.credentials, 201);
    }
    requireRequest(room && room.code === code, 404, 'Místnost neexistuje nebo její platnost skončila.');
    if (action === 'join') {
      requireRequest(status(room) === 'waiting', 409, 'Obě týmová místa jsou obsazená.');
      const auth = await issue(room);
      room.seats['team-b'] = auth.seat;
      room.expiresAt = now + GAME_RETENTION;
      await this.commit(room);
      return json(auth.credentials, 201);
    }
    if (action === 'recover') {
      const proof = parse(recoverySchema, input, 'Neplatný formát obnovovacího kódu.');
      const hash = await sha256(proof.secret);
      const team = TEAMS.find(team => room!.seats[team]?.recoveryHash === hash);
      requireRequest(proof.roomId === room.id && team, 401, 'Obnovovací kód je neplatný nebo byl již použit.');
      const auth = await issue(room);
      room.seats[team] = auth.seat;
      await this.commit(room);
      for (const socket of this.state.getWebSockets()) {
        if ((socket.deserializeAttachment() as SocketIdentity | undefined)?.team === team) socket.close(4001, 'Relace byla předána.');
      }
      return json(auth.credentials);
    }
    requireRequest(room.id === roomId, 404, 'Místnost neexistuje nebo její platnost skončila.');
    if (action === 'socket') return this.connect(room, request);

    const hash = await bearerHash(request);
    const team = TEAMS.find(id => room!.seats[id]?.tokenHash === hash);
    requireRequest(team, 401, 'Tato týmová relace už není platná.');
    if (action === 'ticket') return this.ticket(room, team, now);
    if (action === 'cancel') {
      requireRequest(team === 'team-a' && status(room) === 'waiting', 409, 'Zrušit lze pouze vlastní čekající místnost.');
      this.assertController(room, team, request);
      await this.remove(room);
      return json({ cancelled: true });
    }
    if (action === 'media') return this.media(room, team, resource, request);
    const { resolver } = await this.catalog.forRelease(room.game.releaseId);
    await this.advance(room, resolver);
    if (action === 'command') {
      this.assertController(room, team, request);
      await this.command(room, resolver, team, input);
    }
    return json(this.snapshot(room, team, resolver));
  }

  private async save(room: Room) {
    this.state.storage.transactionSync(() => putRoom(this.sql, room));
    await this.schedule(room);
  }

  private schedule(room: Room) {
    return this.state.storage.setAlarm(Math.min(room.expiresAt, nextDeadline(room.game)));
  }

  private async commit(room: Room, resolver?: GameEnvironment) {
    room.revision++;
    await this.save(room);
    const sockets = this.state.getWebSockets();
    if (!sockets.length) return;
    try {
      const environment = resolver ?? (await this.catalog.forRelease(room.game.releaseId)).resolver;
      this.broadcast(room, environment);
    } catch {
      // A catalogue outage must not swallow newly issued room credentials.
      for (const socket of sockets) if (socket.readyState === 1) socket.close(1012, 'Obnovte spojení.');
    }
  }

  private async remove(room: Room) {
    this.state.storage.transactionSync(() => clearRoom(this.sql));
    await this.state.storage.deleteAlarm();
    for (const socket of this.state.getWebSockets()) {
      if ((socket.deserializeAttachment() as SocketIdentity | undefined)?.roomId === room.id)
        socket.close(4004, 'Místnost byla uzavřena.');
    }
  }

  private async advance(room: Room, resolver: GameEnvironment) {
    const game = advanceDeadlines(room.game, Date.now(), resolver);
    if (game !== room.game) { room.game = game; await this.commit(room, resolver); }
  }

  private snapshot(room: Room, team: TeamId, resolver: GameEnvironment): RoomSnapshot {
    const serverNow = Date.now(), game = room.game;
    const visible = { ...game, now: Math.max(game.now, serverNow) };
    const view = viewForRole(visible, roleForTeam(game, team), resolver);
    let previousRound: RoomSnapshot['previousRound'];
    if (room.previousRound) {
      const { events, questions, role } = viewForRole(room.previousRound, roleForTeam(room.previousRound, team), resolver);
      previousRound = { events, questions, role };
    }
    const connectedTeams = TEAMS.filter(member => this.state.getWebSockets().some(socket =>
      socket.readyState === 1 && this.currentSocket(room, socket.deserializeAttachment() as SocketIdentity, member)));
    return { roomId: room.id, code: room.code, status: status(room), team, connectedTeams, revision: room.revision, serverNow,
      reference: room.reference, view, previousRound, clockRunning: clockRunning(game) && game.cardState?.move?.stage !== 'moving' };
  }

  private currentSocket(room: Room, socket: SocketIdentity | undefined, team: TeamId) {
    return !!socket && socket.roomId === room.id && socket.team === team && room.seats[team]?.connection === socket.connection;
  }

  private broadcast(room: Room, resolver: GameEnvironment) {
    for (const socket of this.state.getWebSockets()) {
      const identity = socket.deserializeAttachment() as SocketIdentity | undefined;
      if (socket.readyState === 1 && identity && this.currentSocket(room, identity, identity.team)) {
        try { socket.send(JSON.stringify(this.snapshot(room, identity.team, resolver))); }
        catch { socket.close(1011, 'Obnovte spojení.'); }
      }
    }
  }

  private async ticket(room: Room, team: TeamId, now: number) {
    requireRequest(allowed(this.sql, `ticket:${team}`, now, 20, 60000), 429, 'Příliš mnoho pokusů o spojení.');
    const ticket = randomSecret(), hash = await sha256(ticket);
    this.sql.exec('DELETE FROM ticket WHERE expires <= ? OR team = ?', now, team);
    this.sql.exec('INSERT INTO ticket VALUES (?, ?, ?, ?)', hash, team, room.seats[team]!.tokenHash, now + 30_000);
    return json({ ticket });
  }

  private async connect(room: Room, request: Request) {
    const [protocol, ticket] = (request.headers.get('Sec-WebSocket-Protocol') ?? '').split(',').map(item => item.trim());
    requireRequest(request.headers.get('Upgrade')?.toLowerCase() === 'websocket' && protocol === 'jetlag-v1' && secretPattern.test(ticket ?? ''),
      401, 'Je nutný platný lístek WebSocket.');
    const hash = await sha256(ticket);
    const [entry] = this.sql.exec<{ team: TeamId; generation: string; expires: number }>(
      'SELECT team, generation, expires FROM ticket WHERE hash = ?', hash);
    const seat = entry && room.seats[entry.team];
    requireRequest(seat && entry.generation === seat.tokenHash && entry.expires > Date.now(), 401, 'Lístek WebSocket už neplatí.');
    const { resolver } = await this.catalog.forRelease(room.game.releaseId);
    await this.advance(room, resolver);
    const connection = crypto.randomUUID(), pair = openPair();
    this.state.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ roomId: room.id, team: entry.team, connection } satisfies SocketIdentity);
    seat.connection = connection;
    seat.lastSeenAt = Date.now();
    room.revision++;
    this.state.storage.transactionSync(() => {
      this.sql.exec('DELETE FROM ticket WHERE hash = ?', hash);
      putRoom(this.sql, room);
    });
    for (const socket of this.state.getWebSockets()) {
      const identity = socket.deserializeAttachment() as SocketIdentity | undefined;
      if (identity?.team === entry.team && identity.connection !== connection) socket.close(4002, 'Tým otevřel jiné spojení.');
    }
    pair[1].send(JSON.stringify({ connection }));
    this.broadcast(room, resolver);
    return new Response(null, { status: 101, webSocket: pair[0], headers: { 'Sec-WebSocket-Protocol': 'jetlag-v1' } } as ResponseInit & { webSocket: WebSocket });
  }

  private assertController(room: Room, team: TeamId, request: Request) {
    const connection = request.headers.get('X-Room-Connection');
    requireRequest(connection && room.seats[team]?.connection === connection &&
      this.state.getWebSockets().some(socket => socket.readyState === 1 && this.currentSocket(room, socket.deserializeAttachment() as SocketIdentity, team)),
    409, 'Nejprve obnovte aktivní spojení týmu.');
  }

  private async command(room: Room, resolver: GameEnvironment, team: TeamId, input: unknown) {
    requireRequest(status(room) !== 'waiting', 409, 'Čeká se na druhý tým.');
    const { id, gameId, action } = parseCommand(input);
    const fingerprint = await sha256(JSON.stringify(action));
    const [processed] = this.sql.exec<{ team: TeamId; game: string; fingerprint: string }>(
      'SELECT team, game, fingerprint FROM command WHERE id = ?', id);
    if (processed) {
      requireRequest(processed.team === team && processed.game === gameId && processed.fingerprint === fingerprint, 409, 'Příkaz již patří jiné akci.');
      return;
    }
    requireRequest(gameId === room.game.id, 409, 'Tento příkaz patří jinému kolu nebo místnosti.');
    const now = Math.max(Date.now(), room.game.now);
    requireRequest(allowed(this.sql, `command:${team}`, now, 80, 10_000), 429, 'Příliš mnoho akcí týmu.');
    for (const reference of mediaReferences(action)) {
      const [file] = this.sql.exec<{ owner: TeamId; mime: string }>('SELECT owner, mime FROM media WHERE id = ?', reference.id);
      requireRequest(file?.owner === team && file.mime.startsWith(reference.kind === 'photo' ? 'image/' : 'video/'), 400, 'Příloha není součástí této relace.');
    }
    if (action.type === 'location') {
      requireRequest(!action.fix || action.fix.at <= now + 5000, 422, 'GPS má neplatný čas.');
      if (action.fix && action.fix.at > now) action.fix.at = now;
    }
    let game: GameState;
    try {
      game = transition(room.game, { id, at: now, actor: roleForTeam(room.game, team), command: action }, resolver);
      if (action.type === 'prepare_matching') game = applyManualStreetPreparation(game);
    } catch (error) {
      const message = error instanceof Error && error.constructor === Error ? error.message : 'Údaje neodpovídají pravidlům hry.';
      throw new RequestError(422, message);
    }
    game.processedCommands = []; // The SQLite command log owns replay protection across rounds.
    if (room.game.id !== game.id) room.previousRound = room.game;
    room.game = game;
    room.revision++;
    room.seats[team]!.lastSeenAt = now;
    if (!awaitingStart(game) && status(room) !== 'finished') room.expiresAt = now + GAME_RETENTION;
    if (status(room) === 'finished' && action.type === 'finalize_round') room.expiresAt = now + COMPLETED_RETENTION;
    this.state.storage.transactionSync(() => {
      this.sql.exec('INSERT INTO command VALUES (?, ?, ?, ?)', id, team, gameId, fingerprint);
      putRoom(this.sql, room);
    });
    await this.schedule(room);
    this.broadcast(room, resolver);
  }

  private async media(room: Room, team: TeamId, id: string, request: Request) {
    if (request.method === 'POST') {
      this.assertController(room, team, request);
      requireRequest(status(room) === 'playing', 409, 'Přílohy lze přidat během partie.');
      const mime = request.headers.get('Content-Type') ?? '';
      requireRequest(MEDIA_TYPES.has(mime), 415, 'Povolena je fotografie JPEG nebo video MP4/WebM.');
      const body = await bytes(request, mime === 'image/jpeg' ? 2 * 1024 * 1024 : MAX_MEDIA);
      const jpeg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff;
      const mp4 = String.fromCharCode(...body.subarray(4, 8)) === 'ftyp';
      const webm = body[0] === 0x1a && body[1] === 0x45 && body[2] === 0xdf && body[3] === 0xa3;
      requireRequest(mime === 'image/jpeg' ? jpeg : mime === 'video/mp4' ? mp4 : webm, 415, 'Typ přílohy neodpovídá jejímu obsahu.');
      const [used] = this.sql.exec<{ size: number }>('SELECT COALESCE(SUM(size),0) AS size FROM media');
      requireRequest(used.size + body.byteLength <= 32 * 1024 * 1024, 413, 'Místnost dosáhla limitu příloh.');
      const id = crypto.randomUUID();
      this.state.storage.transactionSync(() => {
        this.sql.exec('INSERT INTO media VALUES (?, ?, ?, ?)', id, team, mime, body.byteLength);
        putPayload(this.sql, `media:${id}`, body);
      });
      return json({ id }, 201);
    }
    const [file] = this.sql.exec<{ owner: TeamId; mime: string }>('SELECT owner, mime FROM media WHERE id = ?', id);
    requireRequest(file, 404, 'Příloha nebyla nalezena.');
    if (file.owner !== team) {
      const { resolver } = await this.catalog.forRelease(room.game.releaseId);
      const canSee = [room.game, ...(room.previousRound ? [room.previousRound] : [])].some(game => {
        const view = viewForRole(game, roleForTeam(game, team), resolver);
        return view.questions.some(question => question.photoId === id) || view.curses.some(curse => curse.evidence?.some(item => item.id === id));
      });
      requireRequest(canSee, 404, 'Příloha nebyla nalezena.');
    }
    return new Response(getPayload(this.sql, `media:${id}`), {
      headers: { 'Content-Type': file.mime, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
    });
  }

  async alarm() {
    await this.serial(async () => {
      const room = getRoom(this.sql);
      if (!room) return;
      if (room.expiresAt <= Date.now()) { await this.remove(room); return; }
      const { resolver } = await this.catalog.forRelease(room.game.releaseId);
      await this.advance(room, resolver);
      await this.schedule(room);
    });
  }

  webSocketMessage(socket: WebSocket) {
    socket.close(1008, 'Příkazy se odesílají jako ověřené požadavky.');
  }

  async webSocketClose(socket: Parameters<DurableState['acceptWebSocket']>[0] & { deserializeAttachment(): unknown }, code: number) {
    if (socket.readyState === 2) socket.close(code === 1006 ? 1011 : code);
    await this.serial(async () => {
      const identity = socket.deserializeAttachment() as SocketIdentity | undefined;
      const room = getRoom(this.sql);
      if (!room || !identity || !this.currentSocket(room, identity, identity.team)) return;
      const seat = room.seats[identity.team]!;
      delete seat.connection;
      seat.lastSeenAt = Date.now();
      await this.commit(room);
    });
  }

  webSocketError(socket: Parameters<GameRoom['webSocketClose']>[0]) { return this.webSocketClose(socket, 1011); }
}
