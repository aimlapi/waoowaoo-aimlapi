import { executeAiTextStep } from '@/lib/ai-exec/engine'
import type { AiPromptLocale } from '@/lib/ai-prompts'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  AUDIO_TIMELINE_SCHEMA_VERSION,
  audioContinuityPlanSchema,
  type AudioContinuityPlan,
  type TimelineClock,
  type TimelineClipAudio,
} from './types'

export interface AudioContinuityAnalysisInput {
  readonly userId: string
  readonly model: string
  readonly clock: TimelineClock
  readonly clips: readonly TimelineClipAudio[]
  readonly narrativeContext: unknown
  readonly projectId?: string
  readonly locale?: AiPromptLocale
}

function json(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? 'null'
}

function outputShape(clock: TimelineClock): string {
  return json({
    schemaVersion: AUDIO_TIMELINE_SCHEMA_VERSION,
    soundWorlds: [{
      worldId: 'world_stable_id',
      continuityKey: 'same_place_time_weather_and_persistent_sources',
      range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
      location: 'natural-language location',
      timeContext: 'natural-language time context',
      weatherContext: null,
      persistentSourceIds: ['source_stable_id'],
      perspectives: [{
        perspectiveId: 'perspective_stable_id',
        zoneId: 'zone_stable_id',
        range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
        enclosure: 'enclosed',
        distance: 'medium',
        occlusion: 0.5,
        description: 'natural-language acoustic perspective',
      }],
    }],
    acousticTransitions: [{
      transitionId: 'transition_stable_id',
      sourceContinuityId: 'source_stable_id',
      range: { startFrame: 100, endFrameExclusive: 130 },
      fromZoneId: 'zone_a',
      toZoneId: 'zone_b',
      transitionType: 'entering_enclosure',
      preservePlaybackPhase: true,
      automationIntent: {
        gain: 'smooth attenuation',
        frequency: 'smooth high-frequency reduction',
        spatialWidth: 'smooth narrowing',
        reverb: 'smooth room-response transition',
      },
    }],
    ambienceSources: [{
      sourceId: 'ambience_source_stable_id',
      sourceContinuityId: 'source_stable_id',
      worldId: 'world_stable_id',
      playbackType: 'seamless_loop',
      semanticRole: 'continuous environmental bed',
      range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
      description: 'natural-language source description',
      generationPrompt: 'English ElevenLabs prompt describing only neutral environmental ambience',
      promptInfluence: 0.7,
      loopPolicy: {
        enabled: true,
        candidateCount: 2,
        targetFrames: Math.min(clock.totalFrames, Math.round(20 * clock.fpsNumerator / clock.fpsDenominator)),
        crossfadeFrames: Math.max(1, Math.round(clock.fpsNumerator / clock.fpsDenominator / 2)),
        phaseOffsetFrames: 0,
        promptInfluence: 0.7,
      },
    }],
    scoreCues: [{
      cueId: 'score_cue_stable_id',
      musicalContinuityId: 'music_continuity_stable_id',
      range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
      narrativeDiagnosis: {
        surfaceEmotion: 'internal narrative diagnosis',
        trueScoringEmotion: 'internal scoring diagnosis',
        scoringStance: 'minimal_presence',
        avoidEmotions: ['internal diagnosis only'],
        musicShouldDo: 'internal narrative intent only',
        musicShouldNotDo: 'internal narrative limitation only',
      },
      generationSpec: {
        bpm: 60,
        key: 'D minor',
        meter: '4/4',
        style: 'minimalist_underscore',
        emotionalProfile: 'restrained_tension',
        harmonicLanguage: 'sparse_unresolved_minor',
        density: 'sparse',
        registers: ['low', 'low_mid'],
        instruments: ['muted_analog_synthesizer', 'soft_sub_bass'],
        articulations: ['sustained', 'soft_attack'],
        sections: [{
          sectionId: 'section_opening',
          range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
          function: 'opening',
          energy: 0.2,
          density: 'sparse',
          harmonicTension: 0.3,
          instruments: ['muted_analog_synthesizer'],
          articulations: ['sustained'],
        }],
      },
      intentionalSilenceRanges: [],
    }],
    automationLanes: [{
      laneId: 'ambience_perspective_gain',
      targetBus: 'ambience',
      targetSourceId: 'ambience_source_stable_id',
      parameter: 'gain_db',
      keyframes: [
        { frame: 100, value: -8, interpolation: 'smooth' },
        { frame: 130, value: -2, interpolation: 'smooth' },
      ],
      postBehavior: 'hold',
      reason: 'acoustic perspective transition',
      sourceEventId: 'transition_stable_id',
    }],
  })
}

