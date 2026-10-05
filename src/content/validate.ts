// Reads raw content (parsed YAML) into the typed shapes of schema.ts and reports every
// problem it finds, with the file and field. The build fails when anything is reported, so
// the app never ships an exercise that is missing a part or points at something that does
// not exist. Whether solutions and expected values are *correct* is checked separately, by
// running real Python (tests/content.test.ts and scripts/verify-native.mjs).

import type {
  CodeItem,
  ContentData,
  CreateSpec,
  Demo,
  Domain,
  Example,
  Format,
  GivenSpec,
  GivenType,
  Item,
  JsonValue,
  Mistake,
  PredictItem,
  PredictQuestion,
  Skill,
  SkillSection,
  Source,
  TestCase,
  Tier,
  WrongAnswer,
} from './schema.ts'

export interface RawFile {
  file: string
  data: unknown
}

export interface BuildResult {
  content: ContentData
  /** Problems inside single files: missing fields, wrong types, values outside the stated domain. */
  errors: string[]
  /** Problems between files: an id that is used twice, or a link to something that does not exist. */
  referenceErrors: string[]
}

const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
const NAME_PATTERN = /^[a-z_][a-z0-9_]*$/
const FORBID_PATTERN = /^\.?[a-z_][a-z0-9_]*\(\)$/
const LEETCODE_URL = /^https:\/\/leetcode\.com\/problems\/[a-z0-9-]+\/$/

const TIERS: readonly Tier[] = ['exercise', 'challenge', 'variation']
const FORMATS: readonly Format[] = ['predict', 'fill', 'fix', 'write']
const GIVEN_TYPES: readonly GivenType[] = ['int', 'bool', 'str', 'list[int]', 'list[str]', 'list[bool]']
const SHOWS = ['wrong-result', 'error', 'never-stops'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function jsonProblem(value: unknown): string | null {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return 'numbers must be finite'
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) return `the whole number ${value} is too large to store exactly`
    return null
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const problem = jsonProblem(item)
      if (problem) return problem
    }
    return null
  }
  if (isRecord(value)) {
    for (const item of Object.values(value)) {
      const problem = jsonProblem(item)
      if (problem) return problem
    }
    return null
  }
  return `unsupported value of type ${typeof value}`
}

/** Reads fields of one YAML mapping, remembers which keys were used, and reports the rest. */
class Reader {
  private readonly used = new Set<string>()
  private readonly record: Record<string, unknown>
  readonly path: string
  private readonly errors: string[]

  constructor(record: Record<string, unknown>, path: string, errors: string[]) {
    this.record = record
    this.path = path
    this.errors = errors
  }

  static open(value: unknown, path: string, errors: string[]): Reader | null {
    if (!isRecord(value)) {
      errors.push(`${path}: expected a mapping (key: value pairs)`)
      return null
    }
    return new Reader(value, path, errors)
  }

  fail(key: string, message: string): void {
    this.errors.push(`${this.path}${key ? `.${key}` : ''}: ${message}`)
  }

  private take(key: string): unknown {
    this.used.add(key)
    return this.record[key]
  }

  has(key: string): boolean {
    return this.record[key] !== undefined && this.record[key] !== null
  }

  /** Text that must be present. Trailing whitespace (such as YAML's final newline) is removed. */
  text(key: string): string {
    const value = this.take(key)
    if (typeof value !== 'string' || value.trim() === '') {
      this.fail(key, 'is required and must be text')
      return ''
    }
    return value.trimEnd()
  }

  optionalText(key: string): string | null {
    const value = this.take(key)
    if (value === undefined || value === null) return null
    if (typeof value !== 'string' || value.trim() === '') {
      this.fail(key, 'must be text when present')
      return null
    }
    return value.trimEnd()
  }

  id(key: string): string {
    const value = this.text(key)
    if (value && !ID_PATTERN.test(value)) this.fail(key, `"${value}" must be lowercase words joined by hyphens`)
    return value
  }

