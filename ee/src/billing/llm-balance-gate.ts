import { prisma } from '@/lib/prisma'
import { getBillingMode } from '@/lib/billing/mode'
import { InsufficientBalanceError } from '@/lib/billing/errors'
import { usableCredits } from '@/lib/billing/credit-pools'
import { ensureCurrentPeriodGranted } from '@ee/billing/subscription-service'
import {
  getDeploymentConfig,
  isPlatformProviderCredentialMode,
} from '@/lib/deployment/config'
import { editionServer } from '@/lib/edition/current/server'

/**
 * Pre-flight balance check for language-model work.
 *
 * Model usage is billed as soon as a successful response reports its final
 * usage. The pre-flight gate prevents starting a new Provider call when the
 * user has no whole credit left to cover post-priced usage.
 *
 * It is deliberately a floor, not a quote. It asks "does this user have any
 * credit at all", not "can they afford this turn" — the latter is unknowable
 * before the model runs, and pretending otherwise would mean inventing an
 * estimate and refusing work against it.
 */
export async function assertLlmSpendableBalance(userId: string): Promise<void> {
  const deployment = getDeploymentConfig()
  if (
    !editionServer.billing.realtimeLlmSettlement
    || !isPlatformProviderCredentialMode(deployment)
    || await getBillingMode() !== 'ENFORCE'
  ) return

  // A user whose new period is due but ungranted has credits they paid for;
  // granting first means the gate never rejects on a stale pool.
  await ensureCurrentPeriodGranted(userId)

  const balance = await prisma.userBalance.findUnique({ where: { userId } })
  const available = balance
    ? usableCredits(
        {
          rechargeCredits: balance.balance,
          subscriptionCredits: balance.subscriptionCredits,
          subscriptionExpiresAt: balance.subscriptionExpiresAt,
        },
        new Date(),
      )
    : 0

  if (available <= 0) {
    throw new InsufficientBalanceError(1, available)
  }
}
