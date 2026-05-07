"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ChevronLeft, LogOut, Shuffle, TimerReset } from "lucide-react";
import { createSeedPlayers } from "@/lib/seed";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  buildFinalStageMatches,
  buildGroupStageAssets,
  buildKnockoutMatches,
  calculateLeaderboard,
  collectAdvancingPlayers,
  formatTeam,
  sortMatchesForAdmin
} from "@/lib/tournament";
import { Match, Player, TournamentStatus } from "@/lib/types";
import { useTournamentData } from "@/lib/use-tournament-data";

const TOURNAMENT_SLUG = "asirt-pickleball-open";
const TOURNAMENT_NAME = "Asirt Pickleball Open";
const DEFAULT_MANUAL_STAGE: Match["stage"] = "group";

type AdminView = "setup" | "roster" | "scheduled" | "manual" | "reset";

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

function getErrorParts(actionError: unknown) {
  if (actionError instanceof Error) {
    return {
      message: actionError.message,
      code: ""
    };
  }

  if (actionError && typeof actionError === "object") {
    const candidate = actionError as {
      message?: unknown;
      code?: unknown;
      details?: unknown;
      hint?: unknown;
      error_description?: unknown;
      msg?: unknown;
    };

    const message =
      typeof candidate.message === "string"
        ? candidate.message
        : typeof candidate.error_description === "string"
          ? candidate.error_description
          : typeof candidate.msg === "string"
            ? candidate.msg
            : "";
    const details = typeof candidate.details === "string" ? candidate.details : "";
    const hint = typeof candidate.hint === "string" ? candidate.hint : "";
    const code = typeof candidate.code === "string" ? candidate.code : "";

    return {
      message: [message, details, hint].filter(Boolean).join(" ").trim(),
      code
    };
  }

  return {
    message: "",
    code: ""
  };
}

