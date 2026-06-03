import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonArray } from '@/lib/json-repair'
import type { Locale } from '@/i18n/routing'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import {
  assertTaskActive,
  resolveImageSourceFromGeneration,
  uploadImageSourceToCos,
} from '@/lib/workers/utils'

interface VisualReferenceStylePreset {
  readonly key: string
  readonly title: string
  readonly description: string
  readonly visualDirection: string
}

interface VisualReferenceCaseForGeneration {
  readonly id: string
  readonly status: string
  readonly imageUrl: string | null
}

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

function readOptionalString(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed || null
}

function readCount(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 3
  return Math.max(1, Math.min(5, Math.floor(parsed)))
}

function readImageOptions(value: unknown): { resolution?: string; quality?: string; size?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  return {
    ...(typeof record.resolution === 'string' && record.resolution.trim()
      ? { resolution: record.resolution.trim() }
      : {}),
    ...(typeof record.quality === 'string' && record.quality.trim()
      ? { quality: record.quality.trim() }
      : {}),
    ...(typeof record.size === 'string' && record.size.trim()
      ? { size: record.size.trim() }
      : {}),
  }
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

function buildStylePlanPrompt(input: {
  readonly locale: Locale
  readonly screenplayText: string
  readonly userPrompt: string | null
  readonly count: number
}): string {
  const screenplayPreview = compactText(input.screenplayText, 2600)
  const userPromptPreview = input.userPrompt ? compactText(input.userPrompt, 500) : ''
  if (input.locale === 'en') {
    return [
      `Read the confirmed screenplay and design exactly ${input.count} visual reference style options for this specific story.`,
      'The options must be inferred from this screenplay: genre, location, era, emotional rhythm, themes, character relationships, production scale, and key situations. Do not reuse a fixed preset set.',
      'Each option must be unmistakably different from the others as a complete visual world: palette, composition grammar, production design, texture, wardrobe/props, lighting logic, camera distance, and emotional temperature.',
      'All options must prefer medium-long shots, long shots, or wide establishing compositions, showing characters inside an environment. Avoid close-ups, face close-ups, tight bust shots, cropped portraits, and macro details.',
      'Return strict JSON only. No markdown. No extra prose.',
      'Schema: [{"key":"kebab-case-id","title":"short user-facing title","description":"one concise sentence","visualDirection":"detailed image-generation direction"}]',
      'Keep title short. Keep description concrete. visualDirection should be directly usable in an image prompt and must include wide/medium-long framing guidance.',
      userPromptPreview ? `User request: ${userPromptPreview}` : '',
      `Screenplay: ${screenplayPreview}`,
    ].filter(Boolean).join('\n')
  }
  return [
    `请阅读这份已经确认的剧本，并为这个剧本专门设计 ${input.count} 个视觉参考风格方案。`,
    '这些方案必须从本剧本里推导出来：类型、地点、时代、情绪节奏、主题、人物关系、制作规模和关键场面。不要复用固定预设组合。',
    '每个方案都必须像一个完整的视觉世界，并且彼此明显不同：色彩体系、构图规则、美术设计、材质颗粒、服装/道具、光源逻辑、镜头距离和情绪温度都要拉开。',
    '所有方案都必须优先中远景、远景或全景式建立镜头，把人物放在环境里展示整体风格。避免脸部特写、半身特写、裁切头像和微距细节。',
    '只返回严格 JSON，不要 markdown，不要解释。',
    '格式：[{"key":"英文短横线id","title":"给用户看的短标题","description":"一句具体说明","visualDirection":"可直接用于图像生成的详细视觉方向"}]',
    'title 要短，description 要具体，visualDirection 必须能直接进入生图提示词，并且包含中远景/整体环境构图要求。',
    userPromptPreview ? `用户需求：${userPromptPreview}` : '',
    `剧本：${screenplayPreview}`,
  ].filter(Boolean).join('\n')
}

function normalizeStylePlanItem(item: Record<string, unknown>, index: number): VisualReferenceStylePreset {
  const key = typeof item.key === 'string' && item.key.trim()
    ? item.key.trim()
    : `script-derived-style-${index + 1}`
  const title = readRequiredString(item.title, `styles[${index}].title`)
  const description = readRequiredString(item.description, `styles[${index}].description`)
  const visualDirection = readRequiredString(item.visualDirection, `styles[${index}].visualDirection`)
  return {
    key,
    title,
    description,
    visualDirection,
  }
}

async function generateVisualReferenceStylePlans(input: {
  readonly userId: string
  readonly projectId: string
  readonly locale: Locale
  readonly analysisModel: string
  readonly screenplayText: string
  readonly userPrompt: string | null
  readonly count: number
}): Promise<VisualReferenceStylePreset[]> {
  const prompt = buildStylePlanPrompt({
    locale: input.locale,
    screenplayText: input.screenplayText,
    userPrompt: input.userPrompt,
    count: input.count,
  })
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.analysisModel,
    projectId: input.projectId,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    action: 'visual_reference_style_plan',
    meta: {
      stepId: 'visual_reference_style_plan',
      stepTitle: 'Visual reference style plan',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  const rows = safeParseJsonArray(completion.text)
  const plans = rows.slice(0, input.count).map((item, index) => normalizeStylePlanItem(item, index))
  if (plans.length !== input.count) {
    throw new Error(`VISUAL_REFERENCE_STYLE_PLAN_COUNT_MISMATCH: expected ${input.count}, got ${plans.length}`)
  }
  return plans
}

function buildReferencePrompt(input: {
  readonly locale: Locale
  readonly screenplayText: string
  readonly userPrompt: string | null
  readonly aspectRatio: string | null
  readonly artStyle: string | null
  readonly preset: VisualReferenceStylePreset
}) {
  const screenplayPreview = compactText(input.screenplayText, 1600)
  const userPromptPreview = input.userPrompt ? compactText(input.userPrompt, 360) : ''
  if (input.locale === 'en') {
    return [
      'Create one standalone visual reference image for a confirmed screenplay.',
      'This is only a mood/style reference for the user. It must not look like a storyboard panel, asset sheet, UI mockup, poster with text, or production diagram.',
      `Visual direction: ${input.preset.visualDirection}.`,
      'Commit strongly to this option; it should look unmistakably different from the other visual references even at thumbnail size.',
      'Build a complete visual world: color palette, composition grammar, texture, wardrobe or props, light source, camera distance, and emotional temperature. Do not merely reuse the same realistic scene with a different color grade.',
      'Use a medium-long shot, long shot, or wide establishing composition. Show the characters within the surrounding environment so the overall art direction, set design, color world, and spatial layout are visible. Avoid close-ups, face close-ups, tight bust shots, cropped portraits, macro details, or any small-scale framing that hides the style world.',
      input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}.` : '',
      input.artStyle ? `Current project art style hint: ${input.artStyle}.` : '',
      userPromptPreview ? `Original request: ${userPromptPreview}` : '',
      `Screenplay excerpt: ${screenplayPreview}`,
      'Choose one representative moment from the screenplay and render it as a polished cinematic key image. No captions, no subtitles, no text overlays, no logos.',
    ].filter(Boolean).join('\n')
  }
  return [
    '为一份已经确认的剧本生成一张独立的画面风格参考图。',
    '这只是交给用户看的画面气质参考，不是正式分镜、不是角色资产设定图、不是海报、不是 UI，也不是生产流程图。',
    `视觉方向：${input.preset.visualDirection}。`,
    '请强烈执行这个方向，让它在缩略图尺寸下也能和其他视觉参考明显不同。',
    '请建立完整的视觉世界：色彩体系、构图规则、材质颗粒、服装或道具、光源逻辑、镜头距离和情绪温度都要改变，不要只是同一个写实场景换调色。',
    '景别请优先使用中远景、远景或全景式建立镜头。人物要放在环境里，让整体美术风格、场景设计、色彩世界和空间关系都能看清楚。避免脸部特写、半身特写、裁切头像、微距细节或任何看不清整体风格的小景别。',
    input.aspectRatio ? `画幅比例：${input.aspectRatio}。` : '',
    input.artStyle ? `当前项目风格提示：${input.artStyle}。` : '',
    userPromptPreview ? `用户原始需求：${userPromptPreview}` : '',
    `剧本节选：${screenplayPreview}`,
    '请从剧本中选择一个最能代表故事气质的瞬间，生成一张完成度高的电影感关键画面。不要字幕、不要说明文字、不要 logo、不要文字叠加。',
  ].filter(Boolean).join('\n')
}

async function resolveVisualReferenceCaseForGeneration(input: {
  readonly job: Job<TaskJobData>
  readonly episodeId: string
  readonly screenplayId: string
  readonly preset: VisualReferenceStylePreset
  readonly prompt: string
  readonly sortIndex: number
}): Promise<VisualReferenceCaseForGeneration> {
  const existing = await prisma.projectVisualReferenceCase.findFirst({
    where: {
      taskId: input.job.data.taskId,
      sortIndex: input.sortIndex,
    },
    orderBy: [
      { status: 'asc' },
      { updatedAt: 'desc' },
    ],
    select: {
      id: true,
      status: true,
      imageUrl: true,
    },
  })

  if (existing?.status === 'completed' && existing.imageUrl) {
    return existing
  }

  const data = {
    projectId: input.job.data.projectId,
    episodeId: input.episodeId,
    screenplayId: input.screenplayId,
    title: input.preset.title,
    description: input.preset.description,
    prompt: input.prompt,
    status: 'processing',
    taskId: input.job.data.taskId,
    sortIndex: input.sortIndex,
    errorMessage: null,
    imageUrl: null,
    imageMediaId: null,
  }

  if (existing) {
    return await prisma.projectVisualReferenceCase.update({
      where: { id: existing.id },
      data,
      select: {
        id: true,
        status: true,
        imageUrl: true,
      },
    })
  }

  return await prisma.projectVisualReferenceCase.create({
    data,
    select: {
      id: true,
      status: true,
      imageUrl: true,
    },
  })
}

export async function handleVisualReferenceCasesTask(job: Job<TaskJobData>) {
  const payload = job.data.payload || {}
  const episodeId = readRequiredString(payload.episodeId ?? job.data.episodeId, 'episodeId')
  const screenplayId = readRequiredString(payload.screenplayId, 'screenplayId')
  const screenplayText = readRequiredString(payload.screenplayText, 'screenplayText')
  const modelId = readRequiredString(payload.imageModel, 'imageModel')
  const analysisModel = readRequiredString(payload.analysisModel, 'analysisModel')
  const count = readCount(payload.count)
  const aspectRatio = readOptionalString(payload.aspectRatio)
  const artStyle = readOptionalString(payload.artStyle)
  const userPrompt = readOptionalString(payload.userPrompt)
  const imageOptions = readImageOptions(payload.generationOptions)

  await reportTaskProgress(job, 12, {
    stage: 'visual_reference_prepare',
    stageLabel: 'progress.stage.visualReferencePrepare',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'visual_reference_prepare')

  const presets = await generateVisualReferenceStylePlans({
    userId: job.data.userId,
    projectId: job.data.projectId,
    locale: job.data.locale,
    analysisModel,
    screenplayText,
    userPrompt,
    count,
  })
  await assertTaskActive(job, 'visual_reference_style_plan')

  const results: Array<{ readonly caseId: string; readonly imageUrl: string }> = []
  for (const [index, preset] of presets.entries()) {
    const prompt = buildReferencePrompt({
      locale: job.data.locale,
      screenplayText,
      userPrompt,
      aspectRatio,
      artStyle,
      preset,
    })
    const visualCase = await resolveVisualReferenceCaseForGeneration({
      job,
      episodeId,
      screenplayId,
      preset,
      prompt,
      sortIndex: index,
    })
    if (visualCase.status === 'completed' && visualCase.imageUrl) {
      results.push({ caseId: visualCase.id, imageUrl: visualCase.imageUrl })
      continue
    }

    try {
      await reportTaskProgress(job, 18 + Math.floor((index / Math.max(presets.length, 1)) * 68), {
        stage: 'visual_reference_generate',
        stageLabel: 'progress.stage.visualReferenceGenerate',
        displayMode: 'detail',
        caseId: visualCase.id,
        caseIndex: index + 1,
      })
      await assertTaskActive(job, `visual_reference_generate_${index + 1}`)

      const source = await resolveImageSourceFromGeneration(job, {
        userId: job.data.userId,
        modelId,
        prompt,
        options: {
          ...imageOptions,
          ...(aspectRatio ? { aspectRatio } : {}),
        },
        allowTaskExternalIdResume: false,
        pollProgress: { start: 25, end: 90 },
      })
      const storageKey = await uploadImageSourceToCos(source, 'visual-reference-case', visualCase.id)
      const media = await ensureMediaObjectFromStorageKey(storageKey)

      await reportTaskProgress(job, 86, {
        stage: 'visual_reference_persist',
        stageLabel: 'progress.stage.visualReferencePersist',
        displayMode: 'detail',
        caseId: visualCase.id,
      })
      await assertTaskActive(job, `visual_reference_persist_${index + 1}`)

      await prisma.projectVisualReferenceCase.update({
        where: { id: visualCase.id },
        data: {
          status: 'completed',
          imageUrl: media.url,
          imageMediaId: media.id,
          errorMessage: null,
        },
      })
      results.push({ caseId: visualCase.id, imageUrl: media.url })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await prisma.projectVisualReferenceCase.update({
        where: { id: visualCase.id },
        data: {
          status: 'failed',
          errorMessage: message,
        },
      }).catch(() => undefined)
      throw error
    }
  }

  return {
    episodeId,
    screenplayId,
    count: results.length,
    cases: results,
  }
}
