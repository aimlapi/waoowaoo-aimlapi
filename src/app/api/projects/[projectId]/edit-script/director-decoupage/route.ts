import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import {
  readProjectEditDirectorDecoupage,
} from '@/lib/edit-script/service'
import {
  getEditDirectorDecoupageRequestSchema,
} from '@/lib/edit-script/types'

export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const { searchParams } = new URL(request.url)
  const parsed = getEditDirectorDecoupageRequestSchema.safeParse({
    episodeId: searchParams.get('episodeId'),
  })
  if (!parsed.success) throw new ApiError('INVALID_PARAMS')

  const directorDecoupage = await readProjectEditDirectorDecoupage({
    projectId,
    episodeId: parsed.data.episodeId,
  })
  return NextResponse.json({ directorDecoupage })
})
