import { NextRequest, NextResponse } from 'next/server'
import { requireProjectAuthLight, isErrorResponse } from '@/lib/api-auth'
import { apiHandler } from '@/lib/api-errors'
import { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'

/**
 * 统一的项目数据加载API
 * 返回项目基础信息、项目配置、项目资产和剧集列表
 */
export const GET = apiHandler(async (
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> }
) => {
  const { projectId } = await context.params

  const authResult = await requireProjectAuthLight(projectId)
  if (isErrorResponse(authResult)) return authResult

  const result = await executeProjectAgentOperationFromApi({
    request,
    operationId: 'get_project_data',
    projectId,
    userId: authResult.session.user.id,
    input: {},
    source: 'project-ui',
  })

  return NextResponse.json(result)
})
