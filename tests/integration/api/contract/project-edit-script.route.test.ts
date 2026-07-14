import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildMockRequest } from '../../../helpers/request'
import { createKernelCompilerFixture } from '../../../fixtures/audio/kernel-compiler'

const authState = vi.hoisted(() => ({
  authenticated: true,
}))

const serviceMock = vi.hoisted(() => ({
  readProjectEditScreenplay: vi.fn(async () => null),
  readProjectEditDirectorDecoupage: vi.fn(async () => null),
  readProjectEditCinematographyShotPlan: vi.fn(async () => null),
  resolveEditDirectorDecoupageTaskTarget: vi.fn(async () => ({
    episodeId: 'episode-1',
    screenplayId: 'screenplay-1',
  })),
  resolveEditCinematographyShotPlanTaskTarget: vi.fn(async () => ({
    episodeId: 'episode-1',
    editScriptId: 'edit-1',
  })),
  generateProjectEditScreenplay: vi.fn(async () => ({
    id: 'screenplay-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    styleBible: null,
    stylePreviews: [],
    screenplayText: 'screenplay',
    status: 'screenplay_ready',
  })),
  readProjectEditScript: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    requirements: [],
  })),
  generateProjectEditScript: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    requirements: [
      {
        id: 'req-1',
        kind: 'character',
        name: 'Pilot',
        description: 'A quiet astronaut.',
        shotNumbers: [1, 2],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
    ],
  })),
  generateProjectEditDirectorDecoupage: vi.fn(async () => ({
    id: 'director-decoupage-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    screenplayId: 'screenplay-1',
    status: 'ready',
    shots: [],
  })),
  generateProjectEditCinematographyShotPlan: vi.fn(async () => ({
    id: 'cinematography-shot-plan-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    editScriptId: 'edit-1',
    status: 'ready',
    shots: [],
  })),
  generateProjectEditScriptAssets: vi.fn(async () => ({
    success: true,
    async: true,
    total: 1,
    taskIds: ['task-asset-1'],
    results: [{
      refId: 'req-1',
      taskId: 'task-asset-1',
      taskType: 'image_character',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
    }],
    submittedTasks: [{
      requirementId: 'req-1',
      kind: 'character',
      name: 'Pilot',
      taskId: 'task-asset-1',
      status: 'queued',
      runId: null,
      deduped: false,
      taskType: 'image_character',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
    }],
    editScript: {
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: 'one minute sci-fi',
      title: 'Orbital Silence',
      logline: 'A pilot meets a machine intelligence.',
      durationSec: 60,
      shotCount: 8,
      status: 'ready',
      shots: [],
      requirements: [
        {
          id: 'req-1',
          kind: 'character',
          name: 'Pilot',
          description: 'A quiet astronaut.',
          shotNumbers: [1, 2],
          status: 'generating',
          targetId: 'character-1',
          errorMessage: null,
        },
      ],
    },
  })),
  updateProjectEditScriptVideoBlockPrompt: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    videoBlocks: [
      {
        kind: 'group',
        shotNumbers: [1, 2, 3],
        gridMode: '2x2',
        reason: 'continuous motion',
        prompt: 'updated combined prompt',
      },
    ],
    requirements: [],
  })),
  updateProjectEditScriptKernelCompiler: vi.fn(async (input: { kernelCompiler: unknown }) => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    title: 'Orbital Silence',
    durationSec: 60,
    shotCount: 8,
    assetReviewStatus: 'approved',
    styleBible: null,
    shots: [],
    videoBlocks: [],
    requirements: [],
    kernelCompiler: input.kernelCompiler,
  })),
  updateProjectEditScriptAssetRequirementDescription: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    videoBlocks: [],
    requirements: [
      {
        id: 'req-1',
        kind: 'character',
        name: 'Pilot',
        description: 'updated asset prompt',
        shotNumbers: [1, 2],
        status: 'pending',
        targetId: null,
        errorMessage: null,
      },
    ],
  })),
  confirmProjectEditStylePreview: vi.fn(async () => ({
    id: 'screenplay-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    styleBible: null,
    stylePreviews: [],
    screenplayText: 'screenplay',
    status: 'ready',
  })),
}))

