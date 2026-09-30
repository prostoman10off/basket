const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

const PICKS_FILE = path.join(DATA_DIR, "picks.json");

const PICKS_RESULTS_FILE = path.join(
  DATA_DIR,
  "picks-results.json"
);

const CURRENT_SEASON_FILE = path.join(
  DATA_DIR,
  "nba-2026-2027.json"
);

const PREVIOUS_SEASON_FILE = path.join(
  DATA_DIR,
  "nba-2026.json"
);

const DISPLAY_TIME_ZONE = "Asia/Novosibirsk";

const SCORING = {
  correct: 1,
  wrong: 0
};

/*
  Соответствие Telegram ID участникам.

  Telegram ID храним только здесь.
  В публичный picks-results.json попадут внутренние ID:
  andrei, ivan и seva.
*/
const PLAYERS_BY_TELEGRAM_ID = {
  "42552913": {
    playerId: "ivan",
    name: "Иван",
    photo: "Ivan.jpg",
    favoriteTeam: "Celtics"
  },

  "58800473": {
    playerId: "seva",
    name: "Сева",
    photo: "Seva.jpg",
    favoriteTeam: "Warriors"
  },

  "5280657145": {
    playerId: "andrei",
    name: "Андрей",
    photo: "Andrei.jpg",
    favoriteTeam: "76ers"
  }
};

const PLAYERS = Object.values(PLAYERS_BY_TELEGRAM_ID);

/*
  Нормализация нестандартных сокращений команд.

  Бот иногда отдаёт:
  GS вместо GSW,
  UTAH вместо UTA и т. п.
*/
const TEAM_ABBR_ALIASES = {
  GS: "GSW",
  GSW: "GSW",

  UTAH: "UTA",
  UTA: "UTA",

  NY: "NYK",
  NYK: "NYK",

  SA: "SAS",
  SAS: "SAS",

  NO: "NOP",
  NOP: "NOP",

  PHO: "PHX",
  PHX: "PHX",

  BRK: "BKN",
  BKN: "BKN",

  CHA: "CHA",
  CHO: "CHA",

  WSH: "WAS",
  WAS: "WAS"
};

main().catch(error => {
  console.error("Fatal calculation error:", error);
  process.exitCode = 1;
});

async function main() {
  console.log("Starting picks calculation...");

  ensureRequiredFiles();

  const picksData = readJson(PICKS_FILE);
  const currentSeasonData = readJsonSafe(
    CURRENT_SEASON_FILE,
    {}
  );
  const previousSeasonData = readJsonSafe(
    PREVIOUS_SEASON_FILE,
    {}
  );

  validatePicksData(picksData);

  const gamesById = createGamesIndex(
    picksData,
    currentSeasonData,
    previousSeasonData
  );

  const warnings = [];

  const results = calculateAllPicks(
    picksData,
    gamesById,
    warnings
  );

  const leaderboard = createLeaderboard(results);

  const dailyTotals = createDailyTotals(
    results,
    gamesById
  );

  const output = {
    updatedAt: new Date().toISOString(),

    sourceUpdatedAt: {
      picks: picksData.updated_at || null,
      currentSeason:
        currentSeasonData.updatedAt || null,
      previousSeason:
        previousSeasonData.updatedAt || null
    },

    scoring: SCORING,

    leaderboard,

    dailyTotals,

    results,

    warnings
  };

  fs.writeFileSync(
    PICKS_RESULTS_FILE,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  console.log("Picks calculation completed.");
  console.log(`Results: ${results.length}`);

  leaderboard.forEach(player => {
    console.log(
      `${player.name}: ${player.points} points, ` +
      `${player.correctPicks} correct, ` +
      `${player.wrongPicks} wrong, ` +
      `${player.pendingPicks} pending`
    );
  });

  if (warnings.length) {
    console.warn(`Warnings: ${warnings.length}`);

    warnings.forEach(warning => {
      console.warn(`- ${warning}`);
    });
  }
}

function ensureRequiredFiles() {
  if (!fs.existsSync(PICKS_FILE)) {
    throw new Error(
      `Required file not found: ${PICKS_FILE}`
    );
  }

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, {
      recursive: true
    });
  }
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function readJsonSafe(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    console.warn(`Optional file not found: ${filePath}`);
    return fallback;
  }

  try {
    return readJson(filePath);
  } catch (error) {
    console.warn(
      `Could not read ${filePath}: ${error.message}`
    );

    return fallback;
  }
}

