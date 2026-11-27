import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { localWorker, TEST_ORIGIN } from '../../../scripts/multiplayer-test-server';
import type { RoomCredentials, RoomSession, RoomSnapshot } from '../../../packages/game-core/src/room-protocol';
import type { Namespace } from './platform';
import type { Command, Fix } from '../../../packages/game-core/src/types';

const point = [14.414069175,50.08076645] as Fix['point'];
const fix = (options: Partial<Fix> = {}): Fix => ({ point, at: Date.now(), accuracy: 5, ...options });
let mf: ReturnType<typeof localWorker>;
let persist: string;
const path = (session: RoomSession) => `/rooms/${session.code}/${session.roomId}`;

function http(url: string, options: { body?: unknown; post?: boolean; session?: RoomSession; connection?: string; origin?: string } = {}) {
  const headers: Record<string,string> = { Origin: options.origin ?? TEST_ORIGIN, Connection: 'close' };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.session) headers.Authorization = `Bearer ${options.session.token}`;
  if (options.connection) headers['X-Room-Connection'] = options.connection;
  return mf.dispatchFetch(`http://localhost${url}`, {
    method: options.post || options.body !== undefined ? 'POST' : 'GET',
    headers, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
  });
}
async function accepted<T>(response: Awaited<ReturnType<typeof http>>) {
  const body = await response.json();
  expect(response.ok, JSON.stringify(body)).toBe(true);
  return body as T;
}
const create = async () => accepted<RoomCredentials>(await http('/rooms', { body: { fix: fix(), size: 'medium' } }));
const snapshot = async (session: RoomSession) => accepted<RoomSnapshot>(await http(path(session), { session }));

async function connect(session: RoomSession) {
  const { ticket } = await accepted<{ticket:string}>(await http(path(session)+'/ticket', { post:true, session }));
  const response = await mf.dispatchFetch(`http://localhost${path(session)}/socket`, { headers: {
    Origin: TEST_ORIGIN, Upgrade: 'websocket', 'Sec-WebSocket-Protocol': `jetlag-v1, ${ticket}`,
  } });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  const connection = new Promise<string>(resolve => {
    socket.addEventListener('message', event => {
      const data = JSON.parse(String(event.data)) as { connection?: string };
      if (data.connection) resolve(data.connection);
    });
  });
  socket.accept();
  return { socket, connection: await connection, ticket };
}
function send(session: RoomSession, connection: string, gameId: string, command: Command, id = crypto.randomUUID()) {
  return http(path(session)+'/command', { body:{id,gameId,command},session,connection });
}

beforeAll(async () => {
  persist = await mkdtemp(join(tmpdir(), 'jetlag-live-test-'));
  mf = localWorker({ persist, hideMs: 1600 });
  await mf.ready;
});
afterAll(async () => {
  await mf?.dispose();
  if (persist) await rm(persist,{recursive:true,force:true});
});