export function AdminConsole() {
  const { tournament, players, groups, groupPlayers, matches, loading, error, isDemo, refresh } = useTournamentData({
    startWithDemo: false
  });
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [isAdminUser, setIsAdminUser] = useState<boolean | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [activeView, setActiveView] = useState<AdminView>("setup");
  const [search, setSearch] = useState("");
  const [courtFilter, setCourtFilter] = useState("");
  const [courtCountDraft, setCourtCountDraft] = useState("1");
  const [playerDraft, setPlayerDraft] = useState("");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [manualMatchDraft, setManualMatchDraft] = useState({
    stage: DEFAULT_MANUAL_STAGE,
    courtNumber: "",
    scheduledLabel: "",
    teamAPlayerOne: "",
    teamAPlayerTwo: "",
    teamBPlayerOne: "",
    teamBPlayerTwo: ""
  });

  const supabaseConfigured = Boolean(getSupabaseBrowserClient());
  const canEdit = Boolean(supabaseConfigured && sessionEmail && isAdminUser);
  const activePlayers = useMemo(() => players.filter((player) => player.is_active), [players]);
  const leaderboard = useMemo(() => calculateLeaderboard(activePlayers, matches), [activePlayers, matches]);
  const rankedLeaderboard = useMemo(() => leaderboard.filter((row) => row.matchesPlayed > 0), [leaderboard]);
  const scheduledMatches = useMemo(() => matches.filter((match) => match.match_kind === "scheduled"), [matches]);
  const manualMatches = useMemo(() => matches.filter((match) => match.match_kind === "manual"), [matches]);
  const sortedScheduledMatches = useMemo(() => sortMatchesForAdmin(scheduledMatches), [scheduledMatches]);
  const sortedManualMatches = useMemo(() => sortMatchesForAdmin(manualMatches), [manualMatches]);
  const liveScheduledMatches = scheduledMatches.filter((match) => match.is_live && !match.is_complete).length;
  const quarterfinalCount = scheduledMatches.filter((match) => match.stage === "quarterfinal").length;
  const semifinalCount = scheduledMatches.filter((match) => match.stage === "semifinal").length;
  const finalStageCount = scheduledMatches.filter(
    (match) => match.stage === "final" || match.stage === "third_place"
  ).length;

  const visibleScheduledMatches = useMemo(
    () =>
      sortedScheduledMatches.filter((match) => {
        if (!courtFilter.trim()) {
          return true;
        }

        return match.court_name?.toLowerCase() === `court ${courtFilter.trim().toLowerCase()}`;
      }),
    [courtFilter, sortedScheduledMatches]
  );

  const visibleManualMatches = useMemo(
    () =>
      sortedManualMatches.filter((match) => {
        if (!courtFilter.trim()) {
          return true;
        }

        return match.court_name?.toLowerCase() === `court ${courtFilter.trim().toLowerCase()}`;
      }),
    [courtFilter, sortedManualMatches]
  );

  const filteredPlayers = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    if (!normalizedSearch) {
      return players;
    }

    return players.filter((player) => player.name.toLowerCase().includes(normalizedSearch));
  }, [players, search]);

  const sections = [
    { id: "setup", label: "Setup", detail: "Brackets and courts", count: tournament ? 1 : 0 },
    { id: "roster", label: "Roster", detail: "Manage players", count: players.length },
    { id: "scheduled", label: "Schedule", detail: "Official matches", count: visibleScheduledMatches.length },
    { id: "manual", label: "Manual", detail: "Added separately", count: visibleManualMatches.length },
    { id: "reset", label: "Reset", detail: "Danger zone", count: 0 }
  ] satisfies Array<{ id: AdminView; label: string; detail: string; count: number }>;

  useEffect(() => {
    setCourtCountDraft(String(tournament?.court_count ?? 1));
  }, [tournament?.court_count]);

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

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || !sessionEmail) {
      setIsAdminUser(null);
      return;
    }

    let isMounted = true;

    void supabase.rpc("is_admin").then(({ data, error: rpcError }) => {
      if (!isMounted) {
        return;
      }

      if (rpcError) {
        setIsAdminUser(false);
        return;
      }

      setIsAdminUser(Boolean(data));
    });

    return () => {
      isMounted = false;
    };
  }, [sessionEmail]);

  function formatActionError(actionError: unknown) {
    const { message: rawMessage, code } = getErrorParts(actionError);
    const message = rawMessage.toLowerCase();

    if (!rawMessage) {
      return "Something went wrong. Please try again after checking your sign-in and event setup.";
    }

    if (
      message.includes("row-level security") ||
      message.includes("permission denied") ||
      message.includes("violates row-level security policy") ||
      code === "42501"
    ) {
      return sessionEmail
        ? `${sessionEmail} is signed in, but this email has not been approved to manage the event yet. Ask the organizer to grant access, then refresh.`
        : "This action is available only to approved organizer accounts.";
    }

    if (message.includes("stack depth limit exceeded") || code === "54001") {
      return "Organizer access is still using an older Supabase setup. Re-run the latest setup SQL, then refresh this page.";
    }

    if (message.includes("email not confirmed")) {
      return "Email sign-in is not fully configured yet in Supabase.";
    }

    if (message.includes("smtp") || message.includes("email provider")) {
      return "We could not send the sign-in link right now. Check your Supabase email settings and try again.";
    }

    if (message.includes("redirect") || message.includes("redirect_to")) {
      return "The sign-in redirect is not allowed yet. Add this admin URL to your Supabase redirect settings and try again.";
    }

    if (message.includes("duplicate key value") || code === "23505") {
      if (message.includes("slug")) {
        return "This tournament already exists. Use the reset tools if you want to start over.";
      }

      if (message.includes("name")) {
        return "That player is already in the roster.";
      }
    }

    return rawMessage;
  }

  async function runAction(key: string, action: () => Promise<void>) {
    setBusyKey(key);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      await action();
      await refresh();
    } catch (actionError) {
      console.error("Admin action failed", actionError);
      setErrorMessage(formatActionError(actionError));
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
      const courtCount = Math.max(1, Number(courtCountDraft || 1));
      const { error: insertError } = await supabase.from("tournaments").insert({
        slug: TOURNAMENT_SLUG,
        name: TOURNAMENT_NAME,
        status: "setup" satisfies TournamentStatus,
        court_count: courtCount
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

  async function sendVerificationLink(event: FormEvent<HTMLFormElement>) {
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

      setStatusMessage(`A verification link has been sent to ${loginEmail}.`);
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
      matches.some((match) => match.team_a_player_ids.includes(playerId) || match.team_b_player_ids.includes(playerId));

    if (playerIsScheduled) {
      setErrorMessage(`${playerName} is already part of the current event flow. Mark the player inactive instead.`);
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

      await supabase
        .from("matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("match_kind", "scheduled")
        .eq("stage", "group");

      if (groupIds.length > 0) {
        await supabase.from("group_players").delete().in("group_id", groupIds);
        await supabase.from("groups").delete().in("id", groupIds);
      }

      const { groups: nextGroups, groupPlayers: nextGroupPlayers, matches: nextMatches } = buildGroupStageAssets(
        tournament.id,
        activePlayers.map((player) => player.id),
        {
          courtCount: tournament.court_count
        }
      );

      const insertGroups = await supabase.from("groups").insert(nextGroups);

      if (insertGroups.error) {
        throw insertGroups.error;
      }

      const insertGroupPlayers = await supabase.from("group_players").insert(nextGroupPlayers);

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

    if (scheduledMatches.some((match) => match.stage === "quarterfinal")) {
      setErrorMessage("Quarterfinal matches already exist.");
      return;
    }

    const qualifiedPlayers = rankedLeaderboard.slice(0, 16).map((row) => row.player.id);

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

    if (scheduledMatches.some((match) => match.stage === "semifinal")) {
      setErrorMessage("Semifinal matches already exist.");
      return;
    }

    const quarterfinals = scheduledMatches.filter((match) => match.stage === "quarterfinal");
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

    if (scheduledMatches.some((match) => match.stage === "final" || match.stage === "third_place")) {
      setErrorMessage("Final-stage matches already exist.");
      return;
    }

    const semifinals = scheduledMatches.filter((match) => match.stage === "semifinal");

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

  async function clearSchedule() {
    if (!tournament) {
      setErrorMessage("There is no tournament schedule to clear yet.");
      return;
    }

    if (!window.confirm("Clear all groups and matches, but keep the tournament shell and roster?")) {
      return;
    }

    await runAction("clear-schedule", async () => {
      const supabase = await requireSupabase();

      const deleteMatches = await supabase
        .from("matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("match_kind", "scheduled");

      if (deleteMatches.error) {
        throw deleteMatches.error;
      }

      const groupIds = groups.map((group) => group.id);

      if (groupIds.length > 0) {
        const deleteGroupPlayers = await supabase.from("group_players").delete().in("group_id", groupIds);

        if (deleteGroupPlayers.error) {
          throw deleteGroupPlayers.error;
        }

        const deleteGroups = await supabase.from("groups").delete().in("id", groupIds);

        if (deleteGroups.error) {
          throw deleteGroups.error;
        }
      }

      const updateTournament = await supabase.from("tournaments").update({ status: "setup" }).eq("id", tournament.id);

      if (updateTournament.error) {
        throw updateTournament.error;
      }

      setStatusMessage("Schedule cleared. The roster is still available.");
    });
  }

  async function deleteTournament() {
    if (!tournament) {
      setErrorMessage("There is no tournament to delete yet.");
      return;
    }

    if (!window.confirm("Delete the tournament and all of its matches? The player roster will stay.")) {
      return;
    }

    await runAction("delete-tournament", async () => {
      const supabase = await requireSupabase();
      const { error: deleteError } = await supabase.from("tournaments").delete().eq("id", tournament.id);

      if (deleteError) {
        throw deleteError;
      }

      setStatusMessage("Tournament deleted. The roster is still available.");
    });
  }

  async function resetAllData() {
    if (!window.confirm("Reset everything? This removes the tournament, groups, matches, and roster from Supabase.")) {
      return;
    }

    await runAction("reset-all", async () => {
      const supabase = await requireSupabase();

      if (tournament) {
        const { error: tournamentDeleteError } = await supabase.from("tournaments").delete().eq("id", tournament.id);

        if (tournamentDeleteError) {
          throw tournamentDeleteError;
        }
      }

      if (players.length > 0) {
        const { error: playerDeleteError } = await supabase.from("players").delete().neq("id", "");

        if (playerDeleteError) {
          throw playerDeleteError;
        }
      }

      setStatusMessage("All tournament data has been reset.");
    });
  }

  async function saveCourtCount() {
    if (!tournament) {
      setErrorMessage("Create the tournament first so courts can be configured.");
      return;
    }

    const nextCourtCount = Number(courtCountDraft);

    if (!Number.isInteger(nextCourtCount) || nextCourtCount < 1 || nextCourtCount > 32) {
      setErrorMessage("Court count must be a whole number between 1 and 32.");
      return;
    }

    await runAction("save-courts", async () => {
      const supabase = await requireSupabase();
      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ court_count: nextCourtCount })
        .eq("id", tournament.id);

      if (updateError) {
        throw updateError;
      }

      setStatusMessage(`Court count updated to ${nextCourtCount}. Regenerate groups if you want court labels reassigned.`);
    });
  }

  async function createManualMatch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    const selectedIds = [
      manualMatchDraft.teamAPlayerOne,
      manualMatchDraft.teamAPlayerTwo,
      manualMatchDraft.teamBPlayerOne,
      manualMatchDraft.teamBPlayerTwo
    ].filter(Boolean);

    if (selectedIds.length !== 4) {
      setErrorMessage("Select four players before creating a manual match.");
      return;
    }

    if (new Set(selectedIds).size !== 4) {
      setErrorMessage("Each player in a manual match must be unique.");
      return;
    }

    await runAction("manual-match", async () => {
      const supabase = await requireSupabase();
      const stageMatches = manualMatches.filter((match) => match.stage === manualMatchDraft.stage);
      const nextRoundOrder = stageMatches.length + 1;
      const courtName = manualMatchDraft.courtNumber.trim() ? `Court ${manualMatchDraft.courtNumber.trim()}` : null;
      const { error: insertError } = await supabase.from("matches").insert({
        tournament_id: tournament.id,
        group_id: null,
        match_kind: "manual",
        stage: manualMatchDraft.stage,
        round_order: nextRoundOrder,
        court_name: courtName,
        scheduled_label: manualMatchDraft.scheduledLabel.trim() || `Manual Match ${nextRoundOrder}`,
        team_a_player_ids: [manualMatchDraft.teamAPlayerOne, manualMatchDraft.teamAPlayerTwo],
        team_b_player_ids: [manualMatchDraft.teamBPlayerOne, manualMatchDraft.teamBPlayerTwo],
        team_a_score: 0,
        team_b_score: 0,
        is_live: false,
        is_complete: false
      });

      if (insertError) {
        throw insertError;
      }

      setManualMatchDraft({
        stage: DEFAULT_MANUAL_STAGE,
        courtNumber: courtFilter.trim(),
        scheduledLabel: "",
        teamAPlayerOne: "",
        teamAPlayerTwo: "",
        teamBPlayerOne: "",
        teamBPlayerTwo: ""
      });
      setStatusMessage("Manual match created.");
    });
  }

  async function deleteMatch(match: Match) {
    const label = match.scheduled_label ?? `Match ${match.round_order}`;
    const matchKindLabel = match.match_kind === "manual" ? "manual match" : "scheduled match";

    if (!window.confirm(`Delete ${label}? This ${matchKindLabel} will be removed from the event.`)) {
      return;
    }

    await runAction(`delete-match-${match.id}`, async () => {
      const supabase = await requireSupabase();
      const { error: deleteError } = await supabase
        .from("matches")
        .delete()
        .eq("id", match.id)
        .eq("match_kind", match.match_kind);

      if (deleteError) {
        throw deleteError;
      }

      setStatusMessage(`${label} deleted.`);
    });
  }

  async function deleteScheduledStage(stage: "quarterfinal" | "semifinal" | "final") {
    if (!tournament) {
      setErrorMessage("Create the tournament first.");
      return;
    }

    const stageMap = {
      quarterfinal: ["quarterfinal", "semifinal", "final", "third_place"],
      semifinal: ["semifinal", "final", "third_place"],
      final: ["final", "third_place"]
    } as const;
    const labelMap = {
      quarterfinal: "quarterfinals",
      semifinal: "semifinals",
      final: "final stage"
    } as const;
    const nextStatus: TournamentStatus = stage === "quarterfinal" ? "group" : "knockout";

    if (
      !window.confirm(
        `Delete the ${labelMap[stage]} and any rounds that come after them? This only removes scheduled tournament matches.`
      )
    ) {
      return;
    }

    await runAction(`delete-stage-${stage}`, async () => {
      const supabase = await requireSupabase();
      const stagesToDelete = [...stageMap[stage]];
      const { error: deleteError } = await supabase
        .from("matches")
        .delete()
        .eq("tournament_id", tournament.id)
        .eq("match_kind", "scheduled")
        .in("stage", stagesToDelete);

      if (deleteError) {
        throw deleteError;
      }

      const { error: updateError } = await supabase
        .from("tournaments")
        .update({ status: nextStatus })
        .eq("id", tournament.id);

      if (updateError) {
        throw updateError;
      }

      setStatusMessage(`Scheduled ${labelMap[stage]} removed.`);
    });
  }

  function renderCurrentView() {
    switch (activeView) {
      case "setup":
        return (
          <section className="admin-card admin-workspace">
            <div className="section-heading">
              <div>
                <h3>Setup & Bracket Controls</h3>
                <p>Set court capacity, seed the roster, create groups, and move the tournament into knockout play.</p>
              </div>
              <span className="section-stat">{tournament?.status ?? "setup"}</span>
            </div>
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
            <div className="form-grid compact-grid">
              <div className="field">
                <label htmlFor="courtCount">Number of courts</label>
                <input
                  id="courtCount"
                  inputMode="numeric"
                  min={1}
                  max={32}
                  value={courtCountDraft}
                  onChange={(event) => setCourtCountDraft(event.target.value)}
                />
              </div>
              <div className="button-row button-row-end">
                <button
                  className="button button-secondary"
                  disabled={!canEdit || busyKey === "save-courts"}
                  onClick={() => void saveCourtCount()}
                  type="button"
                >
                  Save courts
                </button>
              </div>
            </div>
            <div className="admin-facts">
              <div className="fact-row">
                <span>Tournament</span>
                <strong>{tournament?.name ?? "Not created yet"}</strong>
              </div>
              <div className="fact-row">
                <span>Groups created</span>
                <strong>{groups.length}</strong>
              </div>
              <div className="fact-row">
                <span>Configured courts</span>
                <strong>{tournament?.court_count ?? 1}</strong>
              </div>
              <div className="fact-row">
                <span>Qualifiers</span>
                <strong>{rankedLeaderboard.length >= 16 ? "Top 16 ready" : `${rankedLeaderboard.length}/16 ranked`}</strong>
              </div>
            </div>
            <div className="nested-admin-card">
              <h3>Bracket Cleanup</h3>
              <p>Remove a generated round if it was created by mistake. Deleting a round also removes any later scheduled rounds.</p>
              <div className="admin-toolbar">
                <button
                  className="button button-secondary"
                  disabled={!canEdit || quarterfinalCount === 0 || busyKey === "delete-stage-quarterfinal"}
                  onClick={() => void deleteScheduledStage("quarterfinal")}
                  type="button"
                >
                  Delete quarterfinals
                </button>
                <button
                  className="button button-secondary"
                  disabled={!canEdit || semifinalCount === 0 || busyKey === "delete-stage-semifinal"}
                  onClick={() => void deleteScheduledStage("semifinal")}
                  type="button"
                >
                  Delete semifinals
                </button>
                <button
                  className="button button-secondary"
                  disabled={!canEdit || finalStageCount === 0 || busyKey === "delete-stage-final"}
                  onClick={() => void deleteScheduledStage("final")}
                  type="button"
                >
                  Delete final stage
                </button>
              </div>
            </div>
          </section>
        );
      case "roster":
        return (
          <section className="admin-card admin-workspace">
            <div className="section-heading">
              <div>
                <h3>Roster</h3>
                <p>Manage the player list, search quickly, and mark players active before groups are generated.</p>
              </div>
              <span className="section-stat">{players.length} players</span>
            </div>
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
        );
      case "scheduled":
        return (
          <section className="admin-card admin-workspace">
            <div className="section-heading">
              <div>
                <h3>Scheduled Matches</h3>
                <p>Focus on official tournament matches only. Filter by court to give each scorer a cleaner working view.</p>
              </div>
              <span className="section-stat">{scheduledMatches.length} total</span>
            </div>
            <div className="form-grid compact-grid">
              <div className="field">
                <label htmlFor="courtFilter">Court filter</label>
                <input
                  id="courtFilter"
                  inputMode="numeric"
                  placeholder="All courts"
                  value={courtFilter}
                  onChange={(event) => setCourtFilter(event.target.value)}
                />
              </div>
            </div>
            <div className="match-admin-list">
              {visibleScheduledMatches.length > 0 ? (
                visibleScheduledMatches.map((match) => (
                  <MatchEditor
                    key={match.id}
                    busy={!canEdit || busyKey === `match-${match.id}` || busyKey === `delete-match-${match.id}`}
                    match={match}
                    players={players}
                    onDelete={() => void deleteMatch(match)}
                    onSave={(nextMatch) => void saveMatch(nextMatch)}
                  />
                ))
              ) : (
                <div className="empty-state">No scheduled matches match this court filter yet.</div>
              )}
            </div>
          </section>
        );
      case "manual":
        return (
          <section className="admin-card admin-workspace">
            <div className="section-heading">
              <div>
                <h3>Manual Matches</h3>
                <p>Add standalone matches here without mixing them into the official generated schedule.</p>
              </div>
              <span className="section-stat">{manualMatches.length} total</span>
            </div>
            <form className="admin-card nested-admin-card" onSubmit={(event) => void createManualMatch(event)}>
              <h3>Manual Match Builder</h3>
              <div className="form-grid compact-grid">
                <div className="field">
                  <label htmlFor="manualStage">Stage</label>
                  <select
                    id="manualStage"
                    value={manualMatchDraft.stage}
                    onChange={(event) =>
                      setManualMatchDraft((current) => ({
                        ...current,
                        stage: event.target.value as Match["stage"]
                      }))
                    }
                  >
                    <option value="group">Group</option>
                    <option value="quarterfinal">Quarter Final</option>
                    <option value="semifinal">Semi Final</option>
                    <option value="third_place">Third Place</option>
                    <option value="final">Final</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="manualCourt">Court number</label>
                  <input
                    id="manualCourt"
                    inputMode="numeric"
                    placeholder="1"
                    value={manualMatchDraft.courtNumber}
                    onChange={(event) =>
                      setManualMatchDraft((current) => ({ ...current, courtNumber: event.target.value }))
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="manualLabel">Label</label>
                  <input
                    id="manualLabel"
                    placeholder="Manual Match"
                    value={manualMatchDraft.scheduledLabel}
                    onChange={(event) =>
                      setManualMatchDraft((current) => ({ ...current, scheduledLabel: event.target.value }))
                    }
                  />
                </div>
              </div>
              <div className="manual-match-grid">
                <PlayerSelect
                  id="teamAPlayerOne"
                  label="Team A player 1"
                  options={activePlayers}
                  value={manualMatchDraft.teamAPlayerOne}
                  onChange={(value) => setManualMatchDraft((current) => ({ ...current, teamAPlayerOne: value }))}
                />
                <PlayerSelect
                  id="teamAPlayerTwo"
                  label="Team A player 2"
                  options={activePlayers}
                  value={manualMatchDraft.teamAPlayerTwo}
                  onChange={(value) => setManualMatchDraft((current) => ({ ...current, teamAPlayerTwo: value }))}
                />
                <PlayerSelect
                  id="teamBPlayerOne"
                  label="Team B player 1"
                  options={activePlayers}
                  value={manualMatchDraft.teamBPlayerOne}
                  onChange={(value) => setManualMatchDraft((current) => ({ ...current, teamBPlayerOne: value }))}
                />
                <PlayerSelect
                  id="teamBPlayerTwo"
                  label="Team B player 2"
                  options={activePlayers}
                  value={manualMatchDraft.teamBPlayerTwo}
                  onChange={(value) => setManualMatchDraft((current) => ({ ...current, teamBPlayerTwo: value }))}
                />
              </div>
              <div className="button-row">
                <button className="button button-primary" disabled={!canEdit || busyKey === "manual-match"} type="submit">
                  Add manual match
                </button>
              </div>
            </form>
            <div className="form-grid compact-grid">
              <div className="field">
                <label htmlFor="manualCourtFilter">Court filter</label>
                <input
                  id="manualCourtFilter"
                  inputMode="numeric"
                  placeholder="All courts"
                  value={courtFilter}
                  onChange={(event) => setCourtFilter(event.target.value)}
                />
              </div>
            </div>
            <div className="match-admin-list">
              {visibleManualMatches.length > 0 ? (
                visibleManualMatches.map((match) => (
                  <MatchEditor
                    key={match.id}
                    busy={!canEdit || busyKey === `match-${match.id}` || busyKey === `delete-match-${match.id}`}
                    match={match}
                    players={players}
                    onDelete={() => void deleteMatch(match)}
                    onSave={(nextMatch) => void saveMatch(nextMatch)}
                  />
                ))
              ) : (
                <div className="empty-state">No manual matches match this court filter yet.</div>
              )}
            </div>
          </section>
        );
      case "reset":
        return (
          <section className="admin-card admin-workspace admin-workspace-danger">
            <div className="section-heading">
              <div>
                <h3>Reset & Delete</h3>
                <p>Use these only when you want to restart setup, remove the tournament shell, or wipe all event data.</p>
              </div>
              <span className="section-stat">Use carefully</span>
            </div>
            <div className="admin-toolbar">
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "clear-schedule"}
                onClick={() => void clearSchedule()}
              >
                Clear schedule
              </button>
              <button
                className="button button-secondary"
                disabled={!canEdit || busyKey === "delete-tournament"}
                onClick={() => void deleteTournament()}
              >
                Delete tournament
              </button>
              <button
                className="button button-danger"
                disabled={!canEdit || busyKey === "reset-all"}
                onClick={() => void resetAllData()}
              >
                Reset all data
              </button>
            </div>
            <div className="admin-facts">
              <div className="fact-row">
                <span>Clear schedule</span>
                <strong>Keeps the roster, removes groups and matches</strong>
              </div>
              <div className="fact-row">
                <span>Delete tournament</span>
                <strong>Removes the tournament shell and all match history</strong>
              </div>
              <div className="fact-row">
                <span>Reset all data</span>
                <strong>Removes tournament data and roster from Supabase</strong>
              </div>
            </div>
          </section>
        );
      default:
        return null;
    }
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
            <span className="topbar-spacer" aria-hidden="true" />
          )}
        </header>

        <section className="admin-hero">
          <div>
            <div className="admin-kicker">Asirt Pickleball Admin</div>
            <h2>Tournament control room</h2>
            <p className="admin-hero-copy">
              Manage the roster, run live scoring court by court, and move the event through each round from one clean workspace.
            </p>
          </div>
          <div className="admin-status-strip">
            <Link className="badge" href="/">
              Public board
            </Link>
          </div>

          {isDemo ? (
            <div className="status-banner">
              This admin view is still using demo content. Connect your Supabase project, then refresh.
            </div>
          ) : null}
          {loading && players.length === 0 ? <div className="message">Loading tournament data.</div> : null}
          {error ? <div className="message error">{error}</div> : null}
          {statusMessage ? <div className="message">{statusMessage}</div> : null}
          {errorMessage ? <div className="message error">{errorMessage}</div> : null}
          {supabaseConfigured && !sessionEmail ? (
            <div className="message">Sign in with an approved organizer email to unlock setup, scoring, and live updates.</div>
          ) : null}
          {sessionEmail && isAdminUser === false ? (
            <div className="message error">{sessionEmail} is signed in, but this email has not been approved for editing yet.</div>
          ) : null}

          {!supabaseConfigured ? null : !sessionEmail ? (
            <form className="login-panel" onSubmit={(event) => void sendVerificationLink(event)}>
              <div className="field">
                <label htmlFor="loginEmail">Organizer email</label>
                <input
                  id="loginEmail"
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(event) => setLoginEmail(event.target.value)}
                  placeholder="organizer@example.com"
                />
              </div>
              <div className="button-row button-row-end">
                <button className="button button-primary" disabled={busyKey === "magic-link"} type="submit">
                  Send verification link
                </button>
              </div>
            </form>
          ) : sessionEmail ? (
            <div className="message">Signed in as {sessionEmail}.</div>
          ) : null}
        </section>

        <div className="admin-summary-grid">
          <div className="summary-card">
            <span className="summary-label">Roster</span>
            <strong>{players.length}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Active</span>
            <strong>{activePlayers.length}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Live courts</span>
            <strong>{liveScheduledMatches}</strong>
          </div>
          <div className="summary-card">
            <span className="summary-label">Manual matches</span>
            <strong>{manualMatches.length}</strong>
          </div>
        </div>

        <nav className="admin-section-nav" aria-label="Admin sections">
          {sections.map((section) => (
            <button
              key={section.id}
              className={activeView === section.id ? "admin-section-tab is-active" : "admin-section-tab"}
              onClick={() => setActiveView(section.id)}
              type="button"
            >
              <span className="tab-title">{section.label}</span>
              <span className="tab-detail">{section.detail}</span>
              {section.count > 0 ? <span className="tab-count">{section.count}</span> : null}
            </button>
          ))}
        </nav>

        <div className="admin-content-stack">{renderCurrentView()}</div>
      </div>
    </main>
  );
}

function PlayerSelect({
  id,
  label,
  options,
  value,
  onChange
}: {
  id: string;
  label: string;
  options: Player[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Select player</option>
        {options.map((player) => (
          <option key={player.id} value={player.id}>
            {player.name}
          </option>
        ))}
      </select>
    </div>
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
  onDelete,
  busy
}: {
  match: Match;
  players: Player[];
  onSave: (match: Match) => void;
  onDelete?: () => void;
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
        {onDelete ? (
          <button className="button button-danger" disabled={busy} onClick={onDelete} type="button">
            Delete match
          </button>
        ) : null}
      </div>
    </div>
  );
}