function validatePicksData(data) {
  if (!data || typeof data !== "object") {
    throw new Error("picks.json is not an object");
  }

  if (
    !data.games ||
    typeof data.games !== "object"
  ) {
    throw new Error(
      "picks.json does not contain games object"
    );
  }

  if (
    !data.picks ||
    typeof data.picks !== "object"
  ) {
    throw new Error(
      "picks.json does not contain picks object"
    );
  }
}

/*
  Собираем общий индекс матчей.

  Приоритет:
  1. NBA JSON — там есть финальный счёт.
  2. picks.games — там есть матчи Telegram-бота.

  Данные объединяются, поэтому матч будет найден,
  даже если он пока ещё не попал в ближайшие 3 дня.
*/
function createGamesIndex(
  picksData,
  currentSeasonData,
  previousSeasonData
) {
  const gamesById = new Map();

  const botGames = Object.values(
    picksData.games || {}
  );

  botGames.forEach(game => {
    const normalizedGame = normalizeBotGame(game);

    if (normalizedGame.id) {
      gamesById.set(
        normalizedGame.id,
        normalizedGame
      );
    }
  });

  const nbaGames = [
    ...(currentSeasonData.upcomingGames || []),
    ...(currentSeasonData.seasonGames || []),
    ...(previousSeasonData.pastGames || [])
  ];

  nbaGames.forEach(game => {
    const normalizedGame = normalizeNbaGame(game);

    if (!normalizedGame.id) {
      return;
    }

    const existing =
      gamesById.get(normalizedGame.id) || {};

    gamesById.set(normalizedGame.id, {
      ...existing,
      ...normalizedGame,

      awayTeam: {
        ...(existing.awayTeam || {}),
        ...(normalizedGame.awayTeam || {})
      },

      homeTeam: {
        ...(existing.homeTeam || {}),
        ...(normalizedGame.homeTeam || {})
      }
    });
  });

  return gamesById;
}

function normalizeBotGame(game) {
  const status = normalizeText(game.status);

  const isCompleted =
    status === "post" ||
    status === "final" ||
    status.includes("completed");

  const isCanceled =
    status.includes("cancel") ||
    status.includes("canceled");

  return {
    id: String(
      game.event_id || game.id || ""
    ),

    date: game.date || null,

    name: game.name || "",

    statusState: game.status || "",

    statusDescription:
      game.status_detail || "",

    isCompleted,

    isCanceled,

    winnerAbbr: normalizeTeamAbbr(
      game.winner_abbr
    ),

    awayTeam: {
      name: game.away_team || "",
      abbreviation: normalizeTeamAbbr(
        game.away_abbr
      ),
      score: null
    },

    homeTeam: {
      name: game.home_team || "",
      abbreviation: normalizeTeamAbbr(
        game.home_abbr
      ),
      score: null
    }
  };
}

