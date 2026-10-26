import type { CardMechanics, CardRuntime, CastingProof, CurseEffect, CurseStage, CurseSetup, Evidence, GameSize, RollCondition } from './card-types';
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
  distanceMode?: 'geometry'; spatialVersion?: 2; toleranceMeters?: number; sourceRule?: string;
  target: TargetPolicy; radiusMeters?: number; minMoveMeters?: number; configured?: boolean; testOnly?: boolean;
}
export interface CardDefinition {
  id: string; type: 'time_bonus' | 'powerup' | 'curse'; name: string; description: string; icon: string;
  effect: 'bonus' | 'capacity' | 'veto' | 'randomize' | 'curse' | 'duplicate' | 'move' | 'discard_1_draw_2' | 'discard_2_draw_3' | 'draw_1_expand_1'; value?: number;
  mechanics?: CardMechanics;
  curse?: { durationMs?: number; condition: string; blocksQuestions: boolean; manual: boolean };
}
export interface GameRules {
  uxVersion?: 1; hangmanVersion?: 1; manualHangmanResponses?: boolean;
  mapVersion?: 1; moveVersion?: 2; automaticDeductionMap?: boolean; deductionConsent?: { hunter: boolean; hider: boolean; authority: 'simulator' };
  cardVersion?: 2; questionVersion?: 2; size?: GameSize;
  id: string; label: string; testOnly: boolean; hideMs: number; radiusMeters: number; gpsMaxAgeMs: number; gpsMaxAccuracyM: number;
  handLimit: number; veto: { enabled: boolean; reward: boolean }; randomize: { enabled: boolean; restartTimer: boolean };
  questions: QuestionDefinition[]; cards: CardDefinition[]; deck: string[];
}
export interface Stop { id: string; name: string; point: Point }
export interface PublicPoi { id: string; name: string; point: Point }
export type QuestionPhase = 'awaiting_second_measurement' | 'awaiting_response' | 'answered' | 'error';
export interface QuestionInstance {
  epochId?: string;
  phase?: QuestionPhase; responseStartedAt?: number; secondCapturedAt?: number; answerPoi?: PublicPoi; errorCode?: 'thermometer_tie';
  manualResolution?: { at: number; note: string };
  rewardModifierIds?: string[]; id: string; definition: QuestionDefinition; askedAt: number; deadline: number | null;
  hunterFix: Fix; targetPoint: Point; secondFix?: Fix;
  state: 'pending' | 'answered' | 'vetoed' | 'error'; answer?: string; error?: string; answeredAt?: number; photoId?: string; draftPhotoId?: string;
}
export interface Reward { id: string; questionId: string; policy: RewardPolicy; state: 'pending' | 'offered' | 'claimed'; offer: string[] }
export interface Curse { noEffect?:boolean; hangman?: import('./hangman').HangmanState; id: string; cardId: string; name: string; description: string; icon: string; activatedAt: number; expiresAt?: number; condition: string; blocksQuestions: boolean; manual: boolean; target: 'hunter'; state: 'active' | CurseStage; effects?: CurseEffect[]; evidence?: Evidence[]; casterPoint?: Point; setup?: CurseSetup; castRollStart?:number; guesses?: string[]; maskedWord?: string }
export interface GameEvent { id: string; at: number; type: string; audience: 'all' | Role; text: string }
export interface Deduction {
  id: string; questionId: string; epochId: string; releaseId: string; geometryTarget: TargetPolicy;
  operation: 'include' | 'exclude'; sourceType: 'radar' | 'measuring' | 'matching' | 'thermometer';
  result: string; createdAt: number; status: 'active' | 'archived';
  parameters: { definitionId: string; resolver: QuestionDefinition['resolver']; category: string; hunterPoint: Point; secondPoint?: Point; radiusMeters?: number; minMoveMeters?:number; toleranceMeters: number; distanceMode?: 'geometry' };
}
export interface GameState {
  match?: import('./match-types').TeamMatch; roundEnd?: import('./match-types').RoundEnd;
  lobby?: { choices: Partial<Record<Role, boolean>>; ready: Record<Role, boolean>; startedAt?: number };
  noticeAcknowledgements?: Partial<Record<Role, string[]>>;
  epochId?: string; deductions?: Deduction[]; endgame?: boolean;
  version: 1 | 2; cardState?: CardRuntime; id: string; releaseId: string; mode: 'simulation'|'live'; rules: GameRules; startedAt: number; now: number;
  phase: 'awaiting_map_consent' | 'awaiting_ready' | 'hiding' | 'needs_station' | 'seeking' | 'awaiting_capture_confirmation' | 'settling' | 'finished'; hideDeadline: number;
  players: Record<Role, { id: string; name: string }>;
  fixes: Partial<Record<Role, Fix>>; walking: boolean; provisionalStopId: string | null; station: Stop | null; deadlineCandidates: Stop[] | null;
  questions: QuestionInstance[]; hand: string[]; drawPile: string[]; discardPile: string[]; rewards: Reward[]; curses: Curse[]; effects: {cardId:string;value:number;at:number;lifetime?:'game'}[];
  proximity: boolean; seed:number; rng: number; sequence: number; events: GameEvent[]; processedCommands: string[];
}
export type Command =
  | { type: 'tick' }
  | { type: 'set_team_name'; name:string }
  | { type: 'report_found' }
  | { type: 'respond_found'; claimId:string; accepted:boolean }
  | { type: 'answer_settlement_check'; checkId:string; answer:import('./match-types').CheckAnswer }
  | { type: 'finalize_round'; confirmed:boolean }
  | { type: 'next_round'; confirmed:boolean }
  | { type: 'map_consent'; enabled: boolean }
  | { type: 'ready' }
  | { type: 'acknowledge_notice'; eventId: string }
  | { type: 'set_hangman_word'; curseId: string; word: string; manuallyConfirmed: boolean }
  | { type: 'respond_hangman'; curseId: string; responseId: string }
  | { type: 'declare_endgame'; confirmed: boolean }
  | { type: 'location'; role: Role; fix: Fix | null; observation?: boolean }
  | { type: 'walking'; value: boolean }
  | { type: 'select_station'; stopId: string }
  | { type: 'lock_station'; stopId: string }
  | { type: 'ask'; questionId: string; confirmations?: string[]; ransomText?:string }
  | { type: 'second_measurement'; confirmations?: string[]; ransomText?: string }
  | { type: 'resolve_thermometer_tie'; answer: 'TEPLEJI' | 'CHLADNĚJI'; confirmed: boolean; note: string }
  | { type: 'attach_photo'; photoId:string }
  | { type: 'answer'; answer?: string; photoId?: string }
  | { type: 'draw_reward'; rewardId: string }
  | { type: 'keep_reward'; rewardId: string; cardId: string; cardIds?: never }
  | { type: 'keep_reward'; rewardId: string; cardIds: string[]; cardId?: never }
  | { type: 'play_card'; cardId: string; targetCardId?: string; discardIds?: string[] }
  | { type: 'begin_cast'; cardId: string; setup?: CurseSetup }
  | { type: 'cancel_cast'; curseId: string }
  | { type: 'confirm_cast'; curseId: string; proof: CastingProof }
  | { type: 'complete_curse_task'; curseId: string; effectId: string; confirmed: boolean; media?: {id: string; kind: 'photo' | 'video'}; mediaItems?: {id:string;kind:'photo'|'video'}[]; durationSeconds?: number; rollId?:string }
  | { type: 'verify_curse_task'; curseId:string; effectId:string; verified:boolean }
  | { type: 'start_curse_visit'; curseId:string; effectId:string; confirmed:boolean }
  | { type: 'guess_letter'; curseId:string; letter:string }
  | { type: 'curse_roll'; curseId:string; effectId:string; rollId:string }
  | { type: 'attempt_door'; curseId:string; effectId:string; spaceId:string; rollId:string }
  | { type: 'enter_space'; curseId:string; spaceId:string; confirmed:boolean }
  | { type: 'steps_taken'; curseId:string; effectId:string; count:number; confirmed:boolean }
  | { type: 'violate_curse'; curseId: string; effectId: string; confirmed: boolean }
  | { type: 'roll'; count: 1 | 2; condition: RollCondition; manualValues?: number[] }
  | { type: 'complete_move'; stopId: string; confirmed: boolean }
  | { type: 'discard_card'; cardId: string }
  | { type: 'fulfill_curse'; curseId: string }
  | { type: 'finish' };
