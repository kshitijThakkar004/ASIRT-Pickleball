export type Stage = "group" | "quarterfinal" | "semifinal" | "final" | "third_place";
export type MatchKind = "scheduled" | "manual";

export type TournamentStatus = "setup" | "group" | "knockout" | "completed";

export interface Player {
  id: string;
  name: string;
  is_active: boolean;
  created_at?: string;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  court_count: number;
  created_at?: string;
}

export interface Group {
  id: string;
  tournament_id: string;
  group_number: number;
}

export interface GroupPlayer {
  id: string;
  group_id: string;
  player_id: string;
  seat: number;
}

export interface Match {
  id: string;
  tournament_id: string;
  group_id: string | null;
  match_kind: MatchKind;
  stage: Stage;
  round_order: number;
  court_name: string | null;
  scheduled_label: string | null;
  team_a_player_ids: string[];
  team_b_player_ids: string[];
  helper_player_ids?: string[];
  helper_for_player_ids?: string[];
  team_a_score: number;
  team_b_score: number;
  is_live: boolean;
  is_complete: boolean;
  created_at?: string;
}

export interface LeaderboardRow {
  player: Player;
  rank: number;
  pointsFor: number;
  pointsAgainst: number;
  differential: number;
  matchesPlayed: number;
  wins: number;
  averagePoints: number;
  averageDifferential: number;
}

export interface TournamentState {
  tournament: Tournament | null;
  players: Player[];
  groups: Group[];
  groupPlayers: GroupPlayer[];
  matches: Match[];
}
