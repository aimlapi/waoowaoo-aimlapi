import {
  framesToSeconds,
  type ScoreCue,
  type ScoreGenerationSpec,
  type TimelineClock,
} from './types'

const STYLE_LABELS: Record<ScoreGenerationSpec['style'], string> = {
  cinematic_underscore: 'cinematic underscore',
  minimalist_underscore: 'minimalist cinematic underscore',
  hybrid_cinematic: 'hybrid cinematic score',
  ambient_cinematic: 'ambient cinematic score',
  orchestral_cinematic: 'orchestral cinematic score',
  electronic_cinematic: 'electronic cinematic score',
}

const EMOTION_LABELS: Record<ScoreGenerationSpec['emotionalProfile'], string> = {
  restrained_tension: 'restrained musical tension',
  cold_procedural_tension: 'controlled procedural tension',
  quiet_unease: 'quiet harmonic unease',
  melancholic_reflection: 'melancholic reflection',
  hopeful_resolve: 'hopeful resolution',
  warm_intimacy: 'warm intimacy',
  urgent_momentum: 'urgent musical momentum',
  detached_observation: 'detached observation',
  mysterious_suspense: 'mysterious suspense',
  solemn_gravity: 'solemn gravity',
}

const HARMONY_LABELS: Record<ScoreGenerationSpec['harmonicLanguage'], string> = {
  sparse_unresolved_minor: 'sparse unresolved minor harmony',
  modal_ambiguity: 'modal ambiguity',
  slow_diatonic_motion: 'slow diatonic harmonic motion',
  open_fifths: 'open-fifth harmony',
  chromatic_suspension: 'controlled chromatic suspension',
  tonal_pedal: 'stable tonal pedal',
  gentle_consonance: 'gentle consonant harmony',
  controlled_dissonance: 'controlled musical dissonance',
}

const INSTRUMENT_LABELS: Record<ScoreGenerationSpec['instruments'][number], string> = {
  analog_synthesizer_pad: 'analog synthesizer pad',
  muted_analog_synthesizer: 'muted analog synthesizer',
  soft_sub_bass: 'soft sub bass',
  low_piano_resonance: 'low piano resonance',
  felt_piano: 'felt piano',
  prepared_piano: 'prepared piano',
  bass_clarinet: 'bass clarinet',
  contrabassoon: 'contrabassoon',
  french_horn: 'French horn',
  low_brass_ensemble: 'low brass ensemble',
  restrained_string_ensemble: 'restrained string ensemble',
  solo_cello: 'solo cello',
  viola_texture: 'viola texture',
  glass_harmonica: 'glass harmonica',
  soft_mallet_percussion: 'soft mallet percussion',
  frame_drum: 'frame drum',
  electronic_pulse: 'soft electronic pulse',
  noise_texture: 'filtered noise texture',
  wordless_synth_texture: 'non-vocal synthesizer texture',
}

const ARTICULATION_LABELS: Record<ScoreGenerationSpec['articulations'][number], string> = {
  sustained: 'sustained notes',
  widely_spaced: 'widely spaced phrases',
  soft_attack: 'soft attacks',
  slow_pulse: 'slow musical pulse',
  restrained_staccato: 'restrained staccato articulation',
  gentle_ostinato: 'gentle ostinato',
  gradual_swell: 'gradual swells',
  natural_decay: 'natural decay',
}

const REGISTER_LABELS: Record<ScoreGenerationSpec['registers'][number], string> = {
  sub: 'sub register',
  low: 'low register',
  low_mid: 'low-mid register',
  mid: 'mid register',
  high_mid: 'high-mid register',
  high: 'high register',
}

const LYRIA_FORBIDDEN_NARRATIVE_TERMS = [
  /\bblood(?:y)?\b/i,
  /\bgore\b/i,
  /\bgory\b/i,
  /\b(?:violent|violence)\b/i,
  /\btortur(?:e|ed|ing)\b/i,
  /\bkill(?:ed|ing)?\b/i,
  /\bmurder\b/i,
  /\bweapon\b/i,
  /\bgun\b/i,
  /\bknife\b/i,
  /\binjur(?:y|ed)\b/i,
  /\bwound(?:ed)?\b/i,
  /\btooth\b/i,
  /\bteeth\b/i,
  /\bbody part\b/i,
  /血|暴力|血腥|折磨|杀|武器|枪|刀|受伤|伤口|牙齿|拔牙/,
] as const

export function assertLyriaPromptSafe(prompt: string): void {
  const match = LYRIA_FORBIDDEN_NARRATIVE_TERMS.find((pattern) => pattern.test(prompt))
  if (match) throw new Error(`LYRIA_PROMPT_POLICY_VALIDATION_FAILED:${match.source}`)
}

function formatList(items: readonly string[]): string {
  return items.join(', ')
}

export function buildLyriaPrompt(input: {
  readonly cue: ScoreCue
  readonly clock: TimelineClock
}): string {
  const spec = input.cue.generationSpec
  const durationSeconds = framesToSeconds(
    input.cue.range.endFrameExclusive - input.cue.range.startFrame,
    input.clock,
  )
  const cueLengthFrames = input.cue.range.endFrameExclusive - input.cue.range.startFrame
  const sections = spec.sections.map((section) => {
    const startPercent = Math.round(((section.range.startFrame - input.cue.range.startFrame) / cueLengthFrames) * 100)
    const endPercent = Math.round(((section.range.endFrameExclusive - input.cue.range.startFrame) / cueLengthFrames) * 100)
    return [
      `${section.function} section from ${startPercent}% to ${endPercent}%`,
      `${section.density} density`,
      `energy ${Math.round(section.energy * 100)}%`,
      `harmonic tension ${Math.round(section.harmonicTension * 100)}%`,
      formatList(section.instruments.map((instrument) => INSTRUMENT_LABELS[instrument])),
      formatList(section.articulations.map((articulation) => ARTICULATION_LABELS[articulation])),
    ].join(', ')
  })

  const prompt = [
    `Instrumental ${STYLE_LABELS[spec.style]} for ${durationSeconds.toFixed(3)} seconds.`,
    `${spec.bpm} BPM, key of ${spec.key}, ${spec.meter} meter.`,
    `${EMOTION_LABELS[spec.emotionalProfile]}, ${HARMONY_LABELS[spec.harmonicLanguage]}, ${spec.density} overall density.`,
    `Primary instruments: ${formatList(spec.instruments.map((instrument) => INSTRUMENT_LABELS[instrument]))}.`,
    `Registers: ${formatList(spec.registers.map((register) => REGISTER_LABELS[register]))}.`,
    `Articulation: ${formatList(spec.articulations.map((articulation) => ARTICULATION_LABELS[articulation]))}.`,
    `Continuous musical form: ${sections.join('; ')}.`,
    'Maintain coherent harmony, phrasing, tempo, orchestration, and natural dynamic transitions across the complete cue.',
    'Leave spectral and dynamic space for native dialogue, synchronized physical action sounds, and environmental ambience.',
    'Instrumental only, no vocals, no lyrics, no spoken word, no dialogue, no literal sound effects, no footsteps, no object sounds, no environmental field recording.',
  ].join(' ')

  assertLyriaPromptSafe(prompt)
  return prompt
}
