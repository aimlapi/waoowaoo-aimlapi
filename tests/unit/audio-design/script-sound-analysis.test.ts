import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeAiTextStepMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
}))

import {
  analyzeScriptSound,
  buildScriptSoundAnalysisPrompt,
  buildSoundDescriptionImportPrompt,
  importSoundDescriptionMarkdown,
  inferSoundDescriptionDurationSeconds,
  parseScriptSoundAnalysis,
} from '@/lib/audio-design/script-sound-analysis'

function validAnalysisJson(sourceKind: 'script' | 'sound_description' = 'script') {
  return JSON.stringify({
    schemaVersion: 1,
    sourceKind,
    targetDurationSeconds: 30,
    summary: 'Susie begins the ritual dance while Olga is trapped in the mirrored studio.',
    emotionalArc: 'Controlled ritual tension escalates into body horror.',
    voiceBible: [{
      characterName: 'Blanc',
      voiceTraits: 'calm, precise, low authority',
      speakingPace: 'measured',
      emotionalRange: 'contained concern to command',
      constraints: ['never melodramatic'],
    }],
    dialogueLayer: [{
      cueId: 'dialogue-blanc-and',
      shotNumber: 1,
      speaker: 'Blanc',
      text: 'And--',
      emotion: 'commanding',
      delivery: 'soft cue into motion',
      startSec: 0.5,
      endSec: 1.2,
    }],
    foleyPlan: [{
      cueId: 'foley-susie-floorwork',
      beatNumber: 1,
      label: 'dance floor impacts',
      description: 'Bare feet and body weight striking the studio floor with controlled force.',
      startSec: 1.2,
      durationSec: 24,
    }],
    spotSfxPlan: [{
      cueId: 'sfx-jaw-dislocation',
      shotNumber: 2,
      label: 'jaw dislocation',
      description: 'A dry internal joint crack caused by an invisible blow.',
      priority: 'critical',
      startSec: 7,
      durationSec: 0.5,
    }],
    ambiencePlan: [{
      cueId: 'ambience-mirrored-studio',
      shotNumbers: [1, 2],
      description: 'Cold mirrored room tone with hard reflections and distant building hush.',
      startSec: 0,
      endSec: 30,
    }],
    bgmPlan: {
      overallDirection: 'Ritual drum-led dread with no vocals.',
      sections: [{
        sectionId: 'bgm-rise',
        startSec: 0,
        endSec: 30,
        intensity: 5,
        description: 'Escalating dance pulse synchronized to body horror impacts.',
      }],
    },
    stemPromptSeeds: {
      dialogue: 'Subtle whispered dance instruction and strained nonverbal pain sounds.',
      foley: 'Precise dance floor impacts, cloth movement, breath, and controlled body turns.',
      spotSfx: 'Internal body trauma impacts: jaw, throat, ribs, sternum, shoulder.',
      ambience: 'Large dance studio and mirrored room air, cold reflective resonance.',
      bgm: 'Ritualistic drum-led cinematic dread, escalating, no vocals.',
    },
  })
}

