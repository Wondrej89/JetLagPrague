import {createHangman,endHangman,hangmanCommand,synchronizeHangman,updateHangmanTime} from './hangman';
import {nextDeductionEpoch} from './deductions';
import type { CardDefinition, Command, Curse, GameEnvironment, GameState, Fix, QuestionDefinition, QuestionInstance, Role } from './types';
import type { CastingProof, CurseEffect, RollCondition } from './card-types';
import { preparedEffects } from './curse-rules';
import { cardDefinition, nextRandom, pendingQuestion, validFix } from './engine';

function check(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
const event = (s: GameState, type: string, text: string, audience: Role | 'all' = 'all') => {
  s.events.push({ id: `${s.id}:event:${++s.sequence}`, at: s.now, type, text, audience });
};
export const activeCurse = (c: Curse) => !['casting', 'fulfilled', 'ended'].includes(c.state)&&(c.state!=='failed'||!!c.effects?.some(e=>['active','awaiting_review'].includes(e.state)));
export function refreshCurse(c: Curse) {
  if (!c.effects || c.state === 'casting') return;
  if(c.hangman){synchronizeHangman(c);return;}
  const taskDone=c.effects.some(e=>e.spec.kind==='task')&&c.effects.filter(e=>e.spec.kind==='task').every(e=>e.state==='fulfilled');
  if(taskDone)for(const e of c.effects)if(e.state==='waiting_task')e.state='active';
  if(taskDone)for(const e of c.effects)if(e.state==='active'&&(e.spec.kind==='travel'||e.spec.kind==='round_obligation')&&e.spec.endsWithTask)e.state='ended';
  const active = c.effects.filter(e => ['active','awaiting_review'].includes(e.state));
  c.blocksQuestions = active.some(e => (e.spec.kind === 'task' || e.spec.kind === 'timer') && e.spec.blocksQuestions);
  if (c.effects.some(e => e.state === 'failed')) c.state = 'failed';
  else if (c.blocksQuestions) c.state = 'blocking';
  else if (!active.length) c.state = c.effects.some(e => e.state === 'ended') ? 'ended' : 'fulfilled';
  else if (active.some(e => e.spec.kind === 'round_obligation')) c.state = c.effects.some(e => e.state === 'fulfilled') ? 'ongoing' : 'until_round';
  else if (active.some(e => e.expiresAt !== undefined)) c.state = 'timed';
  else c.state = 'ongoing';
}
function finishMove(s:GameState,stop:{id:string;name:string;point:[number,number]},endedAt:number,completionFix?:Fix,lockedAt=s.now){const m=s.cardState!.move!;s.station=structuredClone(stop);s.provisionalStopId=stop.id;m.stage='completed';m.destinationId=stop.id;m.endedAt=endedAt;if(m.version===2){m.lockedAt=lockedAt;m.completionFix=structuredClone(completionFix??s.fixes.hider);}event(s,'move_completed','Nové stanoviště bylo geograficky ověřeno a uzamčeno. Hledači mohou pokračovat.');event(s,'move_destination',`Nové stanoviště: ${stop.name}.`,'hider');}
export function updateCardTime(s: GameState,env:GameEnvironment) {
  const move=s.cardState?.move;
  if(move?.stage==='moving'&&s.now>=move.deadline){
    const fix=move.version===2?move.lastFix:s.fixes.hider;move.endedAt=move.deadline;
    move.candidates=validFix(fix,move.version===2?move.deadline:s.now,s.rules)&&env.insideArea(fix.point)?env.stops.filter(stop=>stop.id!==move.origin.id&&env.distance(fix.point,stop.point)<=s.rules.radiusMeters+1e-6):[];
    const selected=move.candidates.find(stop=>stop.id===move.selectedStopId);
    if(selected||move.candidates.length===1)finishMove(s,selected??move.candidates[0],move.deadline,fix,move.deadline);else{move.stage='needs_destination';event(s,'move_choice_required','Limit 20 minut přesunu skončil. Schovaný musí zvolit stanoviště způsobilé v rozhodný okamžik.','hider');}
  }
  for (const curse of s.curses) if (curse.effects && curse.state !== 'casting') {
    if(curse.hangman){updateHangmanTime(s,curse);continue;}
    for (const e of curse.effects) if (e.state === 'active' && e.expiresAt !== undefined && s.now >= e.expiresAt) {
      e.state = 'ended'; event(s, 'effect_ended', `Účinek skončil: ${curse.name}.`);
    }
    refreshCurse(curse);
  }
}
export function questionRestriction(s: GameState, q: QuestionDefinition, env: GameEnvironment, confirmations: string[] = [], ransomText=''): string {
  if (s.cardState?.move && s.cardState.move.stage !== 'completed') return 'Probíhá přesun stanoviště kartou Move.';
  for (const c of s.curses) if (activeCurse(c)) {
    if (c.blocksQuestions) return `Aktivní prokletí brání položení otázky: ${c.name}.`;
    for (const e of c.effects ?? []) if (['active','awaiting_review'].includes(e.state)) {
      const p = e.spec;
      if(p.kind==='block_category'&&p.rerollAfterQuestion&&!e.selectedCategory)return `${c.name}: hledači musí hodit kostkou pro zakázanou kategorii.`;
      if (p.kind === 'block_questions' && p.questionIds.includes(q.id)) return `${c.name}: tato otázka je zakázaná.`;
      if (p.kind === 'block_category' && (e.selectedCategory ?? p.category) === q.type) return `${c.name}: tato kategorie je zakázaná.`;
      if (p.kind === 'travel' && p.noTransit && !s.walking) return `${c.name}: v dopravním prostředku nelze položit otázku.`;
      if (p.kind === 'travel' && p.confirmOutsideStation && !confirmations.includes(e.id)) return `${c.name}: potvrďte, že nejste na vlakovém nádraží (ruční potvrzení).`;
      if (p.kind === 'next_question') {
        if(p.minWords!==undefined&&(ransomText.match(/\p{L}+/gu)?.length??0)<p.minWords)return `${c.name}: zapište souvislý text otázky alespoň o ${p.minWords} slovech.`;
        if (p.minDistanceFromCaster !== undefined) {
          if (!c.casterPoint || !validFix(s.fixes.hunter, s.now, s.rules)) return `${c.name}: vzdálenost nelze určit.`;
          if (env.distance(s.fixes.hunter.point, c.casterPoint) < p.minDistanceFromCaster) return `${c.name}: není splněna požadovaná vzdálenost.`;
        }
        if (!confirmations.includes(e.id)) return `${c.name}: ${p.confirmation} (ruční potvrzení, GPS tuto skutečnost neověřuje).`;
      }
    }
  }
  return '';
}
/** Called once, at successful question creation. Failed requests never consume effects. */
export function applyQuestionEffects(s: GameState, q: QuestionInstance, confirmations: string[]) {
  q.rewardModifierIds=[];
  for(const curse of s.curses)for(const e of curse.effects??[])if(e.state==='active'&&e.spec.kind==='free_question'&&(e.remainingQuestions??0)>0){q.definition.rewardPolicy=null;e.remainingQuestions!--;if(!e.remainingQuestions)e.state='fulfilled';}
  for (const c of s.curses) if (activeCurse(c)) {
    for (const e of c.effects ?? []) if (e.state === 'active') {
      if (e.spec.kind === 'reward_draw' && q.definition.rewardPolicy && (e.remainingQuestions ?? 0) > 0) {
        q.definition.rewardPolicy.draw += e.spec.amount;
        q.rewardModifierIds.push(e.id);
      }
      if(e.spec.kind==='block_category'&&e.spec.rerollAfterQuestion)delete e.selectedCategory;
      if (e.spec.kind === 'next_question') e.state = 'fulfilled';
      if (confirmations.includes(e.id)) event(s, 'player_confirmation', `${c.name}: podmínku otázky potvrdil hráč; nejde o senzorové ověření.`);
    }
    refreshCurse(c);
  }
}
export function consumeRewardEffects(s:GameState,q:QuestionInstance){for(const curse of s.curses){for(const effect of curse.effects??[])if(q.rewardModifierIds?.includes(effect.id)&&effect.spec.kind==='reward_draw'&&effect.state==='active'){effect.remainingQuestions!--;if(!effect.remainingQuestions)effect.state='fulfilled';}refreshCurse(curse);}}
export function previewRewardPolicy(s:GameState,q:QuestionDefinition){
 let policy=q.rewardPolicy?{...q.rewardPolicy}:null;
 for(const curse of s.curses)for(const e of curse.effects??[])if(e.state==='active'&&e.spec.kind==='free_question'&&(e.remainingQuestions??0)>0)policy=null;
 if(policy)for(const curse of s.curses)for(const e of curse.effects??[])if(e.state==='active'&&e.spec.kind==='reward_draw'&&(e.remainingQuestions??0)>0)policy.draw+=e.spec.amount;
 return policy;
}
function discard(s: GameState, ids: string[]) {
  check(new Set(ids).size === ids.length && ids.every(id => s.hand.includes(id)), 'Cena obsahuje chybějící nebo duplicitní kartu.');
  check(!s.curses.some(c => c.state === 'casting' && ids.includes(c.cardId)), 'Nejprve zrušte rozpracované sesílání této karty.');
  s.hand = s.hand.filter(id => !ids.includes(id)); s.discardPile.push(...ids);
}
function draw(s: GameState, count: number) {
  check(s.drawPile.length + s.discardPile.length >= count, 'Balíček nemá dostatek karet.');
  for (let n = 0; n < count; n++) {
    if (!s.drawPile.length) {
      s.drawPile = s.discardPile; s.discardPile = [];
      for (let i = s.drawPile.length - 1; i > 0; i--) {
        const j = Math.floor(nextRandom(s) * (i + 1)); [s.drawPile[i], s.drawPile[j]] = [s.drawPile[j], s.drawPile[i]];
      }
    }
    s.hand.push(s.drawPile.shift()!);
  }
}
export function playNewPowerup(s: GameState, card: CardDefinition, command: Extract<Command, { type: 'play_card' }>) {
  const runtime = s.cardState; check(runtime, 'Nový efekt vyžaduje verzi herního stavu 2.');
  check(!pendingQuestion(s) && !s.rewards.some(r => r.state === 'offered'), 'Nejprve dokončete rozpracovanou otázku nebo karetní nabídku.');
  check(!runtime.move || runtime.move.stage === 'completed', 'Nejprve dokončete Move.');
  if (card.effect === 'duplicate') {
    check(command.targetCardId && s.hand.includes(command.targetCardId), 'Vyberte kartu v ruce pro Duplicate.');
    const target = cardDefinition(s, command.targetCardId);
    const instanceId = `${target.id}@copy-${++s.sequence}`;
    runtime.copies.push({ instanceId, definitionId: target.id, sourceInstanceId: command.targetCardId, createdBy: command.cardId });
    s.hand.push(instanceId); event(s, 'card_duplicated', `Duplicate: ${target.name}.`, 'hider');
  } else if (card.effect === 'discard_1_draw_2' || card.effect === 'discard_2_draw_3') {
    const count = card.effect === 'discard_1_draw_2' ? 1 : 2, ids = command.discardIds ?? [];
    check(ids.length === count && !ids.includes(command.cardId), `Vyberte ${count} další karty jako cenu.`);
    discard(s, ids); draw(s, count + 1);
  } else if (card.effect === 'draw_1_expand_1') {
    draw(s, 1); s.effects.push({ cardId: command.cardId, value: 1, at: s.now,lifetime:'game' });
  } else if (card.effect === 'move') {
    check(s.phase === 'seeking' && s.station, 'Move vyžaduje uzamčené stanoviště.');
    check(!s.endgame, 'Move nelze zahrát během endgame.');
    check(card.mechanics?.move && card.mechanics.move.durationMs > 0, 'Move: chybí schválená doba a úplná pravidla přesunu.');
    check(validFix(s.fixes.hunter,s.now,s.rules),'Move vyžaduje aktuální přesnou GPS hledačů pro uzamčení jejich polohy.');
    discard(s,s.hand.filter(id=>id!==command.cardId));
    if(runtime.move)runtime.moveHistory.push(runtime.move);
    nextDeductionEpoch(s);
    runtime.move = {epochId:s.epochId,...(s.rules.moveVersion===2?{version:2 as const,...(validFix(s.fixes.hider,s.now,s.rules)?{lastFix:structuredClone(s.fixes.hider)}:{})}:{}),hunterPoint:[...s.fixes.hunter.point], cardId: command.cardId, origin: structuredClone(s.station), startedAt: s.now,
      deadline: s.now + card.mechanics.move.durationMs, stage: 'moving' };
    event(s, 'move_started', `Move: dosavadní zastávka schovaného je ${s.station.name}. Hledači se po dobu přesunu (nejvýše 20 minut) nesmí pohybovat. Čas schovaného je pozastaven.`);
  }
}
function payCost(s: GameState, curse: Curse, proof: CastingProof, env: GameEnvironment) {
  const card = cardDefinition(s, curse.cardId), requirements = card.mechanics?.castingCost;
  check(requirements, 'Casting cost není doložen; kartu nelze zahrát.');
  const ids = proof.discardIds ?? []; check(!ids.includes(curse.cardId), 'Samotná karta prokletí není cenou navíc.');
  const selected = ids.map(id => { check(s.hand.includes(id), 'Karta ceny není v ruce.'); return cardDefinition(s, id); });
  check(new Set(ids).size === ids.length, 'Kartu nelze zaplatit dvakrát.');
  let noEffect=false;
  const consumed = new Set<number>(); const usedRolls = new Set<string>();
  for (const cost of [...requirements].sort((a,b)=>Number(b.kind==='discard'&&!!b.cardType)-Number(a.kind==='discard'&&!!a.cardType))) {
    if (cost.kind === 'discard') {
      const matches = selected.map((c, i) => ({ c, i })).filter(({ c, i }) => !consumed.has(i) && (!cost.cardType || c.type === cost.cardType)).slice(0, cost.count);
      check(matches.length === cost.count, `Cena: odhodit ${cost.count} karet${cost.cardType ? ` typu ${cost.cardType}` : ''}.`);
      matches.forEach(({ i }) => consumed.add(i));
    } else if (cost.kind === 'discard_hand') {
      check(s.hand.filter(id => id !== curse.cardId).every(id => ids.includes(id)), 'Cena vyžaduje odhození celé zbývající ruky.'); selected.forEach((_, i) => consumed.add(i));
    } else if (cost.kind === 'photo' || cost.kind === 'video') {
      const media = proof.media?.[cost.id]; check(media?.kind === cost.kind && /^[a-zA-Z0-9:_-]{1,200}$/.test(media.id), `Cena vyžaduje ${cost.kind}: ${cost.text}`);
      curse.evidence!.push({ ...media, by: 'hider', at: s.now, verification: 'player_supplied' });
    } else if (cost.kind === 'roll') {
      const roll = s.cardState!.rolls.find(r => r.id === proof.rollIds?.[cost.id]);
      check(roll && !roll.usedBy && !usedRolls.has(roll.id) && roll.actor === 'hider' && roll.at >= curse.activatedAt && roll.values.length === cost.count && roll.condition === cost.condition && roll.passed, 'Chybí úspěšný, dosud nepoužitý hod pro cenu.');
      const first=s.cardState!.rolls.slice(curse.castRollStart??0).find(r=>!r.usedBy&&r.actor==='hider'&&r.kind==='dice'&&r.values.length===cost.count);check(first?.id===roll.id,'Cena musí použít první příslušný hod po zahájení sesílání.');
      if(cost.noEffectWhen&&rollPassed(roll.values,cost.noEffectWhen))noEffect=true;
      usedRolls.add(roll.id); roll.usedBy = curse.id;
    } else if (cost.kind === 'geography') {
      const fix = s.fixes[cost.subject]; check(validFix(fix, s.now, s.rules), 'Geografickou cenu nelze určit bez přesné aktuální GPS.');
      let meters: number;
      if (cost.reference === 'named_water') {
        const result = env.namedWaterDistance?.(fix.point); check(result?.state === 'known', 'Vzdálenost k pojmenované vodní ploše nelze určit.'); meters = result.meters;
      } else { check(curse.casterPoint, 'Chybí rozhodná poloha sesilatele.'); meters = env.distance(fix.point, curse.casterPoint); }
      check((cost.minMeters === undefined || meters >= cost.minMeters) && (cost.maxMeters === undefined || meters <= cost.maxMeters), `Nesplněná geografická cena: ${cost.text}`);
    } else {
      if (cost.kind === 'off_transit') check(s.walking, 'Hledači jsou podle svého stavu v dopravě.');
      check(proof.confirmations?.includes(cost.id), `Vyžaduje ruční potvrzení hráčem: ${cost.text}`);
      event(s, 'casting_confirmation', `${card.name}: hráč potvrdil podmínku „${cost.text}“; nejde o senzorově ověřenou skutečnost.`);
    }
  }
  check(consumed.size === ids.length, 'Cena obsahuje karty nad rámec požadované ceny.');
  discard(s, ids);return noEffect;
}
function activate(s: GameState, curse: Curse, env:GameEnvironment, noEffect=false) {
  const specs=preparedEffects(s,cardDefinition(s,curse.cardId).id,curse.setup??{},env);
  curse.effects = specs.map((spec, i): CurseEffect => {
    const effect: CurseEffect = { id: `${curse.id}:effect:${i}`, spec: structuredClone(spec), state: spec.kind==='round_obligation'&&!spec.endsWithTask&&specs.some(e=>e.kind==='task')?'waiting_task':'active' };
    if (spec.kind === 'timer'||spec.kind==='door_gate'||spec.kind==='step_budget') effect.expiresAt = s.now + spec.durationMs;
    if(spec.kind==='step_budget')effect.remainingSteps=0;
    if (spec.kind === 'reward_draw'||spec.kind==='free_question') effect.remainingQuestions = spec.questions;
    if (spec.kind === 'block_category' && spec.category === 'random'&&!spec.rerollAfterQuestion) {
      const categories = [...new Set(s.rules.questions.filter(q => q.configured !== false).map(q => q.type))].sort();
      check(categories.length, 'Není dostupná kategorie pro náhodný výběr.');
      effect.selectedCategory = categories[Math.floor(nextRandom(s) * categories.length)];
      s.cardState!.rolls.push({ id: `${s.id}:roll:${++s.sequence}`, at: s.now, actor: 'hider', source: 'seeded_simulation', kind: 'category', values: [], condition: 'any', passed: true, category: effect.selectedCategory, usedBy: curse.id });
    }
    return effect;
  });
  if(noEffect)for(const e of curse.effects)e.state='ended';
  curse.state = 'ongoing'; curse.activatedAt = s.now;
  if(s.rules.hangmanVersion===1&&cardDefinition(s,curse.cardId).id==='curse-hidden-hangman')createHangman(curse,s);
  refreshCurse(curse);
  s.hand = s.hand.filter(id => id !== curse.cardId); s.discardPile.push(curse.cardId);
  event(s, noEffect?'curse_no_effect':'curse_activated', noEffect?`${curse.name}: casting hod znamená nulový účinek; karta byla spotřebována.`:`Aktivní prokletí: ${curse.name}.`);
}
export function cardCommand(s: GameState, c: Command, env: GameEnvironment, actor: Role | 'clock'): boolean {
  if(hangmanCommand(s,c,actor))return true;
  if (!['begin_cast', 'cancel_cast', 'confirm_cast', 'complete_curse_task', 'violate_curse', 'roll', 'complete_move','verify_curse_task','start_curse_visit','guess_letter','curse_roll','attempt_door','enter_space','steps_taken'].includes(c.type)) return false;
  check(s.cardState && s.version === 2, 'Tato akce vyžaduje novou karetní konfiguraci.');
  check(s.mode === 'simulation', 'V ostré hře tuto akci musí vyhodnotit autoritativní server.');
  if (c.type === 'begin_cast') {
    check(s.phase === 'seeking' && !pendingQuestion(s) && !s.rewards.some(r => r.state === 'offered'), 'Nejprve dokončete hledání stanoviště, otázku nebo karetní akci.');
    check(s.hand.includes(c.cardId), 'Karta není v ruce.'); const card = cardDefinition(s, c.cardId);
    check(card.effect === 'curse' && card.mechanics?.status !== 'incomplete' && card.mechanics?.castingCost && card.mechanics.effects.length, 'Work in progress – chybí úplná pravidla a casting cost prokletí.');
    check(!s.curses.some(x => x.state === 'casting' || activeCurse(x) && x.cardId === c.cardId), 'Již probíhá sesílání nebo účinek stejné instance.');
    preparedEffects(s,card.id,c.setup??{},env);
    s.curses.push({ id: `${s.id}:curse:${++s.sequence}`, cardId: c.cardId, name: card.name, description: card.mechanics?.fullTextCs??card.description, icon: card.icon,
      activatedAt: s.now, condition: card.description, blocksQuestions: false, manual: true, target: 'hunter', state: 'casting', effects: [], evidence: [], setup:structuredClone(c.setup??{}),castRollStart:s.cardState.rolls.length,guesses:[],
      ...(validFix(s.fixes.hider, s.now, s.rules) ? { casterPoint: [...s.fixes.hider.point] } : {}) });
    event(s, 'casting_started', `Příprava seslání: ${card.name}. Karta dosud nebyla spotřebována.`, 'hider');
  } else if (c.type === 'cancel_cast') {
    const curse = s.curses.find(x => x.id === c.curseId); check(curse?.state === 'casting', 'Sesílání není rozpracované.'); curse.state = 'ended';
  } else if (c.type === 'confirm_cast') {
    const curse = s.curses.find(x => x.id === c.curseId); check(curse?.state === 'casting' && s.hand.includes(curse.cardId), 'Sesílání není rozpracované nebo karta chybí.');
    check(!pendingQuestion(s),'Nejprve dokončete otázku.');
    // Casting is an atomic activation: geographical costs use current, reliable fixes.
    if(validFix(s.fixes.hider,s.now,s.rules))curse.casterPoint=[...s.fixes.hider.point];else delete curse.casterPoint;
    const noEffect=payCost(s, curse, c.proof, env); activate(s, curse, env, noEffect);
  } else if (c.type === 'complete_curse_task' || c.type === 'violate_curse') {
    const curse = s.curses.find(x => x.id === c.curseId), effect = curse?.effects?.find(e => e.id === c.effectId);
    check(!curse?.hangman,'Hangman se vyhodnocuje vlastními pravidly; ruční splnění není povoleno.');
    check(curse && effect?.state === 'active' && c.confirmed === true, 'Úkol vyžaduje výslovné potvrzení hráče.');
    if (c.type === 'complete_curse_task') {
      check(effect.spec.kind === 'task', 'Průběžnou povinnost nelze ukončit splněním úvodního úkolu.');
      check(effect.spec.waitMs===undefined||effect.startedAt!==undefined&&s.now>=effect.startedAt+effect.spec.waitMs,'Nejprve potvrďte příchod a vyčkejte předepsanou dobu na místě.');
      if(effect.spec.rollCondition){const roll=s.cardState.rolls.find(r=>r.id===c.rollId);check(roll&&roll.actor==='hunter'&&!roll.usedBy&&roll.at>=curse.activatedAt&&roll.values.length===1&&rollPassed(roll.values,effect.spec.rollCondition),'Úkol vyžaduje nepoužitý hod 5 nebo 6 a ruční potvrzení celé 30m dráhy.');roll.usedBy=curse.id;}
      if(effect.spec.minimumDurationSeconds!==undefined)check(c.durationSeconds!==undefined&&c.durationSeconds>=effect.spec.minimumDurationSeconds,'Potvrzená souvislá délka záběru nesplňuje požadovaný čas.');
      if (effect.spec.proof !== 'confirmation') {
        const proofKind=effect.spec.proof,items=c.mediaItems??(c.media?[c.media]:[]);check(items.length>=(effect.spec.minMedia??1)&&new Set(items.map(m=>m.id)).size===items.length&&items.every(m=>m.kind===proofKind&&/^[a-zA-Z0-9:_-]{1,200}$/.test(m.id)),'Úkol vyžaduje příslušný počet samostatných fotografií nebo videí.');
        curse.evidence!.push(...items.map(m=>({...m,by:'hunter' as const,at:s.now,verification:'player_supplied' as const})));
      }
      effect.state = effect.spec.approvalByHider?'awaiting_review':'fulfilled';effect.submittedAt=s.now; event(s, 'task_confirmed', `${curse.name}: úkol potvrdil hráč, bez automatického ověření obsahu.`);
    } else {
      check(effect.spec.kind === 'round_obligation', 'Tento efekt není průběžná povinnost.'); effect.state = 'failed';
      s.cardState.penalties.push({ curseId: curse.id, seconds: effect.spec.penaltySeconds, at: s.now, verification: 'player_confirmed' });
      event(s, 'curse_violated', `${curse.name}: hráč oznámil porušení povinnosti. ${effect.spec.penaltySeconds === null ? 'Výši penalizace nelze určit.' : `Penalizace ${effect.spec.penaltySeconds} s.`}`);
    }
    refreshCurse(curse);
  } else if (c.type === 'roll') {
    check(actor !== 'clock' && [1, 2].includes(c.count) && ['any', 'even', 'five_or_six'].includes(c.condition), 'Neplatný hod.');
    const values = c.manualValues ?? Array.from({ length: c.count }, () => 1 + Math.floor(nextRandom(s) * 6));
    check(values.length === c.count && values.every(n => Number.isInteger(n) && n >= 1 && n <= 6), 'Kostka musí mít celé číslo 1 až 6.');
    const passed = rollPassed(values, c.condition);
    s.cardState.rolls.push({ id: `${s.id}:roll:${++s.sequence}`, at: s.now, actor, source: c.manualValues ? 'manual' : 'seeded_simulation', kind: 'dice', values, condition: c.condition, passed });
    event(s, 'dice_roll', `Hod ${values.join(' + ')} · ${c.manualValues ? 'ruční vstup hráče' : 'seedovaná simulace'} · ${passed ? 'podmínka splněna' : 'podmínka nesplněna'}.`, actor);
  } else if(c.type==='verify_curse_task'){
    const curse=s.curses.find(x=>x.id===c.curseId),e=curse?.effects?.find(e=>e.id===c.effectId);
    check(!curse?.hangman,'Výsledek Hangmana vyhodnocuje jádro.');check(curse&&e?.state==='awaiting_review'&&e.spec.kind==='task'&&e.spec.approvalByHider,'Úkol nečeká na ověření schovaným.');
    e.state=c.verified?'fulfilled':'active';refreshCurse(curse);event(s,'task_reviewed',`${curse.name}: schovaný ${c.verified?'potvrdil':'odmítl'} splnění úkolu. Ruční posouzení důkazu.`);
  } else if(c.type==='start_curse_visit'){
    const curse=s.curses.find(x=>x.id===c.curseId),e=curse?.effects?.find(e=>e.id===c.effectId);
    check(curse&&e?.state==='active'&&e.spec.kind==='task'&&e.spec.waitMs!==undefined&&c.confirmed,'Příchod vyžaduje ruční potvrzení hráče.');
    check(e.startedAt===undefined,'Pobyt již začal.');e.startedAt=s.now;event(s,'visit_started',`${curse.name}: hráč potvrdil příchod na určené místo; nejde o automatické ověření hranice areálu.`);
  } else if(c.type==='guess_letter'){
    const curse=s.curses.find(x=>x.id===c.curseId);check(curse?.setup?.secretWord&&curse.effects?.some(e=>e.state==='active'&&e.spec.kind==='task'),'Šibenice není aktivní.');
    const letter=c.letter.toLocaleUpperCase('cs');check(/^\p{L}$/u.test(letter),'Zadejte jedno písmeno.');check(!curse.guesses?.includes(letter),'Písmeno již bylo použito.');
    (curse.guesses??=[]).push(letter);event(s,'hangman_guess',`Šibenice: písmeno ${letter}. Výsledek hry ověřuje schovaný; počet povolených chyb není v dodaném textu určen.`);
  } else if(c.type==='curse_roll'||c.type==='attempt_door'){
    const curse=s.curses.find(x=>x.id===c.curseId),e=curse?.effects?.find(e=>e.id===c.effectId),r=s.cardState.rolls.find(r=>r.id===c.rollId);
    check(curse&&e?.state==='active'&&r&&r.actor==='hunter'&&!r.usedBy&&r.kind==='dice'&&r.at>=curse.activatedAt,'Chybí nepoužitý hod hledačů pro aktivní účinek.');
    if(c.type==='attempt_door'){
      check(e.spec.kind==='door_gate'&&r.values.length===2&&c.spaceId.trim().length>0&&c.spaceId.length<=200,'Vstup vyžaduje dvě kostky a označení celého cílového prostoru.');
      const previous=s.cardState.doors.filter(d=>d.curseId===curse.id&&d.spaceId===c.spaceId).at(-1);
      check(!previous||previous.passed||s.now>=previous.retryAt,'Stejný prostor nelze zatím znovu zkusit, ani jinými dveřmi.');
      const passed=r.values.reduce((a,b)=>a+b,0)>=7;s.cardState.doors.push({curseId:curse.id,spaceId:c.spaceId,rollId:r.id,passed,retryAt:s.now+e.spec.retryMs,at:s.now});
      event(s,'door_attempt',`${curse.name}: ${c.spaceId} · součet ${r.values.reduce((a,b)=>a+b,0)} · ${passed?'vstup povolen':'vstup zakázán do dalšího povoleného pokusu'}.`);
    }else if(e.spec.kind==='block_category'&&e.spec.rerollAfterQuestion){
      check(!e.selectedCategory&&r.values.length===1,'Kategorie je již určena; další hod patří až k další otázce.');
      e.selectedCategory=(['matching','measuring','radar','thermometer','tentacles','photo'] as const)[r.values[0]-1];event(s,'category_roll',`Spotty Memory: zakázaná kategorie ${e.selectedCategory}.`);
    }else if(e.spec.kind==='step_budget'){
      check(r.values.length===1&&(e.remainingSteps??0)===0,'Před dalším hodem dokončete aktuální povolené kroky.');e.remainingSteps=r.values[0];event(s,'step_budget',`Povoleno ${e.remainingSteps} kroků podle hodu. Fyzické kroky hlásí hráč.`);
    }else throw new Error('Pro tento účinek není hod určen.');
    r.usedBy=curse.id;
  } else if(c.type==='enter_space'){
    const curse=s.curses.find(x=>x.id===c.curseId);check(curse&&curse.effects?.some(e=>e.state==='active'&&e.spec.kind==='door_gate')&&c.confirmed,'Vstup vyžaduje aktivní kontrolu a potvrzení hráče.');
    const attempt=s.cardState.doors.filter(d=>d.curseId===curse.id&&d.spaceId===c.spaceId).at(-1);check(attempt?.passed,'Vstup nebyl povolen úspěšným hodem.');
    // Each actual entry needs its own roll, even if this space was entered earlier.
    attempt.passed=false;attempt.retryAt=s.now;event(s,'space_entered',`${curse.name}: hráč potvrdil vstup do ${c.spaceId}.`);
  } else if(c.type==='steps_taken'){
    const curse=s.curses.find(x=>x.id===c.curseId),e=curse?.effects?.find(e=>e.id===c.effectId);
    check(e?.state==='active'&&e.spec.kind==='step_budget'&&c.confirmed&&Number.isInteger(c.count)&&c.count>0&&c.count<=(e.remainingSteps??0),'Počet kroků není povolen aktuálním hodem.');e.remainingSteps!-=c.count;event(s,'steps_reported',`Hráč ručně oznámil ${c.count} kroků; zbývá ${e.remainingSteps}.`);
  } else if (c.type === 'complete_move') {
    const move=s.cardState.move;if(move?.stage==='completed'&&c.confirmed&&move.destinationId===c.stopId)return true;check(move&&move.stage!=='completed'&&c.confirmed===true,'Přesun není rozpracovaný nebo chybí potvrzení.');
    let stop=env.stops.find(x=>x.id===c.stopId);check(stop&&stop.id!==move.origin.id,'Vyberte jiné stanoviště.');
    if(move.stage==='needs_destination'){stop=move.candidates?.find(x=>x.id===c.stopId);check(stop,'Zastávka nebyla způsobilá při vypršení 20 minut. Bez spolehlivé polohy nelze cíl odhadnout.');}
    else {const fix=s.fixes.hider;check(validFix(fix,s.now,s.rules)&&env.insideArea(fix.point)&&env.distance(fix.point,stop.point)<=s.rules.radiusMeters+1e-6,'Cíl přesunu není ověřen přesnou aktuální GPS v povoleném okruhu.');}
    if(move.version===2 && move.stage==='moving'){move.selectedStopId=stop.id;move.selectionFix=structuredClone(s.fixes.hider);move.selectedAt=s.now;event(s,'move_selected','Nové stanoviště bylo předběžně potvrzeno; uzamkne se po uplynutí 20 minut.','hider');}
    else {if(move.version===2){const fix=s.fixes.hider;check(validFix(fix,s.now,s.rules)&&env.insideArea(fix.point)&&env.distance(fix.point,stop.point)<=s.rules.radiusMeters+1e-6,'Potvrzení cíle vyžaduje aktuální GPS v povoleném 400m okruhu.');}finishMove(s,stop,move.endedAt??s.now,s.fixes.hider,s.now);}
  }
  return true;
}
export function rollPassed(values: number[], condition: RollCondition) {
  const total = values.reduce((a, b) => a + b, 0);
  return condition === 'any' || (condition === 'even' ? total % 2 === 0 : total === 5 || total === 6);
}
export function finishCardEffects(s: GameState) {
  for (const curse of s.curses) if (curse.effects) {
    if(curse.hangman&&curse.hangman.state!=='won'&&curse.hangman.state!=='cancelled'){endHangman(s,curse,'round_ended');continue;}
    for (const effect of curse.effects) if (['waiting_task','active','awaiting_review'].includes(effect.state)) effect.state = 'ended';
    if (curse.state === 'casting') curse.state = 'ended'; else refreshCurse(curse);
  }
}
