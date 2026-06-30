import { z } from 'zod'

export const storyboardPanelGroupSchema = z.object({
  groupNumber: z.number().int().positive(),
  panelNumbers: z.array(z.number().int().positive()).min(1),
  sceneZoneIds: z.array(z.string().trim().min(1)).min(1),
  continuityRule: z.string().trim().min(8),
}).strict()

export type StoryboardPanelGroup = z.infer<typeof storyboardPanelGroupSchema>

export interface ValidatedStoryboardPanelGroup {
  readonly groupNumber: number
  readonly panelNumbers: readonly number[]
  readonly sceneZoneIds: readonly string[]
  readonly continuityRule: string
}

function assertContinuousPanelNumbers(panelNumbers: readonly number[], context: string) {
  if (panelNumbers.length === 0) {
    throw new Error(`STORYBOARD_PANEL_GROUP_EMPTY:${context}`)
  }
  for (let index = 0; index < panelNumbers.length; index += 1) {
    const current = panelNumbers[index]
    if (typeof current !== 'number' || !Number.isInteger(current) || current <= 0) {
      throw new Error(`STORYBOARD_PANEL_GROUP_PANEL_NUMBER_INVALID:${context}:${String(current)}`)
    }
    if (index > 0 && current !== panelNumbers[index - 1] + 1) {
      throw new Error(`STORYBOARD_PANEL_GROUP_NON_CONTIGUOUS:${context}:${panelNumbers.join(',')}`)
    }
  }
}

export function validateStoryboardPanelGroups(input: {
  readonly groups: readonly StoryboardPanelGroup[]
  readonly panelNumbers: readonly number[]
}): ValidatedStoryboardPanelGroup[] {
  if (input.groups.length === 0) {
    throw new Error('STORYBOARD_PANEL_GROUPS_REQUIRED')
  }
  assertContinuousPanelNumbers(input.panelNumbers, 'panels')

  const result: ValidatedStoryboardPanelGroup[] = []
  let expectedPanelCursor = 0

  for (let index = 0; index < input.groups.length; index += 1) {
    const group = input.groups[index]
    const expectedGroupNumber = index + 1
    if (group.groupNumber !== expectedGroupNumber) {
      throw new Error(`STORYBOARD_PANEL_GROUP_NUMBER_MISMATCH:expected_${expectedGroupNumber}:got_${group.groupNumber}`)
    }
    assertContinuousPanelNumbers(group.panelNumbers, `group_${group.groupNumber}`)
    for (const panelNumber of group.panelNumbers) {
      const expectedPanelNumber = input.panelNumbers[expectedPanelCursor]
      if (panelNumber !== expectedPanelNumber) {
        throw new Error(`STORYBOARD_PANEL_GROUP_ORDER_MISMATCH:expected_${String(expectedPanelNumber)}:got_${panelNumber}`)
      }
      expectedPanelCursor += 1
    }
    result.push({
      groupNumber: group.groupNumber,
      panelNumbers: [...group.panelNumbers],
      sceneZoneIds: [...group.sceneZoneIds],
      continuityRule: group.continuityRule.trim(),
    })
  }

  if (expectedPanelCursor !== input.panelNumbers.length) {
    throw new Error(`STORYBOARD_PANEL_GROUP_COVERAGE_MISMATCH:expected_${input.panelNumbers.length}:got_${expectedPanelCursor}`)
  }
  return result
}
