import type { Job } from 'bullmq'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TASK_TYPE, type TaskJobData } from '@/lib/task/types'

const prismaMock = vi.hoisted(() => ({
  project: { findUnique: vi.fn() },
  projectEpisode: { findFirst: vi.fn() },
  projectEditScript: { findUnique: vi.fn() },
  projectPanel: { findMany: vi.fn() },
  projectVideoGroup: { findMany: vi.fn() },
  videoEditorProject: { findUnique: vi.fn(), upsert: vi.fn() },
}))
const executeAiTextStepMock = vi.hoisted(() => vi.fn())
const generateScoreCandidatesMock = vi.hoisted(() => vi.fn())
const executeMediaGenerationMock = vi.hoisted(() => vi.fn())
const reportTaskProgressMock = vi.hoisted(() => vi.fn())
const analyzeLockedVideoFramesMock = vi.hoisted(() => vi.fn())
const analyzeRequiredNativeAudioMock = vi.hoisted(() => vi.fn())
const alignKernelCompilerToTimelineMock = vi.hoisted(() => vi.fn())
const flattenNativeActionEventsMock = vi.hoisted(() => vi.fn())
const mediaServiceMock = vi.hoisted(() => ({ ensureMediaObjectFromStorageKey: vi.fn() }))
const storageMock = vi.hoisted(() => ({
  generateUniqueKey: vi.fn((prefix: string, ext: string) => `${prefix}/asset.${ext}`),
  toFetchableUrl: vi.fn((url: string) => url),
  uploadObject: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
  executeMediaGeneration: executeMediaGenerationMock,
}))
vi.mock('@/lib/bgm-score/score-candidates', () => ({
  generateScoreCandidates: generateScoreCandidatesMock,
}))
vi.mock('@/lib/workers/shared', () => ({ reportTaskProgress: reportTaskProgressMock }))
vi.mock('@/lib/audio-design/video-visual-analysis', () => ({
  analyzeLockedVideoFrames: analyzeLockedVideoFramesMock,
}))
vi.mock('@/lib/audio-design/native-audio-analysis', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/audio-design/native-audio-analysis')>()
  return { ...original, analyzeRequiredNativeAudio: analyzeRequiredNativeAudioMock }
})
vi.mock('@/lib/audio-design/kernel-alignment', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/audio-design/kernel-alignment')>()
  return {
    ...original,
    alignKernelCompilerToTimeline: alignKernelCompilerToTimelineMock,
    flattenNativeActionEvents: flattenNativeActionEventsMock,
  }
})
vi.mock('@/lib/media/service', () => ({
  ensureMediaObjectFromStorageKey: mediaServiceMock.ensureMediaObjectFromStorageKey,
}))
vi.mock('@/lib/storage', () => ({
  generateUniqueKey: storageMock.generateUniqueKey,
  toFetchableUrl: storageMock.toFetchableUrl,
  uploadObject: storageMock.uploadObject,
}))

function job(): Job<TaskJobData> {
  return {
    queueName: 'waoowaoo-music',
    data: {
      taskId: 'task-bgm-1',
      type: TASK_TYPE.BGM_SCORE_GENERATE,
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      targetType: 'ProjectEpisode',
      targetId: 'episode-1',
      payload: {
        episodeId: 'episode-1',
        musicModel: 'fal::fal-ai/lyria3/pro',
      },
      userId: 'user-1',
    },
  } as unknown as Job<TaskJobData>
}

