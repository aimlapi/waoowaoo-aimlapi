'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api-fetch'
import type { ProjectVisualReferenceCase } from '@/types/project'
import { queryKeys } from '../keys'

interface VisualReferenceCasesResponse {
  cases: ProjectVisualReferenceCase[]
}

interface VisualReferenceCaseResponse {
  case: ProjectVisualReferenceCase
}

interface GenerateVisualReferenceCasesInput {
  episodeId: string
  count?: number
}

interface SelectVisualReferenceCaseInput {
  episodeId: string
  caseId: string
}

interface GenerateVisualReferenceCasesTaskResponse {
  success: boolean
  async: true
  taskId: string
  status?: string
  deduped?: boolean
}

async function readJsonError(response: Response, fallback: string): Promise<Error> {
  try {
    const payload = await response.json() as { error?: { message?: string } }
    return new Error(payload.error?.message || fallback)
  } catch {
    return new Error(fallback)
  }
}

export function useProjectVisualReferenceCases(projectId: string | null, episodeId: string | null) {
  return useQuery({
    queryKey: queryKeys.project.visualReferenceCases(projectId || '', episodeId || ''),
    queryFn: async () => {
      if (!projectId || !episodeId) throw new Error('Project ID and episode ID are required')
      const search = new URLSearchParams({ episodeId })
      const response = await apiFetch(`/api/projects/${projectId}/visual-reference-cases?${search.toString()}`)
      if (!response.ok) throw await readJsonError(response, 'Failed to load visual reference cases')
      const data = await response.json() as VisualReferenceCasesResponse
      return data.cases
    },
    enabled: Boolean(projectId && episodeId),
    staleTime: 5000,
  })
}

export function useGenerateProjectVisualReferenceCases(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: GenerateVisualReferenceCasesInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/visual-reference-cases`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw await readJsonError(response, 'Failed to generate visual reference cases')
      const data = await response.json() as GenerateVisualReferenceCasesTaskResponse
      if (data.async !== true || !data.taskId) throw new Error('VISUAL_REFERENCE_CASES_TASK_RESPONSE_EMPTY')
      return data
    },
    onSuccess: async (_result, variables) => {
      if (!projectId) return
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.project.visualReferenceCases(projectId, variables.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.pending(projectId, variables.episodeId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks.targetStatesAll(projectId), exact: false }),
      ])
    },
  })
}

export function useSelectProjectVisualReferenceCase(projectId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (input: SelectVisualReferenceCaseInput) => {
      if (!projectId) throw new Error('Project ID is required')
      const response = await apiFetch(`/api/projects/${projectId}/visual-reference-cases`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      if (!response.ok) throw await readJsonError(response, 'Failed to select visual reference case')
      const data = await response.json() as VisualReferenceCaseResponse
      return data.case
    },
    onSuccess: async (visualReferenceCase) => {
      if (!projectId) return
      await queryClient.invalidateQueries({
        queryKey: queryKeys.project.visualReferenceCases(projectId, visualReferenceCase.episodeId),
      })
    },
  })
}
