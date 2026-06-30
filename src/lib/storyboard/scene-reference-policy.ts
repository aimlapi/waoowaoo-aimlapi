export type StoryboardSceneReferenceImage = {
  readonly id?: string | null
  readonly imageIndex?: number | null
  readonly isSelected?: boolean | null
  readonly imageUrl?: string | null
  readonly spatialProfileJson?: unknown
}

export type StoryboardSceneReferenceLocation = {
  readonly selectedImageId?: string | null
  readonly images?: readonly StoryboardSceneReferenceImage[] | null
}

export type StoryboardSceneReferencePolicy = {
  readonly primaryLocationImageIndex: number | null
  readonly auxiliaryLocationImageIndexes: readonly number[]
}

const SCENE_REFERENCE_POLICY_KEY = 'panorama_primary_with_auxiliary'

function toRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function normalizeNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function normalizeNumberArray(value: unknown): readonly number[] {
  if (!Array.isArray(value)) return []
  return Array.from(new Set(value.map(normalizeNumber).filter((item): item is number => item !== null)))
}

function parseJsonRecord(value: string | null | undefined): Record<string, unknown> | null {
  if (!value?.trim()) return null
  try {
    return toRecord(JSON.parse(value) as unknown)
  } catch {
    return null
  }
}

export function parseStoryboardSceneReferencePolicy(
  photographyPlan: string | null | undefined,
): StoryboardSceneReferencePolicy | null {
  const plan = parseJsonRecord(photographyPlan)
  const experiment = toRecord(plan?.experiment)
  const policyRecord = toRecord(experiment?.sceneReferencePolicy)
  const policyKey = typeof experiment?.sceneReferencePolicy === 'string'
    ? experiment.sceneReferencePolicy
    : typeof policyRecord?.type === 'string'
      ? policyRecord.type
      : null
  if (policyKey !== SCENE_REFERENCE_POLICY_KEY && !policyRecord) return null

  const primaryLocationImageIndex = normalizeNumber(policyRecord?.primaryLocationImageIndex)
  const auxiliaryLocationImageIndexes = normalizeNumberArray(policyRecord?.auxiliaryLocationImageIndexes)
  if (primaryLocationImageIndex === null && auxiliaryLocationImageIndexes.length === 0) return null
  return {
    primaryLocationImageIndex,
    auxiliaryLocationImageIndexes,
  }
}

export function pickStoryboardPrimarySceneImage(
  location: StoryboardSceneReferenceLocation | null | undefined,
  policy: StoryboardSceneReferencePolicy | null | undefined,
): StoryboardSceneReferenceImage | null {
  const images = location?.images || []
  if (policy?.primaryLocationImageIndex !== null && policy?.primaryLocationImageIndex !== undefined) {
    return images.find((image) => image.imageIndex === policy.primaryLocationImageIndex) || null
  }
  return images.find((image) => image.isSelected)
    || images.find((image) => image.id && image.id === location?.selectedImageId)
    || images[0]
    || null
}

export function pickStoryboardAuxiliarySceneImages(
  location: StoryboardSceneReferenceLocation | null | undefined,
  policy: StoryboardSceneReferencePolicy | null | undefined,
): readonly StoryboardSceneReferenceImage[] {
  const images = location?.images || []
  const primaryIndex = policy?.primaryLocationImageIndex
  return (policy?.auxiliaryLocationImageIndexes || [])
    .filter((imageIndex) => imageIndex !== primaryIndex)
    .map((imageIndex) => images.find((image) => image.imageIndex === imageIndex) || null)
    .filter((image): image is StoryboardSceneReferenceImage => image !== null)
}

export function findMissingStoryboardSceneReferenceIndexes(
  location: StoryboardSceneReferenceLocation | null | undefined,
  policy: StoryboardSceneReferencePolicy | null | undefined,
): readonly number[] {
  if (!policy) return []
  const images = location?.images || []
  const expected = [
    policy.primaryLocationImageIndex,
    ...policy.auxiliaryLocationImageIndexes,
  ].filter((imageIndex): imageIndex is number => imageIndex !== null)
  return expected.filter((imageIndex) => !images.some((image) => image.imageIndex === imageIndex))
}
