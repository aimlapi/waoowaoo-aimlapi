import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  scriptSoundAnalysisSchema,
  type ScoreLayer,
  type ScriptSoundAnalysis,
  type SoundMixFoleyLayer,
  type SoundMixSpotSfxLayer,
} from './types'

export interface ScriptSoundAnalysisInput {
  readonly userId: string
  readonly model: string
  readonly scriptText: string
  readonly targetDurationSeconds: number
  readonly projectId?: string
  readonly locale?: string
}

export interface SoundDescriptionMarkdownInput {
  readonly userId: string
  readonly model: string
  readonly markdownText: string
  readonly targetDurationSeconds?: number
  readonly projectId?: string
  readonly locale?: string
}

export interface SoundMixProjectMetadata {
  readonly bpm: number
  readonly key: string
  readonly overallMood: string
}

export interface ScoreStemAdapterPromptInput {
  readonly projectMetadata: SoundMixProjectMetadata
  readonly scoreLayer: ScoreLayer
}

export interface SfxFoleyAdapterPromptInput {
  readonly layerKind: 'foley' | 'spot_sfx'
  readonly layer: SoundMixFoleyLayer | SoundMixSpotSfxLayer
}

export interface ScoreStemPromptAdapterInput extends ScoreStemAdapterPromptInput {
  readonly userId: string
  readonly model: string
  readonly projectId?: string
}

export interface SfxFoleyPromptAdapterInput extends SfxFoleyAdapterPromptInput {
  readonly userId: string
  readonly model: string
  readonly projectId?: string
}

function readTrimmedString(value: string | null | undefined): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTargetDurationSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) throw new Error('SCRIPT_SOUND_ANALYSIS_DURATION_INVALID')
  if (value > 600) throw new Error('SCRIPT_SOUND_ANALYSIS_DURATION_TOO_LONG')
  return value
}

function parseClockTimeToSeconds(value: string): number {
  const parts = value.split(':').map((part) => Number.parseInt(part, 10))
  if (parts.length === 2) {
    const [minutes, seconds] = parts
    if (Number.isInteger(minutes) && Number.isInteger(seconds) && seconds >= 0 && seconds < 60) {
      return minutes * 60 + seconds
    }
  }
  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts
    if (
      Number.isInteger(hours)
      && Number.isInteger(minutes)
      && Number.isInteger(seconds)
      && minutes >= 0
      && minutes < 60
      && seconds >= 0
      && seconds < 60
    ) {
      return hours * 3600 + minutes * 60 + seconds
    }
  }
  throw new Error('SOUND_DESCRIPTION_TIMECODE_INVALID')
}

export function inferSoundDescriptionDurationSeconds(markdownText: string): number {
  const text = readTrimmedString(markdownText)
  if (!text) throw new Error('SOUND_DESCRIPTION_MARKDOWN_REQUIRED')

  const clipRelativeMatch = text.match(/clip-relative\s+`?(\d{1,2}:\d{2}(?::\d{2})?)\s*[-–]\s*(\d{1,2}:\d{2}(?::\d{2})?)`?/i)
  if (!clipRelativeMatch) throw new Error('SOUND_DESCRIPTION_DURATION_REQUIRED')

  const start = parseClockTimeToSeconds(clipRelativeMatch[1] ?? '')
  const end = parseClockTimeToSeconds(clipRelativeMatch[2] ?? '')
  if (end <= start) throw new Error('SOUND_DESCRIPTION_TIME_RANGE_INVALID')
  return normalizeTargetDurationSeconds(end - start)
}

function resolveSoundDescriptionDurationSeconds(value: number | undefined, markdownText: string): number {
  if (typeof value === 'number') return normalizeTargetDurationSeconds(value)
  return inferSoundDescriptionDurationSeconds(markdownText)
}

