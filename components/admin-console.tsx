"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, LogOut, Shuffle, TimerReset } from "lucide-react";
import { createSeedPlayers } from "@/lib/seed";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  buildFinalStageMatches,
  buildGroupStageAssets,
  buildKnockoutMatches,
  calculateLeaderboard,
  collectAdvancingPlayers,
  formatTeam
} from "@/lib/tournament";
import { Match, Player, TournamentStatus } from "@/lib/types";
import { useTournamentData } from "@/lib/use-tournament-data";

const TOURNAMENT_SLUG = "asirt-pickleball-open";
const TOURNAMENT_NAME = "Asirt Pickleball Open";

function stageLabel(stage: Match["stage"]) {
  switch (stage) {
    case "group":
      return "Group Stage";
    case "quarterfinal":
      return "Quarter Final";
    case "semifinal":
      return "Semi Final";
    case "third_place":
      return "Third Place";
    case "final":
      return "Final";
    default:
      return stage;
  }
}

export function AdminConsole() {
  const { tournament, players, groups, groupPlayers, matches, loading, error, isDemo, refresh } = useTournamentData();
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [search, setSearch] = useState("");
  const [playerDraft, setPlayerDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const supabaseConfigured = Boolean(getSupabaseBrowserClient());
  const leaderboard = calculateLeaderboard(players.filter((player) => player.is_active), matches);
  const canEdit = Boolean(supabaseConfigured && sessionEmail);

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return players;
    }

    return players.filter((player) => player.name.toLowerCase().includes(normalizedSearch));
  }, [players, search]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSessionEmail(data.session?.user.email ?? null);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user.email ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await action();
      await refresh();
    } catch (actionError) {
      setErrorMessage(actionError instanceof Error ? actionError.message : "Something went wrong.");
    } finally {
      setBusyKey(null);
    }
  }

  async function requireSupabase() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      throw new Error("Supabase is not configured yet. Add your environment variables first.");
    }

    return supabase;
  }

  async function createTournament() {
    await runAction("create-tournament", async () => {
      const supabase = await requireSupabase();
      const { error: insertError } = await supabase.from("tournaments").insert({
        slug: TOURNAMENT_SLUG,
        name: TOURNAMENT_NAME,
        status: "setup" satisfies TournamentStatus
      });

      if (insertError) {
        throw insertError;
      }

      setStatusMessage("Tournament created.");
    });
  }

  async function seedRoster() {
    await runAction("seed-roster", async () => {
      const supabase = await requireSupabase();
      const existingNames = new Set(players.map((player) => player.name.toLowerCase()));
      const starterPlayers = createSeedPlayers()
        .filter((player) => !existingNames.has(player.name.toLowerCase()))
        .map(({ id, ...player }) => player);

      if (starterPlayers.length === 0) {
        setStatusMessage("Roster is already seeded.");
        return;
      }

      const { error: insertError } = await supabase.from("players").insert(starterPlayers);

      if (insertError) {
        throw insertError;
      }

      setStatusMessage(`${starterPlayers.length} players added to the roster.`);
    });
  }

  async function sendMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("magic-link", async () => {
      const supabase = await requireSupabase();
      const siteUrl = window.location.origin;
      const { error: authError } = await supabase.auth.signInWithOtp({
        email: loginEmail,
        options: {
          emailRedirectTo: `${siteUrl}/admin`
        }
      });

      if (authError) {
        throw authError;
      }

      setStatusMessage(`Magic link sent to ${loginEmail}.`);
      setLoginEmail("");
    });
  }

  async function signOut() {
    await runAction("sign-out", async () => {
      const supabase = await requireSupabase();
      const { error: signOutError } = await supabase.auth.signOut();

      if (signOutError) {
        throw signOutError;
      }

      setStatusMessage("Signed out.");
    });
  }

  async function addPlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    await runAction("add-player", async () => {
      const supabase = await requireSupabase();
      const name = playerDraft.trim();

      if (!name) {
        throw new Error("Enter a player name before adding.");
      }

      const { error: insertError } = await supabase.from("players").insert({
        name,
        is_active: true
      });

      if (insertError) {
        throw insertError;
      }

      setPlayerDraft("");
      setStatusMessage(`${name} added to the roster.`);
    });
  }

  async function updatePlayer(playerId: string, patch: Partial<Player>) {
    await runAction(`player-${playerId}`, async () => {
      const supabase = await requireSupabase();
      const { error: updateError } = await supabase.from("players").update(patch).eq("id", playerId);

      if (updateError) {
        throw updateError;
      }

      setStatusMessage("Player updated.");
    });
  }

  async function deletePlayer(playerId: string, playerName: string) {
    const playerIsScheduled =
      groupPlayers.some((entry) => entry.player_id === playerId) ||
      matches.some(
        (match) => match.team_a_player_ids.includes(playerId) || match.team_b_player_ids.includes(playerId)
      );

    if (playerIsScheduled) {
      setErrorMessage(`${playerName} is already part of the generated schedule. Mark the player inactive instead.`);
      return;
    }

    if (!window.confirm(`Remove ${playerName} from the roster?`)) {
      return;
    }

    await runAction(`delete-${playerId}`, async () => {
      const supabase = await requireSupabase();
      const { error: deleteError } = await supabase.from("players").delete().eq("id", playerId);

      if (deleteError) {
        throw deleteError;
      }

      setStatusMessage(`${playerName} removed from the roster.`);
    });
  }

  async function generateGroups() {
    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    const activePlayers = players.filter((player) => player.is_active);

    if (activePlayers.length % 4 !== 0) {
      setErrorMessage("Active player count must be divisible by 4 before you can generate groups.");
      return;
    }

    if (
      groups.length > 0 &&
      !window.confirm("Regenerating groups will clear the current group-stage schedule and scores. Continue?")
    ) {
      return;
    }

    await runAction("generate-groups", async () => {
      const supabase = await requireSupabase();
      const groupIds = groups.map((group) => group.id);

      await supabase.from("matches").delete().eq("tournament_id", tournament.id).eq("stage", "group");

      if (groupIds.length > 0) {
        await supabase.from("group_players").delete().in("group_id", groupIds);
        await supabase.from("groups").delete().in("id", groupIds);
      }

      const { groups: nextGroups, groupPlayers, matches: nextMatches } = buildGroupStageAssets(
        tournament.id,
        activePlayers.map((player) => player.id)
      );

      const insertGroups = await supabase.from("groups").insert(nextGroups);

      if (insertGroups.error) {
        throw insertGroups.error;
      }

      const insertGroupPlayers = await supabase.from("group_players").insert(groupPlayers);

      if (insertGroupPlayers.error) {
        throw insertGroupPlayers.error;
      }

      const insertMatches = await supabase.from("matches").insert(nextMatches);

      if (insertMatches.error) {
        throw insertMatches.error;
      }

      await supabase.from("tournaments").update({ status: "group" }).eq("id", tournament.id);
      setStatusMessage("Groups and round-robin schedule generated.");
    });
  }

  async function saveMatch(match: Match) {
    await runAction(`match-${match.id}`, async () => {
      const supabase = await requireSupabase();

      if (match.team_a_score < 0 || match.team_b_score < 0 || match.team_a_score > 15 || match.team_b_score > 15) {
        throw new Error("Scores must stay between 0 and 15.");
      }

      if (match.is_complete) {
        if (match.team_a_score === match.team_b_score) {
          throw new Error("Completed matches cannot end in a tie.");
        }

        if (match.team_a_score !== 15 && match.team_b_score !== 15) {
          throw new Error("A completed match must have one team reaching 15.");
        }
      }

      const { error: updateError } = await supabase
        .from("matches")
        .update({
          court_name: match.court_name,
          team_a_score: match.team_a_score,
          team_b_score: match.team_b_score,
          is_live: match.is_live,
          is_complete: match.is_complete
        })
        .eq("id", match.id);

      if (updateError) {
        throw updateError;
      }

      setStatusMessage("Match updated.");
    });
  }

  async function generateQuarterfinals() {
    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    if (matches.some((match) => match.stage === "quarterfinal")) {
      setErrorMessage("Quarterfinal matches already exist.");
      return;
    }

    const qualifiedPlayers = leaderboard.slice(0, 16).map((row) => row.player.id);

    if (qualifiedPlayers.length !== 16) {
      setErrorMessage("You need 16 ranked players with completed group results before quarterfinals can be generated.");
      return;
    }

    await runAction("generate-quarterfinals", async () => {
      const supabase = await requireSupabase();
      const quarterfinals = buildKnockoutMatches(tournament.id, qualifiedPlayers, "quarterfinal");
      const { error: insertError } = await supabase.from("matches").insert(quarterfinals);

      if (insertError) {
        throw insertError;
      }

      await supabase.from("tournaments").update({ status: "knockout" }).eq("id", tournament.id);
      setStatusMessage("Quarterfinals generated from the Top 16.");
    });
  }

  async function generateSemifinals() {
    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    if (matches.some((match) => match.stage === "semifinal")) {
      setErrorMessage("Semifinal matches already exist.");
      return;
    }

    const quarterfinals = matches.filter((match) => match.stage === "quarterfinal");
    const advancingPlayers = collectAdvancingPlayers(quarterfinals);

    if (quarterfinals.length !== 4 || advancingPlayers.length !== 8) {
      setErrorMessage("Finish all quarterfinal matches before generating semifinals.");
      return;
    }

    await runAction("generate-semifinals", async () => {
      const supabase = await requireSupabase();
      const semifinals = buildKnockoutMatches(tournament.id, advancingPlayers, "semifinal");
      const { error: insertError } = await supabase.from("matches").insert(semifinals);

      if (insertError) {
        throw insertError;
      }

      setStatusMessage("Semifinals generated.");
    });
  }

  async function generateFinals() {
    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    if (matches.some((match) => match.stage === "final" || match.stage === "third_place")) {
      setErrorMessage("Final-stage matches already exist.");
      return;
    }

    const semifinals = matches.filter((match) => match.stage === "semifinal");

    if (semifinals.length !== 2 || semifinals.some((match) => !match.is_complete)) {
      setErrorMessage("Finish both semifinals before generating the final and third-place match.");
      return;
    }

    await runAction("generate-finals", async () => {
      const supabase = await requireSupabase();
      const finalStageMatches = buildFinalStageMatches(tournament.id, semifinals);
      const { error: insertError } = await supabase.from("matches").insert(finalStageMatches);

      if (insertError) {
        throw insertError;
      }

      setStatusMessage("Final and third-place matches generated.");
    });
  }

  return (
    <main className="standings-shell">
      <div className="admin-console">
        <header className="standings-topbar admin-console-topbar">
          <Link className="icon-button" href="/" aria-label="Open public board">
            <ChevronLeft size={20} />
          </Link>
          <h1>Control Room</h1>
          {sessionEmail ? (
            <button className="icon-button" onClick={() => void signOut()} type="button" aria-label="Sign out">
              <LogOut size={18} />
            </button>
          ) : (
            <span className="live-count" aria-label="Supabase status">
              <CheckCircle2 size={13} />
              <span>{supabaseConfigured ? "On" : "Off"}</span>
            </span>
          )}
        </header>

        <section className="admin-hero">
          <div>
            <div className="admin-kicker">Asirt Pickleball Admin</div>
            <h2>Tournament control room</h2>
          </div>
          <div className="admin-status-strip">
            <span className="badge">
                <CheckCircle2 size={14} />
                {supabaseConfigured ? "Supabase connected" : "Awaiting Supabase setup"}
            </span>
            <Link className="badge" href="/">
              Public board
            </Link>
          </div>

          {isDemo ? (
            <div className="status-banner">
              The admin page is currently showing demo content. Add your Supabase URL and anon key in
              <code> .env.local</code>, then refresh.
            </div>
          ) : null}
          {loading && players.length === 0 ? <div className="message">Loading tournament data.</div> : null}
          {error ? <div className="message error">{error}</div> : null}
          {statusMessage ? <div className="message">{statusMessage}</div> : null}
          {errorMessage ? <div className="message error">{errorMessage}</div> : null}

          {!supabaseConfigured ? null : !sessionEmail ? (
            <form className="login-panel" onSubmit={(event) => void sendMagicLink(event)}>
              <div className="field">
                <label htmlFor="loginEmail">Admin email</label>
                <input
                  id="loginEmail"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="organizer@example.com"
                />
              </div>
              <div className="button-row">
                <button className="button button-primary" disabled={busyKey === "magic-link"} type="submit">
                  Send magic link
                </button>
              </div>
            </form>
          ) : (
            <div className="message">Signed in as {sessionEmail}.</div>
          )}
        </section>

        <div className="admin-grid">
          <section className="admin-card">
            <h3>Setup & Bracket Controls</h3>
            <div className="admin-toolbar">
              <button
                className="button button-primary"
                disabled={!canEdit || busyKey === "create-tournament"}
                onClick={() => void createTournament()}
              >
                Create tournament
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "seed-roster"}
                onClick={() => void seedRoster()}
              >
                Seed starter roster
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "generate-groups"}
                onClick={() => void generateGroups()}
              >
                <Shuffle size={14} />
                <span style={{ marginLeft: 8 }}>Randomize groups</span>
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "generate-quarterfinals"}
                onClick={() => void generateQuarterfinals()}
              >
                Generate quarterfinals
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "generate-semifinals"}
                onClick={() => void generateSemifinals()}
              >
                Generate semifinals
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "generate-finals"}
                onClick={() => void generateFinals()}
              >
                Generate final stage
              </button>
            </div>
            <div className="mini-row">
              <span>Tournament</span>
              <span>{tournament?.name ?? "Not created yet"}</span>
            </div>
            <div className="mini-row">
              <span>Groups created</span>
              <span>{groups.length}</span>
            </div>
            <div className="mini-row">
              <span>Current qualifiers available</span>
              <span>{leaderboard.length >= 16 ? "Top 16 ready" : `${leaderboard.length}/16 ranked`}</span>
            </div>
          </section>

          <section className="admin-card">
            <h3>Roster</h3>
            <form className="button-row" onSubmit={(event) => void addPlayer(event)}>
              <input
                aria-label="New player name"
                placeholder="Add a new player"
                value={playerDraft}
                onChange={(event) => setPlayerDraft(event.target.value)}
              />
              <button className="button button-primary" disabled={!canEdit || busyKey === "add-player"} type="submit">
                Add player
              </button>
            </form>
            <div className="search-bar">
              <label htmlFor="playerSearch">Search players</label>
              <input
                id="playerSearch"
                placeholder="Search by name"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <div className="player-admin-list">
              {filteredPlayers.map((player) => (
                <PlayerRow
                  key={player.id}
                  busy={!canEdit || busyKey === `player-${player.id}` || busyKey === `delete-${player.id}`}
                  player={player}
                  onDelete={() => void deletePlayer(player.id, player.name)}
                  onSave={(patch) => void updatePlayer(player.id, patch)}
                />
              ))}
            </div>
          </section>

          <section className="admin-card">
            <h3>Matches</h3>
            <div className="match-admin-list">
              {matches.length > 0 ? (
                matches.map((match) => (
                  <MatchEditor
                    key={match.id}
                    busy={!canEdit || busyKey === `match-${match.id}`}
                    match={match}
                    players={players}
                    onSave={(nextMatch) => void saveMatch(nextMatch)}
                  />
                ))
              ) : (
                <div className="empty-state">Generate groups first, then the score-entry forms will appear here.</div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function PlayerRow({
  player,
  onSave,
  onDelete,
  busy
}: {
  player: Player;
  onSave: (patch: Partial<Player>) => void;
  onDelete: () => void;
  busy: boolean;
}) {
  const [name, setName] = useState(player.name);

  useEffect(() => {
    setName(player.name);
  }, [player.name]);

  return (
    <div className="player-admin-item">
      <div className="field">
        <label htmlFor={`player-${player.id}`}>Player name</label>
        <input id={`player-${player.id}`} value={name} onChange={(event) => setName(event.target.value)} />
      </div>
      <div className="button-row">
        <label className="toggle">
          <input
            checked={player.is_active}
            onChange={(event) => onSave({ is_active: event.target.checked })}
            type="checkbox"
          />
          Active
        </label>
        <button className="button button-secondary" disabled={busy} onClick={() => onSave({ name })} type="button">
          Save
        </button>
        <button className="button button-secondary" disabled={busy} onClick={onDelete} type="button">
          Remove
        </button>
      </div>
    </div>
  );
}

function MatchEditor({
  match,
  players,
  onSave,
  busy
}: {
  match: Match;
  players: Player[];
  onSave: (match: Match) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState(match);

  useEffect(() => {
    setDraft(match);
  }, [match]);

  return (
    <div className="match-admin-item">
      <div className="row-inline">
        <span className="badge">{stageLabel(match.stage)}</span>
        <span className="badge">{match.scheduled_label ?? `Match ${match.round_order}`}</span>
      </div>
      <div className="mini-row">
        <span>{formatTeam(match.team_a_player_ids, players)}</span>
        <span>{formatTeam(match.team_b_player_ids, players)}</span>
      </div>
      <div className="form-grid">
        <div className="field">
          <label htmlFor={`court-${match.id}`}>Court label</label>
          <input
            id={`court-${match.id}`}
            value={draft.court_name ?? ""}
            onChange={(event) => setDraft((current) => ({ ...current, court_name: event.target.value }))}
            placeholder="Court 1"
          />
        </div>
        <div className="score-grid">
          <div className="field">
            <label htmlFor={`score-a-${match.id}`}>Team A score</label>
            <input
              id={`score-a-${match.id}`}
              min={0}
              max={15}
              type="number"
              value={draft.team_a_score}
              onChange={(event) =>
                setDraft((current) => ({ ...current, team_a_score: Number(event.target.value || 0) }))
              }
            />
          </div>
          <div className="field">
            <label htmlFor={`score-b-${match.id}`}>Team B score</label>
            <input
              id={`score-b-${match.id}`}
              min={0}
              max={15}
              type="number"
              value={draft.team_b_score}
              onChange={(event) =>
                setDraft((current) => ({ ...current, team_b_score: Number(event.target.value || 0) }))
              }
            />
          </div>
        </div>
      </div>
      <div className="button-row">
        <label className="toggle">
          <input
            checked={draft.is_live}
            onChange={(event) => setDraft((current) => ({ ...current, is_live: event.target.checked }))}
            type="checkbox"
          />
          Live on public board
        </label>
        <label className="toggle">
          <input
            checked={draft.is_complete}
            onChange={(event) => setDraft((current) => ({ ...current, is_complete: event.target.checked }))}
            type="checkbox"
          />
          Match complete
        </label>
        <button className="button button-primary" disabled={busy} onClick={() => onSave(draft)} type="button">
          <TimerReset size={14} />
          <span style={{ marginLeft: 8 }}>Save match</span>
        </button>
      </div>
    </div>
  );
}
