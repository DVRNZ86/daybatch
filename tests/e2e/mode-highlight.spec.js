// D1 patch (Darren's phone test): "Today's" was hardcoded as the highlighted
// (pri) button in every game, so tapping "New puzzle" produced a new board
// but left "Today's" looking selected. The pri class must track isDaily.
import { test, expect } from "@playwright/test";

async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

const GAMES = [
  { tab: "tally", prefix: "ty" },
  { tab: "crossing", prefix: "cr" },
  { tab: "sonar", prefix: "sn" },
  { tab: "codebreak", prefix: "cb" },
  { tab: "lexi", prefix: "lx" }
];

for (const { tab, prefix } of GAMES) {
  test(`${tab}: New puzzle / Today's highlight tracks the active mode, not a fixed button`, async ({ page }) => {
    await openTab(page, tab);
    const newBtn = page.locator(`#${prefix}-new`);
    const todayBtn = page.locator(`#${prefix}-today`);

    // Freshly opened daily: Today's is highlighted, New puzzle isn't.
    await expect(todayBtn).toHaveClass(/\bpri\b/);
    await expect(newBtn).not.toHaveClass(/\bpri\b/);

    // Switch to practice: highlight moves to New puzzle.
    await newBtn.click();
    await expect(newBtn).toHaveClass(/\bpri\b/);
    await expect(todayBtn).not.toHaveClass(/\bpri\b/);

    // Back to the daily: highlight returns to Today's.
    await todayBtn.click();
    await expect(todayBtn).toHaveClass(/\bpri\b/);
    await expect(newBtn).not.toHaveClass(/\bpri\b/);
  });
}

test("Lexi: a fast double-tap on the letter wheel is suppressed, without swallowing the Check button", async ({ page }) => {
  // Mirrors the Tally double-tap-zoom guard, but scoped to #lx-wheelwrap
  // only — a regression during D1 patching found that scoping this to the
  // whole pane silently ate clicks on buttons (like ✓ Check) that landed
  // within 300ms of a prior tap, because preventDefault() on touchend also
  // suppresses the browser's synthesized click for that touch.
  await openTab(page, "lexi");
  const wheel = page.locator("#lx-wheelwrap");

  const [first, second] = await wheel.evaluate((el) => {
    const fire = () => {
      const ev = new Event("touchend", { bubbles: true, cancelable: true });
      el.dispatchEvent(ev);
      return ev.defaultPrevented;
    };
    return [fire(), fire()];
  });
  expect(first).toBe(false);
  expect(second).toBe(true);

  // The actual regression: tap a letter, then immediately tap Check — the
  // click must still register.
  const letter = page.locator(".lx-letter").first();
  await letter.click();
  await expect(letter).toHaveClass(/\bsel\b/);
  await page.locator("#lx-check").click();
  await expect(page.locator(".lx-letter.sel")).toHaveCount(0);
});