  optionalId(key: string): string | null {
    const value = this.optionalText(key)
    if (value && !ID_PATTERN.test(value)) this.fail(key, `"${value}" must be lowercase words joined by hyphens`)
    return value
  }

  pythonName(key: string): string {
    const value = this.text(key)
    if (value && !NAME_PATTERN.test(value)) this.fail(key, `"${value}" must be a lowercase Python name such as running_totals`)
    return value
  }

  integer(key: string, min: number, max: number): number {
    const value = this.take(key)
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      this.fail(key, `must be a whole number from ${min} to ${max}`)
      return min
    }
    return value
  }

  optionalInteger(key: string): number | undefined {
    const value = this.take(key)
    if (value === undefined || value === null) return undefined
    if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
      this.fail(key, 'must be a whole number')
      return undefined
    }
    return value
  }

  choice<T extends string>(key: string, options: readonly T[]): T {
    const value = this.take(key)
    const found = options.find((option) => option === value)
    if (found === undefined) {
      this.fail(key, `must be one of: ${options.join(', ')}`)
      return options[0] as T
    }
    return found
  }

  list(key: string, minimum = 0): unknown[] {
    const value = this.take(key)
    if (value === undefined || value === null) {
      if (minimum > 0) this.fail(key, `needs at least ${minimum} ${minimum === 1 ? 'entry' : 'entries'}`)
      return []
    }
    if (!Array.isArray(value)) {
      this.fail(key, 'must be a list')
      return []
    }
    if (value.length < minimum) this.fail(key, `needs at least ${minimum} ${minimum === 1 ? 'entry' : 'entries'}`)
    return value
  }

  textList(key: string, minimum = 0): string[] {
    const result: string[] = []
    this.list(key, minimum).forEach((entry, index) => {
      if (typeof entry !== 'string' || entry.trim() === '') this.fail(`${key}[${index}]`, 'must be text')
      else result.push(entry.trimEnd())
    })
    return result
  }

  idList(key: string): string[] {
    const values = this.textList(key)
    values.forEach((value, index) => {
      if (!ID_PATTERN.test(value)) this.fail(`${key}[${index}]`, `"${value}" must be lowercase words joined by hyphens`)
    })
    if (new Set(values).size !== values.length) this.fail(key, 'lists the same entry twice')
    return values
  }

  /** A mapping whose values are plain data (numbers, text, True/False, lists). */
  values(key: string, required: boolean): Record<string, JsonValue> {
    const value = this.take(key)
    if (value === undefined || value === null) {
      if (required) this.fail(key, 'is required')
      return {}
    }
    if (!isRecord(value)) {
      this.fail(key, 'must be a mapping of names to values')
      return {}
    }
    const problem = jsonProblem(value)
    if (problem) {
      this.fail(key, problem)
      return {}
    }
    return value as Record<string, JsonValue>
  }

  child(key: string): Reader | null {
    const value = this.take(key)
    if (value === undefined || value === null) {
      this.fail(key, 'is required')
      return null
    }
    return Reader.open(value, `${this.path}.${key}`, this.errors)
  }

  optionalChild(key: string): Reader | null {
    const value = this.take(key)
    if (value === undefined || value === null) return null
    return Reader.open(value, `${this.path}.${key}`, this.errors)
  }

  children(key: string, minimum = 0): Reader[] {
    const readers: Reader[] = []
    this.list(key, minimum).forEach((entry, index) => {
      const reader = Reader.open(entry, `${this.path}.${key}[${index}]`, this.errors)
      if (reader) readers.push(reader)
    })
    return readers
  }

  /** Report keys nobody asked for. They are nearly always typos. */
  close(): void {
    for (const key of Object.keys(this.record)) {
      if (!this.used.has(key)) this.fail(key, 'is not a known field (check the spelling)')
    }
  }
}

