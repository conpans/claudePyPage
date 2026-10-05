// The checker itself, exercised with real Python (Pyodide under Node).
// These tests cover the risks a grading engine has: stale state between runs, the different
// ways a program can end, comparing results fairly, and stopping a loop that never ends.

import { beforeAll, describe, expect, it } from 'vitest'
import { runJob } from '../src/python/engine.ts'
import type {
  CheckJob,
  InspectResponse,
  PredictResponse,
  RunResponse,
  TestResponse,
  TraceResponse,
} from '../src/python/protocol.ts'
import { startPython, type TestPython } from './helpers/python.ts'

let python: TestPython

beforeAll(async () => {
  python = await startPython()
})

function run(code: string, given = ''): RunResponse {
  return python.engine.call<RunResponse>({ kind: 'run', code, given })
}

function test(code: string, request: Record<string, unknown>): TestResponse {
  return python.engine.call<TestResponse>({ kind: 'test', code, given: '', ...request })
}

function value(response: RunResponse, name: string): string | undefined {
  return response.variables.find((variable) => variable.name === name)?.value.text
}

const SUM_LOOP = [
  'total = 0',
  'position = 0',
  'while position < len(numbers):',
  '    total = total + numbers[position]',
  '    position = position + 1',
].join('\n')

describe('running code', () => {
  it('reports output and the final variables', () => {
    const result = run(`${SUM_LOOP}\nprint(f"Total: {total}")`, 'numbers = [3, 1, 4]\n')
    expect(result.status).toBe('ok')
    expect(result.stdout).toBe('Total: 8\n')
    expect(value(result, 'total')).toBe('8')
    expect(value(result, 'position')).toBe('3')
    expect(result.variables.find((variable) => variable.name === 'numbers')?.given).toBe(true)
    expect(result.variables.find((variable) => variable.name === 'total')?.given).toBe(false)
  })

  it('starts every run with a fresh namespace', () => {
    expect(run('leftover = 41').status).toBe('ok')
    const second = run('print(leftover + 1)')
    expect(second.status).toBe('error')
    expect(second.error?.type).toBe('NameError')
  })

  it('does not let one run change what the next run is given', () => {
    const first = run('numbers.append(99)', 'numbers = [1, 2]\n')
    expect(value(first, 'numbers')).toBe('[1, 2, 99]')
    const second = run('size = len(numbers)', 'numbers = [1, 2]\n')
    expect(value(second, 'size')).toBe('2')
  })

  it('separates a syntax error (nothing ran) from a runtime error', () => {
    const syntax = run('print("before")\nif True\n    print(1)')
    expect(syntax.status).toBe('syntax-error')
    expect(syntax.error?.line).toBe(2)
    expect(syntax.stdout).toBe('')

    const indent = run('total = 0\n    total = 1')
    expect(indent.status).toBe('syntax-error')
    expect(indent.error?.type).toBe('IndentationError')

    const runtime = run('print("before")\nprint(missing_name)')
    expect(runtime.status).toBe('error')
    expect(runtime.error?.type).toBe('NameError')
    expect(runtime.error?.line).toBe(2)
    expect(runtime.stdout).toBe('before\n')
  })

  it('shows the variables at the moment of an error', () => {
    const code = [
      'position = 0',
      'while position <= len(numbers):',
      '    value = numbers[position]',
      '    position = position + 1',
    ].join('\n')
    const result = run(code, 'numbers = [7, 8]\n')
    expect(result.status).toBe('error')
    expect(result.error).toMatchObject({ type: 'IndexError', line: 3, lineText: 'value = numbers[position]' })
    expect(value(result, 'position')).toBe('2')
    expect(value(result, 'value')).toBe('8')
  })

  it('stops a program that prints without end', () => {
    const result = run('while True:\n    print("again")')
    expect(result.status).toBe('output-limit')
    expect(result.outputTruncated).toBe(true)
    expect(result.stdout.length).toBeLessThanOrEqual(20_000)
    expect(result.stopLine).toBe(2)
  })

  it('reports a problem in the given values separately', () => {
    const result = run('print(1)', 'numbers = [1, 2\n')
    expect(result.status).toBe('given-error')
  })

  it('treats exit() as the end of the program, not a failure', () => {
    const result = run('print("a")\nimport sys\nsys.exit()\nprint("b")')
    expect(result.status).toBe('ok')
    expect(result.stdout).toBe('a\n')
  })

  it('explains that input() is not available', () => {
    const result = run('name = input("Name: ")')
    expect(result.status).toBe('error')
    expect(result.error?.message).toContain('input() is not used in this app')
  })

  it('shows huge values without building huge text', () => {
    const result = run('numbers = list(range(100000))\nbig = 7 ** 20000\ntext = "ab" * 5000')
    expect(result.status).toBe('ok')
    expect(value(result, 'numbers')).toContain('100000 items in total')
    expect(value(result, 'big')).toBe('<a whole number too long to display>')
    expect(value(result, 'text')).toContain('10000 characters in total')
  })
})