function continuityPlanText(): string {
  return JSON.stringify({
    schemaVersion: 4,
    soundWorlds: [{
      worldId: 'world-1',
      continuityKey: 'same-interior',
      range: { startFrame: 0, endFrameExclusive: 72 },
      location: 'interior room',
      timeContext: 'continuous',
      weatherContext: null,
      persistentSourceIds: [],
      perspectives: [{
        perspectiveId: 'perspective-1',
        zoneId: 'zone-1',
        range: { startFrame: 0, endFrameExclusive: 72 },
        enclosure: 'enclosed',
        distance: 'medium',
        occlusion: 0.2,
        description: 'one continuous interior perspective',
      }],
    }],
    acousticTransitions: [],
    soundPresence: [{
      segmentId: 'score-only',
      range: { startFrame: 0, endFrameExclusive: 72 },
      mode: 'score_only',
      fadeInFrames: 6,
      fadeOutFrames: 6,
      reason: 'the scene needs restrained score but no generated ambience',
    }],
    ambienceSources: [],
    scoreCues: [{
      cueId: 'score-master',
      musicalContinuityId: 'score-master-continuity',
      range: { startFrame: 0, endFrameExclusive: 72 },
      narrativeDiagnosis: {
        surfaceEmotion: 'violent bloody imagery',
        trueScoringEmotion: 'controlled pressure',
        scoringStance: 'procedural_control',
        avoidEmotions: ['sensational horror'],
        musicShouldDo: 'remain detached',
        musicShouldNotDo: 'imitate the physical event',
      },
      musicTheorySpec: {
        version: 2,
        bpm: 60,
        meter: '4/4',
        form: 'through_composed',
        metricSalience: 'suppressed',
        eventSpacing: 'asynchronous',
        pitch: {
          centerType: 'weakened_pitch_field', centerPitch: 'D', collection: 'chromatic_saturation',
          intervalRelations: ['minor_second_aggregation', 'tritone_polarity'], microtonality: 'limited',
        },
        harmony: { functionalSyntax: 'prohibited', cadencePolicy: 'no_cadence', harmonicRhythm: 'extremely_slow' },
        voiceLeading: ['incremental_micro_motion', 'semitone_displacement'],
        texture: { organization: 'independent_sustained_layers', density: 'sparse', layerIndependence: 0.8 },
        spectrum: { foundation: ['sub', 'low'], upperActivity: 'isolated_partials', evolution: 'continuous_redistribution' },
        orchestration: [{
          instrument: 'filtered_analog_synthesizer', register: 'low', role: 'foundation', techniques: ['sustained_tone'],
        }],
        dynamics: { envelope: 'long_arc', transientPolicy: 'suppressed', minimumEnergy: 0.15, maximumEnergy: 0.45 },
        phases: [{
          phaseId: 'full-cue',
          range: { startFrame: 0, endFrameExclusive: 72 },
          function: 'transform',
          energy: 0.3,
          density: 'sparse',
          spectralBand: 'low',
          transientDensity: 0.05,
        }],
        prohibitions: ['vocals', 'lyrics', 'spoken_word', 'literal_sound_effects', 'environmental_recordings', 'functional_dominant_tonic', 'authentic_cadence', 'heroic_brass', 'triumphant_rhythm', 'romantic_swell', 'cathartic_climax', 'trailer_impacts'],
      },
      intentionalSilenceRanges: [],
    }],
    automationLanes: [],
  })
}

function nativeOnlyContinuityPlanText(): string {
  const plan = JSON.parse(continuityPlanText()) as {
    soundPresence: Array<{ mode: string; reason: string }>
    scoreCues: unknown[]
  }
  const presence = plan.soundPresence[0]
  if (!presence) throw new Error('TEST_SOUND_PRESENCE_REQUIRED')
  presence.mode = 'native_only'
  presence.reason = 'native dialogue and synchronized action sound carry the complete sequence'
  plan.scoreCues = []
  return JSON.stringify(plan)
}

