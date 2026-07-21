import { Prisma } from '@prisma/client'
import {
  CREATIVE_RESOURCE_CANONICAL_BINDINGS,
  type CreativeResourceInputRef,
  type CreativeResourceJsonValue,
} from '@/lib/creative-resource/contracts'
import { bindCreativeResourceRevisionInTransaction } from '@/lib/creative-resource/binding-service'
import { buildCreativeResourceScopeRef } from '@/lib/creative-resource/identity'
import { appendCreativeResourceRevisionInTransaction } from '@/lib/creative-resource/persistence'
import { CREATIVE_RESOURCE_SCHEMA } from '@/lib/creative-resource/schema-registry'
import { editScriptStyleBibleSchema } from '@/lib/edit-script/types'
import { prisma } from '@/lib/prisma'
import { TASK_STATUS } from '@/lib/task/types'

const APPLY = process.argv.includes('--apply')
const MIGRATION_OPERATION_ID = 'migration.remove_asset_style_composition'
const MIGRATION_INPUT_PREFIX = 'asset-style-composition:'
const MIGRATION_HEAD_INPUT_PREFIX = 'asset-style-head:'

type MigrationSummary = {
  mode: 'dry-run' | 'apply'
  resourceCount: number
  sourceRevisionCount: number
  successorRevisionCount: number
  bindingUpdateCount: number
}

function parseScopeKind(value: string, bindingId: string): 'user' | 'project' | 'episode' {
  if (value === 'user' || value === 'project' || value === 'episode') return value
  throw new Error(`ASSET_STYLE_MIGRATION_BINDING_SCOPE_INVALID:${bindingId}`)
}

function asJsonValue(value: unknown, path = '$'): CreativeResourceJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`ASSET_STYLE_MIGRATION_JSON_NUMBER_INVALID:${path}`)
    return value
  }
  if (Array.isArray(value)) return value.map((item, index) => asJsonValue(item, `${path}[${index}]`))
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, asJsonValue(item, `${path}.${key}`)]),
    )
  }
  throw new Error(`ASSET_STYLE_MIGRATION_JSON_VALUE_INVALID:${path}`)
}

function removeAssetComposition(value: unknown): {
  readonly changed: boolean
  readonly styleBible: CreativeResourceJsonValue
} {
  const root = asJsonValue(value)
  if (!root || typeof root !== 'object' || Array.isArray(root)) {
    throw new Error('ASSET_STYLE_MIGRATION_STYLE_BIBLE_INVALID')
  }
  const assetImageStyle = root.assetImageStyle
  if (!assetImageStyle || typeof assetImageStyle !== 'object' || Array.isArray(assetImageStyle)) {
    throw new Error('ASSET_STYLE_MIGRATION_ASSET_IMAGE_STYLE_INVALID')
  }
  const changed = Object.prototype.hasOwnProperty.call(assetImageStyle, 'composition')
  const assetImageStyleWithoutComposition = Object.fromEntries(
    Object.entries(assetImageStyle).filter(([key]) => key !== 'composition'),
  )
  const candidate = {
    ...root,
    assetImageStyle: assetImageStyleWithoutComposition,
  }
  const parsed = editScriptStyleBibleSchema.parse({ styleBible: candidate }).styleBible
  return {
    changed,
    styleBible: asJsonValue(parsed),
  }
}

async function assertNoRelatedActiveTasks(projectIds: readonly string[]): Promise<void> {
  if (projectIds.length === 0) return
  const active = await prisma.task.findMany({
    where: {
      projectId: { in: [...projectIds] },
      status: { in: [TASK_STATUS.QUEUED, TASK_STATUS.PROCESSING] },
    },
    select: { id: true, projectId: true, type: true, status: true },
    take: 20,
  })
  if (active.length > 0) {
    throw new Error(`ASSET_STYLE_MIGRATION_ACTIVE_TASKS:${JSON.stringify(active)}`)
  }
}

