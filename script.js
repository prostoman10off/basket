const DATA_URL = "data/nba-2026.json";
const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

const APP_YEAR = 2026;

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
  loadDashboard(true);
});

loadDashboard(false);

async function loadDashboard(forceFresh) {
  try {
    renderLoading();

    const data = await fetchJsonData(forceFresh);

    standingsByTeamId = data.standingsByTeamId || {};

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

  pastContainer.innerHTML = `
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
  const pastGames = data.pastGames || [];

  gamesCountEl.textContent = pastGames.length;
  upcomingCountEl.textContent = upcomingGames.length;

  lastUpdateEl.textContent = data.updatedAt
    ? `Последнее обновление: ${formatDateTime(data.updatedAt)}`
    : "Последнее обновление: ещё не запускалось";

  renderUpcomingGames(upcomingGames);
  renderPastGames(pastGames);
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

function renderPastGames(games) {
  if (!games.length) {
    pastContainer.innerHTML = renderNbaEmptyState(
      `Пока нет сохранённых матчей за ${APP_YEAR}`,
      "Запусти GitHub Action вручную, и здесь появятся результаты."
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
