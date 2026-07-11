// B2 acceptance: reload mid-game restores the same board and progress;
// a finished daily restores its result bar (no modal, no fresh puzzle).
// The date is pinned so each game's daily puzzle is known to the test, which
// imports the real generators to compute winning moves deterministically.
import { test, expect } from "@playwright/test";
import { hashString } from "../../src/core/rng.js";
import { gen as genCrossing } from "../../src/games/crossing.js";

const DAY = { y: 2026, m: 6, d: 10 }; // 10 July 2026 (m is JS month index)
const DATE_KEY = "2026-7-10";

async function pinDate(page) {
  await page.addInitScript(({ y, m, d }) => {
    const RealDate = Date;
    const fixedMs = new RealDate(y, m, d, 12, 0, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) {
        super();
        return args.length ? new RealDate(...args) : new RealDate(fixedMs);
      }
      static now() { return fixedMs; }
    };
  }, DAY);
}

async function openTab(page, tab) {
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

const norm = h => h.replace(/\s+/g, " ").trim();

function trackErrors(page) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  return errors;
}

async function readHistory(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1") || "{}").history || []);
}

// ------------------------------------------------------------- CROSSING ----

// The safe walk for the pinned day, computed from the real generator.
function crossingSafePath() {
  const puz = genCrossing(hashString("crossing-" + DATE_KEY));
  const COLS = 5, ROWS = 7;
  const start = puz.start;
  const prev = new Map([[start, null]]);
  const q = [start];
  let goal = -1;
  while (q.length) {
    const i = q.shift();
    if (Math.floor(i / COLS) === ROWS - 1) { goal = i; break; }
    const r = Math.floor(i / COLS), c = i % COLS;
    for (const nb of [r > 0 ? i - COLS : -1, r < ROWS - 1 ? i + COLS : -1, c > 0 ? i - 1 : -1, c < COLS - 1 ? i + 1 : -1]) {
      if (nb >= 0 && !puz.traps.has(nb) && !prev.has(nb)) { prev.set(nb, i); q.push(nb); }
    }
  }
  const path = [];
  for (let i = goal; i !== null; i = prev.get(i)) path.unshift(i);
  return path;
}

test("Crossing: mid-game state survives a reload", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  await page.goto("/");
  await openTab(page, "crossing");

  const path = crossingSafePath();
  // walk the first three safe cells
  for (const i of path.slice(0, 3)) {
    await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('STEPS')) .vl")).toHaveText("3");
  const gridBefore = norm(await page.locator("#cr-grid").innerHTML());

  await page.reload();
  await openTab(page, "crossing");
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('STEPS')) .vl")).toHaveText("3");
  expect(norm(await page.locator("#cr-grid").innerHTML())).toEqual(gridBefore);
  expect(errors).toEqual([]);
});

test("Crossing: finished daily restores as result bar, not a fresh puzzle or modal", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  await page.goto("/");
  await openTab(page, "crossing");

  for (const i of crossingSafePath()) {
    await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible(); // win modal on live finish
  await page.locator("#m-close").click();

  await page.reload();
  await openTab(page, "crossing");
  await expect(page.locator("#overlay.show")).toHaveCount(0);              // no modal on restore
  await expect(page.locator("#pane-crossing .slimbar.win")).toBeVisible(); // result bar instead
  await expect(page.locator("#pane-crossing .slimbar span")).toContainText("Flawless");
  // the finished board (revealed traps), not a fresh puzzle
  await expect(page.locator("#cr-grid button.boom").first()).toBeVisible();
  // result bar reopens the modal with this game's result
  await page.locator("#pane-crossing .slimbar button").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-title")).toContainText("Flawless");

  // history recorded once, tier 1 (flawless), and a replayed finish never duplicates
  const h = await readHistory(page);
  expect(h.filter(r => r.game === "crossing")).toEqual([
    { date: DATE_KEY, game: "crossing", tier: 1, metrics: { steps: crossingSafePath().length, lives: 3, win: true } }
  ]);
  expect(errors).toEqual([]);
});
