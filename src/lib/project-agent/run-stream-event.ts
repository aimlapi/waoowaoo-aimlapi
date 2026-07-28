import type { UIMessageChunk } from 'ai'
import { createScopedLogger } from '@/lib/logging/core'
import { redis } from '@/lib/redis'
import { getProjectChannel } from '@/lib/task/publisher'
import {
  WORKSPACE_SSE_EVENT_TYPE,
  type AssistantRunStreamSSEEvent,
} from '@/lib/task/types'

export type ProjectAgentRunStreamProjection = {
  runId: string
  requestId: string
  messageId: string
  chunk: UIMessageChunk
}

/**
 * Publishes an ordered, transient projection of a durable Assistant Run.
 * Redis/SSE delivery is deliberately not a lifecycle authority: a failed
 * projection may hide live deltas, but it cannot fail or cancel the Run.
 */
export function createProjectAgentRunStreamPublisher(params: {
  projectId: string
  userId: string
  episodeId: string | null
  assistantId: 'workspace-command'
  outboxId: string
}): {
  write: (projection: ProjectAgentRunStreamProjection) => void
  flush: () => Promise<void>
} {
  const logger = createScopedLogger({
    module: 'project-agent',
    action: 'assistant.run.stream.publish',
    projectId: params.projectId,
    userId: params.userId,
  })
  let sequence = 0
  let pending = Promise.resolve()

  return {
    write(projection) {
      sequence += 1
      const eventSequence = sequence
      const event: AssistantRunStreamSSEEvent = {
        id: `assistant-stream:${projection.runId}:${String(eventSequence)}`,
        type: WORKSPACE_SSE_EVENT_TYPE.ASSISTANT_RUN_STREAM,
        projectId: params.projectId,
        userId: params.userId,
        ts: new Date().toISOString(),
        episodeId: params.episodeId,
        assistantId: params.assistantId,
        runId: projection.runId,
        requestId: projection.requestId,
        messageId: projection.messageId,
        sequence: eventSequence,
        chunk: projection.chunk,
      }
      pending = pending
        .then(async () => {
          await redis.publish(getProjectChannel(params.projectId), JSON.stringify(event))
        })
        .catch((error: unknown) => {
          logger.error({
            action: 'assistant.run.stream.publish.failed',
            message: 'Assistant live projection publish failed',
            error: error instanceof Error
              ? { name: error.name, message: error.message, stack: error.stack }
              : { message: String(error) },
            details: {
              outboxId: params.outboxId,
              runId: projection.runId,
              requestId: projection.requestId,
              sequence: eventSequence,
            },
          })
        })
    },
    async flush() {
      await pending
    },
  }
}
