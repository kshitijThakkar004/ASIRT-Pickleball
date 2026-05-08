"use client";

import { Match, Player } from "@/lib/types";
import { formatDisplayTeam, formatTeam, getDisplayTeamPlayerIds, getHelperLabel, getMatchWinnerKey } from "@/lib/tournament";

function findPerspective(match: Match, playerId: string) {
  const teamA = getDisplayTeamPlayerIds(match, "a");
  const teamB = getDisplayTeamPlayerIds(match, "b");

  if (teamA.includes(playerId)) {
    return {
      ownTeam: teamA,
      opponentTeam: teamB,
      ownScore: match.team_a_score,
      opponentScore: match.team_b_score
    };
  }

  if (teamB.includes(playerId)) {
    return {
      ownTeam: teamB,
      opponentTeam: teamA,
      ownScore: match.team_b_score,
      opponentScore: match.team_a_score
    };
  }

  return null;
}

function getPlayerName(playerId: string, players: Player[]) {
  return players.find((player) => player.id === playerId)?.name ?? "Unknown";
}

export function PublicMatchCard({
  match,
  players,
  kicker,
  title,
  playerId,
  showWinnerLabel = false
}: {
  match: Match;
  players: Player[];
  kicker: string;
  title?: string | null;
  playerId?: string | null;
  showWinnerLabel?: boolean;
}) {
  const perspective = playerId ? findPerspective(match, playerId) : null;
  const winnerKey = getMatchWinnerKey(match);
  const helperLabel = getHelperLabel(match, players);

  return (
    <article className="live-match-card">
      <div className="live-match-meta">
        <span>{kicker}</span>
        <span>{title ?? match.scheduled_label ?? "Match"}</span>
      </div>

      {perspective ? (
        <>
          <div className="match-detail-grid">
            <div className="match-detail-item">
              <span>Court</span>
              <strong>{match.court_name ?? "Court pending"}</strong>
            </div>
            <div className="match-detail-item">
              <span>Teammate</span>
              <strong>
                {perspective.ownTeam
                  .filter((currentPlayerId) => currentPlayerId !== playerId)
                  .map((currentPlayerId) => getPlayerName(currentPlayerId, players))
                  .join(" / ") || "TBD"}
              </strong>
            </div>
          </div>
          <div className="live-score-row">
            <span>{formatTeam(perspective.ownTeam, players)}</span>
            <strong>{perspective.ownScore}</strong>
          </div>
          <div className="live-score-row">
            <span>{formatTeam(perspective.opponentTeam, players)}</span>
            <strong>{perspective.opponentScore}</strong>
          </div>
        </>
      ) : (
        <>
          <div className="live-score-row">
            <span>{formatDisplayTeam(match, "a", players)}</span>
            <strong>{match.team_a_score}</strong>
          </div>
          <div className="live-score-row">
            <span>{formatDisplayTeam(match, "b", players)}</span>
            <strong>{match.team_b_score}</strong>
          </div>
        </>
      )}

      {helperLabel ? <div className="match-helper-note">{helperLabel}</div> : null}

      <div className="match-card-footer">
        <span>{match.court_name ?? "Court pending"}</span>
        {showWinnerLabel ? (
          <span className={winnerKey ? "winner-pill" : "winner-pill muted"}>
            {winnerKey === "a"
              ? `${formatDisplayTeam(match, "a", players)} won`
              : winnerKey === "b"
                ? `${formatDisplayTeam(match, "b", players)} won`
                : match.is_complete
                  ? "Draw"
                  : "Awaiting result"}
          </span>
        ) : null}
      </div>
    </article>
  );
}
