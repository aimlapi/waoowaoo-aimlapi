import { beforeEach, describe, expect, it } from 'vitest'
import {
  requireOwnedAssetProject,
  requireOwnedAssetTarget,
  requireOwnedAssetVariant,
} from '@/lib/assets/services/project-asset-ownership'
import { commitProjectAssetRenderUpload } from '@/lib/assets/services/project-upload-render'
import { resetSystemState } from '../../../helpers/db-reset'
import { createTestProject, createTestUser } from '../../../helpers/billing-fixtures'
import { prisma } from '../../../helpers/prisma'

async function seedProjectAssetGraph() {
  const owner = await createTestUser()
  const foreign = await createTestUser()
  const ownerProject = await createTestProject(owner.id)
  const foreignProject = await createTestProject(foreign.id)
  const ownerCharacter = await prisma.projectCharacter.create({
    data: { projectId: ownerProject.id, name: 'owner character' },
  })
  const ownerAppearance = await prisma.characterAppearance.create({
    data: {
      characterId: ownerCharacter.id,
      appearanceIndex: 0,
      changeReason: 'primary',
      description: 'owner description',
      imageUrls: '[]',
      previousImageUrls: '[]',
    },
  })
  const foreignCharacter = await prisma.projectCharacter.create({
    data: { projectId: foreignProject.id, name: 'foreign character' },
  })
  const foreignAppearance = await prisma.characterAppearance.create({
    data: {
      characterId: foreignCharacter.id,
      appearanceIndex: 0,
      changeReason: 'primary',
      description: 'foreign description',
      imageUrls: '[]',
      previousImageUrls: '[]',
    },
  })
  const ownerLocation = await prisma.projectLocation.create({
    data: { projectId: ownerProject.id, name: 'owner location', assetKind: 'location' },
  })
  const ownerLocationImage = await prisma.locationImage.create({
    data: { locationId: ownerLocation.id, imageIndex: 0, description: 'owner location image' },
  })
  const ownerProp = await prisma.projectLocation.create({
    data: { projectId: ownerProject.id, name: 'owner prop', assetKind: 'prop' },
  })
  const ownerPropImage = await prisma.locationImage.create({
    data: { locationId: ownerProp.id, imageIndex: 0, description: 'owner prop image' },
  })
  return {
    owner,
    ownerProject,
    foreignProject,
    ownerCharacter,
    ownerAppearance,
    foreignCharacter,
    foreignAppearance,
    ownerLocation,
    ownerLocationImage,
    ownerProp,
    ownerPropImage,
  }
}

describe('project asset ownership real-MySQL conformance', () => {
  beforeEach(async () => {
    await resetSystemState()
  })

  it('admits exact project kinds and rejects foreign-project or wrong-kind opaque IDs', async () => {
    const graph = await seedProjectAssetGraph()
    const access = {
      userId: graph.owner.id,
      projectId: graph.ownerProject.id,
    }

    await expect(requireOwnedAssetProject(access)).resolves.toBe(graph.ownerProject.id)
    await expect(requireOwnedAssetTarget({ access, kind: 'character', assetId: graph.ownerCharacter.id })).resolves.toBeUndefined()
    await expect(requireOwnedAssetTarget({ access, kind: 'location', assetId: graph.ownerLocation.id })).resolves.toBeUndefined()
    await expect(requireOwnedAssetTarget({ access, kind: 'prop', assetId: graph.ownerProp.id })).resolves.toBeUndefined()
    await expect(requireOwnedAssetTarget({ access, kind: 'character', assetId: graph.foreignCharacter.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(requireOwnedAssetTarget({ access, kind: 'prop', assetId: graph.ownerLocation.id })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(requireOwnedAssetProject({
      userId: graph.owner.id,
      projectId: graph.foreignProject.id,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('binds every variant to its exact owner, parent asset and kind', async () => {
    const graph = await seedProjectAssetGraph()
    const access = {
      userId: graph.owner.id,
      projectId: graph.ownerProject.id,
    }
    for (const identity of [
      { access, kind: 'character' as const, assetId: graph.ownerCharacter.id, variantId: graph.ownerAppearance.id },
      { access, kind: 'location' as const, assetId: graph.ownerLocation.id, variantId: graph.ownerLocationImage.id },
      { access, kind: 'prop' as const, assetId: graph.ownerProp.id, variantId: graph.ownerPropImage.id },
    ]) {
      await expect(requireOwnedAssetVariant(identity)).resolves.toBeUndefined()
    }
    await expect(requireOwnedAssetVariant({
      access,
      kind: 'character',
      assetId: graph.ownerCharacter.id,
      variantId: graph.foreignAppearance.id,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
    await expect(requireOwnedAssetVariant({
      access,
      kind: 'location',
      assetId: graph.ownerLocation.id,
      variantId: graph.ownerPropImage.id,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  it('rejects a stale prepared upload instead of overwriting a newer character render', async () => {
    const graph = await seedProjectAssetGraph()
    const input = {
      userId: graph.owner.id,
      projectId: graph.ownerProject.id,
      kind: 'character' as const,
      assetId: graph.ownerCharacter.id,
      appearanceId: graph.ownerAppearance.id,
      imageIndex: 0,
    }
    const preparedVersion = graph.ownerAppearance.updatedAt.getTime()

    await expect(prisma.$transaction(async (transaction) => (
      await commitProjectAssetRenderUpload(input, {
        kind: 'character',
        imageKey: 'uploads/first-render.jpg',
        appearanceId: graph.ownerAppearance.id,
        appearanceUpdatedAtMs: preparedVersion,
      }, transaction)
    ))).resolves.toMatchObject({ success: true, imageKey: 'uploads/first-render.jpg' })

    await expect(prisma.$transaction(async (transaction) => (
      await commitProjectAssetRenderUpload(input, {
        kind: 'character',
        imageKey: 'uploads/stale-render.jpg',
        appearanceId: graph.ownerAppearance.id,
        appearanceUpdatedAtMs: preparedVersion,
      }, transaction)
    ))).rejects.toThrow('PROJECT_CHARACTER_APPEARANCE_CHANGED_DURING_UPLOAD')

    const persisted = await prisma.characterAppearance.findUniqueOrThrow({
      where: { id: graph.ownerAppearance.id },
      select: { imageUrl: true, imageUrls: true },
    })
    expect(persisted.imageUrl).toBe('uploads/first-render.jpg')
    expect(JSON.parse(persisted.imageUrls ?? '[]')).toEqual(['uploads/first-render.jpg'])
  })
})
