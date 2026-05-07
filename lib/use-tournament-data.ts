"use client";

import { useCallback, useEffect, useState } from "react";
import { createDemoState } from "@/lib/seed";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import { TournamentState } from "@/lib/types";

interface UseTournamentDataResult extends TournamentState {
  loading: boolean;
  error: string | null;
  isDemo: boolean;
  refresh: () => Promise<void>;
}

interface UseTournamentDataOptions {
  publicDemoFallback?: boolean;
}

const DEMO_STATE = createDemoState();

export function useTournamentData(options: UseTournamentDataOptions = {}): UseTournamentDataResult {
  const [state, setState] = useState<TournamentState>(DEMO_STATE);
  const [loading, setLoading] = useState(Boolean(getSupabaseBrowserClient()));
  const [error, setError] = useState<string | null>(null);
  const [isDemo, setIsDemo] = useState(true);

  const refresh = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setState(DEMO_STATE);
      setLoading(false);
      setError(null);
      setIsDemo(true);
      return;
    }

    setLoading(true);
    setError(null);

    const [tournamentsResult, playersResult, groupsResult, groupPlayersResult, matchesResult] = await Promise.all([
      supabase.from("tournaments").select("*").order("created_at", { ascending: true }).limit(1).maybeSingle(),
      supabase.from("players").select("*").order("name", { ascending: true }),
      supabase.from("groups").select("*").order("group_number", { ascending: true }),
      supabase.from("group_players").select("*").order("seat", { ascending: true }),
      supabase.from("matches").select("*").order("stage", { ascending: true }).order("round_order", { ascending: true })
    ]);

    const results = [tournamentsResult, playersResult, groupsResult, groupPlayersResult, matchesResult];
    const failedResult = results.find((result) => result.error);

    if (failedResult?.error) {
      setError(failedResult.error.message);
      setLoading(false);
      return;
    }

    const nextState = {
      tournament: tournamentsResult.data,
      players: playersResult.data ?? [],
      groups: groupsResult.data ?? [],
      groupPlayers: groupPlayersResult.data ?? [],
      matches: matchesResult.data ?? []
    };

    if (
      options.publicDemoFallback &&
      !nextState.tournament &&
      nextState.players.length === 0 &&
      nextState.groups.length === 0 &&
      nextState.matches.length === 0
    ) {
      setState(DEMO_STATE);
      setIsDemo(true);
      setLoading(false);
      return;
    }

    setState(nextState);
    setIsDemo(false);
    setLoading(false);
  }, [options.publicDemoFallback]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const channel = supabase
      .channel("public:tournament")
      .on("postgres_changes", { event: "*", schema: "public", table: "players" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "tournaments" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "groups" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "group_players" }, () => void refresh())
      .on("postgres_changes", { event: "*", schema: "public", table: "matches" }, () => void refresh())
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return {
    ...state,
    loading,
    error,
    isDemo,
    refresh
  };
}
