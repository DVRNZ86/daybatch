# IDEAS.md — parking lot

New ideas land here with a one-line rationale. Nothing exits mid-phase; entries are considered between phases only.

## Pre-seeded (Stage D candidates, premium hard modes)

- **Endless Crossing** — continuous boards until lives exhausted; score = longest run; personal best tracked. Rationale: natural "one more go" premium mode built from existing Crossing logic.
- **Codebreak: Repeats** — symbols may repeat (16,807 codes), 10 guesses; duplicate-letter Wordle verdict rules. Rationale: proven hard-mode formula, big difficulty jump with minimal new UI.

## Filed during Stage B

- **UI modernisation pass (B5 candidate)** — depth via layered shadows, springy tap micro-interactions, actually load Space Grotesk/IBM Plex Mono (CSS names them but never loads them), dark mode, richer tab chips. Rationale: current look is v13-faithful by contract; a deliberate polish pass fits B5's scope. (Filed 11 Jul 2026 from Darren's feedback.)
- **Crossing difficulty tuning** — on ~13% of seeds (measured over 2,000) the first tap's zero-cascade reveals a safe corridor to the flag, making the round a deduction-free walk; on other days it plays as intended. Levers: cap cascade reach, bias trap layout so the goal row stays hidden, tune the 34% trap density. Changes generation → breaks same-date-same-puzzle, so it needs its own approved phase and a fresh seed contract. (Filed 11 Jul 2026 from Darren's playtest.)
- **Lexi content depth** — only 222 of the 430 six-letter dictionary words qualify as puzzles (7–16 targets), and the daily hash can repeat one at any time. Two levers: expand the 6-letter dictionary (every qualifying addition = a new puzzle) and/or add no-repeat daily scheduling once history storage exists (B2+). Rationale: ~7 months of unique dailies is thin if the game gets traction. (Filed 11 Jul 2026.)