describe('stopping a program that never ends', () => {
  it('interrupts an endless loop, keeps the state, and runs the next program normally', () => {
    python.interruptAfter(300)
    const started = performance.now()
    const stuck = run('count = 0\nposition = 0\nwhile position < 3:\n    count = count + 1\n')
    const elapsed = performance.now() - started
    expect(stuck.status).toBe('stopped')
    expect(elapsed).toBeLessThan(3000)
    expect(stuck.stopLine).toBeGreaterThanOrEqual(3)
    expect(value(stuck, 'position')).toBe('0')
    expect(Number(value(stuck, 'count'))).toBeGreaterThan(1000)

    const next = run('print(2 + 2)')
    expect(next.status).toBe('ok')
    expect(next.stdout).toBe('4\n')
  })

  it('keeps the result when a stop signal arrives just after the program ended', () => {
    // settle() builds the response of a finished program. A late signal interrupts the first try.
    const kept = python.insideHarness(
      [
        'calls = []',
        'def build():',
        '    calls.append(1)',
        '    if len(calls) == 1:',
        '        raise KeyboardInterrupt()',
        '    return "kept after " + str(len(calls)) + " tries"',
        'settle(build)',
      ].join('\n'),
    )
    expect(kept).toBe('kept after 2 tries')
  })

  it('shows the variables of a stopped program even when it built a very long list', () => {
    const stop = python.interruptAfter(400)
    const code = 'totals = []\ntotal = 0\nposition = 0\nwhile position < len(numbers):\n    total = total + numbers[position]\n    totals.append(total)\n'
    const stuck = run(code, 'numbers = [3, 1, 4]\n')
    stop()
    expect(stuck.status).toBe('stopped')
    expect(value(stuck, 'position')).toBe('0')
    expect(value(stuck, 'totals')).toContain('items in total')
    expect(stuck.stopLine).toBeGreaterThanOrEqual(4)
  })

  it('keeps a list that grew without end from flooding the result', () => {
    python.interruptAfter(300)
    const code = 'position = 0\nwhile position < len(numbers):\n    numbers.append(numbers[position])\n    position = position + 1\n'
    const stuck = run(code, 'numbers = [1, 2, 3]\n')
    expect(stuck.status).toBe('stopped')
    expect(value(stuck, 'numbers')).toContain('items in total')
    expect(JSON.stringify(stuck).length).toBeLessThan(20_000)
  })
})

