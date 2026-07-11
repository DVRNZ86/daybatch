// streaks.js: Batch Score math for all tier combos + streak walks across
// date boundaries (suite runs TZ=Pacific/Auckland via package.json).
import test from "node:test";
import assert from "node:assert/strict";
import { GAMES, TIER_POINTS, dayScore, batchStreak, isPerfectBatch, perfectStreak } from "../../src/core/streaks.js";

const rec = (date, game, tier) => ({ date, game, tier, metrics: {} });

test("tier points match the PLAN.md contract", () => {
  assert.deepEqual(TIER_POINTS, { 1: 20, 2: 15, 3: 10, 4: 5 });
  assert.deepEqual(GAMES, ["tally", "crossing", "sonar", "codebreak", "lexi"]);
});

test("dayScore sums every tier combination correctly", () => {
  // exhaustive over per-game outcomes {unplayed, t1..t4} would be 5^5;
  // linearity makes per-slot checks + spot sums sufficient — verify both.
  assert.equal(dayScore([], "2026-7-11"), 0); // nothing played
  // single game at each tier
  for (const [tier, pts] of [[1, 20], [2, 15], [3, 10], [4, 5]]) {
    assert.equal(dayScore([rec("2026-7-11", "sonar", tier)], "2026-7-11"), pts);
  }
  // the PLAN sample lines: t2+t1+t1+t2+t1 = 90 (documented: sample's 85 was illustrative)
  const sample = [
    rec("2026-7-11", "tally", 2), rec("2026-7-11", "crossing", 1), rec("2026-7-11", "sonar", 1),
    rec("2026-7-11", "codebreak", 2), rec("2026-7-11", "lexi", 1)
  ];
  assert.equal(dayScore(sample, "2026-7-11"), 90);
  // perfect batch of top tiers = 100; all completed-tier = 25
  assert.equal(dayScore(GAMES.map(g => rec("2026-7-11", g, 1)), "2026-7-11"), 100);
  assert.equal(dayScore(GAMES.map(g => rec("2026-7-11", g, 4)), "2026-7-11"), 25);
  // mixed with unplayed slots and other days' records ignored
  const mixed = [rec("2026-7-11", "tally", 1), rec("2026-7-11", "lexi", 3), rec("2026-7-10", "sonar", 1)];
  assert.equal(dayScore(mixed, "2026-7-11"), 30);
  // full exhaustive sweep: every 5-game tier assignment over {0(unplayed),1..4}
  // on a smaller alphabet to bound runtime: verify SUM property holds
  for (let mask = 0; mask < Math.pow(5, 5); mask++) {
    let m = mask; const recs = []; let expected = 0;
    GAMES.forEach(g => {
      const t = m % 5; m = Math.floor(m / 5);
      if (t > 0) { recs.push(rec("2026-7-11", g, t)); expected += TIER_POINTS[t]; }
    });
    assert.equal(dayScore(recs, "2026-7-11"), expected);
  }
});

test("batchStreak counts consecutive days; a pending today doesn't break the run", () => {
  const h = [rec("2026-7-9", "sonar", 1), rec("2026-7-10", "lexi", 2), rec("2026-7-11", "tally", 3)];
  assert.equal(batchStreak(h, "2026-7-11"), 3);            // today played
  assert.equal(batchStreak(h.slice(0, 2), "2026-7-11"), 2); // today pending → run up to yesterday
  assert.equal(batchStreak([], "2026-7-11"), 0);
  // gap breaks: played the 8th and 10th-11th only
  const gap = [rec("2026-7-8", "sonar", 1), rec("2026-7-10", "sonar", 1), rec("2026-7-11", "sonar", 1)];
  assert.equal(batchStreak(gap, "2026-7-11"), 2);
  // a two-day-old run is dead even if today is pending
  assert.equal(batchStreak([rec("2026-7-9", "sonar", 1)], "2026-7-11"), 0);
});

test("streak walk crosses month and year boundaries (device-local)", () => {
  const h = [rec("2026-6-30", "sonar", 1), rec("2026-7-1", "sonar", 1), rec("2026-7-2", "sonar", 1)];
  assert.equal(batchStreak(h, "2026-7-2"), 3);
  const y = [rec("2026-12-31", "lexi", 1), rec("2027-1-1", "lexi", 1)];
  assert.equal(batchStreak(y, "2027-1-1"), 2);
});

test("perfect batch requires all five games; perfectStreak walks it", () => {
  const day = d => GAMES.map(g => rec(d, g, 4));
  assert.equal(isPerfectBatch(day("2026-7-11"), "2026-7-11"), true);
  assert.equal(isPerfectBatch(day("2026-7-11").slice(0, 4), "2026-7-11"), false);
  const h = [...day("2026-7-10"), ...day("2026-7-11")];
  assert.equal(perfectStreak(h, "2026-7-11"), 2);
  // four games today: perfect run holds at yesterday's count
  const partialToday = [...day("2026-7-10"), ...day("2026-7-11").slice(0, 4)];
  assert.equal(perfectStreak(partialToday, "2026-7-11"), 1);
});
