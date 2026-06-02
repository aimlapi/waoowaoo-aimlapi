'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'
import type { Locale } from '@/i18n/routing'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import {
  EMPTY_DEV_AB_VARIANT_STATE,
  isDevAbTerminalStatus,
  parseDevAbSubmitResponse,
  parseDevAbTaskDetail,
  type DevAbVariantState,
} from '@/lib/dev-ab-test/task-detail'
import {
  buildDevAbVariantCharacterRequest,
  type DevAbVariantId,
} from '@/lib/dev-ab-test/variant-request'
import { VariantInput, VariantResult } from './components'

export default function DevAbTestPage() {
  const t = useTranslations('workspaceDetail.devAbTest')
  const locale = useLocale() as Locale
  const [baseRequest, setBaseRequest] = useState('')
  const [variantA, setVariantA] = useState('')
  const [variantB, setVariantB] = useState('')
  const [variantStates, setVariantStates] = useState<Record<DevAbVariantId, DevAbVariantState>>({
    A: EMPTY_DEV_AB_VARIANT_STATE,
    B: EMPTY_DEV_AB_VARIANT_STATE,
  })
  const [pageError, setPageError] = useState<string | null>(null)

  const canSubmit = baseRequest.trim().length > 0 && variantA.trim().length > 0 && variantB.trim().length > 0
  const anySubmitting = variantStates.A.submitting || variantStates.B.submitting

  const variantRequests = useMemo(() => ({
    A: buildDevAbVariantCharacterRequest({
      baseRequest,
      variantId: 'A',
      variantInstruction: variantA,
      locale,
    }),
    B: buildDevAbVariantCharacterRequest({
      baseRequest,
      variantId: 'B',
      variantInstruction: variantB,
      locale,
    }),
  }), [baseRequest, locale, variantA, variantB])

  const updateVariantState = useCallback((variantId: DevAbVariantId, patch: Partial<DevAbVariantState>) => {
    setVariantStates((current) => ({
      ...current,
      [variantId]: {
        ...current[variantId],
        ...patch,
      },
    }))
  }, [])

  const pollTask = useCallback(async (id: string) => {
    const response = await apiFetch(`/api/tasks/${id}`)
    if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
    const detail = parseDevAbTaskDetail(await response.json())
    if (!detail) throw new Error(t('failed'))
    return detail
  }, [t])

  useEffect(() => {
    const taskId = variantStates.A.taskId
    if (!taskId) return
    let canceled = false
    let timer: number | null = null
    const tick = async () => {
      try {
        const detail = await pollTask(taskId)
        if (canceled) return
        updateVariantState('A', { task: detail, error: detail.error?.message || null })
        if (!isDevAbTerminalStatus(detail.status)) {
          timer = window.setTimeout(() => void tick(), 2000)
        }
      } catch (error) {
        if (!canceled) {
          updateVariantState('A', {
            error: error instanceof Error ? error.message : t('failed'),
          })
        }
      }
    }
    void tick()
    return () => {
      canceled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [pollTask, t, updateVariantState, variantStates.A.taskId])

  useEffect(() => {
    const taskId = variantStates.B.taskId
    if (!taskId) return
    let canceled = false
    let timer: number | null = null
    const tick = async () => {
      try {
        const detail = await pollTask(taskId)
        if (canceled) return
        updateVariantState('B', { task: detail, error: detail.error?.message || null })
        if (!isDevAbTerminalStatus(detail.status)) {
          timer = window.setTimeout(() => void tick(), 2000)
        }
      } catch (error) {
        if (!canceled) {
          updateVariantState('B', {
            error: error instanceof Error ? error.message : t('failed'),
          })
        }
      }
    }
    void tick()
    return () => {
      canceled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [pollTask, t, updateVariantState, variantStates.B.taskId])

  const submitVariant = useCallback(async (variantId: DevAbVariantId) => {
    const variantInstruction = variantId === 'A' ? variantA : variantB
    if (!baseRequest.trim() || !variantInstruction.trim()) {
      setPageError(t('needInput'))
      return
    }

    setPageError(null)
    updateVariantState(variantId, {
      taskId: null,
      task: null,
      submitting: true,
      error: null,
    })

    try {
      const response = await apiFetch('/api/character-style-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          characterRequest: variantRequests[variantId],
          promptMode: 'casting_photo',
        }),
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
      const parsed = parseDevAbSubmitResponse(await response.json())
      if (!parsed.taskId) throw new Error(t('failed'))
      updateVariantState(variantId, { taskId: parsed.taskId })
    } catch (error) {
      updateVariantState(variantId, {
        error: error instanceof Error ? error.message : t('failed'),
      })
    } finally {
      updateVariantState(variantId, { submitting: false })
    }
  }, [baseRequest, t, updateVariantState, variantA, variantB, variantRequests])

  const submitBoth = useCallback(async () => {
    if (!canSubmit) {
      setPageError(t('needInput'))
      return
    }
    await Promise.all([submitVariant('A'), submitVariant('B')])
  }, [canSubmit, submitVariant, t])

  return (
    <div className="min-h-screen bg-[var(--glass-bg-base)] text-[var(--glass-text-primary)]">
      <Navbar />
      <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link href={{ pathname: '/workspace' }} className="text-sm text-[var(--glass-text-secondary)] hover:text-[var(--glass-text-primary)]">
              {t('back')}
            </Link>
            <h1 className="mt-3 text-2xl font-semibold tracking-normal">{t('title')}</h1>
            <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
          </div>
          <button
            type="button"
            onClick={() => void submitBoth()}
            disabled={!canSubmit || anySubmitting}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--glass-accent-from)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <AppIcon name="play" className="h-4 w-4" />
            {anySubmitting ? t('submitting') : t('runBoth')}
          </button>
        </header>

        <section className="grid gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <aside className="flex flex-col gap-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('baseLabel')}</span>
              <textarea
                value={baseRequest}
                onChange={(event) => setBaseRequest(event.target.value)}
                rows={6}
                placeholder={t('basePlaceholder')}
                className="resize-none rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--glass-stroke-focus)]"
              />
            </label>
            <VariantInput id="A" value={variantA} setValue={setVariantA} submitVariant={submitVariant} state={variantStates.A} />
            <VariantInput id="B" value={variantB} setValue={setVariantB} submitVariant={submitVariant} state={variantStates.B} />
            {pageError && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{pageError}</p>}
          </aside>

          <div className="grid gap-4 xl:grid-cols-2">
            <VariantResult id="A" state={variantStates.A} request={variantRequests.A} />
            <VariantResult id="B" state={variantStates.B} request={variantRequests.B} />
          </div>
        </section>
      </main>
    </div>
  )
}
