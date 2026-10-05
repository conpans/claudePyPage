// The shape of all learning content. Content lives in YAML files under content/ and is
// checked against these shapes when the app is built (see validate.ts).

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type Tier = 'exercise' | 'challenge' | 'variation'
export type Format = 'predict' | 'fill' | 'fix' | 'write'

export const TIER_LABELS: Record<Tier, string> = {
  exercise: 'Skill exercise',
  challenge: 'Challenge',
  variation: 'Follow-up',
}

export const FORMAT_LABELS: Record<Format, string> = {
  predict: 'Predict the result',
  fill: 'Write the missing line',
  fix: 'Repair a bug',
  write: 'Write a program',
}

export const DIFFICULTY_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Gentle',
  2: 'Middle',
  3: 'Stretch',
}

export interface Source {
  /** `original` was written for this app. `leetcode-adaptation` practises the idea of an official problem. */
  type: 'original' | 'leetcode-adaptation'
  number?: number
  title?: string
  url?: string
  /** How this local practice version differs from the official submission interface. */
  interfaceNote?: string
}

export type GivenType = 'int' | 'bool' | 'str' | 'list[int]' | 'list[str]' | 'list[bool]'

/** The values a given variable may take. Tests and examples must stay inside it. */
export interface Domain {
  min?: number
  max?: number
  minLen?: number
  maxLen?: number
  oneOf?: (string | number)[]
}

export interface GivenSpec {
  name: string
  type: GivenType
  describe: string
  domain: Domain
}

export interface CreateSpec {
  name: string
  describe: string
}

export interface Example {
  given: Record<string, JsonValue>
  result: Record<string, JsonValue>
  output: string | null
  why: string | null
}

export interface TestCase {
  name: string
  given: Record<string, JsonValue>
  expect: Record<string, JsonValue>
  output: string | null
  /** What this test is there to catch. Shown to the learner and to anyone extending the content. */
  purpose: string
}

export interface Mistake {
  id: string
  label: string
  /** How the mistake shows itself when the checker runs it. */
  shows: 'wrong-result' | 'error' | 'never-stops'
  errorType: string | null
  /** For `error`: text the message must contain, when two mistakes raise the same error type. */
  errorContains: string | null
  /** A complete wrong program. It is verified to fail, and used to recognise the same mistake. */
  code: string
  feedback: string
}

interface ItemBase {
  id: string
  title: string
  tier: Tier
  format: Format
  /** The skill unit this exercise belongs to. Only for tier `exercise`. */
  skill: string | null
  /** Every skill the item uses. */
  skills: string[]
  /** 1 to 3, relative to this collection only. */
  difficulty: 1 | 2 | 3
  /** For follow-ups: the challenge this one varies. */
  variationOf: string | null
  /** For challenges and follow-ups: the one idea this adds beyond its warm-ups. */
  newIdea: string | null
  source: Source
  goal: string
  statement: string
  rules: string[]
  toWrite: string
  hints: string[]
  explanation: string
  prerequisites: string[]
  related: string[]
  /** A different item that applies the same idea, offered after the worked solution is revealed. */
  next: string | null
}

export interface CodeItem extends ItemBase {
  format: 'fill' | 'fix' | 'write'
  given: GivenSpec[]
  /** A Python expression over the given names that must hold, such as `low <= high`. */
  where: string | null
  create: CreateSpec[]
  /** Describes the required printed output, when printing is part of the task. */
  prints: string | null
  /** Given lists the program must leave exactly as they were. */
  unchanged: string[]
  /** Result lists that must be new lists, not a second name for a given list. */
  fresh: string[]
  /** Given lists the program must change itself, instead of building a new list. */
  inPlace: string[]
  forbid: string[]
  starter: string
  exampleGiven: Record<string, JsonValue>
  examples: Example[]
  tests: TestCase[]
  mistakes: Mistake[]
  solution: { code: string; walkthrough: string }
}

export interface WrongAnswer {
  answer: string
  feedback: string
}

export interface PredictQuestion {
  ask: string
  about: 'output' | 'value'
  expression: string | null
  /** The author's answer. Verified against a real run of the program. */
  answer: string
  wrong: WrongAnswer[]
}

export interface PredictItem extends ItemBase {
  format: 'predict'
  program: string
  questions: PredictQuestion[]
  solution: { walkthrough: string }
}

export type Item = CodeItem | PredictItem

export function isCodeItem(item: Item): item is CodeItem {
  return item.format !== 'predict'
}

export interface Demo {
  title: string
  given: Record<string, JsonValue>
  code: string
  note: string | null
}

export interface SkillSection {
  title: string
  body: string
  demo: Demo | null
}

export interface Skill {
  id: string
  order: number
  title: string
  shortTitle: string
  summary: string
  /** The specific mix-ups this unit is built around, in plain words. */
  mixups: string[]
  sections: SkillSection[]
  exercises: string[]
}

export interface ContentData {
  skills: Skill[]
  items: Item[]
}
