import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireProjectAuthLight } from '@/lib/api-auth'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import type { AssetKind } from '@/lib/assets/contracts'

function isAssetKind(value: unknown): value is AssetKind {
  return value === 'character' || value === 'location' || value === 'prop'
}

export const GET = apiHandler(async (request: NextRequest) => {
  const projectId = request.nextUrl.searchParams.get('projectId')
  const kind = request.nextUrl.searchParams.get('kind')
  if (!projectId || (kind !== null && !isAssetKind(kind))) {
    throw new ApiError('INVALID_PARAMS')
  }
  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult
  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_assets_read',
    projectId,
    userId: authResult.session.user.id,
    input: { projectId, kind },
    source: 'project-ui',
  })
  return NextResponse.json(result)
})

type CreateAssetBody = {
  kind?: AssetKind
  projectId?: string
} & Record<string, unknown>

export const POST = apiHandler(async (request: NextRequest) => {
  const body = await request.json() as CreateAssetBody
  if (!body.projectId || !isAssetKind(body.kind)) throw new ApiError('INVALID_PARAMS')
  const authResult = await requireProjectAuthLight(body.projectId)
  if (isErrorResponse(authResult)) return authResult
  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'api_assets_create',
    projectId: body.projectId,
    userId: authResult.session.user.id,
    input: body,
    source: 'project-ui',
  })
  return NextResponse.json(result)
})
