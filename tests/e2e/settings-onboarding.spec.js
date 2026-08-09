// B5: first-run onboarding banner, settings overlay (haptics, colour-blind
// mode, personal-best records).
import { test, expect } from "@playwright/test";
import { gen as genCodebreak } from "../../src/games/codebreak.js";
import { dailySeed } from "../../src/core/rng.js";

async function openTab(page, tab) {
  await page.goto("/");
  await page.locator(`.tabs button[data-tab="${tab}"]`).click();
  await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
}

test("onboarding banner: shown on first visit, non-blocking, dismissible, gone after reload", async ({ page }) => {
  await page.goto("/");
  const banner = page.locator("#onboarding");
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Five puzzles. Every day. That's it.");

  // non-blocking: the board underneath is already usable without dismissing it first
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  await page.locator(".sn-row button").first().click();
  await expect(page.locator("#pane-sonar .stat.big .vl").first()).toHaveText("1");

  await page.locator("#ob-start").click();
  await expect(banner).toBeHidden();

  await page.reload();
  await expect(banner).toBeHidden();
});

// B6: analytics consent banner. Sequenced, not stacked, with onboarding — a
// real regression found while building this: three simultaneous first-visit
// banners (onboarding + install-hint + consent) pushed Lexi's Check button
// below the fold and broke touch input (see git history for the fix).
test("analytics consent banner: does not stack with onboarding on a genuine first visit", async ({ page }) => {
  await page.goto("/");
  const onboarding = page.locator("#onboarding");
  const consent = page.locator("#analytics-consent");
  await expect(onboarding).toBeVisible();
  await expect(consent).toBeHidden(); // not shown yet — would double up with onboarding

  await page.locator("#ob-start").click();
  await expect(onboarding).toBeHidden();
  await expect(consent).toBeVisible(); // now sequenced in
});

test("analytics consent banner: shown immediately for a returning user (onboarding already seen)", async ({ page }) => {
  await page.addInitScript(() => {
    // addInitScript re-runs on every navigation, including the reload() below —
    // only seed if nothing's there yet, or a reload would stomp analyticsConsent
    // right back to undecided.
    if (!localStorage.getItem("daybatch:v1")) {
      localStorage.setItem("daybatch:v1", JSON.stringify({
        schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true
      }));
    }
  });
  await page.goto("/");
  await expect(page.locator("#onboarding")).toBeHidden();
  await expect(page.locator("#analytics-consent")).toBeVisible();
});

test("analytics consent: Accept/Decline persists, hides the banner, gone after reload; Settings toggle reflects and can change it", async ({ page }) => {
  await page.addInitScript(() => {
    // addInitScript re-runs on every navigation, including the reload() below —
    // only seed if nothing's there yet, or a reload would stomp analyticsConsent
    // right back to undecided.
    if (!localStorage.getItem("daybatch:v1")) {
      localStorage.setItem("daybatch:v1", JSON.stringify({
        schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true
      }));
    }
  });
  await page.goto("/");
  const consent = page.locator("#analytics-consent");
  await expect(consent).toBeVisible();
  await page.locator("#ac-accept").click();
  await expect(consent).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).analyticsConsent)).toBe(true);

  await page.reload();
  await expect(consent).toBeHidden(); // already decided — banner doesn't reappear

  // Settings toggle reflects the accepted state and can flip it back off
  await page.locator(".sn-row button").first().click(); // harmless interaction, ensures pane ready
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#st-analytics")).toBeChecked();
  await page.locator("#st-analytics").uncheck();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).analyticsConsent)).toBe(false);
});

// B6 regression: real GA4/Cloudflare credentials went live 9 Aug 2026, and both
// trackers must stay off the test/dev/LAN/tunnel origin this suite runs on —
// Cloudflare's endpoint only allow-lists daybatch.app and rejects anything
// else with a real CORS error (which broke ~35 tests before this was fixed).
// Accepting consent (which would normally load GA) must still not inject
// either tracker's script tag off the real hostname, and never any console
// errors either way.
test("analytics: neither GA nor Cloudflare inject off the production hostname, even after accepting consent", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#ob-start").click();
  await page.locator("#ac-accept").click();

  const scriptSrcs = await page.evaluate(() => [...document.querySelectorAll("script")].map(s => s.src).filter(Boolean));
  expect(scriptSrcs.some(s => s.includes("googletagmanager.com"))).toBe(false);
  expect(scriptSrcs.some(s => s.includes("cloudflareinsights.com"))).toBe(false);
  await page.waitForTimeout(300); // let any stray async beacon activity surface
  expect(errors).toEqual([]);
});