describe('checking a result variable', () => {
  const expectTotal = { expect: { variables: { total: '8' }, stdout: null }, given: 'numbers = [3, 1, 4]\n' }

  it('passes a correct program', () => {
    const result = test(SUM_LOOP, expectTotal)
    expect(result.status).toBe('pass')
    expect(result.checks).toHaveLength(1)
    expect(result.checks[0]).toMatchObject({ kind: 'variable', target: 'total', ok: true, expected: '8', actual: '8' })
  })

  it('accepts a different correct approach', () => {
    expect(test('total = 0\nfor number in numbers:\n    total += number', expectTotal).status).toBe('pass')
    expect(test('total = sum(numbers)', expectTotal).status).toBe('pass')
  })

  it('fails a wrong value and shows expected and actual', () => {
    const result = test(SUM_LOOP.replace('total + numbers[position]', 'numbers[position]'), expectTotal)
    expect(result.status).toBe('fail')
    expect(result.checks[0]).toMatchObject({ ok: false, expected: '8', actual: '4' })
  })

  it('notices a missing result variable and suggests a near miss', () => {
    const result = test(SUM_LOOP.replaceAll('total', 'totl'), expectTotal)
    expect(result.status).toBe('fail')
    expect(result.checks[0]).toMatchObject({ ok: false, missing: true, similar: ['totl'] })
  })

  it('does not treat True as 1, or a tuple as a list', () => {
    expect(test('count = True', { expect: { variables: { count: '1' }, stdout: null } }).status).toBe('fail')
    expect(test('flag = 1', { expect: { variables: { flag: 'True' }, stdout: null } }).status).toBe('fail')
    const tuple = test('result = (1, 2)', { expect: { variables: { result: '[1, 2]' }, stdout: null } })
    expect(tuple.status).toBe('fail')
    expect(tuple.checks[0]?.note).toContain('should be a list, but it is a tuple')
  })

  it('accepts 3.0 where 3 is expected', () => {
    expect(test('half = 6 / 2', { expect: { variables: { half: '3' }, stdout: null } }).status).toBe('pass')
  })

  it('describes the first difference in a list', () => {
    const wrongItem = test('totals = [3, 1, 8]', { expect: { variables: { totals: '[3, 4, 8]' }, stdout: null } })
    expect(wrongItem.checks[0]?.note).toBe(
      'The first difference is at position 1: it should hold `4`, but it holds `1`.',
    )
    const wrongLength = test('totals = [3, 4]', { expect: { variables: { totals: '[3, 4, 8]' }, stdout: null } })
    expect(wrongLength.checks[0]?.note).toBe('`totals` has 2 items, but it should have 3 items.')
  })

  it('explains None, the usual sign of result = result.append(...)', () => {
    const result = test('totals = []\ntotals = totals.append(3)', {
      expect: { variables: { totals: '[3]' }, stdout: null },
    })
    expect(result.status).toBe('fail')
    expect(result.checks[0]?.note).toContain('should be a list, but it is None')
  })

  it('checks that a given list was left unchanged when the task says so', () => {
    const request = {
      given: 'numbers = [3, 1, 4]\n',
      expect: { variables: { biggest: '4' }, stdout: null },
      unchanged: ['numbers'],
    }
    expect(test('biggest = max(numbers)', request).status).toBe('pass')
    const sorted = test('numbers.sort()\nbiggest = numbers[len(numbers) - 1]', request)
    expect(sorted.status).toBe('fail')
    const line = sorted.checks.find((check) => check.kind === 'unchanged')
    expect(line).toMatchObject({ ok: false, expected: '[3, 1, 4]', actual: '[1, 3, 4]' })
  })

  it('checks that a result is a new list when the task says so', () => {
    const request = {
      given: 'numbers = [3, 1, 4]\n',
      expect: { variables: { copied: '[3, 1, 4]' }, stdout: null },
      fresh: ['copied'],
    }
    const alias = test('copied = numbers', request)
    expect(alias.status).toBe('fail')
    expect(alias.checks.find((check) => check.kind === 'fresh')?.note).toContain('two names for one and the same list')
    expect(test('copied = []\nfor number in numbers:\n    copied.append(number)', request).status).toBe('pass')
    expect(test('copied = numbers[:]', request).status).toBe('pass')
  })

  it('does not mistake a small number for "the same list"', () => {
    // Python shares small whole numbers, so identity alone would say 5 "is" the given 5.
    const request = {
      given: 'numbers = [5, 9]\nlow = 5\n',
      expect: { variables: { positions_in_range: '[0]' }, stdout: null },
      fresh: ['positions_in_range'],
    }
    const result = test('positions_in_range = low', request)
    expect(result.status).toBe('fail')
    expect(result.checks.find((line) => line.kind === 'fresh')?.ok).toBe(true)
    expect(result.checks[0]?.note).toContain('should be a list, but it is a whole number')
  })

  it('survives a list that contains itself', () => {
    const result = test('numbers.append(numbers)\ncopied = numbers', {
      given: 'numbers = [1]\n',
      expect: { variables: { copied: '[1]' }, stdout: null },
    })
    expect(result.status).toBe('fail')
  })

  it('checks that a given list was changed in place when the task says so', () => {
    const request = {
      given: 'numbers = [3, 1]\n',
      expect: { variables: { numbers: '[3, 1, 3, 1]' }, stdout: null },
      inPlace: ['numbers'],
    }
    const appended = test(
      'original_length = len(numbers)\nposition = 0\nwhile position < original_length:\n    numbers.append(numbers[position])\n    position = position + 1',
      request,
    )
    expect(appended.status).toBe('pass')
    const rebuilt = test('numbers = numbers + numbers', request)
    expect(rebuilt.status).toBe('fail')
    expect(rebuilt.checks.find((line) => line.kind === 'in-place')?.note).toContain('now names a different list')
  })
})

