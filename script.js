const ESPN_API_URL =
  "https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

/*
  Важно:
  Фиксируем год как 2026, потому что ты просил максимум текущий год — 2026.
  Раньше код брал год из браузера через new Date().getFullYear().
  Если у браузера/системы был другой год, он мог искать не 2026.
*/
const APP_YEAR = 2026;

const DAYS_AHEAD = 3;
const CONCURRENT_REQUESTS = 4;
const CACHE_TTL_MS = 1000 * 60 * 60 * 4; // 4 часа

/*
  Версия кэша.
  Меняй число, если нужно принудительно сбросить старые данные у всех.
*/
const CACHE_VERSION = "v3";

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
  clearAppCache();
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
      loadUpcomingGamesSafe(),
      loadPastGamesForYearSafe()
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
    renderFatalError(error);
  }
}

function renderLoading() {
  upcomingContainer.innerHTML = `
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

  gamesCountEl.textContent = pastGames.length;
  upcomingCountEl.textContent = upcomingGames.length;
  lastUpdateEl.textContent = `Последнее обновление: ${formatDateTime(updatedAt)}`;

  renderUpcomingGames(upcomingGames);
  renderPastGames(pastGames);
}

/*
  Ближайшие матчи.
  Если ESPN не ответил или матчей нет — НЕ показываем ошибку.
  Показываем NBA-заглушку.
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
      async date => {
        return fetchESPNEventsByDate(date);
      }
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
  Идём от вчерашнего дня назад до 1 января 2026.
  Каждый день запрашиваем отдельно — так ESPN работает стабильнее.
*/
async function loadPastGamesForYearSafe() {
  try {
    const today = startOfDay(new Date());

    let endDate = addDays(today, -1);

    /*
      Если вдруг локальная дата пользователя меньше 2026 года,
      всё равно дадим возможность смотреть 2026:
      берём конец года как 31.12.2026, но не уходим в будущее относительно 2026.
    */
    if (endDate.getFullYear() < APP_YEAR) {
      endDate = new Date(APP_YEAR, 11, 31);
    }

    /*
      Если пользователь уже после 2026 — ограничиваем 31.12.2026.
    */
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
    `${ESPN_API_URL}?dates=${dateParam}&limit=100&region=us&lang=en&contentorigin=espn`;

  try {
    const response = await fetchWithTimeout(url, 12000);

    if (!response.ok) {
      console.warn(`ESPN API ${dateParam}: HTTP ${response.status}`);
      return [];
    }

    const data = await response.json();

    return data.events || [];
  } catch (error) {
    console.warn(`ESPN API ${dateParam}: ошибка запроса`, error);
    return [];
  }
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
      name: home.team.displayName || home.team.name || "Home Team",
      shortName: home.team.shortDisplayName || home.team.abbreviation || "",
      abbreviation: home.team.abbreviation || "",
      logo: getTeamLogo(home.team),
      score: Number(home.score || 0)
    },

    awayTeam: {
      id: away.team.id,
      name: away.team.displayName || away.team.name || "Away Team",
      shortName: away.team.shortDisplayName || away.team.abbreviation || "",
      abbreviation: away.team.abbreviation || "",
      logo: getTeamLogo(away.team),
      score: Number(away.score || 0)
    }
  };
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
