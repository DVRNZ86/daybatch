// Dev-only support tool (D1). Resets a redemption code's device slots after
// a genuine "I lost my device" request, enforcing the FREE_RESET_CAP policy
// in daybatch-worker.js so a single purchase can't turn into unlimited
// friends via repeated support requests. Not part of the app, the Worker's
// deployed fetch() handler, or the test suite.
//
// Usage:
//   cd worker
//   node reset-code.mjs <code>            # first reset — always allowed
//   node reset-code.mjs <code> --force    # override the cap after judgment
import { execFileSync } from "node:child_process";
import { shouldAllowReset } from "./daybatch-worker.js";

const [, , code, flag] = process.argv;
if (!code) {
  console.error("Usage: node reset-code.mjs <code> [--force]");
  process.exit(1);
}
const force = flag === "--force";

function kv(args) {
  return execFileSync("npx", ["wrangler", "kv", ...args, "--binding", "CODES", "--remote"], {
    encoding: "utf8", cwd: new URL(".", import.meta.url).pathname
  }).trim();
}

let resetCount = 0;
try {
  resetCount = parseInt(kv(["key", "get", `resets:${code}`]), 10) || 0;
} catch (e) {
  // key doesn't exist yet: first-ever reset for this code, count stays 0
}

const decision = shouldAllowReset(resetCount, force);
if (!decision.allowed) {
  console.error("✘ " + decision.reason);
  process.exit(1);
}

kv(["key", "put", `resets:${code}`, String(resetCount + 1)]);
try {
  kv(["key", "delete", `redeem:${code}`]);
} catch (e) {
  // no active device list to clear (code never redeemed, or already empty) — fine
}

console.log(`✨ Reset ${code} — device slots cleared. (Reset #${resetCount + 1} for this code${force && resetCount >= 1 ? ", forced" : ""}.)`);
