import type { AssistantRuntime } from '@assistant-ui/react'
import type { ChatStatus, UIMessage } from 'ai'
import type {
  ProjectAgentSessionPendingInteraction,
  ProjectAgentSessionState,
} from '@/lib/project-agent/session-state'
import type { ProjectAgentSubagentView } from '@/lib/project-agent/subagent-events'
import type { ProjectAssistantTextAttachment } from '@/lib/project-agent/text-attachments'
import type { WorkspaceAssistantActiveFocusRequest } from '../../workspace-assistant-focus'

export interface WorkspaceAssistantSendMessageInput {
  readonly text: string
  readonly attachments?: readonly ProjectAssistantTextAttachment[]
}

type WorkspaceAssistantPendingApproval = Extract<
  ProjectAgentSessionPendingInteraction,
  { kind: 'approval' }
>

export interface UseWorkspaceAssistantRuntimeParams {
  projectId: string
  episodeId?: string
  selectedScopeRef?: string | null
  selectedAssetId?: string | null
}

export interface UseWorkspaceAssistantRuntimeResult {
  runtime: AssistantRuntime
  messages: UIMessage[]
  messageCount: number
  status: ChatStatus
  pending: boolean
  canStopReply: boolean
  replyInFlight: boolean
  controlPending: boolean
  pendingApprovalId: string | null
  sessionState: ProjectAgentSessionState | null
  pendingInteraction: ProjectAgentSessionPendingInteraction | null
  error: Error | undefined
  sessionStateError: string | null
  storageError: string | null
  storageLoading: boolean
  pendingOperationId: string | null
  activeFocusRequest: WorkspaceAssistantActiveFocusRequest | null
  subagents: ProjectAgentSubagentView[]
  pendingRunApproval: WorkspaceAssistantPendingApproval | null
  sendMessage: (input: WorkspaceAssistantSendMessageInput) => Promise<void>
  sendHiddenMessage: (text: string) => Promise<void>
  stopReply: () => Promise<void>
  submitChoiceResponse: (params: {
    runId: string
    interruptionId: string
    cardId: string
    toolCallId: string
    output: Record<string, unknown>
    visibleUserText?: string
  }) => Promise<void>
  addRunApprovalResponse: (params: {
    runId: string
    interruptionId: string
    approvalId: string
    operationId: string
    approved: boolean
    reason?: string
  }) => Promise<void>
  replaceMessages: (messages: UIMessage[]) => void
  appendMessages: (messages: UIMessage[]) => void
}
