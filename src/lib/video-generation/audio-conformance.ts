import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runFfmpegCommand } from '@/lib/video-compose/ffmpeg-command'

const MINIMUM_AUDIBLE_MEAN_VOLUME_DB = -80

export function parseVideoMeanVolumeDb(stderr: string): number | null {
  const match = stderr.match(/mean_volume:\s*(-?(?:\d+(?:\.\d+)?|inf))\s*dB/iu)
  if (!match) return null
  const raw = match[1]?.toLowerCase()
  if (!raw || raw === '-inf') return Number.NEGATIVE_INFINITY
  const value = Number.parseFloat(raw)
  return Number.isFinite(value) ? value : null
}

export function assertAudibleVideoMeanVolume(stderr: string): void {
  const meanVolumeDb = parseVideoMeanVolumeDb(stderr)
  if (meanVolumeDb === null) {
    throw new Error('VIDEO_NATIVE_AUDIO_VOLUME_UNREADABLE')
  }
  if (meanVolumeDb <= MINIMUM_AUDIBLE_MEAN_VOLUME_DB) {
    throw new Error(`VIDEO_NATIVE_AUDIO_SILENT:${String(meanVolumeDb)}`)
  }
}

export async function assertVideoHasAudibleAudio(input: {
  readonly buffer: Buffer
  readonly expectedDurationSeconds: number
}): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), 'waoowaoo-video-audio-'))
  const filePath = join(directory, 'generated-video.mp4')
  try {
    await writeFile(filePath, input.buffer)
    const streamProbe = await runFfmpegCommand('ffprobe', [
      '-v',
      'error',
      '-select_streams',
      'a:0',
      '-show_entries',
      'stream=index',
      '-of',
      'csv=p=0',
      filePath,
    ], { stage: 'creative_resource_video_probe_audio_stream' })
    if (!streamProbe.stdout.trim()) {
      throw new Error('VIDEO_NATIVE_AUDIO_STREAM_MISSING')
    }
    const volumeProbe = await runFfmpegCommand('ffmpeg', [
      '-hide_banner',
      '-i',
      filePath,
      '-map',
      '0:a:0',
      '-af',
      'volumedetect',
      '-f',
      'null',
      '-',
    ], {
      stage: 'creative_resource_video_probe_audio_volume',
      expectedDurationSeconds: input.expectedDurationSeconds,
    })
    assertAudibleVideoMeanVolume(volumeProbe.stderr)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}
