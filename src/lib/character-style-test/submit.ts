import type { NextRequest } from 'next/server'
import { ApiError } from '@/lib/api-errors'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import {
  buildImageBillingPayloadFromUserConfig,
  getUserModelConfig,
} from '@/lib/config-service'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import type { CharacterStyleTestPromptMode } from './prompt'

export const CHARACTER_STYLE_TEST_SYSTEM_PROJECT_ID = 'system'
export const CHARACTER_STYLE_TEST_TARGET_ID = 'character-style-test'

export async function submitCharacterStyleTestTask(input: {
  readonly request: NextRequest
  readonly userId: string
  readonly characterRequest: string
  readonly promptMode?: CharacterStyleTestPromptMode
  readonly projectId?: string
  readonly episodeId?: string | null
  readonly targetId?: string
  readonly operationId?: string
  readonly operationSource?: string
  readonly operationConfirmed?: boolean
  readonly dedupeKey?: string
}) {
  const characterRequest = input.characterRequest.trim()
  if (!characterRequest) {
    throw new ApiError('INVALID_PARAMS')
  }

  const userModelConfig = await getUserModelConfig(input.userId)
  const imageModel = userModelConfig.characterModel
  if (!imageModel) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'USER_CHARACTER_MODEL_REQUIRED',
      message: 'User character image model is required before character style testing',
    })
  }

  let billingPayload: Record<string, unknown>
  try {
    billingPayload = buildImageBillingPayloadFromUserConfig({
      userModelConfig,
      imageModel,
      basePayload: {
        characterRequest,
        promptMode: input.promptMode || 'style_asset',
        count: 1,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Image model capability not configured'
    throw new ApiError('INVALID_PARAMS', { code: 'IMAGE_MODEL_CAPABILITY_NOT_CONFIGURED', message })
  }

  const locale = resolveRequiredTaskLocale(input.request, billingPayload)
  const payload = withTaskUiPayload(billingPayload, {
    intent: 'generate',
    hasOutputAtStart: false,
  })

  return await submitTask({
    requestId: input.request.headers.get('x-request-id'),
    userId: input.userId,
    locale,
    projectId: input.projectId?.trim() || CHARACTER_STYLE_TEST_SYSTEM_PROJECT_ID,
    episodeId: input.episodeId ?? undefined,
    type: TASK_TYPE.CHARACTER_STYLE_TEST,
    targetType: 'CharacterStyleTest',
    targetId: input.targetId?.trim() || CHARACTER_STYLE_TEST_TARGET_ID,
    operationId: input.operationId?.trim() || 'character_style_test',
    operationSource: input.operationSource?.trim() || 'standalone-ui',
    operationConfirmed: input.operationConfirmed ?? true,
    payload,
    dedupeKey: input.dedupeKey,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.CHARACTER_STYLE_TEST, payload),
  })
}