function readSource(reader: Reader): Source {
  const source = reader.child('source')
  if (!source) return { type: 'original' }
  const type = source.choice('type', ['original', 'leetcode-adaptation'] as const)
  const result: Source = { type }
  if (type === 'leetcode-adaptation') {
    result.number = source.integer('number', 1, 100000)
    result.title = source.text('title')
    result.url = source.text('url')
    result.interfaceNote = source.text('interfaceNote')
    if (result.url && !LEETCODE_URL.test(result.url)) {
      source.fail('url', 'must look like https://leetcode.com/problems/<problem-name>/')
    }
  }
  source.close()
  return result
}

function readDomain(reader: Reader | null, type: GivenType, owner: Reader): Domain {
  const domain: Domain = {}
  if (!reader) {
    if (type !== 'bool' && type !== 'list[bool]' && type !== 'str') owner.fail('domain', 'is required for this type')
    if (type === 'list[bool]') owner.fail('domain', 'is required (minLen and maxLen)')
    return domain
  }
  const min = reader.optionalInteger('min')
  const max = reader.optionalInteger('max')
  const minLen = reader.optionalInteger('minLen')
  const maxLen = reader.optionalInteger('maxLen')
  if (min !== undefined) domain.min = min
  if (max !== undefined) domain.max = max
  if (minLen !== undefined) domain.minLen = minLen
  if (maxLen !== undefined) domain.maxLen = maxLen
  const oneOf = reader.list('oneOf')
  if (oneOf.length > 0) {
    if (oneOf.every((entry) => typeof entry === 'string' || typeof entry === 'number')) {
      domain.oneOf = oneOf as (string | number)[]
    } else {
      reader.fail('oneOf', 'must list text or number values')
    }
  }
  const isList = type.startsWith('list[')
  const hasNumbers = type === 'int' || type === 'list[int]'
  if (hasNumbers && domain.oneOf === undefined && (min === undefined || max === undefined)) {
    reader.fail('', 'needs min and max (the smallest and largest allowed number)')
  }
  if (min !== undefined && max !== undefined && min > max) reader.fail('', 'min is larger than max')
  if (isList && (minLen === undefined || maxLen === undefined)) reader.fail('', 'needs minLen and maxLen')
  if (!isList && (minLen !== undefined || maxLen !== undefined)) reader.fail('', 'minLen and maxLen only apply to lists')
  if (minLen !== undefined && maxLen !== undefined && minLen > maxLen) reader.fail('', 'minLen is larger than maxLen')
  reader.close()
  return domain
}

function readGiven(reader: Reader): GivenSpec {
  const name = reader.pythonName('name')
  const type = reader.choice('type', GIVEN_TYPES)
  const describe = reader.text('describe')
  const domain = readDomain(reader.optionalChild('domain'), type, reader)
  reader.close()
  return { name, type, describe, domain }
}

function inDomain(value: string | number, domain: Domain): string | null {
  if (domain.oneOf !== undefined && !domain.oneOf.includes(value)) {
    return `${JSON.stringify(value)} is not one of ${domain.oneOf.map((entry) => JSON.stringify(entry)).join(', ')}`
  }
  if (typeof value === 'number') {
    if (domain.min !== undefined && value < domain.min) return `${value} is below the stated minimum ${domain.min}`
    if (domain.max !== undefined && value > domain.max) return `${value} is above the stated maximum ${domain.max}`
  }
  return null
}

