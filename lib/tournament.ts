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

interface HelperAssignment {
  helperPlayerId: string;
  helperForPlayerId: string;
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

function getHelperAssignments(match: Match): HelperAssignment[] {
  const helperIds = match.helper_player_ids ?? [];
  const helperForIds = match.helper_for_player_ids ?? [];
  const total = Math.min(helperIds.length, helperForIds.length);

  return Array.from({ length: total }, (_, index) => ({
    helperPlayerId: helperIds[index],
    helperForPlayerId: helperForIds[index]
  }));
}

export function getDisplayTeamPlayerIds(match: Match, team: "a" | "b") {
  const source = team === "a" ? match.team_a_player_ids : match.team_b_player_ids;
  const assignments = getHelperAssignments(match);

  return source.map((playerId) => assignments.find((assignment) => assignment.helperForPlayerId === playerId)?.helperPlayerId ?? playerId);
}

export function getAllMatchParticipantIds(match: Match) {
  return Array.from(
    new Set([
      ...match.team_a_player_ids,
      ...match.team_b_player_ids,
      ...(match.helper_player_ids ?? [])
    ])
  );
}

export function getDisplayParticipantIds(match: Match) {
  return Array.from(new Set([...getDisplayTeamPlayerIds(match, "a"), ...getDisplayTeamPlayerIds(match, "b")]));
}

export function getHelperLabel(match: Match, players: Player[]) {
  const helperIds = match.helper_player_ids ?? [];
  const helperForIds = match.helper_for_player_ids ?? [];

  if (helperIds.length === 0 || helperForIds.length === 0) {
    return null;
  }

  const playerMap = new Map(players.map((player) => [player.id, player.name]));
  const parts = helperIds
    .map((helperId, index) => {
      const helperName = playerMap.get(helperId);
      const relievedName = playerMap.get(helperForIds[index] ?? "");

      if (!helperName || !relievedName) {
        return null;
      }

      return `${helperName} playing in place of ${relievedName}`;
    })
    .filter((value): value is string => Boolean(value));

  return parts.length > 0 ? parts.join(" · ") : null;
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

function assignStandbyHelpers(
  matches: Array<{
    teamA: GroupStagePairing;
    teamB: GroupStagePairing;
    roundOrder: number;
    courtName: string;
  }>,
  standbyPlayerIds: string[],
  randomize: boolean,
  minimumMatches: number = 3
) {
  // Count each grouped player's total match appearances across the schedule
  const matchCountByPlayer = new Map<string, number>();

  matches.forEach((match) => {
    [...match.teamA.playerIds, ...match.teamB.playerIds].forEach((playerId) => {
      matchCountByPlayer.set(playerId, (matchCountByPlayer.get(playerId) ?? 0) + 1);
    });
  });

  const helperAssignments = new Map<number, HelperAssignment>();
  const helperRounds = new Map<string, number[]>();
  const relievedCountByPlayer = new Map<string, number>();
  const orderedMatches = randomize ? shuffle(matches.map((_, index) => index)) : matches.map((_, index) => index);

  standbyPlayerIds.forEach((helperPlayerId) => {
    for (let appearance = 0; appearance < minimumMatches; appearance += 1) {
      const previousRounds = helperRounds.get(helperPlayerId) ?? [];
      const availableMatchIndexes = orderedMatches.filter((matchIndex) => !helperAssignments.has(matchIndex));
      const preferredIndexes = availableMatchIndexes.filter((matchIndex) => {
        const roundOrder = matches[matchIndex]?.roundOrder ?? 0;
        return previousRounds.every((previousRound) => Math.abs(roundOrder - previousRound) >= 2);
      });
      const candidateIndexes = preferredIndexes.length > 0 ? preferredIndexes : availableMatchIndexes;

      if (candidateIndexes.length === 0) {
        break;
      }

      const rankedCandidates = candidateIndexes
        .map((matchIndex) => {
          const match = matches[matchIndex];
          const participants = [...match.teamA.playerIds, ...match.teamB.playerIds];
          // Only consider players whose net match count would remain >= minimumMatches after being relieved
          const replacementOptions = participants
            .map((playerId) => {
              const currentRelieved = relievedCountByPlayer.get(playerId) ?? 0;
              const totalAppearances = matchCountByPlayer.get(playerId) ?? 0;
              const netMatchesAfterRelief = totalAppearances - currentRelieved - 1;

              return {
                playerId,
                relievedCount: currentRelieved,
                eligible: netMatchesAfterRelief >= minimumMatches
              };
            })
            .filter((option) => option.eligible)
            .sort((left, right) => left.relievedCount - right.relievedCount);

          return {
            matchIndex,
            relievedPlayerId: replacementOptions[0]?.playerId ?? null,
            relievedCount: replacementOptions[0]?.relievedCount ?? Infinity,
            roundOrder: match.roundOrder
          };
        })
        // Only consider matches where at least one player can be relieved
        .filter((candidate) => candidate.relievedPlayerId !== null)
        .sort((left, right) => {
          if (left.relievedCount !== right.relievedCount) {
            return left.relievedCount - right.relievedCount;
          }

          const leftNearestGap =
            previousRounds.length > 0 ? Math.min(...previousRounds.map((round) => Math.abs(left.roundOrder - round))) : 99;
          const rightNearestGap =
            previousRounds.length > 0 ? Math.min(...previousRounds.map((round) => Math.abs(right.roundOrder - round))) : 99;

          if (rightNearestGap !== leftNearestGap) {
            return rightNearestGap - leftNearestGap;
          }

          return left.matchIndex - right.matchIndex;
        });

      const selected = rankedCandidates[0];

      if (!selected || selected.relievedPlayerId === null) {
        // No grouped player can be relieved without dropping below the minimum.
        // This standby player will get bonus matches instead.
        break;
      }

      helperAssignments.set(selected.matchIndex, {
        helperPlayerId,
        helperForPlayerId: selected.relievedPlayerId
      });
      helperRounds.set(helperPlayerId, [...previousRounds, selected.roundOrder]);
      relievedCountByPlayer.set(selected.relievedPlayerId, (relievedCountByPlayer.get(selected.relievedPlayerId) ?? 0) + 1);
    }
  });

  const helperAwareMatches = matches.map((match, index) => {
    const assignment = helperAssignments.get(index);

    return {
      ...match,
      helperPlayerIds: assignment ? [assignment.helperPlayerId] : [],
      helperForPlayerIds: assignment ? [assignment.helperForPlayerId] : []
    };
  });

  return { helperAwareMatches, helperRounds };
}

export function buildGroupStageAssets(
  tournamentId: string,
  playerIds: string[],
  options: BuildGroupStageAssetsOptions = {}
) {
  if (playerIds.length < 8) {
    throw new Error("At least 8 active players are required before groups can be generated.");
  }

  const remainder = playerIds.length % 4;
  const groupedPlayerCount = playerIds.length - remainder;

  if (groupedPlayerCount < 8) {
    throw new Error("At least 8 grouped players are required so partner pairings can face the wider pool.");
  }

  const idFactory = options.idFactory ?? (() => crypto.randomUUID());
  const courtCount = Math.max(1, options.courtCount ?? 1);
  const shuffledPlayerIds = options.randomize === false ? [...playerIds] : shuffle(playerIds);
  const groupedPlayerIds = shuffledPlayerIds.slice(0, groupedPlayerCount);
  const standbyPlayerIds = shuffledPlayerIds.slice(groupedPlayerCount);
  const groups: Group[] = [];
  const groupPlayers: GroupPlayer[] = [];
  const matches: Match[] = [];
  const pairingsByPartnerRound = new Map<number, GroupStagePairing[]>();

  for (let index = 0; index < groupedPlayerIds.length; index += 4) {
    const groupNumber = index / 4 + 1;
    const groupId = idFactory();
    const groupRoster = groupedPlayerIds.slice(index, index + 4);

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
  const minimumMatches = 3;
  const { helperAwareMatches: relievedMatches, helperRounds } = assignStandbyHelpers(
    scheduledMatches,
    standbyPlayerIds,
    Boolean(options.randomize),
    minimumMatches
  );

  relievedMatches.forEach(({ teamA, teamB, roundOrder, courtName, helperPlayerIds, helperForPlayerIds }) => {
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
      helper_player_ids: helperPlayerIds,
      helper_for_player_ids: helperForPlayerIds,
      team_a_score: 0,
      team_b_score: 0,
      is_live: false,
      is_complete: false
    });
  });

  // Determine the highest round_order used so far so bonus matches can be appended after
  const maxRound = matches.reduce((maximum, match) => Math.max(maximum, match.round_order), 0);

  // Generate bonus matches for standby players who still need more appearances
  const bonusMatches: Match[] = [];
  let bonusRound = maxRound + 1;

  standbyPlayerIds.forEach((standbyId) => {
    const helperAppearances = (helperRounds.get(standbyId) ?? []).length;
    const bonusAppearances = bonusMatches.filter(
      (match) => match.team_a_player_ids.includes(standbyId) || match.team_b_player_ids.includes(standbyId)
    ).length;
    const gamesNeeded = minimumMatches - helperAppearances - bonusAppearances;

    if (gamesNeeded <= 0) {
      return;
    }

    // Pick grouped players to fill the bonus match slots
    // Try to pick partners who have the fewest bonus appearances to keep things fair
    const bonusCountByPlayer = new Map<string, number>();

    bonusMatches.forEach((match) => {
      [...match.team_a_player_ids, ...match.team_b_player_ids].forEach((playerId) => {
        bonusCountByPlayer.set(playerId, (bonusCountByPlayer.get(playerId) ?? 0) + 1);
      });
    });

    for (let game = 0; game < gamesNeeded; game += 1) {
      // Sort grouped players by how many bonus matches they have (ascending), then shuffle for variety
      const availablePartners = groupedPlayerIds
        .filter((playerId) => playerId !== standbyId)
        .sort((left, right) => {
          const leftCount = bonusCountByPlayer.get(left) ?? 0;
          const rightCount = bonusCountByPlayer.get(right) ?? 0;

          if (leftCount !== rightCount) {
            return leftCount - rightCount;
          }

          return randomTieBreaker(Boolean(options.randomize)) - randomTieBreaker(Boolean(options.randomize));
        });

      // We need 3 grouped players: 1 teammate for standby + 2 opponents
      if (availablePartners.length < 3) {
        break;
      }

      const partner = availablePartners[0];
      const opponentOne = availablePartners[1];
      const opponentTwo = availablePartners[2];

      const bonusMatch: Match = {
        id: idFactory(),
        tournament_id: tournamentId,
        group_id: null,
        match_kind: "scheduled",
        stage: "group",
        round_order: bonusRound,
        court_name: `Court 1`,
        scheduled_label: `Bonus Match`,
        team_a_player_ids: [standbyId, partner],
        team_b_player_ids: [opponentOne, opponentTwo],
        helper_player_ids: [],
        helper_for_player_ids: [],
        team_a_score: 0,
        team_b_score: 0,
        is_live: false,
        is_complete: false
      };

      bonusMatches.push(bonusMatch);
      bonusCountByPlayer.set(partner, (bonusCountByPlayer.get(partner) ?? 0) + 1);
      bonusCountByPlayer.set(opponentOne, (bonusCountByPlayer.get(opponentOne) ?? 0) + 1);
      bonusCountByPlayer.set(opponentTwo, (bonusCountByPlayer.get(opponentTwo) ?? 0) + 1);
      bonusRound += 1;
    }
  });

  matches.push(...bonusMatches);

  return { groups, groupPlayers, matches, standbyPlayerIds };
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
    const teamAPlayerIds = getDisplayTeamPlayerIds(match, "a");
    const teamBPlayerIds = getDisplayTeamPlayerIds(match, "b");

    teamAPlayerIds.forEach((playerId) => {
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

    teamBPlayerIds.forEach((playerId) => {
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
        wins: total.wins,
        averagePoints: total.matchesPlayed > 0 ? total.pointsFor / total.matchesPlayed : 0,
        averageDifferential: total.matchesPlayed > 0 ? (total.pointsFor - total.pointsAgainst) / total.matchesPlayed : 0
      } satisfies LeaderboardRow;
    })
    .filter((row): row is LeaderboardRow => Boolean(row))
    .sort((left, right) => {
      if (right.averagePoints !== left.averagePoints) {
        return right.averagePoints - left.averagePoints;
      }

      if (right.averageDifferential !== left.averageDifferential) {
        return right.averageDifferential - left.averageDifferential;
      }

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
      helper_player_ids: [],
      helper_for_player_ids: [],
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
      helper_player_ids: [],
      helper_for_player_ids: [],
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
      helper_player_ids: [],
      helper_for_player_ids: [],
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

export function formatDisplayTeam(match: Match, team: "a" | "b", players: Player[]) {
  return formatTeam(getDisplayTeamPlayerIds(match, team), players);
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
