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
  readonly category: 'live_action' | 'animation'
  readonly title: string
  readonly description: string
  readonly visualDirection: string
}

interface VisualReferenceCaseForGeneration {
  readonly id: string
  readonly status: string
  readonly imageUrl: string | null
}

const VISUAL_REFERENCE_CASE_COUNT = 2

const ANIMATION_STYLE_LIBRARY = {
  medium: ['二维动画', '三维动画', '定格动画', '插画动画', '像素动画'],
  material: ['粘土', '纸艺', '布艺', '木质', '颜料', '墨绘'],
  visualStyle: ['写实', '风格化', '卡通化', '绘画感', '低多边形'],
  colorPalette: ['暖色调', '冷色调', '低饱和', '高饱和'],
  mood: ['浪漫', '忧郁', '压抑', '梦幻', '悬疑', '荒诞', '史诗'],
} as const

const LIVE_ACTION_STYLE_LIBRARY = {
  realism: ['纪录片式', '现实主义', '诗意现实主义', '风格化现实主义', '超现实主义', '梦境现实主义'],
  colorPalette: ['暖色调', '冷色调', '低饱和', '高饱和', '黑白', '胶片褪色', '青橙对比', '莫兰迪', '剪虹色彩', '单色主导'],
  mood: ['浪漫', '忧郁', '怀旧', '孤独', '梦幻', '温暖', '压抑', '荒诞', '悬疑', '惊悚', '史诗', '狂欢'],
} as const

