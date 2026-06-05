import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { createStoryboardBatchProjects } from '@/lib/dev-ab-test/storyboard-project-batch'

const createStoryboardProjectsSchema = z.object({
  storyText: z.string().trim().min(1),
  projectNamePrefix: z.string().trim().min(1).max(80),
  videoRatio: z.enum(['9:16', '16:9', '21:9']).default('9:16'),
  artStyle: z.string().trim().min(1).default('realistic'),
  panelCount: z.number().int().min(3).max(9).default(6),
  meta: z.object({
    locale: z.enum(['zh', 'en']).optional(),
  }).optional(),
})

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = createStoryboardProjectsSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'INVALID_PARAMS',
      issues: parsed.error.issues,
    })
  }

  const result = await createStoryboardBatchProjects({
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
    storyText: parsed.data.storyText,
    projectNamePrefix: parsed.data.projectNamePrefix,
    videoRatio: parsed.data.videoRatio,
    artStyle: parsed.data.artStyle,
    panelCount: parsed.data.panelCount,
  })

  return NextResponse.json(result, { status: 201 })
})