describe.sequential('authoritative rooms on SQLite Durable Objects', () => {
  it('keeps reference data blocked when the test authorization is absent', async () => {
    const restricted=localWorker({reference:false});
    try {
      const response=await restricted.dispatchFetch('http://localhost/rooms',{
        method:'POST',headers:{Origin:TEST_ORIGIN,'Content-Type':'application/json'},
        body:JSON.stringify({fix:fix(),size:'medium'}),
      });
      expect(response.status).toBe(409);
      expect(await response.json()).toMatchObject({error:expect.stringContaining('schválené herní podklady')});
    } finally { await restricted.dispose(); }
  });

  it('checks founder GPS, rejects missing and inaccurate GPS, and enforces the site origin', async () => {
    expect((await http('/rooms',{ body: { size:'medium' } })).status).toBe(400);
    expect((await http('/rooms',{ body: { size:'medium',fix:fix({ at:Date.now()-31_000 }) } })).status).toBe(422);
    expect((await http('/rooms',{ body: { size:'medium',fix:fix({ accuracy:101 }) } })).status).toBe(422);
    expect((await http('/rooms',{ body: { size:'medium',fix:fix({ point:[16,49] }) } })).status).toBe(422);
    expect((await http('/rooms',{ origin:'https://other.example',body: { size:'medium',fix:fix() } })).status).toBe(403);
  });

  it('atomically claims the same code and reuses it only once the prior room is gone',async()=>{
    const ns = await mf.getDurableObjectNamespace('ROOMS') as unknown as Namespace, stub = ns.get(ns.idFromName('TEST'));
    const init = () => stub.fetch(new Request('http://internal/init/TEST', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({fix:fix(),size:'small'}) }));
    const rows = await Promise.all([init(),init()]);
    expect(rows.map(row=>row.status).sort()).toEqual([201,409]);
    const owner = await rows.find(row=>row.status===201)!.json() as RoomCredentials;
    expect((await http(path(owner)+'/cancel',{post:true,session:owner})).status).toBe(409);
    const { connection } = await connect(owner);
    expect((await http(path(owner)+'/cancel',{post:true,session:owner,connection})).ok).toBe(true);
    const replacement = await init();
    expect(replacement.status).toBe(201);
    expect((await replacement.json() as RoomCredentials).roomId).not.toBe(owner.roomId);
    expect((await http(path(owner),{session:owner})).status).toBe(404);
  });

  it('isolates, deduplicates and recovers two games and survives a workerd restart', async () => {
    const [a, other] = await Promise.all([create(),create()]);
    expect(a.code).toMatch(/^[A-Z]{4}$/);
    expect(a.code).not.toBe(other.code);
    expect(a.roomId).not.toBe(other.roomId);
    const joinResponses = await Promise.all([http(`/rooms/${a.code}/join`,{post:true}),http(`/rooms/${a.code}/join`,{post:true})]);
    expect(joinResponses.map(response=>response.status).sort()).toEqual([201,409]);
    const b = await accepted<RoomCredentials>(joinResponses.find(response=>response.ok)!);
    const ac = await connect(a), bc = await connect(b);
    const replay = await mf.dispatchFetch(`http://localhost${path(a)}/socket`, { headers: {
      Origin: TEST_ORIGIN, Upgrade:'websocket','Sec-WebSocket-Protocol':`jetlag-v1, ${ac.ticket}`,
    } });
    expect(replay.status).toBe(401);

    const start = await snapshot(a), gameId = start.view.gameId;
    const id = crypto.randomUUID(), name = {type:'set_team_name',name:'Pražské lišky'} as const;
    const named = await accepted<RoomSnapshot>(await send(a,ac.connection,gameId,name,id));
    const replayed = await accepted<RoomSnapshot>(await send(a,ac.connection,gameId,name,id));
    expect(replayed.revision).toBe(named.revision);
    expect((await send(a,ac.connection,gameId,{...name,name:'Jiná akce'},id)).status).toBe(409);
    expect((await http(path(other),{session:a})).status).toBe(401);
    const otherHider = await accepted<RoomCredentials>(await http(`/rooms/${other.code}/join`,{post:true}));
    const oc = await connect(other);
    expect((await send(other,oc.connection,gameId,name,id)).status).toBe(409);
    const unrelated = await snapshot(other);
    expect(unrelated.status).toBe('playing');
    expect(unrelated.view.events).toEqual([]);
    expect(unrelated.view.match?.teams[0].name).not.toBe(name.name);
    expect(unrelated.view.hand).toBeUndefined();

    expect((await send(a,ac.connection,gameId,{type:'location',role:'hider',fix:fix()})).status).toBe(422);
    await accepted(await send(a,ac.connection,gameId,{type:'map_consent',enabled:true}));
    await accepted(await send(b,bc.connection,gameId,{type:'map_consent',enabled:true}));
    await accepted(await send(a,ac.connection,gameId,{type:'ready'}));
    expect((await snapshot(a)).view.phase).toBe('awaiting_ready');
    await accepted(await send(b,bc.connection,gameId,{type:'location',role:'hider',fix:fix()}));
    await accepted(await send(b,bc.connection,gameId,{type:'ready'}));
    const hider = await snapshot(b);
    expect(hider.view.phase).toBe('hiding');
    const stop = hider.view.stops!.find(stop=>stop.name==='Národní divadlo')!;
    const deadline= new Promise<RoomSnapshot>(resolve=>{
      bc.socket.addEventListener('message',event=>{
        const update=JSON.parse(String(event.data)) as RoomSnapshot;
        if(update.view?.phase==='seeking') resolve(update);
      });
    });
    await accepted(await send(b,bc.connection,gameId,{type:'select_station',stopId:stop.id}));
    expect((await deadline).view.station?.id).toBe(stop.id);
    await accepted(await send(a,ac.connection,gameId,{type:'location',role:'hunter',fix:fix({ point:[14.4144,50.0807] })}));
    await accepted(await send(a,ac.connection,gameId,{type:'ask',questionId:'radar:800'}));
    await accepted(await send(b,bc.connection,gameId,{type:'answer'}));
    const hunter = await snapshot(a), privateView = await snapshot(b);
    expect(hunter.view.questions[0].answer).toBe('ANO');
    expect(hunter.view.questions[0]).not.toHaveProperty('targetPoint');
    expect(hunter.view.station).toBeUndefined();
    expect(hunter.view.hand).toBeUndefined();
    expect(JSON.stringify(hunter)).not.toContain(JSON.stringify(point));
    expect(privateView.view.rewards).toHaveLength(1);
    expect(hunter.view.deductions).toHaveLength(1);

    const otherGameId = unrelated.view.gameId;
    const ohc = await connect(otherHider);
    const otherPoint: Fix['point'] = [14.42042,50.08201];
    await accepted(await send(otherHider,ohc.connection,otherGameId,{type:'location',role:'hider',fix:fix({point:otherPoint})}));
    await accepted(await send(other,oc.connection,otherGameId,{type:'map_consent',enabled:false}));
    await accepted(await send(otherHider,ohc.connection,otherGameId,{type:'map_consent',enabled:false}));
    await accepted(await send(other,oc.connection,otherGameId,{type:'ready'}));
    await accepted(await send(otherHider,ohc.connection,otherGameId,{type:'ready'}));
    const otherView = await snapshot(otherHider);
    expect(otherView.view.phase).toBe('hiding');
    expect(otherView.view.ownFix?.point).toEqual(otherPoint);
    expect(otherView.view.questions).toEqual([]);
    expect(otherView.view.rewards).toEqual([]);
    expect(otherView.view.hand).toEqual([]);
    expect(otherView.view.events).not.toEqual(privateView.view.events);
    expect(await snapshot(b)).toMatchObject({ view: { phase: 'seeking', questions: privateView.view.questions, ownFix: { point } } });

    ac.socket.close();bc.socket.close();oc.socket.close();ohc.socket.close();
    await mf.dispose();
    mf = localWorker({ persist, hideMs:1600 });
    await mf.ready;
    const restored = await snapshot(b);
    expect(restored.view.questions).toEqual(privateView.view.questions);
    expect(restored.view.rewards).toEqual(privateView.view.rewards);
    expect(restored.view.station).toEqual(privateView.view.station);
    expect(restored.view.releaseId).toBe(start.view.releaseId);

    const old = await connect(b);
    const closed = new Promise<number>(resolve=>old.socket.addEventListener('close', event=>resolve(event.code)));
    const code = b.recoveryCode.split('.')[2];
    const recovered = await accepted<RoomCredentials>(await http(`/rooms/${b.code}/recover`,{body:{roomId:b.roomId,secret:code}}));
    expect(await closed).toBe(4001);
    expect((await http(path(b),{session:b})).status).toBe(401);
    expect((await http(`/rooms/${b.code}/recover`,{body:{roomId:b.roomId,secret:code}})).status).toBe(401);
    expect((await snapshot(recovered)).team).toBe('team-b');
    expect((await snapshot(recovered)).view.rewards).toEqual(privateView.view.rewards);
  });
});
