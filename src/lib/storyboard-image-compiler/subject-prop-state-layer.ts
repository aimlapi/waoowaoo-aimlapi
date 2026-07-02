import type {
  CharacterGraph,
  LocationZone,
  PropGraphItem,
  SceneAssetOmission,
  StoryboardImageCompilerDiagnostic,
} from './types'
import { hasName, normalizeName } from './text'

export type SubjectPropStateLayerResult = {
  readonly characterGraph: CharacterGraph
  readonly propGraph: readonly PropGraphItem[]
  readonly omittedAssets: readonly SceneAssetOmission[]
}

export function runSubjectPropStateLayer(input: {
  readonly characterGraph: CharacterGraph
  readonly propGraph: readonly PropGraphItem[]
  readonly locationZone: LocationZone | null
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): SubjectPropStateLayerResult {
  const omittedCharacters = readOmittedNames(input.locationZone, 'character')
  const omittedProps = readOmittedNames(input.locationZone, 'prop')
  const characterGraph = filterCharacters({
    graph: input.characterGraph,
    omittedNames: omittedCharacters,
    diagnostics: input.diagnostics,
  })
  const propGraph = filterProps({
    graph: input.propGraph,
    omittedNames: omittedProps,
    diagnostics: input.diagnostics,
  })
  return {
    characterGraph,
    propGraph,
    omittedAssets: input.locationZone?.omitted_scene_assets ?? [],
  }
}

function readOmittedNames(locationZone: LocationZone | null, kind: 'character' | 'prop'): ReadonlySet<string> {
  return new Set((locationZone?.omitted_scene_assets ?? [])
    .filter((asset) => asset.kind === kind)
    .map((asset) => normalizeName(asset.name)))
}

function filterCharacters(input: {
  readonly graph: CharacterGraph
  readonly omittedNames: ReadonlySet<string>
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): CharacterGraph {
  const characters = input.graph.characters.filter((character) => {
    const omitted = hasName(input.omittedNames, character.name)
    if (omitted) {
      input.diagnostics.push({
        code: 'OMITTED_CHARACTER_REMOVED',
        message: `Removed omitted character "${character.name}" from the visible character graph.`,
        target: character.name,
      })
    }
    return !omitted
  })
  const visibleNames = new Set(characters.map((character) => normalizeName(character.name)))
  return {
    ...input.graph,
    references: input.graph.references.filter((reference) => visibleNames.has(normalizeName(reference.name))),
    characters,
  }
}

function filterProps(input: {
  readonly graph: readonly PropGraphItem[]
  readonly omittedNames: ReadonlySet<string>
  readonly diagnostics: StoryboardImageCompilerDiagnostic[]
}): readonly PropGraphItem[] {
  return input.graph.filter((prop) => {
    const omitted = hasName(input.omittedNames, prop.name)
    if (omitted) {
      input.diagnostics.push({
        code: 'OMITTED_PROP_REMOVED',
        message: `Removed omitted prop "${prop.name}" from the visible prop graph.`,
        target: prop.name,
      })
    }
    return !omitted
  })
}
