import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { ensureMediaObjectFromStorageKey } from '@/lib/media/service'
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
  readonly title: Record<Locale, string>
  readonly description: Record<Locale, string>
  readonly visualDirection: string
}

const STYLE_PRESETS: readonly VisualReferenceStylePreset[] = [
  {
    key: 'cinematic-naturalism',
    title: {
      zh: '克制电影现实感',
      en: 'Restrained Cinematic Realism',
    },
    description: {
      zh: '低饱和色彩、真实光线、细腻环境质感，像一帧严肃剧情片剧照。',
      en: 'Low-saturation color, grounded light, and tactile environments, like a still from a serious drama.',
    },
    visualDirection: 'restrained cinematic realism, low saturation, natural motivated lighting, tactile production design, quiet emotional tension',
  },
  {
    key: 'luminous-dream',
    title: {
      zh: '柔光梦境感',
      en: 'Luminous Dream Mood',
    },
    description: {
      zh: '柔和高光、轻微超现实氛围、通透色彩，强调诗意和情绪想象。',
      en: 'Soft highlights, lightly surreal atmosphere, and translucent color, emphasizing poetic emotion.',
    },
    visualDirection: 'luminous dreamlike cinema, soft bloom, translucent color, gentle surreal atmosphere, poetic emotional composition',
  },
  {
    key: 'graphic-contrast',
    title: {
      zh: '高对比图像感',
      en: 'Graphic High Contrast',
    },
    description: {
      zh: '强烈明暗关系、明确轮廓、鲜明色块，适合更有视觉冲击的故事。',
      en: 'Strong light-shadow structure, clear silhouettes, and bold color blocking for a more graphic visual impact.',
    },
    visualDirection: 'graphic high contrast visual design, bold silhouettes, expressive shadows, crisp color blocking, strong poster-like composition',
  },
  {
    key: 'warm-film',
    title: {
      zh: '温暖胶片质感',
      en: 'Warm Film Texture',
    },
    description: {
      zh: '温润颗粒、柔和肤色、偏暖环境光，营造怀旧但不做旧的电影感。',
      en: 'Warm grain, gentle skin tones, and ambient warmth for a nostalgic but clean film look.',
    },
    visualDirection: 'warm film texture, subtle grain, soft skin tones, amber practical light, nostalgic but clean cinematic palette',
  },
  {
    key: 'cold-future',
    title: {
      zh: '冷调未来感',
      en: 'Cool Future Tone',
    },
    description: {
      zh: '冷色光源、硬质材料、精确构图，适合科技、悬疑或疏离情绪。',
      en: 'Cool light, hard materials, and precise composition for tech, suspense, or emotional distance.',
    },
    visualDirection: 'cool future tone, precise composition, cold practical light, hard reflective materials, restrained speculative atmosphere',
  },
] as const

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
    input.aspectRatio ? `画幅比例：${input.aspectRatio}。` : '',
    input.artStyle ? `当前项目风格提示：${input.artStyle}。` : '',
    userPromptPreview ? `用户原始需求：${userPromptPreview}` : '',
    `剧本节选：${screenplayPreview}`,
    '请从剧本中选择一个最能代表故事气质的瞬间，生成一张完成度高的电影感关键画面。不要字幕、不要说明文字、不要 logo、不要文字叠加。',
  ].filter(Boolean).join('\n')
}

export async function handleVisualReferenceCasesTask(job: Job<TaskJobData>) {
  const payload = job.data.payload || {}
  const episodeId = readRequiredString(payload.episodeId ?? job.data.episodeId, 'episodeId')
  const screenplayId = readRequiredString(payload.screenplayId, 'screenplayId')
  const screenplayText = readRequiredString(payload.screenplayText, 'screenplayText')
  const modelId = readRequiredString(payload.imageModel, 'imageModel')
  const count = readCount(payload.count)
  const aspectRatio = readOptionalString(payload.aspectRatio)
  const artStyle = readOptionalString(payload.artStyle)
  const userPrompt = readOptionalString(payload.userPrompt)
  const imageOptions = readImageOptions(payload.generationOptions)
  const presets = STYLE_PRESETS.slice(0, count)

  await reportTaskProgress(job, 12, {
    stage: 'visual_reference_prepare',
    stageLabel: 'progress.stage.visualReferencePrepare',
    displayMode: 'detail',
  })
  await assertTaskActive(job, 'visual_reference_prepare')

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
    const visualCase = await prisma.projectVisualReferenceCase.create({
      data: {
        projectId: job.data.projectId,
        episodeId,
        screenplayId,
        title: preset.title[job.data.locale],
        description: preset.description[job.data.locale],
        prompt,
        status: 'processing',
        taskId: job.data.taskId,
        sortIndex: index,
      },
      select: { id: true },
    })

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
