// Codebreak generator: determinism, fixed-seed fixtures, and code invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen, genRepeats, duplicateVerdict } from "../../src/games/codebreak.js";

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

test("tierFor maps guesses to the PLAN.md B2 contract", async () => {
  const { tierFor } = await import("../../src/games/codebreak.js");
  assert.equal(tierFor("win", 2), 1);
  assert.equal(tierFor("win", 4), 2);
  assert.equal(tierFor("win", 6), 3);
  assert.equal(tierFor("win", 8), 4);  // won late = completed
  assert.equal(tierFor("fail", 8), 4); // fail = completed, 5 pts
});

// ---- D1: Codebreak: Repeats (premium) ----

test("genRepeats is deterministic and allows duplicate symbols (7^5 code space)", () => {
  assert.deepEqual(genRepeats(555), genRepeats(555));
  let sawDuplicate = false;
  for (let s = 1; s <= 500; s++) {
    const code = genRepeats(s * 31337);
    assert.equal(code.length, 5, `length (seed ${s})`);
    for (const sym of code) assert.ok(sym >= 0 && sym <= 6, `symbol range (seed ${s})`);
    if (new Set(code).size < 5) sawDuplicate = true;
  }
  assert.ok(sawDuplicate, "500 seeds should produce at least one code with a repeated symbol");
});

test("duplicateVerdict: no duplicates in guess or code matches simple slot comparison", () => {
  assert.deepEqual(duplicateVerdict([0, 1, 2, 3, 4], [0, 1, 2, 3, 4]), ["green", "green", "green", "green", "green"]);
  assert.deepEqual(duplicateVerdict([1, 0, 2, 4, 3], [0, 1, 2, 3, 4]), ["amber", "amber", "green", "amber", "amber"]);
  assert.deepEqual(duplicateVerdict([5, 5, 5, 5, 5], [0, 1, 2, 3, 4]), ["grey", "grey", "grey", "grey", "grey"]);
});

test("duplicateVerdict: a guessed symbol can't out-count its occurrences in the code", () => {
  // code has ONE 0; guessing 0 three times should yield exactly one
  // green/amber for 0 and grey for the rest — never three matches.
  const code = [0, 1, 2, 3, 4];
  assert.deepEqual(duplicateVerdict([0, 0, 0, 1, 2], code), ["green", "grey", "grey", "amber", "amber"]);
});

test("duplicateVerdict: a code-side duplicate's green match doesn't add extra amber budget elsewhere", () => {
  // code has 0 twice (positions 0 and 2). Guess matches position 2 green
  // directly, leaving only position 0's 0 in the leftover pool — so only
  // ONE of the guess's other 0s can turn amber, the rest stay grey.
  const code = [0, 1, 0, 3, 4];
  assert.deepEqual(duplicateVerdict([1, 0, 0, 0, 0], code), ["amber", "amber", "green", "grey", "grey"]);
});
