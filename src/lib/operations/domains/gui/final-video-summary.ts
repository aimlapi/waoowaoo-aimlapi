function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function normalizeString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullableString(value: unknown): string | null {
  const normalized = normalizeString(value)
  return normalized.length > 0 ? normalized : null
}

export function normalizeMusicScoreSummary(value: unknown) {
  const score = toObject(value)
  const status = normalizeString(score.status)
  if (!status) return null
  const cues = toObject(score.cuesJson)
  const diagnostics = toObject(score.diagnosticsJson)
  return {
    id: normalizeNullableString(score.id),
    status,
    version: typeof score.version === 'number' ? score.version : null,
    taskId: normalizeNullableString(score.taskId),
    timelineSignature: normalizeNullableString(score.timelineSignature),
    musicModel: normalizeNullableString(score.musicModel),
    durationSeconds: typeof cues.durationSeconds === 'number' ? cues.durationSeconds : null,
    plan: cues.plan ?? null,
    cues: score.cuesJson ?? null,
    mix: score.mixJson ?? cues.mix ?? null,
    diagnostics: score.diagnosticsJson ?? null,
    errorMessage: normalizeNullableString(diagnostics.errorMessage) ?? normalizeNullableString(cues.errorMessage),
    updatedAt: score.updatedAt instanceof Date
      ? score.updatedAt.toISOString()
      : normalizeNullableString(score.updatedAt),
  }
}

function normalizeSoundEffectCue(value: unknown) {
  const cue = toObject(value)
  const cueId = normalizeString(cue.cueId)
  const label = normalizeString(cue.label)
  const prompt = normalizeString(cue.prompt)
  const url = normalizeString(cue.url)
  if (!cueId || !label || !prompt) return null
  return {
    cueId,
    index: typeof cue.index === 'number' ? cue.index : null,
    startSeconds: typeof cue.startSeconds === 'number' ? cue.startSeconds : null,
    durationSeconds: typeof cue.durationSeconds === 'number' ? cue.durationSeconds : null,
    label,
    prompt,
    sourceClipOrders: Array.isArray(cue.sourceClipOrders) ? cue.sourceClipOrders : [],
    shotIds: Array.isArray(cue.shotIds) ? cue.shotIds : [],
    shotNumbers: Array.isArray(cue.shotNumbers) ? cue.shotNumbers : [],
    mediaId: normalizeNullableString(cue.mediaId),
    url: url || null,
    storageKey: normalizeNullableString(cue.storageKey),
    mimeType: normalizeNullableString(cue.mimeType),
    durationMs: typeof cue.durationMs === 'number' ? cue.durationMs : null,
  }
}

export function normalizeSoundEffectScoreSummary(value: unknown) {
  const score = toObject(value)
  const status = normalizeString(score.status)
  if (!status) return null
  const cuesJson = toObject(score.cuesJson)
  const diagnostics = toObject(score.diagnosticsJson)
  const cues = Array.isArray(cuesJson.cues)
    ? cuesJson.cues.map(normalizeSoundEffectCue).filter((cue) => cue !== null)
    : []
  return {
    id: normalizeNullableString(score.id),
    status,
    version: typeof score.version === 'number' ? score.version : null,
    taskId: normalizeNullableString(score.taskId),
    timelineSignature: normalizeNullableString(score.timelineSignature),
    soundModel: normalizeNullableString(score.soundModel),
    durationSeconds: typeof cuesJson.durationSeconds === 'number' ? cuesJson.durationSeconds : null,
    plan: cuesJson.plan ?? null,
    cues,
    diagnostics: score.diagnosticsJson ?? null,
    errorMessage: normalizeNullableString(diagnostics.errorMessage) ?? normalizeNullableString(cuesJson.errorMessage),
    updatedAt: score.updatedAt instanceof Date
      ? score.updatedAt.toISOString()
      : normalizeNullableString(score.updatedAt),
  }
}

export function normalizeFinalVideoSummary(value: unknown, musicScore?: unknown, soundEffectScore?: unknown) {
  const record = toObject(value)
  const id = normalizeString(record.id)
  const episodeId = normalizeString(record.episodeId)
  if (!id || !episodeId) return null

  return {
    id,
    episodeId,
    renderStatus: normalizeNullableString(record.renderStatus),
    renderTaskId: normalizeNullableString(record.renderTaskId),
    outputUrl: normalizeNullableString(record.outputUrl),
    musicScore: normalizeMusicScoreSummary(musicScore),
    soundEffectScore: normalizeSoundEffectScoreSummary(soundEffectScore),
    updatedAt: record.updatedAt instanceof Date
      ? record.updatedAt.toISOString()
      : normalizeNullableString(record.updatedAt),
  }
}
