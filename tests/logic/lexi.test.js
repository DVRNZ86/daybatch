// Lexi generator + dictionary: determinism, fixed-seed fixture, invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen, counts, canForm } from "../../src/games/lexi.js";
import { W3, W4, W5, W6, ALL } from "../../src/games/words.js";

test("dictionaries have the v13 word counts and lengths", () => {
  assert.equal(W3.length, 331);
  assert.equal(W4.length, 853);
  assert.equal(W5.length, 811);
  assert.equal(W6.length, 430);
  assert.equal(ALL.length, 331 + 853 + 811 + 430);
  for (const [list, len] of [[W3, 3], [W4, 4], [W5, 5], [W6, 6]])
    for (const w of list) assert.equal(w.length, len, `"${w}" in W${len}`);
});

test("counts/canForm letter accounting", () => {
  assert.deepEqual(counts("winner"), { w: 1, i: 1, n: 2, e: 1, r: 1 });
  assert.ok(canForm("inn", counts("winner")));
  assert.ok(canForm("winner", counts("winner")));
  assert.ok(!canForm("nnn", counts("winner")), "cannot use a letter more times than available");
  assert.ok(!canForm("wines", counts("winner")), "cannot use absent letters");
});

test("gen is deterministic for a given seed", () => {
  assert.deepEqual(gen(86420), gen(86420));
});

test("gen(12345) matches pinned fixture (seed contract)", () => {
  const p = gen(12345);
  assert.equal(p.seed, "winner");
  assert.equal(p.letters.join(""), "ewrnni");
  assert.deepEqual(p.targets, ["inn", "new", "win", "nine", "rein", "wine", "wire", "inner", "winner"]);
});

test("puzzle invariants hold across many seeds", () => {
  for (let s = 1; s <= 200; s++) {
    const p = gen(s * 65537 + 3);
    assert.ok(p, `puzzle generated (seed ${s})`);
    // wheel letters are a permutation of a real six-letter dictionary word
    assert.ok(W6.includes(p.seed), `seed word in W6 (seed ${s})`);
    assert.equal(p.letters.slice().sort().join(""), p.seed.split("").sort().join(""));
    // 7..16 targets, sorted by length then alphabetically, all formable, no dups
    assert.ok(p.targets.length >= 7 && p.targets.length <= 16, `target count (seed ${s})`);
    assert.equal(new Set(p.targets).size, p.targets.length);
    const base = counts(p.seed);
    const sorted = p.targets.slice().sort((a, b) => a.length - b.length || a.localeCompare(b));
    assert.deepEqual(p.targets, sorted, `targets sorted (seed ${s})`);
    for (const w of p.targets) {
      assert.ok(ALL.includes(w), `"${w}" in dictionary (seed ${s})`);
      assert.ok(canForm(w, base), `"${w}" formable (seed ${s})`);
      assert.ok(w.length >= 3 && w.length <= 6);
    }
    // the seed word itself is always a target (it is formable from itself)
    assert.ok(p.targets.includes(p.seed), `seed word among targets (seed ${s})`);
  }
});
