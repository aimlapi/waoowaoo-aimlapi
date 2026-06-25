import { type Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { type TaskJobData } from '@/lib/task/types'
import { decodeImageUrlsFromDb } from '@/lib/contracts/image-urls-contract'
import {
  findAppearanceForStoryboardReference,
  findCharacterForStoryboardReference,
  parseStoryboardPanelCharacterReferences,
  type StoryboardPanelCharacterReference,
} from '@/lib/storyboard-character-bindings'
import {
  normalizeOptionalReferenceImagesForGeneration,
  type OutboundImageNormalizationIssue,
} from '@/lib/media/outbound-image'
import {
  resolveImageSourceFromGeneration,
  toSignedUrlIfCos,
  uploadImageSourceToCos,
} from '../utils'
import {
  readImageRuntimeGenerationOptions,
  requireImageRuntimeAspectRatio,
} from '@/lib/image-generation/runtime-options'

export type AnyObj = Record<string, unknown>

export interface ImageProviderRuntimeOptions {
  readonly referenceImages?: string[]
  readonly aspectRatio: string
  readonly resolution?: string
  readonly quality?: string
  readonly size?: string
}

interface CharacterAppearanceLike {
  id?: string
  appearanceIndex?: number
  changeReason: string | null
  description?: string | null
  descriptions?: string | null
  imageUrls: string | null
  imageUrl: string | null
  selectedIndex: number | null
}

interface CharacterLike {
  id?: string
  name: string
  appearances?: CharacterAppearanceLike[]
}

interface LocationImageLike {
  id?: string
  description?: string | null
  spatialProfileJson?: unknown
  imageIndex?: number
  isSelected: boolean
  imageUrl: string | null
}

interface LocationLike {
  id?: string
  name: string
  summary?: string | null
  assetKind?: string | null
  selectedImageId?: string | null
  images?: LocationImageLike[]
}

interface EditAssetRequirementLike {
  id: string
  kind: string
  name: string
  description: string | null
  shotIndexes: unknown
  status: string
  targetId: string | null
}

export interface NovelProjectData {
  videoRatio?: string | null
  characters?: CharacterLike[]
  locations?: LocationLike[]
  props?: LocationLike[]
  editAssetRequirements?: EditAssetRequirementLike[]
}

interface PanelLike {
  sketchImageUrl?: string | null
  characters?: string | null
  location?: string | null
  props?: string | null
  description?: string | null
  imagePrompt?: string | null
  srtSegment?: string | null
  panelIndex?: number | null
  panelNumber?: number | null
}

export interface PanelCharacterReference {
  characterId?: string
  name: string
  appearanceId?: string
  appearanceIndex?: number
  appearance?: string
  slot?: string
}

export type ReferenceImageRole = 'sketch' | 'source_panel' | 'character' | 'location' | 'prop' | 'extra'

export interface ReferenceImageItem {
  url: string
  role: ReferenceImageRole
  name: string
  appearance?: string | null
  slot?: string | null
}

export interface NumberedReferenceImage {
  image_no: string
  role: ReferenceImageRole
  name: string
  appearance?: string | null
  slot?: string | null
}

export interface NormalizedReferenceImageItems {
  referenceImages: string[]
  referenceImagesMap: NumberedReferenceImage[]
}

export type PanelReferenceImageDiagnostic = {
  kind: 'sketch' | 'character' | 'location' | 'prop'
  inputIndex: number | null
  name?: string | null
  propId?: string | null
  characterId?: string | null
  appearance?: string | null
  appearanceId?: string | null
  selectedIndex?: number | null
  sourceUrl?: string | null
  signedUrl?: string | null
  issue?: string | null
}

export type PanelReferenceImageItemCollection = {
  items: ReferenceImageItem[]
  diagnostics: PanelReferenceImageDiagnostic[]
  issues: PanelReferenceImageDiagnostic[]
  expectedCharacterReferenceCount: number
}

export type PanelReferenceImageCollection = {
  refs: string[]
  diagnostics: PanelReferenceImageDiagnostic[]
  issues: PanelReferenceImageDiagnostic[]
  expectedCharacterReferenceCount: number
}

interface ProjectDataDb {
  project: {
    findUnique(args: Record<string, unknown>): Promise<NovelProjectDataWithAssets | null>
  }
}

type NovelProjectDataWithAssets = NovelProjectData & {
  locations?: LocationLike[]
  editAssetRequirements?: EditAssetRequirementLike[]
}

export interface ResolvedPanelPropAsset {
  id: string
  name: string
  description: string | null
  imageUrl: string | null
  source: 'panel' | 'requirement'
}

export function parseJsonStringArray(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value !== 'string') return []
  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === 'string')
  } catch {
    return []
  }
}

