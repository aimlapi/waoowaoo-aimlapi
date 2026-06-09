import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'

export type SelectedVisualReferenceStyle = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly imageUrl: string | null
}

type VisualReferenceStyleRow = {
  readonly id: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly imageUrl: string | null
  readonly imageMedia: {
    readonly publicId: string
  } | null
}

type SelectedVisualReferenceDb = {
  projectVisualReferenceCase: {
    findFirst(args: Record<string, unknown>): Promise<VisualReferenceStyleRow | null>
  }
}

function mediaUrl(publicId: string): string {
  return `/m/${encodeURIComponent(publicId)}`
}

function compactText(value: string, limit: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= limit) return normalized
  return `${normalized.slice(0, limit).trim()}...`
}

const NON_REUSABLE_STYLE_PROMPT_PATTERNS: readonly RegExp[] = [
  /共享场景/,
  /同一批人物/,
  /人物站位/,
  /道具摆法/,
  /具体场景瞬间/,
  /不要重新从剧本里选择其他瞬间/,
  /必须严格使用视觉方向/,
  /只改变画风处理/,
  /same scene/i,
  /same characters/i,
  /character positions/i,
  /prop layout/i,
  /exact scene moment/i,
]

function splitPromptSentences(value: string): string[] {
  return value.match(/[^。！？.!?]+[。！？.!?]?/g)?.map((item) => item.trim()).filter(Boolean) || []
}

export function extractReusableVisualReferenceStylePrompt(value: string): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const reusableSentences = splitPromptSentences(normalized).filter((sentence) =>
    !NON_REUSABLE_STYLE_PROMPT_PATTERNS.some((pattern) => pattern.test(sentence)),
  )
  return reusableSentences.join(' ').trim()
}

export async function resolveSelectedVisualReferenceStyle(input: {
  readonly projectId: string
  readonly episodeId?: string | null
}): Promise<SelectedVisualReferenceStyle | null> {
  const episodeId = typeof input.episodeId === 'string' && input.episodeId.trim()
    ? input.episodeId.trim()
    : null
  const db = prisma as unknown as SelectedVisualReferenceDb
  const row = await db.projectVisualReferenceCase.findFirst({
    where: {
      projectId: input.projectId,
      ...(episodeId ? { episodeId } : {}),
      isSelected: true,
      status: 'completed',
    },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true,
      title: true,
      description: true,
      prompt: true,
      imageUrl: true,
      imageMedia: {
        select: {
          publicId: true,
        },
      },
    },
  })
  if (!row) return null
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    prompt: row.prompt,
    imageUrl: row.imageMedia ? mediaUrl(row.imageMedia.publicId) : row.imageUrl,
  }
}

export async function requireSelectedVisualReferenceStyle(input: {
  readonly projectId: string
  readonly episodeId?: string | null
}): Promise<SelectedVisualReferenceStyle> {
  const style = await resolveSelectedVisualReferenceStyle(input)
  if (!style) {
    throw new Error('SELECTED_VISUAL_REFERENCE_STYLE_REQUIRED')
  }
  return style
}

export function renderSelectedVisualReferenceStylePromptBlock(input: {
  readonly style: SelectedVisualReferenceStyle
  readonly locale: Locale
}): string {
  const title = compactText(input.style.title, 80)
  const description = compactText(input.style.description, 220)
  if (input.locale === 'en') {
    return [
      'Selected visual reference style, highest priority:',
      'Use the selected style reference image as the only visual style source of truth for rendering style.',
      'Do not use project style config, system style presets, or any text-only style policy as a parallel style source.',
      `Selected style title: ${title}`,
      `Selected style description: ${description}`,
      'Preserve the selected reference image visual language: medium, realism level, palette, lighting, texture, lens feeling, production design, and atmosphere.',
      'Do not reuse any scene-specific instructions from the reference-case prompt, including shared scene, character identity, character count, blocking, prop layout, or action moment.',
      'Use it as tone and style guidance only; never directly copy its exact composition, character positions, prop layout, or scene moment.',
      'The selected reference medium is binding: keep live-action references live-action, keep animation/comic/illustration/CG/stop-motion references in that selected medium, and never translate the case into another medium category.',
    ].join('\n')
  }
  return [
    '选中的视觉风格案例（最高优先级）：',
    '必须把用户选中的风格案例图作为后续画风的唯一事实来源。',
    '不要把项目风格配置、系统风格预设或任何纯文字风格规则当成并列风格来源。',
    `选中风格标题：${title}`,
    `选中风格描述：${description}`,
    '请继承该风格案例图的媒介属性、写实/绘画程度、色彩体系、光线、材质颗粒、镜头感、美术设计和整体氛围。',
    '不要沿用案例提示词里的共享场景、角色身份、人物数量、人物站位、动作瞬间或道具布局；这些只属于案例图本身。',
    '它只用于整体基调和风格语言参考；绝对不要直接复制案例图的具体构图、人物站位、道具摆法或场景瞬间。',
    '选中案例的媒介类别具有约束力：真人案例保持真人向，动画/漫画/插画/CG/定格案例保持对应媒介，绝对不要把当前案例翻译成另一种媒介类别。',
  ].join('\n')
}

export function appendSelectedVisualReferenceStylePromptBlock(input: {
  readonly prompt: string
  readonly style: SelectedVisualReferenceStyle | null
  readonly locale: Locale
}): string {
  if (!input.style) return input.prompt
  const block = renderSelectedVisualReferenceStylePromptBlock({
    style: input.style,
    locale: input.locale,
  })
  const trimmedPrompt = input.prompt.trim()
  return trimmedPrompt ? `${trimmedPrompt}\n\n${block}` : block
}