const videoBlockMergeMock = vi.hoisted(() => ({
  mergeProjectEditScriptVideoBlocks: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    videoBlocks: [
      {
        kind: 'group',
        shotNumbers: [1, 2, 3, 4],
        gridMode: '2x2',
        reason: 'merged continuous motion',
        prompt: 'merged continuous prompt',
      },
    ],
    requirements: [],
  })),
}))

const videoBlockArrangementMock = vi.hoisted(() => ({
  arrangeProjectEditScriptVideoBlocks: vi.fn(async () => ({
    id: 'edit-1',
    projectId: 'project-1',
    episodeId: 'episode-1',
    userPrompt: 'one minute sci-fi',
    title: 'Orbital Silence',
    logline: 'A pilot meets a machine intelligence.',
    durationSec: 60,
    shotCount: 8,
    status: 'ready',
    shots: [],
    videoBlocks: [
      {
        kind: 'group',
        shotNumbers: [1, 2, 3],
        gridMode: '2x2',
        reason: 'manual adjacent arrangement',
        prompt: 'rewritten adjacent prompt',
      },
    ],
    requirements: [],
  })),
}))

const storyboardConsistencyServiceMock = vi.hoisted(() => ({
  submitEditScriptSpatialBlockingStoryboard: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-storyboard-1',
    runId: null,
    status: 'queued',
    deduped: false,
    editScriptId: 'edit-1',
  })),
  submitEditScriptStoryboardPanels: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-panels-1',
    runId: null,
    status: 'queued',
    deduped: false,
  })),
}))

const screenplayAssetsMock = vi.hoisted(() => ({
  generateScreenplayAssets: vi.fn(async () => ({
    success: true,
    async: true,
    total: 1,
    taskIds: ['task-asset-1'],
    submittedTasks: [{
      kind: 'character',
      name: 'Pilot',
      taskId: 'task-asset-1',
      status: 'queued',
      runId: null,
      deduped: false,
      taskType: 'image_character',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
    }],
    assets: [{
      kind: 'character',
      name: 'Pilot',
      targetId: 'character-1',
      status: 'generating',
    }],
  })),
}))

const screenplayStoryboardMock = vi.hoisted(() => ({
  submitScreenplayStoryboardTask: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-panels-1',
    runId: null,
    status: 'queued',
    deduped: false,
    screenplayId: 'screenplay-1',
  })),
}))

const taskSubmissionMock = vi.hoisted(() => ({
  submitProjectEditScreenplayGenerationTask: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-screenplay-1',
    runId: null,
    status: 'queued',
    deduped: false,
    episodeId: 'episode-1',
    screenplayId: 'screenplay-1',
    taskType: 'edit_screenplay_generate',
    targetType: 'ProjectEditScreenplay',
    targetId: 'screenplay-1',
  })),
}))

vi.mock('@/lib/api-auth', () => {
  const unauthorized = () => new Response(
    JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
    { status: 401, headers: { 'content-type': 'application/json' } },
  )

  const authResult = (projectId: string) => {
    if (!authState.authenticated) return unauthorized()
    return {
      session: { user: { id: 'user-1' } },
      project: { id: projectId, userId: 'user-1' },
    }
  }

  return {
    isErrorResponse: (value: unknown) => value instanceof Response,
    requireProjectAuth: async (projectId: string) => authResult(projectId),
    requireProjectAuthLight: async (projectId: string) => authResult(projectId),
  }
})

vi.mock('@/lib/edit-script/service', () => serviceMock)
vi.mock('@/lib/edit-script/video-block-arrangement', () => videoBlockArrangementMock)
vi.mock('@/lib/edit-script/video-block-merge', () => videoBlockMergeMock)
vi.mock('@/lib/edit-script/storyboard-consistency/service', () => storyboardConsistencyServiceMock)
vi.mock('@/lib/screenplay-storyboard/assets', () => screenplayAssetsMock)
vi.mock('@/lib/screenplay-storyboard/service', () => screenplayStoryboardMock)
vi.mock('@/lib/edit-script/task-submission', async () => {
  const actual = await vi.importActual<typeof import('@/lib/edit-script/task-submission')>('@/lib/edit-script/task-submission')
  return {
    ...actual,
    submitProjectEditScreenplayGenerationTask: taskSubmissionMock.submitProjectEditScreenplayGenerationTask,
  }
})
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({
    analysisModel: 'openrouter::anthropic/claude-sonnet-4.6',
  })),
}))

