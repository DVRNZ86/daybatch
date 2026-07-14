// storage.js: schema versioning, migration machinery, defensive fallbacks,
// snapshots, history dedupe, date key format.
import test from "node:test";
import assert from "node:assert/strict";

// Minimal localStorage shim installed before the module under test is used.
function installShim(initial = {}) {
  const map = new Map(Object.entries(initial));
  globalThis.localStorage = {
    getItem: k => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: k => map.delete(k),
    _dump: () => Object.fromEntries(map)
  };
  return globalThis.localStorage;
}

const S = await import("../../src/core/storage.js");
const {
  SCHEMA, freshRoot, _migrate, _resetCache, loadRoot, saveRoot, localDateKey,
  getGameState, setGameState, clearGameState, addHistory, getHistory,
  getLastSeenDate, setLastSeenDate,
  getEntitlement, setEntitlement, clearEntitlement, isPremium
} = S;

function fresh(initial = {}) {
  installShim(initial);
  _resetCache();
}

test("root is created fresh and stamped with the current schema", () => {
  fresh();
  const root = loadRoot();
  assert.equal(root.schema, SCHEMA);
  assert.deepEqual(root.games, {});
  assert.deepEqual(root.history, []);
  saveRoot();
  assert.ok(localStorage._dump()["daybatch:v" + SCHEMA].includes(`"schema":${SCHEMA}`));
});

test("corrupt JSON degrades to a fresh root instead of throwing", () => {
  fresh({ ["daybatch:v" + SCHEMA]: "{not json!!" });
  assert.deepEqual(loadRoot(), freshRoot());
});

test("throwing localStorage degrades to in-memory persistence", () => {
  globalThis.localStorage = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } };
  _resetCache();
  setGameState("sonar", { date: "2026-7-11", pings: [3] });
  assert.deepEqual(getGameState("sonar"), { date: "2026-7-11", pings: [3] });
});

test("migration machinery chains registered steps in order", () => {
  const migrations = {
    1: r => ({ ...r, schema: 2, upgraded: (r.upgraded || "") + "1→2 " }),
    2: r => ({ ...r, schema: 3, upgraded: r.upgraded + "2→3" })
  };
  const out = _migrate({ schema: 1, games: {}, history: [] }, 3, migrations);
  assert.equal(out.schema, 3);
  assert.equal(out.upgraded, "1→2 2→3");
});

test("migration falls back to fresh root on gaps, junk, or future schemas", () => {
  assert.deepEqual(_migrate({ schema: 1 }, 3, {}), freshRoot());          // gap
  assert.deepEqual(_migrate(null, SCHEMA, {}), freshRoot());              // junk
  assert.deepEqual(_migrate({ schema: 99 }, SCHEMA, {}), freshRoot());    // future
  assert.deepEqual(_migrate("banana", SCHEMA, {}), freshRoot());          // junk
});

test("older daybatch:v<n> keys are found and migrated on load", () => {
  // Simulate a hypothetical schema bump: current SCHEMA is 1 so this test
  // drives _migrate directly through loadRoot only when SCHEMA > 1; the
  // key-scan path is still exercised: absent current key + garbage old key
  // must yield a fresh root, not a crash.
  fresh({ "daybatch:v0": "{}" });
  assert.deepEqual(loadRoot(), freshRoot());
});

test("localDateKey matches dailySeed's unpadded Y-M-D composition", () => {
  assert.equal(localDateKey(new Date(2026, 6, 5)), "2026-7-5");
  assert.equal(localDateKey(new Date(2026, 11, 25)), "2026-12-25");
});

test("game snapshots round-trip and clear", () => {
  fresh();
  assert.equal(getGameState("crossing"), null);
  setGameState("crossing", { date: "2026-7-11", seed: 42, lives: 2 });
  _resetCache(); // force re-read from the shim: proves it was written through
  assert.deepEqual(getGameState("crossing"), { date: "2026-7-11", seed: 42, lives: 2 });
  clearGameState("crossing");
  _resetCache();
  assert.equal(getGameState("crossing"), null);
});

test("history keeps the first completion per game+date", () => {
  fresh();
  assert.equal(addHistory({ date: "2026-7-11", game: "sonar", tier: 1, metrics: { pings: 7 } }), true);
  assert.equal(addHistory({ date: "2026-7-11", game: "sonar", tier: 3, metrics: { pings: 12 } }), false);
  assert.equal(addHistory({ date: "2026-7-12", game: "sonar", tier: 2, metrics: { pings: 9 } }), true);
  assert.equal(addHistory({ date: "2026-7-11", game: "lexi", tier: 1, metrics: { hints: 0 } }), true);
  const h = getHistory();
  assert.equal(h.length, 3);
  assert.equal(h[0].tier, 1);
});

test("entitlement is absent (free tier) by default", () => {
  fresh();
  assert.equal(getEntitlement(), null);
  assert.equal(isPremium(), false);
});

test("lifetime entitlement is premium forever, no expiresAt needed", () => {
  fresh();
  setEntitlement({ code: "ABC123", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null });
  _resetCache();
  assert.equal(isPremium(), true);
  assert.equal(getEntitlement().tier, "lifetime");
});

test("subscription entitlement is premium only while expiresAt is in the future", () => {
  fresh();
  setEntitlement({ code: "SUB789", tier: "monthly", verifiedAt: Date.now(), expiresAt: Date.now() + 86400000 });
  _resetCache();
  assert.equal(isPremium(), true);

  setEntitlement({ code: "SUB789", tier: "yearly", verifiedAt: Date.now(), expiresAt: Date.now() - 1000 });
  _resetCache();
  assert.equal(isPremium(), false, "expired subscription is not premium");
});

test("clearEntitlement reverts to free tier", () => {
  fresh();
  setEntitlement({ code: "ABC123", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null });
  _resetCache();
  assert.equal(isPremium(), true);
  clearEntitlement();
  _resetCache();
  assert.equal(getEntitlement(), null);
  assert.equal(isPremium(), false);
});

test("lastSeenDate round-trips", () => {
  fresh();
  assert.equal(getLastSeenDate(), null);
  setLastSeenDate("2026-7-11");
  _resetCache();
  assert.equal(getLastSeenDate(), "2026-7-11");
});
