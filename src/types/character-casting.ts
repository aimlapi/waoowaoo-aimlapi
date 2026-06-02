export interface CharacterVisualTraits {
  face: string
  hair: string
  body: string
  costume: string
  makeupAndAccessories: string
  skin: string
  visibleState: string
  accessibility: string
  tattoosAndMarks: string
  scars: string
}

export interface CharacterCastingNotes {
  score: number | null
  strengths: string[]
  risks: string[]
  recommendation: string
  fitTags: string[]
}

export type CharacterCastingStillKind = 'neutral' | 'crying' | 'smiling' | 'costume' | 'prop' | 'background'

export interface CharacterCastingStill {
  kind: CharacterCastingStillKind
  title: string
  prompt: string
  expression: string
  prop: string
  background: string
  purpose: string
}

export interface CharacterAppearanceCandidateMetadata {
  description: string
  visualTraits: CharacterVisualTraits
  castingNotes: CharacterCastingNotes
  castingStills: CharacterCastingStill[]
}

const EMPTY_TRAITS: CharacterVisualTraits = {
  face: '',
  hair: '',
  body: '',
  costume: '',
  makeupAndAccessories: '',
  skin: '',
  visibleState: '',
  accessibility: '',
  tattoosAndMarks: '',
  scars: '',
}

const EMPTY_CASTING_NOTES: CharacterCastingNotes = {
  score: null,
  strengths: [],
  risks: [],
  recommendation: '',
  fitTags: [],
}

const CASTING_STILL_KINDS: readonly CharacterCastingStillKind[] = [
  'neutral',
  'crying',
  'smiling',
  'costume',
  'prop',
  'background',
]

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map(readString).filter(Boolean)
}

function readCastingStillKind(value: unknown): CharacterCastingStillKind | null {
  if (typeof value !== 'string') return null
  return CASTING_STILL_KINDS.find((kind) => kind === value) ?? null
}

function readScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function readNestedRecord(record: Record<string, unknown>, keys: readonly string[]): Record<string, unknown> {
  for (const key of keys) {
    const candidate = record[key]
    if (isRecord(candidate)) return candidate
  }
  return {}
}

function normalizeTraits(value: unknown): CharacterVisualTraits {
  if (!isRecord(value)) return { ...EMPTY_TRAITS }
  return {
    face: readString(value.face ?? value.facial_profile ?? value.facialProfile),
    hair: readString(value.hair ?? value.hair_profile ?? value.hairProfile),
    body: readString(value.body ?? value.body_profile ?? value.bodyProfile),
    costume: readString(value.costume ?? value.costume_and_styling ?? value.costumeAndStyling),
    makeupAndAccessories: readString(value.makeup_and_accessories ?? value.makeupAndAccessories ?? value.accessories),
    skin: readString(value.skin ?? value.skin_profile ?? value.skinProfile),
    visibleState: readString(value.visible_state ?? value.visibleState),
    accessibility: readString(value.accessibility ?? value.accessibility_features ?? value.accessibilityFeatures),
    tattoosAndMarks: readString(value.tattoos_and_marks ?? value.tattoosAndMarks ?? value.marks),
    scars: readString(value.scars ?? value.visible_scars ?? value.visibleScars),
  }
}

function normalizeCastingNotes(value: unknown): CharacterCastingNotes {
  if (!isRecord(value)) return { ...EMPTY_CASTING_NOTES }
  return {
    score: readScore(value.score ?? value.casting_score ?? value.castingScore),
    strengths: readStringArray(value.strengths),
    risks: readStringArray(value.risks),
    recommendation: readString(value.recommendation ?? value.summary),
    fitTags: readStringArray(value.fit_tags ?? value.fitTags),
  }
}

function normalizeCastingStill(value: unknown): CharacterCastingStill | null {
  if (!isRecord(value)) return null
  const kind = readCastingStillKind(value.kind)
  const prompt = readString(value.prompt ?? value.description)
  if (!kind || !prompt) return null
  return {
    kind,
    title: readString(value.title) || kind,
    prompt,
    expression: readString(value.expression),
    prop: readString(value.prop),
    background: readString(value.background),
    purpose: readString(value.purpose),
  }
}

function normalizeCastingStills(value: unknown): CharacterCastingStill[] {
  if (!Array.isArray(value)) return []
  return value
    .map(normalizeCastingStill)
    .filter((item): item is CharacterCastingStill => !!item)
}

function normalizeCandidateFromRecord(
  value: Record<string, unknown>,
  fallbackDescription: string,
): CharacterAppearanceCandidateMetadata {
  const traits = readNestedRecord(value, ['visual_traits', 'visualTraits', 'traits'])
  const castingNotes = readNestedRecord(value, ['casting_notes', 'castingNotes', 'casting'])
  const castingStills = value.casting_stills ?? value.castingStills ?? value.stills
  return {
    description: readString(value.description ?? value.prompt) || fallbackDescription,
    visualTraits: normalizeTraits(traits),
    castingNotes: normalizeCastingNotes(castingNotes),
    castingStills: normalizeCastingStills(castingStills),
  }
}

export function normalizeAppearanceCandidateMetadata(
  value: unknown,
  descriptions: readonly string[],
): CharacterAppearanceCandidateMetadata[] {
  const source = Array.isArray(value) ? value : []
  return descriptions.map((description, index) => {
    const rawCandidate = source[index]
    if (isRecord(rawCandidate)) {
      return normalizeCandidateFromRecord(rawCandidate, description)
    }
    return {
      description,
      visualTraits: { ...EMPTY_TRAITS },
      castingNotes: { ...EMPTY_CASTING_NOTES },
      castingStills: [],
    }
  })
}

export function parseAppearanceCandidateMetadata(value: unknown): CharacterAppearanceCandidateMetadata[] {
  if (!value) return []
  const parsed = typeof value === 'string'
    ? (() => {
        try {
          return JSON.parse(value) as unknown
        } catch {
          return []
        }
      })()
    : value
  if (!Array.isArray(parsed)) return []
  return parsed
    .filter(isRecord)
    .map((item) => normalizeCandidateFromRecord(item, readString(item.description)))
}

export function stringifyAppearanceCandidateMetadata(
  metadata: readonly CharacterAppearanceCandidateMetadata[],
): string {
  return JSON.stringify(metadata)
}
