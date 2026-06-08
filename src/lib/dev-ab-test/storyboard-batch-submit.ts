import type { ProjectPanel } from '@prisma/client'
import { createHash } from 'node:crypto'
import { buildDefaultTaskBillingInfo } from '@/lib/billing'
import {
  buildImageBillingPayload,
  getProjectModelConfig,
  resolveProjectModelCapabilityGenerationOptions,
} from '@/lib/config-service'
import { submitTask } from '@/lib/task/submitter'
import { TASK_TYPE } from '@/lib/task/types'
import { withTaskUiPayload } from '@/lib/task/ui-payload'
import type { Locale } from '@/i18n/routing'
import type { StoryboardBatchTaskRef } from './storyboard-project-batch'
import type { StoryboardBatchSchemeId } from './storyboard-batch-prompts'

function shortDedupeSignature(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16)
}

export async function submitStoryboardPanelTask(input: {
  readonly userId: string
  readonly locale: Locale
  readonly requestId?: string | null
  readonly projectId: string
  readonly episodeId: string | null
  readonly panel: ProjectPanel
  readonly schemeId: StoryboardBatchSchemeId
  readonly projectModelConfig: Awaited<ReturnType<typeof getProjectModelConfig>>
  readonly capabilityOptions: Awaited<ReturnType<typeof resolveProjectModelCapabilityGenerationOptions>>
  readonly styleSignature: string
  readonly referencePanelImageUrls?: readonly string[]
  readonly referenceImageNotes?: readonly string[]
}): Promise<StoryboardBatchTaskRef> {
  if (!input.projectModelConfig.storyboardModel) throw new Error('STORYBOARD_MODEL_NOT_CONFIGURED')
  const payload = {
    panelId: input.panel.id,
    candidateCount: 1,
    count: 1,
    referenceMode: 'storyboard',
    ...(input.referencePanelImageUrls && input.referencePanelImageUrls.length > 0
      ? { referencePanelImageUrls: [...input.referencePanelImageUrls] }
      : {}),
    ...(input.referenceImageNotes && input.referenceImageNotes.length > 0
      ? { referenceImageNotes: [...input.referenceImageNotes] }
      : {}),
    meta: { locale: input.locale },
    imageModel: input.projectModelConfig.storyboardModel,
    ...(Object.keys(input.capabilityOptions).length > 0 ? { generationOptions: input.capabilityOptions } : {}),
  }
  const billingPayload = await buildImageBillingPayload({
    projectId: input.projectId,
    userId: input.userId,
    imageModel: input.projectModelConfig.storyboardModel,
    basePayload: payload,
  })
  const referenceSignature = input.referencePanelImageUrls && input.referencePanelImageUrls.length > 0
    ? `:refs:${shortDedupeSignature(input.referencePanelImageUrls.join('|'))}`
    : ''
  const styleSignature = shortDedupeSignature(input.styleSignature)
  const task = await submitTask({
    userId: input.userId,
    locale: input.locale,
    requestId: input.requestId ?? null,
    projectId: input.projectId,
    episodeId: input.episodeId,
    type: TASK_TYPE.IMAGE_PANEL,
    targetType: 'ProjectPanel',
    targetId: input.panel.id,
    payload: withTaskUiPayload(billingPayload, { intent: 'generate', hasOutputAtStart: false }),
    dedupeKey: `dev_storyboard_batch:${input.schemeId}:${input.panel.id}:1:${styleSignature}${referenceSignature}`,
    billingInfo: buildDefaultTaskBillingInfo(TASK_TYPE.IMAGE_PANEL, billingPayload),
    operationId: 'dev_storyboard_batch',
    operationSource: 'dev-ab-test',
    operationConfirmed: true,
    operationRequestId: input.requestId ?? null,
  })
  return {
    panelNumber: input.panel.panelNumber ?? input.panel.panelIndex + 1,
    panelId: input.panel.id,
    taskId: task.taskId,
    status: task.status,
  }
}
