const CURRENT_SEASON_DATA_URL = "data/nba-2026-2027.json";
const PREVIOUS_SEASON_DATA_URL = "data/nba-2026.json";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

const SEASON_LABEL = "2026–2027";

/*
  Все даты на лендинге показываем по Новосибирску.
  Новосибирск находится в часовом поясе UTC+7.
*/
const DISPLAY_TIME_ZONE = "Asia/Novosibirsk";
const DISPLAY_TIME_ZONE_LABEL = "НСК";

const PAGE_SIZE = 12;

const FANS = [
  {
    id: "andrei",
    name: "Андрей",
    photo: "Andrei.jpg",
    teamLabel: "76ers",
    teamAbbr: "PHI",
    aliases: [
      "phi",
      "philadelphia",
      "philadelphia 76ers",
      "76ers",
      "sixers"
    ]
  },
  {
    id: "ivan",
    name: "Иван",
    photo: "Ivan.jpg",
    teamLabel: "Celtics",
    teamAbbr: "BOS",
    aliases: [
      "bos",
      "boston",
      "boston celtics",
      "celtics"
    ]
  },
  {
    id: "seva",
    name: "Сева",
    photo: "Seva.jpg",
    teamLabel: "Warriors",
    teamAbbr: "GSW",
    aliases: [
      "gsw",
      "golden state",
      "golden state warriors",
      "warriors"
    ]
  }
];

const state = {
  currentFilter: "all",
  currentSeasonData: null,
  previousSeasonData: null,
  seasonVisibleCount: PAGE_SIZE,
  previousVisibleCount: PAGE_SIZE
};

const elements = {
  upcomingContainer: document.getElementById("upcomingGames"),

  seasonContainer: document.getElementById("seasonGames"),

  previousSeasonContainer: document.getElementById(
    "previousSeasonGames"
  ),

  refreshBtn: document.getElementById("refreshBtn"),

  teamFilters: document.getElementById("teamFilters"),

  loadMoreSeason: document.getElementById("loadMoreSeason"),

  loadMorePrevious: document.getElementById(
    "loadMorePrevious"
  ),

  gamesCount: document.getElementById("gamesCount"),

  upcomingCount: document.getElementById("upcomingCount"),

  seasonLabel: document.getElementById("seasonLabel"),

  upcomingSectionCount: document.getElementById(
    "upcomingSectionCount"
  ),

  seasonSectionCount: document.getElementById(
    "seasonSectionCount"
  ),

  previousSectionCount: document.getElementById(
    "previousSectionCount"
  ),

  nextGameValue: document.getElementById("nextGameValue"),

  nextGameMeta: document.getElementById("nextGameMeta"),

  lastUpdate: document.getElementById("lastUpdate"),

  headerUpdateIndicator: document.getElementById(
    "headerUpdateIndicator"
  )
};

elements.seasonLabel.textContent = SEASON_LABEL;

elements.refreshBtn.addEventListener("click", () => {
  loadDashboard(true);
});

elements.teamFilters.addEventListener("click", event => {
  const button = event.target.closest("[data-filter]");

  if (!button) {
    return;
  }

  setActiveFilter(button.dataset.filter);
});

elements.loadMoreSeason.addEventListener("click", () => {
  state.seasonVisibleCount += PAGE_SIZE;
  renderAllSections();
});

elements.loadMorePrevious.addEventListener("click", () => {
  state.previousVisibleCount += PAGE_SIZE;
  renderAllSections();
});

loadDashboard(false);

async function loadDashboard(forceFresh) {
  setLoadingState(true);
  renderLoading();

  try {
    const [currentSeasonData, previousSeasonData] =
      await Promise.all([
        fetchJsonData(
          CURRENT_SEASON_DATA_URL,
          forceFresh
        ),

        fetchJsonData(
          PREVIOUS_SEASON_DATA_URL,
          forceFresh
        )
      ]);

    state.currentSeasonData = currentSeasonData;
    state.previousSeasonData = previousSeasonData;

    state.seasonVisibleCount = PAGE_SIZE;
    state.previousVisibleCount = PAGE_SIZE;

    renderDashboard();

    setUpdateIndicator("success", "Данные актуальны");
  } catch (error) {
    console.error(error);

    renderFatalError(error);

    setUpdateIndicator("error", "Ошибка загрузки");
  } finally {
    setLoadingState(false);
  }
}

