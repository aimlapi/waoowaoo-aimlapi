import type { EditionBillingContract } from '@/lib/edition/contracts/billing'
import { addBalanceWithTransaction } from '@/lib/billing/ledger'
import { assertLlmSpendableBalance } from '@ee/billing/llm-balance-gate'
import { settleRealtimeLlmUsage } from '@ee/billing/llm-realtime-settlement'
import { resolveSignupGrantCredits } from '@ee/billing/signup-grant'

export const editionBilling = {
  async applySignupGrant(tx, userId) {
    const signupGrant = resolveSignupGrantCredits()
    if (signupGrant <= 0) return
    await addBalanceWithTransaction(tx, userId, signupGrant, {
      type: 'adjust',
      reason: 'signup welcome credits',
      operatorId: 'signup-grant',
      idempotencyKey: `signup:${userId}`,
    })
  },
  assertLlmSpendableBalance,
  settleRealtimeLlmUsage,
} satisfies EditionBillingContract
