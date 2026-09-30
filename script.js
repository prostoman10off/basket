const CURRENT_SEASON_DATA_URL = "data/nba-2026-2027.json";
const PREVIOUS_SEASON_DATA_URL = "data/nba-2026.json";
const PICKS_RESULTS_DATA_URL = "data/picks-results.json";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

const SEASON_LABEL = "2026–2027";
const DISPLAY_TIME_ZONE = "Asia/Novosibirsk";
const DISPLAY_TIME_ZONE_LABEL = "НСК";
const PAGE_SIZE = 12;

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
  CHO: "CHA",
  CHA: "CHA",
  WSH: "WAS",
  WAS: "WAS"
};

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
      "gs",
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
  picksResultsData: null,
  picksByGameId: new Map(),
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
  totalPicksCount: document.getElementById("totalPicksCount"),

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
    const [
      currentSeasonData,
      previousSeasonData,
      picksResultsData
    ] = await Promise.all([
      fetchJsonData(CURRENT_SEASON_DATA_URL, forceFresh),
      fetchJsonData(PREVIOUS_SEASON_DATA_URL, forceFresh),
      fetchOptionalJsonData(PICKS_RESULTS_DATA_URL, forceFresh)
    ]);

    state.currentSeasonData = currentSeasonData;
    state.previousSeasonData = previousSeasonData;
    state.picksResultsData = picksResultsData;

    state.seasonVisibleCount = PAGE_SIZE;
    state.previousVisibleCount = PAGE_SIZE;

    createPicksIndex(picksResultsData.results || []);

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
  const version = forceFresh
    ? Date.now()
    : Math.floor(Date.now() / 60000);

  const response = await fetch(`${url}?v=${version}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(
      `Не удалось загрузить ${url}: HTTP ${response.status}`
    );
  }

  return response.json();
}

async function fetchOptionalJsonData(url, forceFresh) {
  try {
    return await fetchJsonData(url, forceFresh);
  } catch (error) {
    console.warn(
      "Результаты прогнозов временно недоступны:",
      error
    );

    return {
      updatedAt: null,
      leaderboard: [],
      results: [],
      dailyTotals: []
    };
  }
}

function createPicksIndex(results) {
  state.picksByGameId.clear();

  results.forEach(result => {
    const gameId = String(result.gameId || "");

    if (!gameId) {
      return;
    }

    if (!state.picksByGameId.has(gameId)) {
      state.picksByGameId.set(gameId, []);
    }

    state.picksByGameId.get(gameId).push(result);
  });
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
  elements.totalPicksCount.textContent = "—";

  elements.upcomingSectionCount.textContent = "—";
  elements.seasonSectionCount.textContent = "—";
  elements.previousSectionCount.textContent = "—";

  elements.nextGameValue.textContent = "Загружаем…";
  elements.nextGameMeta.textContent = "Проверяем расписание";
  elements.lastUpdate.textContent = "Последнее обновление: загрузка";

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
  const picksData = state.picksResultsData || {};

  const upcomingGames = sortGamesAscending(
    currentData.upcomingGames || []
  );

  const seasonGames = sortGamesDescending(
    currentData.seasonGames || []
  );

  elements.gamesCount.textContent = seasonGames.length;
  elements.upcomingCount.textContent = upcomingGames.length;

  elements.totalPicksCount.textContent =
    (picksData.results || []).length;

  renderLeaderboard(picksData.leaderboard || []);
  renderNextGame(upcomingGames);
  renderLastUpdate(currentData, previousData, picksData);
  renderAllSections();
}

function renderLeaderboard(leaderboard) {
  const playersById = new Map(
    leaderboard.map(player => [
      String(player.playerId),
      player
    ])
  );

  renderPlayerPoints(
    "andrei",
    playersById.get("andrei")
  );

  renderPlayerPoints(
    "ivan",
    playersById.get("ivan")
  );

  renderPlayerPoints(
    "seva",
    playersById.get("seva")
  );
}

function renderPlayerPoints(playerId, player) {
  const capitalized =
    playerId.charAt(0).toUpperCase() +
    playerId.slice(1);

  const badge = document.getElementById(
    `pointsBadge${capitalized}`
  );

  const text = document.getElementById(
    `pointsText${capitalized}`
  );

  const points = Number(player?.points || 0);

  if (badge) {
    badge.textContent = String(points);

    badge.title = player
      ? [
          `${player.name}: ${formatPoints(points)}`,
          `Угадано: ${player.correctPicks || 0}`,
          `Не угадано: ${player.wrongPicks || 0}`,
          `Ожидают результата: ${player.pendingPicks || 0}`,
          `Точность: ${player.accuracy || 0}%`
        ].join("\n")
      : formatPoints(points);
  }

  if (text) {
    text.textContent = formatPoints(points);
  }
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
  const normalizedTarget =
    normalizeTeamAbbreviation(abbreviation);

  const teamAbbreviation =
    normalizeTeamAbbreviation(team?.abbreviation);

  if (
    teamAbbreviation &&
    teamAbbreviation === normalizedTarget
  ) {
    return true;
  }

  const fan = FANS.find(
    item => item.teamAbbr === normalizedTarget
  );

  return fan ? isFanTeam(team, fan) : false;
}

function renderNextGame(upcomingGames) {
  if (!upcomingGames.length) {
    elements.nextGameValue.textContent = "Матчей пока нет";
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

function renderLastUpdate(
  currentData,
  previousData,
  picksData
) {
  const dates = [
    currentData.updatedAt,
    previousData.updatedAt,
    picksData.updatedAt
  ]
    .filter(Boolean)
    .sort((a, b) => new Date(b) - new Date(a));

  elements.lastUpdate.textContent = dates.length
    ? `Обновлено: ${formatUpdateDate(dates[0])}`
    : "Последнее обновление: ещё не запускалось";
}

function renderUpcomingGames(games) {
  if (!games.length) {
    elements.upcomingContainer.innerHTML =
      renderNbaEmptyState(
        state.currentFilter === "all"
          ? "NBA Jam, скоро матч…"
          : "Матчей по фильтру нет",

        state.currentFilter === "all"
          ? "Ждём следующий игровой день."
          : "Попробуй выбрать другую команду."
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
        "Архив пока пуст",
        "Результаты появятся после обновления данных."
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
    button.innerHTML = `
      Показать ещё ${Math.min(PAGE_SIZE, remaining)}
      <span aria-hidden="true">↓</span>
    `;
  }
}

function renderGameCard(game, type) {
  const gameId = String(game.id || "");

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
  const gamePicks = state.picksByGameId.get(gameId) || [];

  const status = getGameStatus(game, isResult);

  const cardClasses = [
    "game-card",
    isResult ? "result-card" : "upcoming-card",
    gameFans.length ? "has-fans" : "",
    gameFans.length >= 2 ? "has-fan-clash" : "",
    gamePicks.length ? "has-picks" : ""
  ]
    .filter(Boolean)
    .join(" ");

  return `
    <article
      class="${cardClasses}"
      data-game-id="${escapeHtml(gameId)}"
    >
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
              gameFans.length >= 2
                ? `
                  <div
                    class="clash-fire"
                    title="Дерби друзей"
                  >
                    🔥
                  </div>
                `
                : ""
            }

            ${renderGameFans(gameFans)}
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
                <span class="game-tag series">
                  Серия: ${escapeHtml(game.seriesText)}
                </span>
              `
              : ""
          }
        </div>

        <div class="compact-matchup">
          ${renderTeamLine({
            team: game.awayTeam,
            type: "away",
            isResult,
            isWinner: awayWon,
            gamePicks
          })}

          ${renderTeamLine({
            team: game.homeTeam,
            type: "home",
            isResult,
            isWinner: homeWon,
            gamePicks
          })}
        </div>
      </div>
    </article>
  `;
}