function buildAnalysisJsonShape(sourceKind: 'script' | 'sound_description'): string {
  return [
    '{',
    '  "schemaVersion": 1,',
    `  "sourceKind": "${sourceKind}",`,
    '  "targetDurationSeconds": number,',
    '  "summary": string,',
    '  "emotionalArc": string,',
    '  "projectMetadata": { "bpm": number, "key": string, "overallMood": string },',
    '  "dialogueStrategy": { "action": "keep_native"|"enhance"|"mute", "duckingTrigger": boolean },',
    '  "scoreLayers": [{ "id": string, "role": "tension_bed"|"rhythmic"|"theme"|"accent"|"atmospheric_pad", "instrument": string, "startSec": number, "endSec": number, "duckingRequired": boolean, "description": string }],',
    '  "foleyLayers": [{ "id": string, "type": string, "timestamps": number[], "material": string, "description": string }],',
    '  "spotSfxLayers": [{ "id": string, "effectName": string, "startSec": number, "durationSec": number, "priority": "high"|"critical", "material": string, "description": string }],',
    '  "ambienceLayers": [{ "id": string, "space": string, "layers": string[], "startSec": number, "endSec": number, "description": string }]',
    '}',
  ].join('\n')
}

export function buildScriptSoundAnalysisPrompt(input: {
  readonly scriptText: string
  readonly targetDurationSeconds: number
  readonly locale?: string
}): string {
  const scriptText = readTrimmedString(input.scriptText)
  if (!scriptText) throw new Error('SCRIPT_SOUND_ANALYSIS_SCRIPT_REQUIRED')
  const targetDurationSeconds = normalizeTargetDurationSeconds(input.targetDurationSeconds)

  return [
    '# Role: Supervising Sound Editor & Composer',
    '',
    '# Mission',
    'Analyze the input script excerpt as scene data and design a dynamic, multi-layer Sound Mix Plan.',
    'Do not generate audio. Return strict JSON only.',
    '',
    `Target duration seconds: ${targetDurationSeconds}`,
    `Locale for natural-language descriptions: ${readTrimmedString(input.locale) || 'en'}`,
    '',
    '# Core Logic',
    '1. Dynamic score layering: never output a single monolithic bgm plan. Represent music as functional scoreLayers such as low drone, rhythmic pulse, motif, accent, or atmospheric pad.',
    '2. Musical consistency: every score layer must share projectMetadata.bpm and projectMetadata.key.',
    '3. Dialogue strategy: assume dialogue is handled by native video audio when usable. Use dialogueStrategy.action instead of producing a dialogue generation stem.',
    '4. Ducking logic: mark score layers that must duck against native dialogue or enhanced dialogue.',
    '5. Granular foley: split physical movement into individual timestamp triggers instead of one continuous recording.',
    '6. Dynamic quantity: scoreLayers, foleyLayers, spotSfxLayers, and ambienceLayers may be empty or multi-item based on scene needs.',
    '',
    '# Output Format',
    'You must output JSON matching this shape exactly. No markdown fences. No prose.',
    buildAnalysisJsonShape('script'),
    '',
    'Rules:',
    '- Set sourceKind to "script".',
    '- Estimate all startSec/endSec/timestamps within the target duration.',
    '- Split Foley from Spot SFX: Foley is realistic body, cloth, floor, prop, and contact performance; Spot SFX is precise story-impact sound.',
    '- Split Ambience into spatial beds and room/location layers.',
    '- Use scoreLayers for music only; never put foley, ambience, or impact SFX into scoreLayers.',
    '- Use projectMetadata.bpm and projectMetadata.key as the shared score anchor for every score layer.',
    '- Do not invent unrelated scenes or characters.',
    '',
    'Script:',
    scriptText,
  ].join('\n')
}

