import { beforeEach, describe, expect, it, vi } from 'vitest'

const executeAiTextStepMock = vi.hoisted(() => vi.fn())

vi.mock('@/lib/ai-exec/engine', () => ({
  executeAiTextStep: executeAiTextStepMock,
}))

import {
  adaptScoreStemPrompt,
  adaptSfxFoleyPrompt,
  analyzeScriptSound,
  buildScoreStemAdapterPrompt,
  buildScriptSoundAnalysisPrompt,
  buildSfxFoleyAdapterPrompt,
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
    projectMetadata: {
      bpm: 84,
      key: 'D_minor',
      overallMood: 'ritualistic body-horror dread',
    },
    dialogueStrategy: {
      action: 'keep_native',
      duckingTrigger: true,
    },
    scoreLayers: [{
      id: 'score_low_drone',
      role: 'tension_bed',
      instrument: 'cello_sub_bass',
      startSec: 0,
      endSec: 30,
      duckingRequired: true,
      description: 'A low sub-bass cello pressure bed under the ritual dance.',
    }, {
      id: 'score_strings_pulse',
      role: 'rhythmic',
      instrument: 'staccato_violins',
      startSec: 8,
      endSec: 26,
      duckingRequired: true,
      description: 'Fast string pulses that intensify as the body trauma accelerates.',
    }],
    foleyLayers: [{
      id: 'foley_susie_floorwork',
      type: 'dance_floor_impact',
      timestamps: [1.2, 4.5, 9.8],
      material: 'bare feet and body weight on polished wooden dance floor',
      description: 'Controlled floor hits, pivots, cloth movement, and breath motion.',
    }],
    spotSfxLayers: [{
      id: 'sfx_jaw_dislocation',
      effectName: 'jaw_dislocation',
      startSec: 7,
      durationSec: 0.5,
      priority: 'critical',
      material: 'bone and cartilage internal joint crack',
      description: 'A dry internal joint crack caused by an invisible blow.',
    }],
    ambienceLayers: [{
      id: 'ambience_mirrored_studio',
      space: 'mirrored_dance_studio',
      layers: ['cold room tone', 'hard mirror reflections', 'distant building hush'],
      startSec: 0,
      endSec: 30,
      description: 'Cold mirrored room tone with hard reflections and distant building hush.',
    }],
  })
}

