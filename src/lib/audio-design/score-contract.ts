import { z } from 'zod'
import { frameRangeSchema } from './timeline-clock'

export const SCORE_SCORING_STANCE_VALUES = [
  'detached_observer',
  'subjective_pressure',
  'empathetic_support',
  'procedural_control',
  'minimal_presence',
] as const
export const scoreScoringStanceSchema = z.enum(SCORE_SCORING_STANCE_VALUES)

export const scoreNarrativeDiagnosisSchema = z.object({
  surfaceEmotion: z.string().trim().min(1),
  trueScoringEmotion: z.string().trim().min(1),
  scoringStance: scoreScoringStanceSchema,
  avoidEmotions: z.array(z.string().trim().min(1)).min(1),
  musicShouldDo: z.string().trim().min(1),
  musicShouldNotDo: z.string().trim().min(1),
})

export const SCORE_DENSITY_VALUES = ['minimal', 'sparse', 'moderate', 'dense'] as const
export const SCORE_REGISTER_VALUES = ['sub', 'low', 'low_mid', 'mid', 'high_mid', 'high'] as const
export const SCORE_SPECTRAL_SLOT_VALUES = ['sub', 'low', 'low_mid', 'mid', 'high_mid', 'high', 'air'] as const
export const SCORE_ENSEMBLE_COMPLEXITY_VALUES = ['minimal', 'chamber', 'hybrid', 'architectural'] as const
export const SCORE_INSTRUMENT_FAMILY_VALUES = [
  'strings',
  'woodwinds',
  'brass',
  'keyboards',
  'plucked',
  'percussion',
  'organ',
  'synthesizer',
  'sound_design',
] as const
export const SCORE_INSTRUMENT_VALUES = [
  'sub_bass_sine',
  'contrabass',
  'contrabassoon',
  'bass_clarinet',
  'low_brass',
  'prepared_piano',
  'felt_piano',
  'muted_string_ensemble',
  'string_harmonics',
  'solo_cello',
  'solo_viola',
  'filtered_analog_synthesizer',
  'granular_spectral_texture',
  'controlled_broadband_noise',
  'soft_mallets',
  'frame_drum',
  'pipe_organ',
  'chamber_strings',
  'violin_section',
  'viola_section',
  'cello_section',
  'flute',
  'oboe',
  'clarinet',
  'bassoon',
  'french_horn',
  'muted_trumpet',
  'trombone',
  'tuba',
  'harp',
  'celesta',
  'cimbalom',
  'mandolin',
  'plucked_string_ensemble',
  'timpani',
  'gran_cassa',
  'metal_percussion',
  'analog_synth_pulse',
  'analog_synth_pad',
] as const
export const SCORE_ORCHESTRATION_ROLE_VALUES = [
  'foundation',
  'mass',
  'motion',
  'partial',
  'resonance',
  'pulse',
] as const
export const SCORE_RHYTHMIC_FUNCTION_VALUES = [
  'sustained_field',
  'slow_pulse',
  'ostinato',
  'counterline',
  'accent_punctuation',
  'asynchronous_texture',
] as const
export const SCORE_PART_PRESENCE_VALUES = ['silent', 'entering', 'active', 'intensifying', 'receding'] as const
export const SCORE_PART_RELATION_VALUES = [
  'independent',
  'octave_doubling',
  'contrary_motion',
  'call_response',
  'shared_tone',
  'spectral_support',
] as const
export const SCORE_COLLISION_POLICY_VALUES = [
  'separate_registers',
  'alternate_attacks',
  'shared_sustain_only',
  'dynamic_priority_first',
  'dynamic_priority_second',
] as const
export const SCORE_RENDER_STRATEGY_VALUES = [
  'balanced_ensemble',
  'counterpoint_clarity',
  'spectral_depth',
  'microdynamic_detail',
] as const
export const scoreDensitySchema = z.enum(SCORE_DENSITY_VALUES)
export const scoreRegisterSchema = z.enum(SCORE_REGISTER_VALUES)
export const scoreInstrumentSchema = z.enum(SCORE_INSTRUMENT_VALUES)

const SCORE_INSTRUMENT_FAMILY_BY_INSTRUMENT: Record<
  typeof SCORE_INSTRUMENT_VALUES[number],
  typeof SCORE_INSTRUMENT_FAMILY_VALUES[number]
