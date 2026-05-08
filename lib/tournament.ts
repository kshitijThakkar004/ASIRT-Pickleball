import { Group, GroupPlayer, LeaderboardRow, Match, Player, Stage } from "@/lib/types";

const GROUP_PAIR_LAYOUTS = [
  { label: "Pairing 1", team: [0, 1], partnerRound: 0 },
  { label: "Pairing 2", team: [0, 2], partnerRound: 1 },
  { label: "Pairing 3", team: [0, 3], partnerRound: 2 },
  { label: "Pairing 4", team: [1, 2], partnerRound: 2 },
  { label: "Pairing 5", team: [1, 3], partnerRound: 1 },
  { label: "Pairing 6", team: [2, 3], partnerRound: 0 }
] as const;

interface GroupStagePairing {
  groupId: string;
  groupNumber: number;
  playerIds: string[];
  label: string;
  partnerRound: number;
}

export function shuffle<T>(values: T[]) {
  const copy = [...values];

  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }

  return copy;
}

const STAGE_DISPLAY_ORDER: Stage[] = ["group", "quarterfinal", "semifinal", "third_place", "final"];
const KNOCKOUT_STAGE_ORDER: Stage[] = ["quarterfinal", "semifinal", "third_place", "final"];
const HISTORY_STAGE_ORDER: Stage[] = ["final", "third_place", "semifinal", "quarterfinal", "group"];

function buildStageOrderMap(order: Stage[]) {
  return new Map(order.map((stage, index) => [stage, index]));
}

const stageDisplayRank = buildStageOrderMap(STAGE_DISPLAY_ORDER);
const historyStageRank = buildStageOrderMap(HISTORY_STAGE_ORDER);

export function getStageLabel(stage: Stage) {
  switch (stage) {
    case "group":
      return "Group Stage";
    case "quarterfinal":
      return "Quarter Finals";
    case "semifinal":
      return "Semi Finals";
    case "third_place":
      return "Third Place";
    case "final":
      return "Final";
    default:
      return stage;
  }
}

export function getMatchWinnerKey(match: Match) {
  if (!match.is_complete || match.team_a_score === match.team_b_score) {
    return null;
  }

  return match.team_a_score > match.team_b_score ? "a" : "b";
}

function sortMatchesByDisplay(left: Match, right: Match) {
  const leftStage = stageDisplayRank.get(left.stage) ?? 0;
  const rightStage = stageDisplayRank.get(right.stage) ?? 0;

  if (left.is_live !== right.is_live) {
    return left.is_live ? -1 : 1;
  }

  if (leftStage !== rightStage) {
    return leftStage - rightStage;
  }

  const leftCourt = extractCourtNumber(left.court_name);
  const rightCourt = extractCourtNumber(right.court_name);

  if (leftCourt !== rightCourt) {
    return leftCourt - rightCourt;
  }

  return left.round_order - right.round_order;
}

export function getLiveMatches(matches: Match[]) {
  return matches.filter((match) => match.is_live && !match.is_complete).sort(sortMatchesByDisplay);
}

export function getUpcomingMatches(matches: Match[]) {
  return matches.filter((match) => !match.is_complete).sort(sortMatchesByDisplay);
}

export function getCompletedMatches(matches: Match[]) {
  return matches.slice().filter((match) => match.is_complete).sort((left, right) => {
    const leftStage = historyStageRank.get(left.stage) ?? Number.MAX_SAFE_INTEGER;
    const rightStage = historyStageRank.get(right.stage) ?? Number.MAX_SAFE_INTEGER;

    if (left.match_kind !== right.match_kind) {
      return left.match_kind === "scheduled" ? -1 : 1;
    }

    if (leftStage !== rightStage) {
      return leftStage - rightStage;
    }

    if (left.round_order !== right.round_order) {
      return right.round_order - left.round_order;
    }

    return extractCourtNumber(left.court_name) - extractCourtNumber(right.court_name);
  });
}

export function getKnockoutMatchesByStage(matches: Match[]) {
  return KNOCKOUT_STAGE_ORDER.map((stage) => ({
    stage,
    matches: matches
      .filter((match) => match.match_kind === "scheduled" && match.stage === stage)
      .sort((left, right) => left.round_order - right.round_order)
  }));
}

interface BuildGroupStageAssetsOptions {
  idFactory?: () => string;
  randomize?: boolean;
  courtCount?: number;
}

