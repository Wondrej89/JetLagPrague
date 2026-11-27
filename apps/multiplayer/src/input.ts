import { z } from 'zod';
import { PUBLIC_GAME_SIZE } from '../../../packages/game-core/src/room-protocol';
import type { Command } from '../../../packages/game-core/src/types';
import { setupSchema } from '../../../packages/game-core/src/card-schemas';
import { RequestError } from './http';

export const codeSchema = z.string().regex(/^[A-Z]{4}$/);
export const roomIdSchema = z.uuid();
const id = z.string().min(1).max(300);
const text = z.string().max(1000);
const ids = z.array(id).max(100);
const role = z.enum(['hunter','hider']);
export const fixSchema = z.object({
  point: z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]),
  at: z.number().nonnegative(), accuracy: z.number().nonnegative(),
  speed: z.number().nonnegative().nullable().optional(),
}).strict();
export const founderSchema = z.object({ fix: fixSchema, size: z.literal(PUBLIC_GAME_SIZE).optional() }).strict();
export const recoverySchema = z.object({ roomId: roomIdSchema, secret: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict();
const noFields = z.object({}).strict();
const confirmed = z.object({ confirmed: z.boolean() }).strict();
const stop = z.object({ stopId: id }).strict();
const card = z.object({ cardId: id }).strict();
const curse = z.object({ curseId: id }).strict();
const effect = curse.extend({ effectId: id });
const confirmation = effect.extend({ confirmed: z.boolean() });
const media = z.object({ id: z.uuid(), kind: z.enum(['photo','video']) }).strict();
const questionConfirmations = z.object({ confirmations: ids.optional(), ransomText: text.optional() }).strict();

const fields = {
  set_team_name: z.object({ name: z.string().min(1).max(100) }).strict(),
  report_found: noFields,
  respond_found: z.object({ claimId: id, accepted: z.boolean() }).strict(),
  answer_settlement_check: z.object({ checkId: id, answer: z.enum(['fulfilled','violated','not_applicable']) }).strict(),
  finalize_round: confirmed, next_round: confirmed,
  map_consent: z.object({ enabled: z.boolean() }).strict(), ready: noFields,
  acknowledge_notice: z.object({ eventId: id }).strict(),
  set_hangman_word: curse.extend({ word: z.string().max(100), manuallyConfirmed: z.boolean() }),
  respond_hangman: curse.extend({ responseId: id }),
  declare_endgame: confirmed,
  location: z.object({ role, fix: fixSchema.nullable() }).strict(),
  walking: z.object({ value: z.boolean() }).strict(),
  select_station: stop, lock_station: stop,
  prepare_matching: questionConfirmations.extend({ questionId: id, retry: z.boolean().optional() }),
  correct_matching_reference: z.object({ name: text, preparationId: id.optional(), questionId: id.optional() }).strict(),
  ask: questionConfirmations.extend({ questionId: id, preparationId: id.optional() }),
  second_measurement: questionConfirmations,
  resolve_thermometer_tie: confirmed.extend({ answer: z.enum(['TEPLEJI','CHLADNĚJI']), note: text }),
  attach_photo: z.object({ photoId: z.uuid() }).strict(),
  answer: z.object({ answer: text.optional(), photoId: z.uuid().optional(), matchingVerified: z.boolean().optional() }).strict(),
  draw_reward: z.object({ rewardId: id }).strict(),
  keep_reward: z.object({ rewardId: id, cardId: id.optional(), cardIds: ids.optional() }).strict(),
  play_card: card.extend({ targetCardId: id.optional(), discardIds: ids.optional() }),
  begin_cast: card.extend({ setup: setupSchema.optional() }), cancel_cast: curse,
  confirm_cast: curse.extend({ proof: z.object({
    discardIds: ids.optional(), confirmations: ids.optional(),
    media: z.record(id, media).optional(), rollIds: z.record(id,id).optional(),
  }).strict() }),
  complete_curse_task: confirmation.extend({
    media: media.optional(), mediaItems: z.array(media).max(10).optional(),
    durationSeconds: z.number().nonnegative().max(86400).optional(), rollId: id.optional(),
  }),
  verify_curse_task: effect.extend({ verified: z.boolean() }), start_curse_visit: confirmation,
  guess_letter: curse.extend({ letter: z.string().max(5) }),
  curse_roll: effect.extend({ rollId: id }),
  attempt_door: curse.extend({ spaceId: id, rollId: id }),
  enter_space: curse.extend({ spaceId: id, confirmed: z.boolean() }),
  steps_taken: confirmation.extend({ count: z.number().int().min(1).max(1000) }),
  violate_curse: confirmation,
  roll: z.object({ count: z.union([z.literal(1), z.literal(2)]), condition: z.enum(['any','even','five_or_six']) }).strict(),
  complete_move: stop.extend({ confirmed: z.boolean() }),
  discard_card: card, fulfill_curse: curse,
} satisfies Record<Exclude<Command['type'],'tick'|'finish'>, z.ZodType>;

export function parse<T>(schema: z.ZodType<T>, value: unknown, error: string): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new RequestError(400, error);
  return result.data;
}

export function parseCommand(input: unknown) {
  const { id, gameId, command } = parse(z.object({ id: z.uuid(), gameId: z.string().max(300), command: z.object({ type: z.string() }).passthrough() }).strict(),
    input, 'Neplatná obálka herního příkazu.');
  const { type, ...payload } = command;
  if (!Object.hasOwn(fields, type)) throw new RequestError(400, 'Tento hráčský příkaz server nepřijímá.');
  const action = { type, ...parse<Record<string,unknown>>(fields[type as keyof typeof fields], payload, 'Neplatné údaje herního příkazu.') } as Command;
  return { id, gameId, action };
}

export function mediaReferences(action: Command) {
  if (action.type === 'attach_photo' || action.type === 'answer')
    return action.photoId ? [{ id: action.photoId, kind: 'photo' }] : [];
  if (action.type === 'confirm_cast') return Object.values(action.proof.media ?? {});
  if (action.type === 'complete_curse_task') return [...(action.media ? [action.media] : []), ...(action.mediaItems ?? [])];
  return [];
}
