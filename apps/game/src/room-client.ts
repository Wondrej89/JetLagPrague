import type { Command, RoleView } from '../../../packages/game-core/src/types';
import type { RoomCredentials, RoomSession, RoomSnapshot } from '../../../packages/game-core/src/room-protocol';
import type { GameTransport } from '../../../packages/game-ui/src/runtime';
import type { PhotoRepository } from '../../../packages/game-ui/src/Phone';

export const apiBase = (import.meta.env.VITE_MULTIPLAYER_URL ?? '').replace(/\/$/, '');
const sessionKey = 'jetlag-prague:multiplayer:v1';
const secret = /^[\w-]{43}$/;
const uuid = /^[0-9a-f-]{36}$/i;

export function readSession(): RoomSession | null {
  try {
    const value = JSON.parse(localStorage.getItem(sessionKey) ?? 'null') as RoomSession | null;
    return value && /^[A-Z]{4}$/.test(value.code) && uuid.test(value.roomId) && secret.test(value.token) ? value : null;
  } catch { return null; }
}
export function remember(session: RoomSession | null) {
  if (!session) localStorage.removeItem(sessionKey);
  else {
    const { code, roomId, token } = session;
    localStorage.setItem(sessionKey, JSON.stringify({ code, roomId, token }));
  }
}

export class RoomError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function request(path: string, init?: RequestInit) {
  const response = await fetch(apiBase + path, { ...init, cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' });
  if (!response.ok) {
    const error = await response.json().catch(() => null) as { error?: string } | null;
    throw new RoomError(response.status, error?.error ?? 'Herní server není dostupný.');
  }
  return response;
}

export async function getStatus() {
  return await (await request('/status', { signal: AbortSignal.timeout(5000) })).json() as { configured: boolean };
}

export async function enterRoom(path: string, input?: unknown) {
  return await (await request(path, {
    method: 'POST', ...(input === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }),
  })).json() as RoomCredentials;
}

export type LinkState = 'connecting' | 'online' | 'offline' | 'replaced' | 'expired';

export class RoomTransport implements GameTransport {
  private socket?: WebSocket;
  private connection?: string;
  private snapshot?: RoomSnapshot;
  private view?: RoleView;
  private receivedAt = 0;
  private disposed = false;
  private heartbeat?: number;
  private retry?: number;
  private retries = 0;
  private listeners = new Set<() => void>();
  private readonly path: string;

  constructor(private session: RoomSession, private onSnapshot: (snapshot: RoomSnapshot) => void, private onLink: (link: LinkState) => void) {
    this.path = `/rooms/${session.code}/${session.roomId}`;
  }

  getView = () => this.view!;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  start() {
    this.heartbeat = window.setInterval(() => this.refreshView(), 1000);
    void this.connect();
  }

  dispose() {
    this.disposed = true;
    this.socket?.close();
    clearTimeout(this.retry);
    clearInterval(this.heartbeat);
    this.listeners.clear();
  }

  private refreshView() {
    if (!this.snapshot || this.disposed) return;
    const { view, clockRunning } = this.snapshot;
    const elapsed = Math.max(0, Math.floor(performance.now() - this.receivedAt));
    this.view = {
      ...view, now: view.now + elapsed,
      elapsedMs: view.elapsedMs + (clockRunning ? elapsed : 0),
      hideRemainingMs: view.phase === 'hiding' ? Math.max(0, view.hideRemainingMs - elapsed) : view.hideRemainingMs,
    };
    for (const listener of this.listeners) listener();
  }

  private apply(snapshot: RoomSnapshot) {
    if (this.disposed || snapshot.roomId !== this.session.roomId ||
        snapshot.revision < (this.snapshot?.revision ?? 0) ||
        snapshot.revision === this.snapshot?.revision && snapshot.serverNow < this.snapshot.serverNow) return;
    this.snapshot = snapshot;
    this.receivedAt = performance.now();
    this.refreshView();
    this.onSnapshot(snapshot);
  }

