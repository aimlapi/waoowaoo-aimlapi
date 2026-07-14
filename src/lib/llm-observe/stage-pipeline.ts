import { getTaskTypeLabel } from '@/lib/task/progress-message'
import { TASK_TYPE } from '@/lib/task/types'

type LLMTaskPipelineStage = {
  id: string
  taskType: string
  title: string
}

export type LLMTaskFlowMeta = {
  flowId: string
  flowStageIndex: number
  flowStageTotal: number
  flowStageTitle: string
}

type LLMTaskFlowDefinition = {
  id: string
  stages: LLMTaskPipelineStage[]
}

const FLOW_DEFINITIONS: ReadonlyArray<LLMTaskFlowDefinition> = [
  {
    id: 'project_ai_create_character',
    stages: [
      {
        id: TASK_TYPE.AI_CREATE_CHARACTER,
        taskType: TASK_TYPE.AI_CREATE_CHARACTER,
        title: getTaskTypeLabel(TASK_TYPE.AI_CREATE_CHARACTER),
      },
    ],
  },
  {
    id: 'project_ai_create_location',
    stages: [
      {
        id: TASK_TYPE.AI_CREATE_LOCATION,
        taskType: TASK_TYPE.AI_CREATE_LOCATION,
        title: getTaskTypeLabel(TASK_TYPE.AI_CREATE_LOCATION),
      },
    ],
  },
]

const FLOW_META_BY_TASK_TYPE: Record<string, LLMTaskFlowMeta> = FLOW_DEFINITIONS.reduce(
  (acc, flow) => {
    flow.stages.forEach((stage, index) => {
      acc[stage.taskType] = {
        flowId: flow.id,
        flowStageIndex: index + 1,
        flowStageTotal: flow.stages.length,
        flowStageTitle: stage.title,
      }
    })
    return acc
  },
  {} as Record<string, LLMTaskFlowMeta>,
)

function createSingleStageMeta(taskType: string): LLMTaskFlowMeta {
  return {
    flowId: `single:${taskType}`,
    flowStageIndex: 1,
    flowStageTotal: 1,
    flowStageTitle: getTaskTypeLabel(taskType),
  }
}

export function getTaskFlowMeta(taskType: string | null | undefined): LLMTaskFlowMeta {
  if (!taskType) return createSingleStageMeta('llm_task')
  return FLOW_META_BY_TASK_TYPE[taskType] || createSingleStageMeta(taskType)
}