function updateGroupCount(counter: Map<string, Map<string, number>>, leftGroupId: string, rightGroupId: string) {
  const leftBucket = counter.get(leftGroupId) ?? new Map<string, number>();
  const rightBucket = counter.get(rightGroupId) ?? new Map<string, number>();

  leftBucket.set(rightGroupId, (leftBucket.get(rightGroupId) ?? 0) + 1);
  rightBucket.set(leftGroupId, (rightBucket.get(leftGroupId) ?? 0) + 1);

  counter.set(leftGroupId, leftBucket);
  counter.set(rightGroupId, rightBucket);
}

function getGroupCount(counter: Map<string, Map<string, number>>, leftGroupId: string, rightGroupId: string) {
  return counter.get(leftGroupId)?.get(rightGroupId) ?? 0;
}

function cloneGroupCounter(counter: Map<string, Map<string, number>>) {
  return new Map([...counter.entries()].map(([groupId, bucket]) => [groupId, new Map(bucket)]));
}

function randomTieBreaker(randomize: boolean) {
  return randomize ? Math.random() : 0;
}

function buildRoundMatches(
  pairings: GroupStagePairing[],
  options: BuildGroupStageAssetsOptions,
  globalOpponentCounts: Map<string, Map<string, number>>
) {
  const maxAttempts = options.randomize === false ? 1 : 240;
  let bestMatches: Array<{ teamA: GroupStagePairing; teamB: GroupStagePairing }> | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  let bestCounter: Map<string, Map<string, number>> | null = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const remaining = pairings.slice().sort((left, right) => {
      if (left.groupNumber !== right.groupNumber) {
        return left.groupNumber - right.groupNumber;
      }

      return left.label.localeCompare(right.label);
    });
    const roundOpponentCounts = new Map<string, Map<string, number>>();
    const workingGlobalCounts = cloneGroupCounter(globalOpponentCounts);
    const matches: Array<{ teamA: GroupStagePairing; teamB: GroupStagePairing }> = [];
    let score = 0;
    let failed = false;

    while (remaining.length > 0) {
      remaining.sort((left, right) => {
        const leftChoices = remaining.filter((candidate) => candidate !== left && candidate.groupId !== left.groupId).length;
        const rightChoices = remaining.filter((candidate) => candidate !== right && candidate.groupId !== right.groupId).length;

        if (leftChoices !== rightChoices) {
          return leftChoices - rightChoices;
        }

        return randomTieBreaker(Boolean(options.randomize)) - randomTieBreaker(Boolean(options.randomize));
      });

      const source = remaining.shift();

      if (!source) {
        break;
      }

      const candidates = remaining
        .filter((candidate) => candidate.groupId !== source.groupId)
        .map((candidate) => ({
          candidate,
          penalty:
            getGroupCount(workingGlobalCounts, source.groupId, candidate.groupId) * 100 +
            getGroupCount(roundOpponentCounts, source.groupId, candidate.groupId) * 35 +
            randomTieBreaker(Boolean(options.randomize))
        }))
        .sort((left, right) => left.penalty - right.penalty);

      const nextOpponent = candidates[0]?.candidate;

      if (!nextOpponent) {
        failed = true;
        break;
      }

      remaining.splice(
        remaining.findIndex((candidate) => candidate === nextOpponent),
        1
      );
      matches.push({ teamA: source, teamB: nextOpponent });
      score += candidates[0]?.penalty ?? 0;
      updateGroupCount(workingGlobalCounts, source.groupId, nextOpponent.groupId);
      updateGroupCount(roundOpponentCounts, source.groupId, nextOpponent.groupId);
    }

    if (failed) {
      continue;
    }

    if (score < bestScore) {
      bestScore = score;
      bestMatches = matches;
      bestCounter = workingGlobalCounts;
    }

    if (score === 0) {
      break;
    }
  }

  if (!bestMatches) {
    throw new Error("Could not spread group-stage opponents across the wider player pool. Please try again.");
  }

  if (bestCounter) {
    globalOpponentCounts.clear();
    bestCounter.forEach((bucket, groupId) => {
      globalOpponentCounts.set(groupId, new Map(bucket));
    });
  }

  return bestMatches;
}

