import { z } from 'zod'

const nonEmptyText = (max: number) => z.string().trim().min(1).max(max)
const textList = (maxItems: number, maxLength: number) => z.array(
  nonEmptyText(maxLength),
).max(maxItems)

export const characterIdSchema = nonEmptyText(120).regex(/^CHAR_[A-Z0-9][A-Z0-9_-]*$/)
const factIdSchema = nonEmptyText(120).regex(/^FACT_[A-Z0-9][A-Z0-9_-]*$/)
export const locationIdSchema = nonEmptyText(120).regex(/^LOC_[A-Z0-9][A-Z0-9_-]*$/)
export const propIdSchema = nonEmptyText(120).regex(/^PROP_[A-Z0-9][A-Z0-9_-]*$/)
const sequenceIdSchema = nonEmptyText(120).regex(/^SEQ_[A-Z0-9][A-Z0-9_-]*$/)
const sceneIdSchema = nonEmptyText(120).regex(/^SCENE_[A-Z0-9][A-Z0-9_-]*$/)
const beatIdSchema = nonEmptyText(120).regex(/^BEAT_[A-Z0-9][A-Z0-9_-]*$/)
const hookSceneIdSchema = nonEmptyText(120).regex(/^HOOK_SCENE_[A-Z0-9][A-Z0-9_-]*$/)
const hookBeatIdSchema = nonEmptyText(120).regex(/^HOOK_BEAT_[A-Z0-9][A-Z0-9_-]*$/)
const scriptKernelSceneIdSchema = z.union([sceneIdSchema, hookSceneIdSchema])
const scriptKernelSequenceIdSchema = z.union([sequenceIdSchema, z.literal('HOOK_SEQUENCE')])
const scriptKernelBeatIdSchema = z.union([beatIdSchema, hookBeatIdSchema])
const lineIdSchema = nonEmptyText(120).regex(/^LINE_[A-Z0-9][A-Z0-9_-]*$/)
const presentationIdSchema = nonEmptyText(120).regex(/^PRES_[A-Z0-9][A-Z0-9_-]*$/)

export const exactStyleRevisionSchema = z.object({
  resourceId: nonEmptyText(200),
  revisionId: nonEmptyText(200),
  fingerprint: nonEmptyText(500),
  bindingVersion: z.number().int().nonnegative(),
  schemaId: z.literal('project.style_bible'),
}).strict()

export const canonicalRegistriesSchema = z.object({
  characters: z.array(z.object({
    characterId: characterIdSchema,
    canonicalName: nonEmptyText(300),
    role: nonEmptyText(300),
    storyFunction: nonEmptyText(2_000),
  }).strict()).max(512),
  facts: z.array(z.object({
    factId: factIdSchema,
    statement: nonEmptyText(4_000),
    initiallyKnownBy: z.array(characterIdSchema).max(512),
    protectedUntilSceneId: sceneIdSchema.nullable(),
  }).strict()).max(2_000),
  locations: z.array(z.object({
    locationId: locationIdSchema,
    canonicalName: nonEmptyText(300),
    causalFunction: nonEmptyText(2_000),
  }).strict()).max(512),
  props: z.array(z.object({
    propId: propIdSchema,
    canonicalName: nonEmptyText(300),
    causalFunction: nonEmptyText(2_000),
    stateful: z.boolean(),
  }).strict()).max(1_024),
}).strict()

export const canonicalAssetEntityReferenceSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('character'), entityId: characterIdSchema }).strict(),
  z.object({ kind: z.literal('location'), entityId: locationIdSchema }).strict(),
  z.object({ kind: z.literal('prop'), entityId: propIdSchema }).strict(),
])

const entityReferenceSetSchema = z.object({
  characterIds: z.array(characterIdSchema).max(512),
  factIds: z.array(factIdSchema).max(2_000),
  propIds: z.array(propIdSchema).max(1_024),
}).strict()

const sceneSchema = z.object({
  sceneId: sceneIdSchema,
  sequenceId: sequenceIdSchema,
  chronologicalOrderIndex: z.number().int().positive(),
  slugline: nonEmptyText(1_000),
  locationId: locationIdSchema,
  timelineBranchId: nonEmptyText(120),
  temporalRelationToPreviousScene: z.enum([
    'continuous',
    'later',
    'earlier',
    'parallel',
    'flashback',
    'return',
  ]),
  entityReferences: entityReferenceSetSchema,
  sceneObjective: nonEmptyText(4_000),
  entryState: nonEmptyText(4_000),
  causalAction: nonEmptyText(8_000),
  turn: nonEmptyText(4_000),
  exitState: nonEmptyText(4_000),
}).strict()

const stateTargetSchema = z.discriminatedUnion('targetType', [
  z.object({ targetType: z.literal('character'), targetId: characterIdSchema }).strict(),
  z.object({ targetType: z.literal('fact'), targetId: factIdSchema }).strict(),
  z.object({ targetType: z.literal('location'), targetId: locationIdSchema }).strict(),
  z.object({ targetType: z.literal('prop'), targetId: propIdSchema }).strict(),
])

const stateMutationSchema = z.object({
  target: stateTargetSchema,
  field: nonEmptyText(300),
  before: z.string().max(4_000).nullable(),
  after: z.string().max(4_000).nullable(),
  cause: nonEmptyText(4_000),
}).strict()

const dialogueLineSchema = z.object({
  lineId: lineIdSchema,
  characterId: characterIdSchema,
  characterName: nonEmptyText(300),
  text: nonEmptyText(8_000),
  function: nonEmptyText(500),
  tactic: z.string().max(2_000),
  subtext: z.string().max(2_000),
}).strict()

