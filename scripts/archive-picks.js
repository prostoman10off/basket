const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(process.cwd(), "data");

const CURRENT_FILE = path.join(DATA_DIR, "picks.json");
const ARCHIVE_FILE = path.join(DATA_DIR, "picks-archive.json");

main();

function main() {
  console.log("Starting picks archive update...");

  const current = readJson(CURRENT_FILE);

  const archive = fs.existsSync(ARCHIVE_FILE)
    ? readJson(ARCHIVE_FILE)
    : {
        updated_at: null,
        games: {},
        picks: {}
      };

  validatePicks(current);

  const output = {
    updated_at: new Date().toISOString(),

    source_updated_at:
      current.updated_at || null,

    games: {
      ...(archive.games || {}),
      ...(current.games || {})
    },

    picks: mergePicks(
      archive.picks || {},
      current.picks || {}
    )
  };

  fs.writeFileSync(
    ARCHIVE_FILE,
    JSON.stringify(output, null, 2),
    "utf8"
  );

  const gamesCount = Object.keys(
    output.games
  ).length;

  const picksCount = Object.values(
    output.picks
  ).reduce(
    (sum, gamePicks) =>
      sum + Object.keys(gamePicks || {}).length,
    0
  );

  console.log("Picks archive updated.");
  console.log(`Archived games: ${gamesCount}`);
  console.log(`Archived picks: ${picksCount}`);
}

function mergePicks(oldPicks, newPicks) {
  const merged = {};

  const allGameIds = new Set([
    ...Object.keys(oldPicks),
    ...Object.keys(newPicks)
  ]);

  allGameIds.forEach(gameId => {
    const oldGamePicks =
      oldPicks[gameId] || {};

    const newGamePicks =
      newPicks[gameId] || {};

    merged[gameId] = {
      ...oldGamePicks
    };

    Object.entries(newGamePicks).forEach(
      ([userId, newPick]) => {
        const oldPick =
          merged[gameId][userId];

        merged[gameId][userId] =
          chooseLatestPick(
            oldPick,
            newPick
          );
      }
    );
  });

  return merged;
}

function chooseLatestPick(oldPick, newPick) {
  if (!oldPick) {
    return newPick;
  }

  if (!newPick) {
    return oldPick;
  }

  const oldTime = getTimestamp(
    oldPick.voted_at
  );

  const newTime = getTimestamp(
    newPick.voted_at
  );

  if (newTime >= oldTime) {
    return newPick;
  }

  return oldPick;
}

function getTimestamp(value) {
  const timestamp = new Date(
    value || 0
  ).getTime();

  return Number.isNaN(timestamp)
    ? 0
    : timestamp;
}

function validatePicks(data) {
  if (
    !data ||
    typeof data !== "object"
  ) {
    throw new Error(
      "picks.json is not an object"
    );
  }

  if (
    !data.games ||
    typeof data.games !== "object"
  ) {
    throw new Error(
      "picks.json does not contain games"
    );
  }

  if (
    !data.picks ||
    typeof data.picks !== "object"
  ) {
    throw new Error(
      "picks.json does not contain picks"
    );
  }
}

function readJson(filePath) {
  return JSON.parse(
    fs.readFileSync(filePath, "utf8")
  );
}