function renderTeamLine({
  team,
  type,
  isResult,
  isWinner,
  gamePicks
}) {
  const safeTeam = team || {};

  const teamAbbr = normalizeTeamAbbreviation(
    safeTeam.abbreviation
  );

  const picksForTeam = gamePicks.filter(result => {
    return (
      normalizeTeamAbbreviation(
        result.pickedTeamAbbr
      ) === teamAbbr
    );
  });

  const icon = type === "home" ? "🏠" : "✈️";
  const location = type === "home" ? "дома" : "в гостях";

  const teamName =
    safeTeam.shortName ||
    safeTeam.name ||
    safeTeam.abbreviation ||
    "Команда";

  const logo = safeTeam.logo
    ? `
      <img
        class="team-logo"
        src="${escapeHtml(safeTeam.logo)}"
        alt="${escapeHtml(teamName)}"
        width="33"
        height="33"
        loading="lazy"
      />
    `
    : `
      <div class="team-logo team-logo-fallback">🏀</div>
    `;

  const score = getNumericScore(safeTeam);

  return `
    <div
      class="team-line ${isWinner ? "winner" : ""}"
      data-team-abbr="${escapeHtml(teamAbbr)}"
    >
      <div class="team-main">
        ${logo}

        <div class="team-text">
          <div
            class="team-name"
            title="${escapeHtml(safeTeam.name || teamName)}"
          >
            ${escapeHtml(teamName)}
          </div>

          <div class="team-meta">
            ${icon} ${location}
          </div>

          ${renderTeamPicks(picksForTeam)}
        </div>
      </div>

      <div class="team-side">
        ${
          isResult
            ? `
              <div class="team-score">
                ${score === null ? "—" : score}
              </div>

              ${
                isWinner
                  ? `<span class="winner-mark">победа</span>`
                  : ""
              }
            `
            : `<div class="team-score pending">VS</div>`
        }
      </div>
    </div>
  `;
}

