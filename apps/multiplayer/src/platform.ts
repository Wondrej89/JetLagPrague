export interface Sql {
  exec<T extends Record<string, string | number | ArrayBuffer | null> = Record<string, string | number | ArrayBuffer | null>>(
    statement: string, ...bindings: (string | number | ArrayBuffer | null)[]
  ): Iterable<T>;
}

interface RoomSocket extends WebSocket {
  serializeAttachment(value: unknown): void;
  deserializeAttachment(): unknown;
}

export interface DurableState {
  storage: {
    sql: Sql;
    transactionSync<T>(action: () => T): T;
    setAlarm(time: number): Promise<void>;
    deleteAlarm(): Promise<void>;
  };
  acceptWebSocket(socket: WebSocket): void;
  getWebSockets(): RoomSocket[];
}

export interface Namespace {
  idFromName(name: string): unknown;
  get(id: unknown): { fetch(request: Request): Promise<Response> };
}

export interface MultiplayerEnvironment {
  ALLOWED_ORIGIN: string;
  RELEASE_BASE_URL: string;
  ROOMS: Namespace;
  LIMITS: Namespace;
  RELEASES?: { fetch(request: Request): Promise<Response> };
  ALLOW_REFERENCE_RELEASE?: string;
  TEST_HIDE_MS?: string;
}

declare const WebSocketPair: { new(): { 0: WebSocket; 1: RoomSocket } };
export function openPair() {
  return new WebSocketPair();
}
