import type { Locale } from '@/i18n/routing'
import type { FinalRenderClipPlan } from '@/lib/video-compose/final-render-plan'

function safeJson(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null'
}

function buildTimelinePayload(clips: readonly FinalRenderClipPlan[]): unknown {
  let cursorSeconds = 0
  return clips.map((clip) => {
    const startSeconds = cursorSeconds
    cursorSeconds += clip.durationSeconds
    return {
      order: clip.order,
      startSeconds,
      endSeconds: cursorSeconds,
      durationSeconds: clip.durationSeconds,
      sourceKind: clip.sourceKind,
      panelId: clip.panelId,
      groupId: clip.groupId ?? null,
      shotId: clip.shotId,
      shotIds: clip.shotIds,
      shotNumber: clip.shotNumber,
      shotNumbers: clip.shotNumbers,
      visualSummary: clip.description,
      soundDirection: clip.sound,
    }
  })
}

export function buildSoundEffectScorePlanPrompt(input: {
  readonly clips: readonly FinalRenderClipPlan[]
  readonly totalDurationSeconds: number
  readonly locale: Locale
}): string {
  const shape = {
    durationSeconds: input.totalDurationSeconds,
    cues: [
      {
        cueId: 'sfx-001',
        index: 1,
        startSeconds: 1.2,
        durationSeconds: 2.4,
        label: input.locale === 'zh' ? '木门轻响' : 'soft wooden door creak',
        prompt: input.locale === 'zh'
          ? '干净的电影拟音：老木门轻轻打开的吱呀声，近距离，短混响，无音乐，无人声'
          : 'Clean cinematic Foley: an old wooden door softly creaks open, close perspective, short room reverb, no music, no voices',
        sourceClipOrders: [1],
        shotIds: ['shot-1'],
        shotNumbers: [1],
      },
    ],
  }

  if (input.locale === 'zh') {
    return [
      '你是专业影视声音设计师。请根据最终视频剪辑时间线生成音效计划，只设计独立事件音效和必要环境音，不设计背景配乐。',
      '规则：',
      '1. 可以为一个镜头设计 0 个、1 个或多个音效。没有明确声音价值时不要硬加。',
      '2. startSeconds 和 durationSeconds 必须落在整片时间线内；sourceClipOrders 必须引用相关剪辑 order。',
      '3. prompt 是直接发送给 text-to-sound 模型的提示词，必须描述具体可听见的音效，且明确不要音乐、不要人声、不要对白。',
      '4. 不要把 BGM、情绪配乐、旋律、和声、鼓点或长音乐氛围写进音效。',
      '5. 所有面向用户显示的 label 和 prompt 使用中文自然语言；专有名词除外。',
      '6. 只返回严格 JSON，不要 markdown、注释或 JSON 外文字。',
      '',
      'Required JSON shape:',
      safeJson(shape),
      '',
      'Final rendered media timeline JSON:',
      safeJson(buildTimelinePayload(input.clips)),
    ].join('\n')
  }

  return [
    'You are a professional film sound designer. Generate a sound effect plan from the final rendered video timeline. Design only standalone event SFX and necessary ambience, not background music.',
    'Rules:',
    '1. A shot may need zero, one, or multiple sound effects. Do not add effects when there is no clear audible value.',
    '2. startSeconds and durationSeconds must fit inside the full episode timeline; sourceClipOrders must reference related clip order values.',
    '3. prompt is sent directly to a text-to-sound model. It must describe a specific audible sound effect and explicitly avoid music, voices, and dialogue.',
    '4. Do not include BGM, emotional score, melody, harmony, beats, or long musical ambience in SFX prompts.',
    '5. Return strict JSON only. No markdown, no comments, no prose outside JSON.',
    '',
    'Required JSON shape:',
    safeJson(shape),
    '',
    'Final rendered media timeline JSON:',
    safeJson(buildTimelinePayload(input.clips)),
  ].join('\n')
}
