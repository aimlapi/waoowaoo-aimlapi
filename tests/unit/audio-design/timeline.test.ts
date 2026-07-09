import { describe, expect, it } from 'vitest'
import { buildTimelineAudioDesign, createTimelineSignature } from '@/lib/audio-design/timeline'
import type { DialogueCue, SpotSfxCue } from '@/lib/audio-design/types'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'

function clip(input: {
  readonly order: number
  readonly panelId: string
  readonly shotNumber: number
  readonly durationSeconds: number
  readonly sound: string
}): FinalRenderClipPlan {
  return {
    panelId: input.panelId,
    groupId: null,
    sourceKind: 'panel',
    source: `/m/${input.panelId}.mp4`,
    durationSeconds: input.durationSeconds,
    order: input.order,
    shotNumber: input.shotNumber,
    shotNumbers: [input.shotNumber],
    description: `shot ${input.shotNumber}`,
    sound: input.sound,
  }
}

describe('audio design timeline', () => {
  it('builds locked timeline audio design with explicit stem plans and ducking sources', () => {
    const clips = [
      clip({
        order: 1,
        panelId: 'panel-1',
        shotNumber: 1,
        durationSeconds: 3,
        sound: 'quiet room tone under a whispered line',
      }),
      clip({
        order: 2,
        panelId: 'panel-2',
        shotNumber: 2,
        durationSeconds: 2,
        sound: 'door slam must hit sharply',
      }),
    ]
    const dialogueCues: readonly DialogueCue[] = [{
      cueId: 'dialogue-1',
      shotNumber: 1,
      speaker: 'Detective',
      text: 'Stay quiet.',
      emotion: 'tense',
      delivery: 'whispered',
      startSec: 0.7,
      endSec: 1.6,
    }]
    const spotSfx: readonly SpotSfxCue[] = [{
      cueId: 'sfx-door-slam',
      shotNumber: 2,
      label: 'door slam',
      description: 'A dry heavy wooden door slam.',
      priority: 'critical',
      startSec: 3.2,
      durationSec: 0.4,
    }]
    const timelineSignature = createTimelineSignature(clips)

    const timelineAudio = buildTimelineAudioDesign({
      clips,
      timelineSignature,
      durationSeconds: 5,
      dialogueCues,
      spotSfx,
    })

    expect(timelineAudio.timelineSignature).toBe(timelineSignature)
    expect(timelineAudio.nativeDialogueSource).toEqual({
      mode: 'native_video_dialogue',
      provider: 'seedance_2_0',
      policy: 'keep_for_dialogue_and_lip_sync',
      description: 'Dialogue, vocal performance, and lip sync are authored by the upstream video model. The audio post module only adds non-dialogue Foley, spot SFX, ambience, and score.',
    })
    expect(timelineAudio.clips.map((item) => [item.startSec, item.endSec])).toEqual([[0, 3], [3, 5]])
    expect(timelineAudio.stemPlan.map((stem) => stem.role)).toEqual([
      'native_video',
      'foley',
      'spot_sfx',
      'ambience',
      'bgm',
    ])
    expect(timelineAudio.stemPlan.map((stem) => [stem.role, stem.modelKey, stem.generationKind])).toEqual([
      ['native_video', null, 'native_reference'],
      ['foley', 'elevenlabs::eleven_text_to_sound_v2', 'foley'],
      ['spot_sfx', 'elevenlabs::eleven_text_to_sound_v2', 'spot_sfx'],
      ['ambience', 'elevenlabs::eleven_text_to_sound_v2', 'ambience'],
      ['bgm', 'fal::fal-ai/lyria3/pro', 'music'],
    ])
    expect(timelineAudio.duckingProfile).toEqual([
      expect.objectContaining({
        startSec: 0,
        endSec: 3,
        bgmVolume: 0.82,
        reason: 'native_video_sound',
        sourceId: 'clip:1',
      }),
      expect.objectContaining({
        startSec: 0.7,
        endSec: 1.6,
        bgmVolume: 0.22,
        reason: 'dialogue',
        sourceId: 'dialogue-1',
      }),
      expect.objectContaining({
        startSec: 3,
        endSec: 5,
        bgmVolume: 0.82,
        reason: 'native_video_sound',
        sourceId: 'clip:2',
      }),
      expect.objectContaining({
        startSec: 3.2,
        endSec: 3.6,
        bgmVolume: 0.48,
        reason: 'critical_sfx',
        sourceId: 'sfx-door-slam',
      }),
    ])
  })

  it('fails explicitly when a dialogue cue points outside the locked timeline', () => {
    const clips = [
      clip({
        order: 1,
        panelId: 'panel-1',
        shotNumber: 1,
        durationSeconds: 3,
        sound: 'room tone',
      }),
    ]

    expect(() => buildTimelineAudioDesign({
      clips,
      timelineSignature: createTimelineSignature(clips),
      durationSeconds: 3,
      dialogueCues: [{
        cueId: 'dialogue-missing',
        shotNumber: 9,
        speaker: null,
        text: 'Impossible.',
        emotion: 'flat',
        delivery: 'dry',
        startSec: 0,
        endSec: 1,
      }],
    })).toThrow('AUDIO_DESIGN_DIALOGUE_SHOT_NOT_IN_TIMELINE:9')
  })
})
