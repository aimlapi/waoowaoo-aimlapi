import type { Page } from '@playwright/test'
import { expect } from '@playwright/test'

interface CharacterResponsePayload {
  readonly character?: {
    readonly id?: unknown
  }
}

export async function createGoldenGlobalCharacterThroughUi(page: Page, input: {
  readonly name: string
  readonly description: string
}): Promise<string> {
  await page.goto('/zh/workspace/asset-hub', { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('heading', { name: '资产中心', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: '新建资产', exact: true }).click()
  await page.getByRole('button', { name: '新建角色', exact: true }).click()
  const modalHeading = page.getByRole('heading', { name: '新建角色', exact: true })
  await expect(modalHeading).toBeVisible()
  await page.getByRole('textbox', { name: /角色名称/ }).fill(input.name)
  await page.getByPlaceholder('请输入角色外貌描述...').fill(input.description)
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === '/api/asset-hub/characters'
    )),
    page.getByRole('button', { name: '仅添加人物到资产库', exact: true }).click(),
  ])
  if (response.status() !== 201 && response.status() !== 200) {
    throw new Error(`GOLDEN_GLOBAL_CHARACTER_CREATE_HTTP_${String(response.status())}`)
  }
  const payload = await response.json() as CharacterResponsePayload
  const characterId = payload.character?.id
  if (typeof characterId !== 'string' || !characterId) {
    throw new Error('GOLDEN_GLOBAL_CHARACTER_CREATE_ID_MISSING')
  }
  await expect(page.getByText(input.name, { exact: true })).toBeVisible({ timeout: 30_000 })
  return characterId
}

export async function createGoldenProjectCharacterThroughUi(page: Page, input: {
  readonly projectId: string
  readonly name: string
  readonly description: string
}): Promise<string> {
  await page.goto(`/zh/workspace/${input.projectId}?assetLibrary=1`, { waitUntil: 'domcontentloaded' })
  const library = page.getByRole('heading', { name: '资产库', exact: true }).locator('..').locator('..')
  await expect(library).toBeVisible({ timeout: 30_000 })
  await library.getByRole('button', { name: /添加角色/ }).click()
  const modalHeading = page.getByRole('heading', { name: '新建角色', exact: true })
  await expect(modalHeading).toBeVisible()
  await page.getByRole('textbox', { name: /角色名称/ }).fill(input.name)
  await page.getByPlaceholder('请输入角色外貌描述...').fill(input.description)
  const [response] = await Promise.all([
    page.waitForResponse((candidate) => (
      candidate.request().method() === 'POST'
      && new URL(candidate.url()).pathname === `/api/projects/${input.projectId}/character`
    )),
    page.getByRole('button', { name: '仅添加角色', exact: true }).click(),
  ])
  if (response.status() !== 201 && response.status() !== 200) {
    throw new Error(`GOLDEN_PROJECT_CHARACTER_CREATE_HTTP_${String(response.status())}`)
  }
  const payload = await response.json() as CharacterResponsePayload
  const characterId = payload.character?.id
  if (typeof characterId !== 'string' || !characterId) {
    throw new Error('GOLDEN_PROJECT_CHARACTER_CREATE_ID_MISSING')
  }
  await expect(page.locator(`#project-character-${characterId}`)).toContainText(input.name, { timeout: 30_000 })
  return characterId
}
