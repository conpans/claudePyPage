// The content collection with the lookups the rest of the app needs.
// All relationships (which problems use a skill, which follow-ups a challenge has) are
// worked out here from the content files, so no page keeps its own copy of them.

import type { ContentData, Item, Skill } from './schema.ts'

export class Content {
  readonly skills: readonly Skill[]
  readonly items: readonly Item[]
  private readonly itemsById: Map<string, Item>
  private readonly skillsById: Map<string, Skill>

  constructor(source: ContentData) {
    this.skills = source.skills
    this.items = source.items
    this.itemsById = new Map(source.items.map((item) => [item.id, item]))
    this.skillsById = new Map(source.skills.map((skill) => [skill.id, skill]))
  }

  item(id: string): Item | undefined {
    return this.itemsById.get(id)
  }

  skill(id: string): Skill | undefined {
    return this.skillsById.get(id)
  }

  /** The exercises of a skill unit, in teaching order. */
  exercisesOf(skillId: string): Item[] {
    const skill = this.skillsById.get(skillId)
    if (!skill) return []
    return skill.exercises.flatMap((id) => this.itemsById.get(id) ?? [])
  }

  get challenges(): Item[] {
    return this.items.filter((item) => item.tier === 'challenge')
  }

  /** Challenges and follow-ups: the "problems" a learner can browse. */
  get problems(): Item[] {
    return this.items.filter((item) => item.tier !== 'exercise')
  }

  followUpsOf(challengeId: string): Item[] {
    return this.items.filter((item) => item.variationOf === challengeId)
  }

  /** Challenges and follow-ups that use a skill. */
  problemsUsing(skillId: string): Item[] {
    return this.problems.filter((item) => item.skills.includes(skillId))
  }

  /** Items that list `itemId` as a warm-up. */
  buildsOn(itemId: string): Item[] {
    return this.items.filter((item) => item.prerequisites.includes(itemId))
  }

  list(ids: readonly string[]): Item[] {
    return ids.flatMap((id) => this.itemsById.get(id) ?? [])
  }

  skillsOf(item: Item): Skill[] {
    return item.skills.flatMap((id) => this.skillsById.get(id) ?? [])
  }
}
