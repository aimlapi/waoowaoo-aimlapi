import type { EditScriptStyleBible } from '@/lib/edit-script/types'
import type { NovelProjectData, NumberedReferenceImage } from './image-task-handler-shared'
import {
  buildStoryboardStillPromptFacts,
  type StoryboardStillPromptFacts,
} from './panel-still-prompt-builder'

const GRID_CELL_POSITIONS = ['top_left', 'top_right', 'bottom_left', 'bottom_right'] as const

export type StoryboardGridPromptPanel = {
  readonly id: string
  readonly storyboardId: string
  readonly panelIndex: number
  readonly shotType: string | null
  readonly cameraMove: string | null
  readonly description: string | null
  readonly imagePrompt: string | null
  readonly videoPrompt: string | null
  readonly location: string | null
  readonly characters: string | null
  readonly props?: string | null
  readonly srtSegment: string | null
  readonly photographyRules: string | null
  readonly actingNotes: string | null
}

type StoryboardGridPromptCellContext =
  Omit<StoryboardStillPromptFacts['context'], 'reference_images' | 'NEGATIVE'>

export type StoryboardGridPromptCell = {
  readonly cell_index: number
  readonly cell_position: typeof GRID_CELL_POSITIONS[number]
  readonly panel_id: string
  readonly panel: StoryboardStillPromptFacts['panel']
  readonly reference_images: StoryboardStillPromptFacts['context']['reference_images']
  readonly panel_context: StoryboardGridPromptCellContext
}

