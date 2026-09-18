const ESPN_SCOREBOARD_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const ESPN_STANDINGS_API_URL =
  "https://site.web.api.espn.com/apis/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn&type=0";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

/*
  Фиксируем 2026, как ты просил.
*/
const APP_YEAR = 2026;

const DAYS_AHEAD = 3;
const CONCURRENT_REQUESTS = 4;
const CACHE_TTL_MS = 1000 * 60 * 60 * 4;

/*
  Новая версия кэша, чтобы старые данные не мешали.
*/
const CACHE_VERSION = "v4";

const TODAY_CACHE_KEY = getTodayCacheKey();

const upcomingContainer = document.getElementById("upcomingGames");
const pastContainer = document.getElementById("pastGames");
const refreshBtn = document.getElementById("refreshBtn");

const gamesCountEl = document.getElementById("gamesCount");
const upcomingCountEl = document.getElementById("upcomingCount");
const yearLabelEl = document.getElementById("yearLabel");
const lastUpdateEl = document.getElementById("lastUpdate");

let standingsByTeamId = {};

yearLabelEl.textContent = APP_YEAR;

refreshBtn.addEventListener("click", () => {
  clearAppCache();
  loadDashboard();
});

loadDashboard();

async function loadDashboard() {
  try {
    renderLoading();

    const cached = getCachedData();

    if (cached) {
      standingsByTeamId = cached.standingsByTeamId || {};
      renderDashboard(cached);
      return;
    }

    const [upcomingGames, pastGames, standings] = await Promise.all([
      loadUpcomingGamesSafe(),
      loadPastGamesForYearSafe(),
      loadStandingsSafe()
    ]);

    standingsByTeamId = standings || {};

    const data = {
      upcomingGames,
      pastGames,
      standingsByTeamId,
      updatedAt: new Date().toISOString()
    };

    setCachedData(data);
    renderDashboard(data);
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  }
}

