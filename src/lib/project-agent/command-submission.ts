import {
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageChunk,
} from 'ai'
import { createHash } from 'node:crypto'
import { NextRequest } from 'next/server'
import { createOutboxCommandInTransaction } from '@/lib/outbox/repository'
import {
  OUTBOX_COMMAND_KIND,
  type ProjectAgentExecuteCommand,
} from '@/lib/outbox/types'
import { prisma } from '@/lib/prisma'
import type {
  ExecuteProjectAgentCommandInput,
  ProjectAgentCommand,
} from './command-service'

function readControlKind(command: ProjectAgentCommand): 'user_turn' | 'approval_response' | 'choice_response' {
  return command.kind
}

function formatDigestAsUuid(digest: string): string {
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    digest.slice(12, 16),
    digest.slice(16, 20),
    digest.slice(20, 32),
  ].join('-')
}

export function createProjectAgentCommandSubmissionIdentity(input: Pick<
  ExecuteProjectAgentCommandInput,
  'scope' | 'command'
>): {
  idempotencyKey: string
  requestId: string
  executionRunId: string
} {
  const commandIdentity = input.command.kind === 'user_turn'
    ? input.command.message.id
    : input.command.action.interruptionId
  const digest = createHash('sha256')
    .update(JSON.stringify({
      projectId: input.scope.projectId,
      userId: input.scope.userId,
      episodeId: input.scope.episodeId,
      assistantId: input.scope.assistantId,
      commandKind: input.command.kind,
      commandIdentity,
    }))
    .digest('hex')
  const requestId = formatDigestAsUuid(createHash('sha256').update(`${digest}:request`).digest('hex'))
  const executionRunId = formatDigestAsUuid(createHash('sha256').update(`${digest}:run`).digest('hex'))
  return {
    idempotencyKey: `project-agent-command:${digest}`,
    requestId,
    executionRunId,
  }
}

function createProjectAgentCommandAcceptedResponse(params: {
  requestId: string
  runId: string
  command: ProjectAgentCommand
}): Response {
  const messageId = `workspace-assistant-command-accepted:${params.requestId}`
  const stream = createUIMessageStream({
    generateId: () => messageId,
    execute: ({ writer }) => {
      writer.write({
        type: 'start',
        messageId,
      })
      writer.write({
        type: 'data-agent-run',
        data: {
          runId: params.runId,
          requestId: params.requestId,
          status: 'running',
          controlKind: readControlKind(params.command),
          stopReason: null,
        },
        transient: true,
      } as UIMessageChunk)
      writer.write({
        type: 'finish',
        finishReason: 'stop',
      })
    },
  })
  const response = createUIMessageStreamResponse({
    status: 202,
    stream,
  })
  response.headers.set('x-request-id', params.requestId)
  return response
}

/**
 * The only HTTP-side Assistant command mutation. It persists an immutable
 * command before acknowledging the client; model execution belongs exclusively
 * to the Outbox worker.
 */
export async function submitProjectAgentCommand(
  input: ExecuteProjectAgentCommandInput,
): Promise<Response> {
  const identity = createProjectAgentCommandSubmissionIdentity(input)
  const payload: ProjectAgentExecuteCommand = {
    kind: OUTBOX_COMMAND_KIND.PROJECT_AGENT_EXECUTE_COMMAND,
    requestId: identity.requestId,
    executionRunId: identity.executionRunId,
    projectId: input.scope.projectId,
    userId: input.scope.userId,
    episodeId: input.scope.episodeId,
    assistantId: input.scope.assistantId,
    context: input.context,
    locale: input.locale,
    command: input.command,
  }
  await prisma.$transaction(async (tx) => {
    await createOutboxCommandInTransaction(tx, {
      idempotencyKey: identity.idempotencyKey,
      aggregateType: 'project_agent_command',
      aggregateId: identity.executionRunId,
      payload,
    })
  })
  return createProjectAgentCommandAcceptedResponse({
    requestId: identity.requestId,
    runId: identity.executionRunId,
    command: input.command,
  })
}

export function createProjectAgentWorkerRequest(params: {
  command: ProjectAgentExecuteCommand
  outboxId: string
}): NextRequest {
  return new NextRequest(
    `http://localhost/api/projects/${params.command.projectId}/assistant/worker-command`,
    {
      method: 'POST',
      headers: {
        'x-project-agent-worker-command': '1',
        'x-request-id': params.command.requestId,
        'x-project-agent-outbox-id': params.outboxId,
      },
    },
  )
}