> = {
  sub_bass_sine: 'synthesizer',
  contrabass: 'strings',
  contrabassoon: 'woodwinds',
  bass_clarinet: 'woodwinds',
  low_brass: 'brass',
  prepared_piano: 'keyboards',
  felt_piano: 'keyboards',
  muted_string_ensemble: 'strings',
  string_harmonics: 'strings',
  solo_cello: 'strings',
  solo_viola: 'strings',
  filtered_analog_synthesizer: 'synthesizer',
  granular_spectral_texture: 'sound_design',
  controlled_broadband_noise: 'sound_design',
  soft_mallets: 'percussion',
  frame_drum: 'percussion',
  pipe_organ: 'organ',
  chamber_strings: 'strings',
  violin_section: 'strings',
  viola_section: 'strings',
  cello_section: 'strings',
  flute: 'woodwinds',
  oboe: 'woodwinds',
  clarinet: 'woodwinds',
  bassoon: 'woodwinds',
  french_horn: 'brass',
  muted_trumpet: 'brass',
  trombone: 'brass',
  tuba: 'brass',
  harp: 'plucked',
  celesta: 'keyboards',
  cimbalom: 'plucked',
  mandolin: 'plucked',
  plucked_string_ensemble: 'plucked',
  timpani: 'percussion',
  gran_cassa: 'percussion',
  metal_percussion: 'percussion',
  analog_synth_pulse: 'synthesizer',
  analog_synth_pad: 'synthesizer',
}

export const SCORE_FORM_VALUES = ['through_composed', 'continuous_variation'] as const
export const SCORE_PITCH_CENTER_VALUES = ['tonal', 'modal', 'weakened_pitch_field', 'atonal'] as const
export const SCORE_PITCH_COLLECTION_VALUES = [
  'diatonic',
  'modal',
  'chromatic_saturation',
  'whole_tone_fragments',
  'octatonic_fragments',
  'evolving_pitch_class_sets',
] as const
export const SCORE_INTERVAL_RELATION_VALUES = [
  'minor_second_aggregation',
  'major_seventh_tension',
  'tritone_polarity',
  'quartal_structures',
  'quintal_structures',
  'sustained_common_tones',
] as const
export const SCORE_CADENCE_POLICY_VALUES = [
  'no_cadence',
  'withhold_tonic',
  'deceptive_only',
  'open_ending',
  'tonal_resolution',
] as const
export const SCORE_HARMONIC_RHYTHM_VALUES = ['static', 'extremely_slow', 'slow', 'moderate'] as const
export const SCORE_VOICE_LEADING_VALUES = [
  'incremental_micro_motion',
  'semitone_displacement',
  'sustained_common_tones',
  'contrary_motion_expansion',
  'gradual_intervallic_transformation',
] as const
export const SCORE_TEXTURE_VALUES = [
  'sound_mass',
  'micropolyphonic',
  'independent_sustained_layers',
  'sparse_counterpoint',
  'homophonic',
] as const
export const SCORE_METRIC_SALIENCE_VALUES = ['suppressed', 'low', 'moderate', 'explicit'] as const
export const SCORE_EVENT_SPACING_VALUES = ['regular', 'irregular', 'asynchronous', 'stochastic'] as const
export const SCORE_SPECTRAL_EVOLUTION_VALUES = [
  'static',
  'gradual_expansion',
  'gradual_contraction',
  'continuous_redistribution',
] as const
export const SCORE_DYNAMIC_ENVELOPE_VALUES = [
  'long_arc',
  'slow_oscillation',
  'restrained_plateau',
  'continuous_redistribution',
] as const
export const SCORE_TRANSIENT_POLICY_VALUES = ['suppressed', 'restrained', 'permitted'] as const
export const SCORE_TECHNIQUE_VALUES = [
  'sustained_tone',
  'sul_ponticello',
  'sul_tasto',
  'flautando',
  'harmonic_fingering',
  'bow_pressure_modulation',
  'col_legno_tratto',
  'air_noise',
  'multiphonics',
  'key_click_resonance',
  'sympathetic_resonance',
  'slow_glissando',
  'microtonal_deviation',
] as const
export const SCORE_PHASE_FUNCTION_VALUES = [
  'establish',
  'transform',
  'intensify',
  'deplete',
  'suspend',
] as const
export const SCORE_PROHIBITION_VALUES = [
  'vocals',
  'lyrics',
  'spoken_word',
  'literal_sound_effects',
  'environmental_recordings',
  'functional_dominant_tonic',
  'authentic_cadence',
  'heroic_brass',
  'triumphant_rhythm',
  'romantic_swell',
  'cathartic_climax',
  'trailer_impacts',
  'stable_groove',
  'periodic_phrase_cycle',
] as const

