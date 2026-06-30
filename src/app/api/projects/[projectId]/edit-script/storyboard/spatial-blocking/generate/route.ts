import { NextRequest } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuth } from '@/lib/api-auth'

export const POST = apiHandler(async (
  _request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuth(projectId)
  if (isErrorResponse(authResult)) return authResult

  throw new ApiError('INVALID_PARAMS', {
    code: 'EDIT_SCRIPT_STORYBOARD_SPATIAL_BLOCKING_REMOVED',
    message: 'Standalone storyboard spatial blocking generation has been removed; generate storyboard panels directly from the ready screenplay, visual style, assets, and lightweight spatial facts.',
  })
})
