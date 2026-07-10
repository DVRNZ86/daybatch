import { test, expect } from "@playwright/test";

const TABS = ["tally", "crossing", "sonar", "codebreak", "lexi"];

test("app loads, all five tabs render a board, no console errors", async ({ page }) => {
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", e => errors.push(String(e)));

  await page.goto("/");
  await expect(page.locator(".logo")).toHaveText("DAYBATCH.");

  for (const tab of TABS) {
    await page.locator(`.tabs button[data-tab="${tab}"]`).click();
    await expect(page.locator(`#pane-${tab} .board`)).toBeVisible();
  }
  expect(errors).toEqual([]);
});
