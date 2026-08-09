// Lexi generator + dictionary: determinism, fixed-seed fixture, invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen, counts, canForm, isBonusWord } from "../../src/games/lexi.js";
import { W3, W4, W5, W6, ALL, BONUS } from "../../src/games/words.js";

// APPROVED DEVIATION (PLAN.md B6, Darren, 9 Aug 2026): W4/W5/W6 were deliberately expanded
// (public-domain ENABLE1 ∩ Wiktionary-frequency "popular" subset, profanity-filtered) so far more
// unique daily puzzles qualify — W6 alone went from v13's 430 words (222 puzzle-eligible) to 4055
// (1857 eligible). W3 is untouched (left as v13's curated 331 — expansion there was skippable
// noise, see the B6 build notes). This test now pins the B6 counts, not v13's original ones.
test("dictionaries have the B6 word counts and lengths", () => {
  assert.equal(W3.length, 331);
  assert.equal(W4.length, 1981);
  assert.equal(W5.length, 3074);
  assert.equal(W6.length, 4055);
  assert.equal(ALL.length, W3.length + W4.length + W5.length + W6.length);
  for (const [list, len] of [[W3, 3], [W4, 4], [W5, 5], [W6, 6]])
    for (const w of list) assert.equal(w.length, len, `"${w}" in W${len}`);
  // BONUS is the broad validation dictionary (3-6 letters) — a superset used only for
  // "is this a real word" bonus credit, never for target selection.
  assert.ok(BONUS.length > 15000, "BONUS dictionary is a large validation set");
  for (const w of BONUS) assert.ok(w.length >= 3 && w.length <= 6, `"${w}" in valid BONUS length range`);
});

test("isBonusWord recognizes real words beyond the curated target dictionary, rejects gibberish", () => {
  assert.ok(isBonusWord("teen"), "previously-rejected real word (Darren's playtest) now recognized");
  assert.ok(isBonusWord("centre"), "British spelling now recognized");
  assert.ok(isBonusWord("center"), "US spelling still recognized");
  assert.ok(!isBonusWord("zzqx"), "not a word");
  assert.ok(!isBonusWord(""), "empty string is not a word");
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

// APPROVED DEVIATION (PLAN.md B6, Darren, 9 Aug 2026): gen()'s seed→puzzle mapping intentionally
// changed alongside the dictionary expansion above — this pins the new B6 output for seed 12345,
// not v13's original fixture. gen() is still fully deterministic per seed (see the next test);
// what changed is which puzzle a given numeric seed resolves to, a one-time consequence of growing
// the word pool. Already-persisted games are protected from this regardless (see lexi.js persist()/
// openDaily()/viewHistoryDate() — targets are now saved explicitly, never re-derived from a live
// gen() call on reload, so a future dictionary change can't retroactively corrupt saved state).
test("gen(12345) matches pinned fixture (B6 seed contract)", () => {
  const p = gen(12345);
  assert.equal(p.seed, "wiener");
  assert.equal(p.letters.join(""), "ewrnei");
  assert.deepEqual(p.targets, ["new", "win", "rein", "weir", "were", "wine", "wire", "renew", "weiner", "wiener"]);
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

test("tierFor maps hints to the PLAN.md B2 contract", async () => {
  const { tierFor } = await import("../../src/games/lexi.js");
  assert.equal(tierFor(0), 1);
  assert.equal(tierFor(2), 2);
  assert.equal(tierFor(3), 3);
  assert.equal(tierFor(9), 3);
});