/** Why `value` is not allowed for this given variable, or null when it is allowed. */
export function givenValueProblem(spec: GivenSpec, value: JsonValue | undefined): string | null {
  if (value === undefined) return 'is missing'
  const { type, domain } = spec
  const single = (entry: JsonValue, kind: 'int' | 'bool' | 'str'): string | null => {
    if (kind === 'int') {
      if (typeof entry !== 'number' || !Number.isSafeInteger(entry)) return `${JSON.stringify(entry)} is not a whole number`
      return inDomain(entry, domain)
    }
    if (kind === 'bool') return typeof entry === 'boolean' ? null : `${JSON.stringify(entry)} is not true or false`
    if (typeof entry !== 'string') return `${JSON.stringify(entry)} is not text`
    return inDomain(entry, domain)
  }
  if (type === 'int' || type === 'bool' || type === 'str') return single(value, type)
  if (!Array.isArray(value)) return 'must be a list'
  if (domain.minLen !== undefined && value.length < domain.minLen) {
    return `has ${value.length} items, fewer than the stated minimum ${domain.minLen}`
  }
  if (domain.maxLen !== undefined && value.length > domain.maxLen) {
    return `has ${value.length} items, more than the stated maximum ${domain.maxLen}`
  }
  const kind = type === 'list[int]' ? 'int' : type === 'list[bool]' ? 'bool' : 'str'
  for (const entry of value) {
    const problem = single(entry, kind)
    if (problem) return problem
  }
  return null
}

function checkGivenValues(reader: Reader, key: string, values: Record<string, JsonValue>, given: GivenSpec[]): void {
  const expected = given.map((spec) => spec.name)
  const actual = Object.keys(values)
  for (const name of actual) {
    if (!expected.includes(name)) reader.fail(key, `sets "${name}", which is not one of the given variables`)
  }
  for (const spec of given) {
    const problem = givenValueProblem(spec, values[spec.name])
    if (problem) reader.fail(`${key}.${spec.name}`, problem)
  }
}

function checkResultNames(reader: Reader, key: string, values: Record<string, JsonValue>, create: CreateSpec[]): void {
  const expected = create.map((spec) => spec.name)
  const actual = Object.keys(values)
  for (const name of expected) {
    if (!actual.includes(name)) reader.fail(key, `is missing a value for "${name}"`)
  }
  for (const name of actual) {
    if (!expected.includes(name)) reader.fail(key, `has "${name}", which is not listed under create`)
  }
}