function normalizeNbaGame(game) {
  const statusText = normalizeText(
    [
      game.statusState,
      game.statusName,
      game.statusDescription
    ].join(" ")
  );

  const isCompleted =
    Boolean(game.isCompleted) ||
    statusText.includes("post") ||
    statusText.includes("final") ||
    statusText.includes("completed");

  const isCanceled =
    statusText.includes("cancel") ||
    statusText.includes("canceled");

  const awayScore = toNumberOrNull(
    game.awayTeam && game.awayTeam.score
  );

  const homeScore = toNumberOrNull(
    game.homeTeam && game.homeTeam.score
  );

  let winnerAbbr = null;

  if (
    isCompleted &&
    awayScore !== null &&
    homeScore !== null &&
    awayScore !== homeScore
  ) {
    winnerAbbr =
      awayScore > homeScore
        ? normalizeTeamAbbr(
            game.awayTeam.abbreviation
          )
        : normalizeTeamAbbr(
            game.homeTeam.abbreviation
          );
  }

  return {
    id: String(game.id || ""),

    date: game.date || null,

    name: game.name || "",

    statusState: game.statusState || "",

    statusDescription:
      game.statusDescription || "",

    isCompleted,

    isCanceled,

    winnerAbbr,

    awayTeam: {
      id: String(
        (game.awayTeam && game.awayTeam.id) || ""
      ),

      name:
        (game.awayTeam && game.awayTeam.name) ||
        "",

      abbreviation: normalizeTeamAbbr(
        game.awayTeam &&
          game.awayTeam.abbreviation
      ),

      score: awayScore
    },

    homeTeam: {
      id: String(
        (game.homeTeam && game.homeTeam.id) || ""
      ),

      name:
        (game.homeTeam && game.homeTeam.name) ||
        "",

      abbreviation: normalizeTeamAbbr(
        game.homeTeam &&
          game.homeTeam.abbreviation
      ),

      score: homeScore
    }
  };
}

function calculateAllPicks(
  picksData,
  gamesById,
  warnings
) {
  const results = [];

  Object.entries(picksData.picks || {}).forEach(
    ([gameId, gamePicks]) => {
      if (
        !gamePicks ||
        typeof gamePicks !== "object"
      ) {
        return;
      }

      Object.entries(gamePicks).forEach(
        ([telegramIdFromKey, rawPick]) => {
          const telegramId = String(
            rawPick.user_id ||
              telegramIdFromKey ||
              ""
          );

          const player =
            PLAYERS_BY_TELEGRAM_ID[telegramId];

          if (!player) {
            warnings.push(
              `Unknown Telegram user ${telegramId} ` +
              `in game ${gameId}`
            );

            return;
          }

          const game =
            gamesById.get(String(gameId));

          const result = calculateSinglePick({
            gameId: String(gameId),
            rawPick,
            player,
            game
          });

          results.push(result);
        }
      );
    }
  );

  return results.sort((a, b) => {
    const dateA = new Date(
      a.gameDate || a.votedAt || 0
    );

    const dateB = new Date(
      b.gameDate || b.votedAt || 0
    );

    return dateB - dateA;
  });
}

function calculateSinglePick({
  gameId,
  rawPick,
  player,
  game
}) {
  const pickedTeamAbbr = normalizeTeamAbbr(
    rawPick.picked_abbr
  );

  const votedAt =
    rawPick.voted_at || null;

  const gameDate =
    game && game.date
      ? game.date
      : null;

  const winnerTeamAbbr =
    game && game.winnerAbbr
      ? normalizeTeamAbbr(game.winnerAbbr)
      : null;

  let status = "pending";
  let points = 0;

  const voteWasLate = isVoteLate(
    votedAt,
    gameDate
  );

  if (!game) {
    status = "pending";
  } else if (game.isCanceled) {
    status = "void";
  } else if (voteWasLate) {
    status = "late";
  } else if (
    game.isCompleted &&
    winnerTeamAbbr
  ) {
    const isCorrect =
      pickedTeamAbbr === winnerTeamAbbr;

    status = isCorrect
      ? "correct"
      : "wrong";

    points = isCorrect
      ? SCORING.correct
      : SCORING.wrong;
  }

  return {
    id: `${gameId}_${player.playerId}`,

    gameId,

    gameDate,

    gameName:
      (game && game.name) || "",

    playerId: player.playerId,

    playerName: player.name,

    playerPhoto: player.photo,

    pickedTeamAbbr,

    pickedTeamName:
      rawPick.picked_team || "",

    votedAt,

    status,

    points,

    winnerTeamAbbr,

    awayTeamAbbr:
      game && game.awayTeam
        ? game.awayTeam.abbreviation
        : null,

    homeTeamAbbr:
      game && game.homeTeam
        ? game.homeTeam.abbreviation
        : null
  };
}