function scheduleGroupMatches(
  rawMatches: Array<{
    teamA: GroupStagePairing;
    teamB: GroupStagePairing;
  }>,
  courtCount: number,
  randomize: boolean
) {
  const lastRoundByPlayer = new Map<string, number>();
  const unscheduled = randomize ? shuffle(rawMatches) : rawMatches.slice();
  const scheduled: Array<{
    teamA: GroupStagePairing;
    teamB: GroupStagePairing;
    roundOrder: number;
    courtName: string;
  }> = [];
  let roundOrder = 1;

  while (unscheduled.length > 0) {
    const usedPlayers = new Set<string>();
    const roundMatches: typeof unscheduled = [];

    while (roundMatches.length < courtCount) {
      const eligible = unscheduled.filter(({ teamA, teamB }) => {
        const participants = [...teamA.playerIds, ...teamB.playerIds];
        return participants.every((playerId) => !usedPlayers.has(playerId));
      });

      if (eligible.length === 0) {
        break;
      }

      const preferred = eligible.filter(({ teamA, teamB }) =>
        [...teamA.playerIds, ...teamB.playerIds].every((playerId) => roundOrder - (lastRoundByPlayer.get(playerId) ?? -99) >= 2)
      );
      const pool = preferred.length > 0 ? preferred : eligible;
      const ranked = pool
        .map((match) => {
          const participants = [...match.teamA.playerIds, ...match.teamB.playerIds];
          const minimumRest = Math.min(...participants.map((playerId) => roundOrder - (lastRoundByPlayer.get(playerId) ?? -99)));
          const averageRest =
            participants.reduce((total, playerId) => total + (roundOrder - (lastRoundByPlayer.get(playerId) ?? -99)), 0) /
            participants.length;

          return {
            match,
            minimumRest,
            averageRest
          };
        })
        .sort((left, right) => {
          if (right.minimumRest !== left.minimumRest) {
            return right.minimumRest - left.minimumRest;
          }

          if (right.averageRest !== left.averageRest) {
            return right.averageRest - left.averageRest;
          }

          if (left.match.teamA.partnerRound !== right.match.teamA.partnerRound) {
            return left.match.teamA.partnerRound - right.match.teamA.partnerRound;
          }

          return randomTieBreaker(randomize) - randomTieBreaker(randomize);
        });

      const nextMatch = ranked[0]?.match;

      if (!nextMatch) {
        break;
      }

      unscheduled.splice(
        unscheduled.findIndex((candidate) => candidate === nextMatch),
        1
      );
      roundMatches.push(nextMatch);
      [...nextMatch.teamA.playerIds, ...nextMatch.teamB.playerIds].forEach((playerId) => {
        usedPlayers.add(playerId);
      });
    }

    roundMatches.forEach((match, index) => {
      [...match.teamA.playerIds, ...match.teamB.playerIds].forEach((playerId) => {
        lastRoundByPlayer.set(playerId, roundOrder);
      });

      scheduled.push({
        ...match,
        roundOrder,
        courtName: `Court ${index + 1}`
      });
    });

    roundOrder += 1;
  }

  return scheduled;
}

export function buildGroupStageAssets(
  tournamentId: string,
  playerIds: string[],
  options: BuildGroupStageAssetsOptions = {}
) {
  if (playerIds.length === 0 || playerIds.length % 4 !== 0) {
    throw new Error("Active players must be divisible into groups of 4.");
  }

  if (playerIds.length < 8) {
    throw new Error("At least 8 active players are required so group pairings can face teams from the wider pool.");
  }

  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const courtCount = Math.max(1, options.courtCount ?? 1);
  const shuffledPlayerIds = options.randomize === false ? [...playerIds] : shuffle(playerIds);
  const groups: Group[] = [];
  const groupPlayers: GroupPlayer[] = [];
  const matches: Match[] = [];
  const pairingsByPartnerRound = new Map<number, GroupStagePairing[]>();

  for (let index = 0; index < shuffledPlayerIds.length; index += 4) {
    const groupNumber = index / 4 + 1;
    const groupId = idFactory();
    const groupRoster = shuffledPlayerIds.slice(index, index + 4);

    groups.push({
      id: groupId,
      tournament_id: tournamentId,
      group_number: groupNumber
    });

    groupRoster.forEach((playerId, seat) => {
      groupPlayers.push({
        id: idFactory(),
        group_id: groupId,
        player_id: playerId,
        seat
      });
    });

    GROUP_PAIR_LAYOUTS.forEach((layout) => {
      const nextPairing = {
      groupId,
      groupNumber,
      playerIds: layout.team.map((seat) => groupRoster[seat]),
      label: layout.label,
      partnerRound: layout.partnerRound
      } satisfies GroupStagePairing;

      const bucket = pairingsByPartnerRound.get(layout.partnerRound) ?? [];
      bucket.push(nextPairing);
      pairingsByPartnerRound.set(layout.partnerRound, bucket);
    });
  }

  const globalOpponentCounts = new Map<string, Map<string, number>>();
  const rawMatches = [...pairingsByPartnerRound.entries()]
    .sort((left, right) => left[0] - right[0])
    .flatMap(([, pairings]) => buildRoundMatches(pairings, options, globalOpponentCounts));
  const scheduledMatches = scheduleGroupMatches(rawMatches, courtCount, Boolean(options.randomize));

  scheduledMatches.forEach(({ teamA, teamB, roundOrder, courtName }) => {
    matches.push({
      id: idFactory(),
      tournament_id: tournamentId,
      group_id: null,
      match_kind: "scheduled",
      stage: "group",
      round_order: roundOrder,
      court_name: courtName,
      scheduled_label: `Group ${String.fromCharCode(64 + teamA.groupNumber)} ${teamA.label} vs Group ${String.fromCharCode(
        64 + teamB.groupNumber
      )} ${teamB.label}`,
      team_a_player_ids: teamA.playerIds,
      team_b_player_ids: teamB.playerIds,
      team_a_score: 0,
      team_b_score: 0,
      is_live: false,
      is_complete: false
    });
  });

  return { groups, groupPlayers, matches };
}