export function parseImageUrls(value: string | null | undefined, fieldName: string): string[] {
  return decodeImageUrlsFromDb(value, fieldName)
}

export function clampCount(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.floor(n)))
}

export function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value
  }
  return null
}

export function buildImageProviderRuntimeOptions(input: {
  readonly generationOptions: unknown
  readonly context: string
  readonly referenceImages?: readonly string[]
}): ImageProviderRuntimeOptions {
  const options = readImageRuntimeGenerationOptions(input.generationOptions)
  const aspectRatio = requireImageRuntimeAspectRatio(input.generationOptions, input.context)
  return {
    ...(input.referenceImages && input.referenceImages.length > 0
      ? { referenceImages: [...input.referenceImages] }
      : {}),
    aspectRatio,
    ...(options.resolution ? { resolution: options.resolution } : {}),
    ...(options.quality ? { quality: options.quality } : {}),
    ...(options.size ? { size: options.size } : {}),
  }
}

async function generateImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  allowTaskExternalIdResume?: boolean
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    resolution?: string
    quality?: string
    size?: string
  }
}) {
  const source = await resolveImageSourceFromGeneration(params.job, {
    userId: params.userId,
    modelId: params.modelId,
    prompt: params.prompt,
    options: params.options,
    allowTaskExternalIdResume: params.allowTaskExternalIdResume,
  })

  const cosKey = await uploadImageSourceToCos(source, params.keyPrefix, params.targetId)
  return cosKey
}

export async function generateCleanImageToStorage(params: {
  job: Job<TaskJobData>
  userId: string
  modelId: string
  prompt: string
  targetId: string
  keyPrefix: string
  allowTaskExternalIdResume?: boolean
  options?: {
    referenceImages?: string[]
    aspectRatio?: string
    resolution?: string
    quality?: string
    size?: string
  }
}) {
  return await generateImageToStorage(params)
}

export async function resolveNovelData(projectId: string, _userId?: string) {
  void _userId
  const db = prisma as unknown as ProjectDataDb
  const data = await db.project.findUnique({
    where: { id: projectId },
    include: {
      characters: { include: { appearances: { orderBy: { appearanceIndex: 'asc' } } } },
      locations: { include: { images: { orderBy: { imageIndex: 'asc' } } } },
      editAssetRequirements: true,
    },
  })

  if (!data) {
    throw new Error(`Project not found: ${projectId}`)
  }

  const locations = data.locations || []
  return {
    ...data,
    locations: locations.filter((location) => location.assetKind !== 'prop'),
    props: locations.filter((location) => location.assetKind === 'prop'),
    editAssetRequirements: data.editAssetRequirements || [],
  }
}

export function parsePanelCharacterReferences(value: string | null | undefined): PanelCharacterReference[] {
  return parseStoryboardPanelCharacterReferences(value) as PanelCharacterReference[]
}

function formatPanelReferenceIssue(issues: PanelReferenceImageDiagnostic[]) {
  return issues
    .map((issue) => {
      const subject = issue.kind === 'character'
        ? `${issue.name || issue.characterId || 'unknown'}:${issue.appearance || issue.appearanceId || 'appearance'}`
        : issue.name || issue.kind
      return `${issue.kind}:${subject}:${issue.issue || 'invalid'}`
    })
    .join('; ')
}

function pushIssue(
  collection: PanelReferenceImageItemCollection,
  issue: PanelReferenceImageDiagnostic,
) {
  collection.diagnostics.push(issue)
  collection.issues.push(issue)
}

function pushReferenceImageItem(
  collection: PanelReferenceImageItemCollection,
  diagnostic: PanelReferenceImageDiagnostic,
  item: ReferenceImageItem,
) {
  collection.items.push(item)
  collection.diagnostics.push({
    ...diagnostic,
    inputIndex: collection.items.length - 1,
    signedUrl: item.url,
    issue: null,
  })
}

