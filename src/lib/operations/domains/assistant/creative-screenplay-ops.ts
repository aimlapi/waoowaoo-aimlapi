import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import {
  appendCreativeResourceRevisionInTransaction,
  CREATIVE_RESOURCE_SCHEMA,
  reserveDomainCreativeResourceInTransaction,
  resolveProjectCreativeResourceScope,
  type CreativeResourceInputRef,
  type CreativeResourceJsonValue,
} from '@/lib/creative-resource'
import {
  buildScreenplayResourceDocument,
  creativeWorkTaskPayloadSchema,
  creativeWorkTaskResultSchema,
  creativeWorkTaskResultMatchesPayload,
} from '@/lib/creative-worker'
import { defineOperation } from '@/lib/operations/define-operation'
import type { ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { stableArgsHash } from '@/lib/project-agent/stable-args-hash'
import { TASK_STATUS, TASK_TYPE } from '@/lib/task/types'

const materializeScreenplayDraftInputSchema = z.object({
  taskId: z.string().trim().min(1)
    .describe('Exact completed creative_work Task whose strict screenplay_draft result should become an immutable structured project.source_script revision.'),
  name: z.string().trim().min(1).max(191)
    .describe('User-facing screenplay Resource name in the current conversation language.'),
}).strict()

const materializeScreenplayDraftOutputSchema = z.object({
  success: z.literal(true),
  resourceId: z.string().trim().min(1),
  revisionId: z.string().trim().min(1),
  fingerprint: z.string().trim().min(1),
  schemaId: z.literal(CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT),
}).strict()

function toCreativeJson(value: unknown): CreativeResourceJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('CREATIVE_SCREENPLAY_JSON_NUMBER_INVALID')
    return value
  }
  if (Array.isArray(value)) return value.map(toCreativeJson)
  if (typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, toCreativeJson(entry)]))
  }
  throw new Error('CREATIVE_SCREENPLAY_JSON_VALUE_INVALID')
}

function resourceInputsFromTask(
  payload: z.infer<typeof creativeWorkTaskPayloadSchema>,
): CreativeResourceInputRef[] {
  const screenplayContext = payload.request.productionContext.screenplay
  if (!screenplayContext) throw new Error('CREATIVE_SCREENPLAY_PRODUCTION_CONTEXT_REQUIRED')
  const inputs: CreativeResourceInputRef[] = [{
    resourceId: screenplayContext.style.source.resourceId,
    revisionId: screenplayContext.style.source.revisionId,
    fingerprint: screenplayContext.style.source.fingerprint,
    role: 'style_bible',
    position: 0,
  }]
  const seen = new Set([`${screenplayContext.style.source.resourceId}:${screenplayContext.style.source.revisionId}`])
  for (const source of payload.request.context.sourceMaterials) {
    if (source.provenance.kind !== 'resource') continue
    const identity = `${source.provenance.resourceId}:${source.provenance.revisionId}`
    if (seen.has(identity)) continue
    seen.add(identity)
    inputs.push({
      resourceId: source.provenance.resourceId,
      revisionId: source.provenance.revisionId,
      fingerprint: source.provenance.fingerprint,
      role: 'screenplay_source',
      position: inputs.length,
    })
  }
  return inputs
}

