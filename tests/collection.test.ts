// The shape of the whole collection: what the first release promised, checked as a whole.
// (Single items are verified with real Python in content.test.ts.)

import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { readContent } from '../build/content-plugin.ts'
import { Content } from '../src/content/collection.ts'
import { isCodeItem } from '../src/content/schema.ts'

const { content: data, errors, referenceErrors } = readContent(resolve(import.meta.dirname, '../content'))
const content = new Content(data)

const EXPECTED_SKILLS = ['assignment', 'positions', 'loops', 'conditions', 'accumulators', 'append']
const EXPECTED_CHALLENGES = ['copy-list', 'repeat-list', 'running-totals', 'count-matching', 'values-in-range', 'greatest-value']

describe('the collection', () => {
  it('is complete and consistent', () => {
    expect(errors).toEqual([])
    expect(referenceErrors).toEqual([])
  })

  it('has the six skill units, each with at least three exercises in a mix of formats', () => {
    expect(content.skills.map((skill) => skill.id)).toEqual(EXPECTED_SKILLS)
    for (const skill of content.skills) {
      const exercises = content.exercisesOf(skill.id)
      expect(exercises.length, skill.id).toBeGreaterThanOrEqual(3)
      const formats = new Set(exercises.map((item) => item.format))
      expect(formats.size, `${skill.id} mixes formats`).toBeGreaterThanOrEqual(3)
      expect(skill.sections.some((section) => section.demo !== null), `${skill.id} has a step-through example`).toBe(true)
    }
  })

  it('has the six challenges, each with at least one follow-up', () => {
    expect(content.challenges.map((item) => item.id)).toEqual(EXPECTED_CHALLENGES)
    for (const challenge of content.challenges) {
      expect(content.followUpsOf(challenge.id).length, challenge.id).toBeGreaterThanOrEqual(1)
      expect(challenge.prerequisites.length, `${challenge.id} names warm-ups`).toBeGreaterThanOrEqual(2)
      expect(challenge.skills.length, `${challenge.id} uses several skills`).toBeGreaterThanOrEqual(2)
    }
  })

  it('links the repeat-list and running-totals challenges to the verified official LeetCode problems', () => {
    expect(content.item('repeat-list')?.source).toMatchObject({
      type: 'leetcode-adaptation',
      number: 1929,
      title: 'Concatenation of Array',
      url: 'https://leetcode.com/problems/concatenation-of-array/',
    })
    expect(content.item('running-totals')?.source).toMatchObject({
      type: 'leetcode-adaptation',
      number: 1480,
      title: 'Running Sum of 1d Array',
      url: 'https://leetcode.com/problems/running-sum-of-1d-array/',
    })
    for (const id of ['repeat-list', 'running-totals']) {
      expect(content.item(id)?.source.interfaceNote ?? '').toContain('class Solution')
    }
    const adaptations = content.items.filter((item) => item.source.type === 'leetcode-adaptation')
    expect(adaptations.map((item) => item.id).sort()).toEqual(['repeat-list', 'running-totals'])
  })

  it('reuses skills across problems, so the same skill supports several challenges', () => {
    for (const skill of content.skills) {
      expect(content.problemsUsing(skill.id).length, `${skill.id} is used by at least one problem`).toBeGreaterThanOrEqual(1)
    }
    const reused = content.skills.filter((skill) => content.problemsUsing(skill.id).length >= 2)
    expect(reused.length, 'most skills are used by several problems').toBeGreaterThanOrEqual(4)
    for (const challenge of content.challenges) {
      const shared = challenge.skills.filter((skill) => content.problemsUsing(skill).length >= 2)
      expect(shared.length, `${challenge.id} shares skills with other problems`).toBeGreaterThanOrEqual(1)
    }
  })

  it('has every coding item state its boundaries, tests and prepared mistakes', () => {
    for (const item of content.items) {
      expect(item.hints.length, `${item.id} hints`).toBeGreaterThanOrEqual(2)
      expect(item.rules.length, `${item.id} rules`).toBeGreaterThanOrEqual(1)
      if (!isCodeItem(item)) continue
      expect(item.tests.length, `${item.id} tests`).toBeGreaterThanOrEqual(3)
      expect(item.mistakes.length, `${item.id} mistakes`).toBeGreaterThanOrEqual(1)
      for (const spec of item.given) {
        const named = item.rules.join(' ').includes(spec.name) || item.statement.includes(spec.name)
        expect(named, `${item.id} mentions ${spec.name} in its statement or rules`).toBe(true)
      }
    }
  })

  it('keeps reference solutions and prepared programs within what the learner has met', () => {
    const forbidden = [/\bfor\b/, /\brange\(/, /\bdef\b/, /\[[^\]]*:[^\]]*\]/]
    for (const item of content.items) {
      const code = isCodeItem(item) ? item.solution.code : item.program
      for (const pattern of forbidden) {
        expect(pattern.test(code), `${item.id} solution uses ${pattern}`).toBe(false)
      }
    }
    for (const skill of content.skills) {
      for (const section of skill.sections) {
        if (!section.demo) continue
        for (const pattern of forbidden) {
          expect(pattern.test(section.demo.code), `${skill.id} demo "${section.demo.title}" uses ${pattern}`).toBe(false)
        }
      }
    }
  })

  it('avoids the words that talk down to a learner', () => {
    const banned = /\b(simply|just|obviously|obvious|trivial|trivially|easy|easily)\b/i
    const texts: [string, string][] = []
    for (const item of content.items) {
      texts.push([`${item.id} statement`, item.statement], [`${item.id} explanation`, item.explanation])
      item.hints.forEach((hint, index) => texts.push([`${item.id} hint ${index + 1}`, hint]))
      texts.push([`${item.id} walkthrough`, item.solution.walkthrough])
      if (isCodeItem(item)) item.mistakes.forEach((mistake) => texts.push([`${item.id} mistake ${mistake.id}`, mistake.feedback]))
    }
    for (const skill of content.skills) {
      skill.sections.forEach((section) => texts.push([`${skill.id} section "${section.title}"`, section.body]))
    }
    const offenders = texts.filter(([, text]) => banned.test(text)).map(([where, text]) => `${where}: "${banned.exec(text)?.[0]}"`)
    expect(offenders).toEqual([])
  })
})
