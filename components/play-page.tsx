"use client";

import { useMemo, useState } from "react";
import { PublicMatchCard } from "@/components/public-match-card";
import { PublicShell } from "@/components/public-shell";
import { useTournamentData } from "@/lib/use-tournament-data";
import { getDisplayParticipantIds, getLiveMatches, getStageLabel, getUpcomingMatches } from "@/lib/tournament";
import { Match, Player } from "@/lib/types";

function getPerspectivePlayerId(match: Match, players: Player[], query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return null;
  }

  return getDisplayParticipantIds(match).find((playerId) =>
    (players.find((player) => player.id === playerId)?.name ?? "").toLowerCase().includes(normalizedQuery)
  );
}

function matchMatchesQuery(match: Match, players: Player[], query: string) {
  return Boolean(getPerspectivePlayerId(match, players, query)) || query.trim().length === 0;
}

export function PlayPage() {
  const { players, matches, loading, error } = useTournamentData({
    publicDemoFallback: true
  });
  const [query, setQuery] = useState("");
  const liveMatchCount = getLiveMatches(matches).length;
  const upcomingMatches = useMemo(
    () => getUpcomingMatches(matches).filter((match) => matchMatchesQuery(match, players, query)),
    [matches, players, query]
  );

  return (
    <PublicShell title="Where To Play" liveCount={liveMatchCount}>
      <section className="public-page-intro">
        <div className="public-kicker">Player view</div>
        <p>Find your court, teammate, and opponents for the next live or upcoming match.</p>
      </section>

      <section className="page-section">
        <div className="filter-card">
          <label className="filter-field filter-field-wide">
            <span>Player search</span>
            <input
              className="filter-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter a player name"
              type="search"
              value={query}
            />
          </label>
        </div>
      </section>

      {error ? <div className="standings-notice is-error">{error}</div> : null}

      <section className="page-section">
        <div className="section-header">
          <h2>Upcoming and live matches</h2>
          <span>{upcomingMatches.length} showing</span>
        </div>

        {loading && upcomingMatches.length === 0 ? <div className="standings-empty">Loading active courts</div> : null}
        {!loading && upcomingMatches.length === 0 ? (
          <div className="standings-empty">No upcoming matches match that player search yet.</div>
        ) : null}

        <div className="live-match-list">
          {upcomingMatches.map((match) => (
            <PublicMatchCard
              key={match.id}
              kicker={match.is_live ? "Live Now" : getStageLabel(match.stage)}
              match={match}
              playerId={getPerspectivePlayerId(match, players, query)}
              players={players}
              title={match.scheduled_label ?? match.court_name}
            />
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
