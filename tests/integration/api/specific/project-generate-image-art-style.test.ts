import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { executeProjectAgentOperationFromApi } from '@/lib/adapters/api/execute-project-agent-operation'
import { buildMockRequest } from '../../../helpers/request'

type ExecuteOperationInput = Parameters<typeof executeProjectAgentOperationFromApi>[0]
type QueuedOperationResult = {
  success: true
  async: true
  taskId: string
  status: 'queued'
  runId: null
  deduped: false
}

const authMock = vi.hoisted(() => ({
  requireProjectAuthLight: vi.fn(async () => ({
    session: { user: { id: 'user-1' } },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const executeOperationMock = vi.hoisted(() => vi.fn<(params: ExecuteOperationInput) => Promise<QueuedOperationResult>>(
  async () => ({
    success: true,
    async: true,
    taskId: 'task-1',
    status: 'queued',
    runId: null,
    deduped: false,
  }),
))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/adapters/api/execute-project-agent-operation', () => ({
  executeProjectAgentOperationFromApi: executeOperationMock,
}))

describe('api specific - novel promotion generate image legacy art style', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('strips valid legacy artStyle before delegating character generation', async () => {
    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        artStyle: 'realistic',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const call = executeOperationMock.mock.calls[0]?.[0] as {
      operationId?: unknown
      input?: Record<string, unknown>
    } | undefined
    expect(call?.operationId).toBe('generate_character_image')
    expect(call?.input).toEqual(expect.objectContaining({
      characterId: 'character-1',
      appearanceId: 'appearance-1',
    }))
    expect(call?.input).not.toHaveProperty('artStyle')
  })

  it('does not inject project artStyle when artStyle is omitted', async () => {
    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const call = executeOperationMock.mock.calls[0]?.[0] as {
      input?: Record<string, unknown>
    } | undefined
    expect(call?.input).not.toHaveProperty('artStyle')
  })

  it('strips invalid legacy artStyle instead of treating it as route config', async () => {
    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        artStyle: 'anime',
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const call = executeOperationMock.mock.calls[0]?.[0] as {
      input?: Record<string, unknown>
    } | undefined
    expect(call?.input).not.toHaveProperty('artStyle')
  })

  it('forwards requested count into operation input', async () => {
    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const req = buildMockRequest({
      path: '/api/projects/project-1/generate-image',
      method: 'POST',
      body: {
        type: 'character',
        id: 'character-1',
        appearanceId: 'appearance-1',
        count: 6,
      },
    })

    const res = await mod.POST(req, { params: Promise.resolve({ projectId: 'project-1' }) })
    expect(res.status).toBe(200)

    const call = executeOperationMock.mock.calls[0]?.[0] as {
      input?: Record<string, unknown>
    } | undefined
    expect(call?.input?.count).toBe(6)
  })
})
