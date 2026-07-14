import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import type { AssetKind } from '@/lib/assets/contracts'

type UpdateVariantBody = {
  kind?: AssetKind
  projectId?: string
} & Record<string, unknown>

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'character' || value === 'location' || value === 'prop'
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string; variantId: string }> },
) => {
  const { assetId, variantId } = await context.params
  const body = await request.json() as UpdateVariantBody
  if (!body.projectId || !isAssetKind(body.kind)) throw new ApiError('INVALID_PARAMS')
  const authResult = await requireProjectAuthLight(body.projectId)
  if (isErrorResponse(authResult)) return authResult
  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_assets_update_variant',
    projectId: body.projectId,
    userId: authResult.session.user.id,
    input: { assetId, variantId, ...body },
    source: 'project-ui',
  })
  return NextResponse.json(result)
})
