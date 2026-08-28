import LegalPageShell from '@/components/legal/LegalPageShell'
import { normalizeOfficialLocale, readOfficialLegalPage } from '@ee/public-site/official-content'
import { requireOfficialCloudLegalPage } from '@ee/public-site/visibility'
import type { Locale } from '@/i18n/routing'

export const dynamic = 'force-dynamic'

export default async function PrivacyPage({
  params,
}: {
  readonly params: Promise<{ readonly locale: Locale }>
}) {
  requireOfficialCloudLegalPage()
  const { locale } = await params
  const content = readOfficialLegalPage('privacy', normalizeOfficialLocale(locale))

  return (
    <LegalPageShell
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      updatedAt={content.updatedAt}
      sections={content.sections}
    />
  )
}
