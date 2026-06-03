import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth, requireProjectAuthLight } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import {
  readProjectVisualReferenceCases,
  selectProjectVisualReferenceCase,
  submitProjectVisualReferenceCases,
} from '@/lib/visual-reference-cases/service'
import {
  createVisualReferenceCasesRequestSchema,
  getVisualReferenceCasesRequestSchema,
  selectVisualReferenceCaseRequestSchema,
} from '@/lib/visual-reference-cases/types'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const parsed = getVisualReferenceCasesRequestSchema.safeParse({
    episodeId: searchParams.get('episodeId'),
  })
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const cases = await readProjectVisualReferenceCases({
    projectId,
    episodeId: parsed.data.episodeId,
  })
  return NextResponse.json({ cases })
})

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = createVisualReferenceCasesRequestSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const result = await submitProjectVisualReferenceCases({
    request,
    projectId,
    episodeId: parsed.data.episodeId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    ...(parsed.data.count ? { count: parsed.data.count } : {}),
  })
  return NextResponse.json(result)
})

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = selectVisualReferenceCaseRequestSchema.safeParse(body)
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const visualReferenceCase = await selectProjectVisualReferenceCase({
    projectId,
    episodeId: parsed.data.episodeId,
    caseId: parsed.data.caseId,
  })
  return NextResponse.json({ case: visualReferenceCase })
})
