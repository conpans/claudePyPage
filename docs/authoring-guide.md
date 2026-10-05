# Writing content for Stepwise

All learning content lives in YAML files under `content/`. No page of the app holds content
of its own, so adding or changing a file is all it takes.

    content/skills/<skill-id>.yaml     one file per skill unit
    content/items/<item-id>.yaml       one file per exercise, challenge or follow-up
    verify/oracles/<item_id>.py        an independent second solution for each coding item

Files whose name starts with `_` are ignored, so `_draft.yaml` is a safe place to work.

Good files to copy from:

| You want to write | Copy |
|---|---|
| a prediction exercise | `content/items/accumulators-replace-or-add.yaml` |
| a missing-line exercise | `content/items/accumulators-add-up.yaml` |
| a repair-a-bug exercise | `content/items/accumulators-product-start.yaml` |
| a write-a-program exercise | `content/items/accumulators-count-failed.yaml` |
| a challenge linked to LeetCode | `content/items/running-totals.yaml` |
| a follow-up to a challenge | `content/items/running-products.yaml` |
| a skill unit | `content/skills/accumulators.yaml` |

## Checking your work

    ITEMS=my-item-id npx vitest run tests/content.test.ts   # one or more items (comma-separated)
    npm test                                                # everything
    npm run verify:native                                   # oracles and random inputs, on native Python

`ITEMS=` mode checks the named files only and ignores links to items that do not exist yet.
The same checks run without `ITEMS=` before a release, and then every link must resolve.

What the checks do, with real Python each time:

- the reference solution passes every test and every example, through the same checker the
  app uses, and breaks none of the item's own restrictions;
