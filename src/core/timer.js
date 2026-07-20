// D1: Timed mode (premium) — a tiny stopwatch shared by all 5 games. Ticks
// via setInterval calling back with elapsed ms; stop() returns the final
// elapsed time and clears the interval so re-renders never leak timers.
export function createStopwatch() {
  let startedAt = null, handle = null, frozen = null;
  return {
    start(onTick) {
      startedAt = Date.now(); frozen = null;
      if (handle) clearInterval(handle);
      handle = setInterval(() => onTick(Date.now() - startedAt), 100);
      // Node (logic tests, no game ever actually runs there) must not have
      // this interval keep the process alive; browsers lack unref() so this
      // is a no-op there.
      if (handle.unref) handle.unref();
    },
    // Freezes the reading: elapsed() keeps returning this same value (rather
    // than drifting forward with real time) until the next start().
    stop() {
      if (handle) { clearInterval(handle); handle = null; }
      frozen = startedAt !== null ? Date.now() - startedAt : 0;
      return frozen;
    },
    elapsed() {
      if (frozen !== null) return frozen;
      return startedAt !== null ? Date.now() - startedAt : 0;
    }
  };
}

export function formatMs(ms) {
  const s = Math.floor(ms / 1000), m = Math.floor(s / 60), rem = s % 60, tenths = Math.floor((ms % 1000) / 100);
  return m + ":" + String(rem).padStart(2, "0") + "." + tenths;
}
