import {
  framesToSeconds,
  type MusicTheorySpecV3,
  type ScoreCue,
  type TimelineClock,
} from './types'

export type LyriaRenderStrategy = MusicTheorySpecV3['renderStrategies'][number]

const PROHIBITION_LABELS: Record<MusicTheorySpecV3['prohibitions'][number], string> = {
  vocals: 'pitched vocal timbres',
  lyrics: 'lyrical phoneme sequences',
  spoken_word: 'speech-rate prosody and intelligible vocal articulation',
  literal_sound_effects: 'non-pitched concrete-source transients',
  environmental_recordings: 'non-musical broadband field recordings',
  functional_dominant_tonic: 'functional dominant-tonic syntax',
  authentic_cadence: 'dominant-tonic authentic cadence and tonal confirmation',
  heroic_brass: 'foreground brass fanfare intervals and parallel triadic voicing',
  triumphant_rhythm: 'major-mode cadential arrival with metrically reinforced pulse',
  romantic_swell: 'foreground legato string melody with consonant resolution',
  cathartic_climax: 'global energy apex followed by consonant tonal stabilization',
  trailer_impacts: 'isolated broadband orchestral transients and low-frequency accent punctuation',
  stable_groove: 'isochronous groove and periodic beat reinforcement',
  periodic_phrase_cycle: 'symmetrical phrase recurrence and periodic sectional repetition',
}

