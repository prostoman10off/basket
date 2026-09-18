const ESPN_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const DAYS_AHEAD = 3;
const APP_YEAR = new Date().getFullYear();

const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 часов
const TODAY_CACHE_KEY = getTodayCacheKey();

const upcomingContainer = document.getElementById("upcomingGames");
const pastContainer = document.getElementById("pastGames");
const refreshBtn = document.getElementById("refreshBtn");

const gamesCountEl = document.getElementById("gamesCount");
const upcomingCountEl = document.getElementById("upcomingCount");
const yearLabelEl = document.getElementById("yearLabel");
const lastUpdateEl = document.getElementById("lastUpdate");

yearLabelEl.textContent = APP_YEAR;

refreshBtn.addEventListener("click", () => {
  localStorage.removeItem(TODAY_CACHE_KEY);
  loadDashboard();
});

loadDashboard();

async function loadDashboard() {
  try {
    renderLoading();

    const cached = getCachedData();

    if (cached) {
      renderDashboard(cached);
      return;
    }

    const [upcomingGames, pastGames] = await Promise.all([
      loadUpcomingGames(),
      loadPastGamesForYear()
    ]);

    const data = {
      upcomingGames,
      pastGames,
      updatedAt: new Date().toISOString()
    };

    setCachedData(data);
    renderDashboard(data);
  } catch (error) {
    console.error(error);
    renderError(error);
  }
}

function renderLoading() {
  upcomingContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  pastContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: загрузка...";
}

function renderDashboard(data) {
  const { upcomingGames, pastGames, updatedAt } = data;

  gamesCountEl.textContent = pastGames.length;
  upcomingCountEl.textContent = upcomingGames.length;
  lastUpdateEl.textContent = `Последнее обновление: ${formatDateTime(updatedAt)}`;

  renderUpcomingGames(upcomingGames);
  renderPastGames(pastGames);
}

