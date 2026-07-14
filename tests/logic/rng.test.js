// rng.js is the seed contract: these fixtures lock mulberry32/hashString/dailySeed
// to v13 behaviour. If any of these fail, daily puzzles have drifted.
import test from "node:test";
import assert from "node:assert/strict";
import { mulberry32, hashString, dailySeed } from "../../src/core/rng.js";

test("mulberry32 is deterministic for a given seed", () => {
  const a = mulberry32(12345), b = mulberry32(12345);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test("mulberry32 output is in [0,1) and varies by seed", () => {
  const r = mulberry32(42);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

test("hashString matches FNV-1a fixtures (v13 contract)", () => {
  // Fixture values computed from the v13 implementation itself.
  assert.equal(hashString(""), 2166136261);
  assert.equal(hashString("a"), 3826002220);
  assert.equal(hashString("crossing-2026-7-10"), hashString("crossing-2026-7-10"));
  assert.notEqual(hashString("crossing-2026-7-10"), hashString("crossing-2026-7-11"));
  assert.notEqual(hashString("tally-2026-7-10"), hashString("crossing-2026-7-10"));
});

test("dailySeed = hashString(game-Y-M-D) with device-local, non-padded date", () => {
  const RealDate = Date;
  // Pin the clock: 10 July 2026, local time. Month must serialise as "7", day "10".
  const fixed = new RealDate(2026, 6, 10, 15, 30, 0);
  global.Date = class extends RealDate {
    constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(fixed); }
  };
  try {
    assert.equal(dailySeed("crossing"), hashString("crossing-2026-7-10"));
    assert.equal(dailySeed("tally"), hashString("tally-2026-7-10"));
  } finally {
    global.Date = RealDate;
  }
});

test("dailySeed rolls over at device-local midnight (Pacific/Auckland pin)", () => {
  // The suite runs with TZ=Pacific/Auckland (see package.json). 11:59pm vs 12:01am
  // local time must produce different seeds even though UTC date may not change.
  const RealDate = Date;
  const before = new RealDate(2026, 6, 10, 23, 59, 0);
  const after = new RealDate(2026, 6, 11, 0, 1, 0);
  const at = t => {
    global.Date = class extends RealDate {
      constructor(...args) { return args.length ? new RealDate(...args) : new RealDate(t); }
    };
    const s = dailySeed("sonar");
    global.Date = RealDate;
    return s;
  };
  try {
    assert.notEqual(at(before), at(after));
    assert.equal(at(after), hashString("sonar-2026-7-11"));
  } finally {
    global.Date = RealDate;
  }
});

test("dailySeed(game, date) accepts an explicit date for archive replay, matching the device-local convention", () => {
  // No clock-pinning needed: an explicit date bypasses `new Date()` entirely.
  assert.equal(dailySeed("crossing", new Date(2026, 6, 10)), hashString("crossing-2026-7-10"));
  assert.equal(dailySeed("lexi", new Date(2025, 0, 1)), hashString("lexi-2025-1-1"));
  assert.equal(dailySeed("codebreak", new Date(2024, 1, 29)), hashString("codebreak-2024-2-29")); // leap day
  // Same seed as an equivalent pinned "now" for today's date — archive of "today" === daily.
  const today = new Date(2026, 6, 10, 9, 0, 0);
  assert.equal(dailySeed("tally", today), dailySeed("tally", new Date(2026, 6, 10, 22, 0, 0)));
});

test("puzzleNumber: EPOCH (10 Sep 2026 launch) day is #1, permanent arithmetic (B3 contract)", async () => {
  const { puzzleNumber, EPOCH } = await import("../../src/core/rng.js");
  assert.deepEqual(EPOCH, [2026, 8, 10]);
  assert.equal(puzzleNumber(new Date(2026, 8, 10)), 1);   // launch day
  assert.equal(puzzleNumber(new Date(2026, 8, 11)), 2);
  assert.equal(puzzleNumber(new Date(2026, 8, 10, 23, 59)), 1); // time of day irrelevant
  assert.equal(puzzleNumber(new Date(2026, 9, 9)), 30);
  assert.equal(puzzleNumber(new Date(2027, 8, 10)), 366);
  // NZ DST boundaries (suite runs TZ=Pacific/Auckland): late Sept/early Apr
  assert.equal(puzzleNumber(new Date(2026, 8, 27)) + 1, puzzleNumber(new Date(2026, 8, 28)), "DST start");
  assert.equal(puzzleNumber(new Date(2027, 3, 4)) + 1, puzzleNumber(new Date(2027, 3, 5)), "DST end");
  // countdown zone: eve of launch is 0, build day (11 Jul 2026) is −60
  assert.equal(puzzleNumber(new Date(2026, 8, 9)), 0);
  assert.equal(puzzleNumber(new Date(2026, 6, 11)), -60);
});
