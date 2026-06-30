import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'
import { generateScreenplayAssets } from '@/lib/screenplay-storyboard/assets'

const generateScreenplayAssetsRequestSchema = z.object({
  episodeId: z.string().trim().min(1),
}).strict()

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json().catch(() => ({})) as unknown
  const parsed = generateScreenplayAssetsRequestSchema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await generateScreenplayAssets({
    request,
    projectId,
    episodeId: parsed.data.episodeId,
    userId: authResult.session.user.id,
    locale: resolveRequiredTaskLocale(request, body),
  })

  return NextResponse.json(result)
})
