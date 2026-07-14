import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import type { AssetKind } from '@/lib/assets/contracts'

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'character' || value === 'location' || value === 'prop'
}

type AssetBody = {
  kind?: AssetKind
  projectId?: string
} & Record<string, unknown>

function isDeletableKind(value: unknown): value is Extract<AssetKind, 'location' | 'prop'> {
  return value === 'location' || value === 'prop'
}

async function executeAssetMutation(params: {
  request: NextRequest
  operationId: 'api_assets_update' | 'api_assets_remove'
  assetId: string
  body: AssetBody
}) {
  if (!params.body.projectId) throw new ApiError('INVALID_PARAMS')
  const authResult = await requireProjectAuthLight(params.body.projectId)
  if (isErrorResponse(authResult)) return authResult
  const result = await executeProjectAgentOperationFromApi({
    request: params.request,
    operationId: params.operationId,
    projectId: params.body.projectId,
    userId: authResult.session.user.id,
    input: { assetId: params.assetId, ...params.body },
    source: 'project-ui',
  })
  return NextResponse.json(result)
}

export const PATCH = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) => {
  const { assetId } = await context.params
  const body = await request.json() as AssetBody
  if (!isAssetKind(body.kind)) throw new ApiError('INVALID_PARAMS')
  return await executeAssetMutation({ request, operationId: 'api_assets_update', assetId, body })
})

export const DELETE = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ assetId: string }> },
) => {
  const { assetId } = await context.params
  const body = await request.json() as AssetBody
  if (!isDeletableKind(body.kind)) throw new ApiError('INVALID_PARAMS')
  return await executeAssetMutation({ request, operationId: 'api_assets_remove', assetId, body })
})