function renderTeamPicks(picks) {
  if (!picks.length) {
    return "";
  }

  return `
    <div class="team-picks">
      ${picks
        .map(result => {
          const statusClass =
            getPickStatusClass(result.status);

          const statusText =
            getPickStatusText(result);

          return `
            <div
              class="pick-person ${statusClass}"
              title="${escapeHtml(createPickTitle(result))}"
            >
              <img
                class="pick-person-avatar"
                src="${escapeHtml(result.playerPhoto)}"
                alt="${escapeHtml(result.playerName)}"
                width="23"
                height="23"
                loading="lazy"
              />

              <span class="pick-person-status">
                ${escapeHtml(statusText)}
              </span>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function getPickStatusClass(status) {
  const allowed = [
    "correct",
    "wrong",
    "pending",
    "late",
    "void"
  ];

  return allowed.includes(status)
    ? `pick-${status}`
    : "pick-pending";
}

function getPickStatusText(result) {
  switch (result.status) {
    case "correct":
      return `✓ +${result.points || 1}`;

    case "wrong":
      return "× 0";

    case "late":
      return "поздно";

    case "void":
      return "отмена";

    default:
      return "прогноз";
  }
}

function createPickTitle(result) {
  const team =
    result.pickedTeamName ||
    result.pickedTeamAbbr ||
    "команду";

  switch (result.status) {
    case "correct":
      return `${result.playerName}: ${team}, угадал +1`;

    case "wrong":
      return `${result.playerName}: ${team}, не угадал`;

    case "late":
      return `${result.playerName}: голос сделан поздно`;

    case "void":
      return `${result.playerName}: матч отменён`;

    default:
      return `${result.playerName} выбрал ${team}`;
  }
}

function getGameStatus(game, isResult) {
  const status = normalizeString(
    [
      game.statusState,
      game.statusName,
      game.statusDescription
    ].join(" ")
  );

  if (
    status.includes("in progress") ||
    status.includes("halftime") ||
    normalizeString(game.statusState) === "in"
  ) {
    return {
      label: "LIVE",
      className: "live"
    };
  }

  if (
    status.includes("postponed") ||
    status.includes("delayed")
  ) {
    return {
      label: "Перенесён",
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

function renderGameFans(fans) {
  if (!fans.length) {
    return "";
  }

  return `
    <div class="game-fans">
      ${fans
        .map(fan => `
          <img
            class="game-fan-avatar"
            src="${escapeHtml(fan.photo)}"
            alt="${escapeHtml(fan.name)}"
            title="${escapeHtml(
              `${fan.name} болеет за ${fan.teamLabel}`
            )}"
            width="27"
            height="27"
            loading="lazy"
          />
        `)
        .join("")}
    </div>
  `;
}

function renderStageTag(stage) {
  if (!stage?.label) {
    return "";
  }

  return `
    <span class="game-tag ${escapeHtml(stage.className || "")}">
      ${escapeHtml(translateStage(stage.label))}
    </span>
  `;
}

function translateStage(label) {
  const value = normalizeString(label);

  if (
    value.includes("regular") ||
    value.includes("регуляр")
  ) {
    return "Регулярка";
  }

  if (
    value.includes("playoff") ||
    value.includes("postseason") ||
    value.includes("плей")
  ) {
    return "Плей-офф";
  }

  if (
    value.includes("preseason") ||
    value.includes("предсез")
  ) {
    return "Предсезонка";
  }

  return label;
}

function getFansForGame(game) {
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

  const values = [
    team.name,
    team.shortName,
    team.abbreviation
  ]
    .filter(Boolean)
    .map(normalizeString);

  const aliases = [
    fan.teamAbbr,
    ...fan.aliases
  ].map(normalizeString);

  return values.some(value => {
    return aliases.some(alias => {
      return value === alias || value.includes(alias);
    });
  });
}

function normalizeTeamAbbreviation(value) {
  const normalized = String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z]/g, "");

  return TEAM_ABBR_ALIASES[normalized] || normalized;
}