export const scoreTheoryPhaseSchema = z.object({
  phaseId: z.string().trim().min(1),
  range: frameRangeSchema,
  function: z.enum(SCORE_PHASE_FUNCTION_VALUES),
  energy: z.number().min(0).max(1),
  density: scoreDensitySchema,
  spectralBand: scoreRegisterSchema,
  transientDensity: z.number().min(0).max(1),
})

const scorePartPhaseStateSchema = z.object({
  phaseId: z.string().trim().min(1),
  presence: z.enum(SCORE_PART_PRESENCE_VALUES),
  density: z.number().min(0).max(1),
  energy: z.number().min(0).max(1),
})

const scoreSpectralBudgetSchema = z.object({
  sub: z.number().int().min(0).max(100),
  low: z.number().int().min(0).max(100),
  lowMid: z.number().int().min(0).max(100),
  mid: z.number().int().min(0).max(100),
  highMid: z.number().int().min(0).max(100),
  high: z.number().int().min(0).max(100),
  air: z.number().int().min(0).max(100),
}).superRefine((budget, ctx) => {
  const total = Object.values(budget).reduce((sum, value) => sum + value, 0)
  if (total !== 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `AUDIO_SCORE_SPECTRAL_BUDGET_MUST_TOTAL_100:${total}`,
    })
  }
})

