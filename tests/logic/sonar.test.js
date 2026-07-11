// Sonar generator: determinism, fixed-seed fixture, and fleet invariants.
import test from "node:test";
import assert from "node:assert/strict";
import { gen } from "../../src/games/sonar.js";

const SN = 7;

test("gen is deterministic for a given seed", () => {
  const a = gen(24680), b = gen(24680);
  assert.deepEqual([...a.occ].sort(), [...b.occ].sort());
  assert.deepEqual(a.rowCounts, b.rowCounts);
  assert.deepEqual(a.colCounts, b.colCounts);
});

test("gen(12345) matches pinned fixture (seed contract)", () => {
  const p = gen(12345);
  assert.deepEqual([...p.occ].sort((x, y) => x - y), [10, 17, 20, 24, 27, 40, 41]);
  assert.deepEqual(p.rowCounts, [0, 1, 2, 2, 0, 2, 0]);
  assert.deepEqual(p.colCounts, [0, 0, 0, 3, 0, 1, 3]);
});

test("fleet invariants hold across many seeds", () => {
  for (let s = 1; s <= 300; s++) {
    const p = gen(s * 104729 + 17);
    // exactly 7 occupied cells (3+2+2) and counts reconcile
    assert.equal(p.occ.size, 7, `7 cells (seed ${s})`);
    assert.equal(p.total, 7);
    assert.equal(p.rowCounts.reduce((a, b) => a + b, 0), 7);
    assert.equal(p.colCounts.reduce((a, b) => a + b, 0), 7);
    for (let r = 0; r < SN; r++)
      assert.equal(p.rowCounts[r], [...p.occ].filter(i => Math.floor(i / SN) === r).length);
    for (let c = 0; c < SN; c++)
      assert.equal(p.colCounts[c], [...p.occ].filter(i => i % SN === c).length);
    // ships decompose into straight runs of lengths {3,2,2} that never touch,
    // not even diagonally: every occupied cell's 8-neighbourhood only contains
    // cells of its own ship. Find connected components via 4-adjacency.
    const cells = new Set(p.occ);
    const comps = [];
    const visited = new Set();
    for (const start of cells) {
      if (visited.has(start)) continue;
      const comp = [], q = [start];
      visited.add(start);
      while (q.length) {
        const i = q.pop();
        comp.push(i);
        const r = Math.floor(i / SN), c = i % SN;
        for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ar = r + dr, ac = c + dc;
          if (ar < 0 || ar >= SN || ac < 0 || ac >= SN) continue;
          const k = ar * SN + ac;
          if (cells.has(k) && !visited.has(k)) { visited.add(k); q.push(k); }
        }
      }
      comps.push(comp);
    }
    assert.deepEqual(comps.map(c => c.length).sort(), [2, 2, 3], `fleet shape (seed ${s})`);
    // each component is a straight line
    for (const comp of comps) {
      const rows = new Set(comp.map(i => Math.floor(i / SN)));
      const cols = new Set(comp.map(i => i % SN));
      assert.ok(rows.size === 1 || cols.size === 1, `straight ship (seed ${s})`);
    }
    // no diagonal contact between different components
    const compOf = new Map();
    comps.forEach((comp, ci) => comp.forEach(i => compOf.set(i, ci)));
    for (const i of cells) {
      const r = Math.floor(i / SN), c = i % SN;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const ar = r + dr, ac = c + dc;
        if (ar < 0 || ar >= SN || ac < 0 || ac >= SN) continue;
        const k = ar * SN + ac;
        if (cells.has(k))
          assert.equal(compOf.get(k), compOf.get(i), `ships never touch (seed ${s})`);
      }
    }
  }
});

test("tierFor maps pings to the PLAN.md B2 contract", async () => {
  const { tierFor } = await import("../../src/games/sonar.js");
  assert.equal(tierFor(7), 1);
  assert.equal(tierFor(9), 2);
  assert.equal(tierFor(12), 3);
  assert.equal(tierFor(13), 4);
});
