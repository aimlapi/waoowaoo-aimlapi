import { writeFile } from 'node:fs/promises'
import { resolveStorageKeyFromMediaValue } from '@/lib/media/service'
import { getObjectBuffer, toFetchableUrl } from '@/lib/storage'
import type { FinalRenderClipPlan } from './final-render-plan'

export async function writeFinalRenderMediaSource(
  source: FinalRenderClipPlan['source'],
  outputPath: string,
): Promise<void> {
  const storageKey = await resolveStorageKeyFromMediaValue(source)
  if (storageKey) {
    await writeFile(outputPath, await getObjectBuffer(storageKey))
    return
  }
  if (typeof source !== 'string' || !source.trim()) {
    throw new Error('FINAL_RENDER_MEDIA_SOURCE_INVALID')
  }
  const response = await fetch(toFetchableUrl(source))
  if (!response.ok) throw new Error(`FINAL_RENDER_MEDIA_SOURCE_DOWNLOAD_FAILED:${response.status}`)
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()))
}
