import { describe, expect, it, vi } from 'vitest'
import {
  muxFinalRenderAudio,
  type FinalRenderAudioCommandRunner,
} from '@/lib/video-compose/final-render-audio'
import { TEST_CLOCK } from '../audio-design/audio-timeline-fixture'

function loudnormJson(): string {
  return JSON.stringify({
    input_i: '-14.72',
    input_tp: '-1.22',
    input_lra: '6.30',
    input_thresh: '-25.05',
    target_offset: '0.00',
  })
}

describe('final render audio mix', () => {
  it('mixes native, continuous score, and looped ambience without full-track sidechain pumping', async () => {
    const runCommandMock = vi.fn<FinalRenderAudioCommandRunner>(async (command, args) => {
      if (command === 'ffprobe' && args.includes('format=duration')) return { stdout: '10\n', stderr: '' }
      if (command === 'ffmpeg' && args.includes('-f') && args.includes('null')) {
        return { stdout: '', stderr: loudnormJson() }
      }
      return { stdout: '', stderr: '' }
    })

    const result = await muxFinalRenderAudio({
      runCommand: runCommandMock,
      stitchedPath: '/tmp/stitched.mp4',
      mainAudioPath: '/tmp/main-audio.wav',
      hasSourceAudio: true,
      musicPath: '/tmp/bgm.mp3',
      ambienceTracks: [{
        sourceId: 'stadium-bed',
        sourceContinuityId: 'stadium-continuity',
        path: '/tmp/stadium.mp3',
        range: { startFrame: 0, endFrameExclusive: 240 },
        loop: true,
        crossfadeFrames: 12,
        phaseOffsetFrames: 0,
        perspectives: [{
          perspectiveId: 'inside',
          zoneId: 'stadium-inside',
          range: { startFrame: 0, endFrameExclusive: 120 },
          enclosure: 'enclosed',
          distance: 'far',
          occlusion: 0.7,
          description: 'same crowd and rain filtered by the stadium shell',
        }, {
          perspectiveId: 'outside',
          zoneId: 'stadium-outside',
          range: { startFrame: 120, endFrameExclusive: 240 },
          enclosure: 'open',
          distance: 'near',
          occlusion: 0.1,
          description: 'same crowd and rain heard outside',
        }],
        transitions: [{
          transitionId: 'exit-stadium',
          sourceContinuityId: 'stadium-continuity',
          range: { startFrame: 108, endFrameExclusive: 132 },
          fromZoneId: 'stadium-inside',
          toZoneId: 'stadium-outside',
          transitionType: 'exiting_enclosure',
          preservePlaybackPhase: true,
          automationIntent: {
            gain: 'smooth increase',
            frequency: 'restore highs',
            spatialWidth: 'widen',
            reverb: 'move outdoors',
          },
        }],
      }],
      ambienceQualityPcmPath: '/tmp/ambience-quality.f32le',
      ambienceQualityBoundaryFrames: [],
      outputPath: '/tmp/final.mp4',
      clock: TEST_CLOCK,
      volume: 0.42,
      automationLanes: [{
        laneId: 'score-space',
        targetBus: 'score',
        targetSourceId: null,
        parameter: 'gain_db',
        keyframes: [
          { frame: 48, value: 0, interpolation: 'smooth' },
          { frame: 60, value: -4, interpolation: 'smooth' },
          { frame: 96, value: 0, interpolation: 'smooth' },
        ],
        postBehavior: 'hold',
        reason: 'smooth space for native action',
        sourceEventId: 'action-1',
      }],
    })

    expect(result.ambienceTrackCount).toBe(1)
    const finalCall = runCommandMock.mock.calls.find(([command, args]) => (
      command === 'ffmpeg' && args.includes('/tmp/final.mp4')
    ))
    const args = finalCall?.[1] ?? []
    const filterGraph = args[args.indexOf('-filter_complex') + 1]
    expect(args).toContain('-stream_loop')
    expect(filterGraph).toContain('[native_bus]')
    expect(filterGraph).toContain('[score_bus]')
    expect(filterGraph).toContain('[amb_0]')
    expect(filterGraph).toContain('[amb_1]')
    expect(filterGraph).toContain('afade=t=out')
    expect(filterGraph).toContain('afade=t=in')
    expect(filterGraph).toContain('curve=qsin')
    expect(filterGraph).toContain('lowpass=f=')
    expect(filterGraph).toContain('stereotools=')
    expect(filterGraph).toContain('atrim=start_sample=216000:end_sample=480000')
    expect(filterGraph).toContain('adelay=216000S:all=1')
    expect(filterGraph).toContain('pow(10')
    expect(filterGraph).not.toContain('between(')
    expect(filterGraph).not.toContain('sidechaincompress')
  })

  it('fails explicitly instead of looping a short BGM', async () => {
    const runCommandMock = vi.fn<FinalRenderAudioCommandRunner>(async (command, args) => {
      if (command === 'ffprobe' && args.includes('format=duration')) return { stdout: '9\n', stderr: '' }
      return { stdout: '', stderr: loudnormJson() }
    })

    await expect(muxFinalRenderAudio({
      runCommand: runCommandMock,
      stitchedPath: '/tmp/stitched.mp4',
      mainAudioPath: '/tmp/main-audio.wav',
      hasSourceAudio: false,
      musicPath: '/tmp/bgm.mp3',
      ambienceTracks: [],
      ambienceQualityPcmPath: '/tmp/ambience-quality.f32le',
      ambienceQualityBoundaryFrames: [],
      outputPath: '/tmp/final.mp4',
      clock: TEST_CLOCK,
      volume: 0.4,
      automationLanes: [],
    })).rejects.toThrow('FINAL_VIDEO_RENDER_BGM_TOO_SHORT:9:10')
  })

  it('rejects a second gain lane for an acoustic transition handled by the renderer', async () => {
    const runCommandMock = vi.fn<FinalRenderAudioCommandRunner>(async (command, args) => {
      if (command === 'ffprobe' && args.includes('format=duration')) return { stdout: '10\n', stderr: '' }
      return { stdout: '', stderr: loudnormJson() }
    })

    await expect(muxFinalRenderAudio({
      runCommand: runCommandMock,
      stitchedPath: '/tmp/stitched.mp4',
      mainAudioPath: '/tmp/main-audio.wav',
      hasSourceAudio: false,
      musicPath: '/tmp/bgm.mp3',
      ambienceTracks: [{
        sourceId: 'rain-bed',
        sourceContinuityId: 'storm-rain',
        path: '/tmp/rain.mp3',
        range: { startFrame: 0, endFrameExclusive: 240 },
        loop: true,
        crossfadeFrames: 12,
        phaseOffsetFrames: 0,
        perspectives: [{
          perspectiveId: 'inside',
          zoneId: 'inside',
          range: { startFrame: 0, endFrameExclusive: 120 },
          enclosure: 'enclosed',
          distance: 'far',
          occlusion: 0.7,
          description: 'filtered rain',
        }, {
          perspectiveId: 'outside',
          zoneId: 'outside',
          range: { startFrame: 120, endFrameExclusive: 240 },
          enclosure: 'open',
          distance: 'near',
          occlusion: 0.1,
          description: 'direct rain',
        }],
        transitions: [{
          transitionId: 'exit',
          sourceContinuityId: 'storm-rain',
          range: { startFrame: 108, endFrameExclusive: 132 },
          fromZoneId: 'inside',
          toZoneId: 'outside',
          transitionType: 'exiting_enclosure',
          preservePlaybackPhase: true,
          automationIntent: {
            gain: 'increase',
            frequency: 'open',
            spatialWidth: 'widen',
            reverb: 'reduce',
          },
        }],
      }],
      ambienceQualityPcmPath: '/tmp/ambience-quality.f32le',
      ambienceQualityBoundaryFrames: [],
      outputPath: '/tmp/final.mp4',
      clock: TEST_CLOCK,
      volume: 0.4,
      automationLanes: [{
        laneId: 'duplicate-exit-gain',
        targetBus: 'ambience',
        targetSourceId: 'rain-bed',
        parameter: 'gain_db',
        keyframes: [
          { frame: 108, value: -8, interpolation: 'smooth' },
          { frame: 132, value: -2, interpolation: 'smooth' },
        ],
        postBehavior: 'hold',
        reason: 'duplicate renderer transition',
        sourceEventId: 'exit',
      }],
    })).rejects.toThrow('FINAL_VIDEO_RENDER_AMBIENCE_TRANSITION_AUTOMATION_DUPLICATED:duplicate-exit-gain')
  })
})