function renderStyleLibrary(library: Record<string, readonly string[]>): string {
  return Object.entries(library)
    .map(([dimension, values]) => `${dimension}: ${values.join(' / ')}`)
    .join('\n')
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
  if (value === undefined || value === null) return VISUAL_REFERENCE_CASE_COUNT
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) throw new Error('count must be a finite number')
  const count = Math.floor(parsed)
  if (count < 1 || count > VISUAL_REFERENCE_CASE_COUNT) {
    throw new Error(`visual reference case count must be between 1 and ${VISUAL_REFERENCE_CASE_COUNT}`)
  }
  return count
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
}): string {
  const screenplayPreview = compactText(input.screenplayText, 2600)
  const userPromptPreview = input.userPrompt ? compactText(input.userPrompt, 500) : ''
  const liveActionLibrary = renderStyleLibrary(LIVE_ACTION_STYLE_LIBRARY)
  const animationLibrary = renderStyleLibrary(ANIMATION_STYLE_LIBRARY)
  if (input.locale === 'en') {
    return [
      `Read the confirmed screenplay and design exactly ${VISUAL_REFERENCE_CASE_COUNT} visual reference style options for this specific story: one live-action-facing option and one animation-facing option.`,
      'The options must be inferred from this screenplay: genre, location, era, emotional rhythm, themes, character relationships, production scale, and key situations.',
      'First choose one shared representative scene from the screenplay. Both options must depict that exact same scene, same characters, same character positions, same props, same camera angle family, and same spatial composition. Only the visual style changes.',
      'These images are style-case references for the overall tone. They are not storyboards, not asset sheets, and not exact templates to copy later. Future editing rhythm, art direction, character look, locations, props, lighting, staging, and performance should use them as tone guidance without directly duplicating the image.',
      'For the live-action-facing option, combine the best-fitting values from this library, and infer a concrete scene art direction from the screenplay. Do not use every value; choose only what fits.',
      liveActionLibrary,
      'For the animation-facing option, combine the best-fitting values from this library. Do not use every value; choose only what fits.',
      animationLibrary,
      'The two options must differ at the category and medium level: camera/photo realism vs animation rendering. The difference must be obvious in medium, material texture, lighting, palette, production design, body language, and atmosphere.',
      'All options must prefer medium-long shots, long shots, or wide establishing compositions, showing characters inside an environment. Avoid close-ups, face close-ups, tight bust shots, cropped portraits, and macro details.',
      'Return strict JSON only. No markdown. No extra prose.',
      'Schema: [{"key":"kebab-case-id","category":"live_action","title":"short user-facing title","description":"one concise sentence","visualDirection":"detailed image-generation direction"},{"key":"kebab-case-id","category":"animation","title":"short user-facing title","description":"one concise sentence","visualDirection":"detailed image-generation direction"}]',
      'The first item must be category live_action. The second item must be category animation.',
      'Each visualDirection must explicitly include: "Shared scene: ..." describing the identical scene content, "Chosen dimensions: ..." listing the selected library values and inferred scene art direction when relevant, and "Style treatment: ..." describing only that option’s style transformation.',
      'Keep title short. Keep description concrete. visualDirection should be directly usable in an image prompt and must include wide/medium-long framing guidance.',
      userPromptPreview ? `User request: ${userPromptPreview}` : '',
      `Screenplay: ${screenplayPreview}`,
    ].filter(Boolean).join('\n')
  }
  return [
    `请阅读这份已经确认的剧本，并为这个剧本专门设计 ${VISUAL_REFERENCE_CASE_COUNT} 个视觉参考风格方案：一个真人向，一个动画向。`,
    '这些方案必须从本剧本里推导出来：类型、地点、时代、情绪节奏、主题、人物关系、制作规模和关键场面。不要复用固定预设组合。',
    '请先从剧本中选择一个共享代表场景。两个方案必须表现完全同一个场景、同一批人物、同一人物站位、同一道具、同一类机位和同一个空间构图，只允许风格发生变化。',
    '这些图片只是后续制作的风格案例参考，用来约束整体基调，不是正式分镜、不是资产设定图，也不是后续要照搬的模板。后续剪辑节奏、画风、角色形象、场景、道具、打光、调度和表演只能参考其整体气质，不能直接复制画面。',
    '真人向方案必须从下面素材库里组合最贴剧本的维度，并根据剧本推导具体场景美术。不要全选，只选最适合的。',
    liveActionLibrary,
    '动画向方案必须从下面素材库里组合最贴剧本的维度。不要全选，只选最适合的。',
    animationLibrary,
    '两个方案必须是类别和媒介级差异：摄影机/照片写实 vs 动画渲染；媒介、材质、光线、色彩、美术、人物肢体和整体气氛都必须肉眼明显不同。',
    '所有方案都必须优先中远景、远景或全景式建立镜头，把人物放在环境里展示整体风格。避免脸部特写、半身特写、裁切头像和微距细节。',
    '只返回严格 JSON，不要 markdown，不要解释。',
    '格式：[{"key":"英文短横线id","category":"live_action","title":"给用户看的短标题","description":"一句具体说明","visualDirection":"可直接用于图像生成的详细视觉方向"},{"key":"英文短横线id","category":"animation","title":"给用户看的短标题","description":"一句具体说明","visualDirection":"可直接用于图像生成的详细视觉方向"}]',
    '第一项 category 必须是 live_action，第二项 category 必须是 animation。',
    '每个 visualDirection 必须明确包含：“共享场景：……”描述相同场景内容，“维度组合：……”列出选中的素材库维度与必要的场景美术推导，然后包含“风格处理：……”只描述该方案的风格变化。',
    'title 要短，description 要具体，visualDirection 必须能直接进入生图提示词，并且包含中远景/整体环境构图要求。',
    userPromptPreview ? `用户需求：${userPromptPreview}` : '',
    `剧本：${screenplayPreview}`,
  ].filter(Boolean).join('\n')
}

function expectedCategory(index: number): VisualReferenceStylePreset['category'] {
  return index === 0 ? 'live_action' : 'animation'
}

