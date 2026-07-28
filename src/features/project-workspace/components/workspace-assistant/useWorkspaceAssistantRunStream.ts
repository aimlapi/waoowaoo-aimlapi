'use client'

import {
  readUIMessageStream,
  type UIMessage,
  type UIMessageChunk,
} from 'ai'
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  WORKSPACE_SSE_EVENT_TYPE,
  type AssistantRunStreamSSEEvent,
} from '@/lib/task/types'
import { useWorkspaceProvider } from '../../WorkspaceProvider'

interface WorkspaceAssistantRunStreamConsumer {
  requestId: string
  messageId: string
  nextSequence: number
  controller: ReadableStreamDefaultController<UIMessageChunk>
}

function isTerminalAssistantRunStreamChunk(chunk: UIMessageChunk): boolean {
  const record = chunk as { type?: unknown; data?: unknown }
  if (record.type === 'finish') return true
  if (
    record.type !== 'data-agent-run'
    || !record.data
    || typeof record.data !== 'object'
    || Array.isArray(record.data)
  ) return false
  return (record.data as { status?: unknown }).status !== 'running'
}

export function useWorkspaceAssistantRunStream(params: {
  projectId: string
  episodeId?: string
  mergeMessage: (message: UIMessage) => void
  refreshSessionState: () => Promise<unknown>
}): {
  activeRunId: string | null
  ignoreRun: (runId: string) => void
  confirmRunStopped: (runId: string) => void
  resumeRun: (runId: string) => void
} {
  const { subscribeTaskEvents } = useWorkspaceProvider()
  const consumersRef = useRef<Map<string, WorkspaceAssistantRunStreamConsumer>>(new Map())
  const ignoredRunIdsRef = useRef<Set<string>>(new Set())
  const mergeMessageRef = useRef(params.mergeMessage)
  const refreshSessionStateRef = useRef(params.refreshSessionState)
  const [activeRunId, setActiveRunId] = useState<string | null>(null)

  mergeMessageRef.current = params.mergeMessage
  refreshSessionStateRef.current = params.refreshSessionState

  const ignoreRun = useCallback((runId: string): void => {
    ignoredRunIdsRef.current.add(runId)
    const consumer = consumersRef.current.get(runId)
    consumersRef.current.delete(runId)
    try {
      consumer?.controller.close()
    } catch {}
  }, [])

  const confirmRunStopped = useCallback((runId: string): void => {
    setActiveRunId((current) => current === runId ? null : current)
  }, [])

  const resumeRun = useCallback((runId: string): void => {
    ignoredRunIdsRef.current.delete(runId)
  }, [])

  useEffect(() => {
    const consumers = consumersRef.current
    const ignoredRunIds = ignoredRunIdsRef.current
    const closeConsumer = (runId: string): void => {
      const consumer = consumers.get(runId)
      if (!consumer) return
      consumers.delete(runId)
      try {
        consumer.controller.close()
      } catch {}
    }

    const createConsumer = (event: AssistantRunStreamSSEEvent): WorkspaceAssistantRunStreamConsumer => {
      let controller: ReadableStreamDefaultController<UIMessageChunk> | null = null
      const stream = new ReadableStream<UIMessageChunk>({
        start(nextController) {
          controller = nextController
        },
      })
      if (!controller) throw new Error('PROJECT_AGENT_RUN_STREAM_CONTROLLER_MISSING')
      const consumer: WorkspaceAssistantRunStreamConsumer = {
        requestId: event.requestId,
        messageId: event.messageId,
        nextSequence: 1,
        controller,
      }
      consumers.set(event.runId, consumer)
      void (async () => {
        try {
          for await (const message of readUIMessageStream({
            stream,
            terminateOnError: true,
            message: {
              id: event.messageId,
              role: 'assistant',
              parts: [],
            },
          })) {
            mergeMessageRef.current(message)
          }
        } catch {
          await refreshSessionStateRef.current().catch(() => null)
        } finally {
          if (consumers.get(event.runId) === consumer) {
            consumers.delete(event.runId)
          }
        }
      })()
      return consumer
    }

    const unsubscribe = subscribeTaskEvents((workspaceEvent) => {
      if (workspaceEvent.type !== WORKSPACE_SSE_EVENT_TYPE.ASSISTANT_RUN_STREAM) return
      const event: AssistantRunStreamSSEEvent = workspaceEvent
      if (event.projectId !== params.projectId) return
      if (event.assistantId !== 'workspace-command') return
      if ((event.episodeId ?? undefined) !== (params.episodeId ?? undefined)) return
      if (ignoredRunIds.has(event.runId)) return

      let consumer = consumers.get(event.runId)
      if (!consumer) {
        if (event.sequence !== 1) {
          void refreshSessionStateRef.current()
          return
        }
        consumer = createConsumer(event)
      }
      if (
        consumer.requestId !== event.requestId
        || consumer.messageId !== event.messageId
        || consumer.nextSequence !== event.sequence
      ) {
        closeConsumer(event.runId)
        setActiveRunId((current) => current === event.runId ? null : current)
        void refreshSessionStateRef.current()
        return
      }

      consumer.nextSequence += 1
      consumer.controller.enqueue(event.chunk)
      if (isTerminalAssistantRunStreamChunk(event.chunk)) {
        closeConsumer(event.runId)
        setActiveRunId((current) => current === event.runId ? null : current)
      } else {
        setActiveRunId(event.runId)
      }
    })

    return () => {
      unsubscribe()
      for (const runId of consumers.keys()) {
        closeConsumer(runId)
      }
      ignoredRunIds.clear()
      setActiveRunId(null)
    }
  }, [
    params.episodeId,
    params.projectId,
    subscribeTaskEvents,
  ])

  return {
    activeRunId,
    ignoreRun,
    confirmRunStopped,
    resumeRun,
  }
}
