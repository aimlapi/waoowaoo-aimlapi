import sharp from 'sharp'
import { createHash } from 'crypto'
import {
  extractStorageKey,
  getObjectBuffer,
  toFetchableUrl,
  uploadObject,
} from '@/lib/storage'

const SAME_LOCATION_REFERENCE_CELL_WIDTH = 960
const SAME_LOCATION_REFERENCE_CELL_HEIGHT = 540
const SAME_LOCATION_REFERENCE_MAX_PANELS = 4

export type SameProductionLocationPanel = {
  readonly id: string
  readonly storyboardId: string
  readonly panelIndex: number
  readonly imageUrl?: string | null
  readonly imageMediaId?: string | null
  readonly photographyRules: string | null
}

export type ProductionLocationIdentity = {
  readonly productionLocationId: string
  readonly locationId: string | null
}

export type SameProductionLocationVisualMemory = {
  readonly previousGridImageUrl: string
  readonly productionLocationId: string
  readonly locationId: string | null
  readonly referencePanelIds: readonly string[]
  readonly referencePanelIndexes: readonly number[]
  readonly signature: string
  readonly instructions: readonly string[]
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseRules(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    const parsed: unknown = JSON.parse(value)
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

export function readProductionLocationIdentity(panel: SameProductionLocationPanel): ProductionLocationIdentity | null {
  const rules = parseRules(panel.photographyRules)
  const productionLocationId = normalizeString(rules.productionLocationId)
  if (!productionLocationId) return null
  const locationId = normalizeString(rules.locationId)
  return {
    productionLocationId,
    locationId: locationId || null,
  }
}

function identityMatches(left: ProductionLocationIdentity, right: ProductionLocationIdentity): boolean {
  if (left.productionLocationId !== right.productionLocationId) return false
  if (left.locationId && right.locationId && left.locationId !== right.locationId) return false
  return true
}

function resolveCurrentGroupIdentity(panels: readonly SameProductionLocationPanel[]): ProductionLocationIdentity | null {
  const identities = panels.map(readProductionLocationIdentity)
  const first = identities[0] ?? null
  if (!first) return null
  for (const identity of identities) {
    if (!identity || !identityMatches(first, identity)) return null
  }
  return first
}

function hasUsableImage(panel: SameProductionLocationPanel): boolean {
  return Boolean(normalizeString(panel.imageUrl))
}

export function selectSameProductionLocationReferencePanels(input: {
  readonly currentPanels: readonly SameProductionLocationPanel[]
  readonly allPanels: readonly SameProductionLocationPanel[]
  readonly maxReferencePanels?: number
}): {
  readonly identity: ProductionLocationIdentity
  readonly panels: readonly SameProductionLocationPanel[]
} | null {
  const identity = resolveCurrentGroupIdentity(input.currentPanels)
  if (!identity) return null
  const currentPanelIds = new Set(input.currentPanels.map((panel) => panel.id))
  const firstCurrentPanelIndex = Math.min(...input.currentPanels.map((panel) => panel.panelIndex))
  const maxReferencePanels = input.maxReferencePanels ?? SAME_LOCATION_REFERENCE_MAX_PANELS
  const candidates = input.allPanels
    .filter((panel) => !currentPanelIds.has(panel.id))
    .filter((panel) => panel.storyboardId === input.currentPanels[0]?.storyboardId)
    .filter((panel) => panel.panelIndex < firstCurrentPanelIndex)
    .filter(hasUsableImage)
    .filter((panel) => {
      const panelIdentity = readProductionLocationIdentity(panel)
      return panelIdentity ? identityMatches(identity, panelIdentity) : false
    })
    .sort((left, right) => right.panelIndex - left.panelIndex)
    .slice(0, maxReferencePanels)
    .sort((left, right) => left.panelIndex - right.panelIndex)

  if (candidates.length === 0) return null
  return { identity, panels: candidates }
}

async function readImageBuffer(imageUrl: string): Promise<Buffer> {
  const storageKey = extractStorageKey(imageUrl)
  if (storageKey) return await getObjectBuffer(storageKey)
  const response = await fetch(toFetchableUrl(imageUrl))
  if (!response.ok) {
    throw new Error(`SAME_PRODUCTION_LOCATION_REFERENCE_FETCH_FAILED:${response.status}`)
  }
  return Buffer.from(await response.arrayBuffer())
}

async function renderReferenceSheet(referencePanels: readonly SameProductionLocationPanel[]): Promise<Buffer> {
  const cellBuffers: Buffer[] = []
  for (const panel of referencePanels) {
    const imageUrl = normalizeString(panel.imageUrl)
    if (!imageUrl) throw new Error(`SAME_PRODUCTION_LOCATION_REFERENCE_IMAGE_MISSING:${panel.id}`)
    const buffer = await readImageBuffer(imageUrl)
    cellBuffers.push(await sharp(buffer)
      .resize({
        width: SAME_LOCATION_REFERENCE_CELL_WIDTH,
        height: SAME_LOCATION_REFERENCE_CELL_HEIGHT,
        fit: 'cover',
      })
      .jpeg({ quality: 94 })
      .toBuffer())
  }

  while (cellBuffers.length < SAME_LOCATION_REFERENCE_MAX_PANELS) {
    const last = cellBuffers[cellBuffers.length - 1]
    if (!last) break
    cellBuffers.push(last)
  }

  return await sharp({
    create: {
      width: SAME_LOCATION_REFERENCE_CELL_WIDTH * 2,
      height: SAME_LOCATION_REFERENCE_CELL_HEIGHT * 2,
      channels: 3,
      background: '#111111',
    },
  })
    .composite([
      { input: cellBuffers[0] ?? Buffer.alloc(0), left: 0, top: 0 },
      { input: cellBuffers[1] ?? Buffer.alloc(0), left: SAME_LOCATION_REFERENCE_CELL_WIDTH, top: 0 },
      { input: cellBuffers[2] ?? Buffer.alloc(0), left: 0, top: SAME_LOCATION_REFERENCE_CELL_HEIGHT },
      {
        input: cellBuffers[3] ?? Buffer.alloc(0),
        left: SAME_LOCATION_REFERENCE_CELL_WIDTH,
        top: SAME_LOCATION_REFERENCE_CELL_HEIGHT,
      },
    ])
    .jpeg({ quality: 94 })
    .toBuffer()
}

function safeStorageName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'location'
}

function createSignature(input: {
  readonly identity: ProductionLocationIdentity
  readonly referencePanels: readonly SameProductionLocationPanel[]
}): string {
  const serialized = JSON.stringify({
    productionLocationId: input.identity.productionLocationId,
    locationId: input.identity.locationId,
    references: input.referencePanels.map((panel) => ({
      id: panel.id,
      panelIndex: panel.panelIndex,
      imageUrl: panel.imageUrl,
    })),
  })
  return createHash('sha1').update(serialized).digest('hex').slice(0, 16)
}

export function buildSameProductionLocationVisualMemoryInstructions(): readonly string[] {
  return [
    'Only use this same-production-location visual memory for permanent spatial footprint: fixed set dressing, bed/table/window/door/wall/counter positions, adjacency, separation, and screen direction.',
    'Do not copy narrative state from the reference: character pose, temporary props, time-of-day changes, current table contents, crowd state, phone screens, text, labels, or action beats must come from the current panel.',
    'Do not inherit contamination from reference images. If a large object is not listed in the current panel or location locks, do not add it even if it appears in a reference image.',
    'Preserve separation locks: objects that were separated by a bed edge, aisle, wall, doorway, counter, table gap, or foreground distance must not become adjacent or touch.',
  ]
}

export async function resolveSameProductionLocationVisualMemory(input: {
  readonly currentPanels: readonly SameProductionLocationPanel[]
  readonly allPanels: readonly SameProductionLocationPanel[]
}): Promise<SameProductionLocationVisualMemory | null> {
  const selected = selectSameProductionLocationReferencePanels(input)
  if (!selected) return null
  const sheet = await renderReferenceSheet(selected.panels)
  const signature = createSignature({
    identity: selected.identity,
    referencePanels: selected.panels,
  })
  const key = [
    'images/storyboard-reference/same-production-location',
    safeStorageName(selected.identity.productionLocationId),
    `${signature}.jpg`,
  ].join('-')
  const previousGridImageUrl = await uploadObject(sheet, key, 1, 'image/jpeg')
  return {
    previousGridImageUrl,
    productionLocationId: selected.identity.productionLocationId,
    locationId: selected.identity.locationId,
    referencePanelIds: selected.panels.map((panel) => panel.id),
    referencePanelIndexes: selected.panels.map((panel) => panel.panelIndex),
    signature,
    instructions: buildSameProductionLocationVisualMemoryInstructions(),
  }
}