export function calculateLeaderboard(players: Player[], matches: Match[]) {
  const playerMap = new Map(players.map((player) => [player.id, player]));
  const groupMatches = matches.filter(
    (match) => match.match_kind === "scheduled" && match.stage === "group" && match.is_complete
  );
  const totals = new Map<
    string,
    {
      pointsFor: number;
      pointsAgainst: number;
      matchesPlayed: number;
      wins: number;
    }
  >();

  players.forEach((player) => {
    totals.set(player.id, {
      pointsFor: 0,
      pointsAgainst: 0,
      matchesPlayed: 0,
      wins: 0
    });
  });

  for (const match of groupMatches) {
    const winnerKey = match.team_a_score === match.team_b_score ? null : match.team_a_score > match.team_b_score ? "a" : "b";

    match.team_a_player_ids.forEach((playerId) => {
      const bucket = totals.get(playerId);

      if (!bucket) {
        return;
      }

      bucket.pointsFor += match.team_a_score;
      bucket.pointsAgainst += match.team_b_score;
      bucket.matchesPlayed += 1;

      if (winnerKey === "a") {
        bucket.wins += 1;
      }
    });

    match.team_b_player_ids.forEach((playerId) => {
      const bucket = totals.get(playerId);

      if (!bucket) {
        return;
      }

      bucket.pointsFor += match.team_b_score;
      bucket.pointsAgainst += match.team_a_score;
      bucket.matchesPlayed += 1;

      if (winnerKey === "b") {
        bucket.wins += 1;
      }
    });
  }

  return [...totals.entries()]
    .map(([playerId, total]) => {
      const player = playerMap.get(playerId);

      if (!player) {
        return null;
      }

      return {
        player,
        rank: 0,
        pointsFor: total.pointsFor,
        pointsAgainst: total.pointsAgainst,
        differential: total.pointsFor - total.pointsAgainst,
        matchesPlayed: total.matchesPlayed,
        wins: total.wins
      } satisfies LeaderboardRow;
    })
    .filter((row): row is LeaderboardRow => Boolean(row))
    .sort((left, right) => {
      if (right.pointsFor !== left.pointsFor) {
        return right.pointsFor - left.pointsFor;
      }

      if (right.differential !== left.differential) {
        return right.differential - left.differential;
      }

      return left.player.name.localeCompare(right.player.name);
    })
    .map((row, index) => ({
      ...row,
      rank: index + 1
    }));
}

export function buildKnockoutMatches(tournamentId: string, playerIds: string[], stage: Extract<Stage, "quarterfinal" | "semifinal">) {
  const expectedPlayers = stage === "quarterfinal" ? 16 : 8;

  if (playerIds.length !== expectedPlayers) {
    throw new Error(`${stage} requires exactly ${expectedPlayers} players.`);
  }

  const shuffled = shuffle(playerIds);
  const teams: string[][] = [];

  for (let index = 0; index < shuffled.length; index += 2) {
    teams.push(shuffled.slice(index, index + 2));
  }

  const matches: Match[] = [];

  for (let index = 0; index < teams.length; index += 2) {
    matches.push({
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      group_id: null,
      match_kind: "scheduled",
      stage,
      round_order: index / 2 + 1,
      court_name: null,
      scheduled_label: stage === "quarterfinal" ? `Quarter Final ${index / 2 + 1}` : `Semi Final ${index / 2 + 1}`,
      team_a_player_ids: teams[index],
      team_b_player_ids: teams[index + 1],
      team_a_score: 0,
      team_b_score: 0,
      is_live: false,
      is_complete: false
    });
  }

  return matches;
}

