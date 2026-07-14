import { executeAiTextStep } from '@/lib/ai-exec/engine'
import type { AiPromptLocale } from '@/lib/ai-prompts'
import { safeParseJsonObject } from '@/lib/json-repair'
import { AMBIENCE_FORBIDDEN_ACTION_TERMS } from './ambience-prompt-policy'
import {
  assertSoundWorldBoundariesMatchVisualFacts,
  type VisualContinuityFacts,
} from './visual-continuity'
import {
  ACOUSTIC_DISTANCE_VALUES,
  ACOUSTIC_ENCLOSURE_VALUES,
  ACOUSTIC_TRANSITION_TYPE_VALUES,
  AMBIENCE_PLAYBACK_TYPE_VALUES,
  AMBIENCE_FOREGROUND_POLICY_VALUES,
  AMBIENCE_ROLE_VALUES,
  AMBIENCE_SPECTRAL_ROLE_VALUES,
  AUDIO_TIMELINE_SCHEMA_VERSION,
  AUTOMATION_INTERPOLATION_VALUES,
  AUTOMATION_TARGET_BUS_VALUES,
  SCORE_CADENCE_POLICY_VALUES,
  SCORE_DENSITY_VALUES,
  SCORE_DYNAMIC_ENVELOPE_VALUES,
  SCORE_EVENT_SPACING_VALUES,
  SCORE_FORM_VALUES,
  SCORE_HARMONIC_RHYTHM_VALUES,
  SCORE_INSTRUMENT_VALUES,
  SCORE_INTERVAL_RELATION_VALUES,
  SCORE_METRIC_SALIENCE_VALUES,
  SCORE_ORCHESTRATION_ROLE_VALUES,
  SCORE_PHASE_FUNCTION_VALUES,
  SCORE_PITCH_CENTER_VALUES,
  SCORE_PITCH_COLLECTION_VALUES,
  SCORE_PROHIBITION_VALUES,
  SCORE_REGISTER_VALUES,
  SCORE_SCORING_STANCE_VALUES,
  SCORE_SPECTRAL_EVOLUTION_VALUES,
  SCORE_TECHNIQUE_VALUES,
  SCORE_TEXTURE_VALUES,
  SCORE_TRANSIENT_POLICY_VALUES,
  SCORE_VOICE_LEADING_VALUES,
  SOUND_PRESENCE_MODE_VALUES,
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
  readonly sceneContinuityFacts: VisualContinuityFacts
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
    soundPresence: [{
      segmentId: 'presence_segment_stable_id',
      range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
      mode: 'ambience_and_score',
      fadeInFrames: Math.max(1, Math.round(clock.fpsNumerator / clock.fpsDenominator)),
      fadeOutFrames: Math.max(1, Math.round(clock.fpsNumerator / clock.fpsDenominator)),
      reason: 'frame-specific decision based on native audio, narrative function, and physical environment',
    }],
    ambienceSources: [{
      sourceId: 'ambience_source_stable_id',
      sourceContinuityId: 'source_stable_id',
      worldId: 'world_stable_id',
      role: 'bed',
      playbackType: 'seamless_loop',
      semanticRole: 'continuous environmental bed',
      baseGainDb: -12,
      salience: 0.2,
      spectralRole: 'broadband',
      foregroundPolicy: 'background_only',
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
      musicTheorySpec: {
        version: 2,
        bpm: 60,
        meter: '4/4',
        form: 'through_composed',
        metricSalience: 'suppressed',
        eventSpacing: 'asynchronous',
        pitch: {
          centerType: 'weakened_pitch_field',
          centerPitch: 'D',
          collection: 'evolving_pitch_class_sets',
          intervalRelations: ['minor_second_aggregation', 'tritone_polarity'],
          microtonality: 'limited',
        },
        harmony: {
          functionalSyntax: 'prohibited',
          cadencePolicy: 'no_cadence',
          harmonicRhythm: 'extremely_slow',
        },
        voiceLeading: ['incremental_micro_motion', 'semitone_displacement'],
        texture: {
          organization: 'independent_sustained_layers',
          density: 'sparse',
          layerIndependence: 0.8,
        },
        spectrum: {
          foundation: ['sub', 'low'],
          upperActivity: 'isolated_partials',
          evolution: 'continuous_redistribution',
        },
        orchestration: [{
          instrument: 'filtered_analog_synthesizer',
          register: 'low',
          role: 'foundation',
          techniques: ['sustained_tone'],
        }, {
          instrument: 'bass_clarinet',
          register: 'low_mid',
          role: 'partial',
          techniques: ['air_noise'],
        }],
        dynamics: {
          envelope: 'long_arc',
          transientPolicy: 'suppressed',
          minimumEnergy: 0.15,
          maximumEnergy: 0.45,
        },
        phases: [{
          phaseId: 'phase_establish',
          range: { startFrame: 0, endFrameExclusive: clock.totalFrames },
          function: 'establish',
          energy: 0.2,
          density: 'sparse',
          spectralBand: 'low',
          transientDensity: 0.05,
        }],
        prohibitions: ['vocals', 'lyrics', 'spoken_word', 'literal_sound_effects', 'environmental_recordings', 'authentic_cadence'],
      },
      intentionalSilenceRanges: [],
    }],
    automationLanes: [{
      laneId: 'score_narrative_gain',
      targetBus: 'score',
      targetSourceId: 'score_cue_stable_id',
      parameter: 'gain_db',
      keyframes: [
        { frame: 100, value: -8, interpolation: 'smooth' },
        { frame: 130, value: -2, interpolation: 'smooth' },
      ],
      postBehavior: 'hold',
      reason: 'continuous narrative score shaping',
      sourceEventId: null,
    }],
  })
}

