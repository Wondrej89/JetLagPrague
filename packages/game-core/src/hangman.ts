import {z} from 'zod';
import type {Command,Curse,GameState,Role} from './types';
export interface HangmanAttempt {id:string;secretWord?:string;startedAt:number;guesses:{letter:string;at:number;correct:boolean}[];outcome:'playing'|'won'|'lost';endedAt?:number}
export interface HangmanState {
 version:1;curseId:string;secretWord?:string;revealed:string[];guessedLetters:string[];wrongGuesses:number;maxWrongGuesses:7;
 losses:number;lossLimit:3;cooldownUntil?:number;state:'awaiting_word'|'guessing'|'won'|'cooldown'|'cancelled';
 history:HangmanAttempt[];pendingResponse?:{id:string;letter:string;guessedAt:number;deadline:number};
 responseTimeout?:{id:string;letter:string;guessedAt:number;deadline:number};resolution?:'guessed'|'loss_limit'|'response_timeout'|'round_ended';manualResponses:boolean;wordValidation:'manual_confirmation';
}
const time=z.number().finite().nonnegative(),letter=z.string().max(4),id=z.string().min(1).max(300);
export const hangmanSchema=z.object({version:z.literal(1),curseId:id,secretWord:z.string().optional(),revealed:z.array(letter).length(5),guessedLetters:z.array(letter).max(40),wrongGuesses:z.number().int().min(0).max(7),maxWrongGuesses:z.literal(7),losses:z.number().int().min(0).max(3),lossLimit:z.literal(3),cooldownUntil:time.optional(),state:z.enum(['awaiting_word','guessing','won','cooldown','cancelled']),history:z.array(z.object({id,secretWord:z.string().optional(),startedAt:time,guesses:z.array(z.object({letter,at:time,correct:z.boolean()}).strict()).max(40),outcome:z.enum(['playing','won','lost']),endedAt:time.optional()}).strict()).max(3),pendingResponse:z.object({id,letter,guessedAt:time,deadline:time}).strict().optional(),responseTimeout:z.object({id,letter,guessedAt:time,deadline:time}).strict().optional(),resolution:z.enum(['guessed','loss_limit','response_timeout','round_ended']).optional(),manualResponses:z.boolean(),wordValidation:z.literal('manual_confirmation')}).strict();
const alphabet=/^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+$/u;
export function normalizeCzech(value:string){return value.normalize('NFC').trim().toLocaleUpperCase('cs-CZ');}
export function isCzechWord(value:string){const normalized=value.normalize('NFC').trim(),word=normalizeCzech(value);return /^[A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽa-záčďéěíňóřšťúůýž]{5}$/u.test(normalized)&&[...word].length===5&&alphabet.test(word);}
function check(value:unknown,message:string):asserts value{if(!value)throw new Error(message);}
function emit(s:GameState,type:string,text:string){s.events.push({id:`${s.id}:event:${++s.sequence}`,at:s.now,type,text,audience:'all'});}
export function createHangman(c:Curse,s:GameState){
 c.hangman={version:1,curseId:c.id,revealed:Array(5).fill(''),guessedLetters:[],wrongGuesses:0,maxWrongGuesses:7,losses:0,lossLimit:3,state:'awaiting_word',history:[],manualResponses:s.rules.manualHangmanResponses??false,wordValidation:'manual_confirmation'};
 if(c.setup)delete c.setup.secretWord;synchronizeHangman(c);
}
export function synchronizeHangman(c:Curse){
 const h=c.hangman;if(!h)return;const done=h.state==='won'||h.state==='cancelled';c.blocksQuestions=!done;c.manual=false;c.state=done?'fulfilled':'blocking';
 if(done)for(const e of c.effects??[])e.state=e.spec.kind==='travel'?'ended':'fulfilled';
}
export function endHangman(s:GameState,c:Curse,resolution:NonNullable<HangmanState['resolution']>){
 const h=c.hangman!;h.state=resolution==='guessed'?'won':'cancelled';h.resolution=resolution;if(resolution==='response_timeout'&&h.pendingResponse)h.responseTimeout=structuredClone(h.pendingResponse);delete h.pendingResponse;delete h.cooldownUntil;synchronizeHangman(c);
 emit(s,'hangman_ended',resolution==='guessed'?'Hledači uspěli. Prokletí bylo zrušeno.':resolution==='loss_limit'?'Hangman: tři prohry a poslední desetiminutové čekání skončily. Prokletí bylo zrušeno.':resolution==='response_timeout'?'Hangman: schovaný neodpověděl do 30 sekund. Prokletí bylo zrušeno.':'Hangman skončil s kolem.');
}
export function updateHangmanTime(s:GameState,c:Curse){
 const h=c.hangman;if(!h)return;
 if(h.pendingResponse&&s.now>=h.pendingResponse.deadline)endHangman(s,c,'response_timeout');
 else if(h.state==='cooldown'&&h.cooldownUntil!==undefined&&s.now>=h.cooldownUntil){
  if(h.losses>=h.lossLimit)endHangman(s,c,'loss_limit');else{h.state='awaiting_word';delete h.secretWord;delete h.cooldownUntil;h.revealed=Array(5).fill('');h.guessedLetters=[];h.wrongGuesses=0;emit(s,'hangman_word_required','Hangman: čekání skončilo. Schovaný musí zadat nové tajné pětipísmenné slovo.');}
 }
 synchronizeHangman(c);
}
function evaluate(s:GameState,c:Curse,letter:string){
 const h=c.hangman!,attempt=h.history.at(-1)!;check(h.secretWord,'Chybí soukromé slovo.');const correct=h.secretWord.includes(letter);
 h.guessedLetters.push(letter);attempt.guesses.push({letter,at:s.now,correct});h.revealed=[...h.secretWord].map(l=>h.guessedLetters.includes(l)?l:'');
 if(!correct)h.wrongGuesses++;emit(s,'hangman_guess',`Hangman: písmeno ${letter} · ${correct?'správně':'chyba'} · chyby ${h.wrongGuesses}/7.`);
 if(h.revealed.every(Boolean)){attempt.outcome='won';attempt.endedAt=s.now;endHangman(s,c,'guessed');}
 else if(h.wrongGuesses===7){attempt.outcome='lost';attempt.endedAt=s.now;h.losses++;h.state='cooldown';h.cooldownUntil=s.now+10*60000;emit(s,'hangman_lost',`Hledači prohráli Hangmana. Prohry: ${h.losses}/3. Další pokus nebo zrušení až po 10 minutách.`);}
 synchronizeHangman(c);
}
export function hangmanCommand(s:GameState,c:Command,actor:Role|'clock'):boolean {
 if(!['set_hangman_word','guess_letter','respond_hangman'].includes(c.type))return false;
 if(c.type!=='set_hangman_word'&&c.type!=='guess_letter'&&c.type!=='respond_hangman')return false;
 check(s.mode==='simulation','Hangman v ostré hře vyžaduje autoritativní server.');
 const curse=s.curses.find(p=>p.id===c.curseId);if(c.type==='guess_letter'&&!curse?.hangman)return false;
 check(curse?.hangman,'Typovaný Hangman není aktivní.');const h=curse.hangman;
 if(c.type==='set_hangman_word'){
  check(actor==='hider'&&h.state==='awaiting_word','Nové slovo lze zadat jen při čekání na slovo po skončení cooldownu.');
  check(isCzechWord(c.word),'Zadejte přesně 5 českých písmen. Diakritika se rozlišuje; CH jsou dvě pozice.');
  check(c.manuallyConfirmed===true,'Slovník není dodán. Schovaný musí výslovně potvrdit platnost českého slova.');
  h.secretWord=normalizeCzech(c.word);h.state='guessing';h.history.push({id:`${curse.id}:attempt:${h.history.length+1}`,secretWord:h.secretWord,startedAt:s.now,guesses:[],outcome:'playing'});emit(s,'hangman_started','Hangman: tajné slovo bylo zadáno. Hledači mohou hádat písmena.');
 }else if(c.type==='guess_letter'){
  check(actor==='hunter'&&h.state==='guessing','Tipovat lze jen v rozehraném Hangmanovi, mimo čekání.');const letter=normalizeCzech(c.letter);
  check([...letter].length===1&&alphabet.test(letter),'Zadejte jedno české písmeno. Tip celého slova není bez ověřeného pravidla chyby povolen.');
  if(h.guessedLetters.includes(letter)||h.pendingResponse?.letter===letter)return true;
  check(!h.pendingResponse,'Nejprve vyčkejte na odpověď schovaného (30 sekund).');
  if(h.manualResponses)h.pendingResponse={id:`${curse.id}:response:${++s.sequence}`,letter,guessedAt:s.now,deadline:s.now+30000};else evaluate(s,curse,letter);
 }else{
  check(actor==='hider'&&h.state==='guessing'&&h.pendingResponse?.id===c.responseId&&s.now<h.pendingResponse.deadline,'Tip již nečeká na odpověď nebo uplynulo 30 sekund.');
  const letter=h.pendingResponse.letter;delete h.pendingResponse;evaluate(s,curse,letter);
 }
 synchronizeHangman(curse);return true;
}
/** No current or historical secret ever crosses the hunter DTO boundary. */
export function publicHangman(h:HangmanState):HangmanState {
 const copy=structuredClone(h);delete copy.secretWord;for(const a of copy.history)delete a.secretWord;return copy;
}
export function validateHangman(s:GameState,c:Curse){
 // Finding confirmation freezes game deadlines; a rejected claim resumes them.
 const now=s.roundEnd&&s.roundEnd.status!=='rejected'?s.roundEnd.reportedAt:s.now;
 const h=c.hangman;if(!h)return;
 check(c.cardId.startsWith('curse-hidden-hangman@')&&h.curseId===c.id&&s.rules.hangmanVersion===1,'Neplatná identita Hangmana.');
 check(h.manualResponses===(s.rules.manualHangmanResponses??false),'Nekonzistentní režim Hangmana.');
 check(new Set(h.history.map(a=>a.id)).size===h.history.length,'Duplicitní pokus Hangmana.');
 let losses=0;for(const [i,a] of h.history.entries()){
  check(a.secretWord&&isCzechWord(a.secretWord)&&a.secretWord===normalizeCzech(a.secretWord)&&a.startedAt>=c.activatedAt&&a.startedAt<=now,'Neplatné soukromé slovo nebo čas pokusu.');
  check(new Set(a.guesses.map(g=>g.letter)).size===a.guesses.length,'Opakovaný tip v auditu.');let previous=a.startedAt,wrong=0;const used:string[]=[];
  for(const g of a.guesses){check(g.at>=previous&&g.at<=now&&[...g.letter].length===1&&alphabet.test(g.letter)&&g.correct===a.secretWord.includes(g.letter)&&wrong<7&&!([...a.secretWord].every(l=>used.includes(l))),'Neplatný audit tipů Hangmana.');previous=g.at;used.push(g.letter);if(!g.correct)wrong++;}
  const won=[...a.secretWord].every(l=>used.includes(l));check(a.outcome===(won?'won':wrong===7?'lost':'playing'),'Nesouhlasí výsledek Hangmana.');
  if(a.outcome!=='playing')check(a.endedAt===previous,'Neplatný konec pokusu.');else check(a.endedAt===undefined&&i===h.history.length-1,'Neplatný rozpracovaný pokus.');
  if(a.outcome==='lost')losses++;
  if(i>0)check(h.history[i-1].outcome==='lost'&&a.startedAt>=h.history[i-1].endedAt!+600000,'Pokus obešel desetiminutové čekání.');
 }
 check(h.losses===losses,'Nesouhlasí počet proher.');const a=h.history.at(-1);
 if(h.state==='awaiting_word')check(!h.secretWord&&!h.guessedLetters.length&&!h.wrongGuesses&&h.revealed.every(l=>l==='')&&!h.pendingResponse&&(!a||a.outcome==='lost'&&now>=a.endedAt!+600000)&&h.losses<3,'Neplatné čekání na slovo.');
 else if(!(h.state==='cancelled'&&h.resolution==='round_ended'&&!h.secretWord)) {check(a&&h.secretWord===a.secretWord&&JSON.stringify(h.guessedLetters)===JSON.stringify(a.guesses.map(g=>g.letter))&&h.wrongGuesses===a.guesses.filter(g=>!g.correct).length&&JSON.stringify(h.revealed)===JSON.stringify([...a.secretWord!].map(l=>h.guessedLetters.includes(l)?l:'')),'Nekonzistentní odhalená písmena.');}
 if(h.state==='guessing')check(a?.outcome==='playing'&&!h.cooldownUntil&&!h.resolution,'Neplatné hádání.');
 if(h.state==='cooldown')check(a?.outcome==='lost'&&h.cooldownUntil===a.endedAt!+600000&&now<h.cooldownUntil&&!h.pendingResponse,'Neplatný cooldown.');
 if(h.state==='won')check(a?.outcome==='won'&&h.resolution==='guessed','Neplatná výhra.');
 if(h.state==='cancelled')check(h.resolution==='round_ended'&&s.phase==='finished'||h.resolution==='loss_limit'&&losses===3&&now>=a!.endedAt!+600000||h.resolution==='response_timeout'&&h.manualResponses&&h.responseTimeout&&h.responseTimeout.deadline===h.responseTimeout.guessedAt+30000&&now>=h.responseTimeout.deadline&&h.responseTimeout.guessedAt>=a!.startedAt&&!h.guessedLetters.includes(h.responseTimeout.letter),'Neplatné zrušení Hangmana.');
 if(h.pendingResponse)check(h.manualResponses&&h.state==='guessing'&&[...h.pendingResponse.letter].length===1&&alphabet.test(h.pendingResponse.letter)&&!h.guessedLetters.includes(h.pendingResponse.letter)&&h.pendingResponse.guessedAt>=a!.startedAt&&h.pendingResponse.guessedAt<=now&&h.pendingResponse.deadline===h.pendingResponse.guessedAt+30000&&now<h.pendingResponse.deadline,'Neplatná čekající reakce.');
 if(h.responseTimeout)check(h.resolution==='response_timeout'&&[...h.responseTimeout.letter].length===1&&alphabet.test(h.responseTimeout.letter),'Neplatný audit vypršení reakce.');
 const done=h.state==='won'||h.state==='cancelled';
 check(c.state===(done?'fulfilled':'blocking')&&c.effects?.length===2&&c.effects[0].spec.kind==='task'&&c.effects[0].spec.blocksQuestions&&c.effects[0].state===(done?'fulfilled':'active')&&c.effects[1].spec.kind==='travel'&&c.effects[1].spec.preventBoarding===true&&c.effects[1].state===(done?'ended':'active'),'Neplatný životní cyklus účinků Hangmana.');
 check(c.blocksQuestions===(h.state!=='won'&&h.state!=='cancelled')&&!c.manual,'Nekonzistentní blokování Hangmana.');
}
