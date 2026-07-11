// B2 tester additions (CLAUDE.md tester mandate + B2 decisions):
//  - touch-gesture DRAG persistence for Tally/Lexi (real CDP touch events —
//    existing persistence tests drive these games by clicks only)
//  - practice rounds ("New puzzle") are ephemeral and never overwrite the
//    persisted daily snapshot
//  - "Today's" resumes the daily in progress (never resets it) and restores
//    a finished daily as board + result bar, no modal
// Date pinned to 10 July 2026 like persistence.spec.js so puzzles are known.
import { test, expect } from "@playwright/test";
import { hashString } from "../../src/core/rng.js";
import { gen as genCrossing } from "../../src/games/crossing.js";
import { gen as genLexi } from "../../src/games/lexi.js";
import { gen as genTally, neighbors, applyOp } from "../../src/games/tally.js";

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
const stat = (page, tab, lb) => page.locator(`#pane-${tab} .stat:has(.lb:text('${lb}')) .vl`);

function trackErrors(page) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  return errors;
}

async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

// Genuine touch drag: CDP touch events, from which Chromium synthesizes the
// pointerdown/move/up stream the games listen to (page.touchscreen has no drag).
async function touchDrag(page, points) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [points[0]] });
  for (let k = 1; k < points.length; k++) {
    const a = points[k - 1], b = points[k];
    for (let s = 1; s <= 6; s++) {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: a.x + ((b.x - a.x) * s) / 6, y: a.y + ((b.y - a.y) * s) / 6 }]
      });
    }
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await cdp.detach();
}

// ---------------------------------------------------- TALLY (touch drag) ----

// Winning path of exactly par length for the pinned day (as persistence.spec).
function tallyParPath() {
  const puz = genTally(hashString("tally-" + DATE_KEY));
  const { target, par, cells } = puz;
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

test("Tally: partial path drawn by touch drag persists across reload", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const { path } = tallyParPath();
  expect(path).not.toBeNull();

  await page.goto("/");
  await openTab(page, "tally");
  await page.locator("#ty-grid").scrollIntoViewIfNeeded();

  // touch-drag through START + the next three par-path cells, release mid-board
  const prefix = path.slice(0, 4);
  const pts = [];
  for (const i of prefix) pts.push(await centerOf(page, `.tc[data-i="${i}"]`));
  await touchDrag(page, pts);

  await expect(page.locator("#ty-grid .tc.on")).toHaveCount(prefix.length);
  const running = await page.locator("#ty-total").textContent();
  expect(running).toMatch(/^-?\d+$/);

  await page.reload();
  await openTab(page, "tally");
  await expect(page.locator("#ty-grid .tc.on")).toHaveCount(prefix.length);
  await expect(page.locator("#ty-total")).toHaveText(running);
  for (const i of prefix) {
    await expect(page.locator(`.tc[data-i="${i}"]`)).toHaveClass(/\bon\b/);
  }
  await expect(stat(page, "tally", "TRIES")).toHaveText("0"); // never reached END
  expect(errors).toEqual([]);
});

// ---------------------------------------------------- LEXI (touch swipe) ----

// Greedy letter-index sequence for a word on the given wheel order.
function indicesFor(word, letters) {
  const used = new Set(), seq = [];
  for (const ch of word) {
    const i = letters.findIndex((l, idx) => l === ch && !used.has(idx));
    used.add(i); seq.push(i);
  }
  return seq;
}

test("Lexi: word found by touch swipe persists across reload", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const puz = genLexi(hashString("lexi-" + DATE_KEY));
  const N = puz.targets.length;
  const word = puz.targets[0];

  await page.goto("/");
  await openTab(page, "lexi");
  await page.locator("#lx-wheelwrap").scrollIntoViewIfNeeded();

  // swipe through the word's letters and release: swipe-submit finds it
  const pts = [];
  for (const i of indicesFor(word, puz.letters)) {
    pts.push(await centerOf(page, `.lx-letter[data-i="${i}"]`));
  }
  await touchDrag(page, pts);
  await expect(page.locator("#lx-found")).toHaveText(`1/${N}`);
  await expect(page.locator(".lx-word.found")).toHaveCount(1);

  await page.reload();
  await openTab(page, "lexi");
  await expect(page.locator("#lx-found")).toHaveText(`1/${N}`);
  await expect(page.locator("#lx-hints")).toHaveText("0");
  await expect(page.locator(".lx-word.found")).toHaveCount(1);
  expect((await page.locator(".lx-word.found b").allTextContents()).join("")).toBe(word);
  expect(errors).toEqual([]);
});

