export const CREATIVE_WORK_OUTPUT_KINDS = [
  'screenplay_draft',
  'edit_bible_bundle',
  'continuity_analysis',
  'style_bible',
  'asset_prompt_set',
  'video_prompt_set',
  'music_direction',
  'creative_review',
] as const

type CreativeWorkOutputKind = (typeof CREATIVE_WORK_OUTPUT_KINDS)[number]

export const CREATIVE_WORK_OUTPUT_POLICY = {
  screenplay_draft: { chapterDelegation: false, requestBatching: false },
  edit_bible_bundle: { chapterDelegation: true, requestBatching: true },
  continuity_analysis: { chapterDelegation: true, requestBatching: true },
  style_bible: { chapterDelegation: false, requestBatching: false },
  asset_prompt_set: { chapterDelegation: false, requestBatching: false },
  video_prompt_set: { chapterDelegation: true, requestBatching: true },
  music_direction: { chapterDelegation: true, requestBatching: true },
  creative_review: { chapterDelegation: true, requestBatching: true },
} as const satisfies Record<CreativeWorkOutputKind, {
  readonly chapterDelegation: boolean
  readonly requestBatching: boolean
}>

type CreativeWorkChapterOutputKind = {
  [Kind in CreativeWorkOutputKind]: (
    (typeof CREATIVE_WORK_OUTPUT_POLICY)[Kind]['chapterDelegation'] extends true
      ? Kind
      : never
  )
}[CreativeWorkOutputKind]

export const CREATIVE_WORK_CHAPTER_OUTPUT_KINDS = CREATIVE_WORK_OUTPUT_KINDS.filter(
  (kind): kind is CreativeWorkChapterOutputKind => (
    CREATIVE_WORK_OUTPUT_POLICY[kind].chapterDelegation
  ),
)

type CreativeWorkRequestBatchOutputKind = {
  [Kind in CreativeWorkOutputKind]: (
    (typeof CREATIVE_WORK_OUTPUT_POLICY)[Kind]['requestBatching'] extends true
      ? Kind
      : never
  )
}[CreativeWorkOutputKind]

export const CREATIVE_WORK_REQUEST_BATCH_OUTPUT_KINDS = CREATIVE_WORK_OUTPUT_KINDS.filter(
  (kind): kind is CreativeWorkRequestBatchOutputKind => (
    CREATIVE_WORK_OUTPUT_POLICY[kind].requestBatching
  ),
)

type CreativeWorkSingleRequestOutputKind = {
  [Kind in CreativeWorkOutputKind]: (
    (typeof CREATIVE_WORK_OUTPUT_POLICY)[Kind]['requestBatching'] extends false
      ? Kind
      : never
  )
}[CreativeWorkOutputKind]

export const CREATIVE_WORK_SINGLE_REQUEST_OUTPUT_KINDS = CREATIVE_WORK_OUTPUT_KINDS.filter(
  (kind): kind is CreativeWorkSingleRequestOutputKind => (
    !CREATIVE_WORK_OUTPUT_POLICY[kind].requestBatching
  ),
)

export const DEFAULT_CREATIVE_WORKER_BUDGETS = {
  maxTurns: 8,
  maxReadCalls: 12,
  maxSkillContentChars: 80_000,
  maxSingleSkillResourceChars: 24_000,
  maxInputChars: 300_000,
  maxOutputChars: 120_000,
} as const

export const CREATIVE_WORKER_HARD_LIMITS = {
  maxTurns: 16,
  maxReadCalls: 24,
  maxSkillContentChars: 160_000,
  maxSingleSkillResourceChars: 48_000,
  maxInputChars: 600_000,
  maxOutputChars: 240_000,
} as const