const scriptKernelSchema = z.object({
  instanceId: presentationIdSchema,
  orderIndex: z.number().int().positive(),
  sourceType: z.enum(['canonical', 'external_hook']),
  replay: z.boolean(),
  replayAddsNewInformation: z.string().max(2_000),
  sceneId: scriptKernelSceneIdSchema,
  sequenceId: scriptKernelSequenceIdSchema,
  beatId: scriptKernelBeatIdSchema,
  chronologicalOrderIndex: z.number().int().positive().nullable(),
  slugline: nonEmptyText(1_000),
  locationId: locationIdSchema,
  timelineBranchId: nonEmptyText(120),
  entityReferences: entityReferenceSetSchema,
  dramaticFunction: nonEmptyText(2_000),
  cause: nonEmptyText(4_000),
  stageDirection: nonEmptyText(12_000),
  microMovement: z.string().max(4_000),
  dialogue: z.array(dialogueLineSchema).max(128),
  silence: z.object({
    present: z.boolean(),
    function: z.string().max(2_000),
  }).strict(),
  stateChanges: z.array(stateMutationSchema).max(128),
  continuityOut: nonEmptyText(4_000),
  laterLinkBackBeatId: beatIdSchema.nullable(),
}).strict()

function scriptKernelSourceFingerprint(kernel: z.infer<typeof scriptKernelSchema>): string {
  return JSON.stringify({
    sourceType: kernel.sourceType,
    sceneId: kernel.sceneId,
    sequenceId: kernel.sequenceId,
    beatId: kernel.beatId,
    chronologicalOrderIndex: kernel.chronologicalOrderIndex,
    slugline: kernel.slugline,
    locationId: kernel.locationId,
    timelineBranchId: kernel.timelineBranchId,
    entityReferences: kernel.entityReferences,
    dramaticFunction: kernel.dramaticFunction,
    cause: kernel.cause,
    stageDirection: kernel.stageDirection,
    microMovement: kernel.microMovement,
    dialogue: kernel.dialogue,
    silence: kernel.silence,
    stateChanges: kernel.stateChanges,
    continuityOut: kernel.continuityOut,
    laterLinkBackBeatId: kernel.laterLinkBackBeatId,
  })
}

function stateMutationFingerprint(mutation: z.infer<typeof stateMutationSchema>): string {
  return JSON.stringify(mutation)
}

const validationCheckSchema = z.object({
  status: z.enum(['pass', 'warning']),
  reason: z.string().max(4_000),
}).strict()

function addIssue(
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  message: string,
): void {
  context.addIssue({
    code: z.ZodIssueCode.custom,
    path: [...path],
    message,
  })
}

function assertUnique(
  values: readonly string[],
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  code: string,
): void {
  const seen = new Set<string>()
  for (const [index, value] of values.entries()) {
    if (seen.has(value)) addIssue(context, [...path, index], code)
    seen.add(value)
  }
}

function assertContiguousOrder(
  values: readonly number[],
  context: z.RefinementCtx,
  path: readonly PropertyKey[],
  code: string,
): void {
  const sorted = [...values].sort((left, right) => left - right)
  for (const [index, value] of sorted.entries()) {
    if (value !== index + 1) {
      addIssue(context, path, code)
      return
    }
  }
}

function assertKnownIds(input: {
  readonly values: readonly string[]
  readonly known: ReadonlySet<string>
  readonly context: z.RefinementCtx
  readonly path: readonly PropertyKey[]
  readonly code: string
}): void {
  for (const [index, value] of input.values.entries()) {
    if (!input.known.has(value)) {
      addIssue(input.context, [...input.path, index], input.code)
    }
  }
}

function targetExists(
  target: z.infer<typeof stateTargetSchema>,
  registries: {
    readonly characters: ReadonlySet<string>
    readonly facts: ReadonlySet<string>
    readonly locations: ReadonlySet<string>
    readonly props: ReadonlySet<string>
  },
): boolean {
  switch (target.targetType) {
    case 'character': return registries.characters.has(target.targetId)
    case 'fact': return registries.facts.has(target.targetId)
    case 'location': return registries.locations.has(target.targetId)
    case 'prop': return registries.props.has(target.targetId)
  }
}