function normalizeAssetName(value: string) {
  return value.trim().toLowerCase().replace(/[「」"“”'‘’\s]/g, '')
}

function readRecordString(record: Record<string, unknown>, keys: readonly string[]) {
  for (const key of keys) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return null
}

function parsePropReferences(value: unknown): Array<{ name: string; propId: string | null }> {
  if (!value) return []
  if (Array.isArray(value)) {
    return value.flatMap((item) => {
      if (typeof item === 'string' && item.trim()) {
        return [{ name: item.trim(), propId: null }]
      }
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        const record = item as Record<string, unknown>
        const name = readRecordString(record, ['name', 'propName', 'title'])
        const propId = readRecordString(record, ['id', 'propId', 'assetId', 'targetId'])
        if (name) return [{ name, propId }]
        if (propId) return [{ name: propId, propId }]
      }
      return []
    })
  }
  if (typeof value !== 'string') return []
  const trimmed = value.trim()
  if (!trimmed) return []
  try {
    return parsePropReferences(JSON.parse(trimmed))
  } catch {
    return trimmed
      .split(/[\n,，、]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .map((name) => ({ name, propId: null }))
  }
}

function parseShotNumbers(value: unknown): number[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'number' && Number.isFinite(item)) return Math.trunc(item)
        if (typeof item === 'string' && item.trim()) {
          const parsed = Number(item.trim())
          return Number.isFinite(parsed) ? Math.trunc(parsed) : null
        }
        return null
      })
      .filter((item): item is number => item !== null)
  }
  if (typeof value === 'string') {
    try {
      return parseShotNumbers(JSON.parse(value))
    } catch {
      const parsed = Number(value.trim())
      return Number.isFinite(parsed) ? [Math.trunc(parsed)] : []
    }
  }
  return []
}

function panelShotNumbers(panel: PanelLike) {
  const numbers = new Set<number>()
  if (typeof panel.panelNumber === 'number' && Number.isFinite(panel.panelNumber)) {
    numbers.add(Math.trunc(panel.panelNumber))
  }
  if (typeof panel.panelIndex === 'number' && Number.isFinite(panel.panelIndex)) {
    numbers.add(Math.trunc(panel.panelIndex) + 1)
  }
  return numbers
}

function panelSearchText(panel: PanelLike) {
  return normalizeAssetName([
    panel.props,
    panel.location,
    panel.characters,
    panel.description,
    panel.imagePrompt,
    panel.srtSegment,
  ].filter((item): item is string => typeof item === 'string' && item.trim()).join('\n'))
}

function propNameKeywords(name: string) {
  const normalized = normalizeAssetName(name)
  const keywords = new Set<string>()
  if (normalized.length >= 2) keywords.add(normalized)
  for (const length of [4, 3, 2]) {
    if (normalized.length >= length) keywords.add(normalized.slice(-length))
  }
  return Array.from(keywords).filter((keyword) => keyword.length >= 2)
}

function panelMentionsProp(panel: PanelLike, propName: string) {
  const searchText = panelSearchText(panel)
  if (!searchText) return false
  return propNameKeywords(propName).some((keyword) => searchText.includes(keyword))
}

function pickSelectedAssetImage(asset: LocationLike) {
  const images = asset.images || []
  return images.find((image) => image.isSelected)
    || images.find((image) => image.id && image.id === asset.selectedImageId)
    || images[0]
    || null
}

function findPropAsset(projectData: NovelProjectData, input: { propId?: string | null; name?: string | null }) {
  const props = projectData.props || []
  if (input.propId) {
    const byId = props.find((prop) => prop.id === input.propId)
    if (byId) return byId
  }
  if (!input.name) return null
  const targetName = normalizeAssetName(input.name)
  return props.find((prop) => normalizeAssetName(prop.name) === targetName) || null
}

export function resolvePanelPropAssets(projectData: NovelProjectData, panel: PanelLike): ResolvedPanelPropAsset[] {
  const resolved = new Map<string, ResolvedPanelPropAsset>()
  const addAsset = (asset: LocationLike, source: ResolvedPanelPropAsset['source']) => {
    if (!asset.id) return
    const selectedImage = pickSelectedAssetImage(asset)
    resolved.set(asset.id, {
      id: asset.id,
      name: asset.name,
      description: selectedImage?.description || asset.summary || null,
      imageUrl: selectedImage?.imageUrl || null,
      source,
    })
  }

  for (const reference of parsePropReferences(panel.props)) {
    const asset = findPropAsset(projectData, { propId: reference.propId, name: reference.name })
    if (asset) addAsset(asset, 'panel')
  }

  const shotNumbers = panelShotNumbers(panel)
  if (shotNumbers.size === 0) return Array.from(resolved.values())
  for (const requirement of projectData.editAssetRequirements || []) {
    if (requirement.kind !== 'prop' || !requirement.targetId) continue
    const requirementShots = parseShotNumbers(requirement.shotIndexes)
    if (!requirementShots.some((shotNumber) => shotNumbers.has(shotNumber))) continue
    if (!panelMentionsProp(panel, requirement.name)) continue
    const asset = findPropAsset(projectData, { propId: requirement.targetId, name: requirement.name })
    if (asset) {
      addAsset(asset, 'requirement')
    }
  }

  return Array.from(resolved.values())
}

