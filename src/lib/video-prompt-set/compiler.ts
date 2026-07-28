import {
  videoPromptSetResourceSchema,
  videoPromptSetWorkerOutputSchema,
  type VideoPromptSetResource,
  type VideoPromptSetWorkerOutput,
} from './contracts'

type VideoPromptLocale = 'zh' | 'en'

function normalizeLocale(locale: string | null | undefined): VideoPromptLocale {
  return locale?.toLowerCase().startsWith('en') ? 'en' : 'zh'
}

function assertShotSetConformance(output: VideoPromptSetWorkerOutput): void {
  const segmentKeys = new Set<string>()
  const beatIds = new Set<string>()
  for (const [index, segment] of output.segments.entries()) {
    if (segmentKeys.has(segment.key)) {
      throw new Error(`VIDEO_SHOT_KEY_DUPLICATE:${segment.key}`)
    }
    segmentKeys.add(segment.key)
    if (beatIds.has(segment.action.beatId)) {
      throw new Error(`VIDEO_SHOT_ACTION_BEAT_DUPLICATE:${segment.action.beatId}`)
    }
    beatIds.add(segment.action.beatId)
    if ((index === 0) !== (segment.incomingCut === null)) {
      throw new Error(`VIDEO_SHOT_INCOMING_CUT_INVALID:${segment.key}`)
    }
    const previous = output.segments[index - 1]
    if (!previous) continue
    if (segment.entryState.stateId !== previous.exitState.stateId) {
      throw new Error(
        `VIDEO_SHOT_CONTINUITY_STATE_MISMATCH:${previous.key}:${segment.key}:${previous.exitState.stateId}:${segment.entryState.stateId}`,
      )
    }
    const visualChanges = [
      segment.camera.shotSize !== previous.camera.shotSize,
      segment.camera.angle !== previous.camera.angle,
      segment.camera.subjectPlacement !== previous.camera.subjectPlacement,
    ].filter(Boolean).length
    if (visualChanges < 2) {
      throw new Error(`VIDEO_SHOT_ADJACENT_VARIATION_INSUFFICIENT:${previous.key}:${segment.key}`)
    }
  }
}

function numberedReferences(segment: VideoPromptSetWorkerOutput['segments'][number]): {
  readonly uploadOrder: string
  readonly referenceKeys: string[]
} {
  let imageIndex = 0
  let audioIndex = 0
  const entries = segment.references.map((reference) => {
    const alias = reference.mediaType === 'image'
      ? `@Image${String(++imageIndex)}`
      : `@Audio${String(++audioIndex)}`
    return `${alias} = ${reference.key} (${reference.purpose})`
  })
  return {
    uploadOrder: entries.join('; '),
    referenceKeys: segment.references.map((reference) => reference.key),
  }
}

function compileChinesePrompt(
  segment: VideoPromptSetWorkerOutput['segments'][number],
  aspectRatio: string,
): { readonly prompt: string; readonly referenceKeys: string[] } {
  const references = numberedReferences(segment)
  return {
    referenceKeys: references.referenceKeys,
    prompt: [
      `${String(segment.durationSeconds)} 秒，${aspectRatio}。一段只生成一个连续镜头；不得在本段内部切镜、蒙太奇或快切。`,
      `【剪辑职责】${segment.editRole}`,
      `【入口与衔接】${segment.incomingCut ? `${segment.incomingCut.type}：${segment.incomingCut.handoff}` : '全片首镜头，无前置镜头。'} 入口状态 ${segment.entryState.stateId}：${segment.entryState.description}`,
      `【素材上传顺序】${references.uploadOrder}`,
      `【构图与画外关系】景别 ${segment.camera.shotSize}；机位 ${segment.camera.angle}；主体落位 ${segment.camera.subjectPlacement}；银幕方向 ${segment.camera.screenDirection}；摄影机 ${segment.camera.movement}；镜头与景深 ${segment.camera.lensAndDepth}；构图 ${segment.camera.composition}；视线落点 ${segment.camera.gazeTarget}。`,
      `【动作与对白】动作节拍 ${segment.action.beatId} 只在本镜头发生一次并完整推进：${segment.action.description}${segment.action.dialogue ? `；逐字对白：${segment.action.dialogue}` : '；无对白。'}`,
      `【出口状态与切点】出口状态 ${segment.exitState.stateId}：${segment.exitState.description}；切点：${segment.cutPoint}`,
      `【声音】生成原生同步声音：${segment.sound}`,
      `【禁止事项】${[
        '不得把任何资产参考图的白底、资产板拼版、正面站姿或居中直视当作剧情镜头构图',
        '不得重复已经完成的动作节拍',
        '不得新增未引用的角色、地点或道具',
        '不得生成字幕、标题、水印、叠化、交叉溶解、淡入或淡出',
        ...segment.prohibitions,
      ].join('；')}`,
    ].join('\n'),
  }
}

function compileEnglishPrompt(
  segment: VideoPromptSetWorkerOutput['segments'][number],
  aspectRatio: string,
): { readonly prompt: string; readonly referenceKeys: string[] } {
  const references = numberedReferences(segment)
  return {
    referenceKeys: references.referenceKeys,
    prompt: [
      `${String(segment.durationSeconds)} seconds, ${aspectRatio}. Generate exactly one continuous camera shot in this segment; no internal cut, montage, or fast-cut cluster.`,
      `[Edit responsibility] ${segment.editRole}`,
      `[Entry and handoff] ${segment.incomingCut ? `${segment.incomingCut.type}: ${segment.incomingCut.handoff}` : 'Opening shot; no previous shot.'} Entry state ${segment.entryState.stateId}: ${segment.entryState.description}`,
      `[Upload order] ${references.uploadOrder}`,
      `[Composition and off-screen relation] Shot size ${segment.camera.shotSize}; angle ${segment.camera.angle}; subject placement ${segment.camera.subjectPlacement}; screen direction ${segment.camera.screenDirection}; camera movement ${segment.camera.movement}; lens and depth ${segment.camera.lensAndDepth}; composition ${segment.camera.composition}; gaze target ${segment.camera.gazeTarget}.`,
      `[Action and dialogue] Action beat ${segment.action.beatId} occurs once in this shot and advances completely: ${segment.action.description}${segment.action.dialogue ? `; exact dialogue: ${segment.action.dialogue}` : '; no dialogue.'}`,
      `[Exit state and cut point] Exit state ${segment.exitState.stateId}: ${segment.exitState.description}; cut point: ${segment.cutPoint}`,
      `[Sound] Generate native synchronized sound: ${segment.sound}`,
      `[Prohibitions] ${[
        'Never inherit the white background, split asset-board layout, front-facing pose, or centered lens gaze from an asset reference',
        'Never replay a completed action beat',
        'Never add an unreferenced character, location, or prop',
        'No captions, titles, watermarks, dissolves, cross-dissolves, fade-ins, or fade-outs',
        ...segment.prohibitions,
      ].join('; ')}`,
    ].join('\n'),
  }
}

export function compileVideoPromptSet(input: {
  readonly output: unknown
  readonly aspectRatio: string
  readonly locale?: string | null
}): VideoPromptSetResource {
  const output = videoPromptSetWorkerOutputSchema.parse(input.output)
  assertShotSetConformance(output)
  const locale = normalizeLocale(input.locale)
  return videoPromptSetResourceSchema.parse({
    kind: output.kind,
    segments: output.segments.map((segment) => ({
      ...segment,
      ...(locale === 'en'
        ? compileEnglishPrompt(segment, input.aspectRatio)
        : compileChinesePrompt(segment, input.aspectRatio)),
    })),
  })
}
