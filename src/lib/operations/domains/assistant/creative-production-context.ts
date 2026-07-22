import { ApiError } from '@/lib/api-errors'
import {
  CREATIVE_RESOURCE_SCHEMA,
  readProjectCreativeResourceWorkingSet,
} from '@/lib/creative-resource'
import {
  creativeAssetProductionContextSchema,
  creativeScreenplayProductionContextSchema,
  screenplayDraftOutputSchema,
  screenplayResourceDocumentSchema,
  type CreativeWorkDelegationItem,
} from '@/lib/creative-worker'
import { editScriptStyleBibleSchema } from '@/lib/edit-script/types'
import { prisma } from '@/lib/prisma'

interface CreativeProductionScope {
  readonly projectId: string
  readonly userId: string
  readonly episodeId: string | null
}

type CreativeSourceMaterial = CreativeWorkDelegationItem['context']['sourceMaterials'][number]

interface CreativeSourceMaterialPolicy {
  readonly domainSourceUnsupportedCode: string
  readonly revisionInvalidCode: string
  readonly forbiddenSchemaIds: readonly string[]
  readonly forbiddenSchemaCode: string
  readonly contentUnsupportedCode: string
}

function resourceScopeMatchesProductionScope(input: {
  readonly resource: {
    readonly userId: string
    readonly projectId: string | null
    readonly episodeId: string | null
    readonly scopeKind: string
  }
  readonly scope: CreativeProductionScope
}): boolean {
  if (input.resource.userId !== input.scope.userId) return false
  if (input.resource.scopeKind === 'user') {
    return input.resource.projectId === null && input.resource.episodeId === null
  }
  if (input.resource.scopeKind === 'project') {
    return input.resource.projectId === input.scope.projectId && input.resource.episodeId === null
  }
  return input.resource.scopeKind === 'episode'
    && input.resource.projectId === input.scope.projectId
    && input.resource.episodeId === input.scope.episodeId
}

async function resolveCanonicalResourceSourceMaterials(input: CreativeProductionScope & {
  readonly sourceMaterials: readonly CreativeSourceMaterial[]
  readonly policy: CreativeSourceMaterialPolicy
}): Promise<CreativeSourceMaterial[]> {
  const unsupportedDomainIndex = input.sourceMaterials.findIndex(
    (source) => source.provenance.kind === 'domain',
  )
  if (unsupportedDomainIndex >= 0) {
    throw new ApiError('INVALID_PARAMS', {
      code: input.policy.domainSourceUnsupportedCode,
      field: `context.sourceMaterials.${String(unsupportedDomainIndex)}.provenance`,
      agentRetryableAfterCorrection: true,
    })
  }
  const resourceSources = input.sourceMaterials.filter(
    (source) => source.provenance.kind === 'resource',
  )
  if (resourceSources.length === 0) return [...input.sourceMaterials]
  const revisions = await prisma.creativeResourceRevision.findMany({
    where: {
      id: { in: resourceSources.map((source) => (
        source.provenance.kind === 'resource' ? source.provenance.revisionId : ''
      )) },
    },
    select: {
      id: true,
      resourceId: true,
      fingerprint: true,
      contentText: true,
      contentJson: true,
      resource: {
        select: {
          userId: true,
          projectId: true,
          episodeId: true,
          scopeKind: true,
          schemaId: true,
          status: true,
        },
      },
    },
  })
  const revisionsById = new Map(revisions.map((revision) => [revision.id, revision]))
  return input.sourceMaterials.map((source, index) => {
    if (source.provenance.kind !== 'resource') return source
    const revision = revisionsById.get(source.provenance.revisionId)
    if (
      !revision
      || revision.resourceId !== source.provenance.resourceId
      || revision.fingerprint !== source.provenance.fingerprint
      || revision.resource.status !== 'ready'
      || !resourceScopeMatchesProductionScope({ resource: revision.resource, scope: input })
    ) {
      throw new ApiError('INVALID_PARAMS', {
        code: input.policy.revisionInvalidCode,
        field: `context.sourceMaterials.${String(index)}.provenance`,
        agentRetryableAfterCorrection: true,
      })
    }
    if (input.policy.forbiddenSchemaIds.includes(revision.resource.schemaId)) {
      throw new ApiError('INVALID_PARAMS', {
        code: input.policy.forbiddenSchemaCode,
        field: `context.sourceMaterials.${String(index)}.provenance`,
        agentRetryableAfterCorrection: true,
      })
    }
    if (revision.contentText !== null) {
      return {
        label: source.label,
        kind: 'text',
        content: revision.contentText,
        provenance: source.provenance,
      }
    }
    if (revision.contentJson !== null) {
      return {
        label: source.label,
        kind: 'structured',
        content: JSON.stringify(revision.contentJson),
        provenance: source.provenance,
      }
    }
    throw new ApiError('INVALID_PARAMS', {
      code: input.policy.contentUnsupportedCode,
      field: `context.sourceMaterials.${String(index)}`,
      agentRetryableAfterCorrection: true,
    })
  })
}

