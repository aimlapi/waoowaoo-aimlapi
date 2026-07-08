import { describe, expect, it, vi } from 'vitest'
import {
  buildBgmVolumeFilter,
  muxFinalRenderAudio,
  type FinalRenderAudioCommandRunner,
} from '@/lib/video-compose/final-render-audio'

function loudnormJson() {
  return [
    '{',
    '  "input_i": "-14.72",',
    '  "input_tp": "-1.22",',
    '  "input_lra": "6.30",',
    '  "input_thresh": "-25.05",',
    '  "target_offset": "0.00"',
    '}',
  ].join('\n')
}

describe('final render audio mix', () => {
  it('builds explicit BGM volume automation from the locked audio timeline', () => {
    const filter = buildBgmVolumeFilter({
      baseVolume: 0.8,
      durationSeconds: 10,
      duckingProfile: [
        {
          startSec: 2,
          endSec: 4,
          bgmVolume: 0.25,
          reason: 'dialogue',
          sourceId: 'dialogue-1',
        },
        {
          startSec: 6,
          endSec: 7,
          bgmVolume: 0.5,
          reason: 'critical_sfx',
          sourceId: 'sfx-1',
        },
      ],
    })

    expect(filter).toBe("volume='if(between(t\\,2.000\\,4.000)\\,0.200\\,if(between(t\\,6.000\\,7.000)\\,0.400\\,0.800))':eval=frame")
  })

  it('splits the main audio before sidechain ducking so the mix graph does not reuse one label twice', async () => {
    const runCommandMock = vi.fn<FinalRenderAudioCommandRunner>(async (command) => {
      if (command === 'ffmpeg') return { stdout: '', stderr: loudnormJson() }
      return { stdout: '', stderr: '' }
    })

    await muxFinalRenderAudio({
      runCommand: runCommandMock,
      stitchedPath: '/tmp/stitched.mp4',
      mainAudioPath: '/tmp/main-audio.m4a',
      hasSourceAudio: true,
      musicPath: '/tmp/bgm.mp3',
      outputPath: '/tmp/final.mp4',
      durationSeconds: 57,
      volume: 0.42,
      duckingProfile: [{
        startSec: 10,
        endSec: 14,
        bgmVolume: 0.22,
        reason: 'dialogue',
        sourceId: 'dialogue-1',
      }],
    })

    const finalFfmpegCall = runCommandMock.mock.calls.find((call) => {
      const args = call[1]
      return call[0] === 'ffmpeg' && args.includes('-filter_complex') && args.includes('/tmp/final.mp4')
    })
    expect(finalFfmpegCall).toBeTruthy()
    const args = finalFfmpegCall?.[1] ?? []
    const filterComplexIndex = args.indexOf('-filter_complex')
    expect(filterComplexIndex).toBeGreaterThanOrEqual(0)
    const filterGraph = args[filterComplexIndex + 1]
    expect(filterGraph).toContain('[main_norm]asplit=2[main_mix][main_sidechain]')
    expect(filterGraph).toContain("volume='if(between(t\\,10.000\\,14.000)\\,0.092\\,0.420)':eval=frame")
    expect(filterGraph).toContain('[bgm_norm][main_sidechain]sidechaincompress=threshold=0.08:ratio=3:attack=80:release=450')
    expect(filterGraph).toContain('[main_mix][ducked_bgm]amix=inputs=2')
    expect(filterGraph).not.toContain('[bgm][main]sidechaincompress')
    expect(filterGraph).not.toContain('[main][ducked_bgm]amix')
  })
})