export const screenplayDraftOutputSchema = z.object({
  kind: z.literal('screenplay_draft'),
  schemaVersion: z.literal('2.0.0'),
  status: z.literal('final'),
  source: z.object({
    styleRevision: exactStyleRevisionSchema,
  }).strict(),
  projectDefinition: z.object({
    workingTitle: nonEmptyText(300),
    logline: nonEmptyText(2_000),
    synopsis: nonEmptyText(12_000),
    format: nonEmptyText(300),
    genres: textList(16, 300),
    tone: textList(16, 300),
    language: nonEmptyText(100),
    estimatedDurationSeconds: z.number().finite().positive(),
  }).strict(),
  canonicalRegistries: canonicalRegistriesSchema,
  timelineRegistry: z.array(z.object({
    timelineBranchId: nonEmptyText(120),
    function: nonEmptyText(2_000),
    relationToMain: nonEmptyText(2_000),
  }).strict()).min(1).max(128),
  storyArchitecture: z.object({
    storyCoreEngine: z.object({
      premise: nonEmptyText(4_000),
      recurringCausalRule: nonEmptyText(4_000),
      costMechanism: nonEmptyText(4_000),
      protagonistPressure: nonEmptyText(4_000),
      centralDramaticQuestion: nonEmptyText(4_000),
    }).strict(),
    characterOntologies: z.array(z.object({
      characterId: characterIdSchema,
      want: nonEmptyText(2_000),
      need: nonEmptyText(2_000),
      fear: nonEmptyText(2_000),
      misbelief: nonEmptyText(2_000),
      pressureResponse: nonEmptyText(2_000),
      transformation: nonEmptyText(4_000),
    }).strict()).max(512),
    characterScriptProfiles: z.array(z.object({
      characterId: characterIdSchema,
      speechPattern: nonEmptyText(2_000),
      behaviorPattern: nonEmptyText(2_000),
      silencePattern: nonEmptyText(2_000),
      contradictionPattern: nonEmptyText(2_000),
    }).strict()).max(512),
    sequences: z.array(z.object({
      sequenceId: sequenceIdSchema,
      orderIndex: z.number().int().positive(),
      function: nonEmptyText(4_000),
      entryState: nonEmptyText(4_000),
      exitState: nonEmptyText(4_000),
      relativeRuntimeShare: z.number().finite().positive().max(1),
    }).strict()).min(1).max(256),
    scenes: z.array(sceneSchema).min(1).max(2_000),
  }).strict(),
  stateLedger: z.object({
    initialStates: z.array(z.object({
      target: stateTargetSchema,
      state: nonEmptyText(4_000),
    }).strict()).max(4_096),
    sceneDeltas: z.array(z.object({
      sceneId: sceneIdSchema,
      stateIn: nonEmptyText(8_000),
      mutations: z.array(stateMutationSchema).max(256),
      stateOut: nonEmptyText(8_000),
    }).strict()).max(2_000),
    parallelGroupJoins: z.array(z.object({
      timelineBranchIds: z.array(nonEmptyText(120)).min(2).max(32),
      joinsBeforeSceneId: sceneIdSchema,
      resolution: nonEmptyText(4_000),
    }).strict()).max(128),
  }).strict(),
  scriptKernels: z.array(scriptKernelSchema).min(1).max(8_000),
  validation: z.object({
    stage: z.literal('06T'),
    status: z.literal('pass'),
    premisePromise: validationCheckSchema,
    causalContinuity: validationCheckSchema,
    characterContinuity: validationCheckSchema,
    dialogueContinuity: validationCheckSchema,
    stateContinuity: validationCheckSchema,
    duplicateDramaticFunction: validationCheckSchema,
    openingIntegrity: validationCheckSchema,
    endingIntegrity: validationCheckSchema,
    registryIntegrity: z.object({ status: z.literal('pass'), reason: z.string().max(4_000) }).strict(),
    narrativeOnlyBoundary: z.object({ status: z.literal('pass'), reason: z.string().max(4_000) }).strict(),
  }).strict(),
  assumptions: textList(64, 2_000),
  openQuestions: textList(64, 2_000),
}).strict().superRefine((output, context) => {
  const characterIds = output.canonicalRegistries.characters.map((entry) => entry.characterId)
  const factIds = output.canonicalRegistries.facts.map((entry) => entry.factId)
  const locationIds = output.canonicalRegistries.locations.map((entry) => entry.locationId)
  const propIds = output.canonicalRegistries.props.map((entry) => entry.propId)
  const sequenceIds = output.storyArchitecture.sequences.map((entry) => entry.sequenceId)
  const sceneIds = output.storyArchitecture.scenes.map((entry) => entry.sceneId)
  const ontologyCharacterIds = output.storyArchitecture.characterOntologies.map((entry) => entry.characterId)
  const profileCharacterIds = output.storyArchitecture.characterScriptProfiles.map((entry) => entry.characterId)
  const stateDeltaSceneIds = output.stateLedger.sceneDeltas.map((entry) => entry.sceneId)
  const initialStateTargetIds = output.stateLedger.initialStates.map(
    (entry) => `${entry.target.targetType}:${entry.target.targetId}`,
  )
  const instanceIds = output.scriptKernels.map((entry) => entry.instanceId)
  const timelineIds = output.timelineRegistry.map((entry) => entry.timelineBranchId)

  assertUnique(characterIds, context, ['canonicalRegistries', 'characters'], 'SCREENPLAY_CHARACTER_ID_DUPLICATE')
  assertUnique(factIds, context, ['canonicalRegistries', 'facts'], 'SCREENPLAY_FACT_ID_DUPLICATE')
  assertUnique(locationIds, context, ['canonicalRegistries', 'locations'], 'SCREENPLAY_LOCATION_ID_DUPLICATE')
  assertUnique(propIds, context, ['canonicalRegistries', 'props'], 'SCREENPLAY_PROP_ID_DUPLICATE')
  assertUnique(sequenceIds, context, ['storyArchitecture', 'sequences'], 'SCREENPLAY_SEQUENCE_ID_DUPLICATE')
  assertUnique(sceneIds, context, ['storyArchitecture', 'scenes'], 'SCREENPLAY_SCENE_ID_DUPLICATE')
  assertUnique(ontologyCharacterIds, context, ['storyArchitecture', 'characterOntologies'], 'SCREENPLAY_ONTOLOGY_CHARACTER_DUPLICATE')
  assertUnique(profileCharacterIds, context, ['storyArchitecture', 'characterScriptProfiles'], 'SCREENPLAY_PROFILE_CHARACTER_DUPLICATE')
  assertUnique(stateDeltaSceneIds, context, ['stateLedger', 'sceneDeltas'], 'SCREENPLAY_STATE_SCENE_DUPLICATE')
  assertUnique(initialStateTargetIds, context, ['stateLedger', 'initialStates'], 'SCREENPLAY_INITIAL_STATE_TARGET_DUPLICATE')
  assertUnique(instanceIds, context, ['scriptKernels'], 'SCREENPLAY_PRESENTATION_ID_DUPLICATE')
  assertUnique(timelineIds, context, ['timelineRegistry'], 'SCREENPLAY_TIMELINE_ID_DUPLICATE')

  const canonicalChronologicalOrder = output.scriptKernels
    .filter((kernel) => kernel.sourceType === 'canonical' && !kernel.replay)
    .flatMap((kernel) => (
      kernel.chronologicalOrderIndex === null ? [] : [kernel.chronologicalOrderIndex]
    ))
  assertUnique(
    canonicalChronologicalOrder.map(String),
    context,
    ['scriptKernels'],
    'SCREENPLAY_CANONICAL_CHRONOLOGY_DUPLICATE',
  )
  assertContiguousOrder(
    canonicalChronologicalOrder,
    context,
    ['scriptKernels'],
    'SCREENPLAY_CANONICAL_CHRONOLOGY_INVALID',
  )

  assertContiguousOrder(
    output.storyArchitecture.sequences.map((entry) => entry.orderIndex),
    context,
    ['storyArchitecture', 'sequences'],
    'SCREENPLAY_SEQUENCE_ORDER_INVALID',
  )
  assertContiguousOrder(
    output.storyArchitecture.scenes.map((entry) => entry.chronologicalOrderIndex),
    context,
    ['storyArchitecture', 'scenes'],
    'SCREENPLAY_SCENE_ORDER_INVALID',
  )
  assertContiguousOrder(
    output.scriptKernels.map((entry) => entry.orderIndex),
    context,
    ['scriptKernels'],
    'SCREENPLAY_PRESENTATION_ORDER_INVALID',
  )
  const sequenceRuntimeShare = output.storyArchitecture.sequences.reduce(
    (total, sequence) => total + sequence.relativeRuntimeShare,
    0,
  )
  if (Math.abs(sequenceRuntimeShare - 1) > 0.000_001) {
    addIssue(
      context,
      ['storyArchitecture', 'sequences'],
      'SCREENPLAY_SEQUENCE_RUNTIME_SHARE_INVALID',
    )
  }

  const registries = {
    characters: new Set(characterIds),
    facts: new Set(factIds),
    locations: new Set(locationIds),
    props: new Set(propIds),
  }
  const knownSequences = new Set(sequenceIds)
  const knownScenes = new Set(sceneIds)
  const knownTimelines = new Set(timelineIds)
  const characterNamesById = new Map(
    output.canonicalRegistries.characters.map((character) => [
      character.characterId,
      character.canonicalName,
    ]),
  )
  const sequenceOrderById = new Map(
    output.storyArchitecture.sequences.map((sequence) => [
      sequence.sequenceId,
      sequence.orderIndex,
    ]),
  )

  let priorSequenceOrder = 0
  for (const scene of [...output.storyArchitecture.scenes].sort(
    (left, right) => left.chronologicalOrderIndex - right.chronologicalOrderIndex,
  )) {
    const sequenceOrder = sequenceOrderById.get(scene.sequenceId)
    if (sequenceOrder === undefined) continue
    if (sequenceOrder < priorSequenceOrder) {
      addIssue(
        context,
        ['storyArchitecture', 'scenes'],
        'SCREENPLAY_SCENE_SEQUENCE_CHRONOLOGY_INVALID',
      )
      break
    }
    priorSequenceOrder = sequenceOrder
  }

  const ontologyCharacters = new Set(ontologyCharacterIds)
  const profileCharacters = new Set(profileCharacterIds)
  for (const [index, characterId] of characterIds.entries()) {
    if (!ontologyCharacters.has(characterId)) {
      addIssue(
        context,
        ['canonicalRegistries', 'characters', index],
        'SCREENPLAY_CHARACTER_ONTOLOGY_MISSING',
      )
    }
    if (!profileCharacters.has(characterId)) {
      addIssue(
        context,
        ['canonicalRegistries', 'characters', index],
        'SCREENPLAY_CHARACTER_PROFILE_MISSING',
      )
    }
  }

  for (const [index, fact] of output.canonicalRegistries.facts.entries()) {
    assertKnownIds({
      values: fact.initiallyKnownBy,
      known: registries.characters,
      context,
      path: ['canonicalRegistries', 'facts', index, 'initiallyKnownBy'],
      code: 'SCREENPLAY_FACT_CHARACTER_UNKNOWN',
    })
    if (fact.protectedUntilSceneId && !knownScenes.has(fact.protectedUntilSceneId)) {
      addIssue(context, ['canonicalRegistries', 'facts', index, 'protectedUntilSceneId'], 'SCREENPLAY_FACT_SCENE_UNKNOWN')
    }
  }

  const usedCharacters = new Set<string>()
  const usedFacts = new Set<string>()
  const usedLocations = new Set<string>()
  const usedProps = new Set<string>()
  for (const [index, scene] of output.storyArchitecture.scenes.entries()) {
    if (!knownSequences.has(scene.sequenceId)) {
      addIssue(context, ['storyArchitecture', 'scenes', index, 'sequenceId'], 'SCREENPLAY_SCENE_SEQUENCE_UNKNOWN')
    }
    if (!registries.locations.has(scene.locationId)) {
      addIssue(context, ['storyArchitecture', 'scenes', index, 'locationId'], 'SCREENPLAY_SCENE_LOCATION_UNKNOWN')
    }
    if (!knownTimelines.has(scene.timelineBranchId)) {
      addIssue(context, ['storyArchitecture', 'scenes', index, 'timelineBranchId'], 'SCREENPLAY_SCENE_TIMELINE_UNKNOWN')
    }
    assertKnownIds({ values: scene.entityReferences.characterIds, known: registries.characters, context, path: ['storyArchitecture', 'scenes', index, 'entityReferences', 'characterIds'], code: 'SCREENPLAY_SCENE_CHARACTER_UNKNOWN' })
    assertKnownIds({ values: scene.entityReferences.factIds, known: registries.facts, context, path: ['storyArchitecture', 'scenes', index, 'entityReferences', 'factIds'], code: 'SCREENPLAY_SCENE_FACT_UNKNOWN' })
    assertKnownIds({ values: scene.entityReferences.propIds, known: registries.props, context, path: ['storyArchitecture', 'scenes', index, 'entityReferences', 'propIds'], code: 'SCREENPLAY_SCENE_PROP_UNKNOWN' })
    scene.entityReferences.characterIds.forEach((id) => usedCharacters.add(id))
    scene.entityReferences.factIds.forEach((id) => usedFacts.add(id))
    scene.entityReferences.propIds.forEach((id) => usedProps.add(id))
    usedLocations.add(scene.locationId)
  }

  for (const [registryName, ids, used] of [
    ['characters', characterIds, usedCharacters],
    ['facts', factIds, usedFacts],
    ['locations', locationIds, usedLocations],
    ['props', propIds, usedProps],
  ] as const) {
    for (const [index, id] of ids.entries()) {
      if (!used.has(id)) {
        addIssue(context, ['canonicalRegistries', registryName, index], `SCREENPLAY_${registryName.toUpperCase()}_UNUSED`)
      }
    }
  }

  const scenesById = new Map(output.storyArchitecture.scenes.map((scene) => [scene.sceneId, scene]))
  const canonicalStateMutationFingerprints = new Set(
    output.stateLedger.sceneDeltas.flatMap((delta) => (
      delta.mutations.map(stateMutationFingerprint)
    )),
  )
  const kernelSceneIds = new Set<string>()
  const canonicalBeatIds = new Set(output.scriptKernels
    .filter((kernel) => kernel.sourceType === 'canonical')
    .map((kernel) => kernel.beatId))
  const firstCanonicalOrder = Math.min(...output.scriptKernels
    .filter((kernel) => kernel.sourceType === 'canonical')
    .map((kernel) => kernel.orderIndex))
  const sourceKernelGroups = new Map<string, {
    readonly sourceType: 'canonical' | 'external_hook'
    readonly fingerprint: string
    readonly firstIndex: number
    totalCount: number
    nonReplayCount: number
  }>()
  const lineOwners = new Map<string, string>()
  const hookSceneMetadata = new Map<string, string>()
  for (const [index, kernel] of output.scriptKernels.entries()) {
    assertKnownIds({ values: kernel.entityReferences.characterIds, known: registries.characters, context, path: ['scriptKernels', index, 'entityReferences', 'characterIds'], code: 'SCREENPLAY_KERNEL_CHARACTER_UNKNOWN' })
    assertKnownIds({ values: kernel.entityReferences.factIds, known: registries.facts, context, path: ['scriptKernels', index, 'entityReferences', 'factIds'], code: 'SCREENPLAY_KERNEL_FACT_UNKNOWN' })
    assertKnownIds({ values: kernel.entityReferences.propIds, known: registries.props, context, path: ['scriptKernels', index, 'entityReferences', 'propIds'], code: 'SCREENPLAY_KERNEL_PROP_UNKNOWN' })
    if (!registries.locations.has(kernel.locationId)) {
      addIssue(context, ['scriptKernels', index, 'locationId'], 'SCREENPLAY_KERNEL_LOCATION_UNKNOWN')
    }
    for (const [lineIndex, line] of kernel.dialogue.entries()) {
      if (!kernel.entityReferences.characterIds.includes(line.characterId)) {
        addIssue(context, ['scriptKernels', index, 'dialogue', lineIndex, 'characterId'], 'SCREENPLAY_DIALOGUE_CHARACTER_NOT_PRESENT')
      }
      if (line.characterName !== characterNamesById.get(line.characterId)) {
        addIssue(context, ['scriptKernels', index, 'dialogue', lineIndex, 'characterName'], 'SCREENPLAY_DIALOGUE_CHARACTER_NAME_MISMATCH')
      }
    }
    for (const [mutationIndex, mutation] of kernel.stateChanges.entries()) {
      if (!targetExists(mutation.target, registries)) {
        addIssue(context, ['scriptKernels', index, 'stateChanges', mutationIndex, 'target'], 'SCREENPLAY_STATE_TARGET_UNKNOWN')
      }
    }
    if (kernel.replay && !kernel.replayAddsNewInformation.trim()) {
      addIssue(context, ['scriptKernels', index, 'replayAddsNewInformation'], 'SCREENPLAY_REPLAY_JUSTIFICATION_REQUIRED')
    }
    if (!kernel.replay && kernel.replayAddsNewInformation.trim()) {
      addIssue(context, ['scriptKernels', index, 'replayAddsNewInformation'], 'SCREENPLAY_NON_REPLAY_JUSTIFICATION_FORBIDDEN')
    }

    const sourceKey = `${kernel.sourceType}:${kernel.beatId}`
    const fingerprint = scriptKernelSourceFingerprint(kernel)
    const existingGroup = sourceKernelGroups.get(sourceKey)
    if (existingGroup) {
      existingGroup.totalCount += 1
      if (!kernel.replay) existingGroup.nonReplayCount += 1
      if (existingGroup.fingerprint !== fingerprint) {
        addIssue(context, ['scriptKernels', index], 'SCREENPLAY_REPLAY_SOURCE_PAYLOAD_MISMATCH')
      }
    } else {
      sourceKernelGroups.set(sourceKey, {
        sourceType: kernel.sourceType,
        fingerprint,
        firstIndex: index,
        totalCount: 1,
        nonReplayCount: kernel.replay ? 0 : 1,
      })
      const sourceLineIds = new Set<string>()
      for (const [lineIndex, line] of kernel.dialogue.entries()) {
        if (sourceLineIds.has(line.lineId) || lineOwners.has(line.lineId)) {
          addIssue(context, ['scriptKernels', index, 'dialogue', lineIndex, 'lineId'], 'SCREENPLAY_LINE_ID_DUPLICATE')
        }
        sourceLineIds.add(line.lineId)
        lineOwners.set(line.lineId, sourceKey)
      }
    }

    if (kernel.sourceType === 'canonical') {
      const scene = scenesById.get(kernel.sceneId)
      if (!beatIdSchema.safeParse(kernel.beatId).success) {
        addIssue(context, ['scriptKernels', index, 'beatId'], 'SCREENPLAY_CANONICAL_BEAT_ID_INVALID')
      }
      if (
        !sceneIdSchema.safeParse(kernel.sceneId).success
        || !sequenceIdSchema.safeParse(kernel.sequenceId).success
        || kernel.chronologicalOrderIndex === null
        || kernel.laterLinkBackBeatId !== null
      ) {
        addIssue(context, ['scriptKernels', index], 'SCREENPLAY_CANONICAL_KERNEL_IDENTITY_INVALID')
      }
      if (!scene) {
        addIssue(context, ['scriptKernels', index, 'sceneId'], 'SCREENPLAY_KERNEL_SCENE_UNKNOWN')
        continue
      }
      if (kernel.sequenceId !== scene.sequenceId) {
        addIssue(context, ['scriptKernels', index, 'sequenceId'], 'SCREENPLAY_KERNEL_SEQUENCE_MISMATCH')
      }
      if (
        kernel.slugline !== scene.slugline
        || kernel.locationId !== scene.locationId
        || kernel.timelineBranchId !== scene.timelineBranchId
      ) {
        addIssue(context, ['scriptKernels', index], 'SCREENPLAY_KERNEL_SCENE_METADATA_MISMATCH')
      }
      assertKnownIds({ values: kernel.entityReferences.characterIds, known: new Set(scene.entityReferences.characterIds), context, path: ['scriptKernels', index, 'entityReferences', 'characterIds'], code: 'SCREENPLAY_KERNEL_CHARACTER_NOT_IN_SCENE' })
      assertKnownIds({ values: kernel.entityReferences.factIds, known: new Set(scene.entityReferences.factIds), context, path: ['scriptKernels', index, 'entityReferences', 'factIds'], code: 'SCREENPLAY_KERNEL_FACT_NOT_IN_SCENE' })
      assertKnownIds({ values: kernel.entityReferences.propIds, known: new Set(scene.entityReferences.propIds), context, path: ['scriptKernels', index, 'entityReferences', 'propIds'], code: 'SCREENPLAY_KERNEL_PROP_NOT_IN_SCENE' })
      kernelSceneIds.add(kernel.sceneId)
      continue
    }

    if (
      !hookBeatIdSchema.safeParse(kernel.beatId).success
      || !hookSceneIdSchema.safeParse(kernel.sceneId).success
      || kernel.sequenceId !== 'HOOK_SEQUENCE'
      || kernel.chronologicalOrderIndex !== null
      || kernel.timelineBranchId !== 'HOOK'
      || kernel.replay
      || !kernel.laterLinkBackBeatId
      || !canonicalBeatIds.has(kernel.laterLinkBackBeatId)
      || kernel.orderIndex >= firstCanonicalOrder
    ) {
      addIssue(context, ['scriptKernels', index], 'SCREENPLAY_EXTERNAL_HOOK_IDENTITY_INVALID')
    }
    assertUnique(
      kernel.stateChanges.map(stateMutationFingerprint),
      context,
      ['scriptKernels', index, 'stateChanges'],
      'SCREENPLAY_EXTERNAL_HOOK_STATE_CHANGE_DUPLICATE',
    )
    for (const [mutationIndex, mutation] of kernel.stateChanges.entries()) {
      if (!canonicalStateMutationFingerprints.has(stateMutationFingerprint(mutation))) {
        addIssue(
          context,
          ['scriptKernels', index, 'stateChanges', mutationIndex],
          'SCREENPLAY_EXTERNAL_HOOK_STATE_CHANGE_UNREGISTERED',
        )
      }
    }
    const sceneMetadata = JSON.stringify({
      sequenceId: kernel.sequenceId,
      slugline: kernel.slugline,
      locationId: kernel.locationId,
      timelineBranchId: kernel.timelineBranchId,
    })
    const existingSceneMetadata = hookSceneMetadata.get(kernel.sceneId)
    if (existingSceneMetadata && existingSceneMetadata !== sceneMetadata) {
      addIssue(context, ['scriptKernels', index], 'SCREENPLAY_EXTERNAL_HOOK_SCENE_METADATA_MISMATCH')
    } else {
      hookSceneMetadata.set(kernel.sceneId, sceneMetadata)
    }
  }

  for (const group of sourceKernelGroups.values()) {
    if (
      group.nonReplayCount !== 1
      || (group.sourceType === 'external_hook' && group.totalCount !== 1)
    ) {
      addIssue(
        context,
        ['scriptKernels', group.firstIndex],
        group.sourceType === 'external_hook'
          ? 'SCREENPLAY_EXTERNAL_HOOK_MULTIPLICITY_INVALID'
          : 'SCREENPLAY_CANONICAL_BEAT_PRESENTATION_INVALID',
      )
    }
  }

  const canonicalSourceKernels = output.scriptKernels
    .filter((kernel) => (
      kernel.sourceType === 'canonical'
      && !kernel.replay
      && kernel.chronologicalOrderIndex !== null
    ))
    .sort((left, right) => (
      (left.chronologicalOrderIndex ?? 0) - (right.chronologicalOrderIndex ?? 0)
    ))
  let priorSceneChronology = 0
  for (const kernel of canonicalSourceKernels) {
    const sceneChronology = scenesById.get(kernel.sceneId)?.chronologicalOrderIndex
    if (sceneChronology === undefined) continue
    if (sceneChronology < priorSceneChronology) {
      addIssue(
        context,
        ['scriptKernels'],
        'SCREENPLAY_CANONICAL_SCENE_CHRONOLOGY_INVALID',
      )
      break
    }
    priorSceneChronology = sceneChronology
  }

  for (const [index, sceneId] of sceneIds.entries()) {
    if (!kernelSceneIds.has(sceneId)) {
      addIssue(
        context,
        ['storyArchitecture', 'scenes', index],
        'SCREENPLAY_SCENE_KERNEL_MISSING',
      )
    }
  }

  for (const [index, ontology] of output.storyArchitecture.characterOntologies.entries()) {
    if (!registries.characters.has(ontology.characterId)) {
      addIssue(context, ['storyArchitecture', 'characterOntologies', index, 'characterId'], 'SCREENPLAY_ONTOLOGY_CHARACTER_UNKNOWN')
    }
  }
  for (const [index, profile] of output.storyArchitecture.characterScriptProfiles.entries()) {
    if (!registries.characters.has(profile.characterId)) {
      addIssue(context, ['storyArchitecture', 'characterScriptProfiles', index, 'characterId'], 'SCREENPLAY_PROFILE_CHARACTER_UNKNOWN')
    }
  }
  for (const [index, initial] of output.stateLedger.initialStates.entries()) {
    if (!targetExists(initial.target, registries)) {
      addIssue(context, ['stateLedger', 'initialStates', index, 'target'], 'SCREENPLAY_INITIAL_STATE_TARGET_UNKNOWN')
    }
  }
  for (const [index, delta] of output.stateLedger.sceneDeltas.entries()) {
    if (!knownScenes.has(delta.sceneId)) {
      addIssue(context, ['stateLedger', 'sceneDeltas', index, 'sceneId'], 'SCREENPLAY_STATE_SCENE_UNKNOWN')
    }
    for (const [mutationIndex, mutation] of delta.mutations.entries()) {
      if (!targetExists(mutation.target, registries)) {
        addIssue(context, ['stateLedger', 'sceneDeltas', index, 'mutations', mutationIndex, 'target'], 'SCREENPLAY_STATE_TARGET_UNKNOWN')
      }
    }
    assertUnique(
      delta.mutations.map(stateMutationFingerprint),
      context,
      ['stateLedger', 'sceneDeltas', index, 'mutations'],
      'SCREENPLAY_STATE_MUTATION_DUPLICATE',
    )
  }
  const chronologicalScenes = [...output.storyArchitecture.scenes].sort(
    (left, right) => left.chronologicalOrderIndex - right.chronologicalOrderIndex,
  )
  if (
    output.stateLedger.sceneDeltas.length !== chronologicalScenes.length
    || output.stateLedger.sceneDeltas.some(
      (delta, index) => delta.sceneId !== chronologicalScenes[index]?.sceneId,
    )
  ) {
    addIssue(
      context,
      ['stateLedger', 'sceneDeltas'],
      'SCREENPLAY_STATE_SCENE_COVERAGE_INVALID',
    )
  }
  const sceneDeltasById = new Map(
    output.stateLedger.sceneDeltas.map((delta) => [delta.sceneId, delta]),
  )
  for (const [sceneIndex, scene] of output.storyArchitecture.scenes.entries()) {
    const ledgerMutations = sceneDeltasById.get(scene.sceneId)?.mutations
      .map(stateMutationFingerprint)
      ?? []
    const kernelMutations = output.scriptKernels
      .filter((kernel) => (
        kernel.sourceType === 'canonical'
        && !kernel.replay
        && kernel.sceneId === scene.sceneId
      ))
      .sort((left, right) => (
        (left.chronologicalOrderIndex ?? 0) - (right.chronologicalOrderIndex ?? 0)
      ))
      .flatMap((kernel) => kernel.stateChanges)
      .map(stateMutationFingerprint)
    if (
      ledgerMutations.length !== kernelMutations.length
      || ledgerMutations.some((mutation, index) => mutation !== kernelMutations[index])
    ) {
      addIssue(
        context,
        ['storyArchitecture', 'scenes', sceneIndex],
        'SCREENPLAY_SCENE_STATE_MUTATION_MISMATCH',
      )
    }
  }
  const sceneSequenceIds = new Set(output.storyArchitecture.scenes.map((scene) => scene.sequenceId))
  for (const [index, sequenceId] of sequenceIds.entries()) {
    if (!sceneSequenceIds.has(sequenceId)) {
      addIssue(
        context,
        ['storyArchitecture', 'sequences', index],
        'SCREENPLAY_SEQUENCE_SCENE_MISSING',
      )
    }
  }
  for (const [index, join] of output.stateLedger.parallelGroupJoins.entries()) {
    assertUnique(
      join.timelineBranchIds,
      context,
      ['stateLedger', 'parallelGroupJoins', index, 'timelineBranchIds'],
      'SCREENPLAY_PARALLEL_JOIN_TIMELINE_DUPLICATE',
    )
    assertKnownIds({
      values: join.timelineBranchIds,
      known: knownTimelines,
      context,
      path: ['stateLedger', 'parallelGroupJoins', index, 'timelineBranchIds'],
      code: 'SCREENPLAY_PARALLEL_JOIN_TIMELINE_UNKNOWN',
    })
    const joinsBeforeScene = scenesById.get(join.joinsBeforeSceneId)
    if (!joinsBeforeScene) {
      addIssue(
        context,
        ['stateLedger', 'parallelGroupJoins', index, 'joinsBeforeSceneId'],
        'SCREENPLAY_PARALLEL_JOIN_SCENE_UNKNOWN',
      )
      continue
    }
    for (const [branchIndex, timelineBranchId] of join.timelineBranchIds.entries()) {
      const hasPriorScene = output.storyArchitecture.scenes.some(
        (scene) => scene.timelineBranchId === timelineBranchId
          && scene.chronologicalOrderIndex < joinsBeforeScene.chronologicalOrderIndex,
      )
      if (!hasPriorScene) {
        addIssue(
          context,
          ['stateLedger', 'parallelGroupJoins', index, 'timelineBranchIds', branchIndex],
          'SCREENPLAY_PARALLEL_JOIN_BRANCH_NOT_ACTIVE_BEFORE_JOIN',
        )
      }
    }
  }
})

