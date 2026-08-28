import type { EditionServerContract } from '@/lib/edition/contracts/server'
import type { DeploymentFeatures } from '@/lib/deployment/features'
import { minimumEffectiveCreditPriceCny } from '@ee/billing/subscription-plans'

const CLOUD_DEPLOYMENT_FEATURES = {
  showOfficialPublicPages: true,
  showPricingPage: true,
  showLegalPages: true,
  showRecharge: true,
  showSubscription: true,
  showBilling: true,
  showPublicBetaWaitlist: true,
  showAccountSecurity: true,
  showGoogleOAuth: true,
  showWechatOfficialAuth: true,
  enablePhoneAuth: false,
  enablePasswordAuth: true,
  passwordAuthIdentity: 'phone',
  showDownloadLogs: false,
  showUpdateCheck: false,
  showBetaBadge: true,
} as const satisfies Omit<DeploymentFeatures, 'showApiConfig'>

export const editionServer = {
  edition: 'cloud',
  providerCredentials: {
    defaultMode: 'platform-key',
  },
  projectConfiguration: {
    userManagedModels: false,
  },
  auth: {
    secureCookiesInProduction: true,
  },
  billing: {
    mustEnforce: true,
    realtimeLlmSettlement: true,
    minimumEffectiveCreditPriceCny: minimumEffectiveCreditPriceCny(),
  },
  codexRuntime: {
    requireDockerInProduction: true,
  },
  getDeploymentFeatures(config) {
    return {
      ...CLOUD_DEPLOYMENT_FEATURES,
      showApiConfig: config.providerCredentialMode === 'user-key',
    }
  },
} satisfies EditionServerContract
