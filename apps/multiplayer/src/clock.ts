import { awaitingStart, transition, type GameEnvironment, type GameState } from '../../../packages/game-core/src/index';

export function clockRunning(game: GameState) {
  return !awaitingStart(game) && !['finished','settling','awaiting_capture_confirmation'].includes(game.phase);
}

export function nextDeadline(game: GameState) {
  if (!clockRunning(game)) return Infinity;
  const move = game.cardState?.move;
  const deadlines = [
    ...(game.phase === 'hiding' ? [game.hideDeadline] : []),
    ...(move?.stage === 'moving' ? [move.deadline] : []),
    ...game.questions.flatMap(q => q.state === 'pending' && q.definition.answerMode === 'automatic' && q.deadline !== null ? [q.deadline] : []),
    ...game.curses.flatMap(curse => [
      ...(curse.state === 'active' && !curse.effects && curse.expiresAt !== undefined ? [curse.expiresAt] : []),
      ...(curse.effects ?? []).flatMap(effect => effect.state === 'active' && effect.expiresAt !== undefined ? [effect.expiresAt] : []),
      ...(curse.hangman?.pendingResponse ? [curse.hangman.pendingResponse.deadline] : []),
      ...(curse.hangman?.cooldownUntil ? [curse.hangman.cooldownUntil] : []),
    ]),
    ...Object.values(game.fixes).map(fix => fix.at + game.rules.gpsMaxAgeMs + 1),
  ];
  return Math.min(Infinity, ...deadlines.filter(time => time > game.now));
}

export function advanceDeadlines(game: GameState, now: number, env: GameEnvironment) {
  while (nextDeadline(game) <= now) {
    const at = nextDeadline(game);
    game = transition(game, { id: `server:${game.id}:${at}`, at, actor: 'clock', command: { type: 'tick' } }, env);
    game.processedCommands.pop();
  }
  return game;
}
