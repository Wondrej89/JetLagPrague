import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import worker, { MAX_PUBLISH_BYTES, PublisherCoordinator, type Storage, type PublisherEnvironment } from './index';
import { ApiFailure, base64, GitHubClient, githubAppJwt } from './github';
import { canonicalJson } from '../../../packages/geo-core/src/administrative';
import { sha256 } from '../../../packages/geo-core/src/pid-snapshot';
import { createGameDataRelease, releaseEntry, type GameDataRelease, type GameReleaseIndex } from '../../../packages/geo-core/src/game-release';
import { releaseTestFixture, releaseTestDate } from '../../../packages/geo-core/src/game-release-test-fixtures';

class MemoryStorage implements Storage {
  data=new Map<string,unknown>(); alarm:number|null=null; pending:Promise<unknown>=Promise.resolve();
  async get<T>(key:string){return structuredClone(this.data.get(key)) as T|undefined;}
  async put(key:string,value:unknown){this.data.set(key,structuredClone(value));}
  async delete(key:string){return this.data.delete(key);}
  transaction<T>(action:(tx:Storage)=>Promise<T>):Promise<T>{const result=this.pending.then(()=>action(this));this.pending=result.catch(()=>{});return result;}
  async list<T>({prefix='',limit=1000}={}){return new Map([...this.data.entries()].filter(([key])=>key.startsWith(prefix)).sort(([a],[b])=>a.localeCompare(b)).slice(0,limit)) as Map<string,T>;}
  async getAlarm(){return this.alarm;} async setAlarm(time:number){this.alarm=time;}
}
const origin='https://wondrej89.github.io', address='https://publisher.example.test', head='a'.repeat(40), nextHead='b'.repeat(40), token='T'.repeat(43), csrf='C'.repeat(43);
let store:MemoryStorage,env:PublisherEnvironment,coordinator:PublisherCoordinator,release:GameDataRelease,index:GameReleaseIndex,files:Map<string,string>;
function request(path:string,data?:unknown,headers:Record<string,string>={}){return new Request(address+path,{method:data===undefined?'GET':'POST',headers:{origin,Authorization:`Bearer ${token}`,'X-CSRF-Token':csrf,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});}
async function send(path:string,data?:unknown,headers:Record<string,string>={}){return coordinator.fetch(request(path,data,headers));}
async function authorized(){await store.put(`session:${await sha256(token)}`,{expiresAt:Date.now()+900000,userId:'64984949',login:'Wondrej89',csrfHash:await sha256(csrf)});}
async function seedIndex(value:GameDataRelease){const entry=await releaseEntry(value);index={format:'jetlag-prague-game-catalog',schemaVersion:1,current:entry,versions:[entry]};files.set('data/releases/current.json',JSON.stringify(index));files.set(`data/releases/${entry.file}`,canonicalJson(value));}
function gitMocks(){
  vi.spyOn(GitHubClient.prototype,'head').mockResolvedValue(head);
  vi.spyOn(GitHubClient.prototype,'file').mockImplementation(async path=>files.get(path)??null);
  vi.spyOn(GitHubClient.prototype,'deployment').mockResolvedValue(null);
  vi.spyOn(GitHubClient.prototype,'commit').mockResolvedValue(nextHead);
  vi.spyOn(GitHubClient.prototype,'repo').mockImplementation(async path=>{
    expect(path).toBe('/contents/pid/index.json?ref=pid-data'); const pid=release.data.pidSnapshot;
    const entry={file:`snapshot-${pid.checksum}.json.gz`,checksum:pid.checksum,id:pid.id,serviceDate:pid.serviceDate,adapterVersion:pid.adapterVersion,preparedAt:releaseTestDate,downloadedAt:releaseTestDate,quality:'verified'};
    return {encoding:'base64',content:base64(new TextEncoder().encode(JSON.stringify({format:'jetlag-praha-pid-catalog',schemaVersion:2,file:entry.file,checksum:entry.checksum,versions:[entry]})))};
  });
}
beforeEach(async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(releaseTestDate));
  store=new MemoryStorage();env={ALLOWED_ORIGIN:origin,EDITOR_URL:origin+'/JetLagPrague/editor/',ALLOWED_GITHUB_USER_ID:'64984949',REPOSITORY_ID:'1420367545',GITHUB_APP_ID:'123',GITHUB_CLIENT_ID:'Iv1.synthetic',GITHUB_INSTALLATION_ID:'456',GITHUB_CLIENT_SECRET:'synthetic-secret',GITHUB_APP_PRIVATE_KEY:'synthetic-private-key',COORDINATOR:{idFromName:value=>value,get:()=>({fetch:request=>coordinator.fetch(request)})}};
  coordinator=new PublisherCoordinator({storage:store},env);release=await releaseTestFixture();files=new Map();await authorized();gitMocks();
});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});

