// B1 acceptance: "five games playable" — each game is exercised end to end
// through its real input path (clicks for Sonar/Codebreak/Crossing, pointer
// drags and touch taps for Tally/Lexi). No date pinning: dailySeed just picks
// today's puzzle, and every assertion below holds for any seed.
import { test, expect } from "@playwright/test";

// Collect console errors + pageerrors, unfiltered. Call before goto().
function trackErrors(page) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  return errors;
}

async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

async function centerOf(page, selector) {
  const box = await page.locator(selector).boundingBox();
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

const overlay = page => page.locator("#overlay.show");

// ---------------------------------------------------------------- SONAR ----

test("Sonar: pinging cells to 7/7 completes the game with a result modal", async ({ page }) => {
  test.setTimeout(60000);
  const errors = trackErrors(page);
  await openTab(page, "sonar");

  // Clicking every cell guarantees finding all 7 ship cells; revealed cells
  // ignore further taps. Stop as soon as the win modal appears.
  for (let i = 0; i < 49; i++) {
    if (await overlay(page).count()) break;
    await page.locator(`.sn-row button[data-i="${i}"]`).click();
  }

  await expect(overlay(page)).toBeVisible();
  await expect(page.locator("#m-title")).toHaveText(/Perfect|Sharp shooting|Solid sweep|All found/);
  await expect(
    page.locator("#pane-sonar .stat.big").filter({ hasText: "FOUND" }).locator(".vl")
  ).toHaveText("7/7");
  // slim reopen bar renders under the finished board
  await expect(page.locator("#pane-sonar .slimbar")).toBeVisible();
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------ CODEBREAK ----

test("Codebreak: keys disable when used, delete works, verdicts render, game ends in a modal", async ({ page }) => {
  test.setTimeout(60000);
  const errors = trackErrors(page);
  await openTab(page, "codebreak");
  const key = k => page.locator(`.cb-keys button[data-k="${k}"]`);

  // picking a symbol marks its key used + disabled
  await key(0).click();
  await expect(key(0)).toHaveClass(/used/);
  await expect(key(0)).toBeDisabled();
  await key(1).click();
  await expect(page.locator(".cb-slot.filled")).toHaveCount(2);

  // delete removes the last pick and re-enables its key
  await page.locator("#cb-del").click();
  await expect(page.locator(".cb-slot.filled")).toHaveCount(1);
  await expect(key(1)).toBeEnabled();

  // complete and submit guess #1: [0,1,2,3,4]
  for (const k of [1, 2, 3, 4]) await key(k).click();
  await expect(page.locator("#cb-sub")).toBeEnabled();
  await page.locator("#cb-sub").click();

  // verdict tiles render for the submitted guess
  await expect(page.locator(".cb-row .cb-tile")).toHaveCount(5);
  await expect(page.locator("#pane-codebreak .stat.big .vl")).toHaveText("1/8");

  // keep submitting distinct-symbol guesses; after at most 8 the game ends
  // (win or "Locked out") and the result modal must appear
  for (let g = 1; g < 8; g++) {
    if (await overlay(page).count()) break;
    for (let k = 0; k < 5; k++) await key((g + k) % 7).click();
    await page.locator("#cb-sub").click();
  }
  await expect(overlay(page)).toBeVisible();
  await expect(page.locator("#m-title")).toHaveText(/Mastermind|Cracked it|Solid solve|Close call|Locked out/);
  expect(errors).toEqual([]);
});

// ------------------------------------------------------------- CROSSING ----

test("Crossing: tapping the START cell advances the game", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "crossing");

  // before the first step, the START cell is the only legal move
  const start = page.locator("#cr-grid button.can");
  await expect(start).toHaveCount(1);
  await start.click();

  // the step registered: counter incremented, position marked, clues revealed
  await expect(
    page.locator("#pane-crossing .stat").filter({ hasText: "STEPS" }).locator(".vl")
  ).toHaveText("1");
  await expect(page.locator("#cr-grid button.pos")).toHaveCount(1);
  await expect(page.locator("#cr-grid button.pos span").first()).toHaveText(/^(\d+|·)$/);
  expect(await page.locator("#cr-grid button.seen").count()).toBeGreaterThan(0);
  // and new legal moves are offered from the new position
  expect(await page.locator("#cr-grid button.can").count()).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

// ---------------------------------------------------------------- TALLY ----

test("Tally: pointer drag draws a path and updates RUNNING; touch tap extends it", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "tally");
  await page.locator("#ty-grid").scrollIntoViewIfNeeded();

  // drag START(0) -> 1 -> 2 through cell centres (hit zone is the middle 72%)
  const c0 = await centerOf(page, '.tc[data-i="0"]');
  const c1 = await centerOf(page, '.tc[data-i="1"]');
  const c2 = await centerOf(page, '.tc[data-i="2"]');
  await page.mouse.move(c0.x, c0.y);
  await page.mouse.down();
  await page.mouse.move(c1.x, c1.y, { steps: 8 });
  await page.mouse.move(c2.x, c2.y, { steps: 8 });
  await page.mouse.up();

  // path cells light up, the polyline gains points, RUNNING shows num·op·num
  for (const i of [0, 1, 2]) {
    await expect(page.locator(`.tc[data-i="${i}"]`)).toHaveClass(/\bon\b/);
  }
  await expect(page.locator("#ty-line")).toHaveAttribute("points", /\d.* .*\d/);
  await expect(page.locator("#ty-total")).toHaveText(/^-?\d+$/);

  // touch input: tapping the adjacent cell 3 extends the path
  const c3 = await centerOf(page, '.tc[data-i="3"]');
  await page.touchscreen.tap(c3.x, c3.y);
  await expect(page.locator('.tc[data-i="3"]')).toHaveClass(/\bon\b/);
  expect(errors).toEqual([]);
});

test("Tally: a fast double-tap on the board is suppressed (iOS double-tap-zoom guard)", async ({ page }) => {
  // touch-action:none on #ty-board doesn't reliably stop iOS Safari's
  // double-tap-zoom gesture — this locks in the explicit suppression
  // (src/games/tally.js) that fixed a real bug: once zoomed, every
  // subsequent tap both panned the page and still registered as a move.
  await openTab(page, "tally");
  const board = page.locator("#ty-board");
  await board.scrollIntoViewIfNeeded();

  const [first, second] = await board.evaluate((el) => {
    const fire = () => {
      const ev = new Event("touchend", { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    const a = fire();
    const b = fire(); // within the same tick: well under the 300ms window
    return [a, b];
  });
  expect(first).toBe(false); // a lone tap must not be suppressed
  expect(second).toBe(true); // the rapid second tap is the zoom gesture — blocked

  // gesturestart (Safari's pinch-zoom event) is prevented too
  const gestureBlocked = await board.evaluate((el) => {
    const ev = new Event("gesturestart", { bubbles: true, cancelable: true });
    el.dispatchEvent(ev);
    return ev.defaultPrevented;
  });
  expect(gestureBlocked).toBe(true);
});

// ----------------------------------------------------------------- LEXI ----

test("Lexi: pointer drag across letters previews the word, draws the line, and release submits", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "lexi");
  await page.locator("#lx-wheelwrap").scrollIntoViewIfNeeded();

  const foundBefore = await page.locator("#lx-found").textContent();

  // swipe letter 0 -> 1 -> 2 (adjacent on the wheel, chords miss other letters)
  const p0 = await centerOf(page, '.lx-letter[data-i="0"]');
  const p1 = await centerOf(page, '.lx-letter[data-i="1"]');
  const p2 = await centerOf(page, '.lx-letter[data-i="2"]');
  await page.mouse.move(p0.x, p0.y);
  await page.mouse.down();
  await expect(page.locator("#lx-preview")).toHaveText(/^\S$/);
  await page.mouse.move(p1.x, p1.y, { steps: 8 });
  await expect(page.locator("#lx-preview")).toHaveText(/^\S{2}$/);
  await expect(page.locator("#lx-line")).toHaveAttribute("points", /.+ .+/);
  await expect(page.locator(".lx-letter.sel")).toHaveCount(2);
  await page.mouse.move(p2.x, p2.y, { steps: 8 });
  await expect(page.locator("#lx-preview")).toHaveText(/^\S{3}$/);
  await page.mouse.up();

  // release submits the 3-letter word: either it was a target (FOUND increments)
  // or it was invalid (wheel shakes)
  await expect(async () => {
    const shaken = await page.locator("#lx-wheelwrap.shakeX").count();
    const foundNow = await page.locator("#lx-found").textContent();
    expect(shaken === 1 || foundNow !== foundBefore).toBeTruthy();
  }).toPass();
  // selection and line clear after submission
  await expect(page.locator(".lx-letter.sel")).toHaveCount(0);
  await expect(page.locator("#lx-line")).toHaveAttribute("points", "");
  expect(errors).toEqual([]);
});

test("Lexi: touch tap selects a letter and ✓ Check submits", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "lexi");
  await page.locator("#lx-wheelwrap").scrollIntoViewIfNeeded();

  // tap a letter with the touchscreen: it selects and previews
  const p0 = await centerOf(page, '.lx-letter[data-i="0"]');
  await page.touchscreen.tap(p0.x, p0.y);
  await expect(page.locator('.lx-letter[data-i="0"]')).toHaveClass(/\bsel\b/);
  await expect(page.locator("#lx-preview")).toHaveText(/^\S$/);

  // tap ✓ Check: submits (a 1-letter word is simply cleared)
  const chk = await centerOf(page, "#lx-check");
  await page.touchscreen.tap(chk.x, chk.y);
  await expect(page.locator(".lx-letter.sel")).toHaveCount(0);
  await expect(page.locator("#lx-line")).toHaveAttribute("points", "");
  expect(errors).toEqual([]);
});

