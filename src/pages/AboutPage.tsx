// "How this works": the rules the app follows, written out so nothing about checking,
// statuses or suggestions has to be guessed.

import { DEFAULT_LIMITS } from '../python/runtime.ts'
import { href } from '../router.ts'
import { useRuntimeStatus } from '../state/hooks.ts'
import { STATUS_LABELS, STATUS_MEANINGS, type ItemStatus } from '../state/progress.ts'
import { MAX_SUGGESTIONS } from '../state/recommend.ts'
import { StatusBadge } from '../ui/common.tsx'
import { MOD_KEY } from '../ui/keys.ts'

const STATUSES = Object.keys(STATUS_LABELS) as ItemStatus[]

export function AboutPage() {
  const status = useRuntimeStatus()
  const version = status.state === 'ready' || status.state === 'busy' ? status.pythonVersion : null

  return (
    <div class="page">
      <h1>How this works</h1>
      <p class="lead">
        Stepwise is a practice companion for the Python course you are following. It is a set of connected exercises with
        prepared explanations, and a checker that runs your code with real Python.
      </p>

      <div class="about">
        <section>
          <h2>Three ways in</h2>
          <ul>
            <li>
              <a href={href.home()}>Continue</a> picks up unfinished work and offers at most {MAX_SUGGESTIONS} suggestions,
              each with its reason.
            </li>
            <li>
              <a href={href.skills()}>Practice a skill</a> has six units. Each explains one skill with examples you can step
              through, then gives short exercises.
            </li>
            <li>
              <a href={href.problems()}>Browse problems</a> lists challenges that combine skills. Each one names warm-up
              exercises for the pieces it needs.
            </li>
          </ul>
          <p>
            You can open any problem at any time. Warm-ups are suggestions for when a piece is missing, never a gate. When
            you go to a warm-up from a problem, the app offers a way back and your code stays as you left it.
          </p>
        </section>

        <section>
          <h2>How your code is run</h2>
          <p>
            Your code is run by real Python{version ? ` (version ${version})` : ''}, working inside this browser tab. Nothing
            is simulated, and nothing leaves this computer.
          </p>
          <ul>
            <li>
              <strong>Given values.</strong> In the course, programs read their values with <code>input()</code>. Here the
              values are already stored in variables when your code starts. The task names them under "Given".
            </li>
            <li>
              <strong>Run</strong> tries your code once with the given values shown above the editor, and shows what it
              printed and what each variable holds at the end.
            </li>
            <li>
              <strong>Check</strong> runs your code several times, each time with different given values and each time from
              scratch, so nothing left over from an earlier run can help or hurt. After each run the checker looks at the
              result variable the task names (or at what was printed) and compares it with the expected value.
            </li>
            <li>
              <strong>Any correct approach passes.</strong> The checker looks at results, not at how the code is written.
              Where a task rules something out (for example <code>max()</code>), the task says so under "Rules", and the
              checker tells you if it finds it.
            </li>
            <li>
              <strong>Step through</strong> runs your code and records every executed line with the values at that moment.
              What you see is that recording, not an animation.
            </li>
          </ul>
        </section>

        <section>
          <h2>Limits, and loops that never end</h2>
          <p>
            A program that is still running after {DEFAULT_LIMITS.runMs / 1000} seconds ({DEFAULT_LIMITS.testMs / 1000} seconds
            for each test of a check) is stopped. So is a program that prints more than 20,000 characters. The Stop button
            does the same at any time. The app then shows the line the program was on and what each variable held, which
            usually points at the variable that was not changing. The next run starts clean.
          </p>
        </section>

        <section>
          <h2>What the statuses mean</h2>
          <dl class="status-meanings">
            {STATUSES.map((entry) => (
              <div key={entry}>
                <dt>
                  <StatusBadge status={entry} />
                </dt>
                <dd>{STATUS_MEANINGS[entry]}</dd>
              </div>
            ))}
          </dl>
          <p>
            The app cannot see whether you had help from outside, so it asks after a pass and records your answer. Not opening
            a hint is not treated as proof of anything. No status claims that a skill has been mastered.
          </p>
        </section>

        <section>
          <h2>What is recorded</h2>
          <ul>
            <li>Your code drafts and prediction answers, as you type.</li>
            <li>How many times you ran and checked, and the result of the latest check.</li>
            <li>Which hints you opened, and whether you opened the explanation or the worked solution.</li>
            <li>Which warm-ups you went to from a problem.</li>
            <li>Whether you copied a help message, and what you reported about outside help.</li>
            <li>Which skills you marked as confusing.</li>
          </ul>
          <p>
            All of it stays in this browser. <a href={href.progress()}>Progress and backup</a> shows it and can save it to a
            file.
          </p>
        </section>

        <section>
          <h2>How suggestions are chosen</h2>
          <p>Suggestions come from these rules, in this order. Each suggestion shows the reason it was made.</p>
          <ol>
            <li>Unfinished work in the exercise you touched most recently.</li>
            <li>An exercise whose worked solution you opened, and have not since passed from a blank start.</li>
            <li>The next exercise in a skill you marked as confusing.</li>
            <li>Something that builds on the exercise you passed most recently.</li>
            <li>An exercise you passed with help at least two days ago, or on your own at least a week ago, to try again.</li>
            <li>Otherwise, the first exercise you have not started.</li>
          </ol>
        </section>

        <section>
          <h2>Help from outside the app</h2>
          <p>
            There is no AI inside this app, and it makes no network requests. When the prepared hints and explanations are
            not enough, "Copy context for help" on any exercise builds a message with the task, your code and your latest
            result. You paste it into the chat you already use, and come back to your saved code afterwards.
          </p>
        </section>

        <section>
          <h2>Keyboard</h2>
          <dl class="keys-list">
            <div>
              <dt>
                <kbd>{MOD_KEY}</kbd> + <kbd>Enter</kbd>
              </dt>
              <dd>Run (or check your answers in a prediction exercise)</dd>
            </div>
            <div>
              <dt>
                <kbd>{MOD_KEY}</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd>
              </dt>
              <dd>Check</dd>
            </div>
            <div>
              <dt>
                <kbd>Tab</kbd> in the editor
              </dt>
              <dd>Indent. Press <kbd>Esc</kbd> and then <kbd>Tab</kbd> to move out of the editor.</dd>
            </div>
            <div>
              <dt>
                <kbd>←</kbd> <kbd>→</kbd> in a step-through
              </dt>
              <dd>One step back or forward</dd>
            </div>
          </dl>
          <p>Every action also has a button. No function keys are used. On a Mac, Ctrl works as well as Cmd.</p>
        </section>

        <section>
          <h2>Linked LeetCode problems</h2>
          <p>
            Two challenges practice the idea of an official LeetCode problem and link to it. Their text was written for this
            app, and they are marked "Adapted from LeetCode". Here you write a plain script with a named result variable.
            On LeetCode the same idea is submitted as a method inside a class. Each of those challenges explains the
            difference.
          </p>
        </section>
      </div>
    </div>
  )
}
