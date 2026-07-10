# CLAUDE.md — Daybatch build instructions

You are working on **Daybatch** (https://daybatch.app), a five-game daily puzzle web app.
Repo: `DVRNZ86/daybatch`, branch `main`, deployed automatically by GitHub Pages.

## Read first, every session
1. `PLAN.md` — the phase contract. Identify the current phase before writing anything.
2. This file.
3. `IDEAS.md` — only to file new ideas, never to pull work from mid-phase.

## Non-negotiable rules
- **Work only within the current phase's scope.** If a task isn't in the phase's bullet list, it does not happen. New ideas (including your own) are appended to `IDEAS.md` with a one-line rationale, then dropped.
- **v13 behaviour is the reference.** The file `reference/daybatch-v13.html` (keep it in the repo, never served) defines correct game behaviour. Same date seed must produce identical puzzles. Any intentional behaviour change requires Darren's explicit approval in the session.
- **`main` must always deploy clean.** Never commit broken state to main. Work on a phase branch (`phase/B2`), merge only when the phase's acceptance criteria all pass.
- **Nothing merges red.** `npm test` (logic + Playwright) must be fully green before any merge.
- **Small commits, one concern each.** Commit messages: `B2: add storage schema versioning`.
- **No new dependencies** without asking. The app itself has zero runtime dependencies (native ES modules, no build step). Dev dependencies limited to: playwright, jsdom if needed for logic tests.
- **No frameworks, no bundlers, no TypeScript migration.** Plain JS modules. This is deliberate.

## Roles
Run this loop for every work unit:

**Builder (you, by default):** implement the next acceptance-criteria item for the current phase. Read the relevant v13 code in `reference/` before porting logic.

**Tester (subagent):** after each work unit — run `npm test`; write any missing tests that the phase's acceptance criteria imply; simulate touch gestures in Playwright for Tally/Lexi drag paths; report failures with minimal repro. Persistence tests must cover: reload mid-game, reload after completion, schema migration from previous version, day rollover across Pacific/Auckland midnight.

**Reviewer (subagent, end of phase only):** diff the whole phase branch against phase scope. Checklist: (1) every acceptance criterion demonstrably met, (2) zero scope creep, (3) no v13 behaviour drift (seed-identical puzzle check), (4) no dead code, (5) no console errors in Playwright run. Produce a short sign-off report for Darren.

## Definition of done (per phase)
1. All acceptance criteria in PLAN.md met, each with a corresponding passing test
2. Reviewer sign-off report produced
3. Footer version bumped (`v0.B<phase>.<n>`)
4. Darren has verified on his phone at daybatch.app after merge + deploy
5. Git tag `phase-B<n>` pushed

## Key technical anchors
- Seeds: `mulberry32(hashString(game + "-" + Y + "-" + M + "-" + D))` — device-local date, exactly as v13
- Puzzle number: `daysBetween(EPOCH, localDate) + 1` (EPOCH set in B3, constant thereafter)
- Batch Score: top tier 20 / second 15 / third 10 / completed 5 / unplayed 0, summed over five games
- Share card: Option 2 format per PLAN.md B3 — exact strings are contract, tested
- Timezone: all date logic in device-local time; tests must pin Pacific/Auckland cases
- Storage: single `daybatch:v<N>` localStorage root, JSON, migration function per version bump

## When uncertain
Stop and ask Darren. A wrong assumption baked into persistence or scoring is far more expensive than a question. Do not "helpfully" expand scope while waiting.
