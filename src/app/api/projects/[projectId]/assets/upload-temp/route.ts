import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) => {
  const { projectId } = await context.params
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  let input: unknown
  try {
    input = await request.json()
  } catch {
    throw new ApiError('INVALID_PARAMS')
  }
  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_project_asset_upload_temp',
    projectId,
    userId: authResult.session.user.id,
    input,
    source: 'project-ui',
  })
  return NextResponse.json(result)
})
