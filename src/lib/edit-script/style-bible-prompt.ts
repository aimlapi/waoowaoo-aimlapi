import { createHash } from 'crypto'
import type { Locale } from '@/i18n/routing'
import { prisma } from '@/lib/prisma'
import { editScriptStyleBibleSchema, type EditScriptStyleBible } from './types'

export type StyleBiblePromptUsage = 'assetImage' | 'storyboardImage' | 'video'

type StyleBibleCarrier = {
  readonly styleBibleJson: unknown
} | null

function trimText(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function joinLines(lines: ReadonlyArray<string | null | undefined>): string {
  return lines
    .map((line) => trimText(line))
    .filter((line): line is string => line !== null)
    .join('\n')
}

const DEAD_VISUAL_BAN_LATIN_PATTERNS = [
  'text',
  'word',
  'subtitle',
  'caption',
  'watermark',
  'logo',
  'label',
  'symbol',
  'annotation',
]

const DEAD_VISUAL_BAN_CJK_PATTERNS = [
  '文字',
  '字幕',
  '花字',
  '水印',
  '标注',
  '标签',
  '符号',
  '编号',
]

function isDeadVisualBan(value: string): boolean {
  const normalized = value.trim().toLowerCase()
  if (!normalized) return true
  return DEAD_VISUAL_BAN_LATIN_PATTERNS.some((pattern) => {
    const patternRegex = new RegExp(`\\b${pattern}s?\\b`, 'u')
    return patternRegex.test(normalized)
  }) || DEAD_VISUAL_BAN_CJK_PATTERNS.some((pattern) => normalized.includes(pattern))
}

function sanitizeVisualNegativePrompt(value: string, locale: Locale): string | null {
  const segments = value
    .split(/[;,；，、]/u)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !isDeadVisualBan(segment))

  if (segments.length === 0) return null
  return segments.join(locale === 'en' ? '; ' : '，')
}

function renderNegativeConstraintsLine(styleBible: EditScriptStyleBible, locale: Locale): string | null {
  const negativePrompt = sanitizeVisualNegativePrompt(styleBible.stylePolicy.visual.negativePrompt, locale)
  if (!negativePrompt) return null
  return locale === 'en'
    ? `Negative constraints: ${negativePrompt}`
    : `负向约束：${negativePrompt}`
}

function renderHardBansLine(styleBible: EditScriptStyleBible, locale: Locale): string | null {
  const hardBans = styleBible.stylePolicy.hardBans.filter((item) => !isDeadVisualBan(item))
  if (hardBans.length === 0) return null
  return locale === 'en'
    ? `Hard bans: ${hardBans.join('; ')}`
    : `硬禁用项：${hardBans.join('；')}`
}

function appendBlock(base: string, block: string): string {
  const trimmedBase = base.trim()
  const trimmedBlock = block.trim()
  if (!trimmedBlock) return trimmedBase
  if (!trimmedBase) return trimmedBlock
  return `${trimmedBase}\n\n${trimmedBlock}`
}

export function parseNullableEditScriptStyleBible(value: unknown): EditScriptStyleBible | null {
  if (value === null || value === undefined) return null
  const parsed = editScriptStyleBibleSchema.safeParse({ styleBible: value })
  if (!parsed.success) {
    throw new Error('EDIT_SCRIPT_STYLE_BIBLE_INVALID')
  }
  return parsed.data.styleBible
}

function styleBibleFromCarrier(carrier: StyleBibleCarrier): EditScriptStyleBible | null {
  if (!carrier) return null
  return parseNullableEditScriptStyleBible(carrier.styleBibleJson)
}

export async function resolveEditScriptStyleBibleForTask(input: {
  readonly projectId: string
  readonly episodeId?: string | null
}): Promise<EditScriptStyleBible | null> {
  const episodeId = trimText(input.episodeId)
  if (!episodeId) return null

  const script = await prisma.projectEditScript.findFirst({
    where: {
      projectId: input.projectId,
      episodeId,
    },
    select: {
      styleBibleJson: true,
    },
  })
  const scriptStyleBible = styleBibleFromCarrier(script)
  if (scriptStyleBible) return scriptStyleBible

  const screenplay = await prisma.projectEditScreenplay.findFirst({
    where: {
      projectId: input.projectId,
      episodeId,
    },
    select: {
      styleBibleJson: true,
    },
  })
  return styleBibleFromCarrier(screenplay)
}

