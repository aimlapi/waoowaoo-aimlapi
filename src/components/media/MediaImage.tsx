'use client'

import type { CSSProperties, ImgHTMLAttributes, MouseEventHandler } from 'react'
import { toDisplayImageUrl } from '@/lib/media/image-url'

export type MediaImageProps = {
  src: string | null | undefined
  alt: string
  className?: string
  style?: CSSProperties
  onClick?: MouseEventHandler<HTMLImageElement>
  fill?: boolean
  width?: number
  height?: number
  sizes?: string
  priority?: boolean
} & Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'alt' | 'width' | 'height'>

function mergeClassNames(...classNames: Array<string | undefined | false>): string {
  return classNames.filter(Boolean).join(' ')
}

export function resolveMediaImageSource(src: string | null | undefined): string | null {
  return toDisplayImageUrl(src) ?? null
}

export function MediaImage({
  src,
  alt,
  className,
  style,
  onClick,
  fill = false,
  width = 1200,
  height = 1200,
  sizes,
  priority = false,
  ...imgProps
}: MediaImageProps) {
  const resolvedSrc = resolveMediaImageSource(src)
  if (!resolvedSrc) return null

  return (
    // 本地媒体路由与签名存储 URL 直接交给浏览器加载，确保 load/error 事件可靠回传给加载态组件。
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={resolvedSrc}
      alt={alt}
      className={mergeClassNames(className, fill && 'absolute inset-0 h-full w-full')}
      style={style}
      onClick={onClick}
      loading={priority ? 'eager' : 'lazy'}
      {...(!fill ? { width, height, sizes } : { sizes })}
      {...imgProps}
    />
  )
}
