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

export function renderSelectedVisualReferenceStylePromptBlock(input: {
  readonly style: SelectedVisualReferenceStyle
  readonly locale: Locale
}): string {
  const title = compactText(input.style.title, 80)
  const description = compactText(input.style.description, 220)
  const prompt = compactText(input.style.prompt, 900)
  if (input.locale === 'en') {
    return [
      'Selected visual reference style, highest priority:',
      'Use the selected style reference image as the visual source of truth for rendering style.',
      'If this block conflicts with older project style config, system style preset, or older Style Bible wording, follow this selected visual reference.',
      `Selected style title: ${title}`,
      `Selected style description: ${description}`,
      `Selected style generation prompt: ${prompt}`,
      'Preserve the selected reference image visual language: medium, realism level, palette, lighting, texture, lens feeling, production design, and atmosphere.',
      'Use it as tone and style guidance only; never directly copy its exact composition, character positions, prop layout, or scene moment.',
      'Do not convert photorealistic selected references into anime/comic/illustration unless the selected reference itself is clearly anime/comic/illustration.',
    ].join('\n')
  }
  return [
    '选中的视觉风格案例（最高优先级）：',
    '必须把用户选中的风格案例图作为后续画风的事实来源。',
    '如果本段与旧项目风格配置、系统风格预设或旧 Style Bible 文字冲突，必须以这个选中的视觉风格案例为准。',
    `选中风格标题：${title}`,
    `选中风格描述：${description}`,
    `选中风格生成提示词：${prompt}`,
    '请继承该风格案例图的媒介属性、写实/绘画程度、色彩体系、光线、材质颗粒、镜头感、美术设计和整体氛围。',
    '它只用于整体基调和风格语言参考；绝对不要直接复制案例图的具体构图、人物站位、道具摆法或场景瞬间。',
    '除非选中的风格案例本身就是动漫/漫画/插画，否则禁止把写实风格转换成动漫、漫画或插画风。',
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
