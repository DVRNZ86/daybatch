// B5: history overlay + per-game read-only replay of a past completed daily.
// Seeds a synthetic history record (with a real snapshot per game, built
// from the actual generators so puzzle content is genuine) rather than
// playing full games — the record shape itself is what's under test here,
// not gameplay (already covered by persistence.spec.js et al).
import { test, expect } from "@playwright/test";
import { dailySeed } from "../../src/core/rng.js";
import { gen as genTally } from "../../src/games/tally.js";
import { gen as genSonar } from "../../src/games/sonar.js";
import { gen as genCodebreak } from "../../src/games/codebreak.js";
import { gen as genLexi } from "../../src/games/lexi.js";
import { gen as genCrossing } from "../../src/games/crossing.js";

const HDATE = new Date(2026, 0, 1); // 1 Jan 2026 — a fixed past date, unrelated to "today"
const HKEY = "2026-1-1";

function buildHistory() {
  const tSeed = dailySeed("tally", HDATE), tPuz = genTally(tSeed);
  const sSeed = dailySeed("sonar", HDATE), sPuz = genSonar(sSeed);
  const [hitCell, missCell] = (() => {
    const occ = [...sPuz.occ];
    const notOcc = [...Array(49).keys()].find(i => !sPuz.occ.has(i));
    return [occ[0], notOcc];
  })();
  const cSeed = dailySeed("codebreak", HDATE), cCode = genCodebreak(cSeed);
  const lSeed = dailySeed("lexi", HDATE), lPuz = genLexi(lSeed);
  const rSeed = dailySeed("crossing", HDATE);

  return [
    { date: HKEY, game: "tally", tier: 2, metrics: { moves: 2, par: tPuz.par, attempts: 1, win: true },
      snapshot: { date: HKEY, seed: tSeed, path: [0, 1], attempts: 1, status: "win" } }, // neighbors(0) = [5,1] on the 5x5 grid
    { date: HKEY, game: "sonar", tier: 2, metrics: { pings: 2, hintsUsed: 1, win: true },
      snapshot: { date: HKEY, seed: sSeed, revealed: [[hitCell, "hit"], [missCell, "miss"]], status: "win", hintsUsed: 1, hintCells: [hitCell] } },
    { date: HKEY, game: "codebreak", tier: 1, metrics: { guesses: 1, win: true, hints: 2 },
      snapshot: { date: HKEY, seed: cSeed, guesses: [cCode], current: [], status: "win", hintedSlots: [0, 1] } },
    { date: HKEY, game: "lexi", tier: 2, metrics: { words: lPuz.targets.length, hints: 1, win: true },
      snapshot: { date: HKEY, seed: lSeed, letters: lPuz.letters, found: [lPuz.targets[0], lPuz.targets[1]], hinted: [lPuz.targets[0]], hints: 1, status: "win" } },
    { date: HKEY, game: "crossing", tier: 3, metrics: { steps: 3, lives: 1, win: true },
      snapshot: { date: HKEY, seed: rSeed, pos: 0, seen: [0], boomed: [5], lives: 1, steps: 3, status: "win" } },
    // pre-B5 record: no snapshot at all — must render disabled, not throw
    { date: "2025-12-25", game: "sonar", tier: 1, metrics: { pings: 7, hintsUsed: 0, win: true } }
  ];
}
async function seedPremiumWithHistory(page) {
  const history = buildHistory();
  await page.addInitScript((h) => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: h,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  }, history);
}

test("History button is premium-only", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#hdr-history")).toBeHidden();
});

test("History overlay lists dates with Batch Score, per-game lines, and disables records with no snapshot", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await expect(page.locator("#hdr-history")).toBeVisible();
  await page.locator("#hdr-history").click();
  await expect(page.locator("#historyov.show")).toBeVisible();

  await expect(page.locator(".hi-day-head", { hasText: HKEY })).toContainText("/100");
  const day1Games = page.locator(".hi-day", { has: page.locator(".hi-day-head", { hasText: HKEY }) }).locator(".hi-game");
  await expect(day1Games).toHaveCount(5);
  await expect(day1Games.filter({ hasText: "not played" })).toHaveCount(0);

  // the pre-B5 sonar record (no snapshot) renders disabled and un-clickable,
  // same as the other 4 "not played" games on that older date
  const oldDayGroup = page.locator(".hi-day", { has: page.locator(".hi-day-head", { hasText: "2025-12-25" }) });
  const oldSonarRow = oldDayGroup.locator('.hi-game[data-game="sonar"]');
  await expect(oldSonarRow).toHaveClass(/disabled/);
  await expect(oldSonarRow).toHaveAttribute("disabled", "");
  await expect(oldSonarRow).toContainText("Perfect"); // gameLine still renders from metrics even without a snapshot

  // none of the HKEY rows (real snapshots) are disabled
  const hkeyGroup = page.locator(".hi-day", { has: page.locator(".hi-day-head", { hasText: HKEY }) });
  await expect(hkeyGroup.locator(".hi-game.disabled")).toHaveCount(0);
});

test("Tapping a history row switches tab and replays the exact snapshot, read-only", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await page.locator('.hi-game[data-game="sonar"][data-date="' + HKEY + '"]').click();

  await expect(page.locator("#historyov.show")).toHaveCount(0);
  await expect(page.locator('.tabs button[data-tab="sonar"]')).toHaveClass(/on/);
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('MODE')) .vl")).toHaveText("HISTORY");
  await expect(page.locator("#pane-sonar .slimbar.win")).toBeVisible();

  // the hinted cell (not the manually-"found" one) carries the distinct marker
  const snapshot = buildHistory()[1].snapshot;
  const hintCell = snapshot.hintCells[0];
  await expect(page.locator(`.sn-row button[data-i="${hintCell}"]`)).toHaveClass(/hit/);
  await expect(page.locator(`.sn-row button[data-i="${hintCell}"]`)).toHaveClass(/hint/);

  // read-only: tapping an unrevealed cell does nothing (status isn't "play")
  const untouched = [...Array(49).keys()].find(i => !snapshot.revealed.some(([j]) => j === i));
  await page.locator(`.sn-row button[data-i="${untouched}"]`).click();
  await expect(page.locator("#pane-sonar .stat.big .vl").first()).toHaveText("2"); // PINGS unchanged
});

test("Codebreak history view shows which slots were hinted vs guessed", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await page.locator('.hi-game[data-game="codebreak"][data-date="' + HKEY + '"]').click();

  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('MODE')) .vl")).toHaveText("HISTORY");
  await expect(page.locator("#pane-codebreak").getByText("Hints: #1")).toBeVisible();
});

test("Lexi history view marks the hinted word distinctly from the self-found one", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await page.locator('.hi-game[data-game="lexi"][data-date="' + HKEY + '"]').click();

  const snapshot = buildHistory()[3].snapshot;
  await expect(page.locator("#pane-lexi .lx-word.hinted")).toHaveCount(1);
  await expect(page.locator("#pane-lexi .lx-word.found:not(.hinted)")).toHaveCount(1);
});

test("Today's button from a history view returns to today's live daily", async ({ page }) => {
  await seedPremiumWithHistory(page);
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await page.locator('.hi-game[data-game="tally"][data-date="' + HKEY + '"]').click();
  await expect(page.locator("#pane-tally .stat:has(.lb:text('DATE'))")).toBeVisible();

  await page.locator("#ty-today").click();
  await expect(page.locator("#pane-tally .stat:has(.lb:text('DATE'))")).toHaveCount(0);
  await expect(page.locator("#ty-today")).toHaveClass(/pri/);
});
