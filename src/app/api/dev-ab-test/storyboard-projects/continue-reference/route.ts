import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { continueReferenceStoryboardPanels } from '@/lib/dev-ab-test/storyboard-batch-continuation'

const continueReferenceSchema = z.object({
  projectId: z.string().trim().min(1),
  storyboardId: z.string().trim().min(1),
  anchorPanelId: z.string().trim().min(1),
  meta: z.object({
    locale: z.enum(['zh', 'en']).optional(),
  }).optional(),
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = continueReferenceSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'INVALID_PARAMS',
      issues: parsed.error.issues,
    })
  }

  const result = await continueReferenceStoryboardPanels({
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
    projectId: parsed.data.projectId,
    storyboardId: parsed.data.storyboardId,
    anchorPanelId: parsed.data.anchorPanelId,
  })

  return NextResponse.json(result, { status: 201 })
})