async function collectAffectedProjectIds(): Promise<readonly string[]> {
  const [resources, editBibles, stylePreviews] = await Promise.all([
    prisma.creativeResource.findMany({
      where: { schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE, projectId: { not: null } },
      select: { projectId: true },
    }),
    prisma.projectEditBible.findMany({
      select: { episode: { select: { projectId: true } } },
    }),
    prisma.projectEditStylePreview.findMany({ select: { projectId: true } }),
  ])
  return [...new Set([
    ...resources.flatMap((resource) => resource.projectId ? [resource.projectId] : []),
    ...editBibles.map((editBible) => editBible.episode.projectId),
    ...stylePreviews.map((preview) => preview.projectId),
  ])]
}

async function loadSourceRevision(
  tx: Prisma.TransactionClient,
  resourceId: string,
  revisionId: string,
) {
  const revision = await tx.creativeResourceRevision.findFirst({
    where: { id: revisionId, resourceId },
    select: {
      id: true,
      contentJson: true,
      prompt: true,
      modelKey: true,
      generationOptions: true,
      inputLineage: {
        orderBy: [{ position: 'asc' }, { role: 'asc' }],
        select: {
          role: true,
          position: true,
          inputRevision: {
            select: { id: true, resourceId: true, fingerprint: true },
          },
        },
      },
    },
  })
  if (!revision) throw new Error(`ASSET_STYLE_MIGRATION_REVISION_NOT_FOUND:${resourceId}:${revisionId}`)
  if (revision.contentJson === null) {
    throw new Error(`ASSET_STYLE_MIGRATION_REVISION_CONTENT_MISSING:${revisionId}`)
  }
  return revision
}

function sourceInputs(
  revision: Awaited<ReturnType<typeof loadSourceRevision>>,
): readonly CreativeResourceInputRef[] {
  return revision.inputLineage.map((lineage) => ({
    resourceId: lineage.inputRevision.resourceId,
    revisionId: lineage.inputRevision.id,
    fingerprint: lineage.inputRevision.fingerprint,
    role: lineage.role,
    position: lineage.position,
  }))
}