function renderLoading() {
  upcomingContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  pastContainer.innerHTML = `
    <div class="loading-card">
      <div class="loading-title">Готовим NBA-фид ${APP_YEAR}</div>
      <div class="loading-text">
        Проверяем календарь ESPN и собираем завершённые матчи.
      </div>
      <div class="progress-track">
        <div class="progress-fill" style="width: 0%"></div>
      </div>
      <div class="progress-meta">Стартуем...</div>
    </div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: загрузка...";
}

function renderDashboard(data) {
  const { upcomingGames, pastGames, updatedAt } = data;

  standingsByTeamId = data.standingsByTeamId || {};

  gamesCountEl.textContent = pastGames.length;
  upcomingCountEl.textContent = upcomingGames.length;
  lastUpdateEl.textContent = `Последнее обновление: ${formatDateTime(updatedAt)}`;

  renderUpcomingGames(upcomingGames);
  renderPastGames(pastGames);
}

/*
  Ближайшие матчи.
*/
async function loadUpcomingGamesSafe() {
  try {
    const today = startOfDay(new Date());
    const dates = [];

    for (let i = 1; i <= DAYS_AHEAD; i++) {
      dates.push(addDays(today, i));
    }

    const eventsByDay = await runWithConcurrency(
      dates,
      CONCURRENT_REQUESTS,
      async date => fetchESPNEventsByDate(date)
    );

    const events = eventsByDay.flat();

    return normalizeEvents(events)
      .filter(game => !game.isCompleted)
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  } catch (error) {
    console.warn("Не удалось загрузить ближайшие матчи:", error);
    return [];
  }
}

/*
  Прошедшие матчи 2026.
*/
async function loadPastGamesForYearSafe() {
  try {
    const today = startOfDay(new Date());

    let endDate = addDays(today, -1);

    if (endDate.getFullYear() < APP_YEAR) {
      endDate = new Date(APP_YEAR, 11, 31);
    }

    if (endDate.getFullYear() > APP_YEAR) {
      endDate = new Date(APP_YEAR, 11, 31);
    }

    const startDate = new Date(APP_YEAR, 0, 1);
    const dates = [];

    let current = new Date(endDate);

    while (current >= startDate) {
      dates.push(new Date(current));
      current = addDays(current, -1);
    }

    updatePastLoadingProgress(0, dates.length, 0);

    let foundEventsCount = 0;
    let processedDays = 0;

    const eventsByDay = await runWithConcurrency(
      dates,
      CONCURRENT_REQUESTS,
      async date => {
        const events = await fetchESPNEventsByDate(date);

        processedDays++;
        foundEventsCount += events.length;

        updatePastLoadingProgress(
          processedDays,
          dates.length,
          foundEventsCount
        );

        return events;
      }
    );

    const events = eventsByDay.flat();

    return normalizeEvents(events)
      .filter(game => {
        const gameDate = new Date(game.date);

        return (
          game.isCompleted &&
          gameDate.getFullYear() === APP_YEAR
        );
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
  } catch (error) {
    console.warn("Не удалось загрузить прошедшие матчи:", error);
    return [];
  }
}

function updatePastLoadingProgress(done, total, foundEventsCount) {
  if (!pastContainer) return;

  const percent = total ? Math.round((done / total) * 100) : 0;

  pastContainer.innerHTML = `
    <div class="loading-card">
      <div class="loading-title">Загружаем результаты NBA ${APP_YEAR}</div>
      <div class="loading-text">
        ESPN не всегда стабильно отдаёт диапазоны дат, поэтому проверяем дни отдельно.
      </div>

      <div class="progress-track">
        <div class="progress-fill" style="width: ${percent}%"></div>
      </div>

      <div class="progress-meta">
        Проверено дней: ${Math.min(done, total)} из ${total}. 
        Событий найдено до фильтрации: ${foundEventsCount}.
      </div>
    </div>
  `;
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
    console.warn(`ESPN scoreboard ${dateParam}: ошибка запроса`, error);
    return [];
  }
}

/*
  Турнирное положение.
  ESPN может отдавать standings нестабильно, поэтому всё завёрнуто безопасно.
  Если не получится — просто ничего не покажем в карточках.
*/
async function loadStandingsSafe() {
  const urls = [
    ESPN_STANDINGS_API_URL,
    "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/standings?region=us&lang=en&contentorigin=espn"
  ];

  for (const url of urls) {
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
      console.warn("ESPN standings: ошибка запроса", error);
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
  if (!node) {
    return;
  }

  if (Array.isArray(node)) {
    node.forEach(item => walkStandingsNode(item, context, result));
    return;
  }

  if (typeof node !== "object") {
    return;
  }

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

      const group = nextContext
        .filter(Boolean)
        .filter(name => /conference|division|east|west|atlantic|central|southeast|northwest|pacific|southwest/i.test(name))
        .slice(-1)[0] || "";

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
        group,
        display: [record, ...rankParts].filter(Boolean).join(" · ")
      };
    }
  }

  Object.keys(node).forEach(key => {
    if (key === "team" || key === "stats") {
      return;
    }

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

  if (!found) {
    return "";
  }

  if (found.displayValue !== undefined && found.displayValue !== null) {
    return String(found.displayValue);
  }

  if (found.value !== undefined && found.value !== null) {
    return String(found.value);
  }

  return "";
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

function normalizeEvents(events) {
  const gamesMap = new Map();

  events.forEach(event => {
    const game = normalizeEvent(event);

    if (!game) {
      return;
    }

    gamesMap.set(game.id, game);
  });

  return Array.from(gamesMap.values());
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

  const isScheduled =
    statusState === "pre" ||
    statusName === "STATUS_SCHEDULED";

  const stage = getGameStage(event, competition);
  const seriesText = getSeriesText(event, competition);

  return {
    id: event.id,
    name: event.name,
    shortName: event.shortName,
    date: event.date,
    statusName,
    statusState,
    statusDescription,
    isCompleted,
    isScheduled,
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
  if (!team) {
    return "";
  }

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

function renderUpcomingGames(games) {
  if (!games.length) {
    upcomingContainer.innerHTML = renderNbaEmptyState(
      "NBA Jam, скоро матч…",
      `На ближайшие ${DAYS_AHEAD} дня ESPN не показывает игр NBA. Похоже, ждём следующий игровой день.`
    );

    return;
  }

  upcomingContainer.innerHTML = games
    .map(game => renderGameCard(game, "upcoming"))
    .join("");
}

function renderPastGames(games) {
  if (!games.length) {
    pastContainer.innerHTML = renderNbaEmptyState(
      `Пока не нашли завершённых матчей за ${APP_YEAR}`,
      "Если матчи точно были, нажми «Обновить данные». Если не поможет — проверим конкретную дату в ESPN API."
    );

    return;
  }

  pastContainer.innerHTML = games
    .map(game => renderGameCard(game, "result"))
    .join("");
}

function renderGameCard(game, type) {
  const isResult = type === "result";

  const awayWon = isResult && game.awayTeam.score > game.homeTeam.score;
  const homeWon = isResult && game.homeTeam.score > game.awayTeam.score;

  const statusClass = isResult ? "final" : "scheduled";
  const statusText = isResult ? "Final" : "Scheduled";

  const winnerClass = isResult
    ? awayWon
      ? "winner-away"
      : homeWon
        ? "winner-home"
        : ""
    : "";

  return `
    <article class="game-card ${isResult ? "result-card" : "upcoming-card"} ${winnerClass}">
      <div class="game-inner">

        <div class="game-top">
          <div>
            <div class="game-date">${formatGameDate(game.date)}</div>
            <div class="game-time-small">${formatDateTime(game.date)}</div>
          </div>

          <div class="game-status ${statusClass}">
            ${statusText}
          </div>
        </div>

        <div class="game-tags">
          ${renderStageTag(game.stage)}

          ${
            game.seriesText
              ? `<span class="game-tag series">Серия: ${escapeHtml(game.seriesText)}</span>`
              : ""
          }
        </div>

        <div class="compact-matchup">
          ${renderTeamLine(game.awayTeam, "away", isResult, awayWon)}
          ${renderTeamLine(game.homeTeam, "home", isResult, homeWon)}
        </div>

      </div>
    </article>
  `;
}

function renderStageTag(stage) {
  if (!stage || !stage.label) {
    return "";
  }

  return `
    <span class="game-tag ${escapeHtml(stage.className || "")}">
      ${escapeHtml(stage.label)}
    </span>
  `;
}

function renderTeamLine(team, type, isResult, isWinner) {
  const icon = type === "home" ? "🏠" : "✈️";
  const label = type === "home" ? "дома" : "выезд";
  const standing = getTeamStanding(team.id);

  const logoMarkup = team.logo
    ? `<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)}" loading="lazy" />`
    : `<div class="team-logo">🏀</div>`;

  const scoreMarkup = isResult
    ? `<div class="team-score">${team.score}</div>`
    : `<div class="team-score pending">VS</div>`;

  const seedMarkup = standing && standing.rank
    ? `<div class="team-seed">#${escapeHtml(standing.rank)}</div>`
    : "";

  return `
    <div class="team-line ${isWinner ? "winner" : ""}">
      <div class="team-main">
        ${logoMarkup}

        <div class="team-text">
          <div class="team-name" title="${escapeHtml(team.name)}">
            ${escapeHtml(team.shortName || team.name)}
          </div>

          <div class="team-meta">
            <span class="team-mark">${icon} ${label}</span>

            ${
              standing && standing.display
                ? `<span class="team-standing" title="${escapeHtml(standing.display)}">${escapeHtml(standing.display)}</span>`
                : ""
            }
          </div>
        </div>
      </div>

      <div class="team-side">
        ${scoreMarkup}
        ${seedMarkup}
      </div>
    </div>
  `;
}

