import type { Job } from 'bullmq'
import { prisma } from '@/lib/prisma'
import { getSignedUrl } from '@/lib/storage'
import { encodeImageUrls } from '@/lib/contracts/image-urls-contract'
import type { TaskJobData } from '@/lib/task/types'
import { reportTaskProgress } from '@/lib/workers/shared'
import { stringifyAppearanceCandidateMetadata } from '@/types/character-casting'
import { evaluateCharacterCastingCandidates } from '@/lib/character-casting/evaluator'
import type { CharacterCastingEvaluationResult } from '@/lib/character-casting/evaluation'
import { normalizeOptionalReferenceImagesForGeneration } from '@/lib/media/outbound-image'
import {
  appendSelectedVisualReferenceStylePromptBlock,
  resolveSelectedVisualReferenceStyle,
} from '@/lib/visual-reference-cases/selected-style'
import {
  buildCharacterStyleTestPrompt,
  buildCharacterStyleTestStyleSummary,
  CHARACTER_STYLE_TEST_ASPECT_RATIO,
  normalizeCharacterStyleTestPromptMode,
} from '@/lib/character-style-test/prompt'
import { generateCleanImageToStorage } from './image-task-handler-shared'

function readRequiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${field} is required`)
  }
  return value.trim()
}

function readGenerationOptions(value: unknown): { resolution?: string; quality?: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const record = value as Record<string, unknown>
  return {
    ...(typeof record.resolution === 'string' && record.resolution.trim()
      ? { resolution: record.resolution.trim() }
      : {}),
    ...(typeof record.quality === 'string' && record.quality.trim()
      ? { quality: record.quality.trim() }
      : {}),
  }
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readCastingCandidateCount(value: unknown, promptMode: string): 1 | 3 {
  if (value === undefined || value === null) return 1
  if (promptMode !== 'casting_photo') throw new Error('castingCandidateCount requires promptMode=casting_photo')
  if (value === 3) return 3
  throw new Error('castingCandidateCount must be 3')
}

function buildCandidateDescription(characterRequest: string, candidateIndex: number): string {
  const directions = [
    '生活真实度优先的候选形象包',
    '情绪辨识度优先的候选形象包',
    '造型记忆点优先的候选形象包',
  ] as const
  return `${characterRequest}；${directions[candidateIndex]}`
}

function buildCandidateMetadata(
  characterRequest: string,
  evaluation: CharacterCastingEvaluationResult,
) {
  return evaluation.candidates.map((candidate) => ({
    description: buildCandidateDescription(characterRequest, candidate.candidateIndex),
    visualTraits: {
      face: '',
      hair: '',
      body: '',
      costume: '',
      makeupAndAccessories: '',
      skin: '',
      visibleState: '',
      accessibility: '',
      tattoosAndMarks: '',
      scars: '',
    },
    castingNotes: {
      score: candidate.totalScore,
      strengths: candidate.strengths,
      risks: candidate.risks,
      recommendation: candidate.recommendation,
      fitTags: candidate.criteria.map((criterion) => `${criterion.key}:${criterion.score}`),
    },
    castingStills: [],
  }))
}

async function persistCastingWinner(input: {
  readonly projectId: string
  readonly appearanceId: string
  readonly characterRequest: string
  readonly imageKeys: readonly [string, string, string]
  readonly evaluation: CharacterCastingEvaluationResult
}) {
  const appearance = await prisma.characterAppearance.findUnique({
    where: { id: input.appearanceId },
    include: { character: true },
  })
  if (!appearance || appearance.character.projectId !== input.projectId) {
    throw new Error('CHARACTER_CASTING_TARGET_APPEARANCE_NOT_FOUND')
  }

  const selectedImageKey = input.imageKeys[input.evaluation.winnerIndex]
  const candidateDescriptions = [0, 1, 2].map((candidateIndex) =>
    buildCandidateDescription(input.characterRequest, candidateIndex),
  )

  await prisma.characterAppearance.update({
    where: { id: input.appearanceId },
    data: {
      description: candidateDescriptions[input.evaluation.winnerIndex],
      descriptions: JSON.stringify(candidateDescriptions),
      descriptionMetadata: stringifyAppearanceCandidateMetadata(
        buildCandidateMetadata(input.characterRequest, input.evaluation),
      ),
      previousImageUrl: appearance.imageUrl,
      previousImageUrls: appearance.imageUrls || encodeImageUrls([]),
      imageUrl: selectedImageKey,
      imageUrls: encodeImageUrls([...input.imageKeys]),
      selectedIndex: input.evaluation.winnerIndex,
      changeReason: '选角定妆',
    },
  })
}

export async function handleCharacterStyleTestTask(job: Job<TaskJobData>) {
  const payload = job.data.payload || {}
  const characterRequest = readRequiredString(payload.characterRequest, 'characterRequest')
  const modelId = readRequiredString(payload.imageModel, 'imageModel')
  const generationOptions = readGenerationOptions(payload.generationOptions)
  const promptMode = normalizeCharacterStyleTestPromptMode(payload.promptMode)
  const castingCandidateCount = readCastingCandidateCount(payload.castingCandidateCount, promptMode)
  const targetAppearanceId = readOptionalString(payload.appearanceId)
  const analysisModel = castingCandidateCount === 3
    ? readRequiredString(payload.analysisModel, 'analysisModel')
    : null
  const selectedVisualReferenceStyle = await resolveSelectedVisualReferenceStyle({
    projectId: job.data.projectId,
    episodeId: job.data.episodeId,
  })
  const styleReferenceImages = await normalizeOptionalReferenceImagesForGeneration(
    selectedVisualReferenceStyle?.imageUrl ? [selectedVisualReferenceStyle.imageUrl] : [],
    {
      context: { taskType: String(job.data.type), scope: 'characterStyleTest.visualStyleReference' },
    },
  )

  const styleSummary = buildCharacterStyleTestStyleSummary({
    characterRequest,
    locale: job.data.locale,
    promptMode,
  })

  await reportTaskProgress(job, 20, {
    stage: 'character_style_test_prepare',
    stageLabel: promptMode === 'casting_photo'
      ? (job.data.locale === 'en'
          ? 'Preparing casting and look-test photo prompt'
          : '准备选角定妆照提示词')
      : (job.data.locale === 'en'
          ? 'Preparing input-derived character asset prompt'
          : '准备基于输入归纳的角色资产提示词'),
    displayMode: 'detail',
  })

  const imageOptions = {
    aspectRatio: CHARACTER_STYLE_TEST_ASPECT_RATIO,
    ...generationOptions,
  }

  const imageKeys: string[] = []
  const prompts: string[] = []
  for (let candidateIndex = 0; candidateIndex < castingCandidateCount; candidateIndex += 1) {
    const basePrompt = buildCharacterStyleTestPrompt({
      characterRequest,
      locale: job.data.locale,
      promptMode,
      ...(castingCandidateCount === 3 ? { candidateIndex } : {}),
    })
    const prompt = appendSelectedVisualReferenceStylePromptBlock({
      prompt: basePrompt,
      style: selectedVisualReferenceStyle,
      locale: job.data.locale,
    })
    prompts.push(prompt)

    const imageKey = await generateCleanImageToStorage({
      job,
      userId: job.data.userId,
      modelId,
      prompt,
      targetId: castingCandidateCount === 3
        ? `${job.data.taskId}-candidate-${candidateIndex}`
        : job.data.taskId,
      keyPrefix: 'character-style-test',
      options: {
        ...imageOptions,
        ...(styleReferenceImages.length > 0 ? { referenceImages: styleReferenceImages } : {}),
      },
    })
    imageKeys.push(imageKey)

    if (castingCandidateCount === 3) {
      await reportTaskProgress(job, 35 + candidateIndex * 15, {
        stage: 'character_style_test_candidate_done',
        stageLabel: job.data.locale === 'en'
          ? `Casting candidate ${candidateIndex + 1} generated`
          : `选角候选 ${candidateIndex + 1} 已生成`,
        displayMode: 'detail',
      })
    }
  }

  const imageUrls = imageKeys.map((imageKey) => getSignedUrl(imageKey, 7 * 24 * 3600))
  let evaluation: CharacterCastingEvaluationResult | null = null
  if (castingCandidateCount === 3) {
    await reportTaskProgress(job, 82, {
      stage: 'character_style_test_evaluate',
      stageLabel: job.data.locale === 'en'
        ? 'Scoring casting candidates'
        : '正在评分三组选角候选',
      displayMode: 'detail',
    })
    const candidates = [
      { candidateIndex: 0, request: buildCandidateDescription(characterRequest, 0), imageUrl: imageUrls[0] },
      { candidateIndex: 1, request: buildCandidateDescription(characterRequest, 1), imageUrl: imageUrls[1] },
      { candidateIndex: 2, request: buildCandidateDescription(characterRequest, 2), imageUrl: imageUrls[2] },
    ] as const
    if (!analysisModel) throw new Error('analysisModel is required')
    evaluation = await evaluateCharacterCastingCandidates({
      userId: job.data.userId,
      locale: job.data.locale,
      analysisModel,
      baseRequest: characterRequest,
      candidates,
    })

    if (targetAppearanceId) {
      await persistCastingWinner({
        projectId: job.data.projectId,
        appearanceId: targetAppearanceId,
        characterRequest,
        imageKeys: [imageKeys[0]!, imageKeys[1]!, imageKeys[2]!],
        evaluation,
      })
    }
  }

  await reportTaskProgress(job, 95, {
    stage: 'character_style_test_done',
    stageLabel: promptMode === 'casting_photo'
      ? (job.data.locale === 'en'
          ? 'Casting photo test image generated'
          : '选角定妆测试图已生成')
      : (job.data.locale === 'en'
          ? 'Character style test image generated'
          : '角色风格测试图已生成'),
    displayMode: 'detail',
  })

  return {
    imageUrl: evaluation ? imageUrls[evaluation.winnerIndex] : imageUrls[0],
    imageKey: evaluation ? imageKeys[evaluation.winnerIndex] : imageKeys[0],
    imageUrls,
    imageKeys,
    prompt: prompts[0],
    prompts,
    aspectRatio: CHARACTER_STYLE_TEST_ASPECT_RATIO,
    styleSummary,
    ...(evaluation ? { evaluation } : {}),
    ...(targetAppearanceId ? { appearanceId: targetAppearanceId } : {}),
  }
}