function buildChinesePrompt(input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext'>): string {
  return [
    '# 角色',
    '你是一名顶级影视声音总监、声学连续性设计师和电影作曲规划师。',
    '',
    '# 任务',
    '根据锁定后的帧时间轴、实际媒体片段信息和剧情语义，建立全局 AudioContinuityPlanV2。只做规划，不生成音频。',
    '',
    '# 权威与边界',
    '1. 锁定帧时间轴是唯一时间权威；剧情只提供语义。',
    '2. 所有位置使用整数帧，所有范围使用 startFrame/endFrameExclusive。',
    '3. 镜头边界不等于声音边界。',
    '4. 视频模型负责对白、呼吸和与画面同步的物理动作声。不得规划生成 Foley、Spot SFX、对白或动作替代音。',
    '5. ElevenLabs 只负责氛围声；Lyria 只负责配乐。',
    '',
    '# 声音世界规则',
    '1. 根据地点、时间、天气、持续声源和叙事连续性建立 SoundWorld。',
    '2. 必须区分声源连续性、声学区域和声学视角。',
    '3. 分析所有方向的空间变化：室内与室外双向、房间之间、车辆内外双向、开放与封闭双向、接近与远离、遮挡增加与减少、门窗开关和方向变化。',
    '4. 同一物理声源在同一时空持续存在时，必须保留 sourceContinuityId、素材、Loop 播放位置和相位；只能通过自动化改变音量、频率、宽度和混响。',
    '5. 只有物理声源真实开始或结束、时间跳跃、地点非连续切换或环境状态真实改变时，才允许创建新声源。',
    '6. 声学过渡可提前于画面切点或延续到切点之后，但必须使用连续帧范围。',
    '',
    '# 氛围 Loop 规则',
    '1. 稳定持续环境使用 seamless_loop；雷声、人群浪涌和远处广播变化使用 ambient_event。',
    '2. 每个 seamless_loop 必须 candidateCount=2，并给出不超过 ElevenLabs 22 秒限制的整数 targetFrames。',
    '3. Loop 层数按场景复杂度动态决定。复杂环境优先使用不同周期的低密度层，不得把所有内容塞进一条拥挤素材。',
    '4. generationPrompt 必须是英文，只描述中性环境声源；禁止对白、可识别语言、脚步、门、碰撞、人物动作、音乐、旋律和节奏。',
    '',
    '# 配乐安全规则',
    '1. narrativeDiagnosis 可保留真实剧情分析，但绝不进入音乐供应商请求。',
    '2. generationSpec 只能使用给定 Schema 中的纯音乐枚举和数值，不得包含人物、身体、工具、伤害、暴力、血腥、犯罪、动作或剧本句子。',
    '3. 不得输出 finalLyriaPrompt；最终 Prompt 将由代码从 generationSpec 确定性生成。',
    '4. 当前 Lyria 输出不提供同步 stems；必须为完整时间轴输出且只输出一个连续 Score Cue，并通过 sections 表达内部音乐结构，不得按镜头机械拆分。',
    '5. 普通动作不得创建音乐静默；intentionalSilenceRanges 只用于有明确剧情和音乐理由的乐句级静默。',
    '',
    '# 混音自动化规则',
    '1. 不得输出矩形静音窗口或瞬时阶跃。',
    '2. automationLanes 只允许 parameter=gain_db。频率、宽度和混响由代码根据 SoundWorld.perspectives 的 enclosure、distance、occlusion 确定性计算，禁止重复规划第二套参数。',
    '3. 自动化关键帧必须严格递增，并使用 smooth、linear 或 equal_power；每条 lane 必须用 postBehavior 明确最后一个值是保持还是回到中性值。',
    '4. 镜头切换本身不得触发自动化。',
    '',
    '# 输出',
    '只输出严格 JSON，不要 Markdown、解释或额外字段。所有自然语言说明使用中文；generationPrompt 使用英文。',
    outputShape(input.clock),
    '',
    '# 帧时钟',
    json(input.clock),
    '',
    '# 锁定媒体时间轴',
    json(input.clips),
    '',
    '# 剧情语义',
    json(input.narrativeContext),
  ].join('\n')
}

