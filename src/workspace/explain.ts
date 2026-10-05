// Prepared explanations for the errors a beginner meets most often.
// These are fixed rules keyed on the kind of error and its message. Nothing here guesses at
// what the learner intended; each explanation says what Python reported and where to look.

import type { ErrorInfo, RunStatus, StopReason, VariableView } from '../python/protocol.ts'

export interface Explanation {
  /** What happened, in one sentence. */
  summary: string
  /** What usually causes it and where to look. May use inline `code`. */
  detail: string
}

function variable(variables: VariableView[], name: string): VariableView | undefined {
  return variables.find((entry) => entry.name === name)
}

/** For `numbers[position]` on the failing line: the list's length and the position's value. */
function indexFacts(error: ErrorInfo, variables: VariableView[]): string | null {
  if (!error.lineText) return null
  for (const match of error.lineText.matchAll(/([A-Za-z_][A-Za-z0-9_]*)\[([A-Za-z_][A-Za-z0-9_]*)\]/g)) {
    const list = variable(variables, match[1] ?? '')
    const position = variable(variables, match[2] ?? '')
    if (list?.value.kind === 'list' && position?.value.kind === 'int' && list.value.length !== undefined) {
      const length = list.value.length
      const value = Number(position.value.text)
      if (value >= length || value < -length) {
        const range = length === 0 ? 'it has no positions at all' : `its positions go from 0 to ${length - 1}`
        return `At that moment \`${position.name}\` was ${position.value.text} and \`${list.name}\` had ${length} ${length === 1 ? 'item' : 'items'}, so ${range}.`
      }
    }
  }
  return null
}

