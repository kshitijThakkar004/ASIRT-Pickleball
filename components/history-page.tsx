"use client";

import { useMemo, useState } from "react";
import { PublicMatchCard } from "@/components/public-match-card";
import { PublicShell } from "@/components/public-shell";
import { useTournamentData } from "@/lib/use-tournament-data";
import { getAllMatchParticipantIds, getCompletedMatches, getLiveMatches, getStageLabel } from "@/lib/tournament";
import { Match, Stage } from "@/lib/types";

type HistoryStageFilter = "all" | Stage | "manual";

const HISTORY_FILTERS: Array<{ value: HistoryStageFilter; label: string }> = [
  { value: "all", label: "All stages" },
  { value: "group", label: "Group" },
  { value: "quarterfinal", label: "Quarter Final" },
  { value: "semifinal", label: "Semi Final" },
  { value: "final", label: "Final" },
  { value: "third_place", label: "Third Place" },
  { value: "manual", label: "Manual" }
];

function matchIncludesPlayer(match: Match, playerNames: Map<string, string>, query: string) {
  const normalizedQuery = query.trim().toLowerCase();

  if (!normalizedQuery) {
    return true;
  }

  return getAllMatchParticipantIds(match).some((playerId) =>
    (playerNames.get(playerId) ?? "").toLowerCase().includes(normalizedQuery)
  );
}

function matchPassesStage(match: Match, stage: HistoryStageFilter) {
  if (stage === "all") {
    return true;
  }

  if (stage === "manual") {
    return match.match_kind === "manual";
  }

  return match.match_kind === "scheduled" && match.stage === stage;
}

export function HistoryPage() {
  const { players, matches, loading, error } = useTournamentData({
    publicDemoFallback: true
  });
  const [query, setQuery] = useState("");
  const [stageFilter, setStageFilter] = useState<HistoryStageFilter>("all");
  const liveMatchCount = getLiveMatches(matches).length;
  const playerNames = useMemo(() => new Map(players.map((player) => [player.id, player.name])), [players]);
  const completedMatches = useMemo(
    () =>
      getCompletedMatches(matches).filter(
        (match) => matchPassesStage(match, stageFilter) && matchIncludesPlayer(match, playerNames, query)
      ),
    [matches, playerNames, query, stageFilter]
  );

  return (
    <PublicShell title="Previous Matches" liveCount={liveMatchCount}>
      <section className="public-page-intro">
        <div className="public-kicker">Match archive</div>
        <p>Browse completed results, then narrow the list by player or by stage.</p>
      </section>

      <section className="page-section">
        <div className="filter-card">
          <label className="filter-field">
            <span>Find a player</span>
            <input
              className="filter-input"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by player name"
              type="search"
              value={query}
            />
          </label>
          <label className="filter-field">
            <span>Stage</span>
            <select
              className="filter-input"
              onChange={(event) => setStageFilter(event.target.value as HistoryStageFilter)}
              value={stageFilter}
            >
              {HISTORY_FILTERS.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error ? <div className="standings-notice is-error">{error}</div> : null}

      <section className="page-section">
        <div className="section-header">
          <h2>Completed matches</h2>
          <span>{completedMatches.length} shown</span>
        </div>

        {loading && completedMatches.length === 0 ? <div className="standings-empty">Loading match history</div> : null}
        {!loading && completedMatches.length === 0 ? (
          <div className="standings-empty">No completed matches match the current filters.</div>
        ) : null}

        <div className="live-match-list">
          {completedMatches.map((match) => (
            <PublicMatchCard
              key={match.id}
              kicker={match.match_kind === "manual" ? "Manual Match" : getStageLabel(match.stage)}
              match={match}
              players={players}
              showWinnerLabel
              title={match.scheduled_label ?? match.court_name}
            />
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
