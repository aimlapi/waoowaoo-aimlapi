import { describe, expect, it } from 'vitest'
import {
  OUTBOX_COMMAND_KIND,
  parseOutboxCommandPayload,
} from '@/lib/outbox/types'
import { createProjectAgentCommandSubmissionIdentity } from '@/lib/project-agent/command-submission'

function basePayload() {
  return {
    kind: OUTBOX_COMMAND_KIND.PROJECT_AGENT_EXECUTE_COMMAND,
    requestId: 'request-1',
    executionRunId: 'run-1',
    projectId: 'project-1',
    userId: 'user-1',
    episodeId: null,
    assistantId: 'workspace-command',
    context: { locale: 'zh' },
    locale: 'zh',
  }
}

describe('persisted project agent command parser', () => {
  it('gives one business command a stable identity across HTTP retries', () => {
    const input = {
      scope: {
        projectId: 'project-1',
        userId: 'user-1',
        episodeId: 'episode-1',
        assistantId: 'workspace-command' as const,
      },
      command: {
        kind: 'user_turn' as const,
        message: {
          id: 'message-1',
          role: 'user' as const,
          parts: [{ type: 'text' as const, text: '继续后续步骤' }],
        },
      },
    }

    const identity = createProjectAgentCommandSubmissionIdentity(input)
    expect(identity).toEqual(createProjectAgentCommandSubmissionIdentity(input))
    expect(identity.requestId).toHaveLength(36)
    expect(identity.executionRunId).toHaveLength(36)
    expect(identity.idempotencyKey.length).toBeLessThanOrEqual(191)
    expect(createProjectAgentCommandSubmissionIdentity({
      ...input,
      command: {
        ...input.command,
        message: {
          ...input.command.message,
          id: 'message-2',
        },
      },
    })).not.toEqual(createProjectAgentCommandSubmissionIdentity(input))
  })

  it('round-trips one immutable user turn for worker execution', () => {
    const payload = parseOutboxCommandPayload({
      ...basePayload(),
      command: {
        kind: 'user_turn',
        message: {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: '继续后续步骤' }],
        },
      },
    })

    expect(payload).toMatchObject({
      kind: OUTBOX_COMMAND_KIND.PROJECT_AGENT_EXECUTE_COMMAND,
      requestId: 'request-1',
      executionRunId: 'run-1',
      command: {
        kind: 'user_turn',
        message: {
          id: 'message-1',
          role: 'user',
        },
      },
    })
  })

  it('rejects a persisted approval without its exact decision identity', () => {
    expect(() => parseOutboxCommandPayload({
      ...basePayload(),
      command: {
        kind: 'approval_response',
        action: {
          type: 'approval_response',
          runId: 'run-1',
          interruptionId: '',
          approved: false,
          reason: null,
        },
        visibleUserText: null,
      },
    })).toThrow('OUTBOX_COMMAND_INTERRUPTIONID_INVALID')
  })

  it('rejects a command whose Assistant identity is not the registered owner', () => {
    expect(() => parseOutboxCommandPayload({
      ...basePayload(),
      assistantId: 'another-assistant',
      command: {
        kind: 'user_turn',
        message: {
          id: 'message-1',
          role: 'user',
          parts: [{ type: 'text', text: 'continue' }],
        },
      },
    })).toThrow('OUTBOX_COMMAND_ASSISTANT_ID_UNSUPPORTED')
  })
})