export interface Envelope { id: string; at: number; actor: Role | 'clock'; command: Command }
export interface Resolution { code?: 'thermometer_tie'; publicPoi?: PublicPoi; state: 'known' | 'unknown'; answer?: string; reason?: string; details?: Record<string, string | number | Point | null> }
export interface GameEnvironment {
  releaseId: string; stops: Stop[]; maxMovementMeters?: number;
  insideArea(point: Point): boolean; distance(a: Point, b: Point): number;
  resolve(question: QuestionInstance): Resolution;
  availability(definition: QuestionDefinition): { state: QuestionDefinition['availability']; reason: string };
  namedWaterDistance?(point: Point): { state: 'known'; meters: number } | { state: 'unknown'; reason: string };
}
export interface RoleView {
  match?: import('./match-types').MatchView; roundEnd?: import('./match-types').RoundEnd;
  /** Supplied only to the hider, through the role-filtered transport. */
  hunterLocation?: import('./location-view').SharedLocation;
  hangmanVersion?:1; lobby?: GameState['lobby']; indicators?: import('./indicators').GameIndicator[];
  wallElapsedMs?: number; pausedMs?: number; bonusMs?: number; penaltyMs?: number;
  acknowledgedNotices?: string[];
  automaticDeductionMap?: boolean; epochId?: string; deductions?: Deduction[]; endgame?: boolean; revealedStations?: Stop[];
  blockedCategories?: QuestionType[]; questionConfirmations?: {id: string; text: string}[];
  cardVersion?: 2; size?: GameSize; drawCount?: number; discardCount?: number; move?: CardRuntime['move'];
  rolls?: CardRuntime['rolls']; penalties?: CardRuntime['penalties']; doors?:CardRuntime['doors'];
  startedAt?:number; connected?:boolean; gameId: string; releaseId: string; role: Role; phase: GameState['phase']; elapsedMs: number; now: number; hideRemainingMs: number;
  proximityActive?:boolean; finalScoreMs?:number; ownFix: Fix | null; gpsIssue:string|null; canAsk: boolean; blockingReason: string; walking?: boolean; station?: Stop | null; provisionalStopId?: string | null; stops?: Stop[];
  questions: { epochId?:string; phase?: QuestionPhase; responseStartedAt?: number; answerPoi?: PublicPoi; manualTie?: boolean; measurement?: { first: Point; second?: Point; movement: number | null; remaining: number | null; canFinish: boolean }; id: string; definition: QuestionDefinition; state: QuestionInstance['state']; askedAt: number; deadline: number | null; answer?: string; error?: string; photoId?: string; draftPhotoId?:string; secondCaptured: boolean }[];
  availableQuestions: (QuestionDefinition & { reason: string })[];
  hand?: { instanceId: string; definition: CardDefinition }[]; handLimit?: number; overflow?: number; bonusSeconds?: number;
  rewards?: Reward[]; rewardCards?: Record<string, CardDefinition>; curses: Curse[]; events: GameEvent[];
}
