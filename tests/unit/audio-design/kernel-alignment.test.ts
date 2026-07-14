import { describe, expect, it } from 'vitest'
import { parseKernelTimelineAlignment } from '@/lib/audio-design/kernel-alignment'
import { parseKernelCompilerScript } from '@/lib/audio-design/kernel-compiler'
import { TEST_CLOCK } from './audio-timeline-fixture'

function scriptFixture() {
  const base = {
    stage: 'kernel_compiler',
    interaction_density_prior: {
      interactionDensity: 0, sourceStage00Value: 0,
      definition: 'creative_target_for_finished_wall_clock_active_speech_coverage_ratio',
      targetSpokenCoverageRatio: 0, targetNonSpeechCoverageRatio: 1,
      aggregateSpeakerSecondsExcludedFromThisMetric: true, runtimeEnforced: false,
      overrideApplied: false, overrideReason: '', downstreamPolicy: 'Creative prior only.',
    },
    dialogue_timing_policy: { runtime_enforced: false, pre_render_estimation_forbidden: true },
    dialogue_continuity_audit: {
      status: 'pass', lineCount: 0, failedKernelCount: 0, repeatedLineCount: 0,
      lowFunctionLineCount: 0, continuityBreakCount: 0, paddingDetected: false, dialogueTimingEnforced: false,
    },
  }
  const kernel = (id: string, beat: number) => ({
    kernel_id: id, sequence_id: 'SEQ-01', scene_id: 'SC-01', location_id: 'LOC-01', location_name: 'Room',
    beat_index: beat, dramatic_function: 'Progress the scene.', action: 'A visible action.', dialogue: [],
    dialogue_continuity_audit: {
      source_stage_06_status: 'pass', kernel_status: 'pass', repeated_line_count: 0,
      low_function_line_count: 0, continuity_break_count: 0, repair_note: 'No repair.',
    },
    beat_interaction_type: 'nonverbal_action',
    dialogue_density_prior: { interaction_density: 0, source_stage: '01', runtime_enforced: false, policy: 'creative_prior_only' },
    beat_frequency_compliance: { kernel_runtime_sec: 10, status: 'pass' },
    generation_facing_visual: {
      projectVisualLookLock: {
        visualStyle: 'Natural', chromaticity: 0.5, luminanceContrast: 0.5, spatialSubjectivity: 0.5,
        cameraDynamics: 0.5, toneCurve: 'Natural', colorBehavior: 'Natural', opticalFamily: 'Spherical',
        texture: 'Natural', grain: 'Fine', halation: 'Subtle',
      },
      visualAdapterPayload: { locationId: 'LOC-01', multiSensoryTextControl: 'locked' },
    },
    generation_facing_audio: { dynamicMixerBlueprint: 'Protect native.', dialogueTimingEnforced: false },
  })
  return parseKernelCompilerScript({ ...base, micro_beat_kernels: [kernel('K-0001', 1), kernel('K-0002', 2)] })
}

describe('kernel frame alignment contract', () => {
  it('accepts only complete monotonic frame coverage', () => {
    const script = scriptFixture()
    const alignment = parseKernelTimelineAlignment({
      script,
      clock: TEST_CLOCK,
      text: JSON.stringify({
        schemaVersion: 1,
        alignedKernels: [{
          kernelId: 'K-0001', range: { startFrame: 0, endFrameExclusive: 120 }, confidence: 0.9,
          dialogueRanges: [], nativeActionEvents: [],
        }, {
          kernelId: 'K-0002', range: { startFrame: 120, endFrameExclusive: 240 }, confidence: 0.8,
          dialogueRanges: [], nativeActionEvents: [],
        }],
        unresolvedKernelIds: [],
      }),
    })
    expect(alignment.alignedKernels.map((kernel) => kernel.range)).toEqual([
      { startFrame: 0, endFrameExclusive: 120 },
      { startFrame: 120, endFrameExclusive: 240 },
    ])
  })

  it('rejects a gap instead of fabricating timing', () => {
    const script = scriptFixture()
    expect(() => parseKernelTimelineAlignment({
      script,
      clock: TEST_CLOCK,
      text: JSON.stringify({
        schemaVersion: 1,
        alignedKernels: [{
          kernelId: 'K-0001', range: { startFrame: 0, endFrameExclusive: 100 }, confidence: 0.9,
          dialogueRanges: [], nativeActionEvents: [],
        }, {
          kernelId: 'K-0002', range: { startFrame: 120, endFrameExclusive: 240 }, confidence: 0.8,
          dialogueRanges: [], nativeActionEvents: [],
        }],
        unresolvedKernelIds: [],
      }),
    })).toThrow('AUDIO_KERNEL_ALIGNMENT_NOT_CONTIGUOUS')
  })
})
