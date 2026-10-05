# Stepwise

A local practice companion for learning Python: six skill units, six challenges with follow-ups,
and a checker that runs your code with real Python, in your browser, on your own computer.

- No account, no AI inside, no network use after setup. Progress stays in your browser.
- Every exercise has prepared hints, an explanation, a hidden worked solution, and tests whose
  feedback names what usually went wrong.
- A step-through shows a real run line by line, with list positions drawn apart from values.
- "Copy context for help" builds a message you can paste into the AI chat you already use.

## Setup (once)

You need Node.js 22.18 or newer (and `python3` only for the optional native checks). From this
folder, in WSL (Ubuntu), macOS Terminal, or any Linux shell:

    npm run setup

This installs the packages, copies the Python runtime (Pyodide, about 14 MB) into
`public/pyodide/`, and builds the app. Internet is needed for this step only.

### On a Mac, or any other computer

The app runs the same way on macOS: install Node.js (from nodejs.org, or `brew install node`),
clone or copy this folder, run `npm run setup`, then `npm start` and open
http://localhost:4477 in Safari, Chrome or Firefox. Shortcuts show as Cmd+Enter there, and
Ctrl+Enter works too.

Your progress is not part of the project files: it lives in the browser of the computer you
practiced on. To carry it over, use **Progress and backup → Download a backup file** on the old
computer and **Import a backup file** on the new one.

### Putting the project on GitHub

Everything that belongs in the repository is in this folder already; `.gitignore` leaves out
`node_modules/`, `dist/`, the copied Python runtime, the local browser-test tools and test
output. From this folder:

    git config --global user.name "Your Name"        # once per computer, if not set yet
    git config --global user.email "you@example.com"
    git add .
    git commit -m "Stepwise: local Python practice app"

Then create an empty repository on github.com (no README, no .gitignore), and:

    git remote add origin git@github.com:YOUR-NAME/stepwise.git   # or the https URL
    git push -u origin main

On the other computer: `git clone <that URL>`, `cd stepwise`, `npm run setup`, `npm start`.

## Start and stop

    npm start

Then open **http://localhost:4477** in your Windows browser (Edge, Chrome or Firefox). The first
page load starts Python in the background; it takes a few seconds the first time.

Stop the app with `Ctrl+C` in that terminal.

Always use the same address. The browser stores your progress per address, so
`http://127.0.0.1:4477` or another port would start empty. If `npm start` says the port is in
use, the app is probably already running in another terminal.

`npm start` rebuilds the app by itself when a content file has changed since the last build.

## Backup

Open **Progress and backup** in the app and choose **Download a backup file**. The file is plain
JSON holding your progress and your code drafts. **Import a backup file** on the same page
brings it back, after showing what the file contains; a damaged file is refused and changes
nothing, and the last import can be undone.

Your drafts and progress live in the browser's storage for `http://localhost:4477`. Clearing
that site's data, or switching browsers, starts empty, so download a backup now and then.

## A first session (15 to 30 minutes)

1. Open **Practice a skill**, then **Accumulators for sums, products, and counts**. Step through
   the first example ("Adding up a list") with Next, watching `total` and `position`.
2. Do **Replace or add?** (a prediction) and **Add up a list** (one missing line).
3. Open **Browse problems** and try **Running totals**. Use Run with your own given values, then
   Check. If a piece is missing, the task lists warm-ups; your code stays saved while you are
   away. Hints and the explanation are there when you want them; the worked solution stays
   hidden until you ask.
4. When it passes, answer the question about outside help. Come back another day and try
   **Running products**, or start a fresh attempt at Running totals.

## Adding content

Content is YAML under `content/` and needs no code changes:

- `content/skills/<skill-id>.yaml`: one skill unit.
- `content/items/<item-id>.yaml`: one exercise, challenge or follow-up.
- `verify/oracles/<item_id>.py`: an independent second solution, used only by the checks.

The field-by-field reference, the style rules, and the checks to run are in
[docs/authoring-guide.md](docs/authoring-guide.md). In short: copy the closest existing file,
change it, then run `ITEMS=<id> npx vitest run tests/content.test.ts` until it is green, add an
oracle, and run `npm run verify:native`. Then `npm start` picks the new content up.

## Checks

    npm run typecheck      # TypeScript, strict
    npm run lint           # oxlint
    npm test               # engine, progress rules, and every content item, with real Python under Node
    npm run verify:native  # content against this computer's own Python, oracles, random inputs
    npm run e2e:setup      # once: a project-local headless Chromium for the browser tests
    npm run e2e            # the learner flows in a real browser (build first)
    npm run verify         # all of the above, in order

## How it works, briefly

Vite + Preact + TypeScript, CodeMirror for the editor, Pyodide (CPython 3.14 as WebAssembly) in
a Web Worker for execution. `server.mjs` serves the built files on the loopback interface only,
with headers that keep the page to its own origin and let the Stop button interrupt a running
program. Details and decisions: [docs/implementation-notes.md](docs/implementation-notes.md).

Learner code runs inside the browser's sandbox. The server executes nothing and has no API.
