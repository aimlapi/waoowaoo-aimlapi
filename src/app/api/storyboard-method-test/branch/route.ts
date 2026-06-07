import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { createStoryboardMethodTestBranch } from '@/lib/storyboard-method-test/session'

const storyboardMethodBranchSchema = z.object({
  projectId: z.string().trim().min(1),
  episodeId: z.string().trim().min(1),
  schemeId: z.enum(['global-continuity-prompt', 'top-down-spatial-lock', 'first-panel-img2img']),
  panelCount: z.number().int().min(3).max(9).default(6),
  meta: z.object({
    locale: z.enum(['zh', 'en']).optional(),
  }).optional(),
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = storyboardMethodBranchSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'INVALID_PARAMS',
      issues: parsed.error.issues,
    })
  }

  const branch = await createStoryboardMethodTestBranch({
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
    projectId: parsed.data.projectId,
    episodeId: parsed.data.episodeId,
    schemeId: parsed.data.schemeId,
    panelCount: parsed.data.panelCount,
  })

  return NextResponse.json({ branch }, { status: 201 })
})
