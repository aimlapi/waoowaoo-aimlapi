import { z } from 'zod'
import { ApiError } from '@/lib/api-errors'
import { createAsset, ensureAssetGenerateCommitReady, planAssetGenerateTask, removeAsset, revertAssetRender, selectAssetRender, updateAsset, updateAssetVariant } from '@/lib/assets/services/asset-actions'
import { readAssets } from '@/lib/assets/services/read-assets'
import {
  commitProjectAssetRenderUpload,
  compensatePreparedProjectAssetRenderUpload,
  prepareProjectAssetRenderUpload,
} from '@/lib/assets/services/project-upload-render'
import type { ProjectUploadRenderInput } from '@/lib/assets/upload-render-form'
import type { AssetKind } from '@/lib/assets/contracts'
import type { ProjectAgentOperationContext, ProjectAgentOperationRegistryDraft } from '@/lib/operations/types'
import { taskSubmitOperationOutputSchema } from '@/lib/operations/output-schemas'
import { defineOperation } from '@/lib/operations/define-operation'
import { resolveOperationLocale } from '@/lib/operations/environment-input'
import {
  submitPlannedOperationTask,
  type OperationPlan,
} from '@/lib/operations/planning'
import { generateUniqueKey, getSignedUrl, uploadObject } from '@/lib/storage'

const ASSET_KINDS = ['character', 'location', 'prop'] as const
const ASSET_MUTABLE_KINDS = ['character', 'location', 'prop'] as const
const ASSET_CREATABLE_KINDS = ['location', 'prop'] as const

const kindSchema = z.enum(ASSET_KINDS satisfies ReadonlyArray<AssetKind>)
const mutableKindSchema = z.enum(ASSET_MUTABLE_KINDS satisfies ReadonlyArray<Extract<AssetKind, 'character' | 'location' | 'prop'>>)
const creatableKindSchema = z.enum(ASSET_CREATABLE_KINDS satisfies ReadonlyArray<Extract<AssetKind, 'location' | 'prop'>>)

