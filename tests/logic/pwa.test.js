// B4 PWA contract tests: manifest validity, sw.js↔index.html version lock,
// and precache completeness. These read the shipped files directly so a
// forgotten VERSION bump or shell entry fails the suite, not the field.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../..", import.meta.url));

test("manifest.webmanifest is valid JSON with the B4-agreed fields", async () => {
  const m = JSON.parse(await readFile(ROOT + "manifest.webmanifest", "utf8"));
  assert.equal(m.name, "Daybatch");
  assert.equal(m.short_name, "Daybatch");
  assert.equal(m.start_url, "/");
  assert.equal(m.scope, "/");
  assert.equal(m.display, "standalone");
  assert.equal(m.background_color, "#EDF1F6");
  assert.equal(m.theme_color, "#EDF1F6"); // Darren: paper, 12 Jul 2026
  assert.equal(
    m.description,
    "Bite-size daily puzzles — logic, words, and deduction in one fresh batch. Same puzzles for everyone, new batch at midnight. daybatch.app"
  );
  const sizes = m.icons.map((i) => i.sizes + (i.purpose ? ":" + i.purpose : ""));
  assert.deepEqual(sizes, ["192x192", "512x512", "512x512:maskable"]);
  for (const i of m.icons) {
    assert.equal(i.type, "image/png");
    assert.ok((await stat(ROOT + i.src)).size > 0, i.src + " must exist");
  }
});

test("iOS metas and icon links are present in index.html", async () => {
  const html = await readFile(ROOT + "index.html", "utf8");
  for (const needle of [
    '<link rel="manifest" href="manifest.webmanifest">',
    '<meta name="theme-color" content="#EDF1F6">',
    '<meta name="apple-mobile-web-app-capable" content="yes">',
    '<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">',
  ]) assert.ok(html.includes(needle), "missing: " + needle);
  assert.ok((await stat(ROOT + "icons/apple-touch-icon.png")).size > 0);
});

test("sw.js VERSION matches the index.html footer version", async () => {
  const sw = await readFile(ROOT + "sw.js", "utf8");
  const html = await readFile(ROOT + "index.html", "utf8");
  const swVer = sw.match(/const VERSION = "([^"]+)"/)?.[1];
  const footVer = html.match(/class="ver">([^\s<·]+)/)?.[1];
  assert.ok(swVer, "sw.js must define const VERSION");
  assert.ok(footVer, "index.html must show a footer version");
  assert.equal(swVer, footVer, "bump BOTH on every deploy or clients keep the old shell");
});

test("sw.js precaches the entire shell and never the reference or tests", async () => {
  const sw = await readFile(ROOT + "sw.js", "utf8");
  const shellSrc = sw.match(/const SHELL = \[([\s\S]*?)\];/)[1];
  const shell = [...shellSrc.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]);
  // every src/ module and stylesheet must be in the shell list
  for (const dir of ["src", "src/core", "src/games"]) {
    for (const f of await readdir(ROOT + dir)) {
      if (f.endsWith(".js") || f.endsWith(".css")) {
        assert.ok(shell.includes("/" + dir + "/" + f), "/" + dir + "/" + f + " missing from SHELL");
      }
    }
  }
  for (const must of ["/", "/index.html", "/manifest.webmanifest"]) {
    assert.ok(shell.includes(must), must + " missing from SHELL");
  }
  assert.ok(!shell.some((p) => p.startsWith("/reference/")), "reference/ must never be precached");
  assert.ok(!shell.some((p) => p.startsWith("/tests/")), "tests/ must never be precached");
});
