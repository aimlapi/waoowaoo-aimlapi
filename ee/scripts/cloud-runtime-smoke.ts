import { getDeploymentConfig } from '@/lib/deployment/config'
import { getDeploymentFeatures } from '@/lib/deployment/features'
import { editionAuth } from '@/lib/edition/current/auth'
import { compiledDeploymentEdition } from '@/lib/edition/current/manifest'
import { editionMessages } from '@/lib/edition/current/messages'
import { editionOperations } from '@/lib/edition/current/operations'
import { editionServer } from '@/lib/edition/current/server'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

type CloudAuthProvider = ReturnType<typeof editionAuth.createProviders>[number]

function configuredProviderId(provider: CloudAuthProvider): string {
  const configuredId = provider.options?.id
  return typeof configuredId === 'string' ? configuredId : provider.id
}

async function main(): Promise<void> {
  const config = getDeploymentConfig()
  const features = getDeploymentFeatures(config)
  assert(compiledDeploymentEdition === 'cloud', 'compiled edition must be cloud')
  assert(config.edition === 'cloud', 'runtime edition must be cloud')
  assert(config.providerCredentialMode === 'platform-key', 'Cloud must use platform keys')
  assert(editionServer.billing.mustEnforce, 'Cloud billing enforcement must be required')
  assert(features.showBilling && features.showPricingPage, 'Cloud commerce features are missing')
  assert(features.showAccountSecurity, 'Cloud account security feature is missing')

  // NextAuth provider factories retain caller overrides under `options` until
  // parseProviders normalizes the final runtime configuration.
  const providerIds = new Set(editionAuth.createProviders().map(configuredProviderId))
  assert(providerIds.has('credentials'), 'Cloud password provider is missing')
  assert(providerIds.has('wechat-official'), 'Cloud WeChat provider is missing')
  assert(providerIds.has('google'), 'Cloud Google provider is missing')

  const messages = await editionMessages.load('en')
  assert('pricing' in messages, 'Cloud pricing messages are missing')
  assert('announcements' in messages, 'Cloud announcement messages are missing')

  const operations = editionOperations.createProjectAgentOperationRegistry()
  assert('list_user_transactions' in operations, 'Cloud billing operations are missing')
  assert('get_user_costs' in operations, 'Cloud cost operations are missing')

  process.stdout.write('Cloud runtime edition smoke passed.\n')
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`)
  process.exitCode = 1
})
