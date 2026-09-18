const fs = require("fs");
const path = require("path");

const CURRENT_SEASON_LABEL = "2026-2027";

const CURRENT_SEASON_START = new Date(2026, 9, 1); // 1 октября 2026
const CURRENT_SEASON_END = new Date(2027, 9, 1, 23, 59, 59, 999); // 1 октября 2027

const PREVIOUS_YEAR = 2026;
const PREVIOUS_YEAR_START = new Date(2026, 0, 1); // 1 января 2026
const PREVIOUS_YEAR_END = new Date(2026, 8, 30, 23, 59, 59, 999); // 30 сентября 2026

const ESPN_SCOREBOARD_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const DATA_DIR = path.join(process.cwd(), "data");

const CURRENT_SEASON_FILE = path.join(DATA_DIR, "nba-2026-2027.json");
const PREVIOUS_SEASON_FILE = path.join(DATA_DIR, "nba-2026.json");

const DAYS_AHEAD = 3;
const RECENT_DAYS_TO_REFRESH = 10;
const CONCURRENT_REQUESTS = 4;

main();

async function main() {
  console.log("Starting NBA data update...");

  ensureDataDir();

  const previousData = readJsonFile(PREVIOUS_SEASON_FILE, getEmptyPreviousSeasonData());
  const currentData = readJsonFile(CURRENT_SEASON_FILE, getEmptyCurrentSeasonData());

  const previousSeasonGames = await updatePreviousSeasonGames(previousData.pastGames || []);
  const currentSeasonGames = await updateCurrentSeasonGames(currentData.seasonGames || []);
  const upcomingGames = await loadUpcomingGames();

  const previousOutput = {
    year: PREVIOUS_YEAR,
    updatedAt: new Date().toISOString(),
    source: "ESPN API",
    pastGames: previousSeasonGames,
    upcomingGames: []
  };

  const currentOutput = {
    season: CURRENT_SEASON_LABEL,
    seasonStart: "2026-10-01",
    seasonEnd: "2027-10-01",
    updatedAt: new Date().toISOString(),
    source: "ESPN API",
    seasonGames: currentSeasonGames,
    upcomingGames
  };

  fs.writeFileSync(PREVIOUS_SEASON_FILE, JSON.stringify(previousOutput, null, 2), "utf8");
  fs.writeFileSync(CURRENT_SEASON_FILE, JSON.stringify(currentOutput, null, 2), "utf8");

  console.log("Done.");
  console.log(`Previous season games: ${previousSeasonGames.length}`);
  console.log(`Current season games: ${currentSeasonGames.length}`);
  console.log(`Upcoming games: ${upcomingGames.length}`);
}

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Could not read ${filePath}. Starting fresh.`, error);
    return fallback;
  }
}

function getEmptyPreviousSeasonData() {
  return {
    year: PREVIOUS_YEAR,
    updatedAt: null,
    source: "ESPN API",
    pastGames: [],
    upcomingGames: []
  };
}

function getEmptyCurrentSeasonData() {
  return {
    season: CURRENT_SEASON_LABEL,
    seasonStart: "2026-10-01",
    seasonEnd: "2027-10-01",
    updatedAt: null,
    source: "ESPN API",
    seasonGames: [],
    upcomingGames: []
  };
}

/*
  Прошлый сезон / старые матчи:
  Берём завершённые матчи с 01.01.2026 по 30.09.2026.
  Это возвращает тот самый старый блок результатов.
*/
async function updatePreviousSeasonGames(existingGames) {
  const today = startOfDay(new Date());

  if (today < PREVIOUS_YEAR_START) {
    console.log("Previous season range has not started yet.");
    return [];
  }

  let fetchEnd = addDays(today, -1);

  if (fetchEnd > PREVIOUS_YEAR_END) {
    fetchEnd = startOfDay(PREVIOUS_YEAR_END);
  }

  if (fetchEnd < PREVIOUS_YEAR_START) {
    return existingGames;
  }

  let fetchStart;

  if (!existingGames.length) {
    fetchStart = startOfDay(PREVIOUS_YEAR_START);
    console.log("Initial previous season load: fetching from Jan 1 2026.");
  } else {
    fetchStart = maxDate(
      startOfDay(PREVIOUS_YEAR_START),
      addDays(fetchEnd, -RECENT_DAYS_TO_REFRESH)
    );

    console.log(`Previous season incremental load: refreshing last ${RECENT_DAYS_TO_REFRESH} days.`);
  }

  const dates = buildDatesRange(fetchStart, fetchEnd);

  console.log(
    `Fetching previous season dates: ${toESPNDate(fetchStart)} - ${toESPNDate(fetchEnd)} (${dates.length} days)`
  );

  const eventsByDay = await runWithConcurrency(
    dates,
    CONCURRENT_REQUESTS,
    async date => {
      const events = await fetchESPNEventsByDate(date);
      console.log(`Previous ${toESPNDate(date)}: ${events.length} events`);
      return events;
    }
  );

  const freshGames = normalizeEvents(eventsByDay.flat())
    .filter(game => game.isCompleted)
    .filter(game => isDateInsidePreviousSeason(new Date(game.date)));

  const freshIds = new Set(freshGames.map(game => String(game.id)));

  const oldGames = existingGames
    .filter(game => !freshIds.has(String(game.id)))
    .filter(game => isDateInsidePreviousSeason(new Date(game.date)));

  return dedupeGames([...oldGames, ...freshGames])
    .filter(game => game.isCompleted)
    .filter(game => isDateInsidePreviousSeason(new Date(game.date)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/*
  Новый сезон 2026-2027.
*/
async function updateCurrentSeasonGames(existingGames) {
  const today = startOfDay(new Date());

  if (today < CURRENT_SEASON_START) {
    console.log("Current season has not started yet.");
    return [];
  }

  let fetchEnd = addDays(today, -1);

  if (fetchEnd > CURRENT_SEASON_END) {
    fetchEnd = startOfDay(CURRENT_SEASON_END);
  }

  if (fetchEnd < CURRENT_SEASON_START) {
    return existingGames;
  }

  let fetchStart;

  if (!existingGames.length) {
    fetchStart = startOfDay(CURRENT_SEASON_START);
    console.log("Initial current season load: fetching from season start.");
  } else {
    fetchStart = maxDate(
      startOfDay(CURRENT_SEASON_START),
      addDays(fetchEnd, -RECENT_DAYS_TO_REFRESH)
    );

    console.log(`Current season incremental load: refreshing last ${RECENT_DAYS_TO_REFRESH} days.`);
  }

  const dates = buildDatesRange(fetchStart, fetchEnd);

  console.log(
    `Fetching current season dates: ${toESPNDate(fetchStart)} - ${toESPNDate(fetchEnd)} (${dates.length} days)`
  );

  const eventsByDay = await runWithConcurrency(
    dates,
    CONCURRENT_REQUESTS,
    async date => {
      const events = await fetchESPNEventsByDate(date);
      console.log(`Current ${toESPNDate(date)}: ${events.length} events`);
      return events;
    }
  );

  const freshGames = normalizeEvents(eventsByDay.flat())
    .filter(game => game.isCompleted)
    .filter(game => isDateInsideCurrentSeason(new Date(game.date)));

  const freshIds = new Set(freshGames.map(game => String(game.id)));

  const oldGames = existingGames
    .filter(game => !freshIds.has(String(game.id)))
    .filter(game => isDateInsideCurrentSeason(new Date(game.date)));

  return dedupeGames([...oldGames, ...freshGames])
    .filter(game => game.isCompleted)
    .filter(game => isDateInsideCurrentSeason(new Date(game.date)))
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

/*
  Ближайшие матчи:
  сегодня + следующие 2 дня.
*/
async function loadUpcomingGames() {
  const today = startOfDay(new Date());

  const dates = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const date = addDays(today, i);

    if (isDateInsideCurrentSeason(date)) {
      dates.push(date);
    }
  }

  if (!dates.length) {
    console.log("No upcoming dates inside current season.");
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
    .filter(game => isDateInsideCurrentSeason(new Date(game.date)))
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

function isDateInsidePreviousSeason(date) {
  return date >= PREVIOUS_YEAR_START && date <= PREVIOUS_YEAR_END;
}

function isDateInsideCurrentSeason(date) {
  return date >= CURRENT_SEASON_START && date <= CURRENT_SEASON_END;
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
