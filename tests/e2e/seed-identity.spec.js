// Seed-identity contract: with the clock pinned to the same date, the modular
// app must produce puzzles identical to reference/daybatch-v13.html — same
// boards on first paint AND same hidden state (probed via deterministic taps).
import { test, expect } from "@playwright/test";

const TABS = ["tally", "crossing", "sonar", "codebreak", "lexi"];

// Pin device-local date to 10 July 2026, noon. Only Date is faked; timers and
// rAF stay real so both pages boot exactly as in production.
async function pinDate(page) {
  await page.addInitScript(() => {
    const RealDate = Date;
    const fixedMs = new RealDate(2026, 6, 10, 12, 0, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) {
        super();
        return args.length ? new RealDate(...args) : new RealDate(fixedMs);
      }
      static now() { return fixedMs; }
    };
  });
}

// APPROVED DEVIATION (PLAN.md B3 decisions): daily Crossing has no Retry
// button. Strip it from v13 snapshots so the rest of the pane stays byte-compared.
const RETRY_BTN = '<button class="btn" id="cr-retry">Retry</button> ';
const norm = html => html.replace(/\s+/g, " ").trim().replace(RETRY_BTN, "");

// Load a page, init all five games, run the same deterministic probes on each,
// and return per-game pane snapshots.
async function capture(page, url) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await pinDate(page);
  await page.goto(url);
  const snaps = {};

  for (const tab of TABS) {
    await page.locator(`.tabs button[data-tab="${tab}"]`).click();
    await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
    snaps[`${tab}:initial`] = norm(await page.locator(`#pane-${tab}`).innerHTML());
  }

  // Crossing: step onto the start cell — the cascade reveals clue numbers,
  // exposing trap-count state far beyond the initial paint.
  await page.locator('.tabs button[data-tab="crossing"]').click();
  await page.locator("#cr-grid button.can").click();
  snaps["crossing:after-start"] = norm(await page.locator("#pane-crossing").innerHTML());

  // Sonar: ping a fixed diagonal — hit/miss pattern exposes ship placement.
  await page.locator('.tabs button[data-tab="sonar"]').click();
  for (const i of [0, 8, 16, 24, 32, 40, 48]) {
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }
  snaps["sonar:after-pings"] = norm(await page.locator("#pane-sonar").innerHTML());

  // Codebreak: submit the fixed guess [0,1,2,3,4] — the verdict colours
  // expose the hidden code.
  await page.locator('.tabs button[data-tab="codebreak"]').click();
  for (const k of [0, 1, 2, 3, 4]) {
    await page.locator(`.cb-keys button[data-k="${k}"]`).click();
  }
  await page.locator("#cb-sub").click();
  snaps["codebreak:after-guess"] = norm(await page.locator("#pane-codebreak").innerHTML());

  return { snaps, errors };
}

test("same date produces identical puzzles in v13 and the modular app", async ({ browser }) => {
  test.setTimeout(60000);
  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ref = await capture(await ctxA.newPage(), "/reference/daybatch-v13.html");
  const app = await capture(await ctxB.newPage(), "/");

  expect(ref.errors).toEqual([]);
  expect(app.errors).toEqual([]);
  for (const key of Object.keys(ref.snaps)) {
    expect(app.snaps[key], `pane snapshot "${key}" must match v13`).toEqual(ref.snaps[key]);
  }
  await ctxA.close();
  await ctxB.close();
});
