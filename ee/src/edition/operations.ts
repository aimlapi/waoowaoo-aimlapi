import type { EditionOperationsContract } from '@/lib/edition/contracts/operations'
import { withOperationPack } from '@/lib/operations/pack'
import { createUserBillingOperations } from '@ee/operations/billing/user-billing-ops'

const CONFIRM_NONE = {
  kind: 'none',
  required: false,
  summary: null,
  budget: null,
} as const

const API_ONLY = { tool: false, api: true, mcp: false } as const

export const editionOperations = {
  createProjectAgentOperationRegistry() {
    return withOperationPack(createUserBillingOperations(), {
      groupPath: ['billing'],
      channels: API_ONLY,
      confirmation: CONFIRM_NONE,
    })
  },
} satisfies EditionOperationsContract
