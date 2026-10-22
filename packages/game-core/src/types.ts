export type Point = [number, number];
export type Role = 'hunter' | 'hider';
export type QuestionType = 'matching' | 'measuring' | 'radar' | 'thermometer' | 'tentacles' | 'photo';
export type TargetPolicy = 'station' | 'gps';
export interface Fix { point: Point; at: number; accuracy: number; speed?: number | null }
export interface RewardPolicy { draw: number; keep: number }
export interface QuestionDefinition {
  id: string; type: QuestionType; category: string; label: string; description: string;
  resolver: 'poi_matching' | 'poi_measuring' | 'same_area' | 'radar' | 'thermometer' | 'tentacles' | 'manual' | 'photo' | 'unsupported';
  answerMode: 'automatic' | 'manual' | 'photo'; rewardPolicy: RewardPolicy | null; timeoutSeconds: number | null;
  availability: 'ready' | 'manual' | 'missing_data' | 'unsupported'; requirements: string[];
  target: TargetPolicy; radiusMeters?: number; minMoveMeters?: number; configured?: boolean; testOnly?: boolean;
}
export interface CardDefinition {
  id: string; type: 'time_bonus' | 'powerup' | 'curse'; name: string; description: string; icon: string;
  effect: 'bonus' | 'capacity' | 'veto' | 'randomize' | 'curse'; value?: number;
  curse?: { durationMs?: number; condition: string; blocksQuestions: boolean; manual: boolean };
}
export interface GameRules {
  id: string; label: string; testOnly: boolean; hideMs: number; radiusMeters: number; gpsMaxAgeMs: number; gpsMaxAccuracyM: number;
  handLimit: number; veto: { enabled: boolean; reward: boolean }; randomize: { enabled: boolean; restartTimer: boolean };
  questions: QuestionDefinition[]; cards: CardDefinition[]; deck: string[];
}
export interface Stop { id: string; name: string; point: Point }
export interface QuestionInstance {
  id: string; definition: QuestionDefinition; askedAt: number; deadline: number | null;
  hunterFix: Fix; targetPoint: Point; secondFix?: Fix;
  state: 'pending' | 'answered' | 'vetoed' | 'error'; answer?: string; error?: string; answeredAt?: number; photoId?: string; draftPhotoId?: string;
}
export interface Reward { id: string; questionId: string; policy: RewardPolicy; state: 'pending' | 'offered' | 'claimed'; offer: string[] }
export interface Curse { id: string; cardId: string; name: string; description: string; icon: string; activatedAt: number; expiresAt?: number; condition: string; blocksQuestions: boolean; manual: boolean; target: 'hunter'; state: 'active' | 'fulfilled' | 'ended' }
export interface GameEvent { id: string; at: number; type: string; audience: 'all' | Role; text: string }
export interface GameState {
  version: 1; id: string; releaseId: string; mode: 'simulation'|'live'; rules: GameRules; startedAt: number; now: number;
  phase: 'hiding' | 'needs_station' | 'seeking' | 'finished'; hideDeadline: number;
  players: Record<Role, { id: string; name: string }>;
  fixes: Partial<Record<Role, Fix>>; walking: boolean; provisionalStopId: string | null; station: Stop | null; deadlineCandidates: Stop[] | null;
  questions: QuestionInstance[]; hand: string[]; drawPile: string[]; discardPile: string[]; rewards: Reward[]; curses: Curse[]; effects: {cardId:string;value:number;at:number}[];
  proximity: boolean; seed:number; rng: number; sequence: number; events: GameEvent[]; processedCommands: string[];
}
export type Command =
  | { type: 'tick' }
  | { type: 'location'; role: Role; fix: Fix | null }
  | { type: 'walking'; value: boolean }
  | { type: 'select_station'; stopId: string }
  | { type: 'lock_station'; stopId: string }
  | { type: 'ask'; questionId: string }
  | { type: 'second_measurement' }
  | { type: 'attach_photo'; photoId:string }
  | { type: 'answer'; answer?: string; photoId?: string }
  | { type: 'draw_reward'; rewardId: string }
  | { type: 'keep_reward'; rewardId: string; cardId: string }
  | { type: 'play_card'; cardId: string }
  | { type: 'discard_card'; cardId: string }
  | { type: 'fulfill_curse'; curseId: string }
  | { type: 'finish' };
export interface Envelope { id: string; at: number; actor: Role | 'clock'; command: Command }
export interface Resolution { state: 'known' | 'unknown'; answer?: string; reason?: string; details?: Record<string, string | number | Point | null> }
export interface GameEnvironment {
  releaseId: string; stops: Stop[];
  insideArea(point: Point): boolean; distance(a: Point, b: Point): number;
  resolve(question: QuestionInstance): Resolution;
  availability(definition: QuestionDefinition): { state: QuestionDefinition['availability']; reason: string };
}
export interface RoleView {
  connected?:boolean; gameId: string; releaseId: string; role: Role; phase: GameState['phase']; elapsedMs: number; now: number; hideRemainingMs: number;
  proximityActive?:boolean; finalScoreMs?:number; ownFix: Fix | null; gpsIssue:string|null; canAsk: boolean; blockingReason: string; walking?: boolean; station?: Stop | null; provisionalStopId?: string | null; stops?: Stop[];
  questions: { id: string; definition: QuestionDefinition; state: QuestionInstance['state']; askedAt: number; deadline: number | null; answer?: string; error?: string; photoId?: string; draftPhotoId?:string; secondCaptured: boolean }[];
  availableQuestions: (QuestionDefinition & { reason: string })[];
  hand?: { instanceId: string; definition: CardDefinition }[]; handLimit?: number; overflow?: number; bonusSeconds?: number;
  rewards?: Reward[]; rewardCards?: Record<string, CardDefinition>; curses: Curse[]; events: GameEvent[];
}
