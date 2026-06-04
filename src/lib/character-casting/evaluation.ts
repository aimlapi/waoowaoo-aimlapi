export type CharacterCastingCriterionKey =
  | 'roleConsistency'
  | 'identityReadability'
  | 'contactSheetCompleteness'
  | 'expressionRange'
  | 'costumeRange'
  | 'marksPropsFidelity'
  | 'backgroundFit'
  | 'productionUsability'

export type CharacterCastingCriterionScore = {
  readonly key: CharacterCastingCriterionKey
  readonly score: number
  readonly reason: string
}

export type CharacterCastingCandidateEvaluation = {
  readonly candidateIndex: number
  readonly totalScore: number
  readonly criteria: CharacterCastingCriterionScore[]
  readonly strengths: string[]
  readonly risks: string[]
  readonly recommendation: string
}

export type CharacterCastingEvaluationResult = {
  readonly winnerIndex: number
  readonly summary: string
  readonly candidates: CharacterCastingCandidateEvaluation[]
}

export const CHARACTER_CASTING_CRITERIA: readonly CharacterCastingCriterionKey[] = [
  'roleConsistency',
  'identityReadability',
  'contactSheetCompleteness',
  'expressionRange',
  'costumeRange',
  'marksPropsFidelity',
  'backgroundFit',
  'productionUsability',
]
