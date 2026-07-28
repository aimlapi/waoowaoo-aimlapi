import { requireWorkspaceResourceRefs } from '@/lib/workspace-resource/resource-impact'
import type { ProjectAgentCommand } from '@/lib/project-agent/command-service'

export const OUTBOX_COMMAND_KIND = {
  TASK_ENQUEUE: 'task.enqueue',
  TASK_LIFECYCLE_BROADCAST: 'task.lifecycle.broadcast',
  PROJECT_AGENT_EXECUTE_COMMAND: 'project_agent.execute_command',
  PROJECT_AGENT_CONTINUE_WAIT: 'project_agent.continue_wait',
  PROJECT_AGENT_SESSION_BROADCAST: 'project_agent.session_broadcast',
  WORKSPACE_RESOURCE_BROADCAST: 'workspace_resource.broadcast',
} as const

export type OutboxCommandKind = (typeof OUTBOX_COMMAND_KIND)[keyof typeof OUTBOX_COMMAND_KIND]

export type TaskLifecycleBroadcastCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.TASK_LIFECYCLE_BROADCAST
  eventId: number
  taskId: string
}

export type TaskEnqueueCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.TASK_ENQUEUE
  taskId: string
  operationExecutionId: string | null
}

export type ProjectAgentContinueWaitCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.PROJECT_AGENT_CONTINUE_WAIT
  waitId: string
  runId: string
  expectedRunVersion: number
  expectedEventSeq: string
}

export type ProjectAgentExecuteCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.PROJECT_AGENT_EXECUTE_COMMAND
  requestId: string
  executionRunId: string
  projectId: string
  userId: string
  episodeId: string | null
  assistantId: 'workspace-command'
  context: unknown
  locale: string | null
  command: ProjectAgentCommand
}

export type ProjectAgentSessionBroadcastCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.PROJECT_AGENT_SESSION_BROADCAST
  projectAgentEventId: string
}

export type WorkspaceResourceBroadcastCommand = {
  kind: typeof OUTBOX_COMMAND_KIND.WORKSPACE_RESOURCE_BROADCAST
  projectId: string
  userId: string
  operationId: string
  affectedResources: import('@/lib/task/types').WorkspaceResourceRef[]
}

export type OutboxCommandPayload =
  | TaskEnqueueCommand
  | TaskLifecycleBroadcastCommand
  | ProjectAgentExecuteCommand
  | ProjectAgentContinueWaitCommand
  | ProjectAgentSessionBroadcastCommand
  | WorkspaceResourceBroadcastCommand

export type CreateOutboxCommandInput = {
  idempotencyKey: string
  aggregateType: 'task' | 'project_agent_command' | 'project_agent_wait' | 'project_agent_event' | 'workspace_resource'
  aggregateId: string
  payload: OutboxCommandPayload
  availableAt?: Date
}

export class OutboxPermanentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'OutboxPermanentError'
  }
}

function readRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('OUTBOX_COMMAND_PAYLOAD_INVALID')
  }
  return value as Record<string, unknown>
}

function readRequiredString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`OUTBOX_COMMAND_${key.toUpperCase()}_INVALID`)
  }
  return value
}

function readNullableString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key]
  if (value === null) return null
  return readRequiredString(record, key)
}

function readProjectAgentCommand(record: Record<string, unknown>): ProjectAgentCommand {
  const value = readRecord(record.command)
  const kind = readRequiredString(value, 'kind')
  if (kind === 'user_turn') {
    const message = readRecord(value.message)
    const id = readRequiredString(message, 'id')
    if (message.role !== 'user' || !Array.isArray(message.parts)) {
      throw new Error('OUTBOX_COMMAND_PROJECT_AGENT_USER_MESSAGE_INVALID')
    }
    return {
      kind,
      message: {
        ...message,
        id,
        role: 'user',
        parts: [...message.parts],
      },
    } as ProjectAgentCommand
  }
  const action = readRecord(value.action)
  const runId = readRequiredString(action, 'runId')
  const interruptionId = readRequiredString(action, 'interruptionId')
  const visibleUserText = readNullableString(value, 'visibleUserText')
  if (kind === 'approval_response') {
    if (action.type !== kind || typeof action.approved !== 'boolean') {
      throw new Error('OUTBOX_COMMAND_PROJECT_AGENT_APPROVAL_INVALID')
    }
    return {
      kind,
      action: {
        type: kind,
        runId,
        interruptionId,
        approved: action.approved,
        reason: readNullableString(action, 'reason'),
      },
      visibleUserText,
    }
  }
  if (kind === 'choice_response') {
    if (action.type !== kind) {
      throw new Error('OUTBOX_COMMAND_PROJECT_AGENT_CHOICE_INVALID')
    }
    return {
      kind,
      action: {
        type: kind,
        runId,
        interruptionId,
        cardId: readRequiredString(action, 'cardId'),
        toolCallId: readRequiredString(action, 'toolCallId'),
        output: readRecord(action.output),
      },
      visibleUserText,
    }
  }
  throw new Error(`OUTBOX_COMMAND_PROJECT_AGENT_COMMAND_KIND_UNSUPPORTED:${kind}`)
}

