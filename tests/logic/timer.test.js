// D1: shared stopwatch for Timed mode (premium).
import test from "node:test";
import assert from "node:assert/strict";
import { createStopwatch, formatMs } from "../../src/core/timer.js";

test("formatMs renders m:ss.t", () => {
  assert.equal(formatMs(0), "0:00.0");
  assert.equal(formatMs(500), "0:00.5");
  assert.equal(formatMs(1000), "0:01.0");
  assert.equal(formatMs(65432), "1:05.4");
  assert.equal(formatMs(600000), "10:00.0");
});

test("stopwatch.elapsed() tracks time since start(), and freezes at stop()'s value", () => {
  const RealDate = Date;
  let now = 1_000_000;
  global.Date = class extends RealDate { static now() { return now; } };
  try {
    const sw = createStopwatch();
    sw.start(() => {});
    now += 2500;
    assert.equal(sw.elapsed(), 2500);
    now += 1000;
    assert.equal(sw.stop(), 3500);
    // elapsed() must keep returning the frozen stop() value even as real
    // time keeps passing — a later result() read must not drift.
    now += 1000;
    assert.equal(sw.elapsed(), 3500);
  } finally {
    global.Date = RealDate;
  }
});

test("a new start() unfreezes the stopwatch", () => {
  const RealDate = Date;
  let now = 1_000_000;
  global.Date = class extends RealDate { static now() { return now; } };
  try {
    const sw = createStopwatch();
    sw.start(() => {});
    now += 1000;
    sw.stop();
    sw.start(() => {});
    now += 400;
    assert.equal(sw.elapsed(), 400);
    sw.stop();
  } finally {
    global.Date = RealDate;
  }
});

test("stopwatch.elapsed() is 0 before start()", () => {
  assert.equal(createStopwatch().elapsed(), 0);
});
