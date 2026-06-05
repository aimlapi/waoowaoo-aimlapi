import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { createStoryboardMethodTestSession } from '@/lib/storyboard-method-test/session'

const createStoryboardMethodTestSessionSchema = z.object({
  creativeBrief: z.string().trim().min(1),
  styleReferenceNote: z.string().trim().default(''),
  projectName: z.string().trim().min(1).max(80),
  videoRatio: z.enum(['9:16', '16:9', '21:9']).default('16:9'),
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
  const parsed = createStoryboardMethodTestSessionSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS', {
      message: 'INVALID_PARAMS',
      issues: parsed.error.issues,
    })
  }

  const result = await createStoryboardMethodTestSession({
    request,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
    creativeBrief: parsed.data.creativeBrief,
    styleReferenceNote: parsed.data.styleReferenceNote,
    projectName: parsed.data.projectName,
    videoRatio: parsed.data.videoRatio,
    artStyle: parsed.data.artStyle,
    panelCount: parsed.data.panelCount,
  })

  return NextResponse.json(result, { status: 201 })
})
