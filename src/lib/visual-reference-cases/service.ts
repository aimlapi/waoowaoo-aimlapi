import type { NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { ApiError } from '@/lib/api-errors'
import { buildImageBillingPayload } from '@/lib/config-service'
import { submitOperationTask } from '@/lib/operations/submit-operation-task'
import { TASK_TYPE } from '@/lib/task/types'
import type { Locale } from '@/i18n/routing'
import type { MediaRef } from '@/lib/media/types'
import type { ProjectVisualReferenceCasePayload, VisualReferenceCaseStatus } from './types'

interface SubmitVisualReferenceCasesInput {
  readonly request: NextRequest
  readonly projectId: string
  readonly episodeId: string
  readonly userId: string
  readonly locale: Locale
  readonly count?: number
}

interface SelectVisualReferenceCaseInput {
  readonly projectId: string
  readonly episodeId: string
  readonly caseId: string
}

interface VisualReferenceCaseRow {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly status: string
  readonly taskId: string | null
  readonly errorMessage: string | null
  readonly imageUrl: string | null
  readonly isSelected: boolean
  readonly sortIndex: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly imageMedia: {
    readonly id: string
    readonly publicId: string
    readonly storageKey: string
    readonly sha256: string | null
    readonly mimeType: string | null
    readonly sizeBytes: bigint | number | null
    readonly width: number | null
    readonly height: number | null
    readonly durationMs: number | null
    readonly updatedAt: Date
  } | null
}

function mediaUrl(publicId: string): string {
  return `/m/${encodeURIComponent(publicId)}`
}

function mapMediaRef(media: VisualReferenceCaseRow['imageMedia']): MediaRef | null {
  if (!media) return null
  return {
    id: media.id,
    publicId: media.publicId,
    url: mediaUrl(media.publicId),
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes == null ? null : Number(media.sizeBytes),
    width: media.width,
    height: media.height,
    durationMs: media.durationMs,
    sha256: media.sha256,
    updatedAt: media.updatedAt.toISOString(),
    storageKey: media.storageKey,
  }
}

function normalizeStatus(value: string): VisualReferenceCaseStatus {
  if (value === 'completed' || value === 'failed') return value
  return 'processing'
}

function mapVisualReferenceCase(row: VisualReferenceCaseRow): ProjectVisualReferenceCasePayload {
  const imageMedia = mapMediaRef(row.imageMedia)
  return {
    id: row.id,
    projectId: row.projectId,
    episodeId: row.episodeId,
    screenplayId: row.screenplayId,
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    status: normalizeStatus(row.status),
    taskId: row.taskId,
    errorMessage: row.errorMessage,
    imageUrl: imageMedia?.url ?? row.imageUrl,
    imageMedia,
    isSelected: row.isSelected,
    sortIndex: row.sortIndex,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

const visualReferenceCaseInclude = {
  imageMedia: true,
} as const

export async function readProjectVisualReferenceCases(input: {
  readonly projectId: string
  readonly episodeId: string
}): Promise<ProjectVisualReferenceCasePayload[]> {
  const cases = await prisma.projectVisualReferenceCase.findMany({
    where: {
      projectId: input.projectId,
      episodeId: input.episodeId,
    },
    include: visualReferenceCaseInclude,
    orderBy: [
      { isSelected: 'desc' },
      { createdAt: 'desc' },
      { sortIndex: 'asc' },
    ],
  })
  return cases.map((item) => mapVisualReferenceCase(item))
}

function normalizeCount(value: number | undefined): number {
  if (value === undefined) return 3
  return Math.max(1, Math.min(5, Math.floor(value)))
}

export async function submitProjectVisualReferenceCases(input: SubmitVisualReferenceCasesInput) {
  const [project, episode, screenplay] = await Promise.all([
    prisma.project.findFirst({
      where: { id: input.projectId, userId: input.userId },
      select: {
        id: true,
        storyboardModel: true,
        videoRatio: true,
        artStyle: true,
      },
    }),
    prisma.projectEpisode.findFirst({
      where: { id: input.episodeId, projectId: input.projectId },
      select: { id: true },
    }),
    prisma.projectEditScreenplay.findFirst({
      where: {
        projectId: input.projectId,
        episodeId: input.episodeId,
      },
      select: {
        id: true,
        status: true,
        screenplayText: true,
        userPrompt: true,
      },
    }),
  ])

  if (!project || !episode) throw new ApiError('NOT_FOUND')
  if (!screenplay) throw new ApiError('INVALID_PARAMS', {
    code: 'EDIT_SCREENPLAY_REQUIRED',
    message: 'A confirmed screenplay is required before generating visual reference cases.',
  })
  if (screenplay.status !== 'ready') throw new ApiError('INVALID_PARAMS', {
    code: 'EDIT_SCREENPLAY_NOT_READY',
    message: 'The screenplay must be ready before generating visual reference cases.',
  })
  if (!project.storyboardModel?.trim()) throw new ApiError('INVALID_PARAMS', {
    code: 'STORYBOARD_IMAGE_MODEL_REQUIRED',
    message: 'Storyboard image model is required before generating visual reference cases.',
  })

  const count = normalizeCount(input.count)
  const basePayload = {
    episodeId: input.episodeId,
    screenplayId: screenplay.id,
    screenplayText: screenplay.screenplayText,
    userPrompt: screenplay.userPrompt,
    count,
    aspectRatio: project.videoRatio,
    artStyle: project.artStyle,
  }
  const billingPayload = await buildImageBillingPayload({
    projectId: input.projectId,
    userId: input.userId,
    imageModel: project.storyboardModel,
    basePayload,
  })

  return await submitOperationTask({
    request: input.request,
    projectId: input.projectId,
    episodeId: input.episodeId,
    userId: input.userId,
    locale: input.locale,
    type: TASK_TYPE.VISUAL_REFERENCE_CASES,
    targetType: 'ProjectEpisode',
    targetId: input.episodeId,
    operationId: 'generate_visual_reference_cases',
    source: 'project-ui',
    confirmed: true,
    payload: {
      ...billingPayload,
      displayMode: 'detail',
    },
    billingInfo: null,
  })
}

export async function selectProjectVisualReferenceCase(input: SelectVisualReferenceCaseInput): Promise<ProjectVisualReferenceCasePayload> {
  const target = await prisma.projectVisualReferenceCase.findFirst({
    where: {
      id: input.caseId,
      projectId: input.projectId,
      episodeId: input.episodeId,
    },
    select: { id: true, status: true },
  })
  if (!target) throw new ApiError('NOT_FOUND')
  if (target.status !== 'completed') throw new ApiError('INVALID_PARAMS', {
    code: 'VISUAL_REFERENCE_CASE_NOT_READY',
    message: 'Only completed visual reference cases can be selected.',
  })

  const updated = await prisma.$transaction(async (tx) => {
    await tx.projectVisualReferenceCase.updateMany({
      where: {
        projectId: input.projectId,
        episodeId: input.episodeId,
        isSelected: true,
      },
      data: { isSelected: false },
    })
    return await tx.projectVisualReferenceCase.update({
      where: { id: input.caseId },
      data: { isSelected: true },
      include: visualReferenceCaseInclude,
    })
  })

  return mapVisualReferenceCase(updated)
}