export type ScreenplayDraftOutput = z.infer<typeof screenplayDraftOutputSchema>

const screenplayResourceDocumentBaseSchema = screenplayDraftOutputSchema.extend({
  compiler: z.object({
    stage: z.literal('07S'),
    sourceStage: z.literal('06T'),
    sceneInstances: z.array(z.object({
      orderIndex: z.number().int().positive(),
      sceneId: scriptKernelSceneIdSchema,
      sequenceId: scriptKernelSequenceIdSchema,
      slugline: nonEmptyText(1_000),
      locationId: locationIdSchema,
      timelineBranchId: nonEmptyText(120),
      kernelInstanceIds: z.array(presentationIdSchema).min(1).max(8_000),
    }).strict()).min(1).max(8_000),
  }).strict(),
  renderedScreenplay: z.object({
    title: nonEmptyText(300),
    logline: nonEmptyText(2_000),
    synopsis: nonEmptyText(12_000),
    text: nonEmptyText(200_000),
  }).strict(),
}).strict()

export const screenplayResourceDocumentSchema = screenplayResourceDocumentBaseSchema.superRefine(
  (document, context) => {
    const orderedKernels = orderKernels(document)
    const compiledKernelIds = document.compiler.sceneInstances.flatMap(
      (sceneInstance) => sceneInstance.kernelInstanceIds,
    )
    const expectedKernelIds = orderedKernels.map((kernel) => kernel.instanceId)
    if (
      compiledKernelIds.length !== expectedKernelIds.length
      || compiledKernelIds.some((kernelId, index) => kernelId !== expectedKernelIds[index])
    ) {
      addIssue(
        context,
        ['compiler', 'sceneInstances'],
        'SCREENPLAY_07S_KERNEL_EXPORT_MISMATCH',
      )
    }

    const kernelsById = new Map(orderedKernels.map((kernel) => [kernel.instanceId, kernel]))
    for (const [sceneIndex, sceneInstance] of document.compiler.sceneInstances.entries()) {
      if (sceneInstance.orderIndex !== sceneIndex + 1) {
        addIssue(
          context,
          ['compiler', 'sceneInstances', sceneIndex, 'orderIndex'],
          'SCREENPLAY_07S_SCENE_ORDER_INVALID',
        )
      }
      const previous = document.compiler.sceneInstances[sceneIndex - 1]
      if (
        previous
        && previous.sceneId === sceneInstance.sceneId
        && previous.sequenceId === sceneInstance.sequenceId
        && previous.slugline === sceneInstance.slugline
        && previous.locationId === sceneInstance.locationId
        && previous.timelineBranchId === sceneInstance.timelineBranchId
      ) {
        addIssue(
          context,
          ['compiler', 'sceneInstances', sceneIndex],
          'SCREENPLAY_07S_CONTIGUOUS_SCENE_SPLIT',
        )
      }
      for (const [kernelIndex, kernelId] of sceneInstance.kernelInstanceIds.entries()) {
        const kernel = kernelsById.get(kernelId)
        if (
          !kernel
          || kernel.sceneId !== sceneInstance.sceneId
          || kernel.sequenceId !== sceneInstance.sequenceId
          || kernel.slugline !== sceneInstance.slugline
          || kernel.locationId !== sceneInstance.locationId
          || kernel.timelineBranchId !== sceneInstance.timelineBranchId
        ) {
          addIssue(
            context,
            ['compiler', 'sceneInstances', sceneIndex, 'kernelInstanceIds', kernelIndex],
            'SCREENPLAY_07S_SCENE_IDENTITY_MISMATCH',
          )
        }
      }
    }

    if (
      document.renderedScreenplay.title !== document.projectDefinition.workingTitle
      || document.renderedScreenplay.logline !== document.projectDefinition.logline
      || document.renderedScreenplay.synopsis !== document.projectDefinition.synopsis
      || document.renderedScreenplay.text !== renderScreenplayText(document)
    ) {
      addIssue(
        context,
        ['renderedScreenplay'],
        'SCREENPLAY_07S_READABLE_EXPORT_MISMATCH',
      )
    }
  },
)

