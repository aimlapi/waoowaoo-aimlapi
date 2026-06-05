'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
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

type StoryboardBatchTaskRef = {
  readonly panelNumber: number
  readonly panelId: string
  readonly taskId: string
  readonly status: string
}

type StoryboardBatchProject = {
  readonly schemeId: string
  readonly schemeTitle: string
  readonly schemeSummary: string
  readonly projectId: string
  readonly episodeId: string
  readonly storyboardId: string
  readonly projectName: string
  readonly tasks: StoryboardBatchTaskRef[]
}

type BatchProjectTaskCounts = {
  readonly completed: number
  readonly failed: number
  readonly running: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function parseBatchTask(value: unknown): StoryboardBatchTaskRef | null {
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

function parseBatchProject(value: unknown): StoryboardBatchProject | null {
  if (!isRecord(value)) return null
  const projectId = readString(value.projectId)
  const episodeId = readString(value.episodeId)
  const storyboardId = readString(value.storyboardId)
  if (!projectId || !episodeId || !storyboardId) return null
  const tasks = Array.isArray(value.tasks)
    ? value.tasks.map(parseBatchTask).filter((item): item is StoryboardBatchTaskRef => item !== null)
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

function parseBatchProjects(value: unknown): StoryboardBatchProject[] {
  if (!isRecord(value) || !Array.isArray(value.projects)) return []
  return value.projects.map(parseBatchProject).filter((item): item is StoryboardBatchProject => item !== null)
}

function parseBatchTasks(value: unknown): StoryboardBatchTaskRef[] {
  if (!isRecord(value) || !Array.isArray(value.tasks)) return []
  return value.tasks.map(parseBatchTask).filter((item): item is StoryboardBatchTaskRef => item !== null)
}

function batchProjectTaskCounts(
  project: StoryboardBatchProject,
  taskDetails: Record<string, DevAbTaskDetail>
): BatchProjectTaskCounts {
  return project.tasks.reduce<BatchProjectTaskCounts>((counts, task) => {
    const status = taskDetails[task.taskId]?.status || task.status
    return {
      completed: counts.completed + (status === 'completed' ? 1 : 0),
      failed: counts.failed + (status === 'failed' ? 1 : 0),
      running: counts.running + (status === 'queued' || status === 'processing' ? 1 : 0),
    }
  }, { completed: 0, failed: 0, running: 0 })
}

function projectIsTerminal(project: StoryboardBatchProject, taskDetails: Record<string, DevAbTaskDetail>): boolean {
  return project.tasks.every((task) => {
    const status = taskDetails[task.taskId]?.status || task.status
    return isDevAbTerminalStatus(status)
  })
}

export function StoryboardProjectBatchTest() {
  const t = useTranslations('workspaceDetail.devAbTest.storyboardBatch')
  const locale = useLocale() as Locale
  const defaultStory = t('defaultStory')
  const defaultPrefix = t('defaultProjectPrefix')
  const [storyText, setStoryText] = useState(defaultStory)
  const [projectNamePrefix, setProjectNamePrefix] = useState(defaultPrefix)
  const [panelCount, setPanelCount] = useState(6)
  const [videoRatio, setVideoRatio] = useState<'9:16' | '16:9' | '21:9'>('9:16')
  const [artStyle, setArtStyle] = useState('realistic')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [projects, setProjects] = useState<StoryboardBatchProject[]>([])
  const [taskDetails, setTaskDetails] = useState<Record<string, DevAbTaskDetail>>({})
  const [continuationStatus, setContinuationStatus] = useState<Record<string, 'submitting' | 'done'>>({})

  const allTasks = useMemo(() => projects.flatMap((project) => project.tasks), [projects])
  const allTerminal = projects.length > 0 && projects.every((project) => projectIsTerminal(project, taskDetails))

  const submit = useCallback(async () => {
    if (!storyText.trim() || !projectNamePrefix.trim()) {
      setError(t('needInput'))
      return
    }
    setSubmitting(true)
    setError(null)
    setProjects([])
    setTaskDetails({})
    setContinuationStatus({})
    try {
      const response = await apiFetch('/api/dev-ab-test/storyboard-projects', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          storyText,
          projectNamePrefix,
          videoRatio,
          artStyle,
          panelCount,
          meta: { locale },
        }),
      })
      if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
      const parsed = parseBatchProjects(await response.json())
      if (parsed.length !== 3) throw new Error(t('failed'))
      setProjects(parsed)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t('failed'))
    } finally {
      setSubmitting(false)
    }
  }, [artStyle, locale, panelCount, projectNamePrefix, storyText, t, videoRatio])

  useEffect(() => {
    if (allTasks.length === 0 || allTerminal) return
    let canceled = false
    let timer: number | null = null

    const tick = async () => {
      const nextEntries = await Promise.all(allTasks.map(async (task) => {
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
        for (const entry of nextEntries) {
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
  }, [allTasks, allTerminal])

  useEffect(() => {
    const project = projects.find((item) => item.schemeId === 'first-panel-img2img')
    if (!project || continuationStatus[project.projectId]) return
    const anchorTask = project.tasks.find((task) => task.panelNumber === 1)
    if (!anchorTask) return
    const anchorDetail = taskDetails[anchorTask.taskId]
    const anchorImageUrl = anchorDetail?.result?.imageUrl
    if (anchorDetail?.status !== 'completed' || !anchorImageUrl) return

    let canceled = false
    setContinuationStatus((current) => ({ ...current, [project.projectId]: 'submitting' }))
    const submitRemainingPanels = async () => {
      try {
        const response = await apiFetch('/api/dev-ab-test/storyboard-projects/continue-reference', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            projectId: project.projectId,
            storyboardId: project.storyboardId,
            anchorPanelId: anchorTask.panelId,
            meta: { locale },
          }),
        })
        if (!response.ok) throw new Error(await readApiErrorMessage(response, t('failed')))
        const nextTasks = parseBatchTasks(await response.json())
        if (canceled) return
        setProjects((current) => current.map((item) => {
          if (item.projectId !== project.projectId) return item
          const existingTaskIds = new Set(item.tasks.map((task) => task.taskId))
          const mergedTasks = [
            ...item.tasks,
            ...nextTasks.filter((task) => !existingTaskIds.has(task.taskId)),
          ].sort((left, right) => left.panelNumber - right.panelNumber)
          return { ...item, tasks: mergedTasks }
        }))
        setContinuationStatus((current) => ({ ...current, [project.projectId]: 'done' }))
      } catch (caught) {
        if (canceled) return
        setContinuationStatus((current) => {
          const next = { ...current }
          delete next[project.projectId]
          return next
        })
        setError(caught instanceof Error ? caught.message : t('failed'))
      }
    }

    void submitRemainingPanels()
    return () => {
      canceled = true
    }
  }, [continuationStatus, locale, projects, t, taskDetails])

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">{t('title')}</h2>
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

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <label className="flex flex-col gap-2">
          <span className="text-sm font-medium">{t('storyLabel')}</span>
          <textarea
            value={storyText}
            onChange={(event) => setStoryText(event.target.value)}
            rows={8}
            className="resize-none rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm leading-6 outline-none focus:border-[var(--glass-stroke-focus)]"
          />
        </label>
        <div className="grid content-start gap-3">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('prefixLabel')}</span>
            <input
              value={projectNamePrefix}
              onChange={(event) => setProjectNamePrefix(event.target.value)}
              className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
            />
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
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('ratio')}</span>
            <select
              value={videoRatio}
              onChange={(event) => setVideoRatio(event.target.value as '9:16' | '16:9' | '21:9')}
              className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
            >
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="21:9">21:9</option>
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{t('style')}</span>
            <input
              value={artStyle}
              onChange={(event) => setArtStyle(event.target.value)}
              className="rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-3 py-2 text-sm outline-none focus:border-[var(--glass-stroke-focus)]"
            />
          </label>
        </div>
      </div>

      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>}

      {projects.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {projects.map((project) => {
            const counts = batchProjectTaskCounts(project, taskDetails)
            return (
              <article key={project.projectId} className="flex flex-col gap-3 rounded-lg border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] p-4">
                <div>
                  <h3 className="text-base font-semibold">{project.schemeTitle}</h3>
                  <p className="mt-1 text-sm leading-5 text-[var(--glass-text-secondary)]">{project.schemeSummary}</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center text-sm">
                  <span className="rounded-lg bg-black/10 px-2 py-2">{t('completed', { count: counts.completed })}</span>
                  <span className="rounded-lg bg-black/10 px-2 py-2">{t('running', { count: counts.running })}</span>
                  <span className="rounded-lg bg-black/10 px-2 py-2">{t('failedCount', { count: counts.failed })}</span>
                </div>
                <Link
                  href={{ pathname: `/workspace/${project.projectId}`, query: { episode: project.episodeId } }}
                  className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--glass-stroke-base)] px-3 py-2 text-sm font-semibold text-[var(--glass-text-primary)] hover:bg-[var(--glass-bg-surface)]"
                >
                  <AppIcon name="folderOpen" className="h-4 w-4" />
                  {t('openProject')}
                </Link>
                <details className="rounded-lg border border-[var(--glass-stroke-base)] p-3">
                  <summary className="cursor-pointer text-sm font-medium">{t('taskDetails')}</summary>
                  <div className="mt-3 grid gap-1 text-xs text-[var(--glass-text-secondary)]">
                    {project.tasks.map((task) => {
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
        </div>
      )}
    </section>
  )
}
