import type {Deduction, GameState, QuestionInstance} from './types';

/** Public constraints only. Never copy targetPoint, the hidden fix or resolver diagnostics. */
export function deductionFromQuestion(state: Pick<GameState, 'id'|'releaseId'|'epochId'>, q: QuestionInstance): Deduction | null {
  if(q.state !== 'answered' || !q.answer || q.answeredAt === undefined || q.manualResolution) return null;
  const source = q.definition;
  const supported = source.resolver === 'radar' && ['ANO','NE'].includes(q.answer)
    || source.resolver === 'poi_measuring' && ['BLÍŽ','DÁL'].includes(q.answer)
    || ['poi_matching','same_area'].includes(source.resolver) && ['ANO','NE'].includes(q.answer)
    || source.resolver === 'thermometer' && !!q.secondFix && ['TEPLEJI','CHLADNĚJI'].includes(q.answer);
  if(!supported) return null;
  return {
    id: `${q.id}:deduction`, questionId: q.id, epochId: q.epochId ?? state.epochId ?? `${state.id}:epoch:0`,
    releaseId: state.releaseId, geometryTarget: source.target,
    operation: ['NE','DÁL','CHLADNĚJI'].includes(q.answer) ? 'exclude' : 'include',
    sourceType: source.type as Deduction['sourceType'], result: q.answer, createdAt: q.answeredAt, status: 'active',
    parameters: {definitionId:source.id, resolver:source.resolver, category:source.category,
      hunterPoint:[...q.hunterFix.point], ...(q.secondFix ? {secondPoint:[...q.secondFix.point]} : {}),
      ...(source.radiusMeters === undefined ? {} : {radiusMeters:source.radiusMeters}),
      ...(source.minMoveMeters === undefined ? {} : {minMoveMeters:source.minMoveMeters}),
      toleranceMeters:source.type === 'thermometer' ? source.toleranceMeters ?? 1 : 0.000001,
      ...(source.distanceMode ? {distanceMode:source.distanceMode} : {})},
  };
}
export function recordDeduction(state:GameState,q:QuestionInstance) {
  if(!state.rules.automaticDeductionMap) return;
  const deduction=deductionFromQuestion(state,q);
  if(deduction && !state.deductions?.some(d=>d.id===deduction.id)) (state.deductions ??= []).push(deduction);
}
export function nextDeductionEpoch(state:GameState) {
  for(const deduction of state.deductions ?? []) deduction.status='archived';
  state.epochId=`${state.id}:epoch:${++state.sequence}`;
}
