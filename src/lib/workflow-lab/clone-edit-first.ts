import { Prisma } from '@prisma/client'
import type { EditFirstWorkflowStage } from '@/lib/project-workflow/edit-first'
import { toInputJson, toNullableInputJson, mapWorkflowLabId, type WorkflowLabCloneMaps } from './clone-json'
import {
  resolveWorkflowLabScreenplayStatus,
  resolveWorkflowLabStylePreviewStatus,
  shouldWorkflowLabCloneScreenplay,
  shouldWorkflowLabCloneStylePreviews,
} from './clone-stage'

export async function cloneWorkflowLabEditFirstArtifacts(params: {
  readonly tx: Prisma.TransactionClient
  readonly targetProjectId: string
  readonly sourceEpisodeId: string
  readonly targetEpisodeId: string
  readonly stage: EditFirstWorkflowStage
  readonly maps: WorkflowLabCloneMaps
}) {
  if (!shouldWorkflowLabCloneScreenplay(params.stage)) return

  const screenplay = await params.tx.projectEditScreenplay.findUnique({
    where: { episodeId: params.sourceEpisodeId },
    include: {
      stylePreviews: {
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (screenplay) {
    const createdScreenplay = await params.tx.projectEditScreenplay.create({
      data: {
        projectId: params.targetProjectId,
        episodeId: params.targetEpisodeId,
        userPrompt: screenplay.userPrompt,
        styleBibleJson: toNullableInputJson(screenplay.styleBibleJson),
        screenplayText: screenplay.screenplayText,
        status: resolveWorkflowLabScreenplayStatus(params.stage, screenplay.status),
      },
      select: { id: true },
    })
    mapWorkflowLabId({
      maps: params.maps,
      scopedMap: params.maps.screenplayIds,
      sourceId: screenplay.id,
      targetId: createdScreenplay.id,
    })

    if (shouldWorkflowLabCloneStylePreviews(params.stage)) {
      for (const preview of screenplay.stylePreviews) {
        const createdPreview = await params.tx.projectEditStylePreview.create({
          data: {
            projectId: params.targetProjectId,
            episodeId: params.targetEpisodeId,
            editScreenplayId: createdScreenplay.id,
            styleKey: preview.styleKey,
            aspectRatio: preview.aspectRatio,
            title: preview.title,
            summary: preview.summary,
            styleBibleJson: toInputJson(preview.styleBibleJson),
            imagePrompt: preview.imagePrompt,
            imageKey: preview.imageKey,
            status: resolveWorkflowLabStylePreviewStatus(params.stage, preview.status),
            taskId: null,
            errorMessage: preview.errorMessage,
          },
          select: { id: true },
        })
        mapWorkflowLabId({
          maps: params.maps,
          scopedMap: params.maps.stylePreviewIds,
          sourceId: preview.id,
          targetId: createdPreview.id,
        })
      }
    }

  }
}
