import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import {
  LONG_FORM_SEGMENT_DURATION_SEC,
  longFormPlanModelOutputSchema,
  type LongFormAssetSummary,
  type LongFormPlanModelOutput,
  type LongFormPlanStatus,
  type LongFormPlanSummary,
  type LongFormSegmentStatus,
  type LongFormSegmentSummary,
} from './types'

const LONG_FORM_PLAN_STATUS_GENERATING: LongFormPlanStatus = 'generating'
const LONG_FORM_PLAN_STATUS_READY: LongFormPlanStatus = 'ready'
const LONG_FORM_PLAN_STATUS_FAILED: LongFormPlanStatus = 'failed'
const LONG_FORM_SEGMENT_STATUS_SCREENPLAY_READY: LongFormSegmentStatus = 'screenplay_ready'

export type LongFormPlanRow = {
  readonly id: string
  readonly projectId: string
  readonly sourceEpisodeId: string | null
  readonly userPrompt: string
  readonly totalDurationSec: number
  readonly segmentDurationSec: number
  readonly segmentCount: number
  readonly status: string
  readonly screenplayText: string | null
  readonly globalAssetsJson: unknown | null
  readonly styleBibleJson: unknown | null
  readonly errorMessage: string | null
}

export type LongFormSegmentRow = {
  readonly id: string
  readonly episodeId: string
  readonly segmentIndex: number
  readonly title: string
  readonly synopsis: string
  readonly screenplayText: string
  readonly targetDurationSec: number
  readonly status: string
}

function readJsonValue(value: unknown): unknown | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!trimmed) return null
  return JSON.parse(trimmed) as unknown
}

function normalizePlanStatus(value: string): LongFormPlanStatus {
  if (value === 'generating' || value === 'ready' || value === 'failed') return value
  return 'failed'
}

function normalizeSegmentStatus(value: string): LongFormSegmentStatus {
  return value === 'screenplay_ready' ? 'screenplay_ready' : 'failed'
}

function mapSegmentRow(row: LongFormSegmentRow): LongFormSegmentSummary {
  return {
    id: row.id,
    episodeId: row.episodeId,
    segmentIndex: row.segmentIndex,
    title: row.title,
    synopsis: row.synopsis,
    targetDurationSec: row.targetDurationSec,
    status: normalizeSegmentStatus(row.status),
  }
}

function mapPlanRow(row: LongFormPlanRow, segments: readonly LongFormSegmentRow[]): LongFormPlanSummary {
  const globalAssets = longFormPlanModelOutputSchema.shape.globalAssets.safeParse(readJsonValue(row.globalAssetsJson))
  return {
    id: row.id,
    projectId: row.projectId,
    sourceEpisodeId: row.sourceEpisodeId,
    userPrompt: row.userPrompt,
    totalDurationSec: row.totalDurationSec,
    segmentDurationSec: row.segmentDurationSec,
    segmentCount: row.segmentCount,
    status: normalizePlanStatus(row.status),
    screenplayText: row.screenplayText,
    globalAssets: globalAssets.success ? globalAssets.data : null,
    styleBible: readJsonValue(row.styleBibleJson),
    errorMessage: row.errorMessage,
    segments: segments.map(mapSegmentRow),
  }
}

export async function insertLongFormPlan(input: {
  readonly projectId: string
  readonly sourceEpisodeId?: string | null
  readonly userPrompt: string
  readonly totalDurationSec: number
  readonly segmentCount: number
}): Promise<string> {
  const planId = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO project_long_form_plans (
      id,
      projectId,
      sourceEpisodeId,
      userPrompt,
      totalDurationSec,
      segmentDurationSec,
      segmentCount,
      status,
      createdAt,
      updatedAt
    ) VALUES (
      ${planId},
      ${input.projectId},
      ${input.sourceEpisodeId ?? null},
      ${input.userPrompt},
      ${input.totalDurationSec},
      ${LONG_FORM_SEGMENT_DURATION_SEC},
      ${input.segmentCount},
      ${LONG_FORM_PLAN_STATUS_GENERATING},
      NOW(),
      NOW()
    )
  `)
  return planId
}

export async function deleteLongFormPlan(planId: string): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    DELETE FROM project_long_form_plans WHERE id = ${planId}
  `)
}

