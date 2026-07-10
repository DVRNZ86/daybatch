// Guard: reference/daybatch-v13.html is the behaviour contract (CLAUDE.md).
// It must remain in the repo — seed-identity e2e tests compare against it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("v13 reference file is present and intact", () => {
  const html = readFileSync(new URL("../../reference/daybatch-v13.html", import.meta.url), "utf8");
  assert.ok(html.includes("V13 · 5 GAMES"), "reference file should be the v13 build");
  assert.ok(html.includes("function mulberry32"), "reference file should contain game logic");
});
