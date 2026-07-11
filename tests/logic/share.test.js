// share.js string CONTRACT tests — exact matches against PLAN.md B3.
import test from "node:test";
import assert from "node:assert/strict";
import { SITE_URL, lineText, gameLine, batchCard, shareText } from "../../src/core/share.js";
import { GAMES } from "../../src/core/streaks.js";

const rec = (date, game, tier, metrics) => ({ date, game, tier, metrics });

test("share-line table: every cell (PLAN.md B3 contract)", () => {
  // tally
  assert.equal(lineText("tally", rec("d", "tally", 1, { moves: 9, par: 9, attempts: 1 })), "Perfect ⛳");
  assert.equal(lineText("tally", rec("d", "tally", 2, { moves: 9, par: 9, attempts: 2 })), "Best path ⛳");
  assert.equal(lineText("tally", rec("d", "tally", 3, { moves: 12, par: 9, attempts: 1 })), "Solved (+3)");
  // crossing
  assert.equal(lineText("crossing", rec("d", "crossing", 1, { lives: 3 })), "Flawless");
  assert.equal(lineText("crossing", rec("d", "crossing", 2, { lives: 2 })), "Made it");
  assert.equal(lineText("crossing", rec("d", "crossing", 3, { lives: 1 })), "By a whisker");
  assert.equal(lineText("crossing", rec("d", "crossing", 4, { lives: 0, win: false })), "Blown up 💥");
  // sonar
  assert.equal(lineText("sonar", rec("d", "sonar", 1, { pings: 7 })), "Perfect 🏆");
  assert.equal(lineText("sonar", rec("d", "sonar", 2, { pings: 9 })), "9 pings");
  assert.equal(lineText("sonar", rec("d", "sonar", 3, { pings: 12 })), "12 pings");
  assert.equal(lineText("sonar", rec("d", "sonar", 4, { pings: 20 })), "20 pings");
  // codebreak
  assert.equal(lineText("codebreak", rec("d", "codebreak", 1, { guesses: 2, win: true })), "2/8");
  assert.equal(lineText("codebreak", rec("d", "codebreak", 2, { guesses: 4, win: true })), "4/8");
  assert.equal(lineText("codebreak", rec("d", "codebreak", 4, { guesses: 8, win: true })), "8/8");
  assert.equal(lineText("codebreak", rec("d", "codebreak", 4, { guesses: 8, win: false })), "X/8");
  // lexi (singular hint pluralised)
  assert.equal(lineText("lexi", rec("d", "lexi", 1, { hints: 0 })), "No hints");
  assert.equal(lineText("lexi", rec("d", "lexi", 2, { hints: 1 })), "1 hint");
  assert.equal(lineText("lexi", rec("d", "lexi", 3, { hints: 5 })), "5 hints");
  // unplayed
  for (const g of GAMES) assert.equal(lineText(g, null), "not played");
  assert.equal(gameLine("tally", null), "🧮 Tally — not played");
});

test("batchCard reproduces the PLAN.md sample exactly (score per tier table)", () => {
  // Puzzle #14 = EPOCH(10 Sep 2026) + 13 days = 23 Sep 2026; 🔥7 = played 17th–23rd.
  const h = [];
  for (let d = 17; d <= 22; d++) h.push(rec(`2026-9-${d}`, "sonar", 1, { pings: 7 }));
  h.push(
    rec("2026-9-23", "tally", 2, { moves: 9, par: 9, attempts: 2 }),
    rec("2026-9-23", "crossing", 1, { lives: 3 }),
    rec("2026-9-23", "sonar", 1, { pings: 7 }),
    rec("2026-9-23", "codebreak", 2, { guesses: 4, win: true }),
    rec("2026-9-23", "lexi", 1, { hints: 0 })
  );
  assert.equal(batchCard(h, "2026-9-23"),
`DAYBATCH #14 · 90/100 🔥7
🧮 Tally — Best path ⛳
🧭 Crossing — Flawless
📡 Sonar — Perfect 🏆
🔐 Codebreak — 4/8
🔤 Lexi — No hints
${SITE_URL}`);
});

test("batchCard with a single game done on launch day, no prior streak", () => {
  const h = [rec("2026-9-10", "sonar", 1, { pings: 7 })];
  assert.equal(batchCard(h, "2026-9-10"),
`DAYBATCH #1 · 20/100 🔥1
🧮 Tally — not played
🧭 Crossing — not played
📡 Sonar — Perfect 🏆
🔐 Codebreak — not played
🔤 Lexi — not played
${SITE_URL}`);
});

test("countdown: puzzleLabel and preseason note (B3 EPOCH amendment contract)", async () => {
  const { puzzleLabel, isPreseason, PRESEASON_NOTE } = await import("../../src/core/share.js");
  assert.equal(PRESEASON_NOTE, "Official scoring starts 10 Sep 2026");
  assert.equal(puzzleLabel(new Date(2026, 8, 10)), "#1");   // launch
  assert.equal(puzzleLabel(new Date(2026, 8, 9)), "#−1");   // eve — never #0
  assert.equal(puzzleLabel(new Date(2026, 6, 11)), "#−61"); // build day
  assert.equal(isPreseason(new Date(2026, 8, 9)), true);
  assert.equal(isPreseason(new Date(2026, 8, 10)), false);
  // pre-launch card: countdown label + note line above the footer
  const h = [rec("2026-7-11", "sonar", 1, { pings: 7 })];
  assert.equal(batchCard(h, "2026-7-11"),
`DAYBATCH #−61 · 20/100 🔥1
🧮 Tally — not played
🧭 Crossing — not played
📡 Sonar — Perfect 🏆
🔐 Codebreak — not played
🔤 Lexi — not played
Official scoring starts 10 Sep 2026
${SITE_URL}`);
});

test("shareText prefers Web Share with the url field, falls back to clipboard", async () => {
  // Node's global navigator is getter-only; override via defineProperty.
  const setNav = v => Object.defineProperty(globalThis, "navigator", { value: v, configurable: true });

  const calls = [];
  setNav({ share: async p => calls.push(p) });
  assert.equal(await shareText("CARD"), "shared");
  assert.deepEqual(calls, [{ text: "CARD", url: SITE_URL }]);

  const copied = [];
  setNav({ clipboard: { writeText: async t => copied.push(t) } });
  assert.equal(await shareText("CARD"), "copied");
  assert.deepEqual(copied, ["CARD"]);

  setNav({ share: async () => { throw new Error("dismissed"); } });
  assert.equal(await shareText("CARD"), "failed");
});