function buildEnglishPrompt(input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext'>): string {
  return [
    '# Role',
    'You are a supervising sound editor, acoustic continuity designer, and film-score planner.',
    '',
    '# Mission',
    'Build one global AudioContinuityPlanV2 from the locked frame timeline, final media clip facts, and narrative context. Plan only; do not generate audio.',
    '',
    '# Authority and ownership',
    '1. The locked frame timeline is the only timing authority. Use integer frames and startFrame/endFrameExclusive ranges.',
    '2. Shot boundaries are not sound boundaries.',
    '3. The video model owns dialogue, breathing, and synchronized physical action sounds. Never plan generated Foley, Spot SFX, dialogue, or replacement action sound.',
    '4. ElevenLabs owns ambience only. Lyria owns score only.',
    '',
    '# Continuity',
    '1. Build SoundWorlds from place, time, weather, persistent physical sources, and narrative continuity.',
    '2. Separate source continuity, acoustic zone, and acoustic perspective.',
    '3. Analyze transitions in every direction: interior/exterior, room/room, vehicle cabin/exterior, open/enclosed, near/far, increasing/decreasing occlusion, portal opening/closing, and direction changes.',
    '4. If the same physical source persists in the same spacetime, preserve sourceContinuityId, asset identity, loop playback position, and phase. Express perspective changes only with continuous automation.',
    '5. Create a new source only when the physical source starts or ends, time jumps, location changes discontinuously, or the environment truly changes.',
    '',
    '# Ambience loops',
    '1. Use seamless_loop for stable beds and ambient_event for non-periodic environmental events.',
    '2. Every seamless loop has candidateCount 2 and an integer targetFrames within the ElevenLabs 22-second limit.',
    '3. Use a dynamic number of sparse layers with different periods for complex worlds.',
    '4. generationPrompt must be English environmental-only text with no dialogue, identifiable speech, footsteps, doors, impacts, character actions, music, melody, or rhythm.',
    '',
    '# Score safety',
    '1. narrativeDiagnosis is internal and never reaches the music provider.',
    '2. generationSpec contains only the schema musical enums and numbers. Never include people, body parts, tools, injury, violence, gore, crime, actions, or screenplay sentences.',
    '3. Never output finalLyriaPrompt. Code will deterministically render it from generationSpec.',
    '4. Current Lyria output has no synchronized stems. Return exactly one continuous Score Cue spanning the full timeline and express internal form through sections. Ordinary actions never create silence.',
    '',
    '# Automation',
    'Never output rectangular mute windows or instantaneous steps. automationLanes may only use parameter=gain_db. Frequency response, width, and reverb are deterministically derived in code from SoundWorld perspective enclosure, distance, and occlusion. Keyframes are strictly increasing, every lane explicitly declares postBehavior, and shot cuts alone create no automation.',
    '',
    '# Output',
    'Return strict JSON only with no markdown, explanation, or extra fields.',
    outputShape(input.clock),
    '',
    '# Timeline clock',
    json(input.clock),
    '',
    '# Locked media timeline',
    json(input.clips),
    '',
    '# Narrative context',
    json(input.narrativeContext),
  ].join('\n')
}

export function buildAudioContinuityPrompt(
  input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext' | 'locale'>,
): string {
  return input.locale === 'zh' ? buildChinesePrompt(input) : buildEnglishPrompt(input)
}

export function parseAudioContinuityPlan(text: string): AudioContinuityPlan {
  const parsedJson = safeParseJsonObject(text)
  const parsed = audioContinuityPlanSchema.safeParse(parsedJson)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_CONTINUITY_PLAN_INVALID:${messages}`)
  }
  return parsed.data
}

export async function analyzeAudioContinuity(input: AudioContinuityAnalysisInput): Promise<AudioContinuityPlan> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{
      role: 'user',
      content: buildAudioContinuityPrompt(input),
    }],
    temperature: 0.15,
    projectId: input.projectId,
    action: 'audio_continuity_plan_v2',
    meta: {
      stepId: 'audio_continuity_plan_v2',
      stepTitle: 'audio_continuity_plan_v2',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseAudioContinuityPlan(completion.text)
}
