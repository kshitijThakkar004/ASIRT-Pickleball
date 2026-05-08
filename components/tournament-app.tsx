"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { PublicMatchCard } from "@/components/public-match-card";
import { PublicShell } from "@/components/public-shell";
import { useTournamentData } from "@/lib/use-tournament-data";
import { calculateLeaderboard, getLiveMatches, groupPlayersByGroup } from "@/lib/tournament";
import { Match, Player } from "@/lib/types";

function groupLabel(groupNumber: number) {
  return `Group ${String.fromCharCode(64 + groupNumber)}`;
}

function playerMark(player: Player) {
  return player.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

function groupMatches(matches: Match[], rosterIds: string[]) {
  const rosterIdSet = new Set(rosterIds);

  return matches
    .filter(
      (match) =>
        match.match_kind === "scheduled" &&
        match.stage === "group" &&
        [...match.team_a_player_ids, ...match.team_b_player_ids].some((playerId) => rosterIdSet.has(playerId))
    )
    .sort((left, right) => left.round_order - right.round_order);
}

export function TournamentApp() {
  const { players, groups, groupPlayers, matches, loading, error } = useTournamentData({
    publicDemoFallback: true
  });
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const leaderboard = calculateLeaderboard(players.filter((player) => player.is_active), matches);
  const groupedPlayers = groupPlayersByGroup(groups, groupPlayers, players);
  const liveMatches = getLiveMatches(matches);
  const completedGroupMatches = matches.filter(
    (match) => match.match_kind === "scheduled" && match.stage === "group" && match.is_complete
  ).length;
  const visibleGroups = useMemo(
    () =>
      selectedGroupId === "all"
        ? groupedPlayers
        : groupedPlayers.filter(({ group }) => group.id === selectedGroupId),
    [groupedPlayers, selectedGroupId]
  );
  const liveMatchCount = liveMatches.length;

  return (
    <PublicShell title="Standings" liveCount={liveMatchCount}>
      <section className="public-page-intro">
        <div className="public-kicker">Group standings</div>
        <p>Track group-stage rankings and see only the courts that are live right now. Qualification is based on average points per match when match counts differ.</p>
      </section>

      <div className="group-tabs-wrap">
        <nav className="group-tabs" aria-label="Group filters">
          <button
            className={selectedGroupId === "all" ? "group-tab is-active" : "group-tab"}
            onClick={() => setSelectedGroupId("all")}
            type="button"
          >
            All Groups
          </button>
          {groupedPlayers.map(({ group }) => (
            <button
              className={selectedGroupId === group.id ? "group-tab is-active" : "group-tab"}
              key={group.id}
              onClick={() => setSelectedGroupId(group.id)}
              type="button"
            >
              {groupLabel(group.group_number)}
            </button>
          ))}
        </nav>
      </div>

      {error ? <div className="standings-notice is-error">{error}</div> : null}

      <section className="standings-stack" aria-label="Tournament standings">
        {loading && visibleGroups.length === 0 ? <div className="standings-empty">Loading tournament data</div> : null}
        {!loading && visibleGroups.length === 0 ? (
          <div className="standings-empty">Groups will appear once the active roster is randomized.</div>
        ) : null}
        {visibleGroups.map(({ group, roster }) => {
          const matchesForGroup = groupMatches(
            matches,
            roster.map((player) => player.id)
          );
          const completedMatches = matchesForGroup.filter((match) => match.is_complete).length;
          const rows = calculateLeaderboard(roster, matchesForGroup);

          return (
            <article className="standings-group" key={group.id}>
              <div className="standings-group-header">
                <h2>{groupLabel(group.group_number)}</h2>
                <span>
                  {completedMatches}/{matchesForGroup.length} pairings played
                </span>
              </div>
              <div className="standings-card">
                <div className="standings-row standings-head">
                  <span>Team</span>
                  <span>P</span>
                  <span>W</span>
                  <span>GD</span>
                  <span>Avg</span>
                </div>
                {rows.map((row) => (
                  <div className="standings-row" key={row.player.id}>
                    <div className="standing-team">
                      <span className="player-badge">{playerMark(row.player)}</span>
                      <span className="standing-name">{row.player.name}</span>
                      {row.rank <= 16 ? <Trophy className="standing-trophy" size={13} /> : null}
                    </div>
                    <span>{row.matchesPlayed}</span>
                    <span>{row.wins}</span>
                    <span className={row.differential >= 0 ? "good-diff" : "bad-diff"}>
                      {row.differential > 0 ? `+${row.differential}` : row.differential}
                    </span>
                    <span>{row.averagePoints.toFixed(1)}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </section>

      <section className="live-panel" aria-label="Live matches">
        <div className="live-panel-header">
          <h2>Live Matches</h2>
          <span>{completedGroupMatches} completed</span>
        </div>
        {liveMatches.length > 0 ? (
          <div className="live-match-list">
            {liveMatches.map((match) => (
              <PublicMatchCard
                key={match.id}
                kicker={match.match_kind === "manual" ? "Manual Match" : match.stage === "group" ? "Group Stage" : "Knockout"}
                match={match}
                players={players}
                title={match.scheduled_label ?? match.court_name}
              />
            ))}
          </div>
        ) : (
          <div className="standings-empty">No courts are live right now.</div>
        )}
      </section>
    </PublicShell>
  );
}