/** How many single-character edits turn one name into the other. */
function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i]
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current.push(Math.min((previous[j] ?? 0) + 1, (current[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost))
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/** Existing variable names that are nearly the name Python did not recognize. */
function closeNames(target: string, variables: VariableView[]): string[] {
  const allowed = Math.max(1, Math.floor(target.length / 4))
  return variables
    .map((entry) => entry.name)
    .filter((name) => name !== target && editDistance(name.toLowerCase(), target.toLowerCase()) <= allowed)
    .slice(0, 2)
}

function explainSyntax(error: ErrorInfo): Explanation {
  const message = error.message
  const where = error.line ? `line ${error.line}` : 'the code'
  const summary = `Python could not read ${where}, so nothing was run.`
  if (error.type === 'IndentationError' || error.type === 'TabError') {
    if (message.includes('expected an indented block')) {
      return { summary, detail: 'The line after `if`, `elif`, `else` or `while` has to be indented. Four spaces is the usual amount.' }
    }
    if (message.includes('unexpected indent')) {
      return { summary, detail: 'This line is indented, but no line above it starts a block. Lines only move right under an `if`, `elif`, `else` or `while` line.' }
    }
    return { summary, detail: 'The indentation of this line does not line up with the lines around it. Lines in the same block start in the same column.' }
  }
  if (message.includes("expected ':'")) {
    return { summary, detail: 'A line that starts a block (`if`, `elif`, `else`, `while`) ends with a colon `:`.' }
  }
  if (message.includes("Maybe you meant '=='")) {
    return { summary, detail: 'To compare two values, write `==`. A single `=` stores a value in a name.' }
  }
  if (message.includes('was never closed')) {
    return { summary, detail: 'A bracket was opened and not closed. Every `(` needs a `)`, and every `[` needs a `]`.' }
  }
  if (message.includes('unterminated string') || message.includes('EOL while scanning')) {
    return { summary, detail: 'A piece of text was started with a quotation mark and never closed with a matching one.' }
  }
  if (message.includes('does not match') || message.includes('unmatched')) {
    return { summary, detail: 'The brackets on this line do not pair up. Count the opening and the closing ones.' }
  }
  if (message.includes('cannot assign to')) {
    return { summary, detail: 'The left side of `=` has to be a name (or a list position) that can store a value. To compare two values, write `==`.' }
  }
  return { summary, detail: 'Look at the marked line and the one just above it for a missing colon, bracket or quotation mark.' }
}

/** Explain an error from a run. `variables` are the values at the moment it happened. */
export function explainError(error: ErrorInfo, variables: VariableView[], syntax: boolean): Explanation {
  if (syntax) return explainSyntax(error)
  const message = error.message
  const where = error.line ? ` on line ${error.line}` : ''
  switch (error.type) {
    case 'NameError': {
      const name = /name '([^']+)'/.exec(message)?.[1] ?? ''
      const similar = closeNames(name, variables)
      const hint = similar.length > 0 ? ` Did you mean ${similar.map((entry) => `\`${entry}\``).join(' or ')}?` : ''
      return {
        summary: `Python does not know the name \`${name}\`${where}.`,
        detail: `Either the name is spelled differently from where it was created, or the line that creates it has not run yet.${hint}`,
      }
    }
    case 'IndexError':
      return {
        summary: `The program asked for a position that has no item${where}.`,
        detail:
          indexFacts(error, variables) ??
          'A list with 3 items has the positions 0, 1 and 2. Position 3, which equals its length, is one past the end.',
      }
    case 'AttributeError': {
      if (message.includes("'NoneType' object has no attribute 'append'")) {
        return {
          summary: `\`.append\` was used on something that is None${where}.`,
          detail: 'A variable becomes None after a line like `result = result.append(item)`. `append()` changes the list and hands nothing back, so it needs no `=`.',
        }
      }
      const kind = /'(\w+)' object has no attribute 'append'/.exec(message)?.[1]
      if (kind) {
        const what = kind === 'int' ? 'a whole number' : kind === 'str' ? 'a piece of text' : `a value of type ${kind}`
        return {
          summary: `\`.append\` was used on ${what}, not on a list${where}.`,
          detail: 'The list that receives the item goes before the dot. The item goes inside the parentheses: `receiving_list.append(item)`.',
        }
      }
      return { summary: `${error.type}: ${message}${where}.`, detail: 'The thing before the dot does not have that feature. Check which variable is written there.' }
    }
    case 'TypeError': {
      if (message.includes('object is not subscriptable')) {
        const kind = /'(\w+)' object/.exec(message)?.[1] ?? ''
        if (kind === 'builtin_function_or_method' || kind === 'function' || kind === 'method') {
          return {
            summary: `Square brackets were used after a function name${where}.`,
            detail: 'A function such as `len` or `append` is called with parentheses: `len(numbers)`, `result.append(item)`. Square brackets are for reading a position of a list.',
          }
        }
        const what = kind === 'int' ? 'a whole number' : kind === 'NoneType' ? 'None' : `a value of type ${kind}`
        return {
          summary: `Square brackets were used on ${what}, not on a list${where}.`,
          detail: 'The name before `[` has to be the list. Inside the brackets goes the position.',
        }
      }
      if (message.includes('object is not callable')) {
        const kind = /'(\w+)' object/.exec(message)?.[1] ?? ''
        return {
          summary: `Parentheses were used after ${kind === 'list' ? 'a list' : kind === 'int' ? 'a whole number' : 'a value'}, as if it were a function${where}.`,
          detail: 'To read an item of a list, use square brackets with the position: `numbers[position]`. Parentheses call a function.',
        }
      }
      if (message.includes('list indices must be integers')) {
        return {
          summary: `A position has to be a whole number${where}.`,
          detail: 'Inside the square brackets Python found something else, such as text, a decimal number or a whole list.',
        }
      }
      if (message.includes('can only concatenate str') || (message.includes('unsupported operand') && message.includes("'str'"))) {
        return {
          summary: `Python cannot combine text and a number with that operator${where}.`,
          detail:
            'Check what each value on that line holds: one of them is text (a string). To put a number into text, use an f-string, for example `f"Total: {total}"`. To count or add up items, make sure the thing being added is a number and not the text.',
        }
      }
      if (message.includes("'NoneType'")) {
        return {
          summary: `A value was None where a number or a list was needed${where}.`,
          detail: 'A variable is None when it was given the result of something that hands nothing back, such as `append()` or `print()`.',
        }
      }
      return { summary: `TypeError: ${message}${where}.`, detail: 'Two values of kinds that do not fit together were combined. Check what each variable on that line holds.' }
    }
    case 'ZeroDivisionError':
      return { summary: `The program divided by zero${where}.`, detail: 'Check the value of the variable after the `/` on that line.' }
    case 'ValueError':
      return { summary: `ValueError: ${message}${where}.`, detail: 'A function was given a value it cannot work with.' }
    case 'RecursionError':
      return { summary: `A function kept calling itself${where}.`, detail: 'Python stops after about a thousand nested calls.' }
    case 'MemoryError':
      return { summary: 'The program ran out of memory.', detail: 'A list or a piece of text grew without limit. Look for a loop that keeps adding to it.' }
    case 'RuntimeError':
      if (message.includes('input() is not used')) {
        return { summary: 'This app does not use `input()`.', detail: 'The values your program needs are already stored in the given variables, so it can use them directly.' }
      }
      return { summary: `RuntimeError: ${message}${where}.`, detail: '' }
    default:
      return { summary: `${error.type}: ${message}${where}.`, detail: '' }
  }
}

/** Explain a program that was stopped from outside or by a limit. */
export function explainStop(status: RunStatus | 'fail' | 'pass', stopReason: StopReason | undefined, hardStop: boolean | undefined, seconds: number): Explanation | null {
  if (status === 'output-limit') {
    return {
      summary: 'The program printed more than 20,000 characters, so it was stopped.',
      detail: 'That usually means a loop is running many more rounds than intended. Check that the variable in its condition changes inside the loop.',
    }
  }
  if (status !== 'stopped') return null
  const lost = hardStop ? ' It did not respond to the stop request, so Python was restarted and its output could not be kept.' : ''
  if (stopReason === 'user') {
    return { summary: `You stopped the program.${lost}`, detail: 'The variables below show where it had got to.' }
  }
  return {
    summary: `The program was still running after ${seconds} seconds, so it was stopped.${lost}`,
    detail:
      'A loop runs without end when its condition never becomes False. Look at the variables in the condition: does a line inside the loop change the position on every round? And if the condition uses `len()` of a list that the loop itself makes longer, the end moves away as fast as the position moves.',
  }
}