export function buildFinalStageMatches(tournamentId: string, semifinalMatches: Match[]) {
  const winners: string[] = [];
  const losers: string[] = [];

  semifinalMatches.forEach((match) => {
    if (!match.is_complete) {
      throw new Error("All semifinal matches must be complete first.");
    }

    if (match.team_a_score === match.team_b_score) {
      throw new Error("Semifinal matches cannot end in a tie.");
    }

    const winnerIds = match.team_a_score > match.team_b_score ? match.team_a_player_ids : match.team_b_player_ids;
    const loserIds = match.team_a_score > match.team_b_score ? match.team_b_player_ids : match.team_a_player_ids;

    winners.push(...winnerIds);
    losers.push(...loserIds);
  });

  const randomizedWinners = shuffle(winners);
  const randomizedLosers = shuffle(losers);

  return [
    {
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      group_id: null,
      match_kind: "scheduled",
      stage: "final" as const,
      round_order: 1,
      court_name: null,
      scheduled_label: "Final",
      team_a_player_ids: randomizedWinners.slice(0, 2),
      team_b_player_ids: randomizedWinners.slice(2, 4),
      team_a_score: 0,
      team_b_score: 0,
      is_live: false,
      is_complete: false
    },
    {
      id: crypto.randomUUID(),
      tournament_id: tournamentId,
      group_id: null,
      match_kind: "scheduled",
      stage: "third_place" as const,
      round_order: 1,
      court_name: null,
      scheduled_label: "Third Place",
      team_a_player_ids: randomizedLosers.slice(0, 2),
      team_b_player_ids: randomizedLosers.slice(2, 4),
      team_a_score: 0,
      team_b_score: 0,
      is_live: false,
      is_complete: false
    }
  ];
}

export function groupPlayersByGroup(groups: Group[], groupPlayers: GroupPlayer[], players: Player[]) {
  const playerMap = new Map(players.map((player) => [player.id, player]));

  return groups
    .slice()
    .sort((left, right) => left.group_number - right.group_number)
    .map((group) => ({
      group,
      roster: groupPlayers
        .filter((item) => item.group_id === group.id)
        .sort((left, right) => left.seat - right.seat)
        .map((item) => playerMap.get(item.player_id))
        .filter((player): player is Player => Boolean(player))
    }));
}

export function matchesByStage(matches: Match[]) {
  return getKnockoutMatchesByStage(matches);
}

export function collectAdvancingPlayers(matches: Match[]) {
  return matches.flatMap((match) => {
    if (!match.is_complete || match.team_a_score === match.team_b_score) {
      return [];
    }

    return match.team_a_score > match.team_b_score ? match.team_a_player_ids : match.team_b_player_ids;
  });
}

export function formatTeam(playerIds: string[], players: Player[]) {
  const playerMap = new Map(players.map((player) => [player.id, player.name]));
  return playerIds.map((playerId) => playerMap.get(playerId) ?? "Unknown").join(" / ");
}

function extractCourtNumber(courtName: string | null) {
  if (!courtName) {
    return Number.MAX_SAFE_INTEGER;
  }

  const match = courtName.match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function sortMatchesForAdmin(matches: Match[]) {
  const stageOrder: Record<Stage, number> = {
    group: 0,
    quarterfinal: 1,
    semifinal: 2,
    third_place: 3,
    final: 4
  };

  return matches.slice().sort((left, right) => {
    if (left.is_complete !== right.is_complete) {
      return left.is_complete ? 1 : -1;
    }

    if (left.is_live !== right.is_live) {
      return left.is_live ? -1 : 1;
    }

    const leftCourt = extractCourtNumber(left.court_name);
    const rightCourt = extractCourtNumber(right.court_name);

    if (leftCourt !== rightCourt) {
      return leftCourt - rightCourt;
    }

    if (left.match_kind !== right.match_kind) {
      return left.match_kind === "scheduled" ? -1 : 1;
    }

    if (stageOrder[left.stage] !== stageOrder[right.stage]) {
      return stageOrder[left.stage] - stageOrder[right.stage];
    }

    return left.round_order - right.round_order;
  });
}
