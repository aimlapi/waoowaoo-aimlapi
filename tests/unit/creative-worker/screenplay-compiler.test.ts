import { describe, expect, it } from 'vitest'
import {
  buildScreenplayResourceDocument,
  compileScreenplaySceneInstances,
  screenplayDraftOutputSchema,
  screenplayResourceDocumentSchema,
} from '@/lib/creative-worker'

function kernel(input: {
  readonly instanceId: string
  readonly sceneId: string
  readonly sequenceId: string
  readonly slugline: string
  readonly locationId?: string
  readonly timelineBranchId?: string
}) {
  return {
    ...input,
    locationId: input.locationId ?? 'LOC_001',
    timelineBranchId: input.timelineBranchId ?? 'MAIN',
  }
}

function buildValidated06T() {
  const entityReferences = {
    characterIds: ['CHAR_001'],
    factIds: ['FACT_001'],
    propIds: ['PROP_001'],
  }
  const scene = (input: {
    readonly sceneId: 'SCENE_001' | 'SCENE_002'
    readonly chronologicalOrderIndex: 1 | 2
    readonly slugline: string
  }) => ({
    ...input,
    sequenceId: 'SEQ_001',
    locationId: 'LOC_001',
    timelineBranchId: 'MAIN',
    temporalRelationToPreviousScene: input.chronologicalOrderIndex === 1 ? 'continuous' : 'later',
    entityReferences,
    sceneObjective: `Objective ${input.sceneId}`,
    entryState: `Entry ${input.sceneId}`,
    causalAction: `Action ${input.sceneId}`,
    turn: `Turn ${input.sceneId}`,
    exitState: `Exit ${input.sceneId}`,
  })
  const scriptKernel = (input: {
    readonly instanceId: 'PRES_0001' | 'PRES_0002' | 'PRES_0003' | 'PRES_0004'
    readonly orderIndex: 1 | 2 | 3 | 4
    readonly beatId: 'BEAT_0001' | 'BEAT_0002' | 'BEAT_0003' | 'BEAT_0004'
    readonly sceneId: 'SCENE_001' | 'SCENE_002'
    readonly chronologicalOrderIndex: 1 | 2 | 3 | 4
    readonly slugline: string
    readonly stageDirection: string
  }) => ({
    ...input,
    sourceType: 'canonical' as const,
    replay: false,
    replayAddsNewInformation: '',
    sequenceId: 'SEQ_001',
    locationId: 'LOC_001',
    timelineBranchId: 'MAIN',
    entityReferences,
    dramaticFunction: `Function ${input.beatId}`,
    cause: `Cause ${input.beatId}`,
    microMovement: `Movement ${input.beatId}`,
    dialogue: [],
    silence: { present: false, function: '' },
    stateChanges: [],
    continuityOut: `Continuity ${input.beatId}`,
    laterLinkBackBeatId: null,
  })
  const check = { status: 'pass', reason: 'Validated.' } as const
  return screenplayDraftOutputSchema.parse({
    kind: 'screenplay_draft',
    schemaVersion: '2.0.0',
    status: 'final',
    source: {
      styleRevision: {
        resourceId: 'style-resource',
        revisionId: 'style-revision',
        fingerprint: 'style-fingerprint',
        bindingVersion: 1,
        schemaId: 'project.style_bible',
      },
    },
    projectDefinition: {
      workingTitle: 'Compiler Test',
      logline: 'A return to the same room changes the story.',
      synopsis: 'The protagonist leaves one scene and later returns to it.',
      format: 'short film',
      genres: ['drama'],
      tone: ['restrained'],
      language: 'en',
      estimatedDurationSeconds: 60,
    },
    canonicalRegistries: {
      characters: [{
        characterId: 'CHAR_001',
        canonicalName: 'Avery',
        role: 'protagonist',
        storyFunction: 'Makes the irreversible choice.',
      }],
      facts: [{
        factId: 'FACT_001',
        statement: 'The door locks after the first exit.',
        initiallyKnownBy: ['CHAR_001'],
        protectedUntilSceneId: null,
      }],
      locations: [{
        locationId: 'LOC_001',
        canonicalName: 'Room',
        causalFunction: 'Contains the locked door.',
      }],
      props: [{
        propId: 'PROP_001',
        canonicalName: 'Key',
        causalFunction: 'Changes access to the room.',
        stateful: true,
      }],
    },
    timelineRegistry: [{
      timelineBranchId: 'MAIN',
      function: 'Main chronology',
      relationToMain: 'continuous',
    }],
    storyArchitecture: {
      storyCoreEngine: {
        premise: 'A return has a higher cost.',
        recurringCausalRule: 'Each exit closes an option.',
        costMechanism: 'Access is lost.',
        protagonistPressure: 'Avery must choose whether to return.',
        centralDramaticQuestion: 'Will Avery accept the cost of returning?',
      },
      characterOntologies: [{
        characterId: 'CHAR_001',
        want: 'Leave safely.',
        need: 'Accept responsibility.',
        fear: 'Being trapped.',
        misbelief: 'Every choice can be reversed.',
        pressureResponse: 'Checks every exit.',
        transformation: 'Accepts an irreversible return.',
      }],
      characterScriptProfiles: [{
        characterId: 'CHAR_001',
        speechPattern: 'Brief direct statements.',
        behaviorPattern: 'Tests doors before speaking.',
        silencePattern: 'Pauses at thresholds.',
        contradictionPattern: 'Claims certainty while checking twice.',
      }],
      sequences: [{
        sequenceId: 'SEQ_001',
        orderIndex: 1,
        function: 'Force the return.',
        entryState: 'The exit is open.',
        exitState: 'The return is irreversible.',
        relativeRuntimeShare: 1,
      }],
      scenes: [
        scene({ sceneId: 'SCENE_001', chronologicalOrderIndex: 1, slugline: 'INT. ROOM - DAY' }),
        scene({ sceneId: 'SCENE_002', chronologicalOrderIndex: 2, slugline: 'INT. HALL - DAY' }),
      ],
    },
    stateLedger: {
      initialStates: [{
        target: { targetType: 'prop', targetId: 'PROP_001' },
        state: 'The key is carried by Avery.',
      }],
      sceneDeltas: [
        { sceneId: 'SCENE_001', stateIn: 'The door is open.', mutations: [], stateOut: 'Avery leaves.' },
        { sceneId: 'SCENE_002', stateIn: 'Avery is outside.', mutations: [], stateOut: 'Avery chooses to return.' },
      ],
      parallelGroupJoins: [],
    },
    scriptKernels: [
      scriptKernel({ instanceId: 'PRES_0004', orderIndex: 4, beatId: 'BEAT_0004', sceneId: 'SCENE_001', chronologicalOrderIndex: 3, slugline: 'INT. ROOM - DAY', stageDirection: 'Avery returns to the room.' }),
      scriptKernel({ instanceId: 'PRES_0002', orderIndex: 2, beatId: 'BEAT_0002', sceneId: 'SCENE_001', chronologicalOrderIndex: 2, slugline: 'INT. ROOM - DAY', stageDirection: 'Avery closes the door.' }),
      scriptKernel({ instanceId: 'PRES_0001', orderIndex: 1, beatId: 'BEAT_0001', sceneId: 'SCENE_001', chronologicalOrderIndex: 1, slugline: 'INT. ROOM - DAY', stageDirection: 'Avery takes the key.' }),
      scriptKernel({ instanceId: 'PRES_0003', orderIndex: 3, beatId: 'BEAT_0003', sceneId: 'SCENE_002', chronologicalOrderIndex: 4, slugline: 'INT. HALL - DAY', stageDirection: 'Avery stops in the hall.' }),
    ],
    validation: {
      stage: '06T',
      status: 'pass',
      premisePromise: check,
      causalContinuity: check,
      characterContinuity: check,
      dialogueContinuity: check,
      stateContinuity: check,
      duplicateDramaticFunction: check,
      openingIntegrity: check,
      endingIntegrity: check,
      registryIntegrity: check,
      narrativeOnlyBoundary: check,
    },
    assumptions: [],
    openQuestions: [],
  })
}