function imageNo(index: number, locale: TaskJobData['locale'] | undefined): string {
  return locale === 'en' ? `Image ${index + 1}` : `图 ${index + 1}`
}

function displayReferenceName(item: ReferenceImageItem, locale: TaskJobData['locale'] | undefined): string {
  if (item.role === 'sketch') return locale === 'en' ? 'storyboard sketch' : '分镜草图'
  if (item.role === 'source_panel') return locale === 'en' ? 'source panel' : '原始镜头'
  return item.name
}

export function formatReferenceImagesMapForPrompt(
  map: NumberedReferenceImage[],
  locale: TaskJobData['locale'],
): string {
  if (map.length === 0) {
    return locale === 'en' ? 'No reference images.' : '无参考图。'
  }

  const roleLabel: Record<ReferenceImageRole, { zh: string; en: string }> = {
    sketch: { zh: '分镜草图', en: 'storyboard sketch' },
    source_panel: { zh: '原始镜头', en: 'source panel' },
    character: { zh: '角色', en: 'character' },
    location: { zh: '场景', en: 'location' },
    prop: { zh: '道具', en: 'prop' },
    extra: { zh: '额外参考', en: 'extra reference' },
  }

  return map.map((item) => {
    const label = locale === 'en' ? roleLabel[item.role].en : roleLabel[item.role].zh
    const appearance = item.appearance
      ? (locale === 'en' ? `, appearance "${item.appearance}"` : `，形象「${item.appearance}」`)
      : ''
    const slot = item.slot
      ? (locale === 'en' ? `, fixed slot "${item.slot}"` : `，固定位置「${item.slot}」`)
      : ''
    return locale === 'en'
      ? `${item.image_no} = ${label} "${item.name}"${appearance}${slot}`
      : `${item.image_no} = ${label}「${item.name}」${appearance}${slot}`
  }).join('\n')
}

export async function normalizeReferenceImageItemsForGeneration(
  items: ReferenceImageItem[],
  options: {
    locale?: TaskJobData['locale']
    onIssue?: (issue: OutboundImageNormalizationIssue) => void
    context?: Record<string, unknown>
  } = {},
): Promise<NormalizedReferenceImageItems> {
  const seen = new Set<string>()
  const referenceImages: string[] = []
  const referenceImagesMap: NumberedReferenceImage[] = []

  for (const [index, item] of items.entries()) {
    const trimmedUrl = item.url.trim()
    if (!trimmedUrl || seen.has(trimmedUrl)) continue
    seen.add(trimmedUrl)

    const normalized = await normalizeOptionalReferenceImagesForGeneration([trimmedUrl], {
      onIssue: (issue) => {
        options.onIssue?.({ ...issue, index })
      },
      context: {
        ...(options.context || {}),
        referenceRole: item.role,
        referenceName: item.name,
      },
    })
    const normalizedUrl = normalized[0]
    if (!normalizedUrl) continue

    referenceImages.push(normalizedUrl)
    referenceImagesMap.push({
      image_no: imageNo(referenceImages.length - 1, options.locale),
      role: item.role,
      name: displayReferenceName(item, options.locale),
      ...(item.appearance ? { appearance: item.appearance } : {}),
      ...(item.slot ? { slot: item.slot } : {}),
    })
  }

  return { referenceImages, referenceImagesMap }
}

