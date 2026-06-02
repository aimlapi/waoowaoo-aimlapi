import { describe, expect, it } from 'vitest'
import {
  isDevAbTerminalStatus,
  parseDevAbSubmitResponse,
  parseDevAbTaskDetail,
} from '@/lib/dev-ab-test/task-detail'

describe('dev A/B task detail parsing', () => {
  it('extracts task result and error fields from the API task envelope', () => {
    const detail = parseDevAbTaskDetail({
      task: {
        id: 'task-1',
        status: 'completed',
        progress: 100,
        result: {
          imageUrl: 'https://signed.example/image.jpg',
          prompt: 'full prompt',
          aspectRatio: '3:4',
          styleSummary: 'style summary',
        },
        error: {
          message: 'ignored after completion',
        },
      },
    })

    expect(detail?.id).toBe('task-1')
    expect(detail?.status).toBe('completed')
    expect(detail?.progress).toBe(100)
    expect(detail?.result?.imageUrl).toBe('https://signed.example/image.jpg')
    expect(detail?.result?.prompt).toBe('full prompt')
    expect(detail?.error?.message).toBe('ignored after completion')
  })

  it('rejects malformed task envelopes and submit responses explicitly', () => {
    expect(parseDevAbTaskDetail({ id: 'task-without-envelope' })).toBeNull()
    expect(parseDevAbSubmitResponse({ taskId: 123 })).toEqual({ taskId: '' })
  })

  it('marks completed, failed, and canceled tasks as terminal', () => {
    expect(isDevAbTerminalStatus('completed')).toBe(true)
    expect(isDevAbTerminalStatus('failed')).toBe(true)
    expect(isDevAbTerminalStatus('canceled')).toBe(true)
    expect(isDevAbTerminalStatus('processing')).toBe(false)
  })
})