function readCodeParts(reader: Reader, base: BaseFields, format: CodeItem['format']): CodeItem {
  const given = reader.children('given').map(readGiven)
  const givenNames = given.map((spec) => spec.name)
  if (new Set(givenNames).size !== givenNames.length) reader.fail('given', 'uses the same name twice')

  const create: CreateSpec[] = reader.children('create').map((entry) => {
    const spec = { name: entry.pythonName('name'), describe: entry.text('describe') }
    entry.close()
    return spec
  })
  const prints = reader.optionalText('prints')
  if (create.length === 0 && prints === null) {
    reader.fail('create', 'the task must name a result variable (create) or describe what to print (prints)')
  }

  const unchanged = reader.textList('unchanged')
  unchanged.forEach((name) => {
    if (!givenNames.includes(name)) reader.fail('unchanged', `"${name}" is not a given variable`)
  })
  const fresh = reader.textList('fresh')
  fresh.forEach((name) => {
    if (!create.some((spec) => spec.name === name)) reader.fail('fresh', `"${name}" is not listed under create`)
  })
  const inPlace = reader.textList('inPlace')
  inPlace.forEach((name) => {
    if (!givenNames.includes(name)) reader.fail('inPlace', `"${name}" is not a given variable`)
    if (unchanged.includes(name)) reader.fail('inPlace', `"${name}" cannot be both unchanged and changed in place`)
  })
  const forbid = reader.textList('forbid')
  forbid.forEach((entry) => {
    if (!FORBID_PATTERN.test(entry)) reader.fail('forbid', `"${entry}" must look like max() or .sort()`)
  })

  const exampleGiven = reader.values('exampleGiven', given.length > 0)
  checkGivenValues(reader, 'exampleGiven', exampleGiven, given)

  const examples: Example[] = reader.children('examples', 1).map((entry) => {
    const exampleValues = entry.values('given', given.length > 0)
    checkGivenValues(entry, 'given', exampleValues, given)
    const result = entry.values('result', create.length > 0)
    checkResultNames(entry, 'result', result, create)
    const output = entry.optionalText('output')
    if (prints !== null && output === null) entry.fail('output', 'is required because the task prints')
    if (prints === null && output !== null) entry.fail('output', 'is not expected: the task does not say to print')
    const why = entry.optionalText('why')
    entry.close()
    return { given: exampleValues, result, output, why }
  })

  const tests: TestCase[] = reader.children('tests', 3).map((entry) => {
    const name = entry.text('name')
    const testValues = entry.values('given', given.length > 0)
    checkGivenValues(entry, 'given', testValues, given)
    const expect = entry.values('expect', create.length > 0)
    checkResultNames(entry, 'expect', expect, create)
    const output = entry.optionalText('output')
    if (prints !== null && output === null) entry.fail('output', 'is required because the task prints')
    if (prints === null && output !== null) entry.fail('output', 'is not expected: the task does not say to print')
    const purpose = entry.text('purpose')
    entry.close()
    return { name, given: testValues, expect, output, purpose }
  })
  const testNames = tests.map((test) => test.name)
  if (new Set(testNames).size !== testNames.length) reader.fail('tests', 'two tests share the same name')

  const mistakes: Mistake[] = reader.children('mistakes').map((entry) => {
    const id = entry.id('id')
    const label = entry.text('label')
    const shows = entry.choice('shows', SHOWS)
    const errorType = entry.optionalText('errorType')
    if (shows === 'error' && errorType === null) entry.fail('errorType', 'is required when shows is error (for example IndexError)')
    if (shows !== 'error' && errorType !== null) entry.fail('errorType', 'only applies when shows is error')
    const errorContains = entry.optionalText('errorContains')
    if (shows !== 'error' && errorContains !== null) entry.fail('errorContains', 'only applies when shows is error')
    const code = entry.text('code')
    const feedback = entry.text('feedback')
    entry.close()
    return { id, label, shows, errorType, errorContains, code, feedback }
  })
  const mistakeIds = mistakes.map((mistake) => mistake.id)
  if (new Set(mistakeIds).size !== mistakeIds.length) reader.fail('mistakes', 'two mistakes share the same id')

  const solutionReader = reader.child('solution')
  const solution = { code: solutionReader?.text('code') ?? '', walkthrough: solutionReader?.text('walkthrough') ?? '' }
  solutionReader?.close()

  return {
    ...base,
    format,
    given,
    where: reader.optionalText('where'),
    create,
    prints,
    unchanged,
    fresh,
    inPlace,
    forbid,
    starter: reader.optionalText('starter') ?? '',
    exampleGiven,
    examples,
    tests,
    mistakes,
    solution,
  }
}

type CodeOnly = Pick<
  CodeItem,
  | 'given'
  | 'where'
  | 'create'
  | 'prints'
  | 'unchanged'
  | 'fresh'
  | 'inPlace'
  | 'forbid'
  | 'starter'
  | 'exampleGiven'
  | 'examples'
  | 'tests'
  | 'mistakes'
  | 'solution'
>

/** The fields every item has, before the parts that depend on its format are read. */
type BaseFields = Omit<CodeItem, keyof CodeOnly | 'format'> & { format: Format }

function readPredictParts(reader: Reader, base: BaseFields): PredictItem {
  const program = reader.text('program')
  const questions: PredictQuestion[] = reader.children('questions', 1).map((entry) => {
    const ask = entry.text('ask')
    const about = entry.choice('about', ['output', 'value'] as const)
    const expression = entry.optionalText('expression')
    if (about === 'value' && expression === null) entry.fail('expression', 'is required when about is value')
    if (about === 'output' && expression !== null) entry.fail('expression', 'only applies when about is value')
    const answer = entry.text('answer')
    const wrong: WrongAnswer[] = entry.children('wrong').map((wrongEntry) => {
      const item = { answer: wrongEntry.text('answer'), feedback: wrongEntry.text('feedback') }
      wrongEntry.close()
      return item
    })
    entry.close()
    return { ask, about, expression, answer, wrong }
  })
  const solutionReader = reader.child('solution')
  const solution = { walkthrough: solutionReader?.text('walkthrough') ?? '' }
  solutionReader?.close()
  return { ...base, format: 'predict', program, questions, solution }
}

