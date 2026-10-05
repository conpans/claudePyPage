// Builds the "Copy context for help" message: a self-contained note the learner can paste
// into an AI chat (or send to a person) outside this app. The app never sends it anywhere.
//
// What goes in: the task as the learner sees it, their current code, the latest result, and
// the help they have already used. What stays out: the reference solution, hints they have
// not opened, and anything about the computer or other exercises.

import type { Content } from '../content/collection.ts'
import { givenSource } from '../content/python-literal.ts'
import { FORMAT_LABELS, isCodeItem, type CodeItem, type Item, type PredictItem } from '../content/schema.ts'
import type { Attempt } from '../state/progress.ts'

export interface HelpContextInput {
  item: Item
  content: Content
  /** The code in the editor right now (coding items). */
  code: string
  /** The given values used by Run, as Python source (coding items). */
  given: string
  /** The answers typed so far (prediction items). */
  answers: string[]
  attempt: Attempt | undefined
  /** The learner's own words about where they are stuck. May be empty. */
  confusion: string
}

function fence(code: string, language = 'python'): string {
  const body = code.replace(/\s+$/, '')
  return `\`\`\`${language}\n${body}\n\`\`\``
}

function bullet(lines: string[]): string {
  return lines.map((line) => `- ${line}`).join('\n')
}

function sourceLines(item: Item): string[] {
  if (item.source.type !== 'leetcode-adaptation') return ['Source: an original exercise from my practice app (Stepwise).']
  return [
    `Source: a practice adaptation of LeetCode ${item.source.number ?? ''}, "${item.source.title ?? ''}" (${item.source.url ?? ''}).`,
    'The practice version is a plain script, not LeetCode\'s class-and-method submission. The task text below is the adaptation, not LeetCode\'s wording.',
  ]
}

