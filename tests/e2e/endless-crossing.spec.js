// D1: Endless Crossing (premium) — continuous boards on shared lives until
// exhausted; score = boards cleared; personal best persists. Math.random is
// pinned so every board (startEndless + nextEndlessBoard both use
// Math.random()) generates the identical layout — deterministic and solvable
// via a BFS over gen()'s traps, same trick report-batch.spec.js uses for
// practice seeds.
import { test, expect } from "@playwright/test";
import { gen } from "../../src/games/crossing.js";

const ROWS = 7, COLS = 5;

function adj(i) {
  const r = Math.floor(i / COLS), c = i % COLS, out = [];
  if (r > 0) out.push((r - 1) * COLS + c);
  if (r < ROWS - 1) out.push((r + 1) * COLS + c);
  if (c > 0) out.push(r * COLS + c - 1);
  if (c < COLS - 1) out.push(r * COLS + c + 1);
  return out;
}

// BFS from start avoiding traps to any bottom-row cell. gen() guarantees a
// trap-free path exists (traps are only ever placed off the generated path).
function solvePath(traps, start) {
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
  return path;
}

async function seedPremium(page) {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [],
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
}

async function pinRandom(page) {
  // Math.floor(0.5 * 1e9) = 500000000 — every board uses this same seed.
  await page.addInitScript(() => { Math.random = () => 0.5; });
}

async function clickCell(page, i) {
  await page.locator(`#cr-grid button[data-i="${i}"]`).click();
}

async function solveOneBoard(page) {
  const { traps, start } = gen(500000000);
  await clickCell(page, start);
  for (const i of solvePath(traps, start)) await clickCell(page, i);
}

test("Endless button is premium-only", async ({ page }) => {
  await page.goto("/");
  await page.locator('.tabs button[data-tab="crossing"]').click();
  await expect(page.locator("#cr-endless")).toHaveCount(0);
});

test("solving boards back-to-back increments BOARDS and keeps lives; run-over records a new best", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await seedPremium(page);
  await pinRandom(page);
  await page.goto("/");
  await page.locator('.tabs button[data-tab="crossing"]').click();
  await page.locator("#cr-endless").click();

  await expect(page.locator("#pane-crossing .stat:has(.lb:text('MODE')) .vl")).toHaveText("ENDLESS");
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('BOARDS')) .vl")).toHaveText("0");

  await solveOneBoard(page);
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('BOARDS')) .vl")).toHaveText("1");
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('LIVES')) .vl")).toHaveText("❤️❤️❤️");
  await expect(page.locator("#overlay.show")).toBeHidden(); // no modal between boards

  await solveOneBoard(page);
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('BOARDS')) .vl")).toHaveText("2");

  // Walk one safe step into the (fresh, third) board, then repeatedly bump a
  // trap adjacent to that cell to exhaust lives and end the run at
  // boardsCleared = 2 (fixture: seed 500000000's path steps through 8, which
  // neighbors trap 13).
  const { traps, start } = gen(500000000);
  const firstStep = solvePath(traps, start)[0];
  const trapNeighbor = adj(firstStep).find(n => traps.has(n));
  expect(trapNeighbor, "fixture assumption: seed 500000000 has a trap next to the path's first step").toBeDefined();

  await clickCell(page, start);
  await clickCell(page, firstStep);
  await clickCell(page, trapNeighbor);
  await clickCell(page, trapNeighbor);
  await clickCell(page, trapNeighbor);
  await expect(page.locator("#overlay.show")).toBeVisible();
  await expect(page.locator("#m-line")).toHaveText("2 boards cleared — new best!");

  const best = await page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).crossingEndlessBest);
  expect(best).toBe(2);
  expect(errors).toEqual([]);
});
