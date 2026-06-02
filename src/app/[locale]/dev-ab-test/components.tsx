'use client'

import { useTranslations } from 'next-intl'
import { MediaImage } from '@/components/media/MediaImage'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { AppIcon } from '@/components/ui/icons'
import type { DevAbVariantId } from '@/lib/dev-ab-test/variant-request'
import type { DevAbVariantState } from '@/lib/dev-ab-test/task-detail'
import { resolveTaskPresentationState, type TaskPresentationPhase } from '@/lib/task/presentation'

function taskPhase(status: string | undefined, hasTask: boolean): TaskPresentationPhase {
  if (status === 'queued' || status === 'processing' || status === 'completed' || status === 'failed') return status
  return hasTask ? 'queued' : 'idle'
}

export function VariantInput(input: {
  readonly id: DevAbVariantId
  readonly value: string
  readonly setValue: (value: string) => void
  readonly submitVariant: (variantId: DevAbVariantId) => Promise<void>
  readonly state: DevAbVariantState
}) {
  const t = useTranslations('workspaceDetail.devAbTest')
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium">{t('variantLabel', { id: input.id })}</span>
      <textarea
        value={input.value}
        onChange={(event) => input.setValue(event.target.value)}
        rows={5}
        placeholder={t(`variant${input.id}Placeholder`)}
        className="resize-none rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--glass-stroke-focus)]"
      />
      <button
        type="button"
        onClick={() => void input.submitVariant(input.id)}
        disabled={input.state.submitting || !input.value.trim()}
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--glass-stroke-base)] px-3 py-2 text-sm font-semibold text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-surface-strong)] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <AppIcon name="sparkles" className="h-4 w-4" />
        {input.state.submitting ? t('submitting') : t('runOne', { id: input.id })}
      </button>
    </label>
  )
}

export function VariantResult(input: {
  readonly id: DevAbVariantId
  readonly state: DevAbVariantState
  readonly request: string
}) {
  const t = useTranslations('workspaceDetail.devAbTest')
  const result = input.state.task?.result ?? null
  const presentation = resolveTaskPresentationState({
    phase: taskPhase(input.state.task?.status, Boolean(input.state.taskId)),
    intent: 'generate',
    resource: 'image',
    hasOutput: Boolean(result?.imageUrl),
  })

  return (
    <section className="flex min-h-[620px] flex-col gap-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{t('resultTitle', { id: input.id })}</h2>
        {input.state.taskId && <TaskStatusInline state={presentation} />}
      </div>
      {input.state.error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{input.state.error}</p>}
      <div className="flex min-h-[420px] items-center justify-center overflow-hidden rounded-lg border border-[var(--glass-stroke-base)] bg-black/20">
        {result?.imageUrl ? (
          <MediaImage
            src={result.imageUrl}
            alt={t('imageAlt', { id: input.id })}
            className="max-h-[620px] w-full object-contain"
          />
        ) : (
          <span className="px-6 text-center text-sm text-[var(--glass-text-secondary)]">
            {input.state.taskId ? t('running') : t('emptyResult')}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--glass-text-secondary)]">{result?.aspectRatio || t('ratioPending')}</span>
        {result?.imageUrl && (
          <a href={result.imageUrl} target="_blank" rel="noreferrer" className="text-sm text-[var(--glass-accent-from)] hover:underline">
            {t('openImage')}
          </a>
        )}
      </div>
      <details className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-3">
        <summary className="cursor-pointer text-sm font-medium">{t('submittedRequest')}</summary>
        <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--glass-text-secondary)]">{input.request}</pre>
      </details>
      <details className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-3">
        <summary className="cursor-pointer text-sm font-medium">{t('promptTitle')}</summary>
        <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-5 text-[var(--glass-text-secondary)]">
          {result?.prompt || t('promptHidden')}
        </pre>
      </details>
    </section>
  )
}
