// B3 tester additions.
// 1. Perfect batch end-to-end: all five dailies won at top tier on a pinned
//    date. Asserts the EXACT per-game share card for every game (v13 body +
//    the B3 link footer — a drift check on all five result strings), then the
//    Batch Report at 100/100 with the ✨ Perfect batch line.
// 2. Practice completions never touch the report, header streak, or history.
// Date pinned to 15 September 2026 (= puzzle #6; EPOCH is 10 September 2026).
import { test, expect } from "@playwright/test";
import { hashString } from "../../src/core/rng.js";
import { SITE_URL } from "../../src/core/share.js";
import { gen as genCrossing } from "../../src/games/crossing.js";
import { gen as genSonar } from "../../src/games/sonar.js";
import { gen as genCode } from "../../src/games/codebreak.js";
import { gen as genTally, neighbors, applyOp } from "../../src/games/tally.js";
import { gen as genLexi } from "../../src/games/lexi.js";

const DAY = { y: 2026, m: 8, d: 15 }; // 15 September 2026 (m is JS month index)
const DATE_KEY = "2026-9-15";

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

function trackErrors(page) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  return errors;
}

async function openTab(page, tab) {
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

async function readHistory(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1") || "{}").history || []);
}

// Win modal shown → assert the exact per-game share card, then close.
async function expectShareAndClose(page, expected) {
  await expect(page.locator("#overlay.show")).toBeVisible();
  expect(await page.locator("#m-share").textContent()).toBe(expected);
  await page.locator("#m-close").click();
}

// ---- deterministic winning moves, computed from the real generators --------

// Trap-free walk from START to the goal row (flawless: 3 lives kept).
function crossingSafePath(puz) {
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

// A winning path of exactly par length (first try → Perfect ⛳, tier 1).
function tallyParPath(puz) {
  const visited = new Array(25).fill(false);
  visited[0] = true;
  function dfs(pos, path, total, pending) {
    if (pos === 24) return total === puz.target && path.length === puz.par ? path.slice() : null;
    if (path.length >= puz.par) return null;
    for (const nb of neighbors(pos)) {
      if (visited[nb]) continue;
      visited[nb] = true;
      path.push(nb);
      const cell = puz.cells[nb];
      const hit = cell.type === "op"
        ? dfs(nb, path, total, cell.value)
        : dfs(nb, path, applyOp(total, pending, cell.value), null);
      path.pop();
      visited[nb] = false;
      if (hit) return hit;
    }
    return null;
  }
  return dfs(0, [0], puz.cells[0].value, null);
}

// Greedy letter-index sequence for a word on the initial wheel order.
function lexiIndices(letters, word) {
  const used = new Set(), seq = [];
  for (const ch of word) {
    const i = letters.findIndex((l, idx) => l === ch && !used.has(idx));
    used.add(i); seq.push(i);
  }
  return seq;
}

// ----------------------------------------------------------------------------

test("perfect batch: five tier-1 wins, exact share footer on every game, report 100/100 with ✨ line", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  await expect(page.locator("#report")).toHaveCount(0);

  // -- Tally: par path, first attempt → Perfect ⛳ ---------------------------
  const tally = genTally(hashString("tally-" + DATE_KEY));
  const tPath = tallyParPath(tally);
  expect(tPath).not.toBeNull();
  await openTab(page, "tally");
  for (const i of tPath.slice(1)) await page.locator(`#ty-grid .tc[data-i="${i}"]`).click();
  await expectShareAndClose(page,
    `DAYBATCH · TALLY 🧮 Perfect! ⛳ 🎯 ${tally.target}\nPath ${tally.par} · Best ${tally.par} ⛳\nTries: 1\n${SITE_URL}`);

  // report already live after the first completion
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥1");

  // -- Crossing: trap-free walk → Flawless (3❤️) -----------------------------
  const cPath = crossingSafePath(genCrossing(hashString("crossing-" + DATE_KEY)));
  await openTab(page, "crossing");
  for (const i of cPath) await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  await expectShareAndClose(page,
    `DAYBATCH · CROSSING 🧭 Flawless crossing!\n${cPath.length} steps · ❤️❤️❤️\n${SITE_URL}`);

  // -- Sonar: ships only → Perfect 🏆 in 7 pings -----------------------------
  const ships = [...genSonar(hashString("sonar-" + DATE_KEY)).occ];
  await openTab(page, "sonar");
  for (const i of ships) await page.locator(`.sn-row button[data-i="${i}"]`).click();
  await expectShareAndClose(page,
    `DAYBATCH · SONAR 📡 Perfect! 🏆\n7 pings\n${SITE_URL}`);

  // -- Codebreak: the code first go → Mastermind, all-green grid -------------
  const code = genCode(hashString("codebreak-" + DATE_KEY));
  await openTab(page, "codebreak");
  for (const k of code) await page.locator(`.cb-keys button[data-k="${k}"]`).click();
  await page.locator("#cb-sub").click();
  await expectShareAndClose(page,
    `DAYBATCH · CODEBREAK 🔐 Mastermind! 🧠 1/8\n🟩🟩🟩🟩🟩\n${SITE_URL}`);

  // -- Lexi: every target by taps, zero hints → Wordsmith 🏆 -----------------
  const lexi = genLexi(hashString("lexi-" + DATE_KEY));
  await openTab(page, "lexi");
  for (const w of lexi.targets) {
    for (const i of lexiIndices(lexi.letters, w)) await page.locator(`.lx-letter[data-i="${i}"]`).click();
    await page.locator("#lx-check").click();
  }
  await expectShareAndClose(page,
    `DAYBATCH · LEXI 🔤 Wordsmith! 🏆\n${lexi.targets.length} words · 0 hints\n${SITE_URL}`);

  // -- Batch Report: 100/100 (natural cap), perfect-batch line, all lines ----
  await expect(page.locator("#report .rp-title")).toHaveText("BATCH REPORT · #6");
  await expect(page.locator("#report .rp-score")).toHaveText("100/100 🔥1");
  await expect(page.locator("#report .rp-lines > div")).toHaveText([
    "🧮 Tally — Perfect ⛳",
    "🧭 Crossing — Flawless",
    "📡 Sonar — Perfect 🏆",
    "🔐 Codebreak — 1/8",
    "🔤 Lexi — No hints"
  ]);
  await expect(page.locator("#report .rp-perfect")).toHaveText("✨ Perfect batch — streak 1");
  await expect(page.locator("#hdr-streak")).toHaveText("🔥1");

  // one history record per game, none duplicated
  const h = await readHistory(page);
  expect(h.map(r => r.game).sort()).toEqual(["codebreak", "crossing", "lexi", "sonar", "tally"]);
  expect(h.every(r => r.date === DATE_KEY && r.tier === 1)).toBe(true);
  expect(errors).toEqual([]);
});

test("practice completion never touches the report, header streak, or history", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  // Pin practice seeds: New puzzle uses Math.floor(Math.random()*1e9).
  await page.addInitScript(() => { Math.random = () => 0.5; });
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();

  // one daily completion so a report exists: Sonar perfect
  const ships = [...genSonar(hashString("sonar-" + DATE_KEY)).occ];
  for (const i of ships) await page.locator(`.sn-row button[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click();
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥1");

  // win a full practice round of Crossing (seed pinned to 500000000)
  await openTab(page, "crossing");
  await page.locator("#cr-new").click();
  await expect(page.locator("#cr-retry")).toBeVisible(); // practice mode confirmed
  for (const i of crossingSafePath(genCrossing(500000000))) {
    await page.locator(`#cr-grid button[data-i="${i}"]`).click();
  }
  await expect(page.locator("#overlay.show")).toBeVisible(); // practice still celebrates
  await expect(page.locator("#m-title")).toContainText("Flawless");
  await page.locator("#m-close").click();

  // report, streak chip and history are exactly as before the practice win
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥1");
  await expect(page.locator("#report .rp-lines")).toContainText("🧭 Crossing — not played");
  await expect(page.locator("#hdr-streak")).toHaveText("🔥1");
  expect(await readHistory(page)).toEqual([
    { date: DATE_KEY, game: "sonar", tier: 1, metrics: { pings: 7, hintsUsed: 0, win: true } }
  ]);
  expect(errors).toEqual([]);
});