describe('07S deterministic screenplay compiler', () => {
  it('groups only contiguous visits and exports every accepted kernel identity exactly once', () => {
    const kernels = [
      kernel({ instanceId: 'PRES_0001', sceneId: 'SCENE_001', sequenceId: 'SEQ_001', slugline: 'INT. ROOM - DAY' }),
      kernel({ instanceId: 'PRES_0002', sceneId: 'SCENE_001', sequenceId: 'SEQ_001', slugline: 'INT. ROOM - DAY' }),
      kernel({ instanceId: 'PRES_0003', sceneId: 'SCENE_002', sequenceId: 'SEQ_001', slugline: 'EXT. STREET - DAY' }),
      kernel({ instanceId: 'PRES_0004', sceneId: 'SCENE_001', sequenceId: 'SEQ_001', slugline: 'INT. ROOM - DAY' }),
    ]

    const sceneInstances = compileScreenplaySceneInstances(kernels)

    expect(sceneInstances).toEqual([
      {
        orderIndex: 1,
        sceneId: 'SCENE_001',
        sequenceId: 'SEQ_001',
        slugline: 'INT. ROOM - DAY',
        locationId: 'LOC_001',
        timelineBranchId: 'MAIN',
        kernelInstanceIds: ['PRES_0001', 'PRES_0002'],
      },
      {
        orderIndex: 2,
        sceneId: 'SCENE_002',
        sequenceId: 'SEQ_001',
        slugline: 'EXT. STREET - DAY',
        locationId: 'LOC_001',
        timelineBranchId: 'MAIN',
        kernelInstanceIds: ['PRES_0003'],
      },
      {
        orderIndex: 3,
        sceneId: 'SCENE_001',
        sequenceId: 'SEQ_001',
        slugline: 'INT. ROOM - DAY',
        locationId: 'LOC_001',
        timelineBranchId: 'MAIN',
        kernelInstanceIds: ['PRES_0004'],
      },
    ])
    expect(sceneInstances.flatMap((scene) => scene.kernelInstanceIds)).toEqual(
      kernels.map((entry) => entry.instanceId),
    )
  })

  it('copies the complete accepted kernel payload and rejects a corrupted persisted 07S projection', () => {
    const validated06T = buildValidated06T()
    const document = buildScreenplayResourceDocument(validated06T)
    const orderedKernels = [...validated06T.scriptKernels].sort(
      (left, right) => left.orderIndex - right.orderIndex,
    )

    expect(document.scriptKernels).toEqual(orderedKernels)
    expect(document.compiler.sceneInstances.map((sceneInstance) => sceneInstance.kernelInstanceIds)).toEqual([
      ['PRES_0001', 'PRES_0002'],
      ['PRES_0003'],
      ['PRES_0004'],
    ])
    expect(screenplayResourceDocumentSchema.safeParse({
      ...document,
      compiler: {
        ...document.compiler,
        sceneInstances: document.compiler.sceneInstances.slice(1),
      },
    }).success).toBe(false)
    expect(screenplayResourceDocumentSchema.safeParse({
      ...document,
      renderedScreenplay: {
        ...document.renderedScreenplay,
        text: `${document.renderedScreenplay.text}\nInvented ending.`,
      },
    }).success).toBe(false)
  })

  it('rejects a 06T verdict whose registries, scenes, ledger, and kernels do not fully agree', () => {
    const validated06T = buildValidated06T()
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      storyArchitecture: {
        ...validated06T.storyArchitecture,
        characterScriptProfiles: [],
      },
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: validated06T.scriptKernels.filter(
        (entry) => entry.sceneId !== 'SCENE_002',
      ),
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      stateLedger: {
        ...validated06T.stateLedger,
        sceneDeltas: validated06T.stateLedger.sceneDeltas.slice(0, 1),
      },
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      storyArchitecture: {
        ...validated06T.storyArchitecture,
        sequences: validated06T.storyArchitecture.sequences.map((sequence) => ({
          ...sequence,
          relativeRuntimeShare: 0.5,
        })),
      },
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: validated06T.scriptKernels.map((entry, index) => (
        index === 0 ? { ...entry, chronologicalOrderIndex: 99 } : entry
      )),
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: validated06T.scriptKernels.map((entry) => {
        if (entry.beatId === 'BEAT_0001') return { ...entry, chronologicalOrderIndex: 4 }
        if (entry.beatId === 'BEAT_0003') return { ...entry, chronologicalOrderIndex: 1 }
        return entry
      }),
    }).success).toBe(false)
    const originalSequence = validated06T.storyArchitecture.sequences[0]
    expect(originalSequence).toBeDefined()
    if (!originalSequence) return
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      storyArchitecture: {
        ...validated06T.storyArchitecture,
        sequences: [
          { ...originalSequence, relativeRuntimeShare: 0.5 },
          {
            ...originalSequence,
            sequenceId: 'SEQ_002',
            orderIndex: 2,
            relativeRuntimeShare: 0.5,
          },
        ],
        scenes: validated06T.storyArchitecture.scenes.map((scene) => ({
          ...scene,
          sequenceId: scene.sceneId === 'SCENE_001' ? 'SEQ_002' : 'SEQ_001',
        })),
      },
      scriptKernels: validated06T.scriptKernels.map((entry) => ({
        ...entry,
        sequenceId: entry.sceneId === 'SCENE_001' ? 'SEQ_002' : 'SEQ_001',
      })),
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      storyArchitecture: {
        ...validated06T.storyArchitecture,
        scenes: validated06T.storyArchitecture.scenes.map((scene) => (
          scene.sceneId === 'SCENE_001'
            ? {
                ...scene,
                entityReferences: { ...scene.entityReferences, propIds: [] },
              }
            : scene
        )),
      },
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      timelineRegistry: [
        ...validated06T.timelineRegistry,
        {
          timelineBranchId: 'UNUSED_PARALLEL',
          function: 'Never instantiated.',
          relationToMain: 'parallel',
        },
      ],
      stateLedger: {
        ...validated06T.stateLedger,
        parallelGroupJoins: [{
          timelineBranchIds: ['MAIN', 'UNUSED_PARALLEL'],
          joinsBeforeSceneId: 'SCENE_002',
          resolution: 'The branches rejoin.',
        }],
      },
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: validated06T.scriptKernels.map((entry, index) => (
        index === 0
          ? {
              ...entry,
              stateChanges: [{
                target: { targetType: 'prop', targetId: 'PROP_001' },
                field: 'possession',
                before: 'room',
                after: 'Avery',
                cause: 'Avery takes the key.',
              }],
            }
          : entry
      )),
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: validated06T.scriptKernels.map((entry) => (
        entry.beatId === 'BEAT_0001'
          ? {
              ...entry,
              dialogue: [{
                lineId: 'LINE_0001',
                characterId: 'CHAR_001',
                characterName: 'Wrong Name',
                text: 'The key is mine.',
                function: 'reveal',
                tactic: '',
                subtext: '',
              }],
            }
          : entry
      )),
    }).success).toBe(false)
    const duplicateMutation = {
      target: { targetType: 'prop' as const, targetId: 'PROP_001' },
      field: 'possession',
      before: 'room',
      after: 'Avery',
      cause: 'Avery takes the key.',
    }
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      stateLedger: {
        ...validated06T.stateLedger,
        sceneDeltas: validated06T.stateLedger.sceneDeltas.map((delta) => (
          delta.sceneId === 'SCENE_001'
            ? { ...delta, mutations: [duplicateMutation, duplicateMutation] }
            : delta
        )),
      },
      scriptKernels: validated06T.scriptKernels.map((entry) => (
        entry.beatId === 'BEAT_0001'
          ? { ...entry, stateChanges: [duplicateMutation, duplicateMutation] }
          : entry
      )),
    }).success).toBe(false)
  })

  it('preserves exact canonical replays and a linked external cold open without treating them as new canonical scenes', () => {
    const validated06T = buildValidated06T()
    const sourceKernel = validated06T.scriptKernels.find(
      (entry) => entry.instanceId === 'PRES_0001',
    )
    expect(sourceKernel).toBeDefined()
    if (!sourceKernel) return

    const replay = {
      ...sourceKernel,
      instanceId: 'PRES_REPLAY_001',
      orderIndex: 5,
      replay: true,
      replayAddsNewInformation: 'After the hallway choice, the same action reveals its irreversible cost.',
    }
    const replayResult = screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [...validated06T.scriptKernels, replay],
    })
    expect(replayResult.success).toBe(true)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        ...validated06T.scriptKernels,
        { ...replay, stageDirection: 'A rewritten replay.' },
      ],
    }).success).toBe(false)

    const externalHook = {
      ...sourceKernel,
      instanceId: 'PRES_HOOK_001',
      orderIndex: 1,
      sourceType: 'external_hook' as const,
      replay: false,
      replayAddsNewInformation: '',
      sceneId: 'HOOK_SCENE_001',
      sequenceId: 'HOOK_SEQUENCE' as const,
      beatId: 'HOOK_BEAT_001',
      chronologicalOrderIndex: null,
      slugline: 'INT. THRESHOLD - LATER',
      timelineBranchId: 'HOOK',
      dramaticFunction: 'Create a truthful causal question that links back to the first canonical beat.',
      cause: 'The later consequence exposes the cost of taking the key.',
      stageDirection: 'Avery sets the same key beside the locked door.',
      microMovement: '',
      dialogue: [],
      stateChanges: [],
      continuityOut: 'The presentation returns to the canonical opening.',
      laterLinkBackBeatId: sourceKernel.beatId,
    }
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        externalHook,
        ...validated06T.scriptKernels.map((entry) => ({
          ...entry,
          orderIndex: entry.orderIndex + 1,
        })),
      ],
    }).success).toBe(true)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        { ...externalHook, laterLinkBackBeatId: 'BEAT_UNKNOWN' },
        ...validated06T.scriptKernels.map((entry) => ({
          ...entry,
          orderIndex: entry.orderIndex + 1,
        })),
      ],
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        { ...externalHook, locationId: 'LOC_UNKNOWN' },
        ...validated06T.scriptKernels.map((entry) => ({
          ...entry,
          orderIndex: entry.orderIndex + 1,
        })),
      ],
    }).success).toBe(false)
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        {
          ...externalHook,
          stateChanges: [{
            target: { targetType: 'prop', targetId: 'PROP_001' },
            field: 'condition',
            before: 'intact',
            after: 'broken',
            cause: 'The cold open breaks the key outside the canonical ledger.',
          }],
        },
        ...validated06T.scriptKernels.map((entry) => ({
          ...entry,
          orderIndex: entry.orderIndex + 1,
        })),
      ],
    }).success).toBe(false)
    const conflictingHookScene = {
      ...externalHook,
      instanceId: 'PRES_HOOK_002',
      orderIndex: 2,
      beatId: 'HOOK_BEAT_002',
      slugline: 'EXT. THRESHOLD - LATER',
    }
    expect(screenplayDraftOutputSchema.safeParse({
      ...validated06T,
      scriptKernels: [
        externalHook,
        conflictingHookScene,
        ...validated06T.scriptKernels.map((entry) => ({
          ...entry,
          orderIndex: entry.orderIndex + 2,
        })),
      ],
    }).success).toBe(false)
  })
})
