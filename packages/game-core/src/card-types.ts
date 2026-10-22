import type { Point, QuestionType, Role } from './types';

export type GameSize = 'small' | 'medium' | 'large';
export type RollCondition = 'any' | 'even' | 'five_or_six';
export type CastingRequirement =
  | { id: string; kind: 'discard'; count: number; cardType?: 'time_bonus' | 'powerup' | 'curse' }
  | { id: string; kind: 'discard_hand' }
  | { id: string; kind: 'photo' | 'video' | 'physical' | 'outdoors' | 'off_transit' | 'special'; text: string }
  | { id: string; kind: 'roll'; count: 1 | 2; condition: RollCondition; noEffectWhen?: RollCondition }
  | { id: string; kind: 'geography'; subject: Role; reference: 'named_water' | 'caster'; minMeters?: number; maxMeters?: number; text: string };

/** Parameters belong to a versioned rule catalogue, never to a player command. */
export type CurseEffectSpec =
  | { kind: 'task'; text: string; proof: 'confirmation' | 'photo' | 'video'; blocksQuestions: boolean; minMedia?: number; approvalByHider?: boolean; minimumDurationSeconds?: number; rollCondition?: RollCondition; waitMs?: number }
  | { kind: 'round_obligation'; text: string; penaltySeconds: number | null; endsWithTask?: boolean }
  | { kind: 'timer'; text: string; durationMs: number; blocksQuestions: boolean }
  | { kind: 'reward_draw'; amount: number; questions: number; text: string }
  | { kind: 'block_questions'; questionIds: string[]; text: string }
  | { kind: 'block_category'; category: QuestionType | 'random'; text: string; rerollAfterQuestion?: boolean }
  | { kind: 'travel'; noTransit: boolean; confirmOutsideStation: boolean; text: string; endsWithTask?: boolean; preventBoarding?: boolean }
  | { kind: 'next_question'; confirmation: string; minDistanceFromCaster?: number; minWords?: number; text: string }
  | { kind: 'free_question'; questions:number; text:string }
  | { kind: 'door_gate'; durationMs: number; retryMs: number; text: string }
  | { kind: 'step_budget'; durationMs: number; text: string };

export interface CardMechanics {
  status: 'ready' | 'incomplete' | 'test_fixture';
  source: string;
  /** Null means the original text was NOT supplied. A summary is not a full translation. */
  fullTextEn: string | null;
  fullTextCs: string | null;
  missing: string[];
  castingCost: CastingRequirement[] | null;
  effects: CurseEffectSpec[];
  move?: { durationMs: number };
}
export type CurseStage = 'casting' | 'blocking' | 'ongoing' | 'timed' | 'until_round' | 'fulfilled' | 'ended' | 'failed';
export interface Evidence { id: string; kind: 'photo' | 'video'; by: Role; at: number; verification: 'player_supplied' }
export interface CastingProof {
  discardIds?: string[];
  confirmations?: string[];
  media?: Record<string, { id: string; kind: 'photo' | 'video' }>;
  rollIds?: Record<string, string>;
}
export interface CurseEffect {
  id: string; spec: CurseEffectSpec; state: 'waiting_task' | 'active' | 'awaiting_review' | 'fulfilled' | 'ended' | 'failed';
  expiresAt?: number; remainingQuestions?: number; selectedCategory?: QuestionType; startedAt?: number; submittedAt?: number; remainingSteps?: number;
}
export interface CurseSetup {animalCategory?:string;targetPoint?:Point;rockCount?:number;durationSeconds?:number;nextStopId?:string;questionIds?:string[];country?:string;secretWord?:string}
export interface MoveProcess {hunterPoint?:Point;cardId:string;origin:{id:string;name:string;point:Point};startedAt:number;deadline:number;stage:'moving'|'needs_destination'|'completed';endedAt?:number;destinationId?:string;candidates?:{id:string;name:string;point:Point}[]}
export interface CardRuntime {
  moveHistory:MoveProcess[];
  doors: {curseId:string;spaceId:string;rollId:string;passed:boolean;retryAt:number;at:number}[];
  copies: { instanceId: string; definitionId: string; sourceInstanceId: string; createdBy: string }[];
  rolls: { id: string; at: number; actor: Role; source: 'seeded_simulation' | 'manual';
    kind: 'dice' | 'category'; values: number[]; condition: RollCondition; passed: boolean;
    category?: QuestionType; usedBy?: string }[];
  penalties: { curseId: string; seconds: number | null; at: number; verification: 'player_confirmed' }[];
  move: MoveProcess | null;
}