export function buildSoundDescriptionImportPrompt(input: {
  readonly markdownText: string
  readonly targetDurationSeconds?: number
  readonly locale?: string
}): string {
  const markdownText = readTrimmedString(input.markdownText)
  if (!markdownText) throw new Error('SOUND_DESCRIPTION_MARKDOWN_REQUIRED')
  const targetDurationSeconds = resolveSoundDescriptionDurationSeconds(input.targetDurationSeconds, markdownText)

  return [
    '# Role: Supervising Sound Editor & Composer',
    '',
    '# Mission',
    'Import the sound-description-only Markdown into the dynamic Sound Mix Plan schema.',
    'Do not generate audio. Do not rewrite this as prose. Convert the document into strict JSON for the audio pipeline.',
    'Preserve beat order, dynamic score layering, Foley/SFX separation, motif logic, spatial rules, ducking, and mixer automation intent.',
    '',
    `Target duration seconds: ${targetDurationSeconds}`,
    `Locale for natural-language descriptions: ${readTrimmedString(input.locale) || 'en'}`,
    '',
    '# Core Logic',
    '1. Dynamic score layering: map music into scoreLayers, never one bgm field.',
    '2. Musical consistency: all scoreLayers must share projectMetadata.bpm and projectMetadata.key.',
    '3. Dialogue strategy: represent native dialogue handling through dialogueStrategy, not a generated dialogue stem.',
    '4. Foley granularity: map action sounds to timestamped foleyLayers.',
    '5. SFX control: map highlighted story impacts and one-shots to spotSfxLayers.',
    '6. Ambience beds: map space, room tone, pressure, and air into ambienceLayers.',
    '',
    '# Output Format',
    'You must output JSON matching this shape exactly. No markdown fences. No prose.',
    buildAnalysisJsonShape('sound_description'),
    '',
    'Rules:',
    '- Set sourceKind to "sound_description".',
    '- Use Ordered Sound Beats as the authority for timing order. K-0001 maps to the earliest cue group, K-0002 to the next, and so on.',
    '- Preserve native dialogue intent through dialogueStrategy, especially whether native video dialogue should be kept, enhanced, or muted.',
    '- Map "Foley / SFX focus" physical movement into foleyLayers.',
    '- Map highlighted story events, impacts, supernatural effects, wounds, hits, stings, and one-shot events into spotSfxLayers.',
    '- Map location acoustic space, ambient strategy, room tone, reverb, and spatialization into ambienceLayers.',
    '- Map score identity, motifs, harmonic strategy, rhythm, register shift, and continuity bridge into scoreLayers.',
    '- Estimate cue timings across the target duration when the Markdown has beat order but no exact seconds.',
    '- Do not exceed the target duration.',
    '- Do not invent unrelated scenes, characters, or dialogue.',
    '',
    'Sound-description-only Markdown:',
    markdownText,
  ].join('\n')
}

export function buildScoreStemAdapterPrompt(input: ScoreStemAdapterPromptInput): string {
  return [
    '# Role: Digital Audio Workstation Arrangement Assistant',
    '',
    '# Task',
    'Convert the input Score Layer JSON into one English music-generation prompt for an isolated score stem.',
    '',
    '# Prompt Engineering Rules',
    '1. Isolation: include "isolated stem", "solo instrument", "pure", and "no other instruments".',
    '2. Drums: include "no drums" unless the score layer role is rhythmic and the instrument explicitly names percussion or drums.',
    '3. Frequency constraint: low drone or tension bed should focus on sub-bass/low frequency; theme/motif should focus on mid-high frequency; accents should remain short and controllable.',
    '4. Mandatory metadata: inject the exact BPM and Key from projectMetadata.',
    '5. Output English prompt only. No JSON. No markdown.',
    '',
    '# Output Template',
    '"Isolated [Instrument] stem, [Role] for cinematic score, [BPM] BPM, Key of [Key], [Mood Description], [Playing Technique], high-fidelity studio recording, no background noise, no other instruments, 48kHz."',
    '',
    '# Project Metadata',
    JSON.stringify(input.projectMetadata),
    '',
    '# Score Layer JSON',
    JSON.stringify(input.scoreLayer),
  ].join('\n')
}

