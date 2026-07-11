// B3: Batch Report card, header 🔥 streak, unified share (copy + WebShare).
// Date pinned to 15 July 2026 (= puzzle #5; EPOCH is 11 July 2026).
import { test, expect } from "@playwright/test";
import { hashString } from "../../src/core/rng.js";
import { gen as genSonar } from "../../src/games/sonar.js";
import { SITE_URL } from "../../src/core/share.js";

function trackErrors(page) {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));
  return errors;
}

async function pinDate(page, y = 2026, m = 6, d = 15) {
  await page.addInitScript(([yy, mm, dd]) => {
    const RealDate = Date;
    const fixedMs = new RealDate(yy, mm, dd, 12, 0, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) {
        super();
        return args.length ? new RealDate(...args) : new RealDate(fixedMs);
      }
      static now() { return fixedMs; }
    };
  }, [y, m, d]);
}

async function winSonarPerfect(page, dateKey) {
  const ships = [...genSonar(hashString("sonar-" + dateKey)).occ];
  for (const i of ships) await page.locator(`.sn-row button[data-i="${i}"]`).click();
  await expect(page.locator("#overlay.show")).toBeVisible();
}

test("report appears after first completion; exact card copied; footer on per-game card", async ({ browser }) => {
  const ctx = await browser.newContext({ permissions: ["clipboard-read", "clipboard-write"] });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  await pinDate(page);
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();

  // fresh profile: no report, no flame
  await expect(page.locator("#report")).toHaveCount(0);
  await expect(page.locator("#hdr-streak")).toBeHidden();

  await winSonarPerfect(page, "2026-7-15");
  // per-game share card carries the link footer
  const perGame = await page.locator("#m-share").textContent();
  expect(perGame.endsWith("\n" + SITE_URL)).toBe(true);
  await page.locator("#m-close").click();

  // report card: #5, 20/100 🔥1, five lines
  await expect(page.locator("#report .rp-title")).toHaveText("BATCH REPORT · #5");
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥1");
  await expect(page.locator("#report .rp-lines")).toContainText("📡 Sonar — Perfect 🏆");
  await expect(page.locator("#report .rp-lines")).toContainText("🧮 Tally — not played");
  await expect(page.locator("#hdr-streak")).toHaveText("🔥1");
  await expect(page.locator("#report .rp-perfect")).toHaveCount(0); // not a perfect batch

  // survives reload (renders from history)
  await page.reload();
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥1");

  // share copies the exact contract card (no navigator.share in desktop chromium)
  await page.locator("#rp-share").click();
  await expect(page.locator("#rp-share")).toHaveText("Copied ✓");
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(
`DAYBATCH #5 · 20/100 🔥1
🧮 Tally — not played
🧭 Crossing — not played
📡 Sonar — Perfect 🏆
🔐 Codebreak — not played
🔤 Lexi — not played
${SITE_URL}`);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("Web Share receives the card text plus the url field", async ({ page }) => {
  const errors = trackErrors(page);
  await pinDate(page);
  await page.addInitScript(() => {
    window.__sharePayloads = [];
    navigator.share = async p => { window.__sharePayloads.push(p); };
  });
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();
  await winSonarPerfect(page, "2026-7-15");
  await page.locator("#m-close").click();

  await page.locator("#rp-share").click();
  await expect(page.locator("#rp-share")).toHaveText("Shared ✓");
  const payloads = await page.evaluate(() => window.__sharePayloads);
  expect(payloads).toHaveLength(1);
  expect(payloads[0].url).toBe(SITE_URL);
  expect(payloads[0].text.startsWith("DAYBATCH #5 · 20/100")).toBe(true);
  expect(errors).toEqual([]);
});

test("streak crosses Auckland midnight: 🔥1 pending on the new day, 🔥2 after playing", async ({ browser }) => {
  const ctx = await browser.newContext({ timezoneId: "Pacific/Auckland" });
  const page = await ctx.newPage();
  const errors = trackErrors(page);
  // mutable clock at 23:50 on EPOCH day (11 Jul 2026, puzzle #1)
  await page.addInitScript(() => {
    window.__dayOffsetMs = 0;
    const RealDate = Date;
    const baseMs = new RealDate(2026, 6, 11, 23, 50, 0).getTime();
    window.Date = class extends RealDate {
      constructor(...args) {
        super();
        return args.length ? new RealDate(...args) : new RealDate(baseMs + window.__dayOffsetMs);
      }
      static now() { return baseMs + window.__dayOffsetMs; }
    };
  });
  await page.goto("/");
  await expect(page.locator("#pane-sonar .board")).toBeVisible();

  await winSonarPerfect(page, "2026-7-11");
  await page.locator("#m-close").click();
  await expect(page.locator("#report .rp-title")).toHaveText("BATCH REPORT · #1");
  await expect(page.locator("#hdr-streak")).toHaveText("🔥1");

  // cross midnight, accept the new batch
  await page.evaluate(() => { window.__dayOffsetMs = 20 * 60 * 1000; });
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.locator("#rollover-go").click();

  // new day, nothing played yet: report hidden, streak holds at 🔥1 (pending)
  await expect(page.locator("#report")).toHaveCount(0);
  await expect(page.locator("#hdr-streak")).toHaveText("🔥1");

  // play day 2 → 🔥2, puzzle #2
  await winSonarPerfect(page, "2026-7-12");
  await page.locator("#m-close").click();
  await expect(page.locator("#report .rp-title")).toHaveText("BATCH REPORT · #2");
  await expect(page.locator("#hdr-streak")).toHaveText("🔥2");
  await expect(page.locator("#report .rp-score")).toHaveText("20/100 🔥2");
  expect(errors).toEqual([]);
  await ctx.close();
});
