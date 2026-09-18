const DATA_URL = "data/nba-2026-2027.json";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

const SEASON_LABEL = "2026-2027";

const upcomingContainer = document.getElementById("upcomingGames");
const seasonContainer = document.getElementById("seasonGames");
const refreshBtn = document.getElementById("refreshBtn");

const gamesCountEl = document.getElementById("gamesCount");
const upcomingCountEl = document.getElementById("upcomingCount");
const seasonLabelEl = document.getElementById("seasonLabel");
const lastUpdateEl = document.getElementById("lastUpdate");

seasonLabelEl.textContent = SEASON_LABEL;

refreshBtn.addEventListener("click", () => {
  loadDashboard(true);
});

loadDashboard(false);

async function loadDashboard(forceFresh) {
  try {
    renderLoading();

    const data = await fetchJsonData(forceFresh);

    renderDashboard(data);
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  }
}

async function fetchJsonData(forceFresh) {
  const cacheBust = forceFresh ? `?v=${Date.now()}` : `?v=${Date.now()}`;

  const response = await fetch(`${DATA_URL}${cacheBust}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить JSON: ${response.status}`);
  }

  return response.json();
}

function renderLoading() {
  upcomingContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  seasonContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: загрузка...";
}

function renderDashboard(data) {
  const upcomingGames = data.upcomingGames || [];
  const seasonGames = data.seasonGames || [];

  gamesCountEl.textContent = seasonGames.length;
  upcomingCountEl.textContent = upcomingGames.length;

  lastUpdateEl.textContent = data.updatedAt
    ? `Последнее обновление: ${formatDateTime(data.updatedAt)}`
    : "Последнее обновление: ещё не запускалось";

  renderUpcomingGames(upcomingGames);
  renderSeasonGames(seasonGames);
}

function renderUpcomingGames(games) {
  if (!games.length) {
    upcomingContainer.innerHTML = renderNbaEmptyState(
      "NBA Jam, скоро матч…",
      "На ближайшие дни в сохранённом календаре нет игр NBA. Ждём следующий игровой день."
    );

    return;
  }

  upcomingContainer.innerHTML = games
    .map(game => renderGameCard(game, "upcoming"))
    .join("");
}

function renderSeasonGames(games) {
  if (!games.length) {
    seasonContainer.innerHTML = renderNbaEmptyState(
      `Сезон ${SEASON_LABEL} пока пуст`,
      "После запуска GitHub Actions здесь появятся завершённые матчи сезона."
    );

    return;
  }

  seasonContainer.innerHTML = games
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

  const logoMarkup = team.logo
    ? `<img class="team-logo" src="${escapeHtml(team.logo)}" alt="${escapeHtml(team.name)}" loading="lazy" />`
    : `<div class="team-logo">🏀</div>`;

  const scoreMarkup = isResult
    ? `<div class="team-score">${team.score}</div>`
    : `<div class="team-score pending">VS</div>`;

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
          </div>
        </div>
      </div>

      <div class="team-side">
        ${scoreMarkup}
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

  seasonContainer.innerHTML = `
    <div class="error-box">
      Ошибка загрузки данных: ${escapeHtml(error.message)}
    </div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: ошибка";
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
