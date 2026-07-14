import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import type { AssetKind } from '@/lib/assets/contracts'

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'character' || value === 'location' || value === 'prop'
}

type AssetMutationBody = {
  kind?: AssetKind
  projectId?: string
} & Record<string, unknown>

export const POST = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) => {
  const { assetId } = await context.params
  const body = await request.json() as AssetMutationBody
  if (!body.projectId || !isAssetKind(body.kind)) throw new ApiError('INVALID_PARAMS')
  const authResult = await requireProjectAuthLight(body.projectId)
  if (isErrorResponse(authResult)) return authResult
  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_assets_revert_render',
    projectId: body.projectId,
    userId: authResult.session.user.id,
    input: { assetId, ...body },
    source: 'project-ui',
  })
  return NextResponse.json(result)
})