async function loadUpcomingGames() {
  const today = startOfDay(new Date());
  const from = addDays(today, 1);
  const to = addDays(today, DAYS_AHEAD);

  const datesParam = `${toESPNDate(from)}-${toESPNDate(to)}`;
  const events = await fetchESPNEvents(datesParam);

  return normalizeEvents(events)
    .filter(game => {
      const gameDate = new Date(game.date);
      return gameDate >= from && gameDate <= addDays(to, 1) && !game.isCompleted;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

async function loadPastGamesForYear() {
  const today = startOfDay(new Date());
  const yesterday = addDays(today, -1);

  const start = new Date(APP_YEAR, 0, 1);
  const end = yesterday;

  if (end < start) {
    return [];
  }

  const ranges = buildMonthRanges(start, end);

  const responses = await Promise.all(
    ranges.map(range => fetchESPNEvents(`${toESPNDate(range.from)}-${toESPNDate(range.to)}`))
  );

  const allEvents = responses.flat();

  return normalizeEvents(allEvents)
    .filter(game => {
      const gameDate = new Date(game.date);
      return (
        game.isCompleted &&
        gameDate.getFullYear() === APP_YEAR &&
        gameDate < today
      );
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

async function fetchESPNEvents(datesParam) {
  const url = `${ESPN_API_URL}?dates=${datesParam}&limit=1000`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`ESPN API error: ${response.status}`);
  }

  const data = await response.json();

  return data.events || [];
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
  const statusDescription = statusType.description || "Unknown";

  const isCompleted =
    statusState === "post" ||
    statusName.includes("FINAL") ||
    statusName === "STATUS_FINAL";

  const isScheduled =
    statusState === "pre" ||
    statusName === "STATUS_SCHEDULED";

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

    homeTeam: {
      id: home.team.id,
      name: home.team.displayName || home.team.name,
      shortName: home.team.shortDisplayName || home.team.abbreviation,
      abbreviation: home.team.abbreviation,
      logo: getTeamLogo(home.team),
      score: Number(home.score || 0)
    },

    awayTeam: {
      id: away.team.id,
      name: away.team.displayName || away.team.name,
      shortName: away.team.shortDisplayName || away.team.abbreviation,
      abbreviation: away.team.abbreviation,
      logo: getTeamLogo(away.team),
      score: Number(away.score || 0)
    }
  };
}

function getTeamLogo(team) {
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
    upcomingContainer.innerHTML = renderEmptyState();
    return;
  }

  upcomingContainer.innerHTML = games
    .map(game => renderGameCard(game, "upcoming"))
    .join("");
}

function renderPastGames(games) {
  if (!games.length) {
    pastContainer.innerHTML = `
      <div class="empty-state">
        <div class="empty-ball">🏀</div>
        <h3>Пока нет завершённых матчей за ${APP_YEAR}</h3>
        <p>Как только ESPN отдаст результаты — они появятся здесь.</p>
      </div>
    `;
    return;
  }

  pastContainer.innerHTML = games
    .map(game => renderGameCard(game, "result"))
    .join("");
}

function renderGameCard(game, type) {
  const isResult = type === "result";

  const statusClass = isResult ? "final" : "scheduled";
  const statusText = isResult ? "Final" : "Scheduled";

  return `
    <article class="game-card">
      <div class="game-inner">
        <div class="game-top">
          <div>
            <div class="game-date">${formatGameDate(game.date)}</div>
            <div>${formatDateTime(game.date)}</div>
          </div>
          <div class="game-status ${statusClass}">
            ${statusText}
          </div>
        </div>

        <div class="matchup">
          ${renderTeam(game.awayTeam, "away")}

          <div class="center-score">
            ${
              isResult
                ? `
                  <div class="score">
                    ${game.awayTeam.score}<span>:</span>${game.homeTeam.score}
                  </div>
                `
                : `
                  <div class="match-time">${formatOnlyTime(game.date)}</div>
                  <div class="vs">VS</div>
                `
            }
          </div>

          ${renderTeam(game.homeTeam, "home")}
        </div>
      </div>
    </article>
  `;
}

function renderTeam(team, type) {
  const icon = type === "home" ? "🏠" : "✈️";
  const label = type === "home" ? "дома" : "выезд";

  const logoMarkup = team.logo
    ? `<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)}" loading="lazy" />`
    : `<div class="team-logo">🏀</div>`;

  if (type === "home") {
    return `
      <div class="team home">
        <div>
          <div class="team-name">${escapeHtml(team.name)}</div>
          <div class="team-mark">${icon} ${label}</div>
        </div>
        ${logoMarkup}
      </div>
    `;
  }

  return `
    <div class="team away">
      ${logoMarkup}
      <div>
        <div class="team-name">${escapeHtml(team.name)}</div>
        <div class="team-mark">${icon} ${label}</div>
      </div>
    </div>
  `;
}

function renderEmptyState() {
  return `
    <div class="empty-state">
      <div class="empty-ball">🏀</div>
      <h3>Джем, скоро матч…</h3>
      <p>На ближайшие ${DAYS_AHEAD} дня ESPN пока не отдаёт игр NBA.</p>
    </div>
  `;
}

function renderError(error) {
  upcomingContainer.innerHTML = `
    <div class="error-box">
      Не удалось загрузить ближайшие матчи. Попробуй обновить страницу.
    </div>
  `;

  pastContainer.innerHTML = `
    <div class="error-box">
      Не удалось загрузить прошедшие матчи. Ошибка: ${escapeHtml(error.message)}
    </div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: ошибка";
}

function buildMonthRanges(startDate, endDate) {
  const ranges = [];

  let current = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (current <= endDate) {
    const from = current < startDate ? new Date(startDate) : new Date(current);
    const monthEnd = new Date(current.getFullYear(), current.getMonth() + 1, 0);
    const to = monthEnd > endDate ? new Date(endDate) : monthEnd;

    ranges.push({ from, to });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return ranges;
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

function formatOnlyTime(dateString) {
  const date = new Date(dateString);

  return date.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getTodayCacheKey() {
  const today = new Date();
  const date = toESPNDate(today);

  return `nba-dashboard-${APP_YEAR}-${date}`;
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
    // Если localStorage недоступен — просто ничего не делаем
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