function isVoteLate(votedAt, gameDate) {
  if (!votedAt || !gameDate) {
    return false;
  }

  const voteTimestamp = new Date(
    votedAt
  ).getTime();

  const gameTimestamp = new Date(
    gameDate
  ).getTime();

  if (
    Number.isNaN(voteTimestamp) ||
    Number.isNaN(gameTimestamp)
  ) {
    return false;
  }

  return voteTimestamp >= gameTimestamp;
}

function createLeaderboard(results) {
  const leaderboard = PLAYERS.map(player => {
    const playerResults = results.filter(
      result =>
        result.playerId === player.playerId
    );

    const correctPicks = countStatus(
      playerResults,
      "correct"
    );

    const wrongPicks = countStatus(
      playerResults,
      "wrong"
    );

    const pendingPicks = countStatus(
      playerResults,
      "pending"
    );

    const latePicks = countStatus(
      playerResults,
      "late"
    );

    const voidPicks = countStatus(
      playerResults,
      "void"
    );

    const points = playerResults.reduce(
      (sum, result) => sum + result.points,
      0
    );

    const gradedPicks =
      correctPicks + wrongPicks;

    const accuracy =
      gradedPicks > 0
        ? Math.round(
            (correctPicks / gradedPicks) * 100
          )
        : 0;

    return {
      playerId: player.playerId,
      name: player.name,
      photo: player.photo,
      favoriteTeam: player.favoriteTeam,

      points,

      correctPicks,
      wrongPicks,
      pendingPicks,
      latePicks,
      voidPicks,

      totalPicks: playerResults.length,

      gradedPicks,

      accuracy
    };
  });

  leaderboard.sort((a, b) => {
    if (b.points !== a.points) {
      return b.points - a.points;
    }

    if (b.accuracy !== a.accuracy) {
      return b.accuracy - a.accuracy;
    }

    return a.name.localeCompare(
      b.name,
      "ru"
    );
  });

  return leaderboard.map(
    (player, index) => ({
      ...player,
      place: index + 1
    })
  );
}

function createDailyTotals(
  results,
  gamesById
) {
  const totalsByDate = new Map();

  results.forEach(result => {
    if (
      result.status !== "correct" &&
      result.status !== "wrong"
    ) {
      return;
    }

    const game =
      gamesById.get(result.gameId);

    const dateKey = formatDateInTimeZone(
      (game && game.date) ||
        result.gameDate
    );

    if (!dateKey) {
      return;
    }

    if (!totalsByDate.has(dateKey)) {
      totalsByDate.set(
        dateKey,
        createEmptyDailyTotal(dateKey)
      );
    }

    const day = totalsByDate.get(dateKey);

    day.players[result.playerId].points +=
      result.points;

    day.players[
      result.playerId
    ].totalPicks += 1;

    if (result.status === "correct") {
      day.players[
        result.playerId
      ].correctPicks += 1;
    }

    if (result.status === "wrong") {
      day.players[
        result.playerId
      ].wrongPicks += 1;
    }
  });

  return Array.from(totalsByDate.values())
    .sort((a, b) =>
      b.date.localeCompare(a.date)
    );
}

function createEmptyDailyTotal(date) {
  const players = {};

  PLAYERS.forEach(player => {
    players[player.playerId] = {
      playerId: player.playerId,
      name: player.name,
      points: 0,
      correctPicks: 0,
      wrongPicks: 0,
      totalPicks: 0
    };
  });

  return {
    date,
    timeZone: DISPLAY_TIME_ZONE,
    players
  };
}

function formatDateInTimeZone(dateString) {
  if (!dateString) {
    return null;
  }

  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone: DISPLAY_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }
  ).formatToParts(date);

  const values = {};

  parts.forEach(part => {
    values[part.type] = part.value;
  });

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}

function countStatus(results, status) {
  return results.filter(
    result => result.status === status
  ).length;
}

function normalizeTeamAbbr(value) {
  if (!value) {
    return null;
  }

  const normalized = String(value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  return (
    TEAM_ABBR_ALIASES[normalized] ||
    normalized
  );
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function toNumberOrNull(value) {
  if (
    value === null ||
    value === undefined ||
    value === ""
  ) {
    return null;
  }

  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}