export type ScreenplayResourceDocument = z.infer<typeof screenplayResourceDocumentSchema>

export type ScreenplayCompiledSceneInstance = ScreenplayResourceDocument['compiler']['sceneInstances'][number]

type ScriptKernelSceneIdentity = Pick<
  ScreenplayDraftOutput['scriptKernels'][number],
  'instanceId' | 'sceneId' | 'sequenceId' | 'slugline' | 'locationId' | 'timelineBranchId'
>

function orderKernels(output: ScreenplayDraftOutput): ScreenplayDraftOutput['scriptKernels'] {
  return [...output.scriptKernels].sort((left, right) => left.orderIndex - right.orderIndex)
}

export function compileScreenplaySceneInstances(
  kernels: readonly ScriptKernelSceneIdentity[],
): ScreenplayCompiledSceneInstance[] {
  const instances: ScreenplayCompiledSceneInstance[] = []
  for (const kernel of kernels) {
    const previous = instances.at(-1)
    if (
      previous
      && previous.sceneId === kernel.sceneId
      && previous.sequenceId === kernel.sequenceId
      && previous.slugline === kernel.slugline
      && previous.locationId === kernel.locationId
      && previous.timelineBranchId === kernel.timelineBranchId
    ) {
      previous.kernelInstanceIds.push(kernel.instanceId)
      continue
    }
    instances.push({
      orderIndex: instances.length + 1,
      sceneId: kernel.sceneId,
      sequenceId: kernel.sequenceId,
      slugline: kernel.slugline,
      locationId: kernel.locationId,
      timelineBranchId: kernel.timelineBranchId,
      kernelInstanceIds: [kernel.instanceId],
    })
  }
  return instances
}