export function buildSfxFoleyAdapterPrompt(input: SfxFoleyAdapterPromptInput): string {
  return [
    '# Role: Hollywood Foley Recordist',
    '',
    '# Task',
    'Write one English prompt for a clean isolated action sound effect.',
    '',
    '# Constraints',
    '1. Absolute ban: do not request music, melody, song, background beat, dialogue, or voice.',
    '2. Physical properties: describe material, intensity, contact/impact type, and acoustic space.',
    '3. Purity: include "crystal clear", "highly detailed", "isolated sound", "close-mic recording", "no background music", and "no ambient noise".',
    '4. Output English prompt only. No JSON. No markdown.',
    '',
    '# Output Template',
    '"Foley sound effect: [Material] [Action], [Intensity], [Acoustic Space], crystal clear, highly detailed, isolated sound, close-mic recording, no background music, no ambient noise."',
    '',
    `# Layer Kind: ${input.layerKind}`,
    JSON.stringify(input.layer),
  ].join('\n')
}

function readAdapterPromptOutput(text: string, errorCode: string): string {
  const trimmed = readTrimmedString(text).replace(/^"|"$/g, '').trim()
  if (!trimmed) throw new Error(errorCode)
  return trimmed
}

export function parseScriptSoundAnalysis(text: string): ScriptSoundAnalysis {
  const parsed = safeParseJsonObject(text)
  const result = scriptSoundAnalysisSchema.safeParse(parsed)
  if (!result.success) {
    throw new Error(`SCRIPT_SOUND_ANALYSIS_INVALID:${result.error.issues.map((issue) => issue.message).join(',')}`)
  }
  return result.data
}

export async function analyzeScriptSound(input: ScriptSoundAnalysisInput): Promise<ScriptSoundAnalysis> {
  const targetDurationSeconds = normalizeTargetDurationSeconds(input.targetDurationSeconds)
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{
      role: 'user',
      content: buildScriptSoundAnalysisPrompt({
        scriptText: input.scriptText,
        targetDurationSeconds,
        locale: input.locale,
      }),
    }],
    temperature: 0.25,
    projectId: input.projectId,
    action: 'script_sound_analysis',
    meta: {
      stepId: 'script_sound_analysis',
      stepTitle: 'script_sound_analysis',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseScriptSoundAnalysis(completion.text)
}

export async function adaptScoreStemPrompt(input: ScoreStemPromptAdapterInput): Promise<string> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{
      role: 'user',
      content: buildScoreStemAdapterPrompt({
        projectMetadata: input.projectMetadata,
        scoreLayer: input.scoreLayer,
      }),
    }],
    temperature: 0.1,
    projectId: input.projectId,
    action: 'score_stem_prompt_adapter',
    meta: {
      stepId: 'score_stem_prompt_adapter',
      stepTitle: 'score_stem_prompt_adapter',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return readAdapterPromptOutput(completion.text, 'SCORE_STEM_ADAPTER_PROMPT_EMPTY')
}

export async function adaptSfxFoleyPrompt(input: SfxFoleyPromptAdapterInput): Promise<string> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{
      role: 'user',
      content: buildSfxFoleyAdapterPrompt({
        layerKind: input.layerKind,
        layer: input.layer,
      }),
    }],
    temperature: 0.1,
    projectId: input.projectId,
    action: 'sfx_foley_prompt_adapter',
    meta: {
      stepId: `sfx_foley_prompt_adapter:${input.layerKind}`,
      stepTitle: 'sfx_foley_prompt_adapter',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return readAdapterPromptOutput(completion.text, 'SFX_FOLEY_ADAPTER_PROMPT_EMPTY')
}

export async function importSoundDescriptionMarkdown(input: SoundDescriptionMarkdownInput): Promise<ScriptSoundAnalysis> {
  const targetDurationSeconds = resolveSoundDescriptionDurationSeconds(input.targetDurationSeconds, input.markdownText)
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{
      role: 'user',
      content: buildSoundDescriptionImportPrompt({
        markdownText: input.markdownText,
        targetDurationSeconds,
        locale: input.locale,
      }),
    }],
    temperature: 0.15,
    projectId: input.projectId,
    action: 'sound_description_import',
    meta: {
      stepId: 'sound_description_import',
      stepTitle: 'sound_description_import',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseScriptSoundAnalysis(completion.text)
}
