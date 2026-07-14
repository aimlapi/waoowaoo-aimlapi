import { describe, expect, it } from 'vitest'
import { inspectProjectAssetOwnershipContract } from '../../../scripts/guards/project-asset-ownership-guard.mjs'

const valid = {
  authority: [
    'requireOwnedAssetProject',
    'requireOwnedAssetTarget',
    'requireOwnedAssetVariant',
    'requireAssetBodyVariantOwnership',
    'project: { userId: input.access.userId }',
    'assetKind: input.kind',
  ].join('\n'),
  actions: [
    'await requireAssetBodyVariantOwnership(input, client)',
    'await requireOwnedAssetTarget(input, transaction)',
    'await requireOwnedAssetVariant(input, transaction)',
    'await requireOwnedAssetProject(input.access, transaction)',
    'deleteProjectLocationBackedAsset(input.assetId, transaction)',
  ].join('\n'),
  projectSelection: 'delete relation only',
  locationBackedAssets: 'delete relation only',
  projectCrud: 'delete project relations only',
  upload: 'await requireOwnedAssetTarget(target)\nawait uploadObject(bytes)',
  schema: 'model ProjectCharacter {}\nmodel ProjectLocation {}',
  routes: [{ path: 'src/app/api/assets/route.ts', source: 'requireProjectAuthLight(projectId)' }],
  projectAssetSurface: 'project-only asset implementation',
  locationBackedCallers: ['src/lib/assets/services/asset-actions.ts'],
  removedPathsPresent: [],
}

describe('project asset ownership architecture guard', () => {
  it('accepts the single project owner authority with no global asset path', () => {
    expect(inspectProjectAssetOwnershipContract(valid)).toEqual([])
  })

  it('rejects auth bypasses, global-path restoration, and destructive bypasses', () => {
    const violations = inspectProjectAssetOwnershipContract({
      ...valid,
      projectSelection: 'await deleteObject(storageKey)',
      projectCrud: 'await deleteObjects(storageKeys)',
      schema: 'model GlobalCharacter {}',
      routes: [{ path: 'src/app/api/assets/route.ts', source: 'projectId' }],
      projectAssetSurface: 'copyAssetFromGlobal',
      locationBackedCallers: [
        'src/lib/assets/services/asset-actions.ts',
        'src/lib/operations/unsafe-delete.ts',
      ],
      removedPathsPresent: ['src/app/api/asset-hub'],
    })
    expect(violations).toContain('project asset route bypasses project auth: src/app/api/assets/route.ts')
    expect(violations).toContain('removed global asset path restored: copyAssetFromGlobal')
    expect(violations).toContain('removed global asset schema restored: model GlobalCharacter')
    expect(violations).toContain('removed global asset entry restored: src/app/api/asset-hub')
    expect(violations).toContain('location-backed destructive helpers must only be called through project asset actions')
    expect(violations).toContain('project selection restores domain-owned physical media deletion: deleteObject(')
    expect(violations).toContain('project deletion restores domain-owned physical media deletion: deleteObjects(')
  })
})