- the starter code, unchanged, does not pass;
- a program that only stores the first example's answer does not pass;
- every prepared mistake fails in the way it claims, and the checker recognizes it as that
  mistake on the first failing test (so the learner would see that mistake's feedback);
- the author's answers to a prediction match a real run, and each prepared wrong answer is
  really wrong;
- every prepared step-through example runs to the end without an error.

## Who you are writing for

An adult learner working through the University of Helsinki Python Programming MOOC 2026,
around Part 2, section 3 (combining conditions).

What the course has covered by that point: `print`, `input`, variables, f-strings, arithmetic
(including `+=`), `if`, comparisons, `True`/`False`, `else`/`elif`, and `and`/`or`/`not`
with the chained form `a <= x <= b`. What comes next in the course: `while True` with `break`
(2.4), `while <condition>` with "initialisation, condition and update" (3.1), strings and
indexing (3.2), functions (3.4), lists with `len()` and `append()` (4.3), `for` and `range()`
(4.4).

On the side, the learner has practiced `while` loops, list indexing, `len()`, `append()`,
running sums and products, and repeating a list. Having seen something is not the same as
being able to do it alone, so nothing is assumed to be easy.

The course tests programs by what they print after reading `input()`. Here the values are
already given in variables and the checker reads a result variable (or the printed output),
so say plainly in each task which variables are given and where the answer goes.

The mix-ups this collection is built around:

1. A list position versus the value stored at that position.
2. Names you choose (`position`, `total`) versus things Python defines (`[ ]`, `len()`, `.append()`).
3. Using two counters where one position variable is enough.
4. The length of a list versus its last position; `<` versus `<=` at the end of a loop.
5. Forgetting to move the loop variable on.
6. Assignment stores the current result. It is not a live formula.
7. Replacing a value versus adding to it.
8. Start at 0 for adding and at 1 for multiplying, and why.
9. The receiving list goes before `.append()`, the item goes inside the parentheses. (Say
   "parentheses" for `( )` and "brackets" for `[ ]`, so the two are never mixed up.)
10. `if`/`elif`/`else` versus separate `if` statements; `not` does not change the variable.

## Style

- Plain language. Short sentences. Concrete values in every explanation.
- One unfamiliar idea at a time. If a task needs two new ideas, it is two tasks.
- Never write "simply", "just", "obviously", "easy", "trivial", or anything that suggests the
  reader should already know. Never describe a mistake as careless.
- American spelling ("practice", "recognize", "color"), because that is how the learner writes.
- Say "position" for a place in a list, and tie it once per unit to the course's word:
  "position (the course calls it the index)". Say "item" for what a list holds, "value" for
  what a variable or a position stores, and "round" for one pass through a loop body ("the
  course calls a round an iteration"). The three parts of a loop are the "start", the
  "condition" and the "update" (the course says "initialisation, condition and update").
- Functions (`def`, `return`), `for` loops and `range()` are not assumed. Do not require them
  and do not use them in reference solutions or prepared programs. A walkthrough may mention
  in one sentence that a later part of the course shows a shorter way.
- Negative positions: be exact. Python accepts them, counting from the end (`numbers[-1]` is
  the last item). That is a separate feature. The forward loops here use positions from 0 to
  `len(numbers) - 1`.
- Variable names are meaningful and stay the same across exercises: `numbers`, `position`,
  `total`, `count`, `product`. Use f-strings whenever a program prints a value with text.
- Write the full form first: `total = total + number`. Mention `+=` as a shorthand only
  after the full form has been shown. Reference solutions use the full form.
- Reference solutions use a `while` loop with a position variable, because that is the tool
  the learner is practicing. The checker accepts any correct approach.
- State every boundary in the rules: whether a list can be empty, whether a limit is
  included, whether order matters, whether a given list may be changed. Never leave a rule to
  be worked out from an example.
- Sentence case for titles. No exclamation marks.

Text fields accept a small subset of Markdown: paragraphs, `inline code`, **bold**, *italic*,
bullet and numbered lists, fenced code blocks (three backticks, then `python`), simple tables
with `|`, and links.

## An item file, field by field

Every item has these fields.

| Field | Meaning |
|---|---|
| `id` | Lowercase words joined by hyphens. Must equal the file name. |
| `title` | Short, in sentence case. |
| `tier` | `exercise` (belongs to one skill unit), `challenge` (integrates several skills), or `variation` (a follow-up to a challenge). |
| `format` | `predict`, `fill` (write the missing line), `fix` (repair a bug) or `write`. |
| `skill` | For `exercise` only: the unit it belongs to. Also add the id to that skill's `exercises` list. |
| `skills` | Every skill the item uses. This is what links problems and skills. |
| `difficulty` | 1 (gentle), 2 (middle) or 3 (stretch), relative to this collection only. |
| `order` | For challenges and follow-ups: their position when listed. |
| `variationOf` | For `variation` only: the id of the challenge it follows. |
| `newIdea` | For challenges and follow-ups: the one idea this adds beyond its warm-ups. |
| `source` | `type: original`, or `type: leetcode-adaptation` with `number`, `title`, `url` and `interfaceNote` (how this plain-script version differs from LeetCode's submission interface). Describe the task in your own words; never paste LeetCode's text. |
| `goal` | One sentence. |
| `statement` | The task itself: what the program must do, in full. |
| `rules` | A list of explicit requirements and boundaries. |
| `toWrite` | What the learner is expected to write (for example "One line", or "About six lines"). |
| `hints` | Two or more, from a nudge to nearly there. See below. |
| `explanation` | The idea, walked through with concrete values. No full solution code here. |
| `prerequisites` | Ids of smaller items worth doing first (shown as warm-ups). |
| `related` | Ids of items that use the same idea. |
| `next` | Optional: a different item that applies the same idea, offered after the worked solution has been revealed. |

### Coding items (`fill`, `fix`, `write`)

| Field | Meaning |
|---|---|
| `given` | The variables the checker provides. Each has `name`, `type` (`int`, `bool`, `str`, `list[int]`, `list[str]`, `list[bool]`), `describe`, and a `domain`: `min`/`max` for numbers, `minLen`/`maxLen` for lists, `oneOf` for a fixed set of values. Every test and example must stay inside the domain, and the rules must state it in words. |
| `where` | Optional Python expression that every set of given values satisfies, such as `low <= high`. State it in the rules too. |
| `create` | The result variables the checker reads after the program ends: `name` and `describe`. |
| `prints` | Only when printing is part of the task: a description of the exact output. Tests and examples then need an `output` field. |
| `unchanged` | Given lists the program must leave as they were. State it in the rules. |
| `fresh` | Result lists that must be new lists, not a second name for a given list. State it in the rules. |
| `inPlace` | Given lists the program must change itself (for example by appending), instead of building a new list. The result variable is then the given variable: list it under `create` too. State it in the rules. |
| `forbid` | Calls the task rules out, written `max()` or `.sort()`. Use it only when the built-in would skip the skill being practiced, and state it in the rules with the reason. |
| `starter` | What the editor holds at first. For `fill`: the program with a comment where the line is missing. For `fix`: the buggy program. For `write`: a one-line comment naming the given and result variables. |
| `exampleGiven` | The given values shown in the editor, used by Run. |
| `examples` | One or more, each with `given`, `result` (and `output`), and a `why` that shows the arithmetic. |
| `tests` | At least three; aim for four to six. Each has `name`, `given`, `expect` (and `output`), and `purpose`: what this test is there to catch, in a sentence the learner will read. |
| `mistakes` | Prepared wrong programs. See below. |
| `solution` | `code` (the complete reference program) and `walkthrough` (why each part is there). |

Printed output is compared line by line. Spaces at the end of a line and blank lines at the
end are ignored; everything else must match exactly. Values compare by value and kind:
`3.0` is accepted for `3`, but `True` is not `1` and a tuple is not a list.

### Tests

Cover what the task's own rules allow, and nothing outside them:

- the first example, so the learner recognizes it;
- the smallest input allowed (a one-item list, or an empty one if the rules allow it);
- repeated values and ties;
- negative numbers and zero, when the domain includes them;
- a case where matching and non-matching items are mixed;
- an input that makes a value differ from its position (for example `[10, 20, 30]`), so that
  using the position in place of the value cannot pass;
- boundaries named in the rules, tested on both sides (`limit`, `limit + 1`, `limit - 1`).

### Mistakes

A mistake is a complete wrong program plus the feedback a learner should see when their own
program goes wrong in the same way.

    - id: replaces
      label: Stores the current item instead of adding it
      shows: wrong-result          # or: error (with errorType: IndexError), or: never-stops
      code: |
        ...
      feedback: |
        ...

- `wrong-result`: the checker runs the mistake on the failing test's input. If the learner's
  result equals the mistake's result, the feedback is shown. So the match is on behavior,
  whatever the learner's code looks like.
- `error`: matched when the learner's program raises that kind of error. When two mistakes
  raise the same kind, give the more specific one `errorContains: some text from the message`
  and list it first (for example `errorContains: NoneType` for `result = result.append(x)`).
- `never-stops`: matched when the learner's program had to be stopped.

Feedback names what the result shows, says what usually causes it, and points at where to
look. It does not hand over the corrected line. Start from the evidence ("Your list is a copy
of `numbers`...") and keep it to a few sentences.

The checker can only tell mistakes apart by what it sees: the wrong value on the first failing
test, the kind of error (plus a piece of its message), or "had to be stopped". So an item has in
effect one piece of feedback per symptom. Write the `never-stops` feedback and each error
feedback so that it covers every plausible cause of that symptom, starting from the evidence the
learner has on screen (the stopped loop's variables, the line of the error).

Two mistakes must not give the same result on the first test that fails, or the second one
can never be recognized. The checks report this. Fix it by reordering the tests, or by
merging the two into one piece of feedback that names both causes.

Include the ones that matter for this learner where they apply: stopping one position too
far (`<=`), never moving the position on, storing instead of adding, appending the position
instead of the value, and `.append()` written the wrong way round. For a `fix` item, the bug
in the starter is the first mistake, with feedback that describes the symptom only.

### Hints, explanation, solution

- Hint 1 is a question or a pointer to the idea. Hint 2 names the idea with a small concrete
  example. Hint 3 gives the structure in words, or the shape of the key line. No hint is the
  whole program.
- The explanation teaches the idea with a table of values for one concrete input. It should
  help someone who has read all the hints and is still stuck, without code they can paste.
- The solution walkthrough explains each part of the reference program and why it is there.

### Prediction items

    program: |
      ...
    questions:
      - ask: What does the program print? Put each printed line on its own line.
        about: output
        answer: |
          5
          15
        wrong:
          - answer: |
              15
              15
            feedback: |
              ...
      - ask: What is the value of `position` after the loop has ended?
        about: value
        expression: position
        answer: '3'

`about: output` compares with everything the program prints. `about: value` compares with the
value of `expression` after the program has ended. Write `answer` exactly as Python shows the
value (`True`, `['a', 'b']`, `3`). Give `wrong` answers for the predictions the mix-ups above
would produce, each with feedback that addresses that particular mix-up.

Keep prediction programs short (about ten lines), use concrete values, and have each program
turn on one idea.

## A skill file

    id: accumulators
    order: 5
    title: Accumulators for sums, products, and counts
    shortTitle: Accumulators
    summary: One sentence.
    mixups: [the specific confusions this unit targets, in plain words]
    sections:
      - title: One idea
        body: |
          The explanation, with concrete values.
        demo:                    # optional: a prepared step-through example
          title: Adding up a list
          given: { numbers: [3, 1, 4] }
          code: |
            ...
          note: Optional line telling the reader what to watch.
    exercises: [ids, in teaching order]

Each section teaches one idea. A `demo` is a short program the learner can step through; the
app runs it with real Python to produce every step, so the demo can never disagree with
Python. Keep demos under about 40 executed lines (a loop over three or four items).

## Adding things

**An exercise to a skill:** create `content/items/<id>.yaml` with `tier: exercise` and
`skill: <skill-id>`, add the id to `exercises` in the skill file, write its oracle, run the
checks.

**A challenge:** create the item with `tier: challenge`, list every skill it uses under
`skills`, name warm-up exercises under `prerequisites`, and say in `newIdea` what it adds.
Give it at least one follow-up (`tier: variation`, `variationOf: <challenge-id>`) that changes
what has to be done, not only the names.

**A skill:** create `content/skills/<id>.yaml` with at least three exercises. Use the new id
in the `skills` list of every item that uses it.

**A linked official problem:** set `source.type: leetcode-adaptation` and fill in `number`,
`title`, `url` and `interfaceNote`. Check the official statement and its limits yourself
first, state the limits in `rules`, and write the description in your own words.
