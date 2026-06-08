import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'

const authMock = vi.hoisted(() => ({
  requireProjectAuth: vi.fn(async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1' },
  })),
  requireProjectAuthLight: vi.fn(async (projectId: string) => ({
    session: { user: { id: 'user-1' } },
    project: { id: projectId, userId: 'user-1' },
  })),
  isErrorResponse: vi.fn((value: unknown) => value instanceof Response),
}))

const serviceMock = vi.hoisted(() => ({
  readProjectVisualReferenceCases: vi.fn(),
  submitProjectVisualReferenceCases: vi.fn(),
  selectProjectVisualReferenceCase: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => authMock)
vi.mock('@/lib/visual-reference-cases/service', () => serviceMock)
vi.mock('@/lib/task/resolve-locale', () => ({
  resolveRequiredTaskLocale: vi.fn(() => 'zh'),
}))

import {
  GET as visualReferenceCasesGet,
  PATCH as visualReferenceCasesPatch,
  POST as visualReferenceCasesPost,
} from '@/app/api/projects/[projectId]/visual-reference-cases/route'

describe('project visual reference cases route', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    serviceMock.readProjectVisualReferenceCases.mockResolvedValue([
      {
        id: 'case-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        screenplayId: 'screenplay-1',
        title: '克制电影现实感',
        description: '低饱和色彩',
        prompt: 'prompt',
        status: 'completed',
        taskId: 'task-1',
        errorMessage: null,
        imageUrl: '/m/media-1',
        imageMedia: null,
        isSelected: false,
        sortIndex: 0,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
      },
    ])
    serviceMock.submitProjectVisualReferenceCases.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'task-visual-reference-1',
      status: 'queued',
    })
    serviceMock.selectProjectVisualReferenceCase.mockResolvedValue({
      id: 'case-1',
      episodeId: 'episode-1',
      isSelected: true,
    })
  })

  it('GET lists visual reference cases through light project auth', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/visual-reference-cases?episodeId=episode-1',
      method: 'GET',
    })

    const response = await visualReferenceCasesGet(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(authMock.requireProjectAuthLight).toHaveBeenCalledWith('project-1')
    expect(serviceMock.readProjectVisualReferenceCases).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
    expect(body.cases).toHaveLength(1)
    expect(body.cases[0]).toEqual(expect.objectContaining({
      id: 'case-1',
      imageUrl: '/m/media-1',
    }))
  })

  it('POST submits a visual reference cases task after project auth', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/visual-reference-cases',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        count: 2,
      },
    })

    const response = await visualReferenceCasesPost(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(authMock.requireProjectAuth).toHaveBeenCalledWith('project-1')
    expect(serviceMock.submitProjectVisualReferenceCases).toHaveBeenCalledWith(expect.objectContaining({
      request,
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      count: 2,
    }))
    expect(body).toEqual(expect.objectContaining({
      async: true,
      taskId: 'task-visual-reference-1',
    }))
  })

  it('POST rejects legacy three-case visual reference requests', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/visual-reference-cases',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        count: 3,
      },
    })

    const response = await visualReferenceCasesPost(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })

    expect(response.status).toBe(400)
    expect(serviceMock.submitProjectVisualReferenceCases).not.toHaveBeenCalled()
  })

  it('PATCH selects only the completed visual reference case record', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/visual-reference-cases',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        caseId: 'case-1',
      },
    })

    const response = await visualReferenceCasesPatch(request, {
      params: Promise.resolve({ projectId: 'project-1' }),
    })
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(authMock.requireProjectAuth).toHaveBeenCalledWith('project-1')
    expect(serviceMock.selectProjectVisualReferenceCase).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      caseId: 'case-1',
    })
    expect(body.case).toEqual(expect.objectContaining({
      id: 'case-1',
      isSelected: true,
    }))
  })
})
