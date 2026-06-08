import { NextRequest, NextResponse } from 'next/server'
import { getObjectBuffer } from '@/lib/storage'
import { getMediaObjectByPublicId } from '@/lib/media/service'

export const runtime = 'nodejs'

function buildEtag(media: { sha256?: string | null; id: string; updatedAt?: string | null }) {
  if (media.sha256) return `"${media.sha256}"`
  return `W/"media-${media.id}-${media.updatedAt || '0'}"`
}

function parseRangeHeader(range: string | null, size: number): { readonly start: number; readonly end: number } | null {
  if (!range || size <= 0) return null
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim())
  if (!match) return null

  const [, rawStart, rawEnd] = match
  if (!rawStart && !rawEnd) return null

  if (!rawStart) {
    const suffixLength = Number.parseInt(rawEnd || '', 10)
    if (!Number.isInteger(suffixLength) || suffixLength <= 0) return null
    return { start: Math.max(0, size - suffixLength), end: size - 1 }
  }

  const start = Number.parseInt(rawStart, 10)
  if (!Number.isInteger(start) || start < 0 || start >= size) return null

  if (!rawEnd) {
    return { start, end: size - 1 }
  }

  const end = Number.parseInt(rawEnd, 10)
  if (!Number.isInteger(end) || end < start) return null
  return { start, end: Math.min(end, size - 1) }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)

  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }
  if (!media.storageKey) {
    return NextResponse.json({ error: 'Media storage key missing' }, { status: 500 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const ifNoneMatch = request.headers.get('if-none-match')
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  }

  const range = request.headers.get('range')

  let buffer: Buffer
  try {
    buffer = await getObjectBuffer(media.storageKey)
  } catch {
    return NextResponse.json({ error: 'Failed to fetch media' }, { status: 502 })
  }

  const contentType = media.mimeType || 'application/octet-stream'
  const byteRange = parseRangeHeader(range, buffer.byteLength)
  const body = byteRange ? buffer.subarray(byteRange.start, byteRange.end + 1) : buffer
  const acceptRanges = contentType.startsWith('video/') || contentType.startsWith('audio/') ? 'bytes' : null

  const headers = new Headers()
  headers.set('Content-Type', contentType)
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  headers.set('Content-Length', String(body.byteLength))
  if (byteRange) {
    headers.set('Content-Range', `bytes ${byteRange.start}-${byteRange.end}/${buffer.byteLength}`)
  }
  if (acceptRanges) headers.set('Accept-Ranges', acceptRanges)

  return new Response(new Uint8Array(body), {
    status: byteRange ? 206 : 200,
    headers,
  })
}

export async function HEAD(
  request: NextRequest,
  context: { params: Promise<{ publicId: string }> },
) {
  const { publicId } = await context.params
  const media = await getMediaObjectByPublicId(publicId)
  if (!media) {
    return NextResponse.json({ error: 'Media not found' }, { status: 404 })
  }

  const etag = buildEtag({
    id: media.id,
    sha256: media.sha256,
    updatedAt: media.updatedAt || null,
  })

  const headers = new Headers()
  headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  headers.set('ETag', etag)
  if (media.mimeType) headers.set('Content-Type', media.mimeType)
  if (media.sizeBytes != null) headers.set('Content-Length', String(media.sizeBytes))
  return new Response(null, { status: 200, headers })
}
