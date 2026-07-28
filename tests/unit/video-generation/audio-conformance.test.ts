import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runFfmpegCommand } from '@/lib/video-compose/ffmpeg-command'
import {
  assertAudibleVideoMeanVolume,
  assertVideoHasAudibleAudio,
  parseVideoMeanVolumeDb,
} from '@/lib/video-generation/audio-conformance'

describe('video native-audio conformance', () => {
  it('parses an audible mean volume from ffmpeg output', () => {
    const stderr = '[Parsed_volumedetect_0] mean_volume: -24.7 dB'
    expect(parseVideoMeanVolumeDb(stderr)).toBe(-24.7)
    expect(() => assertAudibleVideoMeanVolume(stderr)).not.toThrow()
  })

  it('rejects a missing or silent audio measurement', () => {
    expect(() => assertAudibleVideoMeanVolume('no volume output'))
      .toThrow('VIDEO_NATIVE_AUDIO_VOLUME_UNREADABLE')
    expect(() => assertAudibleVideoMeanVolume('mean_volume: -inf dB'))
      .toThrow('VIDEO_NATIVE_AUDIO_SILENT:-Infinity')
    expect(() => assertAudibleVideoMeanVolume('mean_volume: -80.0 dB'))
      .toThrow('VIDEO_NATIVE_AUDIO_SILENT:-80')
  })

  it('accepts a real MP4 with audible audio and rejects one without an audio stream', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'waoowaoo-audio-conformance-test-'))
    const audiblePath = join(directory, 'audible.mp4')
    const silentPath = join(directory, 'no-audio.mp4')
    try {
      await runFfmpegCommand('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.5',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=0.5',
        '-c:v',
        'libx264',
        '-c:a',
        'aac',
        '-y',
        audiblePath,
      ], {
        stage: 'test_create_audible_video',
        expectedDurationSeconds: 1,
      })
      await runFfmpegCommand('ffmpeg', [
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=64x64:d=0.5',
        '-c:v',
        'libx264',
        '-an',
        '-y',
        silentPath,
      ], {
        stage: 'test_create_video_without_audio',
        expectedDurationSeconds: 1,
      })

      await expect(assertVideoHasAudibleAudio({
        buffer: await readFile(audiblePath),
        expectedDurationSeconds: 1,
      })).resolves.toBeUndefined()
      await expect(assertVideoHasAudibleAudio({
        buffer: await readFile(silentPath),
        expectedDurationSeconds: 1,
      })).rejects.toThrow('VIDEO_NATIVE_AUDIO_STREAM_MISSING')
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