function strictEnumContract(clock: TimelineClock): string {
  return json({
    acousticPerspective: {
      enclosure: ACOUSTIC_ENCLOSURE_VALUES,
      distance: ACOUSTIC_DISTANCE_VALUES,
    },
    acousticTransition: {
      transitionType: ACOUSTIC_TRANSITION_TYPE_VALUES,
      preservePlaybackPhase: [true],
    },
    ambienceSource: {
      role: AMBIENCE_ROLE_VALUES,
      playbackType: AMBIENCE_PLAYBACK_TYPE_VALUES,
      spectralRole: AMBIENCE_SPECTRAL_ROLE_VALUES,
      foregroundPolicy: AMBIENCE_FOREGROUND_POLICY_VALUES,
      forbiddenPositiveActionTerms: AMBIENCE_FORBIDDEN_ACTION_TERMS,
    },
    soundPresence: {
      mode: SOUND_PRESENCE_MODE_VALUES,
    },
    narrativeDiagnosis: {
      scoringStance: SCORE_SCORING_STANCE_VALUES,
    },
    musicTheorySpec: {
      version: 2,
      form: SCORE_FORM_VALUES,
      pitchCenter: SCORE_PITCH_CENTER_VALUES,
      pitchCollection: SCORE_PITCH_COLLECTION_VALUES,
      intervalRelations: SCORE_INTERVAL_RELATION_VALUES,
      cadencePolicy: SCORE_CADENCE_POLICY_VALUES,
      harmonicRhythm: SCORE_HARMONIC_RHYTHM_VALUES,
      voiceLeading: SCORE_VOICE_LEADING_VALUES,
      texture: SCORE_TEXTURE_VALUES,
      density: SCORE_DENSITY_VALUES,
      registers: SCORE_REGISTER_VALUES,
      instruments: SCORE_INSTRUMENT_VALUES,
      orchestrationRoles: SCORE_ORCHESTRATION_ROLE_VALUES,
      techniques: SCORE_TECHNIQUE_VALUES,
      metricSalience: SCORE_METRIC_SALIENCE_VALUES,
      eventSpacing: SCORE_EVENT_SPACING_VALUES,
      spectralEvolution: SCORE_SPECTRAL_EVOLUTION_VALUES,
      dynamicEnvelope: SCORE_DYNAMIC_ENVELOPE_VALUES,
      transientPolicy: SCORE_TRANSIENT_POLICY_VALUES,
      phaseFunction: SCORE_PHASE_FUNCTION_VALUES,
      prohibitions: SCORE_PROHIBITION_VALUES,
    },
    automationLane: {
      targetBus: AUTOMATION_TARGET_BUS_VALUES,
      parameter: ['gain_db'],
      interpolation: AUTOMATION_INTERPOLATION_VALUES,
      keyframeMinimum: 0,
      keyframeMaximumInclusive: clock.totalFrames - 1,
    },
  })
}

