export type ScreenPosition = 'left' | 'right' | 'center'

export function screenPositionFromText(text: string | null | undefined): ScreenPosition | null {
  if (!text) return null
  if (/画面左|屏幕左|银幕左|screen-left|left side|left third|左侧|偏左|左边/.test(text)) return 'left'
  if (/画面右|屏幕右|银幕右|screen-right|right side|right third|右侧|偏右|右边/.test(text)) return 'right'
  if (/画面中央|画面中间|屏幕中央|银幕中央|center|central|中央|中间/.test(text)) return 'center'
  return null
}

export function screenPositionLabel(position: ScreenPosition): string {
  if (position === 'left') return '画面左侧'
  if (position === 'right') return '画面右侧'
  return '画面中央'
}

export function oppositeScreenPositionLabel(position: ScreenPosition): string | null {
  if (position === 'left') return '画面右侧'
  if (position === 'right') return '画面左侧'
  return null
}