export type StoryboardGridPromptFacts = {
  readonly grid: {
    readonly mode: '2x2'
    readonly source_video_block_id: string
    readonly safe_crop_rules: readonly string[]
    readonly cells: readonly StoryboardGridPromptCell[]
  }
  readonly context: {
    readonly reference_images: readonly NumberedReferenceImage[]
    readonly STYLE: readonly string[]
    readonly NEGATIVE: readonly string[]
  }
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function compactText(value: unknown, maxLength = 180): string | null {
  const normalized = normalizeString(value).replace(/\s+/g, ' ')
  if (!normalized) return null
  if (normalized.length <= maxLength) return normalized
  return `${normalized.slice(0, maxLength).trim()}...`
}

const VIDEO_TIME_PATTERN = /(?:video_prompt|视频提示|视频|duration|时长|fps|帧率|sound|声音|音效|配乐|bgm|旁白|voiceover|continuityIn|continuityOut|转场|切入|切出|镜头从|镜头随后|随后|推轨|横向轨道|轨道|推进|后撤|摇移|跟拍|拉远|推近|crane|dolly|track|tracking|truck|pan shot|camera move|camera path)/iu
const STYLE_OR_NEGATIVE_PATTERN = /(?:style bible|风格|负向约束|negative prompt|hard ban|watermark|no subtitles|no text)/iu

function splitSentences(value: unknown): string[] {
  const normalized = normalizeString(value)
  if (!normalized) return []
  return normalized.match(/[^。！？.!?；;\n]+[。！？.!?；;]?/gu)?.map((part) => part.trim()).filter(Boolean) || [normalized]
}

function sanitizeStaticStyleText(value: unknown, maxLength = 180): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_TIME_PATTERN.test(part))
    .filter((part) => !STYLE_OR_NEGATIVE_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

function sanitizeNegativeText(value: unknown, maxLength = 220): string | null {
  const kept = splitSentences(value)
    .filter((part) => !VIDEO_TIME_PATTERN.test(part))
  return compactText(kept.join(' '), maxLength)
}

export function buildGridSafeCropRules(): string[] {
  return [
    'Four equal cells with a clear empty gutter.',
    'Important subjects and required visible props stay inside the central 70% safe area of each cell.',
    'Use inner padding; do not place faces, hands, or key props on quadrant edges.',
    'No subject, limb, prop, light beam, or divider crosses cell boundaries.',
  ]
}

function buildCompactStyleBlock(styleBible: EditScriptStyleBible | null): string[] {
  if (!styleBible) return []
  const visual = styleBible.stylePolicy.visual
  const camera = styleBible.stylePolicy.camera
  return [
    ['visual_filter', visual.imageFilterPrompt],
    ['lighting', visual.lightingPrompt],
    ['color', visual.colorPrompt],
    ['global_composition', visual.compositionPrompt],
    ['camera_texture', camera.lensAndDepthPrompt],
  ].map(([label, value]) => {
    const sanitized = sanitizeStaticStyleText(value, 180)
    return sanitized ? `${label}: ${sanitized}` : null
  }).filter((item): item is string => Boolean(item))
}

function buildNegativeBlock(styleBible: EditScriptStyleBible | null): string[] {
  const defaults = [
    'no subtitles',
    'no text',
    'no labels',
    'no watermark',
    'no motion trails',
    'no camera path visualization',
    'no duplicated props',
    'no extra unlisted characters',
    'no extra unlisted props',
  ]
  if (!styleBible) return defaults
  const negative = sanitizeNegativeText(styleBible.stylePolicy.visual.negativePrompt, 220)
  const hardBans = styleBible.stylePolicy.hardBans
    .map((ban) => sanitizeNegativeText(ban, 120))
    .filter((ban): ban is string => Boolean(ban))
    .slice(0, 6)
  return [
    ...defaults,
    ...(negative ? [negative] : []),
    ...hardBans,
  ]
}

function buildGridCell(input: {
  readonly panel: StoryboardGridPromptPanel
  readonly index: number
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
}): StoryboardGridPromptCell {
  const facts = buildStoryboardStillPromptFacts({
    panel: input.panel,
    projectData: input.projectData,
    referenceImagesMap: input.referenceImagesMap,
  })
  return {
    cell_index: input.index,
    cell_position: GRID_CELL_POSITIONS[input.index] || 'bottom_right',
    panel_id: input.panel.id,
    panel: facts.panel,
    reference_images: facts.context.reference_images,
    panel_context: {
      COMPILER_V2: facts.context.COMPILER_V2,
      LOCATION_ZONE: facts.context.LOCATION_ZONE,
      GLOBAL_SCENE_LOCK: facts.context.GLOBAL_SCENE_LOCK
        ? {
            source: facts.context.GLOBAL_SCENE_LOCK.source,
            summary: null,
            lighting: null,
            stable_background: facts.context.GLOBAL_SCENE_LOCK.stable_background,
          }
        : null,
      CHARACTER_GRAPH: facts.context.CHARACTER_GRAPH,
      PROP_GRAPH: facts.context.PROP_GRAPH,
    },
  }
}

function uniqueReferenceImages(cells: readonly StoryboardGridPromptCell[]): readonly NumberedReferenceImage[] {
  const seen = new Set<string>()
  const output: NumberedReferenceImage[] = []
  for (const cell of cells) {
    for (const reference of cell.reference_images) {
      if (seen.has(reference.image_no)) continue
      seen.add(reference.image_no)
      output.push(reference)
    }
  }
  return output
}

export function buildStoryboardGridPromptFacts(input: {
  readonly panels: readonly StoryboardGridPromptPanel[]
  readonly projectData: NovelProjectData
  readonly referenceImagesMap: readonly NumberedReferenceImage[]
  readonly sourceVideoBlockId: string
  readonly styleBible: EditScriptStyleBible | null
}): StoryboardGridPromptFacts {
  const cells = input.panels.map((panel, index) => buildGridCell({
    panel,
    index,
    projectData: input.projectData,
    referenceImagesMap: input.referenceImagesMap,
  }))
  return {
    grid: {
      mode: '2x2',
      source_video_block_id: input.sourceVideoBlockId,
      safe_crop_rules: buildGridSafeCropRules(),
      cells,
    },
    context: {
      reference_images: uniqueReferenceImages(cells),
      STYLE: buildCompactStyleBlock(input.styleBible),
      NEGATIVE: buildNegativeBlock(input.styleBible),
    },
  }
}

function stringifyList(items: readonly string[]): string {
  return items.length > 0 ? items.map((item) => `- ${item}`).join('\n') : '- none'
}

function jsonBlock(value: unknown): string {
  return JSON.stringify(value, null, 2)
}

function stringifyCell(cell: StoryboardGridPromptCell | undefined, label: string, index: number): string {
  if (!cell) {
    return [
      `CELL ${index + 1} ${label}`,
      'unused cell: keep visually simple and non-narrative; no new story, no new props, no labels.',
    ].join('\n')
  }
  return [
    `CELL ${cell.cell_index + 1} ${label}`,
    `panel_id: ${cell.panel_id}`,
    'SHOT_PRIORITY',
    jsonBlock(cell.panel.still_frame.shot_priority),
    'LOCATION_ZONE',
    jsonBlock(cell.panel_context.LOCATION_ZONE),
    'GLOBAL_SCENE_LOCK',
    jsonBlock(cell.panel_context.GLOBAL_SCENE_LOCK),
    'CHARACTER_GRAPH',
    jsonBlock(cell.panel_context.CHARACTER_GRAPH),
    'PROP_GRAPH',
    jsonBlock(cell.panel_context.PROP_GRAPH),
    'STILL_FRAME',
    jsonBlock(cell.panel.still_frame),
  ].join('\n')
}

export function buildStoryboardGridPrompt(input: {
  readonly aspectRatio: string
  readonly facts: StoryboardGridPromptFacts
}): string {
  const facts = input.facts
  return [
    'GLOBAL TASK',
    `Generate one 2x2 storyboard contact sheet for sourceVideoBlockId ${facts.grid.source_video_block_id}. It will be mechanically cropped into four equal quadrants. Aspect ratio: ${input.aspectRatio}.`,
    '',
    'BOUNDARY RULES',
    'Each cell is a single still frame, not a video clip.',
    'Use each cell SHOT_PRIORITY as the highest authority for that panel.',
    'Each cell LOCATION_ZONE is the only local scene-area source for that panel; GLOBAL_SCENE_LOCK is only a light continuity reference.',
    'For each cell, default to showing all assets listed in visible_subjects and visible_props. Omit an asset only when it is listed in omitted_scene_assets or the shot is a tight detail that truly crops it out.',
    'Do not invent characters, props, room areas, readable labels, subtitles, numbers, or motion-path language.',
    '',
    'GRID RULES',
    stringifyList([
      'Four equal cells, clear empty gutter, no overlap, no labels, no numbers, no text.',
      ...facts.grid.safe_crop_rules,
      'Do not reorder panelIds: top_left, top_right, bottom_left, bottom_right.',
    ]),
    '',
    'REFERENCE_IMAGES',
    jsonBlock(facts.context.reference_images),
    '',
    'STYLE',
    stringifyList(facts.context.STYLE),
    '',
    stringifyCell(facts.grid.cells[0], 'TOP_LEFT', 0),
    '',
    stringifyCell(facts.grid.cells[1], 'TOP_RIGHT', 1),
    '',
    stringifyCell(facts.grid.cells[2], 'BOTTOM_LEFT', 2),
    '',
    stringifyCell(facts.grid.cells[3], 'BOTTOM_RIGHT', 3),
    '',
    'NEGATIVE',
    stringifyList(facts.context.NEGATIVE),
  ].join('\n')
}
