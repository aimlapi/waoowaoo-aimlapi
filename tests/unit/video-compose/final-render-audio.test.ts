import { describe, expect, it, vi } from 'vitest'
import { muxFinalRenderAudio, type FinalRenderAudioCommandRunner } from '@/lib/video-compose/final-render-audio'

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

function silentLoudnormJson() {
  return [
    '{',
    '  "input_i": "-inf",',
    '  "input_tp": "-inf",',
    '  "input_lra": "0.00",',
    '  "input_thresh": "-70.00",',
    '  "target_offset": "inf"',
    '}',
  ].join('\n')
}

describe('final render audio mix', () => {
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
    })

    const finalFfmpegCall = runCommandMock.mock.calls.find((call) => {
      const args = call[1]
      return call[0] === 'ffmpeg' && args.includes('-filter_complex') && args.includes('/tmp/final.mp4')
    })
    expect(finalFfmpegCall).toBeTruthy()
    const args = finalFfmpegCall?.[1] ?? []
    expect(args).not.toContain('-stream_loop')
    const filterComplexIndex = args.indexOf('-filter_complex')
    expect(filterComplexIndex).toBeGreaterThanOrEqual(0)
    const filterGraph = args[filterComplexIndex + 1]
    expect(filterGraph).toContain('[main_norm]asplit=2[main_mix][main_sidechain]')
    expect(filterGraph).toContain('[bgm_norm][main_sidechain]sidechaincompress=threshold=0.08:ratio=3:attack=80:release=450')
    expect(filterGraph).toContain('[main_mix][ducked_bgm]amix=inputs=2')
    expect(filterGraph).not.toContain('[bgm][main]sidechaincompress')
    expect(filterGraph).not.toContain('[main][ducked_bgm]amix')
  })

  it('treats unmeasurable silent source audio as absent and still mixes BGM with sound effects', async () => {
    let loudnormCallCount = 0
    const runCommandMock = vi.fn<FinalRenderAudioCommandRunner>(async (command, args) => {
      if (command === 'ffmpeg' && args.some((arg) => arg.includes('print_format=json'))) {
        loudnormCallCount += 1
        return {
          stdout: '',
          stderr: loudnormCallCount === 1 ? loudnormJson() : silentLoudnormJson(),
        }
      }
      return { stdout: '', stderr: '' }
    })

    const result = await muxFinalRenderAudio({
      runCommand: runCommandMock,
      stitchedPath: '/tmp/stitched.mp4',
      mainAudioPath: '/tmp/main-audio.m4a',
      hasSourceAudio: true,
      musicPath: '/tmp/bgm.mp3',
      soundEffects: [
        {
          path: '/tmp/sfx-1.mp3',
          startSeconds: 1.2,
          durationSeconds: 0.8,
        },
      ],
      outputPath: '/tmp/final.mp4',
      durationSeconds: 57,
      volume: 0.42,
    })

    expect(result.hasSourceAudio).toBe(false)
    const finalFfmpegCall = runCommandMock.mock.calls.find((call) => {
      const args = call[1]
      return call[0] === 'ffmpeg' && args.includes('-filter_complex') && args.includes('/tmp/final.mp4')
    })
    expect(finalFfmpegCall).toBeTruthy()
    const args = finalFfmpegCall?.[1] ?? []
    const filterComplexIndex = args.indexOf('-filter_complex')
    expect(filterComplexIndex).toBeGreaterThanOrEqual(0)
    const filterGraph = args[filterComplexIndex + 1]
    expect(filterGraph).toContain('[bgm_norm][sfx0]amix=inputs=2')
    expect(filterGraph).not.toContain('[main_norm]')
    expect(filterGraph).not.toContain('sidechaincompress=')
  })
})
