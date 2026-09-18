const fs = require("fs");
const path = require("path");

const YEAR = 2026;

const ESPN_SCOREBOARD_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const ESPN_STANDINGS_URLS = [
  "https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn&type=0",
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn"
];

const DATA_DIR = path.join(process.cwd(), "data");
const DATA_FILE = path.join(DATA_DIR, `nba-${YEAR}.json`);

const DAYS_AHEAD = 3;
const RECENT_DAYS_TO_REFRESH = 10;
const CONCURRENT_REQUESTS = 4;

main();

async function main() {
  console.log(`Starting NBA data update for ${YEAR}...`);

  ensureDataDir();

  const existingData = readExistingData();

  const pastGames = await updatePastGames(existingData.pastGames || []);
  const upcomingGames = await loadUpcomingGames();
  const standingsByTeamId = await loadStandingsSafe();

  const output = {
    year: YEAR,
    updatedAt: new Date().toISOString(),
    source: "ESPN API",
    pastGames,
    upcomingGames,
    standingsByTeamId
  };

  fs.writeFileSync(DATA_FILE, JSON.stringify(output, null, 2), "utf8");

  console.log(`Done.`);
  console.log(`Past games: ${pastGames.length}`);
  console.log(`Upcoming games: ${upcomingGames.length}`);
  console.log(`Standings teams: ${Object.keys(standingsByTeamId).length}`);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readExistingData() {
  if (!fs.existsSync(DATA_FILE)) {
    return {
      year: YEAR,
      updatedAt: null,
      source: "ESPN API",
      pastGames: [],
      upcomingGames: [],
      standingsByTeamId: {}
    };
  }

  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Could not read existing JSON. Starting fresh.", error);
    return {
      year: YEAR,
      updatedAt: null,
      source: "ESPN API",
      pastGames: [],
      upcomingGames: [],
      standingsByTeamId: {}
    };
  }
}