test("Lexi: hint fills a slot word and hinting every word triggers the win modal", async ({ page }) => {
  test.setTimeout(60000);
  const errors = trackErrors(page);
  await openTab(page, "lexi");

  const total = parseInt((await page.locator("#lx-found").textContent()).split("/")[1], 10);
  expect(total).toBeGreaterThanOrEqual(7); // generator contract: 7..16 targets

  // one hint: HINTS increments and a slot word is revealed as hinted
  await page.locator("#lx-hint").click();
  await expect(page.locator("#lx-hints")).toHaveText("1");
  await expect(page.locator(".lx-word.hinted")).toHaveCount(1);
  await expect(page.locator("#lx-found")).toHaveText(`1/${total}`);
  await expect(page.locator(".lx-word.hinted b").first()).toHaveText(/^\S$/);

  // hint through the remaining words: the last one must trigger the win modal
  for (let i = 1; i < total; i++) {
    if (await overlay(page).count()) break;
    await page.locator("#lx-hint").click();
  }
  await expect(overlay(page)).toBeVisible();
  await expect(page.locator("#m-title")).toHaveText(/Wordsmith|Sharp|Solved/);
  await expect(page.locator("#lx-found")).toHaveText(`${total}/${total}`);
  expect(errors).toEqual([]);
});

