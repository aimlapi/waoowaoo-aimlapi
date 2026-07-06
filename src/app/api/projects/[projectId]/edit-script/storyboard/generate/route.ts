import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { submitScreenplayStoryboardTask } from '@/lib/screenplay-storyboard/service'

const submitScreenplayStoryboardRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
  generationMode: z.enum(['replace', 'append']).optional(),
}).strict()

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = submitScreenplayStoryboardRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await submitScreenplayStoryboardTask({
    projectId,
    episodeId: parsed.data.episodeId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
    requestId: request.headers.get('x-request-id'),
    generationMode: parsed.data.generationMode,
  })

  return NextResponse.json(result)
})
