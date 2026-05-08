"use client";

import { PublicMatchCard } from "@/components/public-match-card";
import { PublicShell } from "@/components/public-shell";
import { useTournamentData } from "@/lib/use-tournament-data";
import { formatTeam, getKnockoutMatchesByStage, getLiveMatches, getMatchWinnerKey, getStageLabel } from "@/lib/tournament";

function getOutcomeLabel(label: "Champion" | "Runner-up" | "Third Place", value: string) {
  return (
    <article className="result-summary-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export function KnockoutPage() {
  const { players, matches, loading, error } = useTournamentData({
    publicDemoFallback: true
  });
  const liveMatchCount = getLiveMatches(matches).length;
  const stageBlocks = getKnockoutMatchesByStage(matches).filter((block) => block.matches.length > 0);
  const finalMatch = stageBlocks.find((block) => block.stage === "final")?.matches[0] ?? null;
  const thirdPlaceMatch = stageBlocks.find((block) => block.stage === "third_place")?.matches[0] ?? null;
  const champion =
    finalMatch && getMatchWinnerKey(finalMatch)
      ? formatTeam(
          getMatchWinnerKey(finalMatch) === "a" ? finalMatch.team_a_player_ids : finalMatch.team_b_player_ids,
          players
        )
      : null;
  const runnerUp =
    finalMatch && getMatchWinnerKey(finalMatch)
      ? formatTeam(
          getMatchWinnerKey(finalMatch) === "a" ? finalMatch.team_b_player_ids : finalMatch.team_a_player_ids,
          players
        )
      : null;
  const thirdPlace =
    thirdPlaceMatch && getMatchWinnerKey(thirdPlaceMatch)
      ? formatTeam(
          getMatchWinnerKey(thirdPlaceMatch) === "a" ? thirdPlaceMatch.team_a_player_ids : thirdPlaceMatch.team_b_player_ids,
          players
        )
      : null;

  return (
    <PublicShell title="Knockout" liveCount={liveMatchCount}>
      <section className="public-page-intro">
        <div className="public-kicker">Knockout results</div>
        <p>Follow quarter finals through the final without mixing knockout scores into group standings.</p>
      </section>

      {error ? <div className="standings-notice is-error">{error}</div> : null}

      {champion && runnerUp && thirdPlace ? (
        <section className="page-section">
          <div className="section-header">
            <h2>Final outcomes</h2>
            <span>Updated from completed finals</span>
          </div>
          <div className="result-summary-grid">
            {getOutcomeLabel("Champion", champion)}
            {getOutcomeLabel("Runner-up", runnerUp)}
            {getOutcomeLabel("Third Place", thirdPlace)}
          </div>
        </section>
      ) : null}

      <section className="page-section">
        <div className="section-header">
          <h2>Rounds</h2>
          <span>{stageBlocks.reduce((total, block) => total + block.matches.length, 0)} matches</span>
        </div>

        {loading && stageBlocks.length === 0 ? <div className="standings-empty">Loading knockout rounds</div> : null}
        {!loading && stageBlocks.length === 0 ? (
          <div className="standings-empty">Knockout rounds will appear once quarter finals are generated.</div>
        ) : null}

        <div className="stage-stack">
          {stageBlocks.map((block) => (
            <section className="stage-section" key={block.stage}>
              <div className="section-header">
                <h3>{getStageLabel(block.stage)}</h3>
                <span>{block.matches.filter((match) => match.is_complete).length}/{block.matches.length} complete</span>
              </div>
              <div className="live-match-list">
                {block.matches.map((match) => (
                  <PublicMatchCard
                    key={match.id}
                    kicker={getStageLabel(match.stage)}
                    match={match}
                    players={players}
                    showWinnerLabel
                    title={match.scheduled_label ?? match.court_name}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </PublicShell>
  );
}