function buildChinesePrompt(input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext' | 'sceneContinuityFacts'>): string {
  return [
    '# 角色',
    '你是一名顶级影视声音总监、声学连续性设计师和电影作曲规划师。',
    '',
    '# 任务',
    '根据锁定后的帧时间轴、实际媒体片段信息和剧情语义，建立全局 AudioContinuityPlanV2。只做规划，不生成音频。',
    '',
    '# 权威与边界',
    '1. 锁定帧时间轴是唯一时间权威。Kernel Compiler 剧本的地点、时间和连续性语义是场景先验；视频画面和原生音轨提供实际运行时证据。发生冲突时必须在输出理由中显式说明，不得静默忽略任一来源。',
    '2. 所有位置使用整数帧，所有范围使用 startFrame/endFrameExclusive。',
    '3. 镜头边界不等于声音边界。',
    '4. 视频模型负责对白、呼吸和与画面同步的物理动作声。不得规划生成 Foley、Spot SFX、对白或动作替代音。',
    '5. ElevenLabs 只负责氛围声；Lyria 只负责配乐。',
    '',
    '# 声音世界规则',
    '1. 根据地点、时间、天气、持续声源和叙事连续性建立 SoundWorld。',
    '2. 必须区分声源连续性、声学区域和声学视角。',
    '3. 分析所有方向的空间变化：室内与室外双向、房间之间、车辆内外双向、开放与封闭双向、接近与远离、遮挡增加与减少、门窗开关和方向变化。',
    '4. 同一物理声源在同一时空持续存在时，必须保留 sourceContinuityId、素材、Loop 播放位置和相位；只能通过自动化改变音量、频率、宽度和混响。所有 acousticTransitions.preservePlaybackPhase 必须严格为 true。',
    '5. 只有物理声源真实开始或结束、时间跳跃、地点非连续切换或环境状态真实改变时，才允许创建新声源。',
    '6. 声学过渡可提前于画面切点或延续到切点之后，但必须使用连续帧范围。',
    '7. 只能在 sceneContinuityFacts.confirmedSceneBoundaryFrames 创建新 SoundWorld。特写、低角度、镜头切换、背景出画和地点未知都必须保留当前 SoundWorld。',
    '',
    '# 氛围 Loop 规则',
    '1. 先完成 soundPresence 判定。只有与 ambience_only 或 ambience_and_score 区间重叠的 SoundWorld 才允许生成氛围音，并且必须至少有一条 role=bed 的稳定常驻底层完整覆盖该 SoundWorld。',
    '2. 稳定持续环境使用 seamless_loop；雷声、人群浪涌和远处广播变化使用 ambient_event。',
    '3. 每个 seamless_loop 必须 candidateCount=2，并给出不超过 ElevenLabs 22 秒限制的整数 targetFrames。',
    '4. Loop 层数按场景复杂度动态决定。复杂环境优先使用不同周期的低密度层，不得把所有内容塞进一条拥挤素材。',
    '5. generationPrompt 必须是英文，只描述中性环境声源；禁止对白、可识别语言、脚步、门、碰撞、人物动作、音乐、旋律和节奏。',
    '6. 每条 role=bed 或 role=detail 的 ambienceSource，其 sourceContinuityId 必须列入所属 SoundWorld.persistentSourceIds；只有 role=ambient_event 可以不声明为持续声源。',
    '7. 每条 ambienceSource 必须规划 baseGainDb、salience、spectralRole 和 foregroundPolicy。bed 必须 baseGainDb<=-8、salience<=0.35 且 foregroundPolicy=background_only；不得让底噪与主要环境细节等响。',
    '',
    '# 声音存在性决策',
    '1. soundPresence 必须无缝覆盖完整时间轴，只能按连续叙事区间划分，不能按镜头机械切分。',
    '2. 每段必须在 native_only、ambience_only、score_only、ambience_and_score、intentional_silence 中选择一个。intentional_silence 只表示不新增声音，绝不静音原生对白和动作声。',
    '3. 根据原生音轨覆盖、物理环境必要性、剧情功能、对白与动作声保护、主观听觉设计决定是否需要氛围音或配乐。默认不是“必须配”。',
    '4. 如果全片都不需要配乐，scoreCues 必须为空；只要任一区间需要配乐，必须输出一个覆盖完整时间轴的连续 Score Cue，由 soundPresence 控制其可听区间。',
    '5. fadeInFrames 和 fadeOutFrames 必须足以形成自然渐变，且两者之和必须小于区间长度。',
    '',
    '# 配乐安全规则',
    '1. narrativeDiagnosis 可保留真实剧情分析，但绝不进入音乐供应商请求。',
    '2. musicTheorySpec 只能使用给定 Schema 中的客观乐理、配器、织体、频谱、节奏和动态枚举及数值，不得包含情绪形容词、人物、身体、工具、伤害、暴力、血腥、犯罪、动作或剧本句子。',
    '3. 必须先在 narrativeDiagnosis 中完成剧情判断，再将判断编译为 musicTheorySpec；不得把 narrativeDiagnosis 的措辞复制进 musicTheorySpec。',
    '4. 不得输出 finalLyriaPrompt；最终正向 Prompt 与 negative_prompt 将由代码从 musicTheorySpec 确定性生成。',
    '5. 当前 Lyria 输出不提供同步 stems；当 soundPresence 需要配乐时，为完整时间轴输出且只输出一个连续 Score Cue，并通过 phases 表达内部音乐结构，不得按镜头机械拆分；全片不需要配乐时 scoreCues 为空。',
    '6. 普通动作不得创建音乐静默；intentionalSilenceRanges 只用于有明确剧情和音乐理由的乐句级静默。',
    '7. 恐怖、爱情、动作或喜剧等类型名称只能存在于 narrativeDiagnosis；musicTheorySpec 必须用终止策略、音程关系、节拍显著度、织体、频谱、瞬态和动态范围表达。',
    '',
    '# 严格枚举契约',
    '以下列表是唯一允许值。不得创造近义词、新风格、新乐器、新情绪或新段落名称；需要表达列表外概念时，选择音乐含义最接近的允许值。',
    '范围的 endFrameExclusive 可以等于 totalFrames；automation keyframe.frame 最大只能等于 totalFrames-1。',
    strictEnumContract(input.clock),
    '',
    '# 混音自动化规则',
    '1. 不得输出矩形静音窗口或瞬时阶跃。',
    '2. automationLanes 只允许 parameter=gain_db。频率、宽度和混响由代码根据 SoundWorld.perspectives 的 enclosure、distance、occlusion 确定性计算，禁止重复规划第二套参数。',
    '3. 自动化关键帧必须严格递增，并使用 smooth、linear 或 equal_power；每条 lane 必须用 postBehavior 明确最后一个值是保持还是回到中性值。',
    '4. 镜头切换本身不得触发自动化。',
    '5. acousticTransitions 的增益、频率、宽度和混响只能由渲染器确定性实现；不得为同一 transitionId 再输出 ambience automationLane。',
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
    '# 已确认场景连续性事实',
    json(input.sceneContinuityFacts),
    '',
    '# 剧情语义',
    json(input.narrativeContext),
  ].join('\n')
}

