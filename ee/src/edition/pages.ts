import ContactPage from '@ee/pages/contact'
import PrivacyPage from '@ee/pages/privacy'
import RefundPolicyPage from '@ee/pages/refund-policy'
import { PricingGlassPageContent } from '@ee/pages/pricing/page-content'
import TermsPage from '@ee/pages/terms'
import type { EditionPagesContract } from '@/lib/edition/contracts/pages'

export const editionPages = {
  pricing: PricingGlassPageContent,
  contact: ContactPage,
  privacy: PrivacyPage,
  terms: TermsPage,
  refundPolicy: RefundPolicyPage,
} satisfies EditionPagesContract
