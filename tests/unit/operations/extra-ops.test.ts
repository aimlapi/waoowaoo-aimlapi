import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { createExtraOperations } from '@/lib/operations/domains/extra/extra-ops'

const characterStyleTestSubmitMock = vi.hoisted(() => ({
  submitCharacterStyleTestTask: vi.fn(async () => ({
    success: true,
    async: true,
    taskId: 'task-character-casting-1',
    runId: 'run-1',
    status: 'queued',
    deduped: false,
  })),
}))

vi.mock('@/lib/character-style-test/submit', () => characterStyleTestSubmitMock)

function buildContext() {
  return {
    request: new Request('http://localhost') as unknown as NextRequest,
    userId: 'user-1',
    projectId: 'project-1',
    source: 'assistant-panel',
    context: {
      locale: 'zh',
      episodeId: 'episode-1',
    },
    writer: null,
  }
}

describe('extra operations', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('submits character casting tests as project-scoped casting_photo tasks', async () => {
    const operations = createExtraOperations()

    const result = await operations.generate_character_casting_test?.execute(buildContext(), {
      confirmed: true,
      characterName: '林澈',
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      characterRequest: '二十七岁程序员，黑色T恤，灰色连帽衫，长期熬夜但温柔',
    })

    expect(result).toEqual({
      success: true,
      async: true,
      taskId: 'task-character-casting-1',
      runId: 'run-1',
      status: 'queued',
      deduped: false,
    })
    expect(characterStyleTestSubmitMock.submitCharacterStyleTestTask).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      characterName: '林澈',
      characterId: 'character-1',
      appearanceId: 'appearance-1',
      characterRequest: '二十七岁程序员，黑色T恤，灰色连帽衫，长期熬夜但温柔',
      promptMode: 'casting_photo',
      castingCandidateCount: 3,
      targetId: 'appearance-1',
      operationId: 'generate_character_casting_test',
      operationSource: 'assistant-panel',
      operationConfirmed: true,
    }))
  })
})
