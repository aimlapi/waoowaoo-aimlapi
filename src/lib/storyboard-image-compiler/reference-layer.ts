import type { NumberedReferenceImage } from '@/lib/workers/handlers/image-task-handler-shared'
import type {
  CharacterGraph,
  PropGraphItem,
  ShotScaleClass,
  StoryboardImageCompilerDiagnostic,
} from './types'
import { normalizeName } from './text'

export function runReferenceImageLayer(input: {
  readonly references: readonly NumberedReferenceImage[]
  readonly characterGraph: CharacterGraph
  readonly propGraph: readonly PropGraphItem[]
  readonly shotScale: ShotScaleClass
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): readonly NumberedReferenceImage[] {
  const visibleCharacterNames = new Set(input.characterGraph.characters.map((character) => normalizeName(character.name)))
  const visiblePropNames = new Set(input.propGraph.map((prop) => normalizeName(prop.name)))
  return input.references.filter((reference) => {
    const allowed = isReferenceAllowed({
      reference,
      visibleCharacterNames,
      visiblePropNames,
      shotScale: input.shotScale,
    })
    if (!allowed) {
      input.diagnostics.push({
        code: 'REFERENCE_IMAGE_FILTERED',
        message: `Filtered ${reference.role} reference image "${reference.name}" for the current shot visibility.`,
        target: reference.name,
      })
    }
    return allowed
  })
}

export function filterReferenceImageUrlsByPromptMap(input: {
  readonly urls: readonly string[]
  readonly originalMap: readonly NumberedReferenceImage[]
  readonly filteredMap: readonly NumberedReferenceImage[]
}): string[] {
  const selectedImageNumbers = new Set(input.filteredMap.map((item) => item.image_no))
  return input.urls.filter((_url, index) => {
    const mapped = input.originalMap[index]
    return mapped ? selectedImageNumbers.has(mapped.image_no) : false
  })
}

function isReferenceAllowed(input: {
  readonly reference: NumberedReferenceImage
  readonly visibleCharacterNames: ReadonlySet<string>
  readonly visiblePropNames: ReadonlySet<string>
  readonly shotScale: ShotScaleClass
}): boolean {
  const referenceName = normalizeName(input.reference.name)
  if (input.reference.role === 'character') return input.visibleCharacterNames.has(referenceName)
  if (input.reference.role === 'prop') return input.visiblePropNames.has(referenceName)
  if (input.reference.role === 'location') return input.shotScale !== 'extreme_detail'
  return true
}