export async function resolveStyleSourceMaterials(input: CreativeProductionScope & {
  readonly sourceMaterials: readonly CreativeSourceMaterial[]
}): Promise<CreativeSourceMaterial[]> {
  return resolveCanonicalResourceSourceMaterials({
    ...input,
    policy: {
      domainSourceUnsupportedCode: 'CREATIVE_STYLE_DOMAIN_SOURCE_UNSUPPORTED',
      revisionInvalidCode: 'CREATIVE_STYLE_SOURCE_REVISION_INVALID',
      forbiddenSchemaIds: [CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT],
      forbiddenSchemaCode: 'CREATIVE_STYLE_DOWNSTREAM_SCREENPLAY_SOURCE_FORBIDDEN',
      contentUnsupportedCode: 'CREATIVE_STYLE_SOURCE_CONTENT_UNSUPPORTED',
    },
  })
}

export async function resolveScreenplaySourceMaterials(input: CreativeProductionScope & {
  readonly sourceMaterials: readonly CreativeSourceMaterial[]
}): Promise<CreativeSourceMaterial[]> {
  return resolveCanonicalResourceSourceMaterials({
    ...input,
    policy: {
      domainSourceUnsupportedCode: 'CREATIVE_SCREENPLAY_DOMAIN_SOURCE_UNSUPPORTED',
      revisionInvalidCode: 'CREATIVE_SCREENPLAY_SOURCE_REVISION_INVALID',
      forbiddenSchemaIds: [CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE],
      forbiddenSchemaCode: 'CREATIVE_SCREENPLAY_STYLE_SOURCE_CONFLICT',
      contentUnsupportedCode: 'CREATIVE_SCREENPLAY_SOURCE_CONTENT_UNSUPPORTED',
    },
  })
}

export async function resolveScreenplayProductionContext(input: CreativeProductionScope) {
  const workingSet = await readProjectCreativeResourceWorkingSet(input)
  const binding = workingSet.adoptedStyleBible
  if (!binding) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_SCREENPLAY_STYLE_BIBLE_REQUIRED',
      field: 'productionContext.screenplay.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const revision = await prisma.creativeResourceRevision.findFirst({
    where: {
      id: binding.revisionId,
      resourceId: binding.resourceId,
      fingerprint: binding.fingerprint,
      resource: {
        userId: input.userId,
        projectId: input.projectId,
        status: 'ready',
        schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE,
      },
    },
    select: { contentJson: true },
  })
  if (!revision || revision.contentJson === null) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_SCREENPLAY_STYLE_BIBLE_INVALID',
      field: 'productionContext.screenplay.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const styleBible = editScriptStyleBibleSchema.shape.styleBible.safeParse(revision.contentJson)
  if (!styleBible.success) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_SCREENPLAY_STYLE_BIBLE_INVALID',
      field: 'productionContext.screenplay.style',
      agentRetryableAfterCorrection: true,
    })
  }
  return creativeScreenplayProductionContextSchema.parse({
    style: {
      source: {
        resourceId: binding.resourceId,
        revisionId: binding.revisionId,
        fingerprint: binding.fingerprint,
        bindingVersion: binding.version,
        schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE,
      },
      snapshot: styleBible.data,
    },
  })
}