import {
  GET as editScriptGet,
  PATCH as editScriptPatch,
} from '@/app/api/projects/[projectId]/edit-script/route'
import {
  PATCH as editScreenplayPatch,
  POST as editScreenplayPost,
} from '@/app/api/projects/[projectId]/edit-script/screenplay/route'
import { TASK_TYPE } from '@/lib/task/types'
import {
  POST as editScriptAssetsGeneratePost,
} from '@/app/api/projects/[projectId]/edit-script/assets/generate/route'
import {
  POST as editScriptStoryboardGeneratePost,
} from '@/app/api/projects/[projectId]/edit-script/storyboard/generate/route'

describe('project edit script route', () => {
  beforeEach(() => {
    authState.authenticated = true
    vi.clearAllMocks()
  })

  it('PATCH /api/projects/[projectId]/edit-script/screenplay -> confirms style with user-selected aspect ratio', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/screenplay',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        stylePreviewId: 'style-preview-1',
        aspectRatio: '21:9',
      },
    })

    const response = await editScreenplayPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.screenplay?.status).toBe('ready')
    expect(serviceMock.confirmProjectEditStylePreview).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      stylePreviewId: 'style-preview-1',
      aspectRatio: '21:9',
    })
  })

  it('POST /api/projects/[projectId]/edit-script/screenplay -> requires duration tier and aspect ratio', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/screenplay',
      method: 'POST',
      headers: { 'accept-language': 'zh' },
      body: {
        episodeId: 'episode-1',
        prompt: 'one minute sci-fi',
        durationTier: 'medium',
        aspectRatio: '16:9',
      },
    })

    const response = await editScreenplayPost(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      async: true,
      taskId: 'task-screenplay-1',
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      taskType: TASK_TYPE.EDIT_SCREENPLAY_GENERATE,
      targetType: 'ProjectEditScreenplay',
      targetId: 'screenplay-1',
    }))
    expect(serviceMock.generateProjectEditScreenplay).not.toHaveBeenCalled()
    expect(taskSubmissionMock.submitProjectEditScreenplayGenerationTask).toHaveBeenCalledWith(expect.objectContaining({
      request,
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: 'one minute sci-fi',
      durationTier: 'medium',
      aspectRatio: '16:9',
    }))
  })

  it('POST /api/projects/[projectId]/edit-script/screenplay -> rejects old fixed-second payloads', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/screenplay',
      method: 'POST',
      body: {
        episodeId: 'episode-1',
        prompt: 'one minute sci-fi',
        durationSeconds: 60,
        aspectRatio: '16:9',
      },
    })

    const response = await editScreenplayPost(request, { params: Promise.resolve({ projectId: 'project-1' }) })

    expect(response.status).toBe(400)
    expect(serviceMock.generateProjectEditScreenplay).not.toHaveBeenCalled()
    expect(taskSubmissionMock.submitProjectEditScreenplayGenerationTask).not.toHaveBeenCalled()
  })

  it('GET /api/projects/[projectId]/edit-script -> returns the persisted edit table and requirements', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script?episodeId=episode-1',
      method: 'GET',
    })

    const response = await editScriptGet(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.title).toBe('Orbital Silence')
    expect(serviceMock.readProjectEditScript).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })
  })

  it('POST /api/projects/[projectId]/edit-script/assets/generate -> generates screenplay assets without an edit table id', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/assets/generate',
      method: 'POST',
      headers: { 'accept-language': 'zh' },
      body: {
        episodeId: 'episode-1',
      },
    })

    const response = await editScriptAssetsGeneratePost(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual(expect.objectContaining({
      success: true,
      async: true,
      total: 1,
      taskIds: ['task-asset-1'],
    }))
    expect(payload.submittedTasks).toEqual([expect.objectContaining({
      taskId: 'task-asset-1',
      targetType: 'CharacterAppearance',
      targetId: 'appearance-1',
    })])
    expect(screenplayAssetsMock.generateScreenplayAssets).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    }))
  })

  it('POST /api/projects/[projectId]/edit-script/storyboard/generate -> submits direct screenplay storyboard generation', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script/storyboard/generate',
      method: 'POST',
      headers: { 'accept-language': 'zh' },
      body: {
        episodeId: 'episode-1',
      },
    })

    const response = await editScriptStoryboardGeneratePost(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload).toEqual({
      success: true,
      async: true,
      taskId: 'task-panels-1',
      runId: null,
      status: 'queued',
      deduped: false,
      screenplayId: 'screenplay-1',
    })
    expect(screenplayStoryboardMock.submitScreenplayStoryboardTask).toHaveBeenCalledWith(expect.objectContaining({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    }))
  })

  it('PATCH /api/projects/[projectId]/edit-script -> updates one video arrangement prompt', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
        blockIndex: 0,
        prompt: 'updated combined prompt',
      },
    })

    const response = await editScriptPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.videoBlocks[0].prompt).toBe('updated combined prompt')
    expect(serviceMock.updateProjectEditScriptVideoBlockPrompt).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      blockIndex: 0,
      prompt: 'updated combined prompt',
    })
  })

  it('PATCH /api/projects/[projectId]/edit-script -> validates and persists the Kernel Compiler document', async () => {
    const kernelCompiler = createKernelCompilerFixture()
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'PATCH',
      body: {
        operation: 'setKernelCompiler',
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
        kernelCompiler,
      },
    })

    const response = await editScriptPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.kernelCompiler.stage).toBe('kernel_compiler')
    expect(serviceMock.updateProjectEditScriptKernelCompiler).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      kernelCompiler,
    })
  })

  it('PATCH /api/projects/[projectId]/edit-script -> merges two adjacent video blocks', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'PATCH',
      headers: { 'accept-language': 'zh' },
      body: {
        operation: 'mergeVideoBlocks',
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
        leftBlockIndex: 0,
        rightBlockIndex: 1,
      },
    })

    const response = await editScriptPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.videoBlocks[0].shotNumbers).toEqual([1, 2, 3, 4])
    expect(videoBlockMergeMock.mergeProjectEditScriptVideoBlocks).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      leftBlockIndex: 0,
      rightBlockIndex: 1,
      userId: 'user-1',
      locale: 'zh',
    })
  })

  it('PATCH /api/projects/[projectId]/edit-script -> moves adjacent video block boundary shots and rewrites affected prompts', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'PATCH',
      headers: { 'accept-language': 'zh' },
      body: {
        operation: 'arrangeVideoBlocks',
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
        blocks: [
          { shotNumbers: [1, 2, 3] },
          { shotNumbers: [4] },
        ],
      },
    })

    const response = await editScriptPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.videoBlocks[0].shotNumbers).toEqual([1, 2, 3])
    expect(videoBlockArrangementMock.arrangeProjectEditScriptVideoBlocks).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      blocks: [
        { shotNumbers: [1, 2, 3] },
        { shotNumbers: [4] },
      ],
      userId: 'user-1',
      locale: 'zh',
    })
  })

  it('PATCH /api/projects/[projectId]/edit-script -> updates one required asset prompt', async () => {
    const request = buildMockRequest({
      path: '/api/projects/project-1/edit-script',
      method: 'PATCH',
      body: {
        episodeId: 'episode-1',
        editScriptId: 'edit-1',
        requirementId: 'req-1',
        description: 'updated asset prompt',
      },
    })

    const response = await editScriptPatch(request, { params: Promise.resolve({ projectId: 'project-1' }) })
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.editScript.requirements[0].description).toBe('updated asset prompt')
    expect(serviceMock.updateProjectEditScriptAssetRequirementDescription).toHaveBeenCalledWith({
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScriptId: 'edit-1',
      requirementId: 'req-1',
      description: 'updated asset prompt',
    })
  })
})
