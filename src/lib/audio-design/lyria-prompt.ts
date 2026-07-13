import {
  framesToSeconds,
  type MusicTheorySpecV2,
  type ScoreCue,
  type TimelineClock,
} from './types'

const PROHIBITION_LABELS: Record<MusicTheorySpecV2['prohibitions'][number], string> = {
  vocals: 'vocals',
  lyrics: 'lyrics',
  spoken_word: 'spoken word or dialogue',
  literal_sound_effects: 'literal sound effects or physical action sounds',
  environmental_recordings: 'environmental field recordings',
  functional_dominant_tonic: 'functional dominant-tonic syntax',
  authentic_cadence: 'authentic cadences or tonal confirmation',
  heroic_brass: 'heroic or fanfare-like brass writing',
  triumphant_rhythm: 'triumphant or victory-coded rhythm',
  romantic_swell: 'romantic string swells',
  cathartic_climax: 'cathartic climax or redemptive release',
  trailer_impacts: 'trailer impacts or orchestral hits',
  stable_groove: 'stable groove or dance-like beat',
  periodic_phrase_cycle: 'periodic phrase cycles or symmetrical repetition',
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

function formatPitchField(spec: MusicTheorySpecV2): string {
  const center = spec.pitch.centerPitch ? ` centered on ${spec.pitch.centerPitch}` : ''
  return `${musicalTerm(spec.pitch.centerType)}${center}, ${musicalTerm(spec.pitch.collection)}`
}

function formatOrchestration(spec: MusicTheorySpecV2): string {
  return spec.orchestration.map((part) => [
    musicalTerm(part.instrument),
    `${musicalTerm(part.register)} register`,
    `${musicalTerm(part.role)} role`,
    formatList(part.techniques.map(musicalTerm)),
  ].join(' with ')).join('; ')
}

function formatPhases(input: {
  readonly spec: MusicTheorySpecV2
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
}): LyriaPromptPair {
  const spec = input.cue.musicTheorySpec
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
    `Spectral organization: ${formatList(spec.spectrum.foundation.map((register) => `${musicalTerm(register)} register`))} foundation, ${musicalTerm(spec.spectrum.upperActivity)} upper-register activity, ${musicalTerm(spec.spectrum.evolution)} spectral evolution.`,
    `Orchestration: ${formatOrchestration(spec)}.`,
    `Dynamics: ${musicalTerm(spec.dynamics.envelope)} amplitude envelope, ${musicalTerm(spec.dynamics.transientPolicy)} transient policy, energy constrained from ${Math.round(spec.dynamics.minimumEnergy * 100)}% to ${Math.round(spec.dynamics.maximumEnergy * 100)}%.`,
    `Continuous formal phases: ${formatPhases({ spec, cue: input.cue })}.`,
    'Maintain continuous harmony, tempo, orchestration, spectral evolution, and long-duration dynamic transitions across the complete cue.',
    'Preserve controlled midrange headroom, restrained transient occupancy, and uncluttered spectral balance for downstream mixing.',
  ].join(' ')
  const negativePrompt = formatList(spec.prohibitions.map((item) => PROHIBITION_LABELS[item]))

  assertLyriaPromptSafe(prompt)
  assertLyriaPromptSafe(negativePrompt)
  return { prompt, negativePrompt }
}

export function buildLyriaPrompt(input: {
  readonly cue: ScoreCue
  readonly clock: TimelineClock
}): string {
  return buildLyriaPrompts(input).prompt
}
