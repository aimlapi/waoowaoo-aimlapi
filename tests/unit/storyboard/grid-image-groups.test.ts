import { describe, expect, it } from 'vitest'
import { planStoryboardPanelImageSubmissionGroups } from '@/lib/storyboard/grid-image-groups'

function panel(id: string, panelIndex: number, sourceVideoBlockKind: 'single' | 'group', sourceVideoBlockId: string) {
  return {
    id,
    storyboardId: 'storyboard-1',
    panelIndex,
    photographyRules: JSON.stringify({
      source: 'edit_script',
      sourceVideoBlockKind,
      sourceVideoBlockId,
    }),
  }
}

describe('storyboard grid image group planner', () => {
  it('plans 2x2 grid tasks by default', () => {
    const groups = planStoryboardPanelImageSubmissionGroups([
      panel('panel-2', 1, 'group', 'edit-1:videoBlock:1'),
      panel('panel-1', 0, 'group', 'edit-1:videoBlock:1'),
    ])

    expect(groups).toEqual([
      {
        kind: 'grid2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        panels: [
          expect.objectContaining({ id: 'panel-1' }),
          expect.objectContaining({ id: 'panel-2' }),
        ],
      },
    ])
  })

  it('groups multiple missing panels from the same video block into one 2x2 grid task', () => {
    const groups = planStoryboardPanelImageSubmissionGroups([
      panel('panel-1', 0, 'group', 'edit-1:videoBlock:1'),
      panel('panel-2', 1, 'group', 'edit-1:videoBlock:1'),
      panel('panel-3', 2, 'group', 'edit-1:videoBlock:2'),
      panel('panel-4', 3, 'group', 'edit-1:videoBlock:2'),
    ])

    expect(groups).toEqual([
      {
        kind: 'grid2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:1',
        panels: [
          expect.objectContaining({ id: 'panel-1' }),
          expect.objectContaining({ id: 'panel-2' }),
        ],
      },
      {
        kind: 'grid2x2',
        sourceVideoBlockId: 'edit-1:videoBlock:2',
        panels: [
          expect.objectContaining({ id: 'panel-3' }),
          expect.objectContaining({ id: 'panel-4' }),
        ],
      },
    ])
  })

  it('splits large grouped blocks into grid tasks without single-panel remainder tasks', () => {
    const groups = planStoryboardPanelImageSubmissionGroups([
      panel('panel-1', 0, 'group', 'edit-1:videoBlock:1'),
      panel('panel-2', 1, 'group', 'edit-1:videoBlock:1'),
      panel('panel-3', 2, 'group', 'edit-1:videoBlock:1'),
      panel('panel-4', 3, 'group', 'edit-1:videoBlock:1'),
      panel('panel-5', 4, 'group', 'edit-1:videoBlock:1'),
    ])

    expect(groups).toHaveLength(2)
    expect(groups[0]).toEqual({
      kind: 'grid2x2',
      sourceVideoBlockId: 'edit-1:videoBlock:1',
      panels: [
        expect.objectContaining({ id: 'panel-1' }),
        expect.objectContaining({ id: 'panel-2' }),
        expect.objectContaining({ id: 'panel-3' }),
      ],
    })
    expect(groups[1]).toEqual({
      kind: 'grid2x2',
      sourceVideoBlockId: 'edit-1:videoBlock:1',
      panels: [
        expect.objectContaining({ id: 'panel-4' }),
        expect.objectContaining({ id: 'panel-5' }),
      ],
    })
  })

  it('fails explicitly when a panel cannot be assigned to a grid source block', () => {
    expect(() => planStoryboardPanelImageSubmissionGroups([
      panel('panel-1', 0, 'single', 'edit-1:videoBlock:1'),
      panel('panel-2', 1, 'group', 'edit-1:videoBlock:1'),
    ])).toThrow('STORYBOARD_PANEL_GRID_SOURCE_VIDEO_BLOCK_MISSING:panel-1')
  })
})