export const musicTheorySpecV3Schema = z.object({
  version: z.literal(3),
  bpm: z.number().int().positive().max(260),
  meter: z.enum(['2/4', '3/4', '4/4', '5/4', '6/8', '7/8']),
  form: z.enum(SCORE_FORM_VALUES),
  metricSalience: z.enum(SCORE_METRIC_SALIENCE_VALUES),
  eventSpacing: z.enum(SCORE_EVENT_SPACING_VALUES),
  pitch: z.object({
    centerType: z.enum(SCORE_PITCH_CENTER_VALUES),
    centerPitch: z.string().trim().regex(/^[A-G](?:#|b)?$/).optional().nullable(),
    collection: z.enum(SCORE_PITCH_COLLECTION_VALUES),
    intervalRelations: z.array(z.enum(SCORE_INTERVAL_RELATION_VALUES)).min(1),
    microtonality: z.enum(['none', 'limited', 'structural']),
  }),
  harmony: z.object({
    functionalSyntax: z.enum(['prohibited', 'limited', 'allowed']),
    cadencePolicy: z.enum(SCORE_CADENCE_POLICY_VALUES),
    harmonicRhythm: z.enum(SCORE_HARMONIC_RHYTHM_VALUES),
  }),
  voiceLeading: z.array(z.enum(SCORE_VOICE_LEADING_VALUES)).min(1),
  texture: z.object({
    organization: z.enum(SCORE_TEXTURE_VALUES),
    density: scoreDensitySchema,
    layerIndependence: z.number().min(0).max(1),
  }),
  spectrum: z.object({
    foundation: z.array(scoreRegisterSchema).min(1),
    upperActivity: z.enum(['absent', 'isolated_partials', 'restricted', 'active']),
    evolution: z.enum(SCORE_SPECTRAL_EVOLUTION_VALUES),
  }),
  ensembleComplexity: z.enum(SCORE_ENSEMBLE_COMPLEXITY_VALUES),
  spectralBudget: scoreSpectralBudgetSchema,
  renderStrategies: z.tuple([
    z.literal('balanced_ensemble'),
    z.literal('counterpoint_clarity'),
    z.literal('spectral_depth'),
    z.literal('microdynamic_detail'),
  ]),
  orchestration: z.array(z.object({
    partId: z.string().trim().min(1),
    family: z.enum(SCORE_INSTRUMENT_FAMILY_VALUES),
    instrument: scoreInstrumentSchema,
    register: scoreRegisterSchema,
    spectralSlot: z.enum(SCORE_SPECTRAL_SLOT_VALUES),
    role: z.enum(SCORE_ORCHESTRATION_ROLE_VALUES),
    techniques: z.array(z.enum(SCORE_TECHNIQUE_VALUES)).min(1),
    rhythmicFunction: z.enum(SCORE_RHYTHMIC_FUNCTION_VALUES),
    spatial: z.object({
      pan: z.number().min(-1).max(1),
      width: z.number().min(0).max(1),
      reverbSend: z.number().min(0).max(1),
    }),
    phaseStates: z.array(scorePartPhaseStateSchema).min(1).max(12),
  })).min(2).max(14),
  relationships: z.array(z.object({
    firstPartId: z.string().trim().min(1),
    secondPartId: z.string().trim().min(1),
    relation: z.enum(SCORE_PART_RELATION_VALUES),
    collisionPolicy: z.enum(SCORE_COLLISION_POLICY_VALUES),
  })).min(1).max(32),
  dynamics: z.object({
    envelope: z.enum(SCORE_DYNAMIC_ENVELOPE_VALUES),
    transientPolicy: z.enum(SCORE_TRANSIENT_POLICY_VALUES),
    minimumEnergy: z.number().min(0).max(1),
    maximumEnergy: z.number().min(0).max(1),
  }).superRefine((dynamics, ctx) => {
    if (dynamics.maximumEnergy < dynamics.minimumEnergy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['maximumEnergy'],
        message: 'AUDIO_SCORE_DYNAMIC_RANGE_INVALID',
      })
    }
  }),
  phases: z.array(scoreTheoryPhaseSchema).min(1).max(12),
  prohibitions: z.array(z.enum(SCORE_PROHIBITION_VALUES)).min(1),
}).superRefine((spec, ctx) => {
  const requiredProhibitions = [
    'vocals',
    'lyrics',
    'spoken_word',
    'literal_sound_effects',
    'environmental_recordings',
  ] as const
  for (const prohibition of requiredProhibitions) {
    if (!spec.prohibitions.includes(prohibition)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['prohibitions'],
        message: `AUDIO_SCORE_REQUIRED_PROHIBITION_MISSING:${prohibition}`,
      })
    }
  }
  if (spec.pitch.centerType === 'atonal' && spec.pitch.centerPitch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pitch', 'centerPitch'],
      message: 'AUDIO_SCORE_ATONAL_CENTER_NOT_ALLOWED',
    })
  }
  if (spec.pitch.centerType !== 'atonal' && !spec.pitch.centerPitch) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['pitch', 'centerPitch'],
      message: 'AUDIO_SCORE_PITCH_CENTER_REQUIRED',
    })
  }
  if (spec.harmony.functionalSyntax === 'prohibited' && spec.harmony.cadencePolicy === 'tonal_resolution') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['harmony', 'cadencePolicy'],
      message: 'AUDIO_SCORE_FUNCTIONAL_HARMONY_CONTRADICTION',
    })
  }
  spec.phases.forEach((phase, index) => {
    if (phase.energy < spec.dynamics.minimumEnergy || phase.energy > spec.dynamics.maximumEnergy) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phases', index, 'energy'],
        message: 'AUDIO_SCORE_PHASE_ENERGY_OUTSIDE_DYNAMIC_RANGE',
      })
    }
  })
  const partIds = spec.orchestration.map((part) => part.partId)
  if (new Set(partIds).size !== partIds.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['orchestration'], message: 'AUDIO_SCORE_PART_IDS_NOT_UNIQUE' })
  }
  const phaseIds = spec.phases.map((phase) => phase.phaseId)
  for (const [partIndex, part] of spec.orchestration.entries()) {
    if (SCORE_INSTRUMENT_FAMILY_BY_INSTRUMENT[part.instrument] !== part.family) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orchestration', partIndex, 'family'],
        message: `AUDIO_SCORE_INSTRUMENT_FAMILY_INVALID:${part.partId}:${part.instrument}:${part.family}`,
      })
    }
    const statePhaseIds = part.phaseStates.map((state) => state.phaseId)
    if (new Set(statePhaseIds).size !== statePhaseIds.length || statePhaseIds.length !== phaseIds.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['orchestration', partIndex, 'phaseStates'],
        message: `AUDIO_SCORE_PART_PHASE_COVERAGE_INVALID:${part.partId}`,
      })
      continue
    }
    for (const phaseId of phaseIds) {
      if (!statePhaseIds.includes(phaseId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['orchestration', partIndex, 'phaseStates'],
          message: `AUDIO_SCORE_PART_PHASE_MISSING:${part.partId}:${phaseId}`,
        })
      }
    }
  }
  for (const [relationshipIndex, relationship] of spec.relationships.entries()) {
    if (
      relationship.firstPartId === relationship.secondPartId
      || !partIds.includes(relationship.firstPartId)
      || !partIds.includes(relationship.secondPartId)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['relationships', relationshipIndex],
        message: 'AUDIO_SCORE_RELATIONSHIP_PART_INVALID',
      })
    }
  }
  const connectedPartIds = new Set<string>([partIds[0] ?? ''])
  let addedConnection = true
  while (addedConnection) {
    addedConnection = false
    for (const relationship of spec.relationships) {
      const firstConnected = connectedPartIds.has(relationship.firstPartId)
      const secondConnected = connectedPartIds.has(relationship.secondPartId)
      if (firstConnected === secondConnected) continue
      connectedPartIds.add(firstConnected ? relationship.secondPartId : relationship.firstPartId)
      addedConnection = true
    }
  }
  if (partIds.some((partId) => !connectedPartIds.has(partId))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['relationships'],
      message: 'AUDIO_SCORE_ORCHESTRATION_GRAPH_DISCONNECTED',
    })
  }
  const countRange: readonly [number, number] = spec.ensembleComplexity === 'minimal'
    ? [2, 3]
    : spec.ensembleComplexity === 'chamber'
      ? [4, 7]
      : spec.ensembleComplexity === 'hybrid'
        ? [6, 10]
        : [8, 14]
  if (spec.orchestration.length < countRange[0] || spec.orchestration.length > countRange[1]) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orchestration'],
      message: `AUDIO_SCORE_ENSEMBLE_COMPLEXITY_COUNT_INVALID:${spec.ensembleComplexity}`,
    })
  }
  const familyCounts = new Map<typeof SCORE_INSTRUMENT_FAMILY_VALUES[number], number>()
  const spectralSlots = new Set<typeof SCORE_SPECTRAL_SLOT_VALUES[number]>()
  for (const part of spec.orchestration) {
    familyCounts.set(part.family, (familyCounts.get(part.family) ?? 0) + 1)
    spectralSlots.add(part.spectralSlot)
  }
  const minimumFamilies = spec.ensembleComplexity === 'minimal'
    ? 1
    : spec.ensembleComplexity === 'chamber'
      ? 3
      : spec.ensembleComplexity === 'hybrid'
        ? 4
        : 5
  const maximumFamilyShare = spec.ensembleComplexity === 'minimal'
    ? 1
    : spec.ensembleComplexity === 'chamber'
      ? 0.5
      : spec.ensembleComplexity === 'hybrid'
        ? 0.4
        : 0.35
  const dominantFamilyCount = Math.max(...familyCounts.values())
  if (familyCounts.size < minimumFamilies) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orchestration'],
      message: `AUDIO_SCORE_INSTRUMENT_FAMILY_DIVERSITY_INSUFFICIENT:${familyCounts.size}:${minimumFamilies}`,
    })
  }
  if (dominantFamilyCount / spec.orchestration.length > maximumFamilyShare) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orchestration'],
      message: `AUDIO_SCORE_INSTRUMENT_FAMILY_DOMINANCE_EXCEEDED:${dominantFamilyCount}:${spec.orchestration.length}`,
    })
  }
  const minimumSpectralSlots = spec.ensembleComplexity === 'minimal'
    ? 2
    : spec.ensembleComplexity === 'chamber'
      ? 4
      : spec.ensembleComplexity === 'hybrid'
        ? 5
        : 6
  if (spectralSlots.size < minimumSpectralSlots) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['orchestration'],
      message: `AUDIO_SCORE_SPECTRAL_SLOT_COVERAGE_INSUFFICIENT:${spectralSlots.size}:${minimumSpectralSlots}`,
    })
  }
})

