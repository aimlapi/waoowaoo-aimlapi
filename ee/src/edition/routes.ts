import type { EditionRouteHandlersContract } from '@/lib/edition/contracts/routes'
import { handleAnnouncementAcknowledgePost } from '@ee/routes/announcement-acknowledge'
import { handleAnnouncementsGet } from '@ee/routes/announcements'
import { handlePublicBetaWaitlistPost } from '@ee/routes/public-beta-waitlist'
import { handleAuthPhoneCaptchaPost } from '@ee/routes/auth-phone-captcha'
import { handleAuthPhoneSendCodePost } from '@ee/routes/auth-phone-send-code'
import { handleAuthSsoAuthorizeGet } from '@ee/routes/auth-sso-authorize'
import { handleAuthSsoTokenPost } from '@ee/routes/auth-sso-token'
import { handleAuthSsoUserinfoGet } from '@ee/routes/auth-sso-userinfo'
import { handleAuthWechatAttemptPost } from '@ee/routes/auth-wechat-attempt'
import {
  handleAuthWechatCallbackGet,
  handleAuthWechatCallbackPost,
} from '@ee/routes/auth-wechat-callback'
import { handleAuthWechatEventsPost } from '@ee/routes/auth-wechat-events'
import {
  handleUserSecurityGet,
  handleUserSecurityPatch,
  handleUserSecurityPost,
} from '@ee/routes/user-security'
import { handlePaidBetaGroupQrGet } from '@ee/routes/paid-beta-group-qr'
import { handlePaidBetaPaymentStatusGet } from '@ee/routes/paid-beta-payment-status'
import { handlePaymentsRechargeConfigGet } from '@ee/routes/payments-recharge-config'
import { handlePaymentsStripeCheckoutPost } from '@ee/routes/payments-stripe-checkout'
import { handlePaymentsStripePlanPost } from '@ee/routes/payments-stripe-plan'
import { handlePaymentsStripePlanQuotePost } from '@ee/routes/payments-stripe-plan-quote'
import { handlePaymentsStripeWalletIntentPost } from '@ee/routes/payments-stripe-wallet-intent'
import { handlePaymentsStripeWalletStatusGet } from '@ee/routes/payments-stripe-wallet-status'
import { handlePaymentsStripeWebhookPost } from '@ee/routes/payments-stripe-webhook'
import { handlePaymentsSubscriptionConfigGet } from '@ee/routes/payments-subscription-config'
import { handleAdminCreditsGrantPost } from '@ee/routes/admin-credits-grant'
import { handleUserBalanceGet } from '@ee/routes/user-balance'
import { handleUserCostDetailsGet } from '@ee/routes/user-cost-details'
import { handleUserCostsGet } from '@ee/routes/user-costs'
import { handleUserTransactionsGet } from '@ee/routes/user-transactions'

export const editionRouteHandlers = {
  publicBetaWaitlistPost: handlePublicBetaWaitlistPost,
  announcementsGet: handleAnnouncementsGet,
  announcementAcknowledgePost: handleAnnouncementAcknowledgePost,
  authPhoneCaptchaPost: handleAuthPhoneCaptchaPost,
  authPhoneSendCodePost: handleAuthPhoneSendCodePost,
  authWechatAttemptPost: handleAuthWechatAttemptPost,
  authWechatCallbackGet: handleAuthWechatCallbackGet,
  authWechatCallbackPost: handleAuthWechatCallbackPost,
  authWechatEventsPost: handleAuthWechatEventsPost,
  authSsoAuthorizeGet: handleAuthSsoAuthorizeGet,
  authSsoTokenPost: handleAuthSsoTokenPost,
  authSsoUserinfoGet: handleAuthSsoUserinfoGet,
  userSecurityGet: handleUserSecurityGet,
  userSecurityPost: handleUserSecurityPost,
  userSecurityPatch: handleUserSecurityPatch,
  paidBetaGroupQrGet: handlePaidBetaGroupQrGet,
  paidBetaPaymentStatusGet: handlePaidBetaPaymentStatusGet,
  paymentsRechargeConfigGet: handlePaymentsRechargeConfigGet,
  paymentsStripeCheckoutPost: handlePaymentsStripeCheckoutPost,
  paymentsStripePlanQuotePost: handlePaymentsStripePlanQuotePost,
  paymentsStripePlanPost: handlePaymentsStripePlanPost,
  paymentsStripeWalletIntentPost: handlePaymentsStripeWalletIntentPost,
  paymentsStripeWalletStatusGet: handlePaymentsStripeWalletStatusGet,
  paymentsStripeWebhookPost: handlePaymentsStripeWebhookPost,
  paymentsSubscriptionConfigGet: handlePaymentsSubscriptionConfigGet,
  adminCreditsGrantPost: handleAdminCreditsGrantPost,
  userBalanceGet: handleUserBalanceGet,
  userCostsGet: handleUserCostsGet,
  userCostDetailsGet: handleUserCostDetailsGet,
  userTransactionsGet: handleUserTransactionsGet,
} satisfies EditionRouteHandlersContract