async function fetchJsonData(url, forceFresh) {
  const separator = url.includes("?") ? "&" : "?";

  const cacheVersion = forceFresh
    ? Date.now()
    : Math.floor(Date.now() / 60000);

  const response = await fetch(
    `${url}${separator}v=${cacheVersion}`,
    {
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить ${url}: HTTP ${response.status}`
    );
  }

  return response.json();
}

function setLoadingState(isLoading) {
  elements.refreshBtn.disabled = isLoading;

  elements.refreshBtn.classList.toggle(
    "loading",
    isLoading
  );

  if (isLoading) {
    setUpdateIndicator("loading", "Обновляем данные");
  }
}

function setUpdateIndicator(type, text) {
  elements.headerUpdateIndicator.classList.remove(
    "loading",
    "error"
  );

  if (type === "loading") {
    elements.headerUpdateIndicator.classList.add("loading");
  }

  if (type === "error") {
    elements.headerUpdateIndicator.classList.add("error");
  }

  const textElement =
    elements.headerUpdateIndicator.querySelector(
      "span:last-child"
    );

  if (textElement) {
    textElement.textContent = text;
  }
}

function renderLoading() {
  const skeletons = createSkeletons(4);

  elements.upcomingContainer.innerHTML = skeletons;
  elements.seasonContainer.innerHTML = skeletons;
  elements.previousSeasonContainer.innerHTML = skeletons;

  elements.gamesCount.textContent = "—";
  elements.upcomingCount.textContent = "—";

  elements.upcomingSectionCount.textContent = "—";
  elements.seasonSectionCount.textContent = "—";
  elements.previousSectionCount.textContent = "—";

  elements.nextGameValue.textContent = "Загружаем…";

  elements.nextGameMeta.textContent =
    "Проверяем расписание";

  elements.lastUpdate.textContent =
    "Последнее обновление: загрузка";

  elements.loadMoreSeason.hidden = true;
  elements.loadMorePrevious.hidden = true;
}

function createSkeletons(count) {
  return Array.from(
    { length: count },
    () => `<div class="skeleton-card"></div>`
  ).join("");
}

function renderDashboard() {
  const currentData = state.currentSeasonData || {};
  const previousData = state.previousSeasonData || {};

  const upcomingGames = sortGamesAscending(
    currentData.upcomingGames || []
  );

  const seasonGames = sortGamesDescending(
    currentData.seasonGames || []
  );

  const previousGames = sortGamesDescending(
    previousData.pastGames || []
  );

  elements.gamesCount.textContent = seasonGames.length;

  elements.upcomingCount.textContent =
    upcomingGames.length;

  renderNextGame(upcomingGames);

  renderLastUpdate(currentData, previousData);

  renderAllSections();
}

function renderAllSections() {
  if (
    !state.currentSeasonData ||
    !state.previousSeasonData
  ) {
    return;
  }

  const upcomingGames = filterGames(
    sortGamesAscending(
      state.currentSeasonData.upcomingGames || []
    )
  );

  const seasonGames = filterGames(
    sortGamesDescending(
      state.currentSeasonData.seasonGames || []
    )
  );

  const previousGames = filterGames(
    sortGamesDescending(
      state.previousSeasonData.pastGames || []
    )
  );

  renderUpcomingGames(upcomingGames);
  renderSeasonGames(seasonGames);
  renderPreviousSeasonGames(previousGames);

  elements.upcomingSectionCount.textContent =
    upcomingGames.length;

  elements.seasonSectionCount.textContent =
    seasonGames.length;

  elements.previousSectionCount.textContent =
    previousGames.length;
}

function setActiveFilter(filter) {
  state.currentFilter = filter;

  state.seasonVisibleCount = PAGE_SIZE;
  state.previousVisibleCount = PAGE_SIZE;

  document
    .querySelectorAll(".filter-btn")
    .forEach(button => {
      button.classList.toggle(
        "active",
        button.dataset.filter === filter
      );
    });

  renderAllSections();
}

function filterGames(games) {
  if (state.currentFilter === "all") {
    return games;
  }

  if (state.currentFilter === "friends") {
    return games.filter(game => {
      return getFansForGame(game).length > 0;
    });
  }

  return games.filter(game => {
    return (
      teamMatchesAbbreviation(
        game.awayTeam,
        state.currentFilter
      ) ||
      teamMatchesAbbreviation(
        game.homeTeam,
        state.currentFilter
      )
    );
  });
}

function teamMatchesAbbreviation(team, abbreviation) {
  if (!team) {
    return false;
  }

  const fan = FANS.find(
    item => item.teamAbbr === abbreviation
  );

  if (!fan) {
    return false;
  }

  return isFanTeam(team, fan);
}

function renderNextGame(upcomingGames) {
  if (!upcomingGames.length) {
    elements.nextGameValue.textContent =
      "Матчей пока нет";

    elements.nextGameMeta.textContent =
      "Ждём следующий игровой день";

    return;
  }

  const game = upcomingGames[0];

  elements.nextGameValue.textContent =
    `${getTeamShortName(game.awayTeam)} — ` +
    `${getTeamShortName(game.homeTeam)}`;

  elements.nextGameMeta.textContent =
    `${formatCompactDateTime(game.date)} · ` +
    getRelativeGameTime(game.date);
}

function renderLastUpdate(currentData, previousData) {
  const updateDates = [
    currentData.updatedAt,
    previousData.updatedAt
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  if (!updateDates.length) {
    elements.lastUpdate.textContent =
      "Последнее обновление: ещё не запускалось";

    return;
  }

  elements.lastUpdate.textContent =
    `Обновлено: ${formatUpdateDate(updateDates[0])}`;
}

function renderUpcomingGames(games) {
  if (!games.length) {
    const filterIsActive =
      state.currentFilter !== "all";

    elements.upcomingContainer.innerHTML =
      renderNbaEmptyState(
        filterIsActive
          ? "Матчей по фильтру нет"
          : "NBA Jam, скоро матч…",

        filterIsActive
          ? "Попробуй выбрать другую команду."
          : "Ждём следующий игровой день."
      );

    return;
  }

  elements.upcomingContainer.innerHTML = games
    .map(game => renderGameCard(game, "upcoming"))
    .join("");
}

function renderSeasonGames(games) {
  if (!games.length) {
    elements.seasonContainer.innerHTML =
      renderNbaEmptyState(
        state.currentFilter === "all"
          ? `Сезон ${SEASON_LABEL} пока пуст`
          : "Матчей по фильтру нет",

        state.currentFilter === "all"
          ? "Результаты появятся после завершения матчей."
          : "Попробуй выбрать другую команду."
      );

    elements.loadMoreSeason.hidden = true;

    return;
  }

  const visibleGames = games.slice(
    0,
    state.seasonVisibleCount
  );

  elements.seasonContainer.innerHTML = visibleGames
    .map(game => renderGameCard(game, "result"))
    .join("");

  updateLoadMoreButton(
    elements.loadMoreSeason,
    games.length,
    state.seasonVisibleCount
  );
}

function renderPreviousSeasonGames(games) {
  if (!games.length) {
    elements.previousSeasonContainer.innerHTML =
      renderNbaEmptyState(
        state.currentFilter === "all"
          ? "Архив пока пуст"
          : "Матчей по фильтру нет",

        state.currentFilter === "all"
          ? "Результаты появятся после обновления данных."
          : "Попробуй выбрать другую команду."
      );

    elements.loadMorePrevious.hidden = true;

    return;
  }

  const visibleGames = games.slice(
    0,
    state.previousVisibleCount
  );

  elements.previousSeasonContainer.innerHTML =
    visibleGames
      .map(game => renderGameCard(game, "result"))
      .join("");

  updateLoadMoreButton(
    elements.loadMorePrevious,
    games.length,
    state.previousVisibleCount
  );
}

function updateLoadMoreButton(button, total, visible) {
  const remaining = Math.max(total - visible, 0);

  button.hidden = remaining === 0;

  if (remaining > 0) {
    const amount = Math.min(PAGE_SIZE, remaining);

    button.innerHTML = `
      Показать ещё ${amount}
      <span aria-hidden="true">↓</span>
    `;
  }
}

function renderGameCard(game, type) {
  const isResult =
    type === "result" || Boolean(game.isCompleted);

  const awayScore = getNumericScore(game.awayTeam);
  const homeScore = getNumericScore(game.homeTeam);

  const awayWon =
    isResult &&
    awayScore !== null &&
    homeScore !== null &&
    awayScore > homeScore;

  const homeWon =
    isResult &&
    awayScore !== null &&
    homeScore !== null &&
    homeScore > awayScore;

  const gameFans = getFansForGame(game);

  const hasFans = gameFans.length > 0;

  const hasFanClash = gameFans.length >= 2;

  const status = getGameStatus(game, isResult);

  const cardClasses = [
    "game-card",

    isResult
      ? "result-card"
      : "upcoming-card",

    hasFans
      ? "has-fans"
      : "",

    hasFanClash
      ? "has-fan-clash"
      : "",

    status.className === "live"
      ? "live-card"
      : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article class="${cardClasses}">
      <div class="game-inner">
        <div class="game-top">
          <div>
            <div class="game-date">
              ${formatGameDay(game.date)}
            </div>

            <div class="game-time-small">
              ${formatGameTime(game.date)}
              ${DISPLAY_TIME_ZONE_LABEL}
            </div>
          </div>

          <div class="game-fan-zone">
            ${
              hasFanClash
                ? `
                  <div
                    class="clash-fire"
                    title="Дерби друзей"
                    aria-label="Дерби друзей"
                  >
                    🔥
                  </div>
                `
                : ""
            }

            ${
              hasFans
                ? renderGameFans(gameFans)
                : ""
            }
          </div>

          <div class="game-status ${status.className}">
            ${escapeHtml(status.label)}
          </div>
        </div>

        <div class="game-tags">
          ${renderStageTag(game.stage)}

          ${
            game.seriesText
              ? `
                <span
                  class="game-tag series"
                  title="${escapeHtml(game.seriesText)}"
                >
                  Серия: ${escapeHtml(game.seriesText)}
                </span>
              `
              : ""
          }
        </div>

        <div class="compact-matchup">
          ${renderTeamLine(
            game.awayTeam,
            "away",
            isResult,
            awayWon
          )}

          ${renderTeamLine(
            game.homeTeam,
            "home",
            isResult,
            homeWon
          )}
        </div>
      </div>
    </article>
  `;
}

function getGameStatus(game, isResult) {
  const statusState = normalizeString(
    game.statusState
  );

  const statusName = normalizeString(
    game.statusName
  );

  const statusDescription = normalizeString(
    game.statusDescription
  );

  const combinedStatus = [
    statusState,
    statusName,
    statusDescription
  ].join(" ");

  if (
    statusState === "in" ||
    combinedStatus.includes("in progress") ||
    combinedStatus.includes("halftime")
  ) {
    return {
      label: getLiveStatusLabel(game),
      className: "live"
    };
  }

  if (
    combinedStatus.includes("postponed") ||
    combinedStatus.includes("delayed")
  ) {
    return {
      label: "Перенесён",
      className: "postponed"
    };
  }

  if (
    combinedStatus.includes("canceled") ||
    combinedStatus.includes("cancelled")
  ) {
    return {
      label: "Отменён",
      className: "postponed"
    };
  }

  if (isResult) {
    return {
      label: "Завершён",
      className: "final"
    };
  }

  if (isTodayInNovosibirsk(game.date)) {
    return {
      label: "Сегодня",
      className: "today"
    };
  }

  return {
    label: "Скоро",
    className: "scheduled"
  };
}

function getLiveStatusLabel(game) {
  const description = String(
    game.statusDescription || ""
  ).trim();

  if (
    description &&
    !description
      .toLowerCase()
      .includes("in progress")
  ) {
    return `LIVE · ${description}`;
  }

  return "LIVE";
}

function renderGameFans(fans) {
  return `
    <div class="game-fans">
      ${fans
        .map(fan => {
          const title =
            `${fan.name} болеет за ${fan.teamLabel}`;

          return `
            <img
              class="game-fan-avatar"
              src="${escapeHtml(fan.photo)}"
              alt="${escapeHtml(fan.name)}"
              title="${escapeHtml(title)}"
              width="27"
              height="27"
              loading="lazy"
            />
          `;
        })
        .join("")}
    </div>
  `;
}

function renderStageTag(stage) {
  if (!stage || !stage.label) {
    return "";
  }

  const translatedLabel = translateStage(
    stage.label
  );

  return `
    <span class="game-tag ${escapeHtml(
      stage.className || ""
    )}">
      ${escapeHtml(translatedLabel)}
    </span>
  `;
}

function translateStage(label) {
  const normalized = normalizeString(label);

  if (
    normalized.includes("regular") ||
    normalized.includes("регуляр")
  ) {
    return "Регулярка";
  }

  if (
    normalized.includes("playoff") ||
    normalized.includes("postseason") ||
    normalized.includes("плей")
  ) {
    return "Плей-офф";
  }

  if (
    normalized.includes("preseason") ||
    normalized.includes("предсез")
  ) {
    return "Предсезонка";
  }

  return label;
}

function renderTeamLine(
  team,
  type,
  isResult,
  isWinner
) {
  const safeTeam = team || {};

  const icon =
    type === "home"
      ? "🏠"
      : "✈️";

  const label =
    type === "home"
      ? "дома"
      : "в гостях";

  const teamName =
    safeTeam.shortName ||
    safeTeam.name ||
    safeTeam.abbreviation ||
    "Команда";

  const fullTeamName =
    safeTeam.name || teamName;

  const logoMarkup = safeTeam.logo
    ? `
      <img
        class="team-logo"
        src="${escapeHtml(safeTeam.logo)}"
        alt="${escapeHtml(fullTeamName)}"
        width="33"
        height="33"
        loading="lazy"
      />
    `
    : `
      <div
        class="team-logo team-logo-fallback"
        aria-hidden="true"
      >
        🏀
      </div>
    `;

  const numericScore =
    getNumericScore(safeTeam);

  const scoreMarkup = isResult
    ? `
      <div class="team-score">
        ${
          numericScore === null
            ? "—"
            : numericScore
        }
      </div>

      ${
        isWinner
          ? `<span class="winner-mark">победа</span>`
          : ""
      }
    `
    : `
      <div class="team-score pending">
        VS
      </div>
    `;

  return `
    <div class="team-line ${isWinner ? "winner" : ""}">
      <div class="team-main">
        ${logoMarkup}

        <div class="team-text">
          <div
            class="team-name"
            title="${escapeHtml(fullTeamName)}"
          >
            ${escapeHtml(teamName)}
          </div>

          <div class="team-meta">
            <span class="team-mark">
              ${icon} ${label}
            </span>
          </div>
        </div>
      </div>

      <div class="team-side">
        ${scoreMarkup}
      </div>
    </div>
  `;
}

function getFansForGame(game) {
  if (!game) {
    return [];
  }

  return FANS.filter(fan => {
    return (
      isFanTeam(game.awayTeam, fan) ||
      isFanTeam(game.homeTeam, fan)
    );
  });
}

function isFanTeam(team, fan) {
  if (!team || !fan) {
    return false;
  }

  const teamValues = [
    team.name,
    team.shortName,
    team.abbreviation
  ]
    .filter(Boolean)
    .map(normalizeString);

  const fanAliases = [
    fan.teamAbbr,
    ...fan.aliases
  ].map(normalizeString);

  return teamValues.some(teamValue => {
    return fanAliases.some(alias => {
      return (
        teamValue === alias ||
        teamValue.includes(alias)
      );
    });
  });
}

function getNumericScore(team) {
  if (!team) {
    return null;
  }

  const score = Number(team.score);

  return Number.isFinite(score)
    ? score
    : null;
}

function getTeamShortName(team) {
  if (!team) {
    return "Команда";
  }

  return (
    team.shortName ||
    team.abbreviation ||
    team.name ||
    "Команда"
  );
}

function renderNbaEmptyState(title, text) {
  return `
    <div class="empty-state">
      <img
        class="nba-empty-logo"
        src="${NBA_LOGO_URL}"
        alt="NBA"
        width="68"
        height="68"
        loading="lazy"
        onerror="
          this.style.display='none';
          this.insertAdjacentHTML(
            'afterend',
            '<div class=&quot;empty-ball&quot;>🏀</div>'
          );
        "
      />

      <h3>${escapeHtml(title)}</h3>

      <p>${escapeHtml(text)}</p>
    </div>
  `;
}

function renderFatalError(error) {
  elements.upcomingContainer.innerHTML =
    renderNbaEmptyState(
      "NBA Jam, скоро матч…",
      "Не удалось обновить расписание."
    );

  elements.seasonContainer.innerHTML = `
    <div class="error-box">
      Ошибка загрузки текущего сезона:
      ${escapeHtml(error.message)}
    </div>
  `;

  elements.previousSeasonContainer.innerHTML = `
    <div class="error-box">
      Архив матчей сейчас недоступен.
    </div>
  `;

  elements.gamesCount.textContent = "—";
  elements.upcomingCount.textContent = "—";

  elements.upcomingSectionCount.textContent = "—";
  elements.seasonSectionCount.textContent = "—";
  elements.previousSectionCount.textContent = "—";

  elements.nextGameValue.textContent = "Нет данных";

  elements.nextGameMeta.textContent =
    "Попробуй обновить страницу позже";

  elements.lastUpdate.textContent =
    "Последнее обновление: ошибка";
}

function sortGamesAscending(games) {
  return [...games].sort((a, b) => {
    return new Date(a.date) - new Date(b.date);
  });
}

function sortGamesDescending(games) {
  return [...games].sort((a, b) => {
    return new Date(b.date) - new Date(a.date);
  });
}

/*
  Форматирование даты по Новосибирску.
*/

function formatGameDay(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "Дата неизвестна";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: DISPLAY_TIME_ZONE,
    day: "numeric",
    month: "short"
  })
    .format(date)
    .replace(".", "");
}