function getNumericScore(team) {
  const number = Number(team?.score);

  return Number.isFinite(number) ? number : null;
}

function getTeamShortName(team) {
  return (
    team?.shortName ||
    team?.abbreviation ||
    team?.name ||
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
      Ошибка загрузки: ${escapeHtml(error.message)}
    </div>
  `;

  elements.previousSeasonContainer.innerHTML = `
    <div class="error-box">
      Архив матчей сейчас недоступен.
    </div>
  `;
}

function sortGamesAscending(games) {
  return [...games].sort(
    (a, b) => new Date(a.date) - new Date(b.date)
  );
}

function sortGamesDescending(games) {
  return [...games].sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
}

/* Время Новосибирска */

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
    `${formatGameTime(dateString)} НСК`
  );
}

function formatUpdateDate(dateString) {
  const date = new Date(dateString);

  return (
    new Intl.DateTimeFormat("ru-RU", {
      timeZone: DISPLAY_TIME_ZONE,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date) + " НСК"
  );
}

function isTodayInNovosibirsk(dateString) {
  return (
    getDateKey(new Date(dateString)) ===
    getDateKey(new Date())
  );
}

function getDateKey(date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DISPLAY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  const values = {};

  parts.forEach(part => {
    values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function getRelativeGameTime(dateString) {
  const difference =
    new Date(dateString).getTime() - Date.now();

  if (difference <= 0) {
    return "матч уже начался";
  }

  const minutes = Math.floor(difference / 60000);

  if (minutes < 60) {
    return `через ${minutes} мин.`;
  }

  const hours = Math.floor(minutes / 60);

  if (hours < 24) {
    return `через ${hours} ч.`;
  }

  const days = Math.floor(hours / 24);

  return `через ${days} ${getDayWord(days)}`;
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

function formatPoints(value) {
  const points = Number(value) || 0;
  const mod10 = points % 10;
  const mod100 = points % 100;

  if (mod100 >= 11 && mod100 <= 14) {
    return `${points} очков`;
  }

  if (mod10 === 1) {
    return `${points} очко`;
  }

  if (mod10 >= 2 && mod10 <= 4) {
    return `${points} очка`;
  }

  return `${points} очков`;
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
