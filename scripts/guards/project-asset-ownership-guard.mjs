#!/usr/bin/env node

// Architecture contract: docs/architecture/modules/project-asset-ownership.md (PAO-01..08).

import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

function requireText(violations, source, text, message) {
  if (!source.includes(text)) violations.push(message)
}

export function inspectProjectAssetOwnershipContract(input) {
  const violations = []
  for (const required of [
    'requireOwnedAssetProject',
    'requireOwnedAssetTarget',
    'requireOwnedAssetVariant',
    'requireAssetBodyVariantOwnership',
    "project: { userId: input.access.userId }",
    'assetKind: input.kind',
  ]) {
    requireText(violations, input.authority, required, `project asset authority missing: ${required}`)
  }

  for (const required of [
    'await requireAssetBodyVariantOwnership(input, client)',
    'await requireOwnedAssetTarget(input, transaction)',
    'await requireOwnedAssetVariant(input, transaction)',
    'await requireOwnedAssetProject(input.access, transaction)',
  ]) {
    requireText(violations, input.actions, required, `project asset action bypasses owner authority: ${required}`)
  }

  for (const route of input.routes) {
    requireText(
      violations,
      route.source,
      'requireProjectAuthLight',
      `project asset route bypasses project auth: ${route.path}`,
    )
    requireText(
      violations,
      route.source,
      'projectId',
      `project asset route omits explicit project identity: ${route.path}`,
    )
  }

  const uploadValidation = input.upload.indexOf('await requireOwnedAsset')
  const uploadSideEffect = input.upload.indexOf('await uploadObject')
  if (uploadValidation < 0 || uploadSideEffect < 0 || uploadValidation > uploadSideEffect) {
    violations.push('project upload must authorize its target before object-storage side effects')
  }

  requireText(
    violations,
    input.actions,
    'deleteProjectLocationBackedAsset(input.assetId, transaction)',
    'project asset destructive entry missing',
  )
  if (input.locationBackedCallers.some((file) => !file.endsWith('src/lib/assets/services/asset-actions.ts'))) {
    violations.push('location-backed destructive helpers must only be called through project asset actions')
  }
  for (const [label, source] of [
    ['asset actions', input.actions],
    ['project selection', input.projectSelection],
    ['location-backed assets', input.locationBackedAssets],
    ['project deletion', input.projectCrud],
  ]) {
    for (const forbidden of ['deleteObject(', 'deleteObjects(', 'resolveStorageKeyFromMediaValue']) {
      if (source.includes(forbidden)) {
        violations.push(`${label} restores domain-owned physical media deletion: ${forbidden}`)
      }
    }
  }

  for (const forbidden of [
    'copyAssetFromGlobal',
    'canCopyFromGlobal',
    'useGlobalAssets',
    '/api/asset-hub',
    "scope: 'global'",
    'sourceGlobalCharacterId',
    'sourceGlobalLocationId',
  ]) {
    if (input.projectAssetSurface.includes(forbidden)) {
      violations.push(`removed global asset path restored: ${forbidden}`)
    }
  }
  for (const forbidden of [
    'model GlobalAssetFolder',
    'model GlobalCharacter',
    'model GlobalLocation',
    'sourceGlobalCharacterId',
    'sourceGlobalLocationId',
  ]) {
    if (input.schema.includes(forbidden)) {
      violations.push(`removed global asset schema restored: ${forbidden}`)
    }
  }
  if (input.removedPathsPresent.length > 0) {
    violations.push(`removed global asset entry restored: ${input.removedPathsPresent.join(', ')}`)
  }

  return violations
}

function walkSourceFiles(root, relativeDirectory) {
  const absoluteDirectory = path.join(root, relativeDirectory)
  if (!fs.existsSync(absoluteDirectory)) return []
  const files = []
  const visit = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name)
      if (entry.isDirectory()) visit(fullPath)
      else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(fullPath)
    }
  }
  visit(absoluteDirectory)
  return files
}

function findCallers(root, symbol) {
  const callers = []
  for (const fullPath of walkSourceFiles(root, 'src')) {
    const relative = path.relative(root, fullPath).split(path.sep).join('/')
    const source = fs.readFileSync(fullPath, 'utf8')
    const matches = source.match(new RegExp(`\\b${symbol}\\s*\\(`, 'g'))?.length ?? 0
    const declarationAllowance = relative.endsWith('src/lib/assets/services/location-backed-assets.ts') ? 1 : 0
    if (matches > declarationAllowance) callers.push(relative)
  }
  return callers
}

function runCli() {
  const root = process.cwd()
  const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8')
  const routeFiles = [
    ...walkSourceFiles(root, 'src/app/api/assets'),
    ...walkSourceFiles(root, 'src/app/api/projects/[projectId]/assets'),
  ]
  const surfaceFiles = [
    ...walkSourceFiles(root, 'src/lib/assets'),
    ...routeFiles,
    ...walkSourceFiles(root, 'src/components/shared/assets'),
    ...walkSourceFiles(root, 'src/features/project-workspace/components/assets'),
  ]
  const removedPaths = [
    'src/app/api/asset-hub',
    'src/app/[locale]/workspace/asset-hub',
    'src/components/shared/assets/GlobalAssetPicker.tsx',
    'src/lib/query/hooks/useGlobalAssets.ts',
  ]
  const removedPathPresent = (relative) => {
    const absolute = path.join(root, relative)
    if (!fs.existsSync(absolute)) return false
    return fs.statSync(absolute).isDirectory()
      ? walkSourceFiles(root, relative).length > 0
      : true
  }
  const violations = inspectProjectAssetOwnershipContract({
    authority: read('src/lib/assets/services/project-asset-ownership.ts'),
    actions: read('src/lib/assets/services/asset-actions.ts'),
    projectSelection: read('src/lib/assets/services/project-location-backed-selection.ts'),
    locationBackedAssets: read('src/lib/assets/services/location-backed-assets.ts'),
    upload: read('src/lib/assets/services/project-upload-render.ts'),
    projectCrud: read('src/lib/operations/domains/project/project-crud-ops.ts'),
    schema: read('prisma/schema.prisma'),
    routes: routeFiles.map((file) => ({
      path: path.relative(root, file).split(path.sep).join('/'),
      source: fs.readFileSync(file, 'utf8'),
    })),
    projectAssetSurface: surfaceFiles.map((file) => fs.readFileSync(file, 'utf8')).join('\n'),
    locationBackedCallers: findCallers(root, 'deleteProjectLocationBackedAsset'),
    removedPathsPresent: removedPaths.filter(removedPathPresent),
  })
  if (violations.length > 0) {
    console.error('[project-asset-ownership] violations detected')
    for (const violation of violations) console.error(`- ${violation}`)
    process.exit(1)
  }
  console.log('[project-asset-ownership] OK project owner/kind/parent authority; global asset paths absent')
}

const entryHref = process.argv[1] ? pathToFileURL(process.argv[1]).href : null
if (entryHref && import.meta.url === entryHref) runCli()
