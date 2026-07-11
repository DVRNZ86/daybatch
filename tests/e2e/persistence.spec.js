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

// ---------------------------------------------------------------- SONAR ----

test("Sonar: mid-game pings survive a reload; perfect finish restores as bar", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const { gen: genSonar } = await import("../../src/games/sonar.js");
  const ships = [...genSonar(hashString("sonar-" + DATE_KEY)).occ];

  await page.goto("/");
  await openTab(page, "sonar");

  // three pings mid-game (two ship cells + one guaranteed miss)
  const miss = [...Array(49).keys()].find(i => !ships.includes(i));
  for (const i of [ships[0], ships[1], miss]) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("3");
  const before = norm(await page.locator("#pane-sonar .board").innerHTML());

  await page.reload();
  await openTab(page, "sonar");
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('PINGS')) .vl")).toHaveText("3");
  expect(norm(await page.locator("#pane-sonar .board").innerHTML())).toEqual(before);

  // finish perfectly: ping the remaining ship cells only
  for (const i of ships.slice(2)) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  // 2 ship pings + 1 miss + 5 ship pings = 8 pings → "Sharp shooting!", tier 2
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();

  await page.reload();
  await openTab(page, "sonar");
  await expect(page.locator("#overlay.show")).toHaveCount(0);
  await expect(page.locator("#pane-sonar .slimbar.win")).toBeVisible();
  await expect(page.locator("#pane-sonar .slimbar span")).toContainText("Sharp");

  const h = await readHistory(page);
  expect(h.filter(r => r.game === "sonar")).toEqual([
    { date: DATE_KEY, game: "sonar", tier: 2, metrics: { pings: 8, win: true } }
  ]);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------ CODEBREAK ----

test("Codebreak: guesses and partial input survive reload; solve restores as bar", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const { gen: genCode } = await import("../../src/games/codebreak.js");
  const code = genCode(hashString("codebreak-" + DATE_KEY));
  const wrong = [...Array(7).keys()].filter(k => k !== code[0]).slice(0, 5); // valid non-winning guess

  await page.goto("/");
  await openTab(page, "codebreak");

  // one full wrong guess + two keys of partial input
  for (const k of wrong) await page.locator(`.cb-keys button[data-k="${k}"]`).click();
  await page.locator("#cb-sub").click();
  for (const k of code.slice(0, 2)) await page.locator(`.cb-keys button[data-k="${k}"]`).click();
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('GUESSES')) .vl")).toHaveText("1/8");
  const before = norm(await page.locator("#pane-codebreak .board").innerHTML());

  await page.reload();
  await openTab(page, "codebreak");
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('GUESSES')) .vl")).toHaveText("1/8");
  expect(norm(await page.locator("#pane-codebreak .board").innerHTML())).toEqual(before);
  expect(await page.locator(".cb-slot.filled").count()).toBe(2); // partial input restored

  // clear partial input, then solve: guess 2 = the code → win in 2, tier 1
  await page.locator("#cb-del").click();
  await page.locator("#cb-del").click();
  for (const k of code) await page.locator(`.cb-keys button[data-k="${k}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();

  await page.reload();
  await openTab(page, "codebreak");
  await expect(page.locator("#overlay.show")).toHaveCount(0);
  await expect(page.locator("#pane-codebreak .slimbar.win")).toBeVisible();
  await expect(page.locator("#pane-codebreak .slimbar span")).toContainText("Mastermind");

  const h = await readHistory(page);
  expect(h.filter(r => r.game === "codebreak")).toEqual([
    { date: DATE_KEY, game: "codebreak", tier: 1, metrics: { guesses: 2, win: true } }
  ]);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- TALLY ----

// Find a winning path of exactly par length for the pinned day's puzzle.
async function tallyParPath() {
  const { gen, neighbors, applyOp } = await import("../../src/games/tally.js");
  const puz = gen(hashString("tally-" + DATE_KEY));
  const target = puz.target, par = puz.par, cells = puz.cells;
  const visited = new Array(25).fill(false);
  visited[0] = true;
  function dfs(pos, path, total, pending) {
    if (pos === 24) return total === target && path.length === par ? path.slice() : null;
    if (path.length >= par) return null;
    for (const nb of neighbors(pos)) {
      if (visited[nb]) continue;
      visited[nb] = true;
      path.push(nb);
      const cell = cells[nb];
      const hit = cell.type === "op"
        ? dfs(nb, path, total, cell.value)
        : dfs(nb, path, applyOp(total, pending, cell.value), null);
      path.pop();
      visited[nb] = false;
      if (hit) return hit;
    }
    return null;
  }
  return { path: dfs(0, [0], cells[0].value, null), puz };
}

test("Tally: mid-game path survives reload; par win restores as bar", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const { path } = await tallyParPath();
  expect(path).not.toBeNull();

  await page.goto("/");
  await openTab(page, "tally");

  // tap the first two cells after START, then reload mid-draw
  for (const i of path.slice(1, 3)) await page.locator(`#ty-grid .tc[data-i="${i}"]`).click();
  const runningBefore = await page.locator("#ty-total").textContent();
  await page.reload();
  await openTab(page, "tally");
  await expect(page.locator("#ty-total")).toHaveText(runningBefore);
  expect(await page.locator("#ty-grid .tc.on").count()).toBe(3);

  // finish along the par path (remaining cells), first attempt → Perfect ⛳, tier 1
  for (const i of path.slice(3)) await page.locator(`#ty-grid .tc[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();

  await page.reload();
  await openTab(page, "tally");
  await expect(page.locator("#overlay.show")).toHaveCount(0);
  await expect(page.locator("#pane-tally .slimbar.win")).toBeVisible();
  await expect(page.locator("#pane-tally .slimbar span")).toContainText("Perfect");
  await expect(page.locator("#ty-tries")).toHaveText("1");

  const h = await readHistory(page);
  const { puz } = await tallyParPath();
  expect(h.filter(r => r.game === "tally")).toEqual([
    { date: DATE_KEY, game: "tally", tier: 1, metrics: { moves: puz.par, par: puz.par, attempts: 1, win: true } }
  ]);
  expect(errors).toEqual([]);
});
