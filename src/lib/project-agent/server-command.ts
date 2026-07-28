import { prisma } from '@/lib/prisma'
import {
  OutboxPermanentError,
  type ProjectAgentExecuteCommand,
} from '@/lib/outbox/types'
import { executeProjectAgentCommand } from './command-service'
import { createProjectAgentWorkerRequest } from './command-submission'
import {
  createProjectAgentExecutionSegment,
  projectAgentExecutionStartedIdempotencyKey,
} from './execution-segment'
import { createProjectAgentRunFence } from './run-fence'
import {
  createProjectAgentUserTurnRun,
  getProjectAgentRun,
  settleProjectAgentRunFailureWithMessage,
} from './runs'
import { createProjectAgentRunStreamPublisher } from './run-stream-event'

async function drainResponseBody(response: Response): Promise<void> {
  if (!response.body) return
  const reader = response.body.getReader()
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) return
    }
  } finally {
    reader.releaseLock()
  }
}

function resolveExecutionSegmentId(command: ProjectAgentExecuteCommand): string {
  switch (command.command.kind) {
    case 'user_turn':
      return createProjectAgentExecutionSegment({
        kind: 'user_turn',
        runId: command.executionRunId,
      }).id
    case 'approval_response':
    case 'choice_response':
      return createProjectAgentExecutionSegment({
        kind: command.command.kind,
        interruptionId: command.command.action.interruptionId,
      }).id
  }
}

async function hasSettledOrPreviouslyStartedExecution(
  command: ProjectAgentExecuteCommand,
): Promise<boolean> {
  const segmentId = resolveExecutionSegmentId(command)
  const event = await prisma.projectAgentEvent.findUnique({
    where: {
      idempotencyKey: projectAgentExecutionStartedIdempotencyKey(segmentId),
    },
    select: { runId: true },
  })
  if (!event) return false
  if (!event.runId) {
    throw new OutboxPermanentError(
      `PROJECT_AGENT_EXECUTION_EVENT_RUN_ID_MISSING:${segmentId}`,
    )
  }
  const run = await getProjectAgentRun({
    projectId: command.projectId,
    userId: command.userId,
    episodeId: command.episodeId,
    assistantId: command.assistantId,
    runId: event.runId,
  })
  if (run && run.status !== 'running') return true
  throw new OutboxPermanentError(
    `PROJECT_AGENT_COMMAND_OUTCOME_UNKNOWN:${segmentId}:${event.runId}`,
  )
}

/**
 * Executes one durable HTTP-submitted command. Outbox claim/lease owns retries;
 * the persisted execution-segment fence prevents a second model/tool attempt
 * after an ambiguous worker crash.
 */
export async function runProjectAgentExecuteCommand(
  command: ProjectAgentExecuteCommand,
  outboxId: string,
): Promise<void> {
  if (await hasSettledOrPreviouslyStartedExecution(command)) return
  const streamPublisher = createProjectAgentRunStreamPublisher({
    projectId: command.projectId,
    userId: command.userId,
    episodeId: command.episodeId,
    assistantId: command.assistantId,
    outboxId,
  })
  const response = await executeProjectAgentCommand({
    request: createProjectAgentWorkerRequest({ command, outboxId }),
    scope: {
      projectId: command.projectId,
      userId: command.userId,
      episodeId: command.episodeId,
      assistantId: command.assistantId,
    },
    context: command.context,
    locale: command.locale,
    command: command.command,
    executionRunId: command.executionRunId,
    onUiChunk: streamPublisher.write,
  })
  try {
    await drainResponseBody(response)
  } finally {
    await streamPublisher.flush()
  }
}

export async function settleProjectAgentCommandDeliveryExhausted(
  command: ProjectAgentExecuteCommand,
): Promise<void> {
  const segmentId = resolveExecutionSegmentId(command)
  const startedEvent = await prisma.projectAgentEvent.findUnique({
    where: {
      idempotencyKey: projectAgentExecutionStartedIdempotencyKey(segmentId),
    },
    select: { runId: true },
  })
  const candidateRunId = startedEvent?.runId
    ?? (command.command.kind === 'user_turn'
      ? command.executionRunId
      : command.command.action.runId)
  let run = await getProjectAgentRun({
    projectId: command.projectId,
    userId: command.userId,
    episodeId: command.episodeId,
    assistantId: command.assistantId,
    runId: candidateRunId,
  })
  if (!run && command.command.kind === 'user_turn') {
    const created = await createProjectAgentUserTurnRun({
      projectId: command.projectId,
      userId: command.userId,
      episodeId: command.episodeId,
      assistantId: command.assistantId,
      runId: command.executionRunId,
      requestId: command.requestId,
      message: command.command.message,
    })
    run = created.run
  }
  if (!run || run.status !== 'running') return
  await settleProjectAgentRunFailureWithMessage({
    runFence: createProjectAgentRunFence(run),
    controlKind: command.command.kind,
    requestId: command.requestId,
    status: 'failed',
    stopReason: startedEvent ? 'command_outcome_unknown' : 'command_delivery_exhausted',
    errorCode: startedEvent
      ? 'PROJECT_AGENT_COMMAND_OUTCOME_UNKNOWN'
      : 'PROJECT_AGENT_COMMAND_DELIVERY_EXHAUSTED',
  })
}