function readItem(raw: RawFile, errors: string[]): Item | null {
  const reader = Reader.open(raw.data, raw.file, errors)
  if (!reader) return null
  const tier = reader.choice('tier', TIERS)
  const format = reader.choice('format', FORMATS)
  const base = {
    id: reader.id('id'),
    title: reader.text('title'),
    tier,
    format,
    skill: reader.optionalId('skill'),
    skills: reader.idList('skills'),
    difficulty: reader.integer('difficulty', 1, 3) as 1 | 2 | 3,
    variationOf: reader.optionalId('variationOf'),
    newIdea: reader.optionalText('newIdea'),
    source: readSource(reader),
    goal: reader.text('goal'),
    statement: reader.text('statement'),
    rules: reader.textList('rules'),
    toWrite: reader.text('toWrite'),
    hints: reader.textList('hints', 2),
    explanation: reader.text('explanation'),
    prerequisites: reader.idList('prerequisites'),
    related: reader.idList('related'),
    next: reader.optionalId('next'),
  }
  const order = reader.optionalInteger('order')
  if (base.skills.length === 0) reader.fail('skills', 'needs at least one skill')
  if (tier === 'exercise') {
    if (base.skill === null) reader.fail('skill', 'is required for a skill exercise')
    else if (!base.skills.includes(base.skill)) reader.fail('skills', `must include its own unit "${base.skill}"`)
    if (base.variationOf !== null) reader.fail('variationOf', 'only applies to follow-ups (tier: variation)')
  } else {
    if (base.skill !== null) reader.fail('skill', 'only applies to skill exercises; list the skills under skills instead')
    if (base.newIdea === null) reader.fail('newIdea', 'is required: say which one idea this adds')
    if (tier === 'variation' && base.variationOf === null) reader.fail('variationOf', 'is required for a follow-up')
    if (tier === 'challenge' && base.variationOf !== null) reader.fail('variationOf', 'only applies to follow-ups (tier: variation)')
  }
  const item = format === 'predict' ? readPredictParts(reader, base) : readCodeParts(reader, base, format)
  reader.close()
  orderOf.set(item, order ?? 0)
  return item
}

/** Sort position for challenges and follow-ups (`order:` in the YAML). Not part of the item itself. */
const orderOf = new WeakMap<Item, number>()

function readDemo(reader: Reader | null): Demo | null {
  if (!reader) return null
  const demo = {
    title: reader.text('title'),
    given: reader.values('given', false),
    code: reader.text('code'),
    note: reader.optionalText('note'),
  }
  reader.close()
  return demo
}

function readSkill(raw: RawFile, errors: string[]): Skill | null {
  const reader = Reader.open(raw.data, raw.file, errors)
  if (!reader) return null
  const sections: SkillSection[] = reader.children('sections', 1).map((entry) => {
    const section = { title: entry.text('title'), body: entry.text('body'), demo: readDemo(entry.optionalChild('demo')) }
    entry.close()
    return section
  })
  const skill: Skill = {
    id: reader.id('id'),
    order: reader.integer('order', 1, 99),
    title: reader.text('title'),
    shortTitle: reader.text('shortTitle'),
    summary: reader.text('summary'),
    mixups: reader.textList('mixups', 1),
    sections,
    exercises: reader.idList('exercises'),
  }
  reader.close()
  return skill
}

