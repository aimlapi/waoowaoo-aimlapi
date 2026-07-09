import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  scriptSoundAnalysisSchema,
  type ScriptSoundAnalysis,
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
    '  "voiceBible": [{ "characterName": string, "voiceTraits": string, "speakingPace": string, "emotionalRange": string, "constraints": string[] }],',
    '  "dialogueLayer": [{ "cueId": string, "shotNumber": number, "speaker": string|null, "text": string, "emotion": string, "delivery": string, "startSec": number|null, "endSec": number|null }],',
    '  "foleyPlan": [{ "cueId": string, "beatNumber": number, "label": string, "description": string, "startSec": number|null, "durationSec": number|null }],',
    '  "spotSfxPlan": [{ "cueId": string, "shotNumber": number, "label": string, "description": string, "priority": "story"|"critical", "startSec": number|null, "durationSec": number|null }],',
    '  "ambiencePlan": [{ "cueId": string, "shotNumbers": number[], "description": string, "startSec": number, "endSec": number }],',
    '  "bgmPlan": { "overallDirection": string, "sections": [{ "sectionId": string, "startSec": number, "endSec": number, "intensity": 1|2|3|4|5, "description": string }] },',
    '  "stemPromptSeeds": { "dialogue": string, "foley": string, "spotSfx": string, "ambience": string, "bgm": string }',
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
    'You are a cinematic sound designer preparing a script-first audio spotting sheet.',
    '',
    'Do not generate audio. Analyze the script and return only strict JSON.',
    'The JSON must be usable before video analysis: it should define what sound exists, why it exists, and which stem it belongs to.',
    '',
    `Target duration seconds: ${targetDurationSeconds}`,
    `Locale for natural-language descriptions: ${readTrimmedString(input.locale) || 'en'}`,
    '',
    'Required JSON shape:',
    buildAnalysisJsonShape('script'),
    '',
    'Rules:',
    '- Use script beats as shotNumber/beatNumber when no storyboard exists. Start at 1 and increase monotonically.',
    '- Estimate timing within the target duration, but do not exceed it.',
    '- Separate body movement foley from supernatural/impact spot SFX.',
    '- Dialogue stem contains spoken lines, gasps, whispers, exertion, and nonverbal vocalizations only when script-relevant.',
    '- Foley stem contains human movement, cloth, floor contact, breath movement, props, and realistic physical performance details.',
    '- Spot SFX stem contains highlighted story sound events that need precise placement and control.',
    '- Ambience stem contains continuous room tone, spatial resonance, environmental beds, and location-specific air.',
    '- BGM stem contains score direction only, not sound effects.',
    '- Do not invent unrelated characters or dialogue.',
    '- Return JSON only. No markdown fences.',
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
    'You are importing a cinematic sound-description-only Markdown file into a structured audio design schema.',
    '',
    'Do not generate audio. Do not rewrite this as prose. Convert the document into strict JSON for the audio pipeline.',
    'This Markdown is already a sound design blueprint, so preserve its beat order, stem separation, motif logic, spatial rules, and mixer automation intent.',
    '',
    `Target duration seconds: ${targetDurationSeconds}`,
    `Locale for natural-language descriptions: ${readTrimmedString(input.locale) || 'en'}`,
    '',
    'Required JSON shape:',
    buildAnalysisJsonShape('sound_description'),
    '',
    'Rules:',
    '- Set sourceKind to "sound_description".',
    '- Use Ordered Sound Beats as the authority for shotNumber and beatNumber. K-0001 maps to 1, K-0002 maps to 2, and so on.',
    '- Preserve dialogue text exactly when dialogue is present.',
    '- Map "Foley / SFX focus" into foleyPlan for realistic movement, cloth, breath, floor, prop, and performance sounds.',
    '- Map highlighted story events, impacts, supernatural effects, wounds, hits, stings, and one-shot events into spotSfxPlan.',
    '- Map location acoustic space, ambient strategy, room tone, reverb, and spatialization into ambiencePlan.',
    '- Map score identity, motifs, harmonic strategy, rhythm, register shift, and continuity bridge into bgmPlan.',
    '- Map mixer automation into stemPromptSeeds so downstream stem generation and FFmpeg mixing can use it.',
    '- Estimate cue timings across the target duration when the Markdown has beat order but no exact seconds.',
    '- Do not exceed the target duration.',
    '- Do not invent unrelated scenes, characters, or dialogue.',
    '- Return JSON only. No markdown fences.',
    '',
    'Sound-description-only Markdown:',
    markdownText,
  ].join('\n')
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
