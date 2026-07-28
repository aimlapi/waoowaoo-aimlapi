import { createProjectAgentRunFence } from './run-fence'
import { releaseProjectAgentRunLockForRun } from './run-lock'
import {
  getProjectAgentRun,
  settleProjectAgentRunFailureWithMessage,
  type ProjectAgentRunScope,
} from './runs'

export type StopProjectAgentRunResult =
  | 'not_found'
  | 'already_settled'
  | 'cancelled'

/**
 * The explicit user-stop authority. Transport disconnects never call this
 * service and therefore cannot write a cancelled Run terminal.
 */
export async function stopProjectAgentRun(params: {
  scope: ProjectAgentRunScope
  runId: string
}): Promise<StopProjectAgentRunResult> {
  const run = await getProjectAgentRun({ ...params.scope, runId: params.runId })
  if (!run) return 'not_found'
  if (run.status !== 'running') return 'already_settled'

  await releaseProjectAgentRunLockForRun({ ...params.scope, runId: params.runId })
  await settleProjectAgentRunFailureWithMessage({
    runFence: createProjectAgentRunFence(run),
    controlKind: run.controlKind,
    requestId: run.requestId,
    status: 'cancelled',
    stopReason: 'user_stop',
  })
  return 'cancelled'
}