const STRATEGY_INSTRUCTIONS: Record<LyriaRenderStrategy, string> = {
  balanced_ensemble: 'Render priority: balanced ensemble audibility, complementary register allocation, stable orchestral blend, and equal preservation of every active functional voice.',
  counterpoint_clarity: 'Render priority: independent voice-leading clarity, separated attacks, transparent counterlines, and audible relational motion without increasing total density.',
  spectral_depth: 'Render priority: full planned spectral depth, distinct low, middle, high, and air-band occupancy, controlled masking, and gradual spectral redistribution.',
  microdynamic_detail: 'Render priority: detailed articulation envelopes, natural microdynamic variation, gradual energy transfer between parts, and preserved long-range dynamic shape.',
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

export interface LyriaPromptPair {
  readonly strategy: LyriaRenderStrategy
  readonly prompt: string
  readonly negativePrompt: string
}

export function assertLyriaPromptSafe(prompt: string): void {
  const match = LYRIA_FORBIDDEN_NARRATIVE_TERMS.find((pattern) => pattern.test(prompt))
  if (match) throw new Error(`LYRIA_PROMPT_POLICY_VALIDATION_FAILED:${match.source}`)
}

function musicalTerm(value: string): string {
  return value.replace(/_/g, ' ')
}

function formatList(items: readonly string[]): string {
  return items.join(', ')
}

function formatPitchField(spec: MusicTheorySpecV3): string {
  const center = spec.pitch.centerPitch ? ` centered on ${spec.pitch.centerPitch}` : ''
  return `${musicalTerm(spec.pitch.centerType)}${center}, ${musicalTerm(spec.pitch.collection)}`
}

function formatSpectralBudget(spec: MusicTheorySpecV3): string {
  const budget = spec.spectralBudget
  return [
    `sub ${budget.sub}%`,
    `low ${budget.low}%`,
    `low-mid ${budget.lowMid}%`,
    `mid ${budget.mid}%`,
    `high-mid ${budget.highMid}%`,
    `high ${budget.high}%`,
    `air ${budget.air}%`,
  ].join(', ')
}

function formatPartPhaseStates(part: MusicTheorySpecV3['orchestration'][number]): string {
  return part.phaseStates.map((state) => [
    state.phaseId,
    musicalTerm(state.presence),
    `${Math.round(state.density * 100)}% density`,
    `${Math.round(state.energy * 100)}% energy`,
  ].join(' ')).join('; ')
}

function formatOrchestration(spec: MusicTheorySpecV3): string {
  return spec.orchestration.map((part) => [
    `${part.partId}: ${musicalTerm(part.family)} family, ${musicalTerm(part.instrument)}`,
    `${musicalTerm(part.register)} register in the ${musicalTerm(part.spectralSlot)} spectral slot`,
    `${musicalTerm(part.role)} role with ${musicalTerm(part.rhythmicFunction)}`,
    `techniques ${formatList(part.techniques.map(musicalTerm))}`,
    `pan ${part.spatial.pan.toFixed(2)}, width ${part.spatial.width.toFixed(2)}, reverb send ${part.spatial.reverbSend.toFixed(2)}`,
    `phase behavior [${formatPartPhaseStates(part)}]`,
  ].join(', ')).join('; ')
}

function formatRelationships(spec: MusicTheorySpecV3): string {
  return spec.relationships.map((relationship) => [
    `${relationship.firstPartId} and ${relationship.secondPartId}`,
    musicalTerm(relationship.relation),
    musicalTerm(relationship.collisionPolicy),
  ].join(' with ')).join('; ')
}

function formatPhases(input: {
  readonly spec: MusicTheorySpecV3
  readonly cue: ScoreCue
}): string {
  const cueLengthFrames = input.cue.range.endFrameExclusive - input.cue.range.startFrame
  return input.spec.phases.map((phase) => {
    const startPercent = Math.round(
      ((phase.range.startFrame - input.cue.range.startFrame) / cueLengthFrames) * 100,
    )
    const endPercent = Math.round(
      ((phase.range.endFrameExclusive - input.cue.range.startFrame) / cueLengthFrames) * 100,
    )
    return [
      `${musicalTerm(phase.function)} from ${startPercent}% to ${endPercent}%`,
      `${musicalTerm(phase.density)} density`,
      `${Math.round(phase.energy * 100)}% relative energy`,
      `${musicalTerm(phase.spectralBand)} spectral focus`,
      `${Math.round(phase.transientDensity * 100)}% transient density`,
    ].join(', ')
  }).join('; ')
}

export function buildLyriaPrompts(input: {
  readonly cue: ScoreCue
  readonly clock: TimelineClock
  readonly strategy: LyriaRenderStrategy
}): LyriaPromptPair {
  const spec = input.cue.musicTheorySpec
  if (!spec.renderStrategies.includes(input.strategy)) {
    throw new Error(`LYRIA_RENDER_STRATEGY_NOT_PLANNED:${input.strategy}`)
  }
  const durationSeconds = framesToSeconds(
    input.cue.range.endFrameExclusive - input.cue.range.startFrame,
    input.clock,
  )
  const prompt = [
    `Instrumental ${musicalTerm(spec.form)} composition for cinematic underscore, ${durationSeconds.toFixed(3)} seconds.`,
    `Tempo fixed at ${spec.bpm} BPM in ${spec.meter}, with ${musicalTerm(spec.metricSalience)} metric salience and ${musicalTerm(spec.eventSpacing)} event spacing.`,
    `Pitch organization: ${formatPitchField(spec)}; interval relations: ${formatList(spec.pitch.intervalRelations.map(musicalTerm))}; ${musicalTerm(spec.pitch.microtonality)} microtonality.`,
    `Harmonic organization: ${musicalTerm(spec.harmony.functionalSyntax)} functional syntax, ${musicalTerm(spec.harmony.cadencePolicy)}, ${musicalTerm(spec.harmony.harmonicRhythm)} harmonic rhythm.`,
    `Voice leading: ${formatList(spec.voiceLeading.map(musicalTerm))}.`,
    `Texture: ${musicalTerm(spec.texture.organization)}, ${musicalTerm(spec.texture.density)} density, ${Math.round(spec.texture.layerIndependence * 100)}% layer independence.`,
    `Ensemble architecture: ${musicalTerm(spec.ensembleComplexity)} complexity with ${spec.orchestration.length} functional voices.`,
    `Spectral organization: ${formatList(spec.spectrum.foundation.map((register) => `${musicalTerm(register)} register`))} foundation, ${musicalTerm(spec.spectrum.upperActivity)} upper-register activity, ${musicalTerm(spec.spectrum.evolution)} spectral evolution. Target spectral budget: ${formatSpectralBudget(spec)}.`,
    `Orchestration graph: ${formatOrchestration(spec)}.`,
    `Part relationships: ${formatRelationships(spec)}.`,
    `Dynamics: ${musicalTerm(spec.dynamics.envelope)} amplitude envelope, ${musicalTerm(spec.dynamics.transientPolicy)} transient policy, energy constrained from ${Math.round(spec.dynamics.minimumEnergy * 100)}% to ${Math.round(spec.dynamics.maximumEnergy * 100)}%.`,
    `Continuous formal phases: ${formatPhases({ spec, cue: input.cue })}.`,
    STRATEGY_INSTRUCTIONS[input.strategy],
    'Render one complete stereo master. Preserve the specified instrumental identities and functional voices as a coherent ensemble; do not collapse them into an undifferentiated string pad or a single dominant timbre.',
    'Maintain continuous harmony, tempo, orchestration, spectral evolution, and long-duration dynamic transitions across the complete cue.',
    'Preserve controlled midrange headroom, restrained transient occupancy, and uncluttered spectral balance for downstream mixing.',
  ].join(' ')
  const negativePrompt = formatList(spec.prohibitions.map((item) => PROHIBITION_LABELS[item]))

  assertLyriaPromptSafe(prompt)
  assertLyriaPromptSafe(negativePrompt)
  return { strategy: input.strategy, prompt, negativePrompt }
}