export async function resolveEditScriptStyleBibleForStoryboardTask(input: {
  readonly projectId: string
  readonly episodeId?: string | null
  readonly storyboardId?: string | null
}): Promise<EditScriptStyleBible | null> {
  const episodeId = trimText(input.episodeId)
  if (episodeId) {
    return await resolveEditScriptStyleBibleForTask({
      projectId: input.projectId,
      episodeId,
    })
  }

  const storyboardId = trimText(input.storyboardId)
  if (!storyboardId) return null
  const storyboard = await prisma.projectStoryboard.findUnique({
    where: { id: storyboardId },
    select: { episodeId: true },
  })
  return await resolveEditScriptStyleBibleForTask({
    projectId: input.projectId,
    episodeId: storyboard?.episodeId ?? null,
  })
}

export async function resolveEditScriptStyleBibleSignatureForTask(input: {
  readonly projectId: string
  readonly episodeId?: string | null
  readonly storyboardId?: string | null
}): Promise<string> {
  const styleBible = await resolveEditScriptStyleBibleForStoryboardTask(input)
  if (!styleBible) return 'style-bible:none'
  const digest = createHash('sha1')
    .update(JSON.stringify(styleBible))
    .digest('hex')
    .slice(0, 16)
  return `style-bible:${digest}`
}

function renderVisualLines(styleBible: EditScriptStyleBible, locale: Locale, usage: StyleBiblePromptUsage): string[] {
  const visual = styleBible.stylePolicy.visual
  if (locale === 'en') {
    const base = [
      `Image filter: ${visual.imageFilterPrompt}`,
      `Lighting: ${visual.lightingPrompt}`,
      `Color: ${visual.colorPrompt}`,
      usage === 'assetImage' ? `Texture: ${visual.texturePrompt}` : null,
      usage === 'video' ? null : `Composition: ${visual.compositionPrompt}`,
      renderNegativeConstraintsLine(styleBible, locale),
      renderHardBansLine(styleBible, locale),
    ]
    return base.filter((line): line is string => typeof line === 'string')
  }
  const base = [
    `画面滤镜：${visual.imageFilterPrompt}`,
    `光线：${visual.lightingPrompt}`,
    `色彩：${visual.colorPrompt}`,
    usage === 'assetImage' ? `质感：${visual.texturePrompt}` : null,
    usage === 'video' ? null : `构图：${visual.compositionPrompt}`,
    renderNegativeConstraintsLine(styleBible, locale),
    renderHardBansLine(styleBible, locale),
  ]
  return base.filter((line): line is string => typeof line === 'string')
}

function renderCameraLines(styleBible: EditScriptStyleBible, locale: Locale, usage: StyleBiblePromptUsage): string[] {
  const camera = styleBible.stylePolicy.camera
  if (usage !== 'storyboardImage') return []
  if (locale === 'en') {
    return [
      `Lens and depth: ${camera.lensAndDepthPrompt}`,
    ]
  }
  return [
    `镜头与景深：${camera.lensAndDepthPrompt}`,
  ]
}

export function renderStyleBiblePromptBlock(input: {
  readonly styleBible: EditScriptStyleBible
  readonly usage: StyleBiblePromptUsage
  readonly locale: Locale
}): string {
  const { styleBible, usage, locale } = input
  const title = locale === 'en'
    ? 'System Style Bible requirements, fixed append, must follow:'
    : '系统 Style Bible 视觉要求（固定追加，必须遵守）：'
  const usageLine = (() => {
    if (locale === 'en') {
      if (usage === 'assetImage') return 'Usage: asset image generation. Apply these visual rules to the generated asset itself.'
      if (usage === 'storyboardImage') return 'Usage: storyboard image generation. Apply these visual rules and lens/depth feel to the whole frame.'
      return 'Usage: final video generation. Apply these visual rules to the generated video.'
    }
    if (usage === 'assetImage') return '用途：资产图生成。将这些视觉规则应用到资产本身。'
    if (usage === 'storyboardImage') return '用途：分镜图生成。将这些视觉规则与镜头景深质感应用到整张画面。'
    return '用途：最终视频生成。将这些视觉规则应用到生成视频。'
  })()

  const lines = [
    title,
    usageLine,
    ...renderVisualLines(styleBible, locale, usage),
    ...(usage === 'assetImage' ? [] : renderCameraLines(styleBible, locale, usage)),
  ]

  return joinLines(lines)
}

export function appendStyleBiblePromptBlock(input: {
  readonly prompt: string
  readonly styleBible: EditScriptStyleBible | null
  readonly usage: StyleBiblePromptUsage
  readonly locale: Locale
}): string {
  if (!input.styleBible) return input.prompt
  return appendBlock(input.prompt, renderStyleBiblePromptBlock({
    styleBible: input.styleBible,
    usage: input.usage,
    locale: input.locale,
  }))
}