describe('checking printed output', () => {
  const expectOutput = { expect: { variables: {}, stdout: 'Total: 8\nDone' } }

  it('ignores trailing spaces and a missing final newline', () => {
    expect(test('print("Total: 8  ")\nprint("Done", end="")', expectOutput).status).toBe('pass')
  })

  it('points at the first line that differs', () => {
    const result = test('print("total: 8")\nprint("Done")', expectOutput)
    expect(result.status).toBe('fail')
    expect(result.checks[0]?.note).toBe(
      'Printed line 1 should be `Total: 8`, but your program printed `total: 8`. Only capital and small letters differ.',
    )
  })

  it('notices when only the spacing between words differs', () => {
    const result = test('print("Total:  8")\nprint("Done")', expectOutput)
    expect(result.status).toBe('fail')
    expect(result.checks[0]?.note).toContain('Only the number of spaces between the words differs.')
  })

  it('says when the number of lines is wrong or nothing was printed', () => {
    expect(test('print("Total: 8")', expectOutput).checks[0]?.note).toBe(
      'Your program printed 1 line, but it should print 2 lines.',
    )
    expect(test('total = 8', expectOutput).checks[0]?.note).toBe('Your program did not print anything.')
  })
})

describe('recognising a prepared mistake', () => {
  const request = {
    given: 'numbers = [3, 1, 4]\n',
    expect: { variables: { total: '8' }, stdout: null },
    mistakes: [
      { id: 'replaces', match: 'values', code: SUM_LOOP.replace('total + numbers[position]', 'numbers[position]') },
      { id: 'adds-positions', match: 'values', code: SUM_LOOP.replace('numbers[position]', 'position') },
      { id: 'one-too-far', match: 'error', errorType: 'IndexError', code: SUM_LOOP.replace('<', '<=') },
      { id: 'never-advances', match: 'stopped', code: 'unused = 0' },
    ],
  }

  it('matches a learner who made the same mistake a different way', () => {
    const learner = 'total = 0\nfor number in numbers:\n    total = number'
    expect(test(learner, request).mistakeId).toBe('replaces')
    expect(test('total = 0\nfor position in range(len(numbers)):\n    total += position', request).mistakeId).toBe(
      'adds-positions',
    )
  })

  it('matches by the kind of error', () => {
    const result = test('total = 0\ntotal = total + numbers[len(numbers)]', request)
    expect(result.status).toBe('error')
    expect(result.mistakeId).toBe('one-too-far')
  })

  it('matches a program that had to be stopped', () => {
    python.interruptAfter(200)
    const result = test('total = 0\nposition = 0\nwhile position < len(numbers):\n    total = total + numbers[position]\n', request)
    expect(result.status).toBe('stopped')
    expect(result.mistakeId).toBe('never-advances')
  })

  it('tells two causes of the same error type apart by the message', () => {
    const appendRequest = {
      given: 'numbers = [3, 1]\n',
      expect: { variables: { doubled: '[6, 2]' }, stdout: null },
      mistakes: [
        { id: 'stores-none', match: 'error', errorType: 'AttributeError', errorContains: 'NoneType', code: 'unused = 0' },
        { id: 'wrong-receiver', match: 'error', errorType: 'AttributeError', code: 'unused = 0' },
      ],
    }
    expect(test('doubled = []\ndoubled = doubled.append(6)\ndoubled.append(2)', appendRequest).mistakeId).toBe('stores-none')
    expect(test('doubled = []\nvalue = 6\nvalue.append(doubled)', appendRequest).mistakeId).toBe('wrong-receiver')
  })

  it('gives no mistake for an unrelated wrong answer, and none for a pass', () => {
    expect(test('total = 1000', request).mistakeId).toBeNull()
    expect(test(SUM_LOOP, request).mistakeId).toBeNull()
  })
})

