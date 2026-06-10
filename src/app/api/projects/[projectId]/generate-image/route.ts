import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { stripLegacyArtStyle } from '@/lib/media/strip-legacy-art-style'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const body = await request.json() as Record<string, unknown>
  const type = body.type
  const id = typeof body.id === 'string' ? body.id.trim() : ''

  if ((type !== 'character' && type !== 'location') || !id) {
    throw new ApiError('INVALID_PARAMS')
  }

  const operationId = type === 'character' ? 'generate_character_image' : 'generate_location_image'
  const { type: _type, id: _id, ...restBody } = body
  const normalizedBody = stripLegacyArtStyle(restBody)
  const input = type === 'character' ? { ...normalizedBody, characterId: id } : { ...normalizedBody, locationId: id }

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId,
    projectId,
    userId: authResult.session.user.id,
    input,
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
