"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Radio, Trophy } from "lucide-react";
import { useTournamentData } from "@/lib/use-tournament-data";
import { calculateLeaderboard, formatTeam, groupPlayersByGroup, matchesByStage } from "@/lib/tournament";
import { Match, Player } from "@/lib/types";

const STAGE_LABELS: Record<string, string> = {
  quarterfinal: "Quarter Finals",
  semifinal: "Semi Finals",
  third_place: "Third Place",
  final: "Final"
};

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

function groupMatches(matches: Match[], groupId: string) {
  return matches
    .filter((match) => match.group_id === groupId)
    .sort((left, right) => left.round_order - right.round_order);
}

export function TournamentApp() {
  const { tournament, players, groups, groupPlayers, matches, loading, error } = useTournamentData({
    publicDemoFallback: true
  });
  const [selectedGroupId, setSelectedGroupId] = useState("all");
  const leaderboard = calculateLeaderboard(players.filter((player) => player.is_active), matches);
  const groupedPlayers = groupPlayersByGroup(groups, groupPlayers, players);
  const liveMatches = matches.filter((match) => match.is_live && !match.is_complete);
  const completedGroupMatches = matches.filter((match) => match.stage === "group" && match.is_complete).length;
  const stagedKnockout = matchesByStage(matches).filter((entry) => entry.matches.length > 0);
  const visibleGroups = useMemo(
    () =>
      selectedGroupId === "all"
        ? groupedPlayers
        : groupedPlayers.filter(({ group }) => group.id === selectedGroupId),
    [groupedPlayers, selectedGroupId]
  );
  const liveMatchCount = liveMatches.length;

  return (
    <main className="standings-shell">
      <div className="standings-app">
        <header className="standings-topbar">
          <Link className="icon-button" href="/admin" aria-label="Open admin console">
            <ChevronLeft size={20} />
          </Link>
          <h1>Standings</h1>
          <div className="live-count" aria-label={`${liveMatchCount} live matches`}>
            <Radio size={13} />
            <span>{liveMatchCount}</span>
          </div>
        </header>

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

        {error ? <div className="standings-notice is-error">{error}</div> : null}

        <section className="standings-stack" aria-label="Tournament standings">
          {loading && visibleGroups.length === 0 ? <div className="standings-empty">Loading tournament data</div> : null}
          {!loading && visibleGroups.length === 0 ? (
            <div className="standings-empty">Groups will appear once the active roster is randomized.</div>
          ) : null}
          {visibleGroups.map(({ group, roster }) => {
            const matchesForGroup = groupMatches(matches, group.id);
            const completedMatches = matchesForGroup.filter((match) => match.is_complete).length;
            const rows = calculateLeaderboard(roster, matchesForGroup);

            return (
              <article className="standings-group" key={group.id}>
                <div className="standings-group-header">
                  <h2>{groupLabel(group.group_number)}</h2>
                  <span>
                    {completedMatches}/{matchesForGroup.length} matches played
                  </span>
                </div>
                <div className="standings-card">
                  <div className="standings-row standings-head">
                    <span>Team</span>
                    <span>P</span>
                    <span>W</span>
                    <span>GD</span>
                    <span>Pts</span>
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
                      <span>{row.pointsFor}</span>
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
                <article className="live-match-card" key={match.id}>
                  <div className="live-match-meta">
                    <span>{match.court_name ?? match.scheduled_label ?? "Court pending"}</span>
                    <span>{match.stage === "group" ? "Group Stage" : STAGE_LABELS[match.stage]}</span>
                  </div>
                  <div className="live-score-row">
                    <span>{formatTeam(match.team_a_player_ids, players)}</span>
                    <strong>{match.team_a_score}</strong>
                  </div>
                  <div className="live-score-row">
                    <span>{formatTeam(match.team_b_player_ids, players)}</span>
                    <strong>{match.team_b_score}</strong>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="standings-empty">No courts are live right now.</div>
          )}
        </section>

        {stagedKnockout.length > 0 ? (
          <section className="live-panel" aria-label="Knockout bracket">
            <div className="live-panel-header">
              <h2>Knockout</h2>
              <span>{tournament?.status ?? "setup"}</span>
            </div>
            <div className="live-match-list">
              {stagedKnockout.flatMap((stageBlock) =>
                stageBlock.matches.map((match) => (
                  <article className="live-match-card" key={match.id}>
                    <div className="live-match-meta">
                      <span>{STAGE_LABELS[stageBlock.stage]}</span>
                      <span>{match.scheduled_label}</span>
                    </div>
                    <div className="live-score-row">
                      <span>{formatTeam(match.team_a_player_ids, players)}</span>
                      <strong>{match.team_a_score}</strong>
                    </div>
                    <div className="live-score-row">
                      <span>{formatTeam(match.team_b_player_ids, players)}</span>
                      <strong>{match.team_b_score}</strong>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
