import type { Locale } from '@/i18n/routing'
import { AI_PROMPT_IDS, buildAiPromptContent } from '@/lib/ai-prompts'
import { flattenChatMessageContent } from '@/lib/ai-registry/message-content'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { withTextBilling } from '@/lib/billing'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  LONG_FORM_SEGMENT_DURATION_SEC,
  longFormPlanModelOutputSchema,
  type LongFormPlanModelOutput,
} from './types'

const LONG_FORM_PROMPT_CACHE_MIN_CHARS = 1024

export async function runLongFormPlanPrompt(input: {
  readonly userId: string
  readonly projectId: string
  readonly model: string
  readonly locale: Locale
  readonly prompt: string
  readonly totalDurationSec: number
  readonly segmentCount: number
  readonly aspectRatio: string
}): Promise<LongFormPlanModelOutput> {
  const content = buildAiPromptContent({
    promptId: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN,
    locale: input.locale,
    variables: {
      user_request: input.prompt,
      total_duration_seconds: String(input.totalDurationSec),
      segment_duration_seconds: String(LONG_FORM_SEGMENT_DURATION_SEC),
      segment_count: String(input.segmentCount),
      aspect_ratio: input.aspectRatio,
    },
    cacheVariableKeys: ['user_request'],
    minCacheChars: LONG_FORM_PROMPT_CACHE_MIN_CHARS,
  })
  const promptText = flattenChatMessageContent(content)
  const maxInputTokens = Math.max(2000, Math.ceil(promptText.length * 1.2))
  const completion = await withTextBilling(
    input.userId,
    input.model,
    maxInputTokens,
    {
      projectId: input.projectId,
      action: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN,
      metadata: { promptId: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN },
    },
    async () => await executeAiTextStep({
      userId: input.userId,
      model: input.model,
      messages: [{ role: 'user', content }],
      temperature: 0.35,
      projectId: input.projectId,
      action: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN,
      meta: {
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN,
        stepTitle: AI_PROMPT_IDS.EDIT_SCRIPT_LONG_FORM_PLAN,
        stepIndex: 1,
        stepTotal: 1,
      },
    }),
  )
  const text = completion.text.trim()
  if (!text) throw new Error('LONG_FORM_PLAN_EMPTY')
  const parsed = longFormPlanModelOutputSchema.parse(safeParseJsonObject(text))
  if (parsed.segments.length !== input.segmentCount) {
    throw new Error(`LONG_FORM_SEGMENT_COUNT_MISMATCH:expected=${String(input.segmentCount)}:actual=${String(parsed.segments.length)}`)
  }
  const expectedIndexes = new Set(Array.from({ length: input.segmentCount }, (_item, index) => index + 1))
  for (const segment of parsed.segments) {
    if (!expectedIndexes.delete(segment.index)) {
      throw new Error(`LONG_FORM_SEGMENT_INDEX_INVALID:${String(segment.index)}`)
    }
  }
  return parsed
}
