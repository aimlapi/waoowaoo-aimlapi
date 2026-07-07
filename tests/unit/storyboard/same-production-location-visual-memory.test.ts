import { describe, expect, it } from 'vitest'
import {
  selectSameProductionLocationReferencePanels,
  type SameProductionLocationPanel,
} from '@/lib/storyboard/same-production-location-visual-memory'

function rules(input: {
  readonly productionLocationId: string
  readonly locationId?: string
}) {
  return JSON.stringify({
    productionLocationId: input.productionLocationId,
    locationId: input.locationId ?? null,
  })
}

function panel(input: {
  readonly id: string
  readonly panelIndex: number
  readonly productionLocationId: string
  readonly locationId?: string
  readonly imageUrl?: string | null
}): SameProductionLocationPanel {
  return {
    id: input.id,
    storyboardId: 'storyboard-1',
    panelIndex: input.panelIndex,
    imageUrl: input.imageUrl ?? null,
    imageMediaId: null,
    photographyRules: rules({
      productionLocationId: input.productionLocationId,
      locationId: input.locationId,
    }),
  }
}

describe('selectSameProductionLocationReferencePanels', () => {
  it('selects only previous generated panels from the same production location', () => {
    const allPanels = [
      panel({ id: 'same-old-1', panelIndex: 0, productionLocationId: 'pl_room', locationId: 'loc-room', imageUrl: 'images/old-1.jpg' }),
      panel({ id: 'other-location', panelIndex: 1, productionLocationId: 'pl_office', locationId: 'loc-office', imageUrl: 'images/office.jpg' }),
      panel({ id: 'same-empty', panelIndex: 2, productionLocationId: 'pl_room', locationId: 'loc-room', imageUrl: null }),
      panel({ id: 'same-old-2', panelIndex: 3, productionLocationId: 'pl_room', locationId: 'loc-room', imageUrl: 'images/old-2.jpg' }),
      panel({ id: 'current-1', panelIndex: 4, productionLocationId: 'pl_room', locationId: 'loc-room' }),
      panel({ id: 'current-2', panelIndex: 5, productionLocationId: 'pl_room', locationId: 'loc-room' }),
      panel({ id: 'future-same', panelIndex: 6, productionLocationId: 'pl_room', locationId: 'loc-room', imageUrl: 'images/future.jpg' }),
    ]

    const result = selectSameProductionLocationReferencePanels({
      currentPanels: [allPanels[4], allPanels[5]].filter((item): item is SameProductionLocationPanel => Boolean(item)),
      allPanels,
    })

    expect(result).toMatchObject({
      identity: {
        productionLocationId: 'pl_room',
        locationId: 'loc-room',
      },
      panels: [
        { id: 'same-old-1' },
        { id: 'same-old-2' },
      ],
    })
  })

  it('does not select references when the current group mixes production locations', () => {
    const currentPanels = [
      panel({ id: 'current-room', panelIndex: 4, productionLocationId: 'pl_room', locationId: 'loc-room' }),
      panel({ id: 'current-office', panelIndex: 5, productionLocationId: 'pl_office', locationId: 'loc-office' }),
    ]

    const result = selectSameProductionLocationReferencePanels({
      currentPanels,
      allPanels: [
        panel({ id: 'same-old', panelIndex: 0, productionLocationId: 'pl_room', locationId: 'loc-room', imageUrl: 'images/old.jpg' }),
        ...currentPanels,
      ],
    })

    expect(result).toBeNull()
  })
})