describe('script sound analysis', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('builds an Audio Director prompt that outputs the new dynamic Sound Mix Plan schema', () => {
    const prompt = buildScriptSoundAnalysisPrompt({
      scriptText: 'Susie and the music begin.',
      targetDurationSeconds: 30,
      locale: 'zh',
    })

    expect(prompt).toContain('Do not generate audio')
    expect(prompt).toContain('Dynamic score layering')
    expect(prompt).toContain('"dialogueStrategy"')
    expect(prompt).toContain('"scoreLayers"')
    expect(prompt).toContain('"foleyLayers"')
    expect(prompt).toContain('"spotSfxLayers"')
    expect(prompt).not.toContain('"bgmPlan"')
    expect(prompt).not.toContain('"stemPromptSeeds"')
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
    expect(prompt).toContain('map music into scoreLayers')
    expect(prompt).toContain('Target duration seconds: 30')
    expect(prompt).toContain('K-0001 maps to the earliest cue group')
    expect(prompt).toContain('soft shoe shift on dance floor')
  })

  it('parses valid script sound analysis JSON', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())

    expect(analysis.targetDurationSeconds).toBe(30)
    expect(analysis.dialogueStrategy.action).toBe('keep_native')
    expect(analysis.projectMetadata).toEqual({
      bpm: 84,
      key: 'D_minor',
      overallMood: 'ritualistic body-horror dread',
    })
    expect(analysis.scoreLayers.map((layer) => layer.id)).toEqual(['score_low_drone', 'score_strings_pulse'])
    expect(analysis.foleyLayers[0]?.id).toBe('foley_susie_floorwork')
    expect(analysis.spotSfxLayers[0]?.priority).toBe('critical')
  })

  it('parses imported sound-description analysis JSON', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson('sound_description'))

    expect(analysis.sourceKind).toBe('sound_description')
    expect(analysis.targetDurationSeconds).toBe(30)
    expect(analysis.foleyLayers[0]?.type).toBe('dance_floor_impact')
  })

  it('fails explicitly when analysis timing exceeds the script clip duration', () => {
    const raw = JSON.parse(validAnalysisJson()) as Record<string, unknown>
    raw.ambienceLayers = [{
      id: 'ambience_too_long',
      space: 'too_long',
      layers: ['room tone'],
      startSec: 0,
      endSec: 31,
      description: 'too long',
    }]

    expect(() => parseScriptSoundAnalysis(JSON.stringify(raw))).toThrow('SCRIPT_SOUND_ANALYSIS_TIMING_OUT_OF_RANGE')
  })

  it('builds a Score Stem Adapter prompt with shared BPM and key isolation rules', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())
    const prompt = buildScoreStemAdapterPrompt({
      projectMetadata: analysis.projectMetadata,
      scoreLayer: analysis.scoreLayers[0]!,
    })

    expect(prompt).toContain('isolated score stem')
    expect(prompt).toContain('no other instruments')
    expect(prompt).toContain('"bpm":84')
    expect(prompt).toContain('"key":"D_minor"')
    expect(prompt).toContain('score_low_drone')
  })

  it('builds an SFX/Foley Adapter prompt that bans music and ambience contamination', () => {
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())
    const prompt = buildSfxFoleyAdapterPrompt({
      layerKind: 'foley',
      layer: analysis.foleyLayers[0]!,
    })

    expect(prompt).toContain('Hollywood Foley Recordist')
    expect(prompt).toContain('do not request music')
    expect(prompt).toContain('no background music')
    expect(prompt).toContain('no ambient noise')
    expect(prompt).toContain('bare feet and body weight')
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
    expect(call?.messages?.[0]?.content).toContain('Sound Mix Plan')
  })

  it('adapts a score layer through the text engine only', async () => {
    executeAiTextStepMock.mockResolvedValueOnce({
      text: '"Isolated cello sub-bass stem, tension bed for cinematic score, 84 BPM, Key of D minor, ritual dread, sustained bow pressure, high-fidelity studio recording, no background noise, no other instruments, 48kHz."',
      reasoning: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      completion: {},
    })
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())

    const prompt = await adaptScoreStemPrompt({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      projectId: 'project-1',
      projectMetadata: analysis.projectMetadata,
      scoreLayer: analysis.scoreLayers[0]!,
    })

    expect(prompt).toContain('Isolated cello sub-bass stem')
    expect(prompt).not.toMatch(/^"/)
    expect(executeAiTextStepMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'score_stem_prompt_adapter',
      temperature: 0.1,
    }))
  })

  it('adapts a Foley layer through the text engine only', async () => {
    executeAiTextStepMock.mockResolvedValueOnce({
      text: 'Foley sound effect: bare feet on polished wooden dance floor, controlled medium impact, dry studio close perspective, crystal clear, highly detailed, isolated sound, close-mic recording, no background music, no ambient noise.',
      reasoning: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      completion: {},
    })
    const analysis = parseScriptSoundAnalysis(validAnalysisJson())

    const prompt = await adaptSfxFoleyPrompt({
      userId: 'user-1',
      model: 'openrouter::anthropic/claude-sonnet-4.6',
      projectId: 'project-1',
      layerKind: 'foley',
      layer: analysis.foleyLayers[0]!,
    })

    expect(prompt).toContain('Foley sound effect')
    expect(executeAiTextStepMock).toHaveBeenCalledWith(expect.objectContaining({
      action: 'sfx_foley_prompt_adapter',
      temperature: 0.1,
    }))
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
    expect(call?.messages?.[0]?.content).toContain('scoreLayers')
    expect(call?.messages?.[0]?.content).toContain('clip-relative `09:00-09:30`')
  })
})