describe('Server authorization and immutable publication',()=>{
  it('fails closed when unconfigured, including direct mutation requests',async()=>{
    env.GITHUB_CLIENT_SECRET='';expect(await (await send('/status')).json()).toMatchObject({configured:false});const response=await send('/publish',{expectedCommit:head,release});expect(response.status).toBe(503);expect(await response.text()).toContain('není nakonfigurována');expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('rejects missing, invalid, expired sessions, wrong immutable user IDs, origins and CSRF without GitHub writes',async()=>{
    for(const headers of ([{Authorization:''},{Authorization:'Bearer '+ 'x'.repeat(43)},{origin:'https://evil.test'},{'X-CSRF-Token':'wrong'}] as Record<string,string>[]))expect([401,403]).toContain((await send('/publish',{expectedCommit:head,release},headers)).status);
    await store.put(`session:${await sha256(token)}`,{expiresAt:Date.now()+900000,userId:'1',login:'Wondrej89',csrfHash:await sha256(csrf)});expect((await send('/publish',{expectedCommit:head,release})).status).toBe(401);
    await authorized();vi.setSystemTime(Date.now()+900001);expect((await send('/publish',{expectedCommit:head,release})).status).toBe(401);expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('rejects injected repository/path fields, oversized requests, malformed JSON and rate abuse',async()=>{
    for(const extra of [{repository:'evil/repo'},{path:'.github/workflows/evil.yml'}])expect((await send('/publish',{expectedCommit:head,release,...extra})).status).toBe(400);
    expect((await send('/publish',{}, {'Content-Length':String(MAX_PUBLISH_BYTES+1)})).status).toBe(413);
    expect((await coordinator.fetch(new Request(address+'/publish',{method:'POST',headers:{origin,Authorization:`Bearer ${token}`,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:'not JSON'}))).status).toBe(400);
    for(let i=0;i<120;i++)await send('/session',undefined,{Authorization:''});expect((await send('/session')).status).toBe(429);expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('writes exactly one release and its pointer in an atomic CAS; never sends private world or arbitrary files',async()=>{
    const response=await send('/publish',{expectedCommit:head,release});expect(response.status).toBe(202);expect(await response.json()).toMatchObject({status:'pending-deployment',commit:nextHead});
    const [expected,changes]=vi.mocked(GitHubClient.prototype.commit).mock.calls[0];expect(expected).toBe(head);expect(changes.map(file=>file.path)).toEqual([`data/releases/release-${release.checksums.content}.json`,'data/releases/current.json']);expect(changes[0].text).not.toContain('PRIVATE NOTE');expect(JSON.parse(changes[1].text).current.releaseId).toBe(release.releaseId);
  });
  it('rejects duplicate content, immutable file collision, stale SHA, unverified PID and historical releases',async()=>{
    await seedIndex(release);expect((await send('/publish',{expectedCommit:head,release})).status).toBe(409);
    files.delete('data/releases/current.json');expect((await send('/publish',{expectedCommit:head,release})).status).toBe(409);files.clear();
    expect((await send('/publish',{expectedCommit:'c'.repeat(40),release})).status).toBe(409);
    const old=await createGameDataRelease(release.data,{kind:'reference',publishedAt:releaseTestDate});expect((await send('/publish',{expectedCommit:head,release:old})).status).toBe(422);
    vi.mocked(GitHubClient.prototype.repo).mockResolvedValue({encoding:'base64',content:base64(new TextEncoder().encode(JSON.stringify({format:'jetlag-praha-pid-catalog',schemaVersion:1,file:'snapshot-'+ 'c'.repeat(64)+'.json.gz',checksum:'c'.repeat(64)})))});expect((await send('/publish',{expectedCommit:head,release})).status).toBe(409);expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('serializes publication leases and does not consume or change drafts after GitHub failure',async()=>{
    await store.put('publish-lock',{lease:'another',expiresAt:Date.now()+180000});expect((await send('/publish',{expectedCommit:head,release})).status).toBe(409);expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();await store.delete('publish-lock');
    vi.mocked(GitHubClient.prototype.commit).mockRejectedValue(new ApiFailure(502,'GitHub API není dostupné.'));expect((await send('/publish',{expectedCommit:head,release})).status).toBe(502);expect(await store.get('publish-lock')).toBeUndefined();expect(files.size).toBe(0);
  });
  it('allows only one real in-flight commit and releases the lock after completion',async()=>{
    let finish!: (sha:string)=>void;
    vi.mocked(GitHubClient.prototype.commit).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const first=send('/publish',{expectedCommit:head,release});
    await vi.waitFor(()=>expect(GitHubClient.prototype.commit).toHaveBeenCalledOnce());
    expect((await send('/publish',{expectedCommit:head,release})).status).toBe(409);
    finish(nextHead);expect((await first).status).toBe(202);expect(await store.get('publish-lock')).toBeUndefined();
  });
  it('reports failed deployments separately and rollback switches only a verified historical pointer',async()=>{
    await seedIndex(release);const data=structuredClone(release.data);data.gameArea.name='Nová Praha';const other=await createGameDataRelease(data,{kind:'approved',publishedAt:releaseTestDate});const entry=await releaseEntry(other);index.versions.push(entry);index.current=entry;files.set('data/releases/current.json',JSON.stringify(index));
    vi.mocked(GitHubClient.prototype.deployment).mockResolvedValue({status:'completed',conclusion:'failure',url:'https://github.com/Wondrej89/JetLagPrague/actions/runs/123'});
    expect(await (await send('/publication')).json()).toMatchObject({index:{current:entry},deployment:{conclusion:'failure'}});
    const response=await send('/rollback',{expectedCommit:head,releaseId:release.releaseId});expect(response.status).toBe(202);const changes=vi.mocked(GitHubClient.prototype.commit).mock.calls[0][1];expect(changes).toHaveLength(1);expect(changes[0].path).toBe('data/releases/current.json');expect(JSON.parse(changes[0].text).current.releaseId).toBe(release.releaseId);
    vi.mocked(GitHubClient.prototype.commit).mockClear();files.set(`data/releases/${(await releaseEntry(release)).file}`,'{}');expect((await send('/rollback',{expectedCommit:head,releaseId:release.releaseId})).status).toBe(422);expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('enforces CORS even before dispatch to storage',async()=>{
    expect((await worker.fetch(request('/publish',{}, {origin:'https://evil.test'}),env)).status).toBe(403);
    const allowed=await worker.fetch(new Request(address+'/publish',{method:'OPTIONS',headers:{origin}}),env);expect(allowed.status).toBe(204);expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  });
});

describe('GitHub OAuth callback',()=>{
  async function start(){const response=await send('/auth/start');expect(response.status).toBe(302);const url=new URL(response.headers.get('Location')!);expect(url.searchParams.get('code_challenge_method')).toBe('S256');return {url,state:url.searchParams.get('state')!};}
  it('binds state to secure browser cookie, validates PKCE and immutable user ID, and mints only a short local session',async()=>{
    const {url,state}=await start();const cookie=responseCookie(state);
    const live=vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
      if(String(input)==='https://github.com/login/oauth/access_token'){expect(options?.redirect).toBe('manual');const form=new URLSearchParams(String(options?.body));expect(form.get('client_secret')).toBe('synthetic-secret');expect(await sha256(form.get('code_verifier')!)).toBe([...Uint8Array.from(atob(url.searchParams.get('code_challenge')!.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))].map(v=>v.toString(16).padStart(2,'0')).join(''));return Response.json({access_token:'github-secret-not-for-browser'});}
      expect(String(input)).toBe('https://api.github.com/user');expect(options?.redirect).toBe('manual');return Response.json({id:64984949,login:'RenamedAdmin'});
    });vi.stubGlobal('fetch',live);
    const response=await send(`/auth/callback?code=code&state=${state}`,undefined,{cookie});expect(response.status).toBe(200);const html=await response.text();expect(html).not.toContain('github-secret-not-for-browser');expect(html).not.toContain('synthetic-secret');expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
    const session=JSON.parse(html.match(/postMessage\((\{.*?\}),/)![1]);expect(session.expiresAt-Date.now()).toBe(900000);expect((await send('/session',undefined,{Authorization:`Bearer ${session.token}`})).status).toBe(200);
    expect((await send(`/auth/callback?code=code&state=${state}`,undefined,{cookie})).status).toBe(403);
    const second=await start();expect((await send(`/auth/callback?code=code&state=${second.state}`)).status).toBe(403);
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>String(input).includes('access_token')?Response.json({access_token:'wrong-account'}):Response.json({id:1,login:'Wondrej89'})));expect((await send(`/auth/callback?code=code&state=${second.state}`,undefined,{cookie:responseCookie(second.state)})).status).toBe(403);
    expect(GitHubClient.prototype.commit).not.toHaveBeenCalled();
  });
  it('rejects OAuth token redirects instead of following them', async()=>{
    const {state}=await start();const upstream=vi.fn(async(_input:RequestInfo|URL,options?:RequestInit)=>{
      expect(options?.redirect).toBe('manual');
      return new Response(null,{status:302,headers:{Location:'https://untrusted.example/token'}});
    });vi.stubGlobal('fetch',upstream);
    const response=await send(`/auth/callback?code=code&state=${state}`,undefined,{cookie:responseCookie(state)});
    expect(response.status).toBe(502);expect(upstream).toHaveBeenCalledOnce();
  });
});
function responseCookie(state:string){return `__Host-jetlag-oauth=${state}`;}

it('GitHub App accepts PKCS#1/PKCS#8 keys, restricts tokens to one repo, and uses expectedHeadOid for the final CAS',async()=>{
  vi.restoreAllMocks();const pair=generateKeyPairSync('rsa',{modulusLength:2048});
  for(const type of ['pkcs1','pkcs8'] as const){env.GITHUB_APP_PRIVATE_KEY=pair.privateKey.export({format:'pem',type}).toString();const jwt=await githubAppJwt(env);const payload=JSON.parse(atob(jwt.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));expect(payload.exp-payload.iat).toBe(600);const publicKey=await crypto.subtle.importKey('spki',new Uint8Array(pair.publicKey.export({format:'der',type:'spki'})).buffer,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);expect(await crypto.subtle.verify('RSASSA-PKCS1-v1_5',publicKey,Uint8Array.from(atob(jwt.split('.')[2].replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)),new TextEncoder().encode(jwt.split('.').slice(0,2).join('.')))).toBe(true);}
  const api=vi.fn(async(input:RequestInfo|URL,options?:RequestInit)=>{
    if(String(input).includes('/access_tokens'))return Response.json({token:'scoped-token',repositories:[{id:1420367545,full_name:'Wondrej89/JetLagPrague'}]});
    expect(String(input)).toBe('https://api.github.com/graphql');const inputBody=JSON.parse(String(options?.body));expect(inputBody.variables.input).toMatchObject({branch:{repositoryNameWithOwner:'Wondrej89/JetLagPrague',branchName:'main'},expectedHeadOid:head});return Response.json({data:{createCommitOnBranch:{commit:{oid:nextHead}}}});
  });vi.stubGlobal('fetch',api);const github=new GitHubClient(env);expect(await github.commit(head,[{path:'data/releases/current.json',text:'{}'}],'Test')).toBe(nextHead);expect(api.mock.calls.every(([,options])=>options?.redirect==='manual')).toBe(true);
  await expect(github.commit(head,[{path:'../unsafe',text:'x'}],'Test')).rejects.toThrow('zakázán');
  api.mockImplementation(async()=>Response.json({token:'bad',repositories:[{id:1,full_name:'evil/repo'}]}));await expect(new GitHubClient(env).installationToken()).rejects.toThrow('přesně');
});