function normalizeStylePlanItem(item: unknown, index: number): VisualReferenceStylePreset {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new Error(`styles[${index}] must be an object`)
  }
  const record = item as Record<string, unknown>
  const key = typeof record.key === 'string' && record.key.trim()
    ? record.key.trim()
    : `script-derived-style-${index + 1}`
  const category = readRequiredString(record.category, `styles[${index}].category`)
  const requiredCategory = expectedCategory(index)
  if (category !== requiredCategory) {
    throw new Error(`VISUAL_REFERENCE_STYLE_CATEGORY_MISMATCH: styles[${index}] expected ${requiredCategory}, got ${category}`)
  }
  const title = readRequiredString(record.title, `styles[${index}].title`)
  const description = readRequiredString(record.description, `styles[${index}].description`)
  const visualDirection = readRequiredString(record.visualDirection, `styles[${index}].visualDirection`)
  return {
    key,
    category: requiredCategory,
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
  const plans = rows.slice(0, VISUAL_REFERENCE_CASE_COUNT).map((item, index) => normalizeStylePlanItem(item, index))
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
  readonly preset: VisualReferenceStylePreset
}) {
  const screenplayPreview = compactText(input.screenplayText, 1600)
  const userPromptPreview = input.userPrompt ? compactText(input.userPrompt, 360) : ''
  if (input.locale === 'en') {
    return [
      'Create one standalone visual reference image for a confirmed screenplay.',
      'This is only a mood/style reference for the user. It must not look like a storyboard panel, asset sheet, UI mockup, poster with text, or production diagram.',
      `Visual direction: ${input.preset.visualDirection}.`,
      `Style category: ${input.preset.category}. Commit to this category and to the chosen dimensions named in Visual direction.`,
      'The live-action and animation cases must be radically different at the medium level, not merely different color grades.',
      'Do not choose a new moment from the screenplay. Use the shared scene described inside Visual direction exactly; preserve its characters, positions, props, camera angle family, and spatial composition. Change only the style treatment.',
      'This image is a style case for overall tone only. It must guide later editing rhythm, art direction, character look, locations, props, lighting, staging, and performance without becoming a frame to copy directly.',
      'Use a medium-long shot, long shot, or wide establishing composition. Show the characters within the surrounding environment so the overall art direction, set design, color world, and spatial layout are visible. Avoid close-ups, face close-ups, tight bust shots, cropped portraits, macro details, or any small-scale framing that hides the style world.',
      input.aspectRatio ? `Aspect ratio: ${input.aspectRatio}.` : '',
      userPromptPreview ? `Original request: ${userPromptPreview}` : '',
      `Screenplay excerpt: ${screenplayPreview}`,
      'Render this shared-scene style variant as a polished key image. Make the medium and genre difference unmistakable at thumbnail size. No captions, no subtitles, no text overlays, no logos.',
    ].filter(Boolean).join('\n')
  }
  return [
    '为一份已经确认的剧本生成一张独立的画面风格参考图。',
    '这只是交给用户看的画面气质参考，不是正式分镜、不是角色资产设定图、不是海报、不是 UI，也不是生产流程图。',
    `视觉方向：${input.preset.visualDirection}。`,
    `风格大类：${input.preset.category}。必须严格执行这个大类和视觉方向里的维度组合。`,
    '真人向与动画向生成结果必须是媒介级巨大差异，不是轻微调色或同一种写实图的不同滤镜。',
    '不要重新从剧本里选择其他瞬间。必须严格使用视觉方向里描述的共享场景，保留同一批人物、人物站位、道具、机位类型和空间构图，只改变画风处理。',
    '这张图只作为整体基调的风格案例。后续剪辑节奏、画风、角色形象、场景、道具、打光策略、场面调度和角色表演都要参考它的气质，但不能直接照搬画面。',
    '景别请优先使用中远景、远景或全景式建立镜头。人物要放在环境里，让整体美术风格、场景设计、色彩世界和空间关系都能看清楚。避免脸部特写、半身特写、裁切头像、微距细节或任何看不清整体风格的小景别。',
    input.aspectRatio ? `画幅比例：${input.aspectRatio}。` : '',
    userPromptPreview ? `用户原始需求：${userPromptPreview}` : '',
    `剧本节选：${screenplayPreview}`,
    '请把这个共享场景的画风变体生成一张完成度高的关键画面，在缩略图尺寸也必须一眼看出媒介和类型差异。不要字幕、不要说明文字、不要 logo、不要文字叠加。',
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
