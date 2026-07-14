import { describe, expect, it } from 'vitest'
import {
  compactKernelCompilerForAudio,
  createKernelCompilerHash,
  parseKernelCompilerScript,
} from '@/lib/audio-design/kernel-compiler'

function inputFixture(): Record<string, unknown> {
  return {
    stage: 'kernel_compiler',
    interaction_density_prior: {
      interactionDensity: 0.3,
      sourceStage00Value: 0.3,
      definition: 'creative_target_for_finished_wall_clock_active_speech_coverage_ratio',
      targetSpokenCoverageRatio: 0.3,
      targetNonSpeechCoverageRatio: 0.7,
      aggregateSpeakerSecondsExcludedFromThisMetric: true,
      runtimeEnforced: false,
      overrideApplied: false,
      overrideReason: '',
      downstreamPolicy: 'Creative prior only; never convert to timing.',
    },
    dialogue_timing_policy: {
      runtime_enforced: false,
      pre_render_estimation_forbidden: true,
    },
    dialogue_continuity_audit: {
      status: 'pass',
      lineCount: 1,
      failedKernelCount: 0,
      repeatedLineCount: 0,
      lowFunctionLineCount: 0,
      continuityBreakCount: 0,
      paddingDetected: false,
      dialogueTimingEnforced: false,
    },
    micro_beat_kernels: [{
      kernel_id: 'K-0001',
      sequence_id: 'SEQ-01',
      scene_id: 'SC-01',
      location_id: 'LOC-01',
      location_name: 'Cottage',
      beat_index: 1,
      dramatic_function: 'Establish restrained conflict.',
      action: 'A character reaches for a drawer.',
      dialogue: [{
        character: 'CHAR-01',
        line: 'Why is this here?',
        subtext: 'Recognition without resolution.',
        repetition_risk: 'low',
        padding_risk: 'low',
      }],
      dialogue_continuity_audit: {
        source_stage_06_status: 'pass',
        kernel_status: 'pass',
        repeated_line_count: 0,
        low_function_line_count: 0,
        continuity_break_count: 0,
        repair_note: 'No repair required.',
      },
      beat_interaction_type: 'dialogue_exchange',
      dialogue_density_prior: {
        interaction_density: 0.3,
        source_stage: '01',
        runtime_enforced: false,
        policy: 'creative_prior_only',
      },
      beat_frequency_compliance: {
        kernel_runtime_sec: 42.857,
        status: 'pass',
      },
      generation_facing_visual: {
        projectVisualLookLock: {
          visualStyle: 'Tactile stop motion',
          chromaticity: 0.2,
          luminanceContrast: 0.8,
          spatialSubjectivity: 0.7,
          cameraDynamics: 0.3,
          toneCurve: 'Compressed highlights',
          colorBehavior: 'Muted earth tones',
          opticalFamily: 'Anamorphic',
          texture: 'Clay and paper',
          grain: 'Organic grain',
          halation: 'Subtle warm halation',
        },
        visualAdapterPayload: {
          locationId: 'LOC-01',
          multiSensoryTextControl: 'location lock applies',
        },
      },
      generation_facing_audio: {
        dynamicMixerBlueprint: 'Protect native dialogue and synchronized actions.',
        dialogueTimingEnforced: false,
      },
    }],
  }
}

describe('kernel compiler audio input', () => {
  it('parses the final kernel compiler format without treating estimated runtime as timing', () => {
    const script = parseKernelCompilerScript(inputFixture())
    const compact = compactKernelCompilerForAudio(script)

    expect(script.micro_beat_kernels).toHaveLength(1)
    expect(compact.kernels[0]).toMatchObject({
      kernelId: 'K-0001',
      sceneId: 'SC-01',
      locationId: 'LOC-01',
    })
    expect(JSON.stringify(compact)).not.toContain('kernel_runtime_sec')
    expect(createKernelCompilerHash(script)).toMatch(/^[a-f0-9]{24}$/)
  })

  it('rejects dialogue timing enforcement instead of accepting a conflicting clock source', () => {
    const input = inputFixture()
    input.dialogue_timing_policy = {
      runtime_enforced: true,
      pre_render_estimation_forbidden: true,
    }

    expect(() => parseKernelCompilerScript(input)).toThrow('AUDIO_KERNEL_COMPILER_INVALID')
  })
})
