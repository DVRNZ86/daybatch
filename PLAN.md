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
- **Link footer (Darren, 11 Jul 2026): the address must arrive as a tappable link, not plain decoration.** Footer line is the full URL `https://daybatch.app` (the scheme makes receiving apps auto-link it reliably); when sharing via the Web Share API, also pass `url: "https://daybatch.app"` so share targets render a proper link preview. Applies to the unified card and every per-game card.
**Accept:** score math unit-tested for all tier combos; streak math tested across date boundaries incl. Pacific/Auckland; share card renders, copies, and Web-Shares on mobile with the tappable link footer; EPOCH constant set and documented.

### B4 — PWA
Manifest, icons, standalone display, theme colour; service worker cache-first shell with versioned cache-busting; iOS meta tags; one-time subtle install hint.
**Accept:** installs with proper icon/splash; full airplane-mode launch; new deploy reaches clients within one revisit; Lighthouse PWA green.

### B5 — Polish & first-run
One-screen onboarding ("Five puzzles. Every day. That's it."); stats screen (history, records); yesterday's solutions; settings (haptics, colour-blind check); footer version + social handles.
**Accept:** first-run flow tested; stats reconcile with stored history; no breakage at 320px width.

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
