import { createTimelineClock, createTimelineSignature } from '@/lib/audio-design/timeline'
import type { AudioTimelineV2 } from '@/lib/audio-design/types'
import type { BgmScorePlan } from '@/lib/bgm-score/types'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'

const CLIP: FinalRenderClipPlan = {
  order: 1,
  sourceKind: 'panel',
  panelId: 'panel-1',
  groupId: null,
  shotNumber: 1,
  shotNumbers: [1],
  source: { storageKey: 'video/source.mp4', url: '/m/source-video' },
  durationSeconds: 3,
  description: 'panel 1',
  sound: 'native dialogue and synchronized action sounds',
}

export function buildFinalRenderTestTimeline(signatureOverride?: string): AudioTimelineV2 {
  const clock = createTimelineClock({ clips: [CLIP], fpsNumerator: 24, fpsDenominator: 1 })
  return {
    schemaVersion: 3,
    timelineSignature: signatureOverride ?? createTimelineSignature({ clips: [CLIP], clock }),
    clock,
    nativeAudioPolicy: {
      provider: 'video_model_native',
      dialogueAndActionPolicy: 'keep_native_dialogue_and_synchronized_actions',
      generatedPostRoles: ['ambience', 'bgm'],
      missingCriticalActionPolicy: 'fail_and_regenerate_video_segment',
    },
    clips: [{
      order: 1,
      sourceKind: 'panel',
      panelId: 'panel-1',
      groupId: null,
      shotNumber: 1,
      shotNumbers: [1],
      range: { startFrame: 0, endFrameExclusive: 72 },
      visualSummary: 'panel 1',
      soundDirection: 'native dialogue and synchronized action sounds',
    }],
    soundWorlds: [],
    acousticTransitions: [],
    nativeActionEvents: [],
    ambienceSources: [],
    scoreCues: [{
      cueId: 'score-master',
      musicalContinuityId: 'score-continuity',
      range: { startFrame: 0, endFrameExclusive: 72 },
      narrativeDiagnosis: {
        surfaceEmotion: 'visible tension',
        trueScoringEmotion: 'restrained procedural pressure',
        scoringStance: 'procedural_control',
        avoidEmotions: ['melodrama'],
        musicShouldDo: 'stay continuous and leave room for native actions',
        musicShouldNotDo: 'imitate literal actions',
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
        prohibitions: ['vocals', 'lyrics', 'spoken_word', 'literal_sound_effects', 'environmental_recordings', 'authentic_cadence'],
      },
      intentionalSilenceRanges: [],
    }],
    automationLanes: [{
      laneId: 'score-native-action-space',
      targetBus: 'score',
      targetSourceId: null,
      parameter: 'gain_db',
      keyframes: [
        { frame: 12, value: 0, interpolation: 'smooth' },
        { frame: 24, value: -6, interpolation: 'smooth' },
        { frame: 36, value: 0, interpolation: 'smooth' },
      ],
      postBehavior: 'return_to_neutral',
      reason: 'create smooth space for a native synchronized action sound',
      sourceEventId: 'native-action-1',
    }],
    stemPlan: [{
      role: 'native_video', status: 'generated', provider: null, modelId: null, modelKey: null,
      generationKind: 'native_reference', description: 'native',
    }, {
      role: 'ambience', status: 'planned', provider: 'elevenlabs', modelId: 'eleven_text_to_sound_v2',
      modelKey: 'elevenlabs::eleven_text_to_sound_v2', generationKind: 'ambience', description: 'ambience',
    }, {
      role: 'bgm', status: 'planned', provider: 'fal', modelId: 'fal-ai/lyria3/pro',
      modelKey: 'fal::fal-ai/lyria3/pro', generationKind: 'music', description: 'score',
    }],
  }
}

const BGM_PLAN: BgmScorePlan = {
  durationSeconds: 3,
  creativeBrief: {
    cueType: 'continuous score cue',
    genre: 'minimalist underscore',
    mood: 'cold procedural tension',
    narrativeFunction: 'continuous support',
  },
  scoreDesign: {
    overview: 'One continuous score cue.',
    sections: [{ category: 'development', title: 'full-cue', startSec: 0, endSec: 3, content: 'sparse' }],
  },
  virtualLayers: [{ name: 'muted_analog_synthesizer', purpose: 'harmonic bed', content: 'sustained' }],
  promptSections: [{ title: 'Music generation', startSec: 0, endSec: 3, content: 'safe structured music terms' }],
  finalPrompt: 'Continuous instrumental cinematic underscore at 60 BPM in D minor, sparse and restrained, muted analog synthesizer and soft sub bass, no vocals, no sound effects.',
  negativePrompt: 'No vocals, no literal action sounds, no abrupt cuts.',
}

export function buildFinalRenderEditorProjectData(timeline: AudioTimelineV2): string {
  return JSON.stringify({
    schemaVersion: 1,
    bgmScore: {
      schemaVersion: 5,
      status: 'completed',
      taskId: 'task-bgm',
      analysisMode: 'script_assisted',
      editScriptId: 'edit-script-1',
      timelineSignature: timeline.timelineSignature,
      durationSeconds: 3,
      musicModel: 'fal::fal-ai/lyria3/pro',
      timelineAudio: timeline,
      plan: BGM_PLAN,
      mix: {
        mediaId: 'media-bgm', url: '/m/bgm', storageKey: 'music/bgm-score.m4a',
        mimeType: 'audio/mp4', durationMs: 3000,
      },
      ambienceAssets: [],
      stage: 'completed',
    },
  })
}
