# Implementation notes

Working notes for whoever continues this build (a person or an agent). Kept short on purpose:
decisions and their reasons, the state of the work, and what is left.

## What this is

Stepwise: a local web app for practicing beginner Python. Requirements are in the original
request (ten sections); the summary of the decisions taken from it:

- **Real Python, in the browser.** Pyodide 314.0.7 (CPython 3.14.2 as WebAssembly) in a module
  Web Worker. No native runner: the server only hands out static files, and learner code is
  confined to the browser's worker sandbox.
- **Fresh state.** Every run and every test executes in a brand-new namespace
  (`src/python/harness.py`, `execute`).
- **Stopping.** The page shares a buffer with the worker; writing SIGINT raises
  `KeyboardInterrupt` in the running program, so output and variables survive. If that fails
  within the grace period, or the browser has no shared buffers, the worker is discarded and a
  new interpreter started (`src/python/runtime.ts`). Needs COOP/COEP headers, set in
  `build/headers.mjs` for both the dev server and `server.mjs`.
- **One checker.** `src/python/engine.ts` + `harness.py` are used by the worker and by the
  Vitest suite (Pyodide under Node), so tests exercise the same grading code as the app.
- **Content is data.** YAML under `content/`, read and validated by `build/content-plugin.ts`
  (`src/content/validate.ts`), exposed as `virtual:stepwise-content`. See
  `docs/authoring-guide.md`.
- **No AI, no network.** A Content-Security-Policy on the app server restricts the page to its
  own origin. Help beyond prepared content goes through "Copy context for help".
- **State** lives in the browser's localStorage, with versioned export/import.

## Stack

Vite 8, TypeScript 6 (strict), Preact 10 (JSX through tsconfig, no plugin), CodeMirror 6,
Vitest 5, Playwright 1.63, `yaml`. Fonts: Atkinson Hyperlegible Next and Mono, bundled.
Ports: app 4477, dev 4478, browser tests 4479 (`build/headers.mjs`).

## Environment quirks found while building

- This machine has guard hooks (agent-library). They block editing an existing
  `tsconfig.json`, `vitest.config.ts`, `playwright.config.ts`, and the check scripts in
  `package.json`; and Bash commands whose text contains a JS block-comment opener are
  rejected by a path guard. Use the Write/Edit tools for file content, not shell heredocs.
- No system browser. `scripts/setup-e2e.sh` installs Playwright's headless Chromium inside
  `node_modules` and unpacks two missing libraries (libnss3, libnspr4) into `.local/`
  without root.
- The sibling folder `../codexPyPage` belongs to a different run. Leave it alone.

## Content plan

Skills (ids): assignment, positions, loops, conditions, accumulators, append.

Exercises: assign-snapshot, assign-saved-length, assign-update-score, assign-swap,
assign-two-purchases · positions-read-values, positions-length-and-last, positions-last-item,
positions-first-and-last, positions-neighbors · loops-count-rounds, loops-missing-step,
loops-one-too-far, loops-two-counters, loops-countdown · conditions-separate-ifs,
conditions-not-keeps-value, conditions-inside-range, conditions-grade-order,
conditions-status-category · accumulators-replace-or-add, accumulators-add-up,
accumulators-product-start, accumulators-count-failed · append-order, append-receiver,
append-add-shipping, append-numbered-labels.

Challenges and follow-ups: copy-list (copy-list-backwards) · repeat-list, LeetCode 1929
(repeat-each-item, grow-list-in-place) · running-totals, LeetCode 1480 (running-products,
failed-so-far) · count-matching (count-three-groups) · values-in-range (positions-in-range) ·
greatest-value (first-greatest-position, count-greatest).

LeetCode facts were fetched from the official GraphQL endpoint on 2026-10-02 by two
independent checks each: 1929 Concatenation of Array (Easy; n == nums.length, 1 <= n <= 1000,
1 <= nums[i] <= 1000; method getConcatenation), 1480 Running Sum of 1d Array (Easy;
1 <= nums.length <= 1000, -10^6 <= nums[i] <= 10^6; method runningSum).

## Status

See the bottom of this file; it is updated at each milestone.

- [x] Engine, checker, tracer; `tests/engine.test.ts` passes (53 tests, real Python)
- [x] Content schema, validator, YAML plugin, content verification tests, native cross-check
- [x] Exemplar content, verified: accumulators unit, running-totals, running-products
- [x] App shell, all pages, workspace, stepper, progress rules, suggestions, help message,
      backup. Type-checks; builds with `STEPWISE_DRAFT_CONTENT=1 npx vite build`.
- [x] Exercised by hand in headless Chromium (run, failed check with feedback, step-through,
      endless loop stopped with variables shown, pass with self-report), light and dark.
- [x] `tests/state.test.ts` (progress rules, saving, backup, suggestions, help message): passes.
- [x] Browser tests in `e2e/` (five spec files, desktop and narrow projects): pass against a
      draft build. They cover: wrong attempt with feedback, step-through values, endless loop
      stopped and recovered, Stop button, pass and self-report, hint makes "passed with help",
      reload keeps code and result, hidden solution and fresh attempt, custom given values,
      warm-up round trip with the return banner, skill page demo states (0, 3, 4, 8), problem
      filters, help-context contents and clipboard, backup download/refused import/import/undo,
      prediction feedback, no outside requests + CSP + crossOriginIsolated, keyboard-only
      use, narrow layout with no sideways scroll.
- [x] Lint clean. All text color pairs meet 4.5:1 in both themes (checked by script).
- [x] Reachable from the Windows side at http://localhost:4477 (checked with Windows curl.exe
      through WSL interop while the server ran).
- [x] Content complete: 6 skill units, 28 exercises, 6 challenges, 9 follow-ups (43 items).
      `npm test` passes in full (489 tests: engine, state, every item with real Python, the
      collection checks). Strict `npm run build` passes. `npm run e2e` passes (24 tests).
      Spot reads (loops-missing-step, positions unit, grow-list-in-place, greatest-value)
      matched the exemplars in care and tone.
- [x] Independent review of every content group (ten reviewers, 170 findings, all repaired
      and re-verified; their notes about the checker led to: list-only identity in the
      `fresh` check, a guard against self-referential lists, a note for spacing-only output
      differences, clearer error explanations, "parentheses" versus "brackets" wording).
- [x] Oracles for all 34 coding items, written from the exported statements only (the
      authors never saw the YAML). `npm run verify:native`: 209 native tests, 277 oracle
      comparisons, 10,200 random inputs, 9 predictions and 32 step-through examples compared
      between Pyodide and native CPython, all passing.
- [x] Final verification run (2026-10-04): `npm run typecheck`, `npm run lint`, `npm test`
      (537 tests), `npm run verify:native`, strict `npm run build`, `npm run e2e` (24 tests).

## Known limits (honest list)

- A pass means the code passed the tested cases; the app says so and claims no mastery.
- Prepared feedback is matched by symptom (same wrong value on the first failing test, same
  error type, or "had to be stopped"), so one feedback text has to cover every plausible cause
  of that symptom. Reviewers wrote them that way, but a novel mistake gets only the generic
  expected-versus-actual note.
- A program that appends to a list without end can exhaust the worker's memory before the
  time limit; the worker is then restarted and the page says so, but the variables at that
  moment are lost.
- Progress lives in one browser profile, per address. Export a backup now and then.
- Only Chromium (headless) was exercised by automation. Firefox and Safari were not tested.
- Node 22.18+ is needed for the verification scripts (they import TypeScript directly).
