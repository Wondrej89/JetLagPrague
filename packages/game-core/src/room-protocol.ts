import type { RoleView } from './types';
import type { TeamId } from './match-types';

export interface RoomSession {
  code: string;
  roomId: string;
  token: string;
}

export interface RoomCredentials extends RoomSession {
  recoveryCode: string;
}

export interface RoomSnapshot {
  code: string;
  roomId: string;
  team: TeamId;
  status: 'waiting' | 'playing' | 'finished';
  connectedTeams: TeamId[];
  revision: number;
  serverNow: number;
  clockRunning: boolean;
  reference: boolean;
  view: RoleView;
  previousRound?: Pick<RoleView, 'events' | 'questions' | 'role'>;
}
