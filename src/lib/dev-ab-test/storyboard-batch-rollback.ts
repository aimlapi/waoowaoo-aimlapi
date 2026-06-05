import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

export function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

export async function rollbackStoryboardBatchProject(input: {
  readonly projectId: string | null
  readonly taskIds: readonly string[]
}) {
  const rollbackErrors: Error[] = []

  if (input.taskIds.length > 0) {
    try {
      await prisma.task.updateMany({
        where: {
          id: { in: [...input.taskIds] },
          status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
        },
        data: {
          status: TASK_STATUS.CANCELED,
          errorCode: 'STORYBOARD_BATCH_ROLLBACK',
          errorMessage: 'Storyboard batch project creation rolled back after task submission failure.',
          finishedAt: new Date(),
        },
      })
    } catch (error) {
      rollbackErrors.push(toError(error))
    }
  }

  if (input.projectId) {
    try {
      await prisma.project.delete({ where: { id: input.projectId } })
    } catch (error) {
      rollbackErrors.push(toError(error))
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, 'STORYBOARD_BATCH_ROLLBACK_FAILED')
  }
}

export async function rollbackStoryboardBatchProjects(projects: readonly {
  readonly projectId: string
  readonly tasks: readonly { readonly taskId: string }[]
}[]) {
  const rollbackErrors: Error[] = []

  for (const project of projects) {
    try {
      await rollbackStoryboardBatchProject({
        projectId: project.projectId,
        taskIds: project.tasks.map((task) => task.taskId),
      })
    } catch (error) {
      rollbackErrors.push(toError(error))
    }
  }

  if (rollbackErrors.length > 0) {
    throw new AggregateError(rollbackErrors, 'STORYBOARD_BATCH_PARTIAL_ROLLBACK_FAILED')
  }
}
