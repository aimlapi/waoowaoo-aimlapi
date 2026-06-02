export type SubmitResponse = {
  readonly taskId?: string
}

export type DevAbTaskResult = {
  readonly imageUrl?: string
  readonly prompt?: string
  readonly aspectRatio?: string
  readonly styleSummary?: string
}

export type DevAbTaskDetail = {
  readonly id: string
  readonly status: string
  readonly progress: number
  readonly result?: DevAbTaskResult | null
  readonly error?: {
    readonly message?: string | null
  } | null
}

export type DevAbVariantState = {
  readonly taskId: string | null
  readonly task: DevAbTaskDetail | null
  readonly submitting: boolean
  readonly error: string | null
}

export const EMPTY_DEV_AB_VARIANT_STATE: DevAbVariantState = {
  taskId: null,
  task: null,
  submitting: false,
  error: null,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function parseDevAbSubmitResponse(value: unknown): SubmitResponse {
  if (!isRecord(value)) return {}
  return { taskId: readString(value.taskId) }
}

function parseTaskResult(value: unknown): DevAbTaskResult | null {
  if (!isRecord(value)) return null
  return {
    imageUrl: readString(value.imageUrl),
    prompt: readString(value.prompt),
    aspectRatio: readString(value.aspectRatio),
    styleSummary: readString(value.styleSummary),
  }
}

export function parseDevAbTaskDetail(value: unknown): DevAbTaskDetail | null {
  if (!isRecord(value) || !isRecord(value.task)) return null
  const rawTask = value.task
  const rawError = isRecord(rawTask.error) ? rawTask.error : null
  return {
    id: readString(rawTask.id),
    status: readString(rawTask.status),
    progress: typeof rawTask.progress === 'number' ? rawTask.progress : 0,
    result: parseTaskResult(rawTask.result),
    error: rawError ? { message: readString(rawError.message) } : null,
  }
}

export function isDevAbTerminalStatus(status: string): boolean {
  return status === 'completed' || status === 'failed' || status === 'canceled'
}