function contractSection(item: CodeItem): string {
  const lines: string[] = []
  if (item.given.length > 0) {
    lines.push('Given (the checker sets these variables before my code runs):')
    lines.push(bullet(item.given.map((spec) => `\`${spec.name}\`: ${spec.describe}`)))
  }
  if (item.create.length > 0) {
    lines.push('My code must leave the answer in:')
    lines.push(bullet(item.create.map((spec) => `\`${spec.name}\`: ${spec.describe}`)))
  }
  if (item.prints) lines.push(`My code must print: ${item.prints}`)
  if (item.rules.length > 0) {
    lines.push('Rules:')
    lines.push(bullet(item.rules))
  }
  if (item.forbid.length > 0) lines.push(`Not allowed in this exercise: ${item.forbid.map((entry) => `\`${entry}\``).join(', ')}.`)
  const example = item.examples[0]
  if (example) {
    const results = Object.entries(example.result).map(([name, value]) => `${name} == ${JSON.stringify(value)}`)
    if (example.output !== null) results.push(`prints:\n${example.output}`)
    lines.push(`Example: with ${givenSource(example.given).trim().replaceAll('\n', ', ') || 'nothing given'}, the result is ${results.join(', ')}.`)
  }
  return lines.join('\n')
}

function latestCheckSection(attempt: Attempt | undefined): string {
  const check = attempt?.lastCheck
  if (!check) return 'I have not run the checks on this code yet.'
  const lines = [`Result of my latest check: ${check.passedCount} of ${check.total} tests passed.`]
  for (const restriction of check.restrictions) lines.push(`The checker also said: ${restriction}`)
  const problem = check.problem
  if (!problem) return lines.join('\n')
  lines.push('', `First test that did not pass: "${problem.name}"`)
  lines.push(`Input: ${problem.given.trim().replaceAll('\n', ', ') || '(none)'}`)
  for (const line of problem.lines) {
    lines.push(`Expected ${line.target}: ${line.expected ?? '(nothing)'}`)
    lines.push(`Actual ${line.target}: ${line.missing ? '(my code never created this variable)' : (line.actual ?? '(nothing)')}`)
    if (line.note) lines.push(`Checker note: ${line.note}`)
  }
  if (problem.status === 'stopped') {
    lines.push(
      problem.stopReason === 'user'
        ? 'What happened: I stopped the program myself while it was still running.'
        : 'What happened: the program was still running at the time limit, so the app stopped it (it probably never ends).',
    )
  }
  if (problem.status === 'output-limit') lines.push('What happened: the program printed more than the app allows, so it was stopped.')
  if (problem.error) {
    const where = problem.error.line ? ` on line ${problem.error.line}` : ''
    lines.push(`Error: ${problem.error.type}: ${problem.error.message}${where}`)
  } else if (problem.status === 'pass' || problem.status === 'fail') {
    lines.push('Error: none (the program ran to the end).')
  }
  if (problem.output.trim()) lines.push('What my program printed:', fence(problem.output, 'text'))
  if (problem.feedback) lines.push(`Feedback the app showed me: ${problem.feedback}`)
  return lines.join('\n')
}

function predictSection(item: PredictItem, answers: string[], attempt: Attempt | undefined): string {
  const lines = ['This is a prediction exercise: I read the program and say what it does, without running it.', '', fence(item.program), '']
  const judged = attempt?.lastPredict
  item.questions.forEach((question, index) => {
    const answer = (answers[index] ?? '').trim()
    lines.push(`Question ${index + 1}: ${question.ask}`)
    lines.push(answer ? `My answer:\n${fence(answer, 'text')}` : 'My answer: (nothing yet)')
    if (judged && judged.answers[index] === answers[index]) {
      lines.push(judged.correct[index] ? 'The app marked this answer right.' : 'The app marked this answer wrong.')
    }
    lines.push('')
  })
  lines.push('The true results are not included here on purpose. Please help me trace the program myself instead of telling me the answer.')
  return lines.join('\n')
}

function helpUsedSection(item: Item, content: Content, attempt: Attempt | undefined): string {
  const lines: string[] = []
  const hints = attempt?.help.hints ?? 0
  for (let index = 0; index < hints; index += 1) {
    const hint = item.hints[index]
    if (hint) lines.push(`Hint ${index + 1} (I have read it): ${hint.replaceAll('\n', ' ').trim()}`)
  }
  if (attempt?.help.explanation) lines.push('I have read the app\'s explanation of the idea.')
  if (attempt?.help.steppedThrough) lines.push('I have stepped through the program in the app.')
  lines.push(attempt?.help.solution ? 'I have opened the worked solution.' : 'I have not opened the worked solution, and I would like to get there myself.')
  const visited = content.list(attempt?.prerequisitesVisited ?? [])
  if (visited.length > 0) lines.push(`Warm-up exercises I went to from here: ${visited.map((entry) => entry.title).join(', ')}.`)
  if (hints === 0) lines.unshift('I have not opened any hints yet.')
  return bullet(lines)
}

export function buildHelpContext(input: HelpContextInput): string {
  const { item, content, attempt } = input
  const skills = content.skillsOf(item).map((skill) => skill.shortTitle)
  const parts: string[] = [
    'I am learning Python and I am stuck on a practice exercise. Please help me find the specific gap in my understanding.',
    '',
    '## How to help me',
    bullet([
      'I am a beginner, working through the University of Helsinki Python MOOC (around Part 2).',
      'Please use concrete values and small examples, in plain language, one new idea at a time.',
      'First work out what exactly I have misunderstood. Then start with a small explanation or a hint aimed at that one thing.',
      'Please do not give me the finished solution unless I ask for it.',
    ]),
    '',
    '## The exercise',
    `Title: ${item.title}`,
    `Identifier: ${item.id}`,
    `Kind: ${FORMAT_LABELS[item.format]}${skills.length > 0 ? ` (skills: ${skills.join(', ')})` : ''}`,
    ...sourceLines(item),
    '',
    `Goal: ${item.goal}`,
    '',
    item.statement,
    '',
  ]

  if (isCodeItem(item)) {
    parts.push('## What my code has to do (the checker\'s contract)', contractSection(item), '')
    parts.push('## My current code', fence(input.code.trim() ? input.code : '# (nothing written yet)'), '')
    if (item.format !== 'write' && item.starter.trim()) {
      parts.push(item.format === 'fix' ? 'The program I was given to repair:' : 'The starter I was given:', fence(item.starter), '')
    }
    parts.push('## Latest result', latestCheckSection(attempt), '')
  } else {
    parts.push('## The program and my answers', predictSection(item, input.answers, attempt), '')
  }

  parts.push('## Help I have already used in the app', helpUsedSection(item, content, attempt), '')
  parts.push('## Where I am confused', input.confusion.trim() || '(I have not described it. Please ask me one question to find out.)')
  return parts.join('\n').replace(/\n{3,}/g, '\n\n') + '\n'
}
