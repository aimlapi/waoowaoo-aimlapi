'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import Navbar from '@/components/Navbar'
import { AppIcon } from '@/components/ui/icons'
import { Link } from '@/i18n/navigation'
import { apiFetch } from '@/lib/api-fetch'
import { readApiErrorMessage } from '@/lib/api/read-error-message'
import {
  isDevAbTerminalStatus,
  parseDevAbTaskDetail,
  type DevAbTaskDetail,
} from '@/lib/dev-ab-test/task-detail'
import type { Locale } from '@/i18n/routing'

type StageTaskRef = {
  readonly stage: 'style-reference' | 'character-asset' | 'scene-asset'
  readonly label: string
  readonly targetId: string
  readonly taskId: string
  readonly status: string
}

type StoryboardTaskRef = {
  readonly panelNumber: number
  readonly panelId: string
  readonly taskId: string
  readonly status: string
}

type StoryboardBranch = {
  readonly schemeId: string
  readonly schemeTitle: string
  readonly schemeSummary: string
  readonly projectId: string
  readonly episodeId: string
  readonly storyboardId: string
  readonly projectName: string
  readonly tasks: StoryboardTaskRef[]
}

type StoryboardMethodSession = {
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly projectName: string
  readonly upstreamTasks: StageTaskRef[]
  readonly storyboardBranches: StoryboardBranch[]
}

type TaskCounts = {
  readonly completed: number
  readonly failed: number
  readonly running: number
}

const stylePresetKeys = [
  'photoreal',
  'surreal',
  'stopMotion',
  'oilAnimation',
  'japaneseHandDrawn',
  'westernComics',
  'experimental',
  'miniature',
] as const

const pipelineStepKeys = [
  'screenplay',
  'style',
  'character',
  'scene',
  'methods',
] as const