describe('checking predictions', () => {
  const program = ['paused = False', 'if not paused:', '    print("running")', 'else:', '    print("paused")', 'print(paused)'].join(
    '\n',
  )
  const questions = [
    { about: 'output', wrong: ['running\nTrue', 'paused\nFalse'] },
    { about: 'value', expression: 'paused', wrong: ['True'] },
  ]
  const predict = (answers: string[]) =>
    python.engine.call<PredictResponse>({ kind: 'predict', program, questions, answers })

  it('accepts correct predictions', () => {
    const result = predict(['running\nFalse', 'False'])
    expect(result.results.map((entry) => entry.correct)).toEqual([true, true])
    expect(result.truths).toEqual(['running\nFalse', 'False'])
  })

  it('accepts harmless differences and says what they were', () => {
    const result = predict(['"running"\nfalse', 'false'])
    expect(result.results[0]).toMatchObject({ correct: true })
    expect(result.results[0]?.note).toBe('`print()` shows text without the quotation marks.')
    expect(result.results[1]).toMatchObject({ correct: true, note: 'Python spells it `False`, with a capital first letter.' })
  })

  it('finds the prepared feedback for a specific wrong prediction', () => {
    const result = predict(['running\nTrue', 'True'])
    expect(result.results[0]).toMatchObject({ correct: false, wrongIndex: 0 })
    expect(result.results[1]).toMatchObject({ correct: false, wrongIndex: 0 })
  })

  it('separates a blank answer from a wrong one', () => {
    const result = predict(['', 'maybe'])
    expect(result.results[0]).toMatchObject({ correct: false, blank: true })
    expect(result.results[1]).toMatchObject({ correct: false, blank: false, wrongIndex: null })
    expect(result.results[1]?.note).toContain('could not read that as a Python value')
  })

  it('compares list answers by value, not by spacing or quote style', () => {
    const result = python.engine.call<PredictResponse>({
      kind: 'predict',
      program: 'letters = []\nletters.append("b")\nletters.append("a")\nprint(letters)',
      questions: [{ about: 'output', wrong: [] }, { about: 'value', expression: 'letters', wrong: [] }],
      answers: ['["b","a"]', "['b', 'a']"],
    })
    expect(result.results.map((entry) => entry.correct)).toEqual([true, true])
  })
})

describe('step-through', () => {
  const trace = (code: string, given = '', maxSteps = 300) =>
    python.engine.call<TraceResponse>({ kind: 'trace', code, given, maxSteps })
  const variables = (state: TraceResponse['states'][number] | undefined) =>
    Object.fromEntries((state?.variables ?? []).map((variable) => [variable.name, variable.value.text]))

  it('records each executed line with the state before and after it', () => {
    const result = trace(SUM_LOOP, 'numbers = [3, 1]\n')
    expect(result.status).toBe('ok')
    expect(result.steps.map((step) => step.line)).toEqual([1, 2, 3, 4, 5, 3, 4, 5, 3])
    expect(result.states).toHaveLength(result.steps.length + 1)
    expect(variables(result.states[0])).toEqual({ numbers: '[3, 1]' })
    // Step index 3 is the first run of line 4: total goes from 0 to 3.
    expect(variables(result.states[3])).toMatchObject({ total: '0', position: '0' })
    expect(variables(result.states[4])).toMatchObject({ total: '3', position: '0' })
    expect(variables(result.states.at(-1))).toMatchObject({ total: '4', position: '2' })
  })

  it('evaluates the parts of a line the way Python is about to', () => {
    const result = trace(SUM_LOOP, 'numbers = [3, 1]\n')
    const firstCondition = result.steps[2]
    expect(firstCondition?.insights).toEqual([
      { source: 'len(numbers)', role: 'value', value: { kind: 'int', text: '2' }, error: null },
      { source: 'position < len(numbers)', role: 'condition', value: { kind: 'bool', text: 'True' }, error: null },
    ])
    const lastCondition = result.steps.at(-1)
    expect(lastCondition?.insights.at(-1)).toMatchObject({ role: 'condition', value: { text: 'False' } })
    const secondAdd = result.steps[6]
    expect(secondAdd?.insights.map((insight) => [insight.source, insight.value?.text])).toEqual([
      ['numbers[position]', '1'],
      ['total + numbers[position]', '4'],
    ])
  })

  it('finds which variable is used as a position in which list', () => {
    expect(trace(SUM_LOOP, 'numbers = [3]\n').pairs).toEqual([{ list: 'numbers', index: 'position' }])
  })

  it('shows that not does not change the variable', () => {
    const result = trace('paused = False\nif not paused:\n    status = "running"')
    expect(result.steps[1]?.insights).toEqual([
      { source: 'not paused', role: 'condition', value: { kind: 'bool', text: 'True' }, error: null },
    ])
    expect(variables(result.states.at(-1))).toMatchObject({ paused: 'False', status: "'running'" })
  })

  it('ends on the line that raised an error', () => {
    const result = trace(SUM_LOOP.replace('<', '<='), 'numbers = [3]\n')
    expect(result.status).toBe('error')
    expect(result.error?.type).toBe('IndexError')
    expect(result.steps.at(-1)?.line).toBe(4)
    expect(result.steps.at(-1)?.insights[0]).toMatchObject({ source: 'numbers[position]', value: null, error: 'IndexError' })
  })

  it('stops recording after the step limit', () => {
    const result = trace('position = 0\nwhile position < 3:\n    waiting = True', '', 50)
    expect(result.status).toBe('trace-limit')
    expect(result.steps).toHaveLength(50)
    expect(result.states).toHaveLength(51)
  })

  it('does not evaluate anything that could have side effects', () => {
    const result = trace('items = [1, 2]\nlast = items.pop()\nsize = len(items)')
    expect(result.steps[1]?.insights).toEqual([])
    expect(variables(result.states.at(-1))).toMatchObject({ items: '[1]', last: '2', size: '1' })
  })
})

