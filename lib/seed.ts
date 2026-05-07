import { buildGroupStageAssets } from "@/lib/tournament";
import { Match, Player, TournamentState } from "@/lib/types";

const PLAYER_NAMES = [
  "Harshad",
  "Rajeev",
  "Tushar P",
  "Jilesh",
  "Jasmin",
  "Jignesh",
  "Kshitij Thakkar",
  "Tushar Shah",
  "Hemant",
  "Girish Jain",
  "Kiran Vyas",
  "Aryan P",
  "Manish R Kapasi",
  "Rajesh Kamdar",
  "Nilesh",
  "Anuj",
  "Atul Atre",
  "Dhiren Kamdar",
  "Pranav Badheka",
  "Shrenik Jain B",
  "Palash Jain",
  "Mittul",
  "Pankaj"
];

function toStableId(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function createSeedPlayers() {
  return PLAYER_NAMES.map((name) => ({
    id: `player-${toStableId(name)}`,
    name,
    is_active: true
  })) satisfies Player[];
}

function applySampleScores(matches: Match[]) {
  return matches.map((match, index) => {
    if (index === 0) {
      return {
        ...match,
        team_a_score: 15,
        team_b_score: 11,
        is_complete: true
      };
    }

    if (index === 1) {
      return {
        ...match,
        team_a_score: 13,
        team_b_score: 15,
        is_complete: true
      };
    }

    if (index === 2) {
      return {
        ...match,
        team_a_score: 9,
        team_b_score: 7,
        is_live: true
      };
    }

    if (index === 3) {
      return {
        ...match,
        team_a_score: 15,
        team_b_score: 6,
        is_complete: true
      };
    }

    if (index === 4) {
      return {
        ...match,
        team_a_score: 12,
        team_b_score: 14,
        is_live: true
      };
    }

    return match;
  });
}

export function createDemoState(): TournamentState {
  const players = createSeedPlayers();
  const selectedPlayers = players.slice(0, 16);
  const tournamentId = "tournament-asirt-pickleball-open";
  let nextId = 1;
  const { groups, groupPlayers, matches } = buildGroupStageAssets(
    tournamentId,
    selectedPlayers.map((player) => player.id),
    {
      idFactory: () => `demo-${nextId++}`,
      randomize: false
    }
  );

  return {
    tournament: {
      id: tournamentId,
      slug: "asirt-pickleball-open",
      name: "Asirt Pickleball Open",
      status: "group",
      court_count: 2
    },
    players,
    groups,
    groupPlayers,
    matches: applySampleScores(matches)
  };
}