// ------------------------------------------------- LEXI SHUFFLE (v0.B1.2) ----

test("Lexi: FOUND/HINTS counters survive a shuffle (B1.2 regression)", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "lexi");

  // Bank two words via hints, then shuffle: the rebuilt stats row must show
  // the live counts, not reset to zero (v13 bug fixed in v0.B1.2).
  await page.locator("#lx-hint").click();
  await page.locator("#lx-hint").click();
  await expect(page.locator("#lx-found")).toHaveText(/^2\//);
  await expect(page.locator("#lx-hints")).toHaveText("2");

  await page.locator("#lx-shuffle").click();
  await expect(page.locator("#lx-found")).toHaveText(/^2\//);
  await expect(page.locator("#lx-hints")).toHaveText("2");
  expect(await page.locator(".lx-word.hinted").count()).toBe(2);

  expect(errors).toEqual([]);
});

// ------------------------------------------------ CROSSING RETRY (v0.B3) ----

test("Crossing: Retry absent on dailies, present in practice (B3 decision)", async ({ page }) => {
  const errors = trackErrors(page);
  await openTab(page, "crossing");
  await expect(page.locator("#cr-new")).toBeVisible();
  await expect(page.locator("#cr-retry")).toHaveCount(0);   // daily: no Retry

  await page.locator("#cr-new").click();                    // practice round
  await expect(page.locator("#cr-retry")).toBeVisible();
  await page.locator("#cr-retry").click();                  // practice retry still works
  await expect(page.locator("#pane-crossing .stat:has(.lb:text('STEPS')) .vl")).toHaveText("0");

  await page.locator("#cr-today").click();                  // back to daily: gone again
  await expect(page.locator("#cr-retry")).toHaveCount(0);
  expect(errors).toEqual([]);
});
