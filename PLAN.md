# DAYBATCH — Stage B Production Scaffold Plan

**Version:** 1.1 · **Date:** 10 July 2026 · **Status: APPROVED — ready for Claude Code**
**Execution:** Claude Code on Mac, phased, builder/tester/reviewer agent workflow
**Live target:** https://daybatch.app (GitHub Pages, repo `DVRNZ86/daybatch`, branch `main`)

---

## Ground rules (binding)

1. Plan agreed before any code — this document is the contract
2. Controlled phases; each ends with tests green and a verified deploy
3. **No mid-phase scope changes.** New ideas → `IDEAS.md`, considered between phases
4. `main` is always deployable; daybatch.app must never break
5. v13 gameplay is reference behaviour — Stage B builds around the games, never redesigns them

---

## Approved architecture decisions

- **A1 — Multi-file static site, native ES modules, zero build step.** Plain files on Pages, `<script type="module">`. No bundler, no framework.
- **A2 — localStorage via versioned `storage.js` wrapper** (JSON, schema version, migration hook). IndexedDB deferred to Stage D if the archive needs it.
- **A3 — Game logic ported from v13 unchanged.** Same generation, same rules, same seeds → same puzzles.
- **A4 — Tests: Node logic harness (`tests/logic/`) + Playwright browser/gesture tests (`tests/e2e/`),** both under `npm test`. Nothing ships red.
- **A5 — Versioning:** footer `v0.B<phase>.<n>`; git tag per completed phase.
- **A6 — Puzzle number:** `#N = daysBetween(EPOCH, deviceLocalDate) + 1`. EPOCH is set at B3 ship date and never changes.
- **A7 — Day rollover: device-local midnight for everything** (puzzle seed uses device-local date; streaks judged in device-local time). Wordle convention: same puzzle number worldwide, staggered by timezone. NZ gets its batch at NZ midnight.
- **A8 — Monetization readiness, non-building (Darren, 12 Jul 2026).** Stage B ships zero monetization (see "Out of Stage B" below) — but every phase must preserve the seams a later stage needs, without building the feature now:
  1. `storage.js`'s schema stays additive-extensible (A2). A future `premium`/`entitlements` field must slot in with zero migration, same as any other schema-1 addition.
  2. The `isDaily`-style boolean pattern in game modules (daily vs. practice) stays generalizable to a third variant — e.g. a premium hard-mode — rather than hardcoded to two states. Don't refactor for this now; just don't paint it into a corner.
  3. No phase adds a backend, accounts, or payment SDK without Darren's explicit sign-off — this is the existing no-new-dependencies rule, restated because monetization is the most likely reason someone reaches for one.
  4. B4's install-hint UI is the natural future home for a support/unlock prompt. Noted for B4's builder, not built in B4.
  5. **Decided (Darren, 12 Jul 2026): stay web-only (PWA + Stripe) deliberately, to prove traction before investing in a native wrap.** Not a permanent choice — revisit going native (Capacitor, App/Play Store IAP) only once web/PWA traction justifies the engineering cost (see IDEAS.md).
  The actual monetization model and go-to-market plan is a dedicated discussion after B4/B5 ship — see IDEAS.md Stage D.
- **A9 — Monetization architecture (Darren, 12 Jul 2026).** Supersedes A8's "non-building" stance with an actual buildable design for Stage D:
  1. Three tiers, all via Stripe (no custom checkout UI): **$2/month**, **$20/year** (recurring subscriptions), **$30 one-time** (lifetime).
  2. **No accounts, no login.** Entitlement via a redemption code, not identity.
  3. **Lifetime code:** a signed token (HMAC of the Stripe payment ID + a server-held secret), verified once by one serverless function. Once valid, `premium:true` caches locally forever — no further network needed, consistent with the app's offline-first model.
  4. **Subscription codes:** represent a live Stripe subscription; the same function re-verifies against Stripe's subscription status periodically (weekly) rather than once. Local cache tolerates ~2 weeks offline before requiring re-verification, so a brief connectivity gap doesn't lock anyone out mid-play.
  5. **Redemption cap: 2** activations per code (devices, for lifetime; concurrent, for subscriptions) — stops public sharing without needing accounts or real DRM.
  6. **New dependency, explicitly approved here:** one serverless function (e.g. Cloudflare Worker) + Stripe webhook integration. This is the one deliberate exception to A1's zero-runtime-dependency rule — scoped to payment verification only.
  7. Gated from day 1 — no free trial window.

---

## Repo structure (end state)