const methodKeys = [
  'globalContinuity',
  'topDownSpatialLock',
  'firstPanelLock',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseStageTask(value: unknown): StageTaskRef | null {
  if (!isRecord(value)) return null
  const taskId = readString(value.taskId)
  const targetId = readString(value.targetId)
  const stage = readString(value.stage)
  if (!taskId || !targetId) return null
  if (stage !== 'style-reference' && stage !== 'character-asset' && stage !== 'scene-asset') return null
  return {
    stage,
    label: readString(value.label),
    targetId,
    taskId,
    status: readString(value.status),
  }
}

function parseStoryboardTask(value: unknown): StoryboardTaskRef | null {
  if (!isRecord(value)) return null
  const taskId = readString(value.taskId)
  const panelId = readString(value.panelId)
  if (!taskId || !panelId) return null
  return {
    panelNumber: readNumber(value.panelNumber, 0),
    panelId,
    taskId,
    status: readString(value.status),
  }
}

function parseStoryboardBranch(value: unknown): StoryboardBranch | null {
  if (!isRecord(value)) return null
  const projectId = readString(value.projectId)
  const episodeId = readString(value.episodeId)
  const storyboardId = readString(value.storyboardId)
  if (!projectId || !episodeId || !storyboardId) return null
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map(parseStoryboardTask).filter((task): task is StoryboardTaskRef => task !== null)
    : []
  return {
    schemeId: readString(value.schemeId),
    schemeTitle: readString(value.schemeTitle),
    schemeSummary: readString(value.schemeSummary),
    projectId,
    episodeId,
    storyboardId,
    projectName: readString(value.projectName),
    tasks,
  }
}

function parseSession(value: unknown): StoryboardMethodSession | null {
  if (!isRecord(value)) return null
  const projectId = readString(value.projectId)
  const episodeId = readString(value.episodeId)
  const screenplayId = readString(value.screenplayId)
  if (!projectId || !episodeId || !screenplayId) return null
  return {
    projectId,
    episodeId,
    screenplayId,
    projectName: readString(value.projectName),
    upstreamTasks: Array.isArray(value.upstreamTasks)
      ? value.upstreamTasks.map(parseStageTask).filter((task): task is StageTaskRef => task !== null)
      : [],
    storyboardBranches: Array.isArray(value.storyboardBranches)
      ? value.storyboardBranches.map(parseStoryboardBranch).filter((branch): branch is StoryboardBranch => branch !== null)
      : [],
  }
}

function parseStoryboardTasks(value: unknown): StoryboardTaskRef[] {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return []
  return value.tasks.map(parseStoryboardTask).filter((task): task is StoryboardTaskRef => task !== null)
}

function countTaskStatuses(tasks: readonly { readonly taskId: string; readonly status: string }[], details: Record<string, DevAbTaskDetail>): TaskCounts {
  return tasks.reduce<TaskCounts>((counts, task) => {
    const status = details[task.taskId]?.status || task.status
    return {
      completed: counts.completed + (status === 'completed' ? 1 : 0),
      failed: counts.failed + (status === 'failed' ? 1 : 0),
      running: counts.running + (status === 'queued' || status === 'processing' ? 1 : 0),
    }
  }, { completed: 0, failed: 0, running: 0 })
}

function allTerminal(tasks: readonly { readonly taskId: string; readonly status: string }[], details: Record<string, DevAbTaskDetail>): boolean {
  return tasks.length > 0 && tasks.every((task) => {
    const status = details[task.taskId]?.status || task.status
    return isDevAbTerminalStatus(status)
  })
}

export default function StoryboardMethodTestPage() {
  const t = useTranslations('workspaceDetail.storyboardMethodTest')
  const locale = useLocale() as Locale
  const [creativeBrief, setCreativeBrief] = useState(t('defaultCreativeBrief'))
  const [styleReferenceNote, setStyleReferenceNote] = useState(t('defaultStyleReferenceNote'))
  const [projectName, setProjectName] = useState(t('defaultProjectName'))
  const [videoRatio, setVideoRatio] = useState<'9:16' | '16:9' | '21:9'>('16:9')
  const [artStyle, setArtStyle] = useState('realistic')
  const [panelCount, setPanelCount] = useState(6)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [session, setSession] = useState<StoryboardMethodSession | null>(null)
  const [taskDetails, setTaskDetails] = useState<Record<string, DevAbTaskDetail>>({})
  const [continuationStatus, setContinuationStatus] = useState<Record<string, 'submitting' | 'done'>>({})

  const storyboardTasks = useMemo(
    () => session?.storyboardBranches.flatMap((branch) => branch.tasks) ?? [],
    [session],
  )
  const allTasks = useMemo(
    () => [...(session?.upstreamTasks ?? []), ...storyboardTasks],
    [session, storyboardTasks],
  )
  const terminal = allTerminal(allTasks, taskDetails)

  const submit = useCallback(async () => {
    if (!creativeBrief.trim() || !projectName.trim()) {
      setError(t('needInput'))
      return
    }
    setSubmitting(true)
    setError(null)
    setSession(null)
    setTaskDetails({})
    setContinuationStatus({})
    try {
      const response = await apiFetch('/api/storyboard-method-test/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          creativeBrief,
          styleReferenceNote,
          projectName,
          videoRatio,
          artStyle,
          panelCount,
          meta: { locale },
        }),
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
      const parsed = parseSession(await response.json())
      if (!parsed) throw new Error(t('failed'))
      setSession(parsed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('failed'))
    } finally {
      setSubmitting(false)
    }
  }, [artStyle, creativeBrief, locale, panelCount, projectName, styleReferenceNote, t, videoRatio])

  useEffect(() => {
    if (allTasks.length === 0 || terminal) return
    let canceled = false
    let timer: number | null = null

    const tick = async () => {
      const entries = await Promise.all(allTasks.map(async (task) => {
        try {
          const response = await apiFetch(`/api/tasks/${task.taskId}`)
          if (!response.ok) return null
          const detail = parseDevAbTaskDetail(await response.json())
          return detail ? [task.taskId, detail] as const : null
        } catch {
          return null
        }
      }))
      if (canceled) return
      setTaskDetails((current) => {
        const next = { ...current }
        for (const entry of entries) {
          if (entry) next[entry[0]] = entry[1]
        }
        return next
      })
      timer = window.setTimeout(() => void tick(), 2500)
    }

    void tick()
    return () => {
      canceled = true
      if (timer !== null) window.clearTimeout(timer)
    }
  }, [allTasks, terminal])

  useEffect(() => {
    const branch = session?.storyboardBranches.find((item) => item.schemeId === 'first-panel-img2img')
    if (!branch || continuationStatus[branch.storyboardId]) return
    const anchorTask = branch.tasks.find((task) => task.panelNumber === 1)
    if (!anchorTask) return
    const anchorDetail = taskDetails[anchorTask.taskId]
    const anchorImageUrl = anchorDetail?.result?.imageUrl
    if (anchorDetail?.status !== 'completed' || !anchorImageUrl) return

    let canceled = false
    setContinuationStatus((current) => ({ ...current, [branch.storyboardId]: 'submitting' }))
    const submitRemainingPanels = async () => {
      try {
        const response = await apiFetch('/api/storyboard-method-test/continue-reference', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId: branch.projectId,
            storyboardId: branch.storyboardId,
            anchorPanelId: anchorTask.panelId,
            meta: { locale },
          }),
        })
        if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
        const nextTasks = parseStoryboardTasks(await response.json())
        if (canceled) return
        setSession((current) => {
          if (!current) return current
          return {
            ...current,
            storyboardBranches: current.storyboardBranches.map((item) => {
              if (item.storyboardId !== branch.storyboardId) return item
              const existingTaskIds = new Set(item.tasks.map((task) => task.taskId))
              const mergedTasks = [
                ...item.tasks,
                ...nextTasks.filter((task) => !existingTaskIds.has(task.taskId)),
              ].sort((left, right) => left.panelNumber - right.panelNumber)
              return { ...item, tasks: mergedTasks }
            }),
          }
        })
        setContinuationStatus((current) => ({ ...current, [branch.storyboardId]: 'done' }))
      } catch (caught) {
        if (canceled) return
        setContinuationStatus((current) => {
          const next = { ...current }
          delete next[branch.storyboardId]
          return next
        })
        setError(caught instanceof Error ? caught.message : t('failed'))
      }
    }

    void submitRemainingPanels()
    return () => {
      canceled = true
    }
  }, [continuationStatus, locale, session, t, taskDetails])

  const upstreamCounts = countTaskStatuses(session?.upstreamTasks ?? [], taskDetails)

  return (
    <div className="min-h-screen bg-[var(--glass-bg-page)] text-[var(--glass-text-primary)]">
      <Navbar />
      <main className="mx-auto flex w-full max-w-[1400px] flex-col gap-5 px-4 py-6 sm:px-6 lg:px-10">
        <section className="flex flex-col gap-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl font-semibold">{t('title')}</h1>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--glass-text-secondary)]">{t('subtitle')}</p>
            </div>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--glass-accent-from)] px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <AppIcon name="play" className="h-4 w-4" />
              {submitting ? t('submitting') : t('run')}
            </button>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {pipelineStepKeys.map((key, index) => (
              <div key={key} className="rounded-lg border border-[var(--glass-stroke-base)] bg-black/10 px-3 py-3">
                <div className="text-xs font-semibold text-[var(--glass-text-tertiary)]">{t('pipeline.step', { number: index + 1 })}</div>
                <div className="mt-1 text-sm font-semibold">{t(`pipeline.${key}.title`)}</div>
                <p className="mt-1 text-xs leading-5 text-[var(--glass-text-secondary)]">{t(`pipeline.${key}.description`)}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">{t('creativeBrief')}</span>
              <textarea
                value={creativeBrief}
                onChange={(event) => setCreativeBrief(event.target.value)}
                rows={8}
                className="resize-none rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--glass-stroke-focus)]"
              />
            </label>
            <div className="grid content-start gap-3">
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('projectName')}</span>
                <input
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('styleReferenceNote')}</span>
                <textarea
                  value={styleReferenceNote}
                  onChange={(event) => setStyleReferenceNote(event.target.value)}
                  rows={4}
                  className="resize-none rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm leading-5 outline-none focus:border-[var(--glass-stroke-focus)]"
                />
                <div className="flex flex-wrap gap-2">
                  {stylePresetKeys.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setStyleReferenceNote(t(`stylePresets.${key}`))}
                      className="rounded-md border border-[var(--glass-stroke-base)] px-2 py-1 text-xs text-[var(--glass-text-secondary)] hover:bg-[var(--glass-bg-surface-strong)]"
                    >
                      {t(`stylePresets.${key}`)}
                    </button>
                  ))}
                </div>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{t('ratio')}</span>
                  <select
                    value={videoRatio}
                    onChange={(event) => setVideoRatio(event.target.value as '9:16' | '16:9' | '21:9')}
                    className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
                  >
                    <option value="16:9">16:9</option>
                    <option value="9:16">9:16</option>
                    <option value="21:9">21:9</option>
                  </select>
                </label>
                <label className="flex flex-col gap-2">
                  <span className="text-sm font-medium">{t('panelCount')}</span>
                  <select
                    value={panelCount}
                    onChange={(event) => setPanelCount(Number(event.target.value))}
                    className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
                  >
                    <option value={3}>3</option>
                    <option value={6}>6</option>
                    <option value={9}>9</option>
                  </select>
                </label>
              </div>
              <label className="flex flex-col gap-2">
                <span className="text-sm font-medium">{t('artStyle')}</span>
                <input
                  value={artStyle}
                  onChange={(event) => setArtStyle(event.target.value)}
                  className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
                />
              </label>
            </div>
          </div>

          {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {methodKeys.map((key) => (
            <article key={key} className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
              <h2 className="text-base font-semibold">{t(`methods.${key}.title`)}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--glass-text-secondary)]">{t(`methods.${key}.description`)}</p>
              <p className="mt-3 rounded-lg bg-black/10 px-3 py-2 text-xs leading-5 text-[var(--glass-text-tertiary)]">{t(`methods.${key}.lock`)}</p>
            </article>
          ))}
        </section>

        {session && (
          <>
            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_220px]">
              <article className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
                <h2 className="text-base font-semibold">{t('upstreamTitle')}</h2>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <span className="rounded-lg bg-black/10 px-3 py-2 text-sm">{t('screenplayReady')}</span>
                  <span className="rounded-lg bg-black/10 px-3 py-2 text-sm">{t('completed', { count: upstreamCounts.completed })}</span>
                  <span className="rounded-lg bg-black/10 px-3 py-2 text-sm">{t('running', { count: upstreamCounts.running })}</span>
                  <span className="rounded-lg bg-black/10 px-3 py-2 text-sm">{t('failedCount', { count: upstreamCounts.failed })}</span>
                </div>
                <div className="mt-4 grid gap-2 text-sm text-[var(--glass-text-secondary)]">
                  {session.upstreamTasks.map((task) => {
                    const detail = taskDetails[task.taskId]
                    const status = detail?.status || task.status
                    return (
                      <div key={task.taskId} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--glass-stroke-base)] px-3 py-2">
                        <span>{t(`stage.${task.stage}`)} · {task.label}</span>
                        <span>{status} {detail ? `${detail.progress}%` : ''}</span>
                      </div>
                    )
                  })}
                </div>
              </article>
              <Link
                href={{ pathname: `/workspace/${session.projectId}`, query: { episode: session.episodeId } }}
                className="inline-flex h-full min-h-24 items-center justify-center gap-2 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] px-4 py-3 text-sm font-semibold hover:bg-[var(--glass-bg-surface-strong)]"
              >
                <AppIcon name="folderOpen" className="h-4 w-4" />
                {t('openProject')}
              </Link>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              {session.storyboardBranches.map((branch) => {
                const counts = countTaskStatuses(branch.tasks, taskDetails)
                return (
                  <article key={branch.storyboardId} className="flex flex-col gap-3 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
                    <div>
                      <h2 className="text-base font-semibold">{branch.schemeTitle}</h2>
                      <p className="mt-1 text-sm leading-5 text-[var(--glass-text-secondary)]">{branch.schemeSummary}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-center text-sm">
                      <span className="rounded-lg bg-black/10 px-2 py-2">{t('completed', { count: counts.completed })}</span>
                      <span className="rounded-lg bg-black/10 px-2 py-2">{t('running', { count: counts.running })}</span>
                      <span className="rounded-lg bg-black/10 px-2 py-2">{t('failedCount', { count: counts.failed })}</span>
                    </div>
                    <details className="rounded-lg border border-[var(--glass-stroke-base)] p-3">
                      <summary className="cursor-pointer text-sm font-medium">{t('taskDetails')}</summary>
                      <div className="mt-3 grid gap-1 text-xs text-[var(--glass-text-secondary)]">
                        {branch.tasks.map((task) => {
                          const detail = taskDetails[task.taskId]
                          const status = detail?.status || task.status
                          return (
                            <div key={task.taskId} className="flex justify-between gap-3">
                              <span>{t('panelLabel', { number: task.panelNumber })}</span>
                              <span>{status} {detail ? `${detail.progress}%` : ''}</span>
                            </div>
                          )
                        })}
                      </div>
                    </details>
                  </article>
                )
              })}
            </section>
          </>
        )}
      </main>
    </div>
  )
}