async function updatePastGames(existingPastGames) {
  const today = startOfDay(new Date());

  let endDate = addDays(today, -1);

  if (endDate.getFullYear() < YEAR) {
    console.log("Current date is before target year. No past games yet.");
    return [];
  }

  if (endDate.getFullYear() > YEAR) {
    endDate = new Date(YEAR, 11, 31);
  }

  const yearStart = new Date(YEAR, 0, 1);

  let startDate;

  if (!existingPastGames.length) {
    startDate = yearStart;
    console.log("Initial load: fetching full year from Jan 1.");
  } else {
    startDate = maxDate(yearStart, addDays(endDate, -RECENT_DAYS_TO_REFRESH));
    console.log(`Incremental load: refreshing last ${RECENT_DAYS_TO_REFRESH} days.`);
  }

  if (endDate < startDate) {
    return existingPastGames;
  }

  const dates = buildDatesRange(startDate, endDate);

  console.log(
    `Fetching past dates: ${toESPNDate(startDate)} - ${toESPNDate(endDate)} (${dates.length} days)`
  );

  const eventsByDay = await runWithConcurrency(
    dates,
    CONCURRENT_REQUESTS,
    async date => {
      const events = await fetchESPNEventsByDate(date);
      console.log(`${toESPNDate(date)}: ${events.length} events`);
      return events;
    }
  );

  const freshGames = normalizeEvents(eventsByDay.flat())
    .filter(game => {
      const gameDate = new Date(game.date);

      return (
        game.isCompleted &&
        gameDate.getFullYear() === YEAR
      );
    });

  const freshIds = new Set(freshGames.map(game => String(game.id)));

  const oldGamesOutsideRefresh = existingPastGames.filter(game => {
    return !freshIds.has(String(game.id));
  });

  const merged = [...oldGamesOutsideRefresh, ...freshGames];

  const unique = dedupeGames(merged)
    .filter(game => {
      const gameDate = new Date(game.date);
      return game.isCompleted && gameDate.getFullYear() === YEAR;
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  return unique;
}

async function loadUpcomingGames() {
  const today = startOfDay(new Date());

  const dates = [];

  for (let i = 1; i <= DAYS_AHEAD; i++) {
    const date = addDays(today, i);

    if (date.getFullYear() === YEAR) {
      dates.push(date);
    }
  }

  if (!dates.length) {
    return [];
  }

  console.log(`Fetching upcoming games for ${dates.length} days...`);

  const eventsByDay = await runWithConcurrency(
    dates,
    CONCURRENT_REQUESTS,
    async date => {
      const events = await fetchESPNEventsByDate(date);
      console.log(`Upcoming ${toESPNDate(date)}: ${events.length} events`);
      return events;
    }
  );

  return normalizeEvents(eventsByDay.flat())
    .filter(game => !game.isCompleted)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function fetchESPNEventsByDate(date) {
  const dateParam = toESPNDate(date);

  const url =
    `${ESPN_SCOREBOARD_API_URL}?dates=${dateParam}&limit=100&region=us&lang=en&contentorigin=espn`;

  try {
    const response = await fetchWithTimeout(url, 12000);

    if (!response.ok) {
      console.warn(`ESPN scoreboard ${dateParam}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();

    return data.events || [];
  } catch (error) {
    console.warn(`ESPN scoreboard ${dateParam}: request error`, error.message);
    return [];
  }
}

async function loadStandingsSafe() {
  for (const url of ESPN_STANDINGS_URLS) {
    try {
      const response = await fetchWithTimeout(url, 12000);

      if (!response.ok) {
        console.warn(`ESPN standings: HTTP ${response.status}`);
        continue;
      }

      const data = await response.json();
      const parsed = parseStandings(data);

      if (Object.keys(parsed).length > 0) {
        return parsed;
      }
    } catch (error) {
      console.warn("ESPN standings error:", error.message);
    }
  }

  return {};
}

function parseStandings(data) {
  const result = {};
  walkStandingsNode(data, [], result);
  return result;
}

function walkStandingsNode(node, context, result) {
  if (!node) return;

  if (Array.isArray(node)) {
    node.forEach(item => walkStandingsNode(item, context, result));
    return;
  }

  if (typeof node !== "object") return;

  const nextContext = [...context];

  if (typeof node.name === "string") {
    nextContext.push(node.name);
  }

  if (node.team && Array.isArray(node.stats)) {
    const teamId = String(node.team.id || "");

    if (teamId) {
      const stats = node.stats;

      const wins = getStatValue(stats, ["wins"]);
      const losses = getStatValue(stats, ["losses"]);
      const rank = getStatValue(stats, ["playoffSeed", "rank", "conferenceRank"]);
      const divisionRank = getStatValue(stats, ["divisionRank"]);
      const gamesBehind = getStatValue(stats, ["gamesBehind", "GB"]);
      const streak = getStatValue(stats, ["streak"]);

      const record =
        wins !== "" && losses !== ""
          ? `${wins}-${losses}`
          : "";

      const rankParts = [];

      if (rank !== "") {
        rankParts.push(`Conf #${rank}`);
      }

      if (divisionRank !== "") {
        rankParts.push(`Div #${divisionRank}`);
      }

      if (gamesBehind !== "" && gamesBehind !== "0") {
        rankParts.push(`GB ${gamesBehind}`);
      }

      if (streak !== "") {
        rankParts.push(String(streak));
      }

      result[teamId] = {
        teamId,
        record,
        rank,
        divisionRank,
        gamesBehind,
        streak,
        display: [record, ...rankParts].filter(Boolean).join(" · ")
      };
    }
  }

  Object.keys(node).forEach(key => {
    if (key === "team" || key === "stats") return;
    walkStandingsNode(node[key], nextContext, result);
  });
}

function getStatValue(stats, names) {
  const lowerNames = names.map(name => String(name).toLowerCase());

  let found = stats.find(stat => {
    const variants = [
      stat.name,
      stat.displayName,
      stat.shortDisplayName,
      stat.abbreviation
    ]
      .filter(Boolean)
      .map(value => String(value).toLowerCase());

    return variants.some(value => lowerNames.includes(value));
  });

  if (!found) {
    found = stats.find(stat => {
      const variants = [
        stat.name,
        stat.displayName,
        stat.shortDisplayName,
        stat.abbreviation
      ]
        .filter(Boolean)
        .map(value => String(value).toLowerCase());

      return variants.some(value =>
        lowerNames.some(name => value.includes(name))
      );
    });
  }

  if (!found) return "";

  if (found.displayValue !== undefined && found.displayValue !== null) {
    return String(found.displayValue);
  }

  if (found.value !== undefined && found.value !== null) {
    return String(found.value);
  }

  return "";
}

function normalizeEvents(events) {
  return dedupeGames(
    events
      .map(event => normalizeEvent(event))
      .filter(Boolean)
  );
}

function normalizeEvent(event) {
  const competition = event.competitions && event.competitions[0];

  if (!competition || !competition.competitors) {
    return null;
  }

  const competitors = competition.competitors;

  const home = competitors.find(item => item.homeAway === "home");
  const away = competitors.find(item => item.homeAway === "away");

  if (!home || !away) {
    return null;
  }

  const statusType = event.status && event.status.type ? event.status.type : {};

  const statusName = statusType.name || "";
  const statusState = statusType.state || "";
  const statusDescription = statusType.description || "";
  const completed = Boolean(statusType.completed);

  const isCompleted =
    completed ||
    statusState === "post" ||
    statusName === "STATUS_FINAL" ||
    statusName.includes("FINAL") ||
    statusDescription.toLowerCase().includes("final");

  const stage = getGameStage(event, competition);
  const seriesText = getSeriesText(event, competition);

  return {
    id: String(event.id || ""),
    name: event.name || "",
    shortName: event.shortName || "",
    date: event.date,
    statusName,
    statusState,
    statusDescription,
    isCompleted,
    stage,
    seriesText,

    homeTeam: {
      id: String(home.team.id || ""),
      name: home.team.displayName || home.team.name || "Home Team",
      shortName: home.team.shortDisplayName || home.team.abbreviation || "",
      abbreviation: home.team.abbreviation || "",
      logo: getTeamLogo(home.team),
      score: Number(home.score || 0)
    },

    awayTeam: {
      id: String(away.team.id || ""),
      name: away.team.displayName || away.team.name || "Away Team",
      shortName: away.team.shortDisplayName || away.team.abbreviation || "",
      abbreviation: away.team.abbreviation || "",
      logo: getTeamLogo(away.team),
      score: Number(away.score || 0)
    }
  };
}

function getGameStage(event, competition) {
  const season = event.season || competition.season || {};
  const type = Number(season.type || 0);

  const rawText = [
    season.slug,
    season.name,
    season.displayName,
    competition.type && competition.type.text,
    competition.type && competition.type.name
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (
    type === 3 ||
    rawText.includes("post") ||
    rawText.includes("playoff") ||
    rawText.includes("playoffs")
  ) {
    return {
      label: "Плей-офф",
      className: "playoff"
    };
  }

  if (
    type === 1 ||
    rawText.includes("preseason") ||
    rawText.includes("pre-season")
  ) {
    return {
      label: "Предсезонка",
      className: "preseason"
    };
  }

  if (
    type === 2 ||
    rawText.includes("regular")
  ) {
    return {
      label: "Регулярка",
      className: "regular"
    };
  }

  return {
    label: "NBA",
    className: ""
  };
}

function getSeriesText(event, competition) {
  const candidates = [];

  const series = competition.series || event.series || {};

  candidates.push(
    series.summary,
    series.title,
    series.displayName,
    series.shortName,
    series.description
  );

  if (series.seriesSummary) {
    candidates.push(
      series.seriesSummary.summary,
      series.seriesSummary.displayValue,
      series.seriesSummary.description
    );
  }

  if (Array.isArray(competition.notes)) {
    competition.notes.forEach(note => {
      candidates.push(note.headline, note.text);
    });
  }

  if (Array.isArray(event.notes)) {
    event.notes.forEach(note => {
      candidates.push(note.headline, note.text);
    });
  }

  const text = candidates
    .filter(Boolean)
    .map(item => String(item).trim())
    .find(item => {
      const lower = item.toLowerCase();

      return (
        lower.includes("series") ||
        lower.includes("leads") ||
        lower.includes("wins") ||
        lower.includes("tied") ||
        /\d\s*-\s*\d/.test(lower)
      );
    });

  return text || "";
}

function getTeamLogo(team) {
  if (!team) return "";

  if (team.logo) {
    return team.logo;
  }

  if (team.logos && team.logos.length > 0 && team.logos[0].href) {
    return team.logos[0].href;
  }

  if (team.abbreviation) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${team.abbreviation.toLowerCase()}.png`;
  }

  return "";
}

function dedupeGames(games) {
  const map = new Map();

  games.forEach(game => {
    if (!game || !game.id) return;
    map.set(String(game.id), game);
  });

  return Array.from(map.values());
}

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runWithConcurrency(items, limit, task) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (index < items.length) {
      const currentIndex = index;
      index++;

      try {
        results[currentIndex] = await task(items[currentIndex], currentIndex);
      } catch (error) {
        console.warn("Task error:", error.message);
        results[currentIndex] = [];
      }
    }
  }

  const workers = [];

  for (let i = 0; i < Math.min(limit, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);

  return results;
}

function buildDatesRange(startDate, endDate) {
  const dates = [];

  let current = new Date(startDate);

  while (current <= endDate) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }

  return dates;
}

function startOfDay(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function maxDate(a, b) {
  return a > b ? a : b;
}

function toESPNDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}