export async function resolveAssetProductionContext(input: CreativeProductionScope) {
  const workingSet = await readProjectCreativeResourceWorkingSet(input)
  const screenplayBinding = workingSet.confirmedScreenplay
  const styleBinding = workingSet.adoptedStyleBible
  if (!screenplayBinding) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_CONFIRMED_SCREENPLAY_REQUIRED',
      field: 'productionContext.asset.screenplay',
      agentRetryableAfterCorrection: true,
    })
  }
  if (!styleBinding) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_STYLE_BIBLE_REQUIRED',
      field: 'productionContext.asset.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const [screenplayRevision, styleRevision] = await Promise.all([
    prisma.creativeResourceRevision.findFirst({
      where: {
        id: screenplayBinding.revisionId,
        resourceId: screenplayBinding.resourceId,
        fingerprint: screenplayBinding.fingerprint,
        resource: {
          userId: input.userId,
          projectId: input.projectId,
          status: 'ready',
          schemaId: CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT,
        },
      },
      select: { contentJson: true },
    }),
    prisma.creativeResourceRevision.findFirst({
      where: {
        id: styleBinding.revisionId,
        resourceId: styleBinding.resourceId,
        fingerprint: styleBinding.fingerprint,
        resource: {
          userId: input.userId,
          projectId: input.projectId,
          status: 'ready',
          schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE,
        },
      },
      select: { contentJson: true },
    }),
  ])
  if (!screenplayRevision || screenplayRevision.contentJson === null) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_CONFIRMED_SCREENPLAY_INVALID',
      field: 'productionContext.asset.screenplay',
      agentRetryableAfterCorrection: true,
    })
  }
  if (!styleRevision || styleRevision.contentJson === null) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_STYLE_BIBLE_INVALID',
      field: 'productionContext.asset.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const screenplayDocument = screenplayResourceDocumentSchema.safeParse(screenplayRevision.contentJson)
  const styleBible = editScriptStyleBibleSchema.shape.styleBible.safeParse(styleRevision.contentJson)
  if (!screenplayDocument.success) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_CONFIRMED_SCREENPLAY_INVALID',
      field: 'productionContext.asset.screenplay',
      agentRetryableAfterCorrection: true,
    })
  }
  if (!styleBible.success) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_STYLE_BIBLE_INVALID',
      field: 'productionContext.asset.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const screenplayStyleSource = screenplayDocument.data.source.styleRevision
  if (
    screenplayStyleSource.resourceId !== styleBinding.resourceId
    || screenplayStyleSource.revisionId !== styleBinding.revisionId
    || screenplayStyleSource.fingerprint !== styleBinding.fingerprint
    || screenplayStyleSource.bindingVersion !== styleBinding.version
    || screenplayStyleSource.schemaId !== CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE
  ) {
    throw new ApiError('INVALID_PARAMS', {
      code: 'CREATIVE_ASSET_STYLE_REVISION_MISMATCH',
      field: 'productionContext.asset.style',
      agentRetryableAfterCorrection: true,
    })
  }
  const screenplaySnapshot = Object.fromEntries(
    Object.entries(screenplayDocument.data).filter(
      ([key]) => key !== 'compiler' && key !== 'renderedScreenplay',
    ),
  )
  return creativeAssetProductionContextSchema.parse({
    screenplay: {
      source: {
        resourceId: screenplayBinding.resourceId,
        revisionId: screenplayBinding.revisionId,
        fingerprint: screenplayBinding.fingerprint,
        bindingVersion: screenplayBinding.version,
        schemaId: CREATIVE_RESOURCE_SCHEMA.SOURCE_SCRIPT,
      },
      snapshot: screenplayDraftOutputSchema.parse(screenplaySnapshot),
    },
    style: {
      source: {
        resourceId: styleBinding.resourceId,
        revisionId: styleBinding.revisionId,
        fingerprint: styleBinding.fingerprint,
        bindingVersion: styleBinding.version,
        schemaId: CREATIVE_RESOURCE_SCHEMA.STYLE_BIBLE,
      },
      snapshot: styleBible.data,
    },
  })
}