function kernelCompilerJson() {
  return {
    stage: 'kernel_compiler',
    interaction_density_prior: {
      interactionDensity: 0.5,
      sourceStage00Value: 0.5,
      definition: 'creative_target_for_finished_wall_clock_active_speech_coverage_ratio',
      targetSpokenCoverageRatio: 0.5,
      targetNonSpeechCoverageRatio: 0.5,
      aggregateSpeakerSecondsExcludedFromThisMetric: true,
      runtimeEnforced: false,
      overrideApplied: false,
      overrideReason: '',
      downstreamPolicy: 'creative prior only',
    },
    dialogue_timing_policy: { runtime_enforced: false, pre_render_estimation_forbidden: true },
    dialogue_continuity_audit: {
      status: 'pass', lineCount: 0, failedKernelCount: 0, repeatedLineCount: 0,
      lowFunctionLineCount: 0, continuityBreakCount: 0, paddingDetected: false,
      dialogueTimingEnforced: false,
    },
    micro_beat_kernels: [{
      kernel_id: 'K-0001', sequence_id: 'sequence-1', scene_id: 'scene-1',
      location_id: 'location-1', location_name: 'interior room', beat_index: 1,
      dramatic_function: 'sustain pressure', action: 'a visible action unfolds', dialogue: [],
      dialogue_continuity_audit: {
        source_stage_06_status: 'pass', kernel_status: 'pass', repeated_line_count: 0,
        low_function_line_count: 0, continuity_break_count: 0, repair_note: 'no repair needed',
      },
      beat_interaction_type: 'nonverbal_action',
      dialogue_density_prior: {
        interaction_density: 0.5, source_stage: 'stage_00', runtime_enforced: false,
        policy: 'creative_prior_only',
      },
      beat_frequency_compliance: { kernel_runtime_sec: 3, status: 'pass' },
      generation_facing_visual: {
        projectVisualLookLock: {
          visualStyle: 'controlled realism', chromaticity: 0.4, luminanceContrast: 0.6,
          spatialSubjectivity: 0.5, cameraDynamics: 0.4, toneCurve: 'soft shoulder',
          colorBehavior: 'restrained', opticalFamily: 'spherical', texture: 'fine',
          grain: 'subtle', halation: 'minimal',
        },
        visualAdapterPayload: { locationId: 'location-1', multiSensoryTextControl: 'interior room' },
      },
      generation_facing_audio: {
        dynamicMixerBlueprint: 'preserve native dialogue and synchronized action',
        dialogueTimingEnforced: false,
      },
    }],
  }
}

function mockReadyProject(): void {
  prismaMock.project.findUnique.mockResolvedValue({ analysisModel: 'openai::gpt-4.1', videoRatio: '16:9' })
  prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
  prismaMock.projectEditScript.findUnique.mockResolvedValue({
    id: 'edit-script-1',
    userPrompt: 'test',
    title: 'Test',
    logline: 'A test with difficult imagery.',
    durationSec: 3,
    styleBibleJson: null,
    shotsJson: [{
      shotNumber: 1,
      durationSec: 3,
      dramaticPurpose: 'test',
      visibleAction: 'A visible action',
      audienceFocus: 'subject',
      viewpoint: 'medium',
      revealPlan: 'none',
      performanceBeat: 'restrained',
      continuityIn: 'continuous',
      continuityOut: 'continuous',
      charactersAndScene: 'room',
      sound: 'native dialogue and synchronized actions only',
    }],
    videoBlocksJson: [],
    kernelCompilerJson: kernelCompilerJson(),
  })
  prismaMock.projectPanel.findMany.mockResolvedValue([{
    id: 'panel-1',
    panelIndex: 0,
    panelNumber: 1,
    duration: 3,
    description: 'panel 1',
    videoUrl: 'https://example.com/panel-1.mp4',
    videoMedia: null,
    photographyRules: JSON.stringify({ editScriptId: 'edit-script-1' }),
    storyboard: {
      id: 'storyboard-1',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      storyboardTextJson: JSON.stringify({ editScriptId: 'edit-script-1' }),
      clip: { createdAt: new Date('2026-01-01T00:00:00.000Z') },
    },
  }])
  prismaMock.projectVideoGroup.findMany.mockResolvedValue([])
}