  private async get(path: string) {
    return request(this.path + path, { headers: { Authorization: `Bearer ${this.session.token}` } });
  }

  private async post(path: string, body?: BodyInit, contentType = 'application/json') {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.session.token}` };
    if (this.connection) headers['X-Room-Connection'] = this.connection;
    if (body) headers['Content-Type'] = contentType;
    return request(this.path + path, { method: 'POST', headers, body });
  }

  private reconnect() {
    if (this.disposed) return;
    this.onLink('offline');
    this.retry = window.setTimeout(() => void this.connect(), Math.min(10_000, 500 * 2 ** Math.min(this.retries++,5)));
  }

  private async connect() {
    if (this.disposed) return;
    this.onLink('connecting');
    try {
      this.apply(await (await this.get('')).json() as RoomSnapshot);
      if (this.disposed) return;
      const { ticket } = await (await this.post('/ticket')).json() as { ticket: string };
      if (this.disposed) return;
      const url = new URL(apiBase + this.path + '/socket');
      url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(url, ['jetlag-v1',ticket]);
      this.socket = socket;
      socket.onmessage = event => {
        if (this.disposed || this.socket !== socket) return;
        try {
          const payload = JSON.parse(event.data) as RoomSnapshot | { connection: string };
          if ('connection' in payload) {
            this.connection = payload.connection;
            this.retries = 0;
            this.onLink('online');
          } else this.apply(payload);
        } catch { socket.close(); }
      };
      socket.onclose = event => {
        if (this.disposed || this.socket !== socket) return;
        this.connection = undefined;
        if ([4001,4004].includes(event.code)) this.onLink('expired');
        else if (event.code === 4002) this.onLink('replaced');
        else this.reconnect();
      };
    } catch (error) {
      if (this.disposed) return;
      if (error instanceof RoomError && [401,404].includes(error.status)) this.onLink('expired');
      else this.reconnect();
    }
  }

  send = async (command: Command) => {
    if (!this.connection || !this.snapshot) throw new Error('Počkejte na obnovení spojení.');
    const payload = JSON.stringify({ id: crypto.randomUUID(), gameId: this.snapshot.view.gameId, command });
    try {
      this.apply(await (await this.post('/command', payload)).json() as RoomSnapshot);
    } catch (error) {
      if (error instanceof RoomError && error.status < 500 || !this.connection || this.disposed) throw error;
      this.apply(await (await this.post('/command', payload)).json() as RoomSnapshot);
    }
  };

  async cancel() { await this.post('/cancel'); }

  private async upload(blob: Blob) {
    const response = await this.post('/media', blob, blob.type);
    return (await response.json() as { id: string }).id;
  }

  readonly media: PhotoRepository = {
    put: async file => {
      if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 10 * 1024 * 1024)
        throw new Error('Vyberte JPEG, PNG nebo WebP do 10 MB.');
      const photo = await createImageBitmap(file);
      try {
        if (photo.width * photo.height > 40_000_000) throw new Error('Fotografie má příliš velké rozlišení.');
        const scale = Math.min(1, 1600 / Math.max(photo.width, photo.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(photo.width * scale));
        canvas.height = Math.max(1, Math.round(photo.height * scale));
        canvas.getContext('2d')!.drawImage(photo, 0, 0, canvas.width, canvas.height);
        const jpeg = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob
          ? resolve(blob) : reject(new Error('Fotografii se nepodařilo připravit.')), 'image/jpeg', 0.85));
        return await this.upload(jpeg);
      } finally { photo.close(); }
    },
    putVideo: async file => {
      if (!['video/mp4','video/webm'].includes(file.type) || file.size > 8 * 1024 * 1024)
        throw new Error('Vyberte video MP4 nebo WebM do 8 MB.');
      return this.upload(file);
    },
    get: async id => (await this.get(`/media/${encodeURIComponent(id)}`)).blob(),
  };
}
