// Codebreak generator: determinism, fixed-seed fixtures, and code invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen } from "../../src/games/codebreak.js";

test("gen is deterministic for a given seed", () => {
  assert.deepEqual(gen(555), gen(555));
});

test("fixed seeds match pinned fixtures (seed contract)", () => {
  assert.deepEqual(gen(12345), [4, 0, 5, 3, 2]);
  assert.deepEqual(gen(777), [2, 3, 1, 6, 5]);
});

test("code is always 5 distinct symbols from the 7 available", () => {
  for (let s = 1; s <= 500; s++) {
    const code = gen(s * 31337);
    assert.equal(code.length, 5, `length (seed ${s})`);
    assert.equal(new Set(code).size, 5, `no repeats (seed ${s})`);
    for (const sym of code) assert.ok(sym >= 0 && sym <= 6, `symbol range (seed ${s})`);
  }
});