describe('BGM score worker V6', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockReadyProject()
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: null })
    executeAiTextStepMock.mockResolvedValue({ text: continuityPlanText() })
    analyzeLockedVideoFramesMock.mockResolvedValue({
      schemaVersion: 2,
      sampleStepFrames: 24,
      observations: [{
        frame: 0,
        location: 'interior room',
        locationEvidence: 'observed',
        locationConfidence: 0.95,
        continuityWithPrevious: 'uncertain',
        transitionEvidence: [],
        enclosure: 'enclosed',
        weather: null,
        persistentEnvironment: ['quiet room'],
        outOfFramePersistentEnvironment: [],
        activityLevel: 0.3,
        suggestedScoreEnergy: 0.2,
        description: 'restrained interior scene',
      }],
    })
    analyzeRequiredNativeAudioMock.mockResolvedValue({
      schemaVersion: 1,
      sampleRate: 48_000,
      audioContentHash: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      clips: [{
        order: 1,
        range: { startFrame: 0, endFrameExclusive: 72 },
        pcmHash: 'bbbbbbbbbbbbbbbbbbbbbbbb',
        activityThresholdDbfs: -40,
        frameFeatures: Array.from({ length: 72 }, (_, frame) => ({
          frame, rmsDbfs: -30, peakDbfs: -12, crestDb: 18,
          zeroCrossingRate: 0.1, active: true, transient: false,
        })),
        activityRanges: [{ range: { startFrame: 0, endFrameExclusive: 72 }, meanRmsDbfs: -30, peakDbfs: -12 }],
        transientFrames: [],
      }],
    })
    const alignment = {
      schemaVersion: 1,
      alignedKernels: [{
        kernelId: 'K-0001', range: { startFrame: 0, endFrameExclusive: 72 }, confidence: 0.95,
        dialogueRanges: [], nativeActionEvents: [],
      }],
      unresolvedKernelIds: [],
    }
    alignKernelCompilerToTimelineMock.mockResolvedValue(alignment)
    flattenNativeActionEventsMock.mockReturnValue([])
    generateScoreCandidatesMock.mockImplementation(async (input: {
      onProgress: (candidates: readonly unknown[]) => Promise<void>
    }) => {
      const quality = {
        actualDurationSeconds: 3, sourceDurationSeconds: 3, durationConformanceRatio: 1,
        peakAmplitude: 0.5, rmsAmplitude: 0.1, clippingRatio: 0, silenceRatio: 0,
        transientRate: 0.5, repetitionScore: 0.2, structureError: 0.1, qualityScore: 90, passed: true,
      }
      const candidates = [0, 1].map((candidateIndex) => ({
        candidateIndex,
        selected: candidateIndex === 0,
        mediaId: `media-${candidateIndex}`,
        url: `/m/score-${candidateIndex}`,
        storageKey: `music/score-${candidateIndex}.mp3`,
        mimeType: 'audio/mpeg',
        durationMs: 3000,
        quality,
      }))
      await input.onProgress(candidates)
      return {
        candidates,
        selected: {
          mediaId: 'media-mix', url: '/m/bgm-mix', storageKey: 'music/score-0.mp3',
          mimeType: 'audio/mpeg', durationMs: 3000,
        },
      }
    })
    storageMock.uploadObject.mockImplementation(async (_buffer: Buffer, key: string) => key)
    mediaServiceMock.ensureMediaObjectFromStorageKey.mockResolvedValue({ id: 'media-mix', url: '/m/bgm-mix' })
  })

  it('persists a 24 fps frame-authoritative timeline and a provider-safe Lyria prompt', async () => {
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')
    const result = await handleBgmScoreGenerateTask(job())

    expect(result).toMatchObject({ mediaId: 'media-mix', ambienceSourceCount: 0 })
    const lyriaPrompt = String(generateScoreCandidatesMock.mock.calls[0]?.[0]?.prompt)
    expect(lyriaPrompt).toContain('60 BPM')
    expect(lyriaPrompt).not.toMatch(/violent|blood|gore|torture/i)
    expect(generateScoreCandidatesMock).toHaveBeenCalledWith(expect.objectContaining({
      negativePrompt: expect.stringContaining('foreground brass fanfare intervals and parallel triadic voicing'),
      reusableCandidates: [],
    }))

    const completed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string; schemaVersion?: number }
      }
      return data.bgmScore?.status === 'completed'
    })
    const projectData = JSON.parse(String(completed?.[0]?.update?.projectData ?? '{}')) as {
      bgmScore?: {
        schemaVersion?: number
        timelineAudio?: {
          clock?: { fpsNumerator?: number; fpsDenominator?: number; sampleRate?: number; totalFrames?: number }
          stemPlan?: readonly { role?: string }[]
        }
      }
    }
    expect(projectData.bgmScore?.schemaVersion).toBe(6)
    expect(projectData.bgmScore?.timelineAudio?.clock).toEqual({
      fpsNumerator: 24,
      fpsDenominator: 1,
      sampleRate: 48_000,
      totalFrames: 72,
    })
    expect(projectData.bgmScore?.timelineAudio?.stemPlan?.map((stem) => stem.role))
      .toEqual(['native_video', 'bgm'])
  })

  it('fails before model calls when the Kernel Compiler screenplay is missing', async () => {
    prismaMock.projectEditScript.findUnique.mockResolvedValue(null)
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).rejects.toThrow('BGM_SCORE_KERNEL_EDIT_SCRIPT_REQUIRED')
    expect(analyzeRequiredNativeAudioMock).not.toHaveBeenCalled()
    expect(analyzeLockedVideoFramesMock).not.toHaveBeenCalled()
    expect(executeAiTextStepMock).not.toHaveBeenCalled()
  })

  it('fails before model calls when no schedulable timeline exists', async () => {
    prismaMock.projectPanel.findMany.mockResolvedValue([])
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).rejects.toThrow('BGM_SCORE_VIDEO_TIMELINE_INCOMPLETE')
    expect(executeAiTextStepMock).not.toHaveBeenCalled()
    expect(generateScoreCandidatesMock).not.toHaveBeenCalled()
  })

  it('persists the failed stage without uploading a score when Lyria rejects the request', async () => {
    generateScoreCandidatesMock.mockRejectedValue(new Error('provider rejected final BGM'))
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).rejects.toThrow('provider rejected final BGM')
    expect(storageMock.uploadObject).not.toHaveBeenCalled()
    const failed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string; stage?: string; errorMessage?: string }
      }
      return data.bgmScore?.status === 'failed'
    })
    const data = JSON.parse(String(failed?.[0]?.update?.projectData ?? '{}')) as {
      bgmScore?: { stage?: string; errorMessage?: string }
    }
    expect(data.bgmScore).toMatchObject({ stage: 'failed', errorMessage: 'provider rejected final BGM' })
  })

  it('resumes a completed native-only timeline without rerunning planning or Lyria', async () => {
    executeAiTextStepMock.mockResolvedValueOnce({ text: nativeOnlyContinuityPlanText() })
    const { handleBgmScoreGenerateTask } = await import('@/lib/bgm-score/generate')

    await expect(handleBgmScoreGenerateTask(job())).resolves.toMatchObject({ mediaId: null })
    const completed = prismaMock.videoEditorProject.upsert.mock.calls.find((call) => {
      const data = JSON.parse(String(call[0]?.update?.projectData ?? '{}')) as {
        bgmScore?: { status?: string }
      }
      return data.bgmScore?.status === 'completed'
    })
    const completedProjectData = String(completed?.[0]?.update?.projectData ?? '')
    expect(completedProjectData).not.toBe('')
    prismaMock.videoEditorProject.findUnique.mockResolvedValue({ projectData: completedProjectData })

    await expect(handleBgmScoreGenerateTask(job())).resolves.toMatchObject({ mediaId: null })
    expect(executeAiTextStepMock).toHaveBeenCalledTimes(1)
    expect(generateScoreCandidatesMock).not.toHaveBeenCalled()
  })
})