```
daybatch/
├── index.html              # shell: header, tabs, panes, modals
├── manifest.webmanifest
├── sw.js                   # service worker (offline cache, versioned)
├── icons/                  # 192/512 + maskable + favicon
├── src/
│   ├── main.js             # boot, tab router, lazy init, rollover watcher
│   ├── core/
│   │   ├── rng.js          # mulberry32, hashString, dailySeed, puzzleNumber
│   │   ├── storage.js      # versioned localStorage wrapper
│   │   ├── streaks.js      # streaks + Batch Score
│   │   ├── share.js        # share card builder + clipboard/WebShare
│   │   └── ui.js           # stats row, modals, confetti, help
│   ├── games/
│   │   ├── tally.js  crossing.js  sonar.js  codebreak.js  lexi.js  words.js
│   └── styles.css
├── tests/
│   ├── logic/              # generators, scoring, streak/date math
│   └── e2e/                # Playwright: full rounds, touch gestures, persistence
├── CLAUDE.md               # agent instructions
├── PLAN.md                 # this document
└── IDEAS.md                # parking lot (pre-seeded, see below)
```

---

## Phases

### B1 — Modularise (no new features)
Port v13 into the structure above, behaviour-identical.
**Accept:** five games playable at daybatch.app; same date → same puzzles as v13; logic tests ported, green; no console errors.

### B2 — Persistence + day rollover
- `storage.js`; per-game per-date state snapshots (reload mid-game → same board, same progress)
- Completed results stored as history records `{date, game, tier, metrics}`
- **Rollover watcher:** on `visibilitychange`/focus, compare stored puzzle date vs device-local today; if rolled over, prompt "New batch is ready 🌅" → fresh dailies (never silently reset a live game)
**Accept:** reload restores all five games mid-play; finished game shows result bar on reload, not a fresh puzzle; rollover fires correctly across a simulated midnight (incl. NZ tz test); schema versioned with migration test.

**B2 decisions (Darren, 11 Jul 2026):**
- **Tier contract** — recorded per completion as `tier` 1–4 and used by B3 scoring (20/15/10/5):

| Tier | Crossing | Sonar | Codebreak | Tally | Lexi |
|---|---|---|---|---|---|
| 1 top | Flawless (3❤️) | 7 pings | ≤2 guesses | par & 1st try ⛳ | 0 hints |
| 2 | 2❤️ | ≤9 pings | ≤4 guesses | par, >1 try | ≤2 hints |
| 3 | 1❤️ | ≤12 pings | ≤6 guesses | over par | 3+ hints |
| 4 completed | fail | >12 pings | 7–8 or fail | — | — |

- **Fail = completed (5 pts):** a played loss (Crossing blown up, Codebreak locked out) records tier 4, never 0.
- Only daily games persist; practice rounds are ephemeral.
- "Today's" resumes the persisted daily in progress (fresh load only if no snapshot) — persistence-era refinement of v13's reset behaviour.
- First completion of a game+date stands in history; replays of a finished daily don't overwrite it.

