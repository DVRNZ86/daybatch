// Unified share card builder + clipboard/WebShare (B3).
// String formats here are CONTRACT (PLAN.md B3 + decisions table) and are
// exact-match tested. Change nothing without amending PLAN.md.
import { puzzleNumber } from "./rng.js";
import { dayScore, batchStreak } from "./streaks.js";

export const SITE_URL = "https://daybatch.app";

const META = [
  ["tally", "🧮", "Tally"],
  ["crossing", "🧭", "Crossing"],
  ["sonar", "📡", "Sonar"],
  ["codebreak", "🔐", "Codebreak"],
  ["lexi", "🔤", "Lexi"]
];

// Per-game result text per the PLAN.md B3 share-line table.
export function lineText(game, r) {
  if (!r) return "not played";
  const m = r.metrics || {};
  switch (game) {
    case "tally":
      return r.tier === 1 ? "Perfect ⛳" : r.tier === 2 ? "Best path ⛳" : `Solved (+${m.moves - m.par})`;
    case "crossing":
      return r.tier === 1 ? "Flawless" : r.tier === 2 ? "Made it" : r.tier === 3 ? "By a whisker" : "Blown up 💥";
    case "sonar":
      return r.tier === 1 ? "Perfect 🏆" : `${m.pings} pings`;
    case "codebreak":
      return m.win ? `${m.guesses}/8` : "X/8";
    case "lexi":
      return m.hints === 0 ? "No hints" : `${m.hints} hint${m.hints === 1 ? "" : "s"}`;
  }
}

export function gameLine(game, r) {
  const [, emoji, name] = META.find(x => x[0] === game);
  return `${emoji} ${name} — ${lineText(game, r)}`;
}

function parseKey(k) { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); }

// The unified Batch card (Option 2, line-per-game). Exact-format contract.
export function batchCard(history, dateKey) {
  const n = puzzleNumber(parseKey(dateKey));
  const score = dayScore(history, dateKey);
  const streak = batchStreak(history, dateKey);
  const recs = history.filter(r => r.date === dateKey);
  const lines = META.map(([g]) => gameLine(g, recs.find(r => r.game === g) || null));
  return `DAYBATCH #${n} · ${score}/100${streak >= 1 ? ` 🔥${streak}` : ""}\n${lines.join("\n")}\n${SITE_URL}`;
}

// Web Share with url field (B3 link-footer decision) when available,
// clipboard otherwise. Returns "shared" | "copied" | "failed" for button UX.
export async function shareText(text) {
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ text, url: SITE_URL });
      return "shared";
    }
    await navigator.clipboard.writeText(text);
    return "copied";
  } catch (e) {
    return "failed";
  }
}