function renderDialogue(line: z.infer<typeof dialogueLineSchema>): readonly string[] {
  return [line.characterName.toUpperCase(), line.text]
}

export function renderScreenplayText(output: ScreenplayDraftOutput): string {
  const lines: string[] = [`# ${output.projectDefinition.workingTitle}`, '']
  let lastSceneIdentity: string | null = null
  for (const kernel of orderKernels(output)) {
    const sceneIdentity = JSON.stringify({
      sceneId: kernel.sceneId,
      sequenceId: kernel.sequenceId,
      slugline: kernel.slugline,
      locationId: kernel.locationId,
      timelineBranchId: kernel.timelineBranchId,
    })
    if (sceneIdentity !== lastSceneIdentity) {
      if (lastSceneIdentity !== null) lines.push('')
      lines.push(`## ${kernel.slugline}`, '')
      lastSceneIdentity = sceneIdentity
    }
    lines.push(kernel.stageDirection)
    if (kernel.microMovement.trim()) lines.push(kernel.microMovement)
    for (const dialogue of kernel.dialogue) {
      lines.push('', ...renderDialogue(dialogue))
    }
    if (kernel.silence.present && kernel.silence.function.trim()) {
      lines.push('', `[${kernel.silence.function}]`)
    }
    lines.push('')
  }
  return lines.join('\n').trim()
}

export function buildScreenplayResourceDocument(
  output: ScreenplayDraftOutput,
): ScreenplayResourceDocument {
  const scriptKernels = orderKernels(output)
  return screenplayResourceDocumentSchema.parse({
    ...output,
    scriptKernels,
    compiler: {
      stage: '07S',
      sourceStage: '06T',
      sceneInstances: compileScreenplaySceneInstances(scriptKernels),
    },
    renderedScreenplay: {
      title: output.projectDefinition.workingTitle,
      logline: output.projectDefinition.logline,
      synopsis: output.projectDefinition.synopsis,
      text: renderScreenplayText(output),
    },
  })
}