function formatGameTime(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    timeZone: DISPLAY_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(date);
}

function formatCompactDateTime(dateString) {
  return (
    `${formatGameDay(dateString)}, ` +
    `${formatGameTime(dateString)} ` +
    DISPLAY_TIME_ZONE_LABEL
  );
}

function formatUpdateDate(dateString) {
  const date = new Date(dateString);

  if (Number.isNaN(date.getTime())) {
    return "неизвестно";
  }

  return (
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: DISPLAY_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    }).format(date) +
    ` ${DISPLAY_TIME_ZONE_LABEL}`
  );
}

function isTodayInNovosibirsk(dateString) {
  const gameDate = getDateKeyInTimeZone(
    new Date(dateString),
    DISPLAY_TIME_ZONE
  );

  const today = getDateKeyInTimeZone(
    new Date(),
    DISPLAY_TIME_ZONE
  );

  return gameDate === today;
}

function getDateKeyInTimeZone(date, timeZone) {
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const parts = new Intl.DateTimeFormat(
    "en-CA",
    {
      timeZone,
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

function getRelativeGameTime(dateString) {
  const gameDate = new Date(dateString);
  const now = new Date();

  if (Number.isNaN(gameDate.getTime())) {
    return "время уточняется";
  }

  const difference =
    gameDate.getTime() - now.getTime();

  if (difference <= 0) {
    return "матч уже начался";
  }

  const totalMinutes =
    Math.floor(difference / 60000);

  if (totalMinutes < 60) {
    return `через ${totalMinutes} мин.`;
  }

  const totalHours =
    Math.floor(totalMinutes / 60);

  if (totalHours < 24) {
    return `через ${totalHours} ч.`;
  }

  const totalDays =
    Math.floor(totalHours / 24);

  return (
    `через ${totalDays} ` +
    getDayWord(totalDays)
  );
}

function getDayWord(value) {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return "дней";
  }

  if (mod10 === 1) {
    return "день";
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return "дня";
  }

  return "дней";
}

function normalizeString(value) {
  return String(value || "")
    .toLowerCase()
    .replaceAll(".", "")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