describe('looking at code without running it', () => {
  const inspect = (code: string, forbid: string[], givenNames: string[] = []) =>
    python.engine.call<InspectResponse>({ kind: 'inspect', code, forbid, givenNames })

  it('finds forbidden calls, including through another name', () => {
    expect(inspect('biggest = max(numbers)', ['max()']).forbidden).toEqual([{ what: 'max()', line: 1 }])
    expect(inspect('find = max\nbiggest = find(numbers)', ['max()']).forbidden).toEqual([{ what: 'max()', line: 1 }])
    expect(inspect('numbers.sort()', ['.sort()']).forbidden).toEqual([{ what: '.sort()', line: 1 }])
  })

  it('does not mistake a learner variable for the built-in', () => {
    expect(inspect('max = numbers[0]\nif numbers[1] > max:\n    max = numbers[1]', ['max()']).forbidden).toEqual([])
  })

  it('notices a given value replaced by a fixed one', () => {
    expect(inspect('numbers = [3, 1, 4]\ntotal = 0', [], ['numbers']).hardCoded).toEqual([{ name: 'numbers', line: 1 }])
    expect(inspect('numbers = numbers + numbers', [], ['numbers']).hardCoded).toEqual([])
  })
})

describe('a whole check job', () => {
  const job = (code: string): CheckJob => ({
    type: 'check',
    code,
    givenNames: ['numbers'],
    forbid: ['sum()'],
    unchanged: ['numbers'],
    fresh: [],
    inPlace: [],
    tests: [
      { name: 'three items', purpose: 'example', given: 'numbers = [3, 1, 4]\n', expect: { variables: { total: '8' }, stdout: null } },
      { name: 'one item', purpose: 'boundary', given: 'numbers = [5]\n', expect: { variables: { total: '5' }, stdout: null } },
      { name: 'negative numbers', purpose: 'sign', given: 'numbers = [-2, -3]\n', expect: { variables: { total: '-5' }, stdout: null } },
    ],
    mistakes: [],
  })

  it('passes when every test passes and no restriction is broken', () => {
    const result = runJob(python.engine, job(SUM_LOOP))
    expect(result.passed).toBe(true)
    expect(result.tests.map((entry) => entry.ran && entry.status)).toEqual(['pass', 'pass', 'pass'])
  })

  it('does not pass a correct result reached with a forbidden call', () => {
    const result = runJob(python.engine, job('total = sum(numbers)'))
    expect(result.tests.every((entry) => entry.ran && entry.status === 'pass')).toBe(true)
    expect(result.inspection.forbidden).toEqual([{ what: 'sum()', line: 1 }])
    expect(result.passed).toBe(false)
  })

  it('catches a program that hard-codes the example', () => {
    const result = runJob(python.engine, job('total = 8'))
    expect(result.passed).toBe(false)
    expect(result.tests.map((entry) => entry.ran && entry.status)).toEqual(['pass', 'fail', 'fail'])
  })

  it('reports a syntax error once instead of once per test', () => {
    const result = runJob(python.engine, job('total = = 3'))
    expect(result.tests.map((entry) => (entry.ran ? entry.status : 'not-run'))).toEqual(['syntax-error', 'not-run', 'not-run'])
  })

  it('reports progress test by test', () => {
    const events: string[] = []
    runJob(python.engine, job(SUM_LOOP), (event) => events.push(`${event.kind}:${event.index}`))
    expect(events).toEqual(['test-start:0', 'test-done:0', 'test-start:1', 'test-done:1', 'test-start:2', 'test-done:2'])
  })
})