describe('script sound analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds a script-first sound analysis prompt that rejects direct audio generation', () => {
    const prompt = buildScriptSoundAnalysisPrompt({
      scriptText: 'Susie and the music begin.',
      targetDurationSeconds: 30,
      locale: 'zh',
    })

    expect(prompt).toContain('Do not generate audio')
    expect(prompt).toContain('script-first audio spotting sheet')
    expect(prompt).toContain('"foleyPlan"')
    expect(prompt).toContain('"spotSfxPlan"')
    expect(prompt).toContain('"stemPromptSeeds"')
    expect(prompt).toContain('Target duration seconds: 30')
    expect(prompt).toContain('Susie and the music begin.')
  })

  it('infers duration from sound-description clip-relative metadata', () => {
    const duration = inferSoundDescriptionDurationSeconds([
      '# Suspiria Audio Smoke Test - Sound Description Only',
      '',
      'Source clip: `clip.mp4`, clip-relative `09:00-09:30`, approx original film `37:46-38:16`.',
    ].join('\n'))

    expect(duration).toBe(30)
  })

  it('builds a sound-description import prompt for the blueprint file format', () => {
    const prompt = buildSoundDescriptionImportPrompt({
      markdownText: [
        '# Suspiria Audio Smoke Test - Sound Description Only',
        '',
        'Source clip: `clip.mp4`, clip-relative `09:00-09:30`.',
        '',
        '## Global Sound DNA',
        '- Overall sonic logic: ritual dance pulse transfers force.',
        '',
        '## Ordered Sound Beats',
        '### K-0001 - triangle blocking establishes ritual control',
        'Dialogue:',
        '- BLANC: "And--"',
        'Foley / SFX focus:',
        '- soft shoe shift on dance floor',
      ].join('\n'),
      locale: 'zh',
    })

    expect(prompt).toContain('sound-description-only Markdown')
    expect(prompt).toContain('"sourceKind": "sound_description"')
    expect(prompt).toContain('Target duration seconds: 30')
    expect(prompt).toContain('K-0001 maps to 1')
    expect(prompt).toContain('soft shoe shift on dance floor')
  })

  it('parses valid script sound analysis JSON', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())

    expect(analysis.targetDurationSeconds).toBe(30)
    expect(analysis.dialogueLayer[0]?.cueId).toBe('dialogue-blanc-and')
    expect(analysis.foleyPlan[0]?.cueId).toBe('foley-susie-floorwork')
    expect(analysis.spotSfxPlan[0]?.priority).toBe('critical')
    expect(analysis.stemPromptSeeds.bgm).toContain('Ritualistic')
  })

  it('parses imported sound-description analysis JSON', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson('sound_description'))

    expect(analysis.sourceKind).toBe('sound_description')
    expect(analysis.targetDurationSeconds).toBe(30)
    expect(analysis.foleyPlan[0]?.label).toBe('dance floor impacts')
  })

  it('fails explicitly when analysis timing exceeds the script clip duration', () => {
    const raw = JSON.parse(validAnalysisJson()) as Record<string, unknown>
    raw.ambiencePlan = [{
      cueId: 'ambience-too-long',
      shotNumbers: [1],
      description: 'too long',
      startSec: 0,
      endSec: 31,
    }]

    expect(() => parseScriptSoundAnalysis(JSON.stringify(raw))).toThrow('SCRIPT_SOUND_ANALYSIS_TIMING_OUT_OF_RANGE')
  })

  it('calls the text engine for analysis only and parses the returned JSON', async () => {
    executeAiTextStepMock.mockResolvedValueOnce({
      text: validAnalysisJson(),
      reasoning: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      completion: {},
    })

    const analysis = await analyzeScriptSound({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      scriptText: 'Susie and the music begin.',
      targetDurationSeconds: 30,
      projectId: 'project-1',
      locale: 'zh',
    })

    expect(analysis.summary).toContain('Susie begins')
    expect(executeAiTextStepMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      temperature: 0.25,
      projectId: 'project-1',
      action: 'script_sound_analysis',
      meta: expect.objectContaining({
        stepId: 'script_sound_analysis',
      }),
    }))
    const call = executeAiTextStepMock.mock.calls[0]?.[0] as { messages?: Array<{ content?: string }> } | undefined
    expect(call?.messages?.[0]?.content).toContain('Return JSON only')
  })

  it('imports a sound-description Markdown blueprint through the text engine only', async () => {
    executeAiTextStepMock.mockResolvedValueOnce({
      text: validAnalysisJson('sound_description'),
      reasoning: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      completion: {},
    })

    const analysis = await importSoundDescriptionMarkdown({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      markdownText: [
        '# Suspiria Audio Smoke Test - Sound Description Only',
        '',
        'Source clip: `clip.mp4`, clip-relative `09:00-09:30`.',
        '',
        '## Ordered Sound Beats',
        '### K-0001 - Blanc cues the ritual',
        'Dialogue:',
        '- BLANC: "And--"',
      ].join('\n'),
      projectId: 'project-1',
      locale: 'zh',
    })

    expect(analysis.sourceKind).toBe('sound_description')
    expect(executeAiTextStepMock).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      temperature: 0.15,
      projectId: 'project-1',
      action: 'sound_description_import',
      meta: expect.objectContaining({
        stepId: 'sound_description_import',
      }),
    }))
    const call = executeAiTextStepMock.mock.calls[0]?.[0] as { messages?: Array<{ content?: string }> } | undefined
    expect(call?.messages?.[0]?.content).toContain('Do not generate audio')
    expect(call?.messages?.[0]?.content).toContain('clip-relative `09:00-09:30`')
  })
})
