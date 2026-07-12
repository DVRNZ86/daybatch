// B4 PWA acceptance: airplane-mode launch, one-revisit update propagation,
// one-time install hint. The SW registers on every page load, so the rest of
// the suite doubles as the SW-on regression run.
import { test, expect } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const SW_PATH = fileURLToPath(new URL("../../sw.js", import.meta.url));

const TABS = ["tally", "crossing", "sonar", "codebreak", "lexi"];

// Registration + precache must be finished before we can meaningfully go
// offline or swap sw.js: ready resolves once a worker is active, and install
// (which precaches the whole shell) completes before activation.
async function swReady(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  await pollUntil(page, async (keys) => keys.some((k) => k.indexOf("daybatch-") === 0));
}

// page.waitForFunction's polling did not reliably await an async predicate in
// this Playwright/Chromium combo (it could resolve on a pending Promise's
// truthiness instead of its settled value) — poll from the test side instead.
async function pollUntil(page, predicate, { timeout = 10000, interval = 50 } = {}) {
  const start = Date.now();
  for (;;) {
    const keys = await page.evaluate(() => caches.keys());
    if (await predicate(keys)) return keys;
    if (Date.now() - start > timeout) throw new Error("pollUntil timed out; last keys: " + JSON.stringify(keys));
    await page.waitForTimeout(interval);
  }
}

// Cache Storage and SW registrations for localhost:4173 are not reliably
// isolated per Playwright context in this environment (unlike localStorage),
// so a registration/cache left over from an earlier test run can leak in.
// Force a clean slate before every test in this file.
test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
    localStorage.clear();
  });
});

test("airplane mode: full offline launch, all five games playable, storage intact", async ({ page, context }) => {
  await page.goto("/");
  await swReady(page);

  await context.setOffline(true);
  await page.reload();

  await expect(page.locator(".logo")).toHaveText("DAYBATCH.");
  for (const t of TABS) {
    await page.click(`.tabs button[data-tab="${t}"]`);
    await expect(page.locator(`#pane-${t} *`).first()).toBeAttached();
  }
  // persistence still works offline: the boot write of lastSeenDate landed
  const root = await page.evaluate(() => JSON.parse(localStorage.getItem("daybatch:v1")));
  expect(root.lastSeenDate).toBeTruthy();

  // and a second offline reload still serves the full shell
  await page.reload();
  await expect(page.locator(".logo")).toHaveText("DAYBATCH.");
  await context.setOffline(false);
});

test("new deploy reaches clients within one revisit", async ({ page }) => {
  await page.goto("/");
  await swReady(page);
  const oldKeys = await page.evaluate(() => caches.keys());

  // Simulate a real deploy: the static server reads sw.js straight off disk,
  // so briefly bumping the real file (restored in `finally`) is what actually
  // exercises the browser's byte-compare — Playwright route interception
  // cannot reliably mock a service worker's own script-update fetch.
  const original = await readFile(SW_PATH, "utf8");
  const bumped = original.replace(/const VERSION = "[^"]+"/, 'const VERSION = "v9.TEST.9"');
  expect(bumped).not.toBe(original);
  try {
    await writeFile(SW_PATH, bumped);

    // Revisit 1: main.js's load handler calls reg.update() itself (a plain
    // re-registration alone would NOT force this browser to re-fetch and
    // byte-compare sw.js) → sees the bumped script, installs, skipWaiting +
    // clients.claim() activate it and the old cache is deleted. This one
    // revisit is the full acceptance criterion.
    await page.reload();
    const keys = await pollUntil(page, async (k) => k.includes("daybatch-v9.TEST.9") && k.length === 1);
    expect(keys).not.toContain(oldKeys[0]);

    // The new worker stays in control and the app keeps working on a further visit.
    await page.reload();
    await expect(page.locator(".logo")).toHaveText("DAYBATCH.");
    expect(await page.evaluate(() => caches.keys())).toEqual(["daybatch-v9.TEST.9"]);
  } finally {
    await writeFile(SW_PATH, original);
  }
});

test("install hint: shown on first visit, dismissible, gone after reload", async ({ page }) => {
  await page.goto("/");
  const hint = page.locator("#installhint");
  await expect(hint).toBeVisible();
  await expect(hint).toContainText("Add Daybatch to your home screen 🌅");

  await page.click("#installhint-x");
  await expect(hint).toBeHidden();

  await page.reload();
  await expect(page.locator(".logo")).toHaveText("DAYBATCH.");
  await expect(hint).toBeHidden();
});

test("install hint: reachable again from the ? help overlay after dismissal", async ({ page }) => {
  await page.goto("/");
  const hint = page.locator("#installhint");
  await page.click("#installhint-x");
  await expect(hint).toBeHidden();

  // sonar is the default tab; its ? opens the shared help overlay
  await page.click("#sn-help");
  const installLink = page.locator("#h-install");
  await expect(installLink).toBeVisible();
  await expect(installLink).toHaveText("Add to home screen 🌅");

  await installLink.click();
  await expect(hint).toBeVisible();
});

test("install hint: Add button triggers the native prompt when the browser offers one", async ({ page }) => {
  await page.goto("/");
  const hint = page.locator("#installhint");
  const addBtn = page.locator("#installhint-add");
  await expect(hint).toBeVisible();
  await expect(addBtn).toBeHidden();

  // Playwright's headless Chromium never dispatches a real beforeinstallprompt
  // (installability heuristics aren't met in a test run) — simulate the
  // browser offering one, the same shape main.js's listener expects.
  await page.evaluate(() => {
    const evt = new Event("beforeinstallprompt", { cancelable: true });
    evt.prompt = () => { window.__promptCalled = true; };
    evt.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(evt);
  });
  await expect(addBtn).toBeVisible();

  await addBtn.click();
  await expect(hint).toBeHidden();
  expect(await page.evaluate(() => window.__promptCalled)).toBe(true);
});

test.describe("iOS Safari", () => {
  test.use({
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });

  test("install hint falls back to Share-sheet instructions; no Add button", async ({ page }) => {
    await page.goto("/");
    const hint = page.locator("#installhint");
    await expect(hint).toBeVisible();
    await expect(page.locator("#installhint-text")).toHaveText('Tap Share, then "Add to Home Screen" 🌅');
    await expect(page.locator("#installhint-add")).toBeHidden();
  });
});
