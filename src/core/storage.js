// Versioned localStorage wrapper (PLAN.md A2). Single JSON root under
// "daybatch:v<SCHEMA>", schema stamp inside, migration registry for future
// bumps. All reads/writes are defensive: corrupt JSON or a throwing
// localStorage (private mode) degrades to an in-memory root — the games keep
// working, persistence just doesn't survive the session.

export const SCHEMA = 1;
const KEY_PREFIX = "daybatch:v";
const KEY = KEY_PREFIX + SCHEMA;

// Migration registry: MIGRATIONS[n] upgrades a schema-n root to n+1.
// Empty while SCHEMA === 1; the machinery is exercised by tests via _migrate.
const MIGRATIONS = {};

export function freshRoot() {
  return { schema: SCHEMA, lastSeenDate: null, games: {}, history: [] };
}

// Pure: chain migrations from root.schema up to `target`. Unknown gaps or a
// newer-than-target root are unrecoverable → fresh root (never throw).
export function _migrate(root, target = SCHEMA, migrations = MIGRATIONS) {
  if (!root || typeof root !== "object" || typeof root.schema !== "number") return freshRoot();
  if (root.schema > target) return freshRoot();
  let cur = root;
  while (cur.schema < target) {
    const step = migrations[cur.schema];
    if (typeof step !== "function") return freshRoot();
    cur = step(cur);
    if (!cur || cur.schema !== undefined && typeof cur.schema !== "number") return freshRoot();
  }
  return cur;
}

function store() {
  try { return globalThis.localStorage; } catch (e) { return null; }
}

let memoryRoot = null; // fallback + write-through cache

export function loadRoot() {
  if (memoryRoot) return memoryRoot;
  const ls = store();
  let root = null;
  if (ls) {
    try {
      // current key first, then any older daybatch:v<n> key worth migrating
      let raw = ls.getItem(KEY);
      if (raw === null) {
        for (let v = SCHEMA - 1; v >= 1 && raw === null; v--) raw = ls.getItem(KEY_PREFIX + v);
      }
      if (raw !== null) root = _migrate(JSON.parse(raw));
    } catch (e) { root = null; }
  }
  memoryRoot = root || freshRoot();
  return memoryRoot;
}

export function saveRoot() {
  const ls = store();
  if (!ls || !memoryRoot) return;
  try { ls.setItem(KEY, JSON.stringify(memoryRoot)); } catch (e) {}
}

// Test hook: drop the cache so the next loadRoot() re-reads localStorage.
export function _resetCache() { memoryRoot = null; }

// Local date key, unpadded, matching dailySeed's "Y-M-D" composition exactly.
export function localDateKey(d = new Date()) {
  return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
}

// ---- per-game daily snapshots ----

export function getGameState(game) {
  const s = loadRoot().games[game];
  return s === undefined ? null : s;
}

export function setGameState(game, snapshot) {
  loadRoot().games[game] = snapshot;
  saveRoot();
}

export function clearGameState(game) {
  delete loadRoot().games[game];
  saveRoot();
}

// ---- history: one record per game+date, first completion stands ----

export function addHistory(record) { // {date, game, tier, metrics}
  const h = loadRoot().history;
  if (h.some(r => r.game === record.game && r.date === record.date)) return false;
  h.push(record);
  saveRoot();
  return true;
}

export function getHistory() {
  return loadRoot().history.slice();
}

// ---- rollover bookkeeping ----

export function getLastSeenDate() { return loadRoot().lastSeenDate; }
export function setLastSeenDate(dateKey) {
  loadRoot().lastSeenDate = dateKey;
  saveRoot();
}
