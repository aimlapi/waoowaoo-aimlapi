import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth, requireProjectAuthLight } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import {
  listProjectLongFormPlans,
  readProjectLongFormPlan,
  submitProjectLongFormPlanGenerationTask,
} from '@/lib/long-form/service'
import {
  createLongFormPlanRequestSchema,
  getLongFormPlanRequestSchema,
} from '@/lib/long-form/types'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const parsed = getLongFormPlanRequestSchema.safeParse({
    planId: request.nextUrl.searchParams.get('planId') ?? undefined,
  })
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  if (parsed.data.planId) {
    const plan = await readProjectLongFormPlan({
      projectId,
      planId: parsed.data.planId,
    })
    return NextResponse.json({ plan })
  }

  const plans = await listProjectLongFormPlans({ projectId })
  return NextResponse.json({ plans })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = createLongFormPlanRequestSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const result = await submitProjectLongFormPlanGenerationTask({
    request,
    projectId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    ...(parsed.data.sourceEpisodeId ? { sourceEpisodeId: parsed.data.sourceEpisodeId } : {}),
    prompt: parsed.data.prompt,
    totalDurationSec: parsed.data.totalDurationSec,
    aspectRatio: parsed.data.aspectRatio,
    source: 'project-ui',
    confirmed: true,
  })

  return NextResponse.json(result)
})
