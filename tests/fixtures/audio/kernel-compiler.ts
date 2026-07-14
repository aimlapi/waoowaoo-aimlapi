import { parseKernelCompilerScript, type KernelCompilerScript } from '@/lib/audio-design/kernel-compiler'

export function createKernelCompilerFixture(): KernelCompilerScript {
  return parseKernelCompilerScript({
    stage: 'kernel_compiler',
    interaction_density_prior: {
      interactionDensity: 0,
      sourceStage00Value: 0,
      definition: 'creative_target_for_finished_wall_clock_active_speech_coverage_ratio',
      targetSpokenCoverageRatio: 0,
      targetNonSpeechCoverageRatio: 1,
      aggregateSpeakerSecondsExcludedFromThisMetric: true,
      runtimeEnforced: false,
      overrideApplied: false,
      overrideReason: '',
      downstreamPolicy: 'Creative prior only; video frames remain authoritative.',
    },
    dialogue_timing_policy: {
      runtime_enforced: false,
      pre_render_estimation_forbidden: true,
    },
    dialogue_continuity_audit: {
      status: 'pass',
      lineCount: 0,
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
      location_name: 'Room',
      beat_index: 1,
      dramatic_function: 'Progress the scene.',
      action: 'A visible action occurs.',
      dialogue: [],
      dialogue_continuity_audit: {
        source_stage_06_status: 'pass',
        kernel_status: 'pass',
        repeated_line_count: 0,
        low_function_line_count: 0,
        continuity_break_count: 0,
        repair_note: 'No repair required.',
      },
      beat_interaction_type: 'nonverbal_action',
      dialogue_density_prior: {
        interaction_density: 0,
        source_stage: '01',
        runtime_enforced: false,
        policy: 'creative_prior_only',
      },
      beat_frequency_compliance: {
        kernel_runtime_sec: 10,
        status: 'pass',
      },
      generation_facing_visual: {
        projectVisualLookLock: {
          visualStyle: 'Natural',
          chromaticity: 0.5,
          luminanceContrast: 0.5,
          spatialSubjectivity: 0.5,
          cameraDynamics: 0.5,
          toneCurve: 'Natural',
          colorBehavior: 'Natural',
          opticalFamily: 'Spherical',
          texture: 'Natural',
          grain: 'Fine',
          halation: 'Subtle',
        },
        visualAdapterPayload: {
          locationId: 'LOC-01',
          multiSensoryTextControl: 'Location remains locked.',
        },
      },
      generation_facing_audio: {
        dynamicMixerBlueprint: 'Protect native dialogue and synchronized action sounds.',
        dialogueTimingEnforced: false,
      },
    }],
  })
}
