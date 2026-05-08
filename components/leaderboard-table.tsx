"use client";

import clsx from "clsx";
import { LeaderboardRow } from "@/lib/types";

interface LeaderboardTableProps {
  rows: LeaderboardRow[];
}

export function LeaderboardTable({ rows }: LeaderboardTableProps) {
  if (rows.length === 0) {
    return <div className="empty-state">Leaderboard points will appear here once group-stage matches are scored.</div>;
  }

  return (
    <div className="leaderboard-wrap">
      <table className="leaderboard-table">
        <thead>
          <tr>
            <th>Rank</th>
            <th>Player</th>
            <th>Avg</th>
            <th>Points</th>
            <th>Against</th>
            <th>Diff</th>
            <th>Played</th>
            <th>Wins</th>
            <th>Knockout</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.player.id}>
              <td className="leaderboard-rank">{row.rank}</td>
              <td>{row.player.name}</td>
              <td>{row.averagePoints.toFixed(2)}</td>
              <td>{row.pointsFor}</td>
              <td>{row.pointsAgainst}</td>
              <td>{row.differential > 0 ? `+${row.differential}` : row.differential}</td>
              <td>{row.matchesPlayed}</td>
              <td>{row.wins}</td>
              <td>
                <span
                  className={clsx("qualifier-pill", {
                    muted: row.rank > 16
                  })}
                >
                  {row.rank <= 16 ? "Top 16" : "Chasing"}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