const EFFECTS_QUERY = {
  writes: false,
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_WRITE = {
  writes: true,
  workspaceResourceImpact: 'project_assets',
  billable: false,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_WRITE_OVERWRITE = {
  writes: true,
  workspaceResourceImpact: 'project_assets',
  billable: false,
  destructive: false,
  overwrite: true,
  bulk: false,
  externalSideEffects: false,
  longRunning: false,
} as const

const EFFECTS_LONG_RUNNING = {
  writes: true,
  workspaceResourceImpact: 'none',
  billable: true,
  destructive: false,
  overwrite: false,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

const EFFECTS_UPLOAD_OVERWRITE = {
  writes: true,
  workspaceResourceImpact: 'project_assets',
  billable: false,
  destructive: false,
  overwrite: true,
  bulk: false,
  externalSideEffects: true,
  longRunning: true,
} as const

const uploadRenderOutputSchema = z.object({
  success: z.literal(true),
  imageKey: z.string().min(1),
  imageIndex: z.number().int().nonnegative(),
})

function requireProjectId(projectId: unknown): string {
  if (typeof projectId === 'string' && projectId.trim()) return projectId.trim()
  throw new ApiError('INVALID_PARAMS', { details: 'projectId is required for project scope' })
}

function readOptionalEpisodeId(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function omitBodyKeys(input: unknown, keys: ReadonlyArray<string>): Record<string, unknown> {
  const record = input && typeof input === 'object' && !Array.isArray(input) ? input as Record<string, unknown> : {}
  const body: Record<string, unknown> = { ...record }
  for (const key of keys) {
    delete body[key]
  }
  return body
}

function isProjectUploadRenderInput(value: unknown): value is ProjectUploadRenderInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<ProjectUploadRenderInput>
  return typeof record.assetId === 'string'
    && (record.kind === 'character' || record.kind === 'location')
    && typeof record.projectId === 'string'
    && !!record.file
}

async function planAssetGenerateOperation(
  ctx: ProjectAgentOperationContext,
  input: z.infer<ReturnType<typeof buildAssetGenerateSchema>>,
): Promise<OperationPlan> {
  const projectId = requireProjectId(input.projectId)
  const episodeId = readOptionalEpisodeId(input.episodeId)
  const body = omitBodyKeys(input, ['assetId'])
  const planned = await planAssetGenerateTask({
    request: ctx.request,
    kind: input.kind,
    assetId: input.assetId,
    body,
    episodeId,
    access: { userId: ctx.userId, projectId },
  })
  return {
    kind: 'task_submission',
    operationId: 'api_assets_generate',
    projectId: planned.projectId,
    userId: planned.userId,
    tasks: [planned.task],
  }
}

async function commitAssetGenerateOperation(
  ctx: ProjectAgentOperationContext,
  input: z.infer<ReturnType<typeof buildAssetGenerateSchema>>,
  plan: OperationPlan,
) {
  const task = plan.tasks[0]
  if (!task) throw new Error('PROJECT_AGENT_OPERATION_PLAN_EMPTY')
  const projectId = requireProjectId(input.projectId)
  const episodeId = readOptionalEpisodeId(input.episodeId)
  const body = omitBodyKeys(input, ['assetId'])
  await ensureAssetGenerateCommitReady({
    request: ctx.request,
    kind: input.kind,
    assetId: input.assetId,
    body,
    episodeId,
    access: { userId: ctx.userId, projectId },
  })
  return await submitPlannedOperationTask({
    ctx,
    task,
    operationId: 'api_assets_generate',
  })
}

function buildAssetGenerateSchema() {
  return z.object({
    assetId: z.string().min(1),
    kind: mutableKindSchema,
    projectId: z.string().min(1),
  }).passthrough()
}

export function createAssetsApiOperations(): ProjectAgentOperationRegistryDraft {
  return {
    api_project_asset_upload_temp: defineOperation({
      id: 'api_project_asset_upload_temp',
      summary: 'API-only: Upload a temporary project reference image.',
      intent: 'act',
      effects: {
        writes: true,
        workspaceResourceImpact: 'none',
        billable: false,
        destructive: false,
        overwrite: false,
        bulk: false,
        externalSideEffects: true,
        longRunning: false,
      },
      inputSchema: z.object({
        imageBase64: z.string().min(1).max(30_000_000),
      }).strict(),
      outputSchema: z.object({
        success: z.literal(true),
        url: z.string().min(1),
        key: z.string().min(1),
      }),
      execute: async (ctx, input) => {
        const match = input.imageBase64.match(/^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/=]+)$/)
        if (!match) throw new ApiError('INVALID_PARAMS')
        const extension = match[1] === 'jpeg' ? 'jpg' : match[1]
        const buffer = Buffer.from(match[2], 'base64')
        if (buffer.length === 0 || buffer.length > 20 * 1024 * 1024) throw new ApiError('INVALID_PARAMS')
        const key = generateUniqueKey(`project-assets/temp/${ctx.projectId}/${ctx.userId}`, extension)
        await uploadObject(buffer, key)
        return { success: true, url: getSignedUrl(key, 3600), key }
      },
    }),

    api_assets_read: defineOperation({
      id: 'api_assets_read',
      summary: 'API-only: Read project assets.',
      intent: 'query',
      effects: EFFECTS_QUERY,
      inputSchema: z.object({
        projectId: z.string().min(1),
        kind: kindSchema.nullable().optional(),
      }),
      outputSchema: z.unknown(),
      execute: async (ctx, input) => {
        const assets = await readAssets({ projectId: requireProjectId(input.projectId), kind: input.kind ?? null })
        return { assets }
      },
    }),

    api_assets_create: defineOperation({
      id: 'api_assets_create',
      summary: 'API-only: Create a project location/prop asset.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      inputSchema: z.object({
        kind: creatableKindSchema,
        projectId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        return await createAsset({
          kind: input.kind,
          body: input as unknown as Record<string, unknown>,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),

    api_assets_update: defineOperation({
      id: 'api_assets_update',
      summary: 'API-only: Update a project asset record.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      inputSchema: z.object({
        assetId: z.string().min(1),
        kind: kindSchema,
        projectId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await updateAsset({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),

    api_assets_remove: defineOperation({
      id: 'api_assets_remove',
      summary: 'API-only: Remove a project location/prop asset.',
      intent: 'act',
      effects: {
        ...EFFECTS_WRITE,
        destructive: true,
      },
      inputSchema: z.object({
        assetId: z.string().min(1),
        kind: z.enum(['location', 'prop']),
        projectId: z.string().min(1),
      }),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        return await removeAsset({
          kind: input.kind,
          assetId: input.assetId,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),

    api_assets_generate: defineOperation({
      id: 'api_assets_generate',
      summary: 'API-only: Submit project asset generate task.',
      intent: 'act',
      effects: EFFECTS_LONG_RUNNING,
      confirmation: { kind: 'billable_media', required: true },
      inputSchema: buildAssetGenerateSchema(),
      outputSchema: taskSubmitOperationOutputSchema,
      plan: async (ctx, input) => planAssetGenerateOperation(ctx, input),
      commit: async (ctx, input, plan) => commitAssetGenerateOperation(ctx, input, plan),
    }),

    api_assets_upload_render: defineOperation({
      id: 'api_assets_upload_render',
      summary: 'API-only: Upload a project asset render into character/location image slots.',
      intent: 'act',
      effects: EFFECTS_UPLOAD_OVERWRITE,
      inputSchema: z.custom<ProjectUploadRenderInput>(isProjectUploadRenderInput),
      outputSchema: uploadRenderOutputSchema,
      prepareTransaction: async (ctx, input) => {
        const projectId = requireProjectId(input.projectId)
        const imageBuffer = Buffer.from(await input.file.arrayBuffer())
        return await prepareProjectAssetRenderUpload({
          userId: ctx.userId,
          projectId,
          kind: input.kind,
          assetId: input.assetId,
          imageBuffer,
          locale: resolveOperationLocale(ctx.context),
          ...(input.appearanceId ? { appearanceId: input.appearanceId } : {}),
          ...(input.imageIndex !== undefined ? { imageIndex: input.imageIndex } : {}),
        })
      },
      executeInTransaction: async (ctx, input, transaction, prepared) => {
        const projectId = requireProjectId(input.projectId)
        return await commitProjectAssetRenderUpload({
          userId: ctx.userId,
          projectId,
          kind: input.kind,
          assetId: input.assetId,
          ...(input.appearanceId ? { appearanceId: input.appearanceId } : {}),
          ...(input.imageIndex !== undefined ? { imageIndex: input.imageIndex } : {}),
        }, prepared, transaction)
      },
      compensateTransactionFailure: async (ctx, input, prepared) => {
        const projectId = requireProjectId(input.projectId)
        await compensatePreparedProjectAssetRenderUpload({
          userId: ctx.userId,
          projectId,
          kind: input.kind,
          assetId: input.assetId,
          ...(input.appearanceId ? { appearanceId: input.appearanceId } : {}),
          ...(input.imageIndex !== undefined ? { imageIndex: input.imageIndex } : {}),
        }, prepared)
      },
    }),

    api_assets_select_render: defineOperation({
      id: 'api_assets_select_render',
      summary: 'API-only: Select a project asset render.',
      intent: 'act',
      effects: EFFECTS_WRITE_OVERWRITE,
      inputSchema: z.object({
        assetId: z.string().min(1),
        kind: mutableKindSchema,
        projectId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await selectAssetRender({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),

    api_assets_revert_render: defineOperation({
      id: 'api_assets_revert_render',
      summary: 'API-only: Revert a project asset render.',
      intent: 'act',
      effects: EFFECTS_WRITE_OVERWRITE,
      inputSchema: z.object({
        assetId: z.string().min(1),
        kind: mutableKindSchema,
        projectId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        const body = omitBodyKeys(input, ['assetId'])
        return await revertAssetRender({
          kind: input.kind,
          assetId: input.assetId,
          body,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),

    api_assets_update_variant: defineOperation({
      id: 'api_assets_update_variant',
      summary: 'API-only: Update a project asset variant record.',
      intent: 'act',
      effects: EFFECTS_WRITE,
      inputSchema: z.object({
        assetId: z.string().min(1),
        variantId: z.string().min(1),
        kind: mutableKindSchema,
        projectId: z.string().min(1),
      }).passthrough(),
      outputSchema: z.unknown(),
      executeInTransaction: async (ctx, input, transaction) => {
        const projectId = requireProjectId(input.projectId)
        const body = omitBodyKeys(input, ['assetId', 'variantId'])
        return await updateAssetVariant({
          kind: input.kind,
          assetId: input.assetId,
          variantId: input.variantId,
          body,
          access: { userId: ctx.userId, projectId },
        }, transaction)
      },
    }),
  }
}