export async function markLongFormPlanFailed(input: {
  readonly planId: string
  readonly message: string
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE project_long_form_plans
    SET status = ${LONG_FORM_PLAN_STATUS_FAILED},
        errorMessage = ${input.message},
        updatedAt = NOW()
    WHERE id = ${input.planId}
  `)
}

export async function markLongFormPlanReady(input: {
  readonly planId: string
  readonly screenplayText: string
  readonly globalAssets: LongFormPlanModelOutput['globalAssets']
}): Promise<void> {
  await prisma.$executeRaw(Prisma.sql`
    UPDATE project_long_form_plans
    SET status = ${LONG_FORM_PLAN_STATUS_READY},
        screenplayText = ${input.screenplayText},
        globalAssetsJson = ${JSON.stringify(input.globalAssets)},
        errorMessage = NULL,
        updatedAt = NOW()
    WHERE id = ${input.planId}
  `)
}

export async function readPlanRow(planId: string): Promise<LongFormPlanRow | null> {
  const rows = await prisma.$queryRaw<LongFormPlanRow[]>(Prisma.sql`
    SELECT
      id,
      projectId,
      sourceEpisodeId,
      userPrompt,
      totalDurationSec,
      segmentDurationSec,
      segmentCount,
      status,
      screenplayText,
      globalAssetsJson,
      styleBibleJson,
      errorMessage
    FROM project_long_form_plans
    WHERE id = ${planId}
    LIMIT 1
  `)
  return rows[0] ?? null
}

export async function readSegmentRows(planId: string): Promise<readonly LongFormSegmentRow[]> {
  return await prisma.$queryRaw<LongFormSegmentRow[]>(Prisma.sql`
    SELECT
      id,
      episodeId,
      segmentIndex,
      title,
      synopsis,
      screenplayText,
      targetDurationSec,
      status
    FROM project_long_form_segments
    WHERE planId = ${planId}
    ORDER BY segmentIndex ASC
  `)
}

export async function readProjectLongFormPlan(input: {
  readonly projectId: string
  readonly planId: string
}): Promise<LongFormPlanSummary | null> {
  const row = await readPlanRow(input.planId)
  if (!row || row.projectId !== input.projectId) return null
  return mapPlanRow(row, await readSegmentRows(row.id))
}

export async function listProjectLongFormPlans(input: {
  readonly projectId: string
}): Promise<readonly LongFormPlanSummary[]> {
  const rows = await prisma.$queryRaw<LongFormPlanRow[]>(Prisma.sql`
    SELECT
      id,
      projectId,
      sourceEpisodeId,
      userPrompt,
      totalDurationSec,
      segmentDurationSec,
      segmentCount,
      status,
      screenplayText,
      globalAssetsJson,
      styleBibleJson,
      errorMessage
    FROM project_long_form_plans
    WHERE projectId = ${input.projectId}
    ORDER BY createdAt DESC
  `)
  const result: LongFormPlanSummary[] = []
  for (const row of rows) {
    result.push(mapPlanRow(row, await readSegmentRows(row.id)))
  }
  return result
}

export async function insertLongFormSegment(input: {
  readonly planId: string
  readonly projectId: string
  readonly episodeId: string
  readonly segmentIndex: number
  readonly title: string
  readonly synopsis: string
  readonly screenplayText: string
  readonly targetDurationSec: number
  readonly assetRefs: readonly LongFormAssetSummary[]
}): Promise<string> {
  const segmentId = randomUUID()
  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO project_long_form_segments (
      id,
      planId,
      projectId,
      episodeId,
      segmentIndex,
      title,
      synopsis,
      screenplayText,
      targetDurationSec,
      status,
      assetRefsJson,
      createdAt,
      updatedAt
    ) VALUES (
      ${segmentId},
      ${input.planId},
      ${input.projectId},
      ${input.episodeId},
      ${input.segmentIndex},
      ${input.title},
      ${input.synopsis},
      ${input.screenplayText},
      ${input.targetDurationSec},
      ${LONG_FORM_SEGMENT_STATUS_SCREENPLAY_READY},
      ${JSON.stringify(input.assetRefs)},
      NOW(),
      NOW()
    )
  `)
  return segmentId
}

export async function deleteCreatedLongFormEpisodes(episodeIds: readonly string[]): Promise<void> {
  if (episodeIds.length === 0) return
  await prisma.projectEpisode.deleteMany({
    where: { id: { in: [...episodeIds] } },
  })
}