function checkReferences(skills: Skill[], items: Item[], files: Map<string, string>, errors: string[]): void {
  const itemById = new Map(items.map((item) => [item.id, item]))
  const skillIds = new Set(skills.map((skill) => skill.id))
  const fileOf = (id: string) => files.get(id) ?? id

  for (const item of items) {
    const where = fileOf(item.id)
    for (const skill of item.skills) {
      if (!skillIds.has(skill)) errors.push(`${where}: skills: "${skill}" is not a skill`)
    }
    const references: [string, string[]][] = [
      ['prerequisites', item.prerequisites],
      ['related', item.related],
      ['next', item.next ? [item.next] : []],
      ['variationOf', item.variationOf ? [item.variationOf] : []],
    ]
    for (const [field, ids] of references) {
      for (const id of ids) {
        if (id === item.id) errors.push(`${where}: ${field}: an item cannot point at itself`)
        else if (!itemById.has(id)) errors.push(`${where}: ${field}: "${id}" does not exist`)
      }
    }
    if (item.variationOf) {
      const parent = itemById.get(item.variationOf)
      if (parent && parent.tier !== 'challenge') errors.push(`${where}: variationOf: "${item.variationOf}" is not a challenge`)
    }
    if (item.tier === 'exercise' && item.skill) {
      const unit = skills.find((skill) => skill.id === item.skill)
      if (unit && !unit.exercises.includes(item.id)) {
        errors.push(`${where}: this exercise is not listed under exercises in the skill "${item.skill}"`)
      }
    }
  }

  const orders = new Set<number>()
  for (const skill of skills) {
    const where = fileOf(`skill:${skill.id}`)
    if (orders.has(skill.order)) errors.push(`${where}: order: another skill already uses ${skill.order}`)
    orders.add(skill.order)
    if (skill.exercises.length < 3) errors.push(`${where}: exercises: a skill unit needs at least 3 exercises`)
    for (const id of skill.exercises) {
      const item = itemById.get(id)
      if (!item) errors.push(`${where}: exercises: "${id}" does not exist`)
      else if (item.tier !== 'exercise' || item.skill !== skill.id) {
        errors.push(`${where}: exercises: "${id}" must be a skill exercise whose skill is "${skill.id}"`)
      }
    }
  }
}

/** Turn raw YAML data into checked content. `errors` is empty when everything is in order. */
export function buildContent(rawSkills: RawFile[], rawItems: RawFile[]): BuildResult {
  const errors: string[] = []
  const files = new Map<string, string>()

  const skills: Skill[] = []
  for (const raw of rawSkills) {
    const skill = readSkill(raw, errors)
    if (!skill) continue
    if (files.has(`skill:${skill.id}`)) errors.push(`${raw.file}: id: "${skill.id}" is already used by ${files.get(`skill:${skill.id}`)}`)
    files.set(`skill:${skill.id}`, raw.file)
    skills.push(skill)
  }

  const items: Item[] = []
  for (const raw of rawItems) {
    const item = readItem(raw, errors)
    if (!item) continue
    if (files.has(item.id)) errors.push(`${raw.file}: id: "${item.id}" is already used by ${files.get(item.id)}`)
    files.set(item.id, raw.file)
    items.push(item)
  }

  const referenceErrors: string[] = []
  checkReferences(skills, items, files, referenceErrors)

  skills.sort((a, b) => a.order - b.order)
  const skillOrder = new Map(skills.map((skill) => [skill.id, skill.order]))
  const tierOrder: Record<Tier, number> = { exercise: 0, challenge: 1, variation: 2 }
  const position = (item: Item): number => {
    if (item.tier !== 'exercise' || !item.skill) return orderOf.get(item) ?? 0
    const unit = skills.find((skill) => skill.id === item.skill)
    return (skillOrder.get(item.skill) ?? 0) * 100 + (unit?.exercises.indexOf(item.id) ?? 0)
  }
  items.sort(
    (a, b) => tierOrder[a.tier] - tierOrder[b.tier] || position(a) - position(b) || a.title.localeCompare(b.title),
  )

  return { content: { skills, items }, errors, referenceErrors }
}