### B3 — Streaks + Batch Report + unified share
- **Batch Score /100:** per game — top tier 20 · second tier 15 · third tier 10 · completed 5 · unplayed 0
- Streaks: batch streak (≥1 game/day) with 🔥 in header; perfect-batch tracked
- **Batch Report card** appears once ≥1 game done: score, per-game lines, streak
- **Unified share card — approved format (Option 2, line-per-game):**
```
DAYBATCH #14 · 85/100 🔥7
🧮 Tally — Best path ⛳
🧭 Crossing — Flawless
📡 Sonar — Perfect 🏆
🔐 Codebreak — 4/8
🔤 Lexi — No hints
https://daybatch.app
```
(unplayed games show `— not played`; per-game share cards remain, gaining the same link footer line)
- **Link footer (Darren, 11 Jul 2026): the address must arrive as a tappable link, not plain decoration.** Footer line is the full URL `https://daybatch.app` (the scheme makes receiving apps auto-link it reliably); when sharing via the Web Share API, also pass `url: "https://daybatch.app"` so share targets render a proper link preview. Applies to the unified card and every per-game card. *(v0.B3.2 refinement, from Darren's phone test: share targets concatenate text+url, doubling the link — on the WebShare path the footer is stripped from the text and the `url` field alone carries it; the clipboard path keeps the footer line.)*
**Accept:** score math unit-tested for all tier combos; streak math tested across date boundaries incl. Pacific/Auckland; share card renders, copies, and Web-Shares on mobile with the tappable link footer; EPOCH constant set and documented.

**B3 decisions (Darren, 11 Jul 2026):**
- **EPOCH = 10 September 2026 (device-local), a fixed future launch date** (amends A6's "ship date" wording; Darren, 11 Jul 2026). `puzzleNumber = daysBetween(EPOCH, localDate) + 1`; the 10 Sep 2026 batch is #1. Permanent.
- **Countdown pre-launch:** before EPOCH the header/report/share display `#−N` (days until launch; `#−1` on 9 Sep, never `#0`), and the report + unified share card carry the note line `Official scoring starts 10 Sep 2026` (exact string, contract). Everything works during the countdown — scores, streaks, history — and **carries over at launch unchanged** (no reset).
- **Perfect batch = all five games completed that day** (any tiers); tracked alongside the batch streak.
- **Batch Report card renders below the active game pane** once ≥1 daily is completed.
- **Daily Crossing loses its Retry button** (practice keeps it). Mid-game retry erased attempts without record, making flawless tiers farmable once scoring exists. Approved v13 deviation.
- **Per-game share-line table (contract; N = the relevant metric):**

| Game | Tier 1 | Tier 2 | Tier 3 | Tier 4 | Unplayed |
|---|---|---|---|---|---|
| 🧮 Tally | `Perfect ⛳` | `Best path ⛳` | `Solved (+N)` | — | `— not played` |
| 🧭 Crossing | `Flawless` | `Made it` | `By a whisker` | `Blown up 💥` | `— not played` |
| 📡 Sonar | `Perfect 🏆` | `N pings` | `N pings` | `N pings` | `— not played` |
| 🔐 Codebreak | `N/8` | `N/8` | `N/8` | `N/8` win · `X/8` fail | `— not played` |
| 🔤 Lexi | `No hints` | `N hints` | `N hints` | — | `— not played` |

- 🔥n appears in the card header whenever the batch streak ≥ 1.
- The sample card's `85/100` was illustrative; its five lines score 90 under the approved tier table. Format is contract; arithmetic follows the tier table.

### B4 — PWA
Manifest, icons, standalone display, theme colour; service worker cache-first shell with versioned cache-busting; iOS meta tags; one-time subtle install hint.
**Accept:** installs with proper icon/splash; full airplane-mode launch; new deploy reaches clients within one revisit; Lighthouse PWA green.

### B5 — Polish & first-run
One-screen onboarding ("Five puzzles. Every day. That's it."); **stats screen (history, records) and yesterday's solutions are premium-gated (see D1) — build against the real entitlement flag, not a placeholder, since D1 now ships first**; settings (haptics, colour-blind check); footer version + social handles.
**Accept:** first-run flow tested; stats reconcile with stored history; gated screens correctly locked for free users and unlocked for premium; no breakage at 320px width.

---

## Stage D

**Build order (Darren, 12 Jul 2026): D1 ships before B5.** B5's history/stats/yesterday's-solutions screens are premium-gated, so the entitlement flag needs to exist before that UI is built, not retrofitted after.

### D1 — Monetization core
Redemption-code entitlement system (Stripe + one serverless verify function, no accounts) per A9. **Free tier, permanent: play all five dailies, share the daily result. Everything else is premium:** timed mode across all five games; Crossing endless mode (Endless Crossing); Codebreak repeated-symbols mode (Codebreak: Repeats); premium-only hints on Sonar and Codebreak; **viewing puzzle history/past results (the existing `getHistory()` record) and yesterday's solutions**; **archive access** — a date-picker letting premium users pick any past date and play it as a practice session (puzzles are pure `hash(game+date)` generation, so any past date regenerates on demand at zero storage cost — needs `dailySeed()` generalized to accept an explicit date instead of always `new Date()`). Archive/replay sessions never touch `history` or streaks, same as any other practice session.
**Accept:** purchase→code→redeem works for all three price tiers; lifetime code verifies once then works fully offline; subscription code re-verifies on schedule and correctly revokes on cancellation (with grace-period tolerance); redemption cap of 2 enforced; all gated features (including history/archive) correctly locked/unlocked; archive date-picker generates any past date's puzzle correctly (seed-identity holds for historical dates too); archive play never mutates history/streaks; zero accounts or login UI anywhere in the app.

---

## IDEAS.md — pre-seeded (Stage D candidates, premium hard modes)

- **Endless Crossing:** continuous boards until lives exhausted; score = longest run; personal best tracked. Premium mode.
- **Codebreak: Repeats:** symbols may repeat (16,807 codes), 10 guesses; duplicate-letter Wordle verdict rules. Premium hard mode.
- (Everything else lands here as it arises. Nothing exits mid-phase.)

**Out of Stage B:** accounts, payments, premium tier, archive, telemetry, Capacitor, leaderboards, game six.

---

## Agent workflow

- **Builder:** implements current phase only; reads PLAN.md first; small single-concern commits.
- **Tester:** runs `npm test` after each work unit; writes missing tests for acceptance criteria; reports failures to builder. Nothing merges red.
- **Reviewer (end of phase):** diffs against phase scope; flags scope creep, dead code, v13 behaviour drift; walks the acceptance list item by item.

Loop per phase: Darren opens Claude Code → "Phase Bn per PLAN.md" → builder/tester iterate → reviewer sign-off → Darren approves, tags, pushes → Pages deploys → phone verification at daybatch.app → next phase.
