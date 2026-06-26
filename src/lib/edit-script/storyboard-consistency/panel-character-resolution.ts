interface PanelCharacterResolutionAsset {
  readonly requirementId: string
  readonly kind: string
  readonly name: string
  readonly shotNumbers: readonly number[]
}

interface PanelCharacterResolutionShot {
  readonly shotNumber: number
  readonly visibleAction: string
  readonly charactersAndScene: string
}

interface PanelCharacterResolutionBlock {
  readonly shotNumbers: readonly number[]
}

interface PanelCharacterResolutionCinematographyShot {
  readonly shotScale: string
}

interface PanelCharacterPlacement {
  readonly characterName?: unknown
  readonly name?: unknown
}

interface PanelCharacterShotBlocking {
  readonly characterPlacements?: readonly PanelCharacterPlacement[]
}

interface PanelCharacterGeneratedPanel {
  readonly shotBlocking?: PanelCharacterShotBlocking
  readonly metadata?: Record<string, unknown>
}

export interface ResolvePanelCharacterRequirementIdsInput {
  readonly assets: readonly PanelCharacterResolutionAsset[]
  readonly shot: PanelCharacterResolutionShot
  readonly block: PanelCharacterResolutionBlock
  readonly cinematographyShot: PanelCharacterResolutionCinematographyShot
  readonly generated: PanelCharacterGeneratedPanel
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function normalizeCharacterName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s/／,，、"'“”‘’「」『』《》()（）[\]【】:：.-]/g, '')
}

function namesMatch(a: string, b: string): boolean {
  return normalizeCharacterName(a) === normalizeCharacterName(b)
}

function extractPlacementNamesFromBlocking(blocking: PanelCharacterShotBlocking | undefined): readonly string[] {
  if (!blocking?.characterPlacements) return []
  return blocking.characterPlacements
    .map((placement) => readString(placement.characterName) ?? readString(placement.name))
    .filter((name): name is string => name !== null)
}

function extractPlacementNamesFromMetadata(metadata: Record<string, unknown> | undefined): readonly string[] {
  if (!metadata) return []
  const cameraPlan = isRecord(metadata.cameraPlan) ? metadata.cameraPlan : null
  const shotBlocking = cameraPlan && isRecord(cameraPlan.shotBlocking) ? cameraPlan.shotBlocking : null
  if (!shotBlocking) return []
  const placements = Array.isArray(shotBlocking.characterPlacements) ? shotBlocking.characterPlacements : []
  return placements
    .filter(isRecord)
    .map((placement) => readString(placement.characterName) ?? readString(placement.name))
    .filter((name): name is string => name !== null)
}

function extractStructuredPlacementNames(generated: PanelCharacterGeneratedPanel): readonly string[] {
  return [
    ...extractPlacementNamesFromBlocking(generated.shotBlocking),
    ...extractPlacementNamesFromMetadata(generated.metadata),
  ]
}

function isContinuityEligibleShot(shotScale: string): boolean {
  const normalized = shotScale.trim().toLowerCase()
  if (!normalized) return false
  if (/特写|近景|细节|局部|插入|道具|手部|close[-\s]?up|extreme close|detail|insert|macro/.test(normalized)) {
    return false
  }
  return /全景|远景|中景|大全景|广角|俯拍|medium|wide|long|full|establishing/.test(normalized)
}

function sentenceMentionsCharacter(sentence: string, characterName: string): boolean {
  return sentence.includes(characterName) || normalizeCharacterName(sentence).includes(normalizeCharacterName(characterName))
}

function shotExplicitlyExcludesCharacter(shot: PanelCharacterResolutionShot, characterName: string): boolean {
  const text = `${shot.visibleAction}\n${shot.charactersAndScene}`
  const sentences = text.split(/[\n。！？!?；;]/)
  return sentences.some((sentence) => {
    if (!sentenceMentionsCharacter(sentence, characterName)) return false
    return /不在|未出场|没有出现|离开|离场|退场|消失|画外|不入画|off[-\s]?screen|not visible|absent|leaves|exits/i.test(sentence)
  })
}

function shouldAddByAdjacentContinuity(input: {
  readonly asset: PanelCharacterResolutionAsset
  readonly shot: PanelCharacterResolutionShot
  readonly block: PanelCharacterResolutionBlock
  readonly cinematographyShot: PanelCharacterResolutionCinematographyShot
}): boolean {
  if (!isContinuityEligibleShot(input.cinematographyShot.shotScale)) return false
  if (shotExplicitlyExcludesCharacter(input.shot, input.asset.name)) return false
  const shotNumbers = new Set(input.asset.shotNumbers)
  const isAdjacentBridge = shotNumbers.has(input.shot.shotNumber - 1) && shotNumbers.has(input.shot.shotNumber + 1)
  if (!isAdjacentBridge) return false
  return input.block.shotNumbers.includes(input.shot.shotNumber)
}

export function resolvePanelCharacterRequirementIds(input: ResolvePanelCharacterRequirementIdsInput): readonly string[] {
  const characterAssets = input.assets.filter((asset) => asset.kind === 'character')
  const structuredPlacementNames = extractStructuredPlacementNames(input.generated)
  const selectedRequirementIds = new Set<string>()

  for (const asset of characterAssets) {
    if (asset.shotNumbers.includes(input.shot.shotNumber)) {
      selectedRequirementIds.add(asset.requirementId)
      continue
    }
    if (structuredPlacementNames.some((placementName) => namesMatch(placementName, asset.name))) {
      selectedRequirementIds.add(asset.requirementId)
      continue
    }
    if (shouldAddByAdjacentContinuity({
      asset,
      shot: input.shot,
      block: input.block,
      cinematographyShot: input.cinematographyShot,
    })) {
      selectedRequirementIds.add(asset.requirementId)
    }
  }

  return characterAssets
    .filter((asset) => selectedRequirementIds.has(asset.requirementId))
    .map((asset) => asset.requirementId)
}