function buildEnglishPrompt(input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext' | 'sceneContinuityFacts'>): string {
  return [
    '# Role',
    'You are a supervising sound editor, acoustic continuity designer, and film-score planner.',
    '',
    '# Mission',
    'Build one global AudioContinuityPlanV2 from the locked frame timeline, final media clip facts, and narrative context. Plan only; do not generate audio.',
    '',
    '# Authority and ownership',
    '1. The locked frame timeline is the only timing authority. Use integer frames and startFrame/endFrameExclusive ranges. In script-assisted mode, screenplay place, time, and continuity are scene priors; only confirmed visual spatial or temporal change evidence may override them.',
    '2. Shot boundaries are not sound boundaries.',
    '3. The video model owns dialogue, breathing, and synchronized physical action sounds. Never plan generated Foley, Spot SFX, dialogue, or replacement action sound.',
    '4. ElevenLabs owns ambience only. Lyria owns score only.',
    '',
    '# Continuity',
    '1. Build SoundWorlds from place, time, weather, persistent physical sources, and narrative continuity.',
    '2. Separate source continuity, acoustic zone, and acoustic perspective.',
    '3. Analyze transitions in every direction: interior/exterior, room/room, vehicle cabin/exterior, open/enclosed, near/far, increasing/decreasing occlusion, portal opening/closing, and direction changes.',
    '4. If the same physical source persists in the same spacetime, preserve sourceContinuityId, asset identity, loop playback position, and phase. Every acousticTransitions.preservePlaybackPhase value must be exactly true. Express perspective changes only with continuous automation.',
    '5. Create a new source only when the physical source starts or ends, time jumps, location changes discontinuously, or the environment truly changes.',
    '6. Create a new SoundWorld only at sceneContinuityFacts.confirmedSceneBoundaryFrames. Close-ups, low angles, camera cuts, missing backgrounds, and unknown locations preserve the current SoundWorld.',
    '',
    '# Ambience loops',
    '1. Decide soundPresence first. Only SoundWorlds overlapping ambience_only or ambience_and_score may contain generated ambience, and each such world must contain a role=bed source spanning its complete range.',
    '2. Use seamless_loop for stable beds and ambient_event for non-periodic environmental events.',
    '3. Every seamless loop has candidateCount 2 and an integer targetFrames within the ElevenLabs 22-second limit.',
    '4. Use a dynamic number of sparse layers with different periods for complex worlds.',
    '5. generationPrompt must be English environmental-only text with no dialogue, identifiable speech, footsteps, doors, impacts, character actions, music, melody, or rhythm.',
    '6. Every role=bed or role=detail ambienceSource must declare its sourceContinuityId in the owning SoundWorld.persistentSourceIds. Only role=ambient_event may omit persistent-source declaration.',
    '7. Every ambience source declares baseGainDb, salience, spectralRole, and foregroundPolicy. A bed has baseGainDb<=-8, salience<=0.35, and foregroundPolicy=background_only. Never mix a bed at detail prominence.',
    '',
    '# Sound presence decision',
    '1. soundPresence covers the complete timeline contiguously by narrative region, never mechanically by shot.',
    '2. Every segment chooses exactly one of native_only, ambience_only, score_only, ambience_and_score, or intentional_silence. intentional_silence means no generated layer and never mutes native dialogue or action.',
    '3. Decide from native-audio coverage, physical environmental need, narrative function, dialogue/action protection, and subjective listening design. Generated sound is not mandatory by default.',
    '4. Return no scoreCues when the complete timeline needs no score. Otherwise return one full-timeline continuous Score Cue and use soundPresence to control audibility.',
    '',
    '# Score safety',
    '1. narrativeDiagnosis is internal and never reaches the music provider.',
    '2. musicTheorySpec contains only objective music-theory, orchestration, texture, spectrum, rhythm, and dynamics enums and numbers. It contains no emotional adjectives, people, body parts, tools, injury, violence, gore, crime, actions, or screenplay sentences.',
    '3. First diagnose narrative meaning internally, then compile it into musicTheorySpec. Never copy narrativeDiagnosis wording into musicTheorySpec.',
    '4. Never output finalLyriaPrompt. Code deterministically renders both the positive prompt and negative_prompt from musicTheorySpec.',
    '5. Current Lyria output has no synchronized stems. When soundPresence uses score, return exactly one continuous Score Cue spanning the full timeline and express internal form through phases. When score is never used, return no cue.',
    '6. Genre labels such as horror, romance, action, or comedy may exist only in narrativeDiagnosis. Express them musically through cadence policy, interval relations, metric salience, texture, spectrum, transients, and dynamics.',
    '',
    '# Strict enum contract',
    'The following lists are the only allowed values. Never invent synonyms, styles, instruments, emotions, articulations, densities, or section function names. Map every desired concept to the closest allowed value.',
    'A range endFrameExclusive may equal totalFrames. An automation keyframe.frame must be at most totalFrames-1.',
    strictEnumContract(input.clock),
    '',
    '# Automation',
    'Never output rectangular mute windows or instantaneous steps. automationLanes may only use parameter=gain_db. Frequency response, width, and reverb are deterministically derived in code from SoundWorld perspective enclosure, distance, and occlusion. Keyframes are strictly increasing, every lane explicitly declares postBehavior, and shot cuts alone create no automation.',
    'The renderer is the sole authority for acousticTransition gain, frequency, width, and reverb. Never output an ambience automationLane whose sourceEventId repeats an acoustic transitionId.',
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
    '# Confirmed scene continuity facts',
    json(input.sceneContinuityFacts),
    '',
    '# Narrative context',
    json(input.narrativeContext),
  ].join('\n')
}

export function buildAudioContinuityPrompt(
  input: Pick<AudioContinuityAnalysisInput, 'clock' | 'clips' | 'narrativeContext' | 'sceneContinuityFacts' | 'locale'>,
): string {
  return input.locale === 'zh' ? buildChinesePrompt(input) : buildEnglishPrompt(input)
}

export function parseAudioContinuityPlan(
  text: string,
  sceneContinuityFacts: VisualContinuityFacts,
): AudioContinuityPlan {
  const parsedJson = safeParseJsonObject(text)
  const parsed = audioContinuityPlanSchema.safeParse(parsedJson)
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_CONTINUITY_PLAN_INVALID:${messages}`)
  }
  assertSoundWorldBoundariesMatchVisualFacts({
    soundWorldStartFrames: parsed.data.soundWorlds.map((world) => world.range.startFrame),
    facts: sceneContinuityFacts,
  })
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
  return parseAudioContinuityPlan(completion.text, input.sceneContinuityFacts)
}