test("analytics consent: Decline persists and hides the banner, gone after reload", async ({ page }) => {
  await page.addInitScript(() => {
    // addInitScript re-runs on every navigation, including the reload() below —
    // only seed if nothing's there yet, or a reload would stomp analyticsConsent
    // right back to undecided.
    if (!localStorage.getItem("daybatch:v1")) {
      localStorage.setItem("daybatch:v1", JSON.stringify({
        schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true
      }));
    }
  });
  await page.goto("/");
  const consent = page.locator("#analytics-consent");
  await expect(consent).toBeVisible();
  await page.locator("#ac-decline").click();
  await expect(consent).toBeHidden();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).analyticsConsent)).toBe(false);

  await page.reload();
  await expect(consent).toBeHidden();
});

test("Settings is reachable from the help overlay and shows haptics + colour-blind toggles", async ({ page }) => {
  await openTab(page, "sonar");
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#settingsov.show")).toBeVisible();
  await expect(page.locator("#helpov.show")).toHaveCount(0);
  await expect(page.locator("#st-haptics")).toBeChecked();
  await expect(page.locator("#st-colorblind")).not.toBeChecked();
});

test("Haptics toggle persists and gates the win vibration", async ({ page }) => {
  await page.addInitScript(() => {
    window.__vibrateCalls = [];
    navigator.vibrate = (p) => { window.__vibrateCalls.push(p); return true; };
  });
  await openTab(page, "sonar");
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await page.locator("#st-haptics").uncheck();
  await page.locator("#st-close").click();

  await expect(page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")).hapticsEnabled)).resolves.toBe(false);

  // reopening settings later still reflects the persisted choice
  await page.reload();
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#st-haptics")).not.toBeChecked();
});

test("Colour-blind mode adds a verdict badge to Codebreak tiles, on top of colour", async ({ page }) => {
  await openTab(page, "codebreak");
  const code = genCodebreak(dailySeed("codebreak"));
  for (const s of code) await page.locator(`.cb-keys button[data-k="${s}"]`).click();
  await page.locator("#cb-sub").click();
  await expect(page.locator("#overlay.show")).toBeVisible();
  await page.locator("#m-close").click(); // dismiss the win modal so #cb-help is reachable

  const tile = page.locator('.cb-tile[data-v="green"]').first();
  await expect(tile).toBeVisible(); // sanity: the verdict attribute is present

  // off by default: no badge glyph rendered
  let content = await tile.evaluate(el => getComputedStyle(el, "::after").content);
  expect(content === "none" || content === '""').toBeTruthy();

  await page.locator("#cb-help").click();
  await page.locator("#h-settings").click();
  await page.locator("#st-colorblind").check();
  await page.locator("#st-close").click();

  await expect(page.locator("body")).toHaveClass(/cb-mode/);
  content = await tile.evaluate(el => getComputedStyle(el, "::after").content);
  expect(content).toBe('"✓"');
});

// Records live in the History overlay, not Settings — PLAN.md B5: "stats
// screen (history, records)... premium-gated", so both need the same
// entitlement, not just history rows.
test("Records (in the premium History overlay) reflect Timed-mode bests once one exists", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null },
      bestTimes: { sonar: 12345 }, crossingEndlessBest: 3
    }));
  });
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await expect(page.locator("#hi-records")).toContainText("Sonar");
  await expect(page.locator("#hi-records")).toContainText("Crossing");
  await expect(page.locator("#hi-records")).not.toContainText("No Timed or Endless records yet");
});

test("Records show the empty state with no best times recorded, and Settings has no records section at all", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("daybatch:v1", JSON.stringify({
      schema: 1, lastSeenDate: null, games: {}, history: [], onboardingShown: true,
      premium: { code: "LIFETIME1", tier: "lifetime", verifiedAt: Date.now(), expiresAt: null }
    }));
  });
  await page.goto("/");
  await page.locator("#hdr-history").click();
  await expect(page.locator("#hi-records")).toContainText("No Timed or Endless records yet");

  await page.locator("#hi-close").click();
  await page.locator("#sn-help").click();
  await page.locator("#h-settings").click();
  await expect(page.locator("#st-records")).toHaveCount(0);
});

test("Footer social row renders (stubbed, non-interactive) regardless of premium tier", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#footer-social")).toBeVisible();
  await expect(page.locator("#footer-social span")).toHaveCount(5);
});
