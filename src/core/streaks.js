// Batch Score + streaks (B3). Pure functions over the history array
// ({date, game, tier, metrics} records, date = unpadded local "Y-M-D" key).
// All date walking uses local calendar parts — device-local by contract (A7).

export const GAMES = ["tally", "crossing", "sonar", "codebreak", "lexi"];
export const TIER_POINTS = { 1: 20, 2: 15, 3: 10, 4: 5 }; // unplayed = 0

export function recordsFor(history, dateKey) {
  return history.filter(r => r.date === dateKey);
}

// Batch Score /100 for one day: sum of tier points over the five games.
export function dayScore(history, dateKey) {
  let s = 0;
  for (const r of recordsFor(history, dateKey)) s += TIER_POINTS[r.tier] || 0;
  return s;
}

function keyOf(d) { return d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(); }
function parseKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }
function prevKey(k) { const d = parseKey(k); return keyOf(new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)); }

// Walk consecutive qualifying days backwards. A pending today doesn't break
// the run: if today doesn't qualify (yet), the walk starts from yesterday.
function streakFrom(qualifies, todayKey) {
  let k = todayKey, n = 0;
  if (!qualifies(k)) k = prevKey(k);
  while (qualifies(k)) { n++; k = prevKey(k); }
  return n;
}

// Batch streak: consecutive days with ≥1 completed game.
export function batchStreak(history, todayKey) {
  const played = new Set(history.map(r => r.date));
  return streakFrom(k => played.has(k), todayKey);
}

// Perfect batch (B3 decision): all five games completed that day, any tiers.
export function isPerfectBatch(history, dateKey) {
  const games = new Set(recordsFor(history, dateKey).map(r => r.game));
  return GAMES.every(g => games.has(g));
}

export function perfectStreak(history, todayKey) {
  return streakFrom(k => isPerfectBatch(history, k), todayKey);
}