async function migrateResource(
  resourceId: string,
  apply: boolean,
): Promise<{ sourceRevisionCount: number; successorRevisionCount: number; bindingUpdateCount: number }> {
  return await prisma.$transaction(async (tx) => {
    if (apply) {
      const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT id
        FROM creative_resources
        WHERE id = ${resourceId}
        FOR UPDATE
      `)
      if (!locked[0]) throw new Error(`ASSET_STYLE_MIGRATION_RESOURCE_NOT_FOUND:${resourceId}`)
    }
    const resource = await tx.creativeResource.findUnique({
      where: { id: resourceId },
      select: {
        id: true,
        userId: true,
        headRevisionId: true,
        bindings: {
          where: {
            role: CREATIVE_RESOURCE_CANONICAL_BINDINGS.adoptedStyleBible.role,
            slotKey: CREATIVE_RESOURCE_CANONICAL_BINDINGS.adoptedStyleBible.slotKey,
          },
          select: {
            id: true,
            userId: true,
            projectId: true,
            episodeId: true,
            scopeKind: true,
            scopeId: true,
            revisionId: true,
            version: true,
          },
        },
      },
    })
    if (!resource) throw new Error(`ASSET_STYLE_MIGRATION_RESOURCE_NOT_FOUND:${resourceId}`)

    const targetRevisionIds = new Set(resource.bindings.map((binding) => binding.revisionId))
    if (resource.headRevisionId) targetRevisionIds.add(resource.headRevisionId)
    const orderedSourceRevisionIds = [...targetRevisionIds].sort((left, right) => {
      if (left === resource.headRevisionId) return 1
      if (right === resource.headRevisionId) return -1
      return left.localeCompare(right)
    })
    const successorBySource = new Map<string, string>()
    const sourcesNeedingSuccessor = new Set<string>()
    let successorRevisionCount = 0
    let headWasDisplaced = false

    for (const sourceRevisionId of orderedSourceRevisionIds) {
      const source = await loadSourceRevision(tx, resource.id, sourceRevisionId)
      const normalized = removeAssetComposition(source.contentJson)
      const isHead = sourceRevisionId === resource.headRevisionId
      const restoreCleanHead = isHead && !normalized.changed && headWasDisplaced
      if (!normalized.changed && !restoreCleanHead) {
        successorBySource.set(sourceRevisionId, sourceRevisionId)
        continue
      }
      if (normalized.changed) sourcesNeedingSuccessor.add(sourceRevisionId)
      if (!apply) {
        successorRevisionCount += 1
        successorBySource.set(sourceRevisionId, sourceRevisionId)
        if (!isHead) headWasDisplaced = true
        continue
      }

      const migrationInputHash = restoreCleanHead
        ? `${MIGRATION_HEAD_INPUT_PREFIX}${sourceRevisionId}`
        : `${MIGRATION_INPUT_PREFIX}${sourceRevisionId}`
      const existing = await tx.creativeResourceRevision.findFirst({
        where: {
          resourceId: resource.id,
          operationId: MIGRATION_OPERATION_ID,
          inputHash: migrationInputHash,
        },
        select: { id: true, contentJson: true },
      })
      if (existing) {
        if (existing.contentJson === null || removeAssetComposition(existing.contentJson).changed) {
          throw new Error(`ASSET_STYLE_MIGRATION_SUCCESSOR_INVALID:${existing.id}`)
        }
        successorBySource.set(sourceRevisionId, restoreCleanHead ? sourceRevisionId : existing.id)
        continue
      }

      const successor = await appendCreativeResourceRevisionInTransaction(tx, {
        resourceId: resource.id,
        userId: resource.userId,
        mediaType: 'text',
        schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE,
        content: { kind: 'structured', data: normalized.styleBible },
        inputs: sourceInputs(source),
        provenance: {
          operationId: MIGRATION_OPERATION_ID,
          inputHash: migrationInputHash,
          taskId: null,
          operationExecutionId: null,
          executionSegmentId: null,
          toolCallId: null,
          prompt: source.prompt,
          modelKey: source.modelKey,
          generationOptions: source.generationOptions === null
            ? null
            : asJsonValue(source.generationOptions),
        },
      })
      successorRevisionCount += 1
      successorBySource.set(sourceRevisionId, restoreCleanHead ? sourceRevisionId : successor.revisionId)
      if (!isHead) headWasDisplaced = true
    }

    let bindingUpdateCount = 0
    if (apply) {
      for (const binding of resource.bindings) {
        const successorRevisionId = successorBySource.get(binding.revisionId)
        if (!successorRevisionId || successorRevisionId === binding.revisionId) continue
        const scope = buildCreativeResourceScopeRef({
          kind: parseScopeKind(binding.scopeKind, binding.id),
          id: binding.scopeId,
          userId: binding.userId,
          projectId: binding.projectId,
          episodeId: binding.episodeId,
        })
        await bindCreativeResourceRevisionInTransaction(tx, {
          scope,
          role: CREATIVE_RESOURCE_CANONICAL_BINDINGS.adoptedStyleBible.role,
          slotKey: CREATIVE_RESOURCE_CANONICAL_BINDINGS.adoptedStyleBible.slotKey,
          resourceId: resource.id,
          revisionId: successorRevisionId,
          source: MIGRATION_OPERATION_ID,
          expectedVersion: binding.version,
        })
        bindingUpdateCount += 1
      }
    } else {
      bindingUpdateCount = resource.bindings.filter(
        (binding) => sourcesNeedingSuccessor.has(binding.revisionId),
      ).length
    }

    return {
      sourceRevisionCount: orderedSourceRevisionIds.length,
      successorRevisionCount,
      bindingUpdateCount,
    }
  })
}

async function main(): Promise<void> {
  const projectIds = await collectAffectedProjectIds()
  await assertNoRelatedActiveTasks(projectIds)
  const resources = await prisma.creativeResource.findMany({
    where: { schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE },
    select: { id: true },
    orderBy: { id: 'asc' },
  })
  const summary: MigrationSummary = {
    mode: APPLY ? 'apply' : 'dry-run',
    resourceCount: resources.length,
    sourceRevisionCount: 0,
    successorRevisionCount: 0,
    bindingUpdateCount: 0,
  }
  for (const resource of resources) {
    const migrated = await migrateResource(resource.id, APPLY)
    summary.sourceRevisionCount += migrated.sourceRevisionCount
    summary.successorRevisionCount += migrated.successorRevisionCount
    summary.bindingUpdateCount += migrated.bindingUpdateCount
  }
  console.log(JSON.stringify(summary, null, 2))
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
