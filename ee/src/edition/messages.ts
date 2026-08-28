import type { EditionMessagesContract } from '@/lib/edition/contracts/messages'
import enAnnouncements from '../../messages/en/announcements.json'
import enBilling from '../../messages/en/billing.json'
import enContact from '../../messages/en/contact.json'
import enPaidBeta from '../../messages/en/paidBeta.json'
import enPricing from '../../messages/en/pricing.json'
import zhAnnouncements from '../../messages/zh/announcements.json'
import zhBilling from '../../messages/zh/billing.json'
import zhContact from '../../messages/zh/contact.json'
import zhPaidBeta from '../../messages/zh/paidBeta.json'
import zhPricing from '../../messages/zh/pricing.json'

const CLOUD_MESSAGES = {
  en: {
    announcements: enAnnouncements,
    billing: enBilling,
    contact: enContact,
    paidBeta: enPaidBeta,
    pricing: enPricing,
  },
  zh: {
    announcements: zhAnnouncements,
    billing: zhBilling,
    contact: zhContact,
    paidBeta: zhPaidBeta,
    pricing: zhPricing,
  },
} as const

export const editionMessages = {
  async load(locale) {
    return CLOUD_MESSAGES[locale]
  },
} satisfies EditionMessagesContract
