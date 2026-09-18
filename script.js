const CURRENT_SEASON_DATA_URL = "data/nba-2026-2027.json";
const PREVIOUS_SEASON_DATA_URL = "data/nba-2026.json";

const NBA_LOGO_URL =
  "https://a.espncdn.com/i/teamlogos/leagues/500/nba.png";

const SEASON_LABEL = "2026-2027";

const FANS = [
  {
    id: "andrei",
    name: "Андрей",
    photo: "Andrei.jpg",
    teamLabel: "76ers",
    teamAbbr: "PHI",
    teamLogo: "https://a.espncdn.com/i/teamlogos/nba/500/phi.png",
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
    teamLogo: "https://a.espncdn.com/i/teamlogos/nba/500/bos.png",
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
    teamLogo: "https://a.espncdn.com/i/teamlogos/nba/500/gsw.png",
    aliases: [
      "gsw",
      "golden state",
      "golden state warriors",
      "warriors"
    ]
  }
];

const upcomingContainer = document.getElementById("upcomingGames");
const seasonContainer = document.getElementById("seasonGames");
const previousSeasonContainer = document.getElementById("previousSeasonGames");

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

    const [currentSeasonData, previousSeasonData] = await Promise.all([
      fetchJsonData(CURRENT_SEASON_DATA_URL, forceFresh),
      fetchJsonData(PREVIOUS_SEASON_DATA_URL, forceFresh)
    ]);

    renderDashboard(currentSeasonData, previousSeasonData);
  } catch (error) {
    console.error(error);
    renderFatalError(error);
  }
}

async function fetchJsonData(url, forceFresh) {
  const cacheBust = forceFresh ? `?v=${Date.now()}` : `?v=${Date.now()}`;

  const response = await fetch(`${url}${cacheBust}`, {
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`Не удалось загрузить JSON ${url}: ${response.status}`);
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

  previousSeasonContainer.innerHTML = `
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
    <div class="skeleton-card"></div>
  `;

  gamesCountEl.textContent = "—";
  upcomingCountEl.textContent = "—";
  lastUpdateEl.textContent = "Последнее обновление: загрузка...";
}

function renderDashboard(currentSeasonData, previousSeasonData) {
  const upcomingGames = currentSeasonData.upcomingGames || [];
  const seasonGames = currentSeasonData.seasonGames || [];
  const previousSeasonGames = previousSeasonData.pastGames || [];

  gamesCountEl.textContent = seasonGames.length;
  upcomingCountEl.textContent = upcomingGames.length;

  const dates = [
    currentSeasonData.updatedAt,
    previousSeasonData.updatedAt
  ].filter(Boolean);

  const latestUpdate = dates.length
    ? dates.sort((a, b) => new Date(b) - new Date(a))[0]
    : null;

  lastUpdateEl.textContent = latestUpdate
    ? `Последнее обновление: ${formatDateTime(latestUpdate)}`
    : "Последнее обновление: ещё не запускалось";

  renderUpcomingGames(upcomingGames);
  renderSeasonGames(seasonGames);
  renderPreviousSeasonGames(previousSeasonGames);
}

function renderUpcomingGames(games) {
  if (!games.length) {
    upcomingContainer.innerHTML = renderNbaEmptyState(
      "NBA Jam, скоро матч…",
      "Ждём следующий игровой день."
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
      "Матчи появятся здесь после завершения."
    );

    return;
  }

  seasonContainer.innerHTML = games
    .map(game => renderGameCard(game, "result"))
    .join("");
}

function renderPreviousSeasonGames(games) {
  if (!games.length) {
    previousSeasonContainer.innerHTML = renderNbaEmptyState(
      "Прошлый сезон пока пуст",
      "Результаты появятся после обновления данных."
    );

    return;
  }

  previousSeasonContainer.innerHTML = games
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

  const gameFans = getFansForGame(game);
  const hasFans = gameFans.length > 0;
  const hasFanClash = gameFans.length >= 2;

  return `
    <article class="game-card ${isResult ? "result-card" : "upcoming-card"} ${winnerClass} ${hasFans ? "has-fans" : ""} ${hasFanClash ? "has-fan-clash" : ""}">
      ${
        hasFanClash
          ? `<div class="clash-fire" title="Матч команд друзей">🔥</div>`
          : ""
      }

      ${
        hasFans
          ? renderGameFans(gameFans)
          : ""
      }

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

function renderGameFans(fans) {
  return `
    <div class="game-fans">
      ${fans.map(fan => {
        const title = `${fan.name} болеет за ${fan.teamLabel}`;

        return `
          <img
            class="game-fan-avatar"
            src="${escapeHtml(fan.photo)}"
            alt="${escapeHtml(fan.name)}"
            title="${escapeHtml(title)}"
            loading="lazy"
          />
        `;
      }).join("")}
    </div>
  `;
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
    team.id,
    team.name,
    team.shortName,
    team.abbreviation
  ]
    .filter(Boolean)
    .map(value => normalizeTeamString(value));

  const aliases = fan.aliases.map(alias => normalizeTeamString(alias));

  return values.some(value => {
    return aliases.some(alias => {
      return value === alias || value.includes(alias);
    });
  });
}

function normalizeTeamString(value) {
  return String(value)
    .toLowerCase()
    .replaceAll(".", "")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim();
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
    "Ждём следующий игровой день."
  );

  seasonContainer.innerHTML = `
    <div class="error-box">
      Ошибка загрузки данных: ${escapeHtml(error.message)}
    </div>
  `;

  previousSeasonContainer.innerHTML = `
    <div class="error-box">
      Ошибка загрузки прошлого сезона: ${escapeHtml(error.message)}
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