function readRequiredInteger(record: Record<string, unknown>, key: string): number {
  const value = record[key]
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    throw new Error(`OUTBOX_COMMAND_${key.toUpperCase()}_INVALID`)
  }
  return value
}

function readNonNegativeInteger(record: Record<string, unknown>, key: string): number {
  const value = readRequiredInteger(record, key)
  if (value < 0) throw new Error(`OUTBOX_COMMAND_${key.toUpperCase()}_NEGATIVE`)
  return value
}

function readPositiveInteger(record: Record<string, unknown>, key: string): number {
  const value = readRequiredInteger(record, key)
  if (value <= 0) throw new Error(`OUTBOX_COMMAND_${key.toUpperCase()}_NOT_POSITIVE`)
  return value
}

function readCanonicalBigIntString(record: Record<string, unknown>, key: string): string {
  const value = readRequiredString(record, key)
  if (!/^(0|[1-9]\d*)$/.test(value)) {
    throw new Error(`OUTBOX_COMMAND_${key.toUpperCase()}_INVALID_BIGINT`)
  }
  return value
}

export function parseOutboxCommandPayload(value: unknown): OutboxCommandPayload {
  const record = readRecord(value)
  const kind = readRequiredString(record, 'kind')

  switch (kind) {
    case OUTBOX_COMMAND_KIND.TASK_ENQUEUE:
      return {
        kind,
        taskId: readRequiredString(record, 'taskId'),
        operationExecutionId: readNullableString(record, 'operationExecutionId'),
      }
    case OUTBOX_COMMAND_KIND.TASK_LIFECYCLE_BROADCAST:
      return {
        kind,
        eventId: readPositiveInteger(record, 'eventId'),
        taskId: readRequiredString(record, 'taskId'),
      }
    case OUTBOX_COMMAND_KIND.PROJECT_AGENT_EXECUTE_COMMAND: {
      const assistantId = readRequiredString(record, 'assistantId')
      if (assistantId !== 'workspace-command') {
        throw new Error(`OUTBOX_COMMAND_ASSISTANT_ID_UNSUPPORTED:${assistantId}`)
      }
      return {
        kind,
        requestId: readRequiredString(record, 'requestId'),
        executionRunId: readRequiredString(record, 'executionRunId'),
        projectId: readRequiredString(record, 'projectId'),
        userId: readRequiredString(record, 'userId'),
        episodeId: readNullableString(record, 'episodeId'),
        assistantId,
        context: record.context,
        locale: readNullableString(record, 'locale'),
        command: readProjectAgentCommand(record),
      }
    }
    case OUTBOX_COMMAND_KIND.PROJECT_AGENT_CONTINUE_WAIT:
      return {
        kind,
        waitId: readRequiredString(record, 'waitId'),
        runId: readRequiredString(record, 'runId'),
        expectedRunVersion: readNonNegativeInteger(record, 'expectedRunVersion'),
        expectedEventSeq: readCanonicalBigIntString(record, 'expectedEventSeq'),
      }
    case OUTBOX_COMMAND_KIND.PROJECT_AGENT_SESSION_BROADCAST:
      return {
        kind,
        projectAgentEventId: readCanonicalBigIntString(record, 'projectAgentEventId'),
      }
    case OUTBOX_COMMAND_KIND.WORKSPACE_RESOURCE_BROADCAST: {
      const projectId = readRequiredString(record, 'projectId')
      const affectedResources = requireWorkspaceResourceRefs(record.affectedResources)
      if (affectedResources.length === 0) {
        throw new Error('OUTBOX_COMMAND_AFFECTED_RESOURCES_EMPTY')
      }
      if (affectedResources.some((ref) => ref.projectId !== projectId)) {
        throw new Error('OUTBOX_COMMAND_AFFECTED_RESOURCES_PROJECT_MISMATCH')
      }
      return {
        kind,
        projectId,
        userId: readRequiredString(record, 'userId'),
        operationId: readRequiredString(record, 'operationId'),
        affectedResources,
      }
    }
    default:
      throw new Error(`OUTBOX_COMMAND_KIND_UNSUPPORTED:${kind}`)
  }
}
