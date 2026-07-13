import { forwardRef, type SVGProps } from 'react'
import { createLucideIcon as createLucideIconBase, type IconNode } from 'lucide-react'

function createLucideIcon(name: string, iconNode: IconNode) {
  const keyedIconNode: IconNode = iconNode.map(([tag, attrs], index) => [
    tag,
    {
      ...attrs,
      key: `${name}-${index}`,
    },
  ])
  return createLucideIconBase(name, keyedIconNode)
}

const SearchPlusIcon = createLucideIcon('SearchPlusIcon', [
  ['path', {
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    d: 'M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7',
    fill: 'none',
    stroke: 'currentColor',
  }],
])

const StatsBarGradientIcon = createLucideIcon('StatsBarGradientIcon', [
  ['path', {
    stroke: 'url(#icon-gradient)',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    d: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z',
    fill: 'none',
  }],
])

const StatsEpisodeGradientIcon = createLucideIcon('StatsEpisodeGradientIcon', [
  ['path', {
    stroke: 'url(#icon-gradient)',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    d: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
    fill: 'none',
  }],
])

const StatsImageGradientIcon = createLucideIcon('StatsImageGradientIcon', [
  ['path', {
    stroke: 'url(#icon-gradient)',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    d: 'M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z',
    fill: 'none',
  }],
])

const StatsVideoGradientIcon = createLucideIcon('StatsVideoGradientIcon', [
  ['path', {
    stroke: 'url(#icon-gradient)',
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    strokeWidth: '2',
    d: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z',
    fill: 'none',
  }],
])

export const IconGradientDefs = forwardRef<SVGSVGElement, SVGProps<SVGSVGElement>>(
  function IconGradientDefs(props, ref) {
    return (
      <svg ref={ref} {...props}>
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06b6d4" />
          </linearGradient>
        </defs>
      </svg>
    )
  },
)

export const customIcons = {
  searchPlus: SearchPlusIcon,
  statsBarGradient: StatsBarGradientIcon,
  statsEpisodeGradient: StatsEpisodeGradientIcon,
  statsImageGradient: StatsImageGradientIcon,
  statsVideoGradient: StatsVideoGradientIcon,
} as const
