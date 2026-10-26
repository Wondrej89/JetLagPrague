import type {GameSize} from './card-types';
import type {Role} from './types';
export type TeamId='team-a'|'team-b';
export interface Team {id:TeamId;name:string;members:2;activePhones:1}
export type CheckAnswer='fulfilled'|'violated'|'not_applicable';
export interface SettlementCheck {
 id:string;curseId:string;effectId:string;effectIndex:number;cardDefinitionId:string;curseName:string;
 question:string;detail:string;penaltySeconds:number|null;alreadyAwarded:boolean;wasWaiting:boolean;answer:CheckAnswer|null;
}
export interface RoundEnd {
 id:string;reportedAt:number;reportedBy:TeamId;status:'pending'|'rejected'|'settling'|'finalized';
 respondedAt?:number;finalizedAt?:number;penaltyCountAtReport:number;checks:SettlementCheck[];
}
export interface RoundResult {
 gameId:string;round:1|2;hiderTeamId:TeamId;hunterTeamId:TeamId;releaseId:string;rulesId:string;size?:GameSize;
 startedAt:number;foundAt:number;confirmedAt:number;finalizedAt:number;
 wallMs:number;pausedMs:number;elapsedMs:number;cardBonusMs:number;curseBonusMs:number;totalMs:number;
 cards:{instanceId:string;definitionId:string;name:string;seconds:number}[];
 checks:SettlementCheck[];unclaimedRewards:number;
}
export interface TeamMatch {
 version:1;id:string;teams:[Team,Team];round:1|2;roleTeams:Record<Role,TeamId>;
 results:RoundResult[];nextReady:Partial<Record<TeamId,boolean>>;
}
export interface MatchView extends TeamMatch {ownTeamId:TeamId;winner:TeamId|'tie'|null}