// ------------------------------------- PRACTICE GUARD + "TODAY'S" RESUME ----

// Safe walk for the pinned day's Crossing (as persistence.spec).
function crossingSafePath() {
  const puz = genCrossing(hashString("crossing-" + DATE_KEY));
  const COLS = 5, ROWS = 7;
  const prev = new Map([[puz.start, null]]);
  const q = [puz.start];
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

test("Crossing: practice never overwrites the daily; Today's resumes mid-play and restores the finished daily as a bar", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  await page.goto("/");
  await openTab(page, "crossing");
  const path = crossingSafePath();

  // daily: three safe steps
  for (const i of path.slice(0, 3)) await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  await expect(stat(page, "crossing", "STEPS")).toHaveText("3");
  const dailyGrid = norm(await page.locator("#cr-grid").innerHTML());

  // practice: New puzzle + one move (the START cell is never a trap)
  await page.locator("#cr-new").click();
  await expect(stat(page, "crossing", "MODE")).toHaveText("PRAC");
  await page.locator("#cr-grid button.can").click();
  await expect(stat(page, "crossing", "STEPS")).toHaveText("1");

  // "Today's" resumes the daily in progress — same board, same steps, no reset
  await page.locator("#cr-today").click();
  await expect(stat(page, "crossing", "MODE")).toHaveText("DAILY");
  await expect(stat(page, "crossing", "STEPS")).toHaveText("3");
  expect(norm(await page.locator("#cr-grid").innerHTML())).toEqual(dailyGrid);

  // reload: the daily snapshot (not the practice round) is what restores
  await page.reload();
  await openTab(page, "crossing");
  await expect(stat(page, "crossing", "MODE")).toHaveText("DAILY");
  await expect(stat(page, "crossing", "STEPS")).toHaveText("3");
  expect(norm(await page.locator("#cr-grid").innerHTML())).toEqual(dailyGrid);

  // finish the daily, detour into practice, come back via "Today's":
  // finished board + result bar, no modal, no fresh puzzle
  for (const i of path.slice(3)) await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();
  await page.locator("#cr-new").click();
  await expect(stat(page, "crossing", "MODE")).toHaveText("PRAC");
  await page.locator("#cr-today").click();
  await expect(page.locator("#overlay.show")).toHaveCount(0);
  await expect(page.locator("#pane-crossing .slimbar.win")).toBeVisible();
  await expect(page.locator("#cr-grid button.boom").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("Lexi: practice hints and shuffles never overwrite the daily snapshot", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  const puz = genLexi(hashString("lexi-" + DATE_KEY));
  const N = puz.targets.length;

  await page.goto("/");
  await openTab(page, "lexi");

  // daily: one hint banked
  await page.locator("#lx-hint").click();
  await expect(page.locator("#lx-found")).toHaveText(`1/${N}`);
  const dailyWheel = await page.locator(".lx-letter").allTextContents();

  // practice: new puzzle, two hints, a shuffle — all ephemeral
  await page.locator("#lx-new").click();
  await expect(stat(page, "lexi", "MODE")).toHaveText("PRAC");
  await page.locator("#lx-hint").click();
  await page.locator("#lx-hint").click();
  await expect(page.locator("#lx-hints")).toHaveText("2");
  await page.locator("#lx-shuffle").click();

  // reload: the daily (1 hint, daily wheel order) restores, not the practice
  await page.reload();
  await openTab(page, "lexi");
  await expect(stat(page, "lexi", "MODE")).toHaveText("DAILY");
  await expect(page.locator("#lx-found")).toHaveText(`1/${N}`);
  await expect(page.locator("#lx-hints")).toHaveText("1");
  expect(await page.locator(".lx-letter").allTextContents()).toEqual(dailyWheel);
  expect(errors).toEqual([]);
});