export function createAssistantCreativeScreenplayOperations(): ProjectAgentOperationRegistryDraft {
  return {
    materialize_screenplay_draft: defineOperation({
      id: 'materialize_screenplay_draft',
      summary: 'Materialize one completed screenplay_draft Creative Task as an immutable structured project.source_script Resource revision. This preserves the full canonical registries, scene/entity references, state ledger, kernels, exact Style lineage, and Task provenance; it does not confirm the screenplay Binding.',
      intent: 'act',
      effects: {
        writes: true,
        workspaceResourceImpact: 'creative_resources',
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: false,
        longRunning: false,
      },
      resourceContract: {
        kind: 'resource',
        acceptsReferences: true,
        outputMediaTypes: ['text'],
        outputSchemaIds: [CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT],
        supportsCandidates: false,
      },
      confirmation: { kind: 'none', required: false },
      inputSchema: materializeScreenplayDraftInputSchema,
      outputSchema: materializeScreenplayDraftOutputSchema,
      executeInTransaction: async (context, input, transaction) => {
        const task = await transaction.task.findFirst({
          where: {
            id: input.taskId,
            userId: context.userId,
            projectId: context.projectId,
            type: TASK_TYPE.CREATIVE_WORK,
          },
          select: {
            id: true,
            episodeId: true,
            status: true,
            payload: true,
            result: true,
          },
        })
        if (!task) {
          throw new ApiError('NOT_FOUND', {
            code: 'CREATIVE_SCREENPLAY_TASK_NOT_FOUND',
            field: 'taskId',
          })
        }
        if (task.status !== TASK_STATUS.COMPLETED) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'CREATIVE_SCREENPLAY_TASK_NOT_COMPLETED',
            field: 'taskId',
            requestedValue: task.status,
            allowedValues: [TASK_STATUS.COMPLETED],
            agentRetryableAfterCorrection: true,
          })
        }
        const operationEpisodeId = context.context.episodeId ?? null
        if (task.episodeId !== operationEpisodeId) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'CREATIVE_SCREENPLAY_TASK_SCOPE_MISMATCH',
            field: 'taskId',
            agentRetryableAfterCorrection: true,
          })
        }
        const payload = creativeWorkTaskPayloadSchema.parse(task.payload)
        const result = creativeWorkTaskResultSchema.parse(task.result)
        if (
          !creativeWorkTaskResultMatchesPayload(payload, result)
          || payload.request.outputKind !== 'screenplay_draft'
          || !payload.request.productionContext.screenplay
          || result.outputKind !== 'screenplay_draft'
          || result.creativeWorkResult.outputKind !== 'screenplay_draft'
          || result.creativeWorkResult.output.kind !== 'screenplay_draft'
        ) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'CREATIVE_SCREENPLAY_TASK_OUTPUT_MISMATCH',
            field: 'taskId',
            agentRetryableAfterCorrection: true,
          })
        }
        const output = result.creativeWorkResult.output
        const styleSource = payload.request.productionContext.screenplay.style.source
        if (
          output.source.styleRevision.resourceId !== styleSource.resourceId
          || output.source.styleRevision.revisionId !== styleSource.revisionId
          || output.source.styleRevision.fingerprint !== styleSource.fingerprint
          || output.source.styleRevision.bindingVersion !== styleSource.bindingVersion
          || output.source.styleRevision.schemaId !== styleSource.schemaId
        ) {
          throw new ApiError('INVALID_PARAMS', {
            code: 'CREATIVE_SCREENPLAY_STYLE_SOURCE_MISMATCH',
            field: 'taskId',
            agentRetryableAfterCorrection: true,
          })
        }
        const document = buildScreenplayResourceDocument(output)
        const scope = resolveProjectCreativeResourceScope({
          userId: context.userId,
          projectId: context.projectId,
          episodeId: operationEpisodeId,
        })
        const reserved = await reserveDomainCreativeResourceInTransaction(transaction, {
          scope,
          mediaType: 'text',
          schemaId: CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT,
          sourceType: 'CreativeWorkScreenplayDraft',
          sourceId: task.id,
          name: input.name,
        })
        const revision = await appendCreativeResourceRevisionInTransaction(transaction, {
          resourceId: reserved.resourceId,
          userId: context.userId,
          mediaType: 'text',
          schemaId: CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT,
          content: {
            kind: 'structured',
            data: toCreativeJson(document),
          },
          inputs: resourceInputsFromTask(payload),
          provenance: {
            operationId: 'materialize_screenplay_draft',
            inputHash: stableArgsHash({
              taskInputFingerprint: payload.inputFingerprint,
              schemaVersion: output.schemaVersion,
            }),
            taskId: task.id,
            operationExecutionId: context.executionAuthorization?.operationExecutionId ?? null,
            executionSegmentId: context.executionFence?.concurrentExecutionSegmentId ?? null,
            toolCallId: context.toolCallId ?? null,
            prompt: payload.request.goal,
            modelKey: payload.modelKey,
            generationOptions: toCreativeJson({
              outputKind: payload.request.outputKind,
              validation: output.validation,
              assumptions: output.assumptions,
              openQuestions: output.openQuestions,
            }),
          },
        })
        return materializeScreenplayDraftOutputSchema.parse({
          success: true,
          ...revision,
          schemaId: CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT,
        })
      },
    }),
  }
}