export const scoreCueSchema = z.object({
  cueId: z.string().trim().min(1),
  musicalContinuityId: z.string().trim().min(1),
  range: frameRangeSchema,
  narrativeDiagnosis: scoreNarrativeDiagnosisSchema,
  musicTheorySpec: musicTheorySpecV3Schema,
  intentionalSilenceRanges: z.array(frameRangeSchema),
}).superRefine((cue, ctx) => {
  const phases = cue.musicTheorySpec.phases
  if (phases[0]?.range.startFrame !== cue.range.startFrame
    || phases[phases.length - 1]?.range.endFrameExclusive !== cue.range.endFrameExclusive) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['musicTheorySpec', 'phases'],
      message: 'AUDIO_SCORE_PHASES_MUST_COVER_CUE',
    })
  }
  for (let index = 1; index < phases.length; index += 1) {
    if (phases[index - 1]?.range.endFrameExclusive !== phases[index]?.range.startFrame) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['musicTheorySpec', 'phases', index, 'range'],
        message: 'AUDIO_SCORE_PHASES_NOT_CONTIGUOUS',
      })
    }
  }
})

export type ScoreScoringStance = z.infer<typeof scoreScoringStanceSchema>
export type ScoreNarrativeDiagnosis = z.infer<typeof scoreNarrativeDiagnosisSchema>
export type MusicTheorySpecV3 = z.infer<typeof musicTheorySpecV3Schema>
export type ScoreCue = z.infer<typeof scoreCueSchema>