export async function collectPanelReferenceImageItemsWithDiagnostics(
  projectData: NovelProjectData,
  panel: PanelLike,
  options: { strict?: boolean } = {},
): Promise<PanelReferenceImageItemCollection> {
  const collection: PanelReferenceImageItemCollection = {
    items: [],
    diagnostics: [],
    issues: [],
    expectedCharacterReferenceCount: 0,
  }

  const sketch = toSignedUrlIfCos(panel.sketchImageUrl, 3600)
  if (sketch) {
    pushReferenceImageItem(
      collection,
      { kind: 'sketch', inputIndex: null, sourceUrl: panel.sketchImageUrl || null },
      { url: sketch, role: 'sketch', name: 'storyboard sketch' },
    )
  }

  const panelCharacters = parsePanelCharacterReferences(panel.characters)
  for (const item of panelCharacters) {
    collection.expectedCharacterReferenceCount += 1
    const character = findCharacterForStoryboardReference(
      projectData.characters || [],
      item as StoryboardPanelCharacterReference,
    )
    if (!character) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: item.name,
        characterId: item.characterId || null,
        appearance: item.appearance || null,
        appearanceId: item.appearanceId || null,
        issue: 'character_not_found',
      })
      continue
    }

    const appearances = character.appearances || []
    const appearance = findAppearanceForStoryboardReference(
      appearances,
      item as StoryboardPanelCharacterReference,
    )
    if (!appearance) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: item.appearance || null,
        appearanceId: item.appearanceId || null,
        issue: 'appearance_not_found',
      })
      continue
    }

    const imageUrls = parseImageUrls(appearance.imageUrls, 'characterAppearance.imageUrls')
    const selectedIndex = appearance.selectedIndex
    const selectedUrl = selectedIndex !== null && selectedIndex !== undefined ? imageUrls[selectedIndex] : null
    const key = selectedIndex !== null && selectedIndex !== undefined
      ? selectedUrl
      : imageUrls[0] || appearance.imageUrl
    if (!key) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: appearance.changeReason || item.appearance || null,
        appearanceId: appearance.id || item.appearanceId || null,
        selectedIndex,
        issue: 'reference_image_missing',
      })
      continue
    }
    const signed = toSignedUrlIfCos(key, 3600)
    if (!signed) {
      pushIssue(collection, {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: appearance.changeReason || item.appearance || null,
        appearanceId: appearance.id || item.appearanceId || null,
        selectedIndex,
        sourceUrl: key,
        issue: 'reference_url_not_signable',
      })
      continue
    }
    pushReferenceImageItem(
      collection,
      {
        kind: 'character',
        inputIndex: null,
        name: character.name,
        characterId: character.id || item.characterId || null,
        appearance: appearance.changeReason || item.appearance || null,
        appearanceId: appearance.id || item.appearanceId || null,
        selectedIndex,
        sourceUrl: key,
      },
      {
        url: signed,
        role: 'character',
        name: character.name,
        appearance: appearance.changeReason || item.appearance || null,
        slot: item.slot || null,
      },
    )
  }

  if (panel.location) {
    const location = (projectData.locations || []).find((loc) => loc.name.toLowerCase() === panel.location!.toLowerCase())
    if (location) {
      const images = location.images || []
      const selected = images.find((img) => img.isSelected) || images[0]
      const signed = toSignedUrlIfCos(selected?.imageUrl, 3600)
      if (signed) {
        pushReferenceImageItem(
          collection,
          { kind: 'location', inputIndex: null, name: location.name, sourceUrl: selected?.imageUrl || null },
          { url: signed, role: 'location', name: location.name },
        )
      }
    }
  }

  for (const prop of resolvePanelPropAssets(projectData, panel)) {
    const signed = toSignedUrlIfCos(prop.imageUrl, 3600)
    if (!signed) {
      pushIssue(collection, {
        kind: 'prop',
        inputIndex: null,
        name: prop.name,
        propId: prop.id,
        sourceUrl: prop.imageUrl,
        issue: 'reference_image_missing',
      })
      continue
    }
    pushReferenceImageItem(
      collection,
      {
        kind: 'prop',
        inputIndex: null,
        name: prop.name,
        propId: prop.id,
        sourceUrl: prop.imageUrl,
      },
      {
        url: signed,
        role: 'prop',
        name: prop.name,
      },
    )
  }

  const strictIssues = collection.issues.filter((issue) => issue.kind === 'character' || issue.kind === 'prop')
  if (options.strict && strictIssues.length > 0) {
    throw new Error(`PANEL_REFERENCE_INVALID:${formatPanelReferenceIssue(strictIssues)}`)
  }

  return collection
}

export async function collectPanelReferenceImageItems(projectData: NovelProjectData, panel: PanelLike) {
  return (await collectPanelReferenceImageItemsWithDiagnostics(projectData, panel)).items
}

export async function collectPanelReferenceImagesWithDiagnostics(
  projectData: NovelProjectData,
  panel: PanelLike,
  options: { strict?: boolean } = {},
): Promise<PanelReferenceImageCollection> {
  const collection = await collectPanelReferenceImageItemsWithDiagnostics(projectData, panel, options)
  return {
    refs: collection.items.map((item) => item.url),
    diagnostics: collection.diagnostics,
    issues: collection.issues,
    expectedCharacterReferenceCount: collection.expectedCharacterReferenceCount,
  }
}

export async function collectPanelReferenceImages(projectData: NovelProjectData, panel: PanelLike) {
  return (await collectPanelReferenceImagesWithDiagnostics(projectData, panel)).refs
}
