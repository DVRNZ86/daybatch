// D1: Timed mode (premium) across all 5 games — ephemeral stopwatch runs,
// personal best persists per game, history/streaks are never touched.
import { test, expect } from "@playwright/test";
import { gen as genSonar } from "../../src/games/sonar.js";
import { gen as genCodebreak } from "../../src/games/codebreak.js";
import { gen as genCrossing } from "../../src/games/crossing.js";
import { gen as genTally, neighbors, applyOp } from "../../src/games/tally.js";

const SEED = 500000000; // Math.floor(0.5 * 1e9) — every game's random seed when Math.random is pinned to 0.5

async function seedPremium(page) {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [],
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
}
async function pinRandom(page) {
  await page.addInitScript(() => { Math.random = () => 0.5; });
}
async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}
const bestTimes = page => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).bestTimes);
const history = page => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).history);

test("Timed button is premium-only, on all 5 games", async ({ page }) => {
  await page.goto("/");
  for (const tab of ["tally", "crossing", "sonar", "codebreak", "lexi"]) {
    await page.locator(`.tabs button[data-tab="${tab}"]`).click();
    await expect(page.locator(`#pane-${tab} button:has-text("⏱ Timed")`)).toHaveCount(0);
  }
});

test("Sonar Timed: MODE shows TIMED, winning records a best time, history untouched", async ({ page }) => {
  await seedPremium(page); await pinRandom(page);
  await openTab(page, "sonar");
  await page.locator("#sn-timed").click();
  await expect(page.locator("#pane-sonar .stat:has(.lb:text('MODE')) .vl")).toHaveText("TIMED");
  await expect(page.locator("#sn-timer")).toBeVisible();

  const { total } = genSonar(SEED);
  for (let i = 0; i < 49; i++) {
    if (await page.locator("#overlay.show").count()) break;
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toContainText("new best!");
  const bt = await bestTimes(page);
  expect(typeof bt.sonar).toBe("number");
  expect(await history(page)).toEqual([]);
});

test("Codebreak Timed: guessing the exact code wins and records a best time", async ({ page }) => {
  await seedPremium(page); await pinRandom(page);
  await openTab(page, "codebreak");
  await page.locator("#cb-timed").click();
  await expect(page.locator("#pane-codebreak .stat:has(.lb:text('MODE')) .vl")).toHaveText("TIMED");

  const code = genCodebreak(SEED);
  for (const s of code) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toContainText("new best!");
  const bt = await bestTimes(page);
  expect(typeof bt.codebreak).toBe("number");
  expect(await history(page)).toEqual([]);
});

test("Crossing Timed: solving the board wins and records a best time", async ({ page }) => {
  await seedPremium(page); await pinRandom(page);
  await openTab(page, "crossing");
  await page.locator("#cr-timed").click();
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('MODE')) .vl")).toHaveText("TIMED");

  const { traps, start } = genCrossing(SEED);
  const ROWS = 7, COLS = 5;
  const adj = i => {
    const r = Math.floor(i / COLS), c = i % COLS, out = [];
    if (r > 0) out.push((r - 1) * COLS + c);
    if (r < ROWS - 1) out.push((r + 1) * COLS + c);
    if (c > 0) out.push(r * COLS + c - 1);
    if (c < COLS - 1) out.push(r * COLS + c + 1);
    return out;
  };
  const visited = new Set([start]), prev = new Map(), queue = [start];
  let goal = null;
  while (queue.length) {
    const cur = queue.shift();
    if (Math.floor(cur / COLS) === ROWS - 1) { goal = cur; break; }
    for (const n of adj(cur)) {
      if (visited.has(n) || traps.has(n)) continue;
      visited.add(n); prev.set(n, cur); queue.push(n);
    }
  }
  const path = [];
  for (let cur = goal; cur !== start; cur = prev.get(cur)) path.unshift(cur);

  await page.locator(`#cr-grid button[data-i="${start}"]`).click();
  for (const i of path) await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toContainText("new best!");
  const bt = await bestTimes(page);
  expect(typeof bt.crossing).toBe("number");
  expect(await history(page)).toEqual([]);
});

test("Lexi Timed: hinting through every word wins and records a best time", async ({ page }) => {
  await seedPremium(page); await pinRandom(page);
  await openTab(page, "lexi");
  await page.locator("#lx-timed").click();
  await expect(page.locator("#pane-lexi .stat:has(.lb:text('MODE')) .vl")).toHaveText("TIMED");

  for (let i = 0; i < 20; i++) {
    if (await page.locator("#overlay.show").count()) break;
    await page.locator("#lx-hint").click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toContainText("new best!");
  const bt = await bestTimes(page);
  expect(typeof bt.lexi).toBe("number");
  expect(await history(page)).toEqual([]);
});

test("Tally Timed: solving the shortest path wins and records a best time", async ({ page }) => {
  await seedPremium(page); await pinRandom(page);
  await openTab(page, "tally");
  await page.locator("#ty-timed").click();
  // Tally has no MODE stat (unlike the other four games) — the TIME stat
  // appearing is the only Timed-mode signal.
  await expect(page.locator("#ty-timer")).toBeVisible();

  const puz = genTally(SEED);
  expect(puz, "fixture assumption: seed generates a valid Tally puzzle").toBeTruthy();
  const START = 0, END = 24, MAXL = 13;
  // DFS to any path START->END landing exactly on target (mirrors gen()'s own
  // solveGrid, but keeps the actual cell path rather than just counts).
  // "visited" is per-path (path.includes), not a shared array — a stack-based
  // DFS explores independent branches that must each track their own cells.
  function findPath() {
    const stack = [{ pos: START, path: [START], total: puz.cells[START].value, pending: null }];
    while (stack.length) {
      const { pos, path, total, pending } = stack.pop();
      if (pos === END && pending === null && total === puz.target) return path;
      if (path.length >= MAXL) continue;
      for (const nb of neighbors(pos)) {
        if (path.includes(nb)) continue;
        const cell = puz.cells[nb];
        if (cell.type === "op") {
          stack.push({ pos: nb, path: [...path, nb], total, pending: cell.value });
        } else {
          const newTotal = pending !== null ? applyOp(total, pending, cell.value) : total;
          stack.push({ pos: nb, path: [...path, nb], total: newTotal, pending: null });
        }
      }
    }
    return null;
  }
  const path = findPath();
  expect(path, "fixture assumption: a winning path exists within MAXL moves").toBeTruthy();

  for (const i of path) {
    await page.locator(`.tc[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toContainText("new best!");
  const bt = await bestTimes(page);
  expect(typeof bt.tally).toBe("number");
  expect(await history(page)).toEqual([]);
});
