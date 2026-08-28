'use client'

import InAppAnnouncementHost from '@ee/components/InAppAnnouncementHost'
import AuthEntryCard from '@ee/components/AuthEntryCard'
import PaidBetaCheckoutSuccessDialog from '@ee/components/PaidBetaCheckoutSuccessDialog'
import AccountSecurityTab from '@ee/components/profile/AccountSecurityTab'
import ProfileBillingSection from '@ee/components/profile/ProfileBillingSection'
import ProfileOverviewSection from '@ee/components/profile/ProfileOverviewSection'
import type { EditionClientContract } from '@/lib/edition/contracts/client'

function WorkspaceAnnouncementHost() {
  return <InAppAnnouncementHost placement="workspace_canvas" />
}

export const editionClient = {
  WorkspaceAnnouncementHost,
  AuthEntryCard,
  PaidBetaCheckoutSuccessDialog,
  AccountSecurityTab,
  ProfileOverviewSection,
  ProfileBillingSection,
} satisfies EditionClientContract
