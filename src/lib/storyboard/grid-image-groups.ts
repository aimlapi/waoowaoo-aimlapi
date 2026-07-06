const GRID_CELL_COUNT = 4

export type StoryboardPanelImageGenerationMode = 'grid'

export type StoryboardGridGroupingPanel = {
  readonly id: string
  readonly storyboardId: string
  readonly panelIndex: number
  readonly photographyRules: string | null
}

export type StoryboardPanelImageSubmissionGroup =
  {
    readonly kind: 'grid2x2'
    readonly sourceVideoBlockId: string
    readonly panels: readonly StoryboardGridGroupingPanel[]
  }

export function normalizeStoryboardPanelImageGenerationMode(value: unknown): StoryboardPanelImageGenerationMode {
  void value
  return 'grid'
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readPanelSourceVideoBlockId(panel: StoryboardGridGroupingPanel): string {
  if (!panel.photographyRules) return ''
  let parsed: unknown
  try {
    parsed = JSON.parse(panel.photographyRules)
  } catch {
    return ''
  }
  if (!isRecord(parsed)) return ''
  const sourceVideoBlockKind = normalizeString(parsed.sourceVideoBlockKind)
  const sourceVideoBlockId = normalizeString(parsed.sourceVideoBlockId)
  if (!sourceVideoBlockId) return ''
  if (sourceVideoBlockKind && sourceVideoBlockKind !== 'group') return ''
  return sourceVideoBlockId
}

export function splitGridChunkSizes(panelCount: number): number[] {
  if (panelCount < 2) {
    throw new Error(`STORYBOARD_PANEL_GRID_REQUIRES_AT_LEAST_TWO_PANELS:${panelCount}`)
  }
  const sizes: number[] = []
  let remaining = panelCount
  while (remaining > 0) {
    if (remaining <= GRID_CELL_COUNT) {
      sizes.push(remaining)
      break
    }
    const nextSize = remaining % GRID_CELL_COUNT === 1 ? 3 : GRID_CELL_COUNT
    sizes.push(nextSize)
    remaining -= nextSize
  }
  return sizes
}

function pushChunkedGridGroups(
  output: StoryboardPanelImageSubmissionGroup[],
  sourceVideoBlockId: string,
  panels: readonly StoryboardGridGroupingPanel[],
) {
  let cursor = 0
  for (const size of splitGridChunkSizes(panels.length)) {
    const chunk = panels.slice(cursor, cursor + size)
    cursor += size
    output.push({
      kind: 'grid2x2',
      sourceVideoBlockId,
      panels: chunk,
    })
  }
}

export function planStoryboardPanelImageSubmissionGroups(
  panels: readonly StoryboardGridGroupingPanel[],
  generationMode: StoryboardPanelImageGenerationMode = 'grid',
): StoryboardPanelImageSubmissionGroup[] {
  const sortedPanels = [...panels].sort((left, right) => {
    if (left.storyboardId !== right.storyboardId) return left.storyboardId.localeCompare(right.storyboardId)
    return left.panelIndex - right.panelIndex
  })
  void generationMode
  const groupedPanels = new Map<string, {
    readonly sourceVideoBlockId: string
    readonly panels: StoryboardGridGroupingPanel[]
  }>()
  const output: StoryboardPanelImageSubmissionGroup[] = []

  for (const panel of sortedPanels) {
    const sourceVideoBlockId = readPanelSourceVideoBlockId(panel)
    if (!sourceVideoBlockId) {
      throw new Error(`STORYBOARD_PANEL_GRID_SOURCE_VIDEO_BLOCK_MISSING:${panel.id}`)
    }
    const key = `${panel.storyboardId}:${sourceVideoBlockId}`
    const existing = groupedPanels.get(key)
    if (existing) {
      existing.panels.push(panel)
      continue
    }
    groupedPanels.set(key, {
      sourceVideoBlockId,
      panels: [panel],
    })
  }

  for (const group of groupedPanels.values()) {
    pushChunkedGridGroups(output, group.sourceVideoBlockId, group.panels)
  }

  return output.sort((left, right) => left.panels[0].panelIndex - right.panels[0].panelIndex)
}
