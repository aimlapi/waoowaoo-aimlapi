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

interface VisualReferenceCaseForGeneration {
  readonly id: string
  readonly status: string
  readonly imageUrl: string | null
}

const STYLE_PRESETS: readonly VisualReferenceStylePreset[] = [
  {
    key: 'pastel-fable-tableau',
    title: {
      zh: '粉彩寓言图景',
      en: 'Pastel Fable Tableau',
    },
    description: {
      zh: '粉彩天空、童话式对称构图、清爽日光和精心摆放的道具，让惊悚故事呈现反差感。',
      en: 'Pastel skies, fable-like symmetry, crisp daylight, and carefully staged props, turning suspense into a deceptively innocent world.',
    },
    visualDirection: 'pastel storybook tableau, centered symmetrical composition, flat frontal camera, clean sky blue and coral palette, sunlit miniature-like world, carefully color-coordinated wardrobe and props, deadpan character staging, innocent surface hiding psychological dread, crisp 16mm still-frame texture',
  },
  {
    key: 'amber-urban-memory',
    title: {
      zh: '暖金都市旧梦',
      en: 'Amber Urban Memory',
    },
    description: {
      zh: '浓烈暖金、旧墙纹理、窄巷压迫和高饱和服装，把记忆、欲望与罪责压进同一帧。',
      en: 'Dense amber light, aged wall texture, narrow urban pressure, and saturated wardrobe, compressing memory, desire, and guilt into one frame.',
    },
    visualDirection: 'saturated amber urban memory, tungsten practical light, textured old plaster walls, cramped corridor or alley staging, characters separated by negative space, floral or patterned costume accent, smoky grain, deep warm shadows, overheated color density, romantic guilt and suspended time',
  },
  {
    key: 'snowbound-analog-realism',
    title: {
      zh: '冰雪粗粝现实',
      en: 'Snowbound Analog Realism',
    },
    description: {
      zh: '冷白雪地、粗颗粒胶片、荒凉自然光和手工质感，让心理悬疑变得寒冷、原始、笨重。',
      en: 'Cold white snow, rough analog grain, barren natural light, and handmade texture, making the thriller feel cold, primitive, and heavy.',
    },
    visualDirection: 'snowbound analog realism, overexposed winter whites, muted brown and rust accents, rough 1970s film grain, handheld documentary distance, barren trees and crude practical objects, wind-bitten faces, awkward human posture, raw natural light, heavy rural austerity and existential dread',
  },
  {
    key: 'clinical-institutional-dread',
    title: {
      zh: '冷白机构恐惧',
      en: 'Clinical Institutional Dread',
    },
    description: {
      zh: '荧光灯、低饱和、对称走廊和监控式距离，突出诊断、档案与精神崩塌。',
      en: 'Fluorescent light, low saturation, symmetrical corridors, and surveillance distance for diagnosis, records, and mental collapse.',
    },
    visualDirection: 'clinical institutional dread, cold fluorescent whites and sickly green, low saturation, symmetrical corridor geometry, CCTV-like distance, documentary stillness, hard tiled surfaces, psychiatric ward unease, strictly modern institutional world',
  },
  {
    key: 'expressionist-shadow-double',
    title: {
      zh: '表现主义暗影分身',
      en: 'Expressionist Shadow Double',
    },
    description: {
      zh: '极端明暗、扭曲空间、巨大影子和双重自我，把心理裂缝直接图像化。',
      en: 'Extreme chiaroscuro, distorted space, oversized shadows, and doubled selves, turning the psychic fracture into graphic form.',
    },
    visualDirection: 'expressionist psychological thriller, extreme chiaroscuro, distorted perspective, oversized shadows, doubled figure motif, hard black shapes, tilted architecture, surreal guilt visualization, graphic nightmare atmosphere, theatrical unreality',
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
    title: input.preset.title[input.job.data.locale],
    description: input.preset.description[input.job.data.locale],
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