function getTeamStanding(teamId) {
  if (!teamId) {
    return null;
  }

  return standingsByTeamId[String(teamId)] || null;
}

function renderNbaEmptyState(title, text) {
  return `
    <div class="empty-state">
      <img 
        class="nba-empty-logo" 
        src="${NBA_LOGO_URL}" 
        alt="NBA" 
        loading="lazy"
        onerror="this.style.display='none'; this.insertAdjacentHTML('afterend', '<div class=&quot;empty-ball&quot;>🏀</div>');"
      />

      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function renderFatalError(error) {
  upcomingContainer.innerHTML = renderNbaEmptyState(
    "NBA Jam, скоро матч…",
    "Ближайшие матчи сейчас не загрузились, но это не критично."
  );

  pastContainer.innerHTML = `
    <div class="error-box">
      Ошибка приложения: ${escapeHtml(error.message)}
    </div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: ошибка";
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
        console.warn("Ошибка загрузки элемента:", items[currentIndex], error);
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

function toESPNDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

function formatGameDate(dateString) {
  const date = new Date(dateString);

  return date.toLocaleDateString("ru-RU", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  });
}

function formatDateTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getTodayCacheKey() {
  const today = new Date();
  const date = toESPNDate(today);

  return `nba-dashboard-${CACHE_VERSION}-${APP_YEAR}-${date}`;
}

function getCachedData() {
  try {
    const raw = localStorage.getItem(TODAY_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const cached = JSON.parse(raw);

    if (!cached.timestamp || !cached.data) {
      return null;
    }

    const isFresh = Date.now() - cached.timestamp < CACHE_TTL_MS;

    return isFresh ? cached.data : null;
  } catch {
    return null;
  }
}

function setCachedData(data) {
  try {
    localStorage.setItem(
      TODAY_CACHE_KEY,
      JSON.stringify({
        timestamp: Date.now(),
        data
      })
    );
  } catch {
    // Если localStorage недоступен — ничего не делаем.
  }
}

function clearAppCache() {
  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith("nba-dashboard-")) {
        localStorage.removeItem(key);
      }
    });
  } catch {
    // Ничего не делаем.
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
