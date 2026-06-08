'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { resolveErrorDisplay } from '@/lib/errors/display'
import TaskStatusOverlay from '@/components/task/TaskStatusOverlay'
import type { TaskPresentationState } from '@/lib/task/presentation'
import { MediaImageWithLoading } from '@/components/media/MediaImageWithLoading'
import { AppIcon } from '@/components/ui/icons'
import type { CharacterAppearanceCandidateMetadata } from '@/types/character-casting'

type CharacterCardGalleryProps =
  | {
    mode: 'selection'
    characterId: string
    appearanceId: string
    characterName: string
    imageUrlsWithIndex: Array<{ url: string; originalIndex: number }>
    candidateMetadata: CharacterAppearanceCandidateMetadata[] | null
    selectedIndex: number | null
    isGroupTaskRunning: boolean
    isImageTaskRunning: (imageIndex: number) => boolean
    displayTaskPresentation: TaskPresentationState | null
    onImageClick: (imageUrl: string) => void
    onSelectImage?: (characterId: string, appearanceId: string, imageIndex: number | null) => void
  }
  | {
    mode: 'single'
    characterName: string
    changeReason: string
    aspectClassName: string
    currentImageUrl: string | null | undefined
    selectedIndex: number | null
    hasMultipleImages: boolean
    isAppearanceTaskRunning: boolean
    displayTaskPresentation: TaskPresentationState | null
    appearanceErrorMessage?: string | null
    onImageClick: (imageUrl: string) => void
    overlayActions: ReactNode
  }

export default function CharacterCardGallery(props: CharacterCardGalleryProps) {
  const t = useTranslations('assets')

  if (props.mode === 'selection') {
    return (
      <div className="grid grid-cols-3 gap-3">
        {props.imageUrlsWithIndex.map(({ url, originalIndex }) => {
          const isThisSelected = props.selectedIndex === originalIndex
          const isThisTaskRunning = props.isImageTaskRunning(originalIndex) || props.isGroupTaskRunning
          const metadata = props.candidateMetadata?.[originalIndex] ?? null
          const castingScore = metadata?.castingNotes.score
          const recommendation = metadata?.castingNotes.recommendation.trim() ?? ''
          const strengths = metadata?.castingNotes.strengths.map((item) => item.trim()).filter(Boolean) ?? []
          const risks = metadata?.castingNotes.risks.map((item) => item.trim()).filter(Boolean) ?? []
          const fitTags = metadata?.castingNotes.fitTags.map((item) => item.trim()).filter(Boolean) ?? []
          const hasCastingDetails = !!recommendation || strengths.length > 0 || risks.length > 0 || fitTags.length > 0
          const compactTraits = [
            metadata?.visualTraits.face,
            metadata?.visualTraits.body,
            metadata?.visualTraits.costume,
            metadata?.visualTraits.skin,
            metadata?.visualTraits.accessibility,
            metadata?.visualTraits.tattoosAndMarks,
            metadata?.visualTraits.scars,
          ].filter((value): value is string => !!value).slice(0, 2)
          const stillTitles = (metadata?.castingStills ?? []).map((still) => still.title).filter(Boolean).slice(0, 4)
          return (
            <div key={originalIndex} className="relative group/thumb">
              <div
                onClick={() => props.onImageClick(url)}
                className={`rounded-lg overflow-hidden border-2 transition-all cursor-pointer relative ${isThisSelected
                  ? 'border-[var(--glass-stroke-success)] ring-2 ring-[var(--glass-focus-ring)]'
                  : 'border-[var(--glass-stroke-base)] hover:border-[var(--glass-stroke-focus)]'
                  }`}
              >
                <MediaImageWithLoading
                  src={url}
                  alt={`${props.characterName} - ${t('image.optionNumber', { number: originalIndex + 1 })}`}
                  containerClassName="w-full min-h-[96px]"
                  className="w-full h-auto object-contain"
                />

                {isThisTaskRunning && (
                  <TaskStatusOverlay state={props.displayTaskPresentation} />
                )}

                <div
                  className={`absolute bottom-2 left-2 flex items-center gap-1 text-white text-xs px-2 py-0.5 rounded ${isThisSelected ? 'bg-[var(--glass-tone-success-fg)]' : 'bg-[var(--glass-overlay)]'
                    }`}
                >
                  <span>{t('image.optionNumber', { number: originalIndex + 1 })}</span>
                  {isThisSelected && (
                    <AppIcon name="checkTiny" className="h-3 w-3" />
                  )}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (!isThisTaskRunning) {
                      props.onSelectImage?.(props.characterId, props.appearanceId, isThisSelected ? null : originalIndex)
                    }
                  }}
                  disabled={isThisTaskRunning}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${isThisSelected
                    ? 'bg-[var(--glass-tone-success-fg)] text-white'
                    : 'bg-[var(--glass-bg-surface-strong)] hover:bg-[var(--glass-accent-from)] hover:text-white'
                    } disabled:opacity-50`}
                  title={isThisSelected ? t('image.cancelSelection') : t('image.useThis')}
                >
                  <AppIcon name="check" className="w-4 h-4" />
                </button>
              </div>
              {metadata && (
                <div className="mt-2 min-h-[72px] rounded-md border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] px-2 py-1.5 text-[10px] leading-4 text-[var(--glass-text-secondary)]">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--glass-text-primary)]">{t('casting.optionNotes')}</span>
                    {castingScore !== null && castingScore !== undefined && (
                      <span className="rounded bg-[var(--glass-tone-info-bg)] px-1.5 py-0.5 font-semibold text-[var(--glass-tone-info-fg)]">
                        {t('casting.score', { score: castingScore })}
                      </span>
                    )}
                  </div>
                  {recommendation && (
                    <p className="line-clamp-2 break-words">{recommendation}</p>
                  )}
                  {compactTraits.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {compactTraits.map((trait) => (
                        <span key={trait} className="max-w-full truncate rounded bg-[var(--glass-bg-muted)] px-1.5 py-0.5">
                          {trait}
                        </span>
                      ))}
                    </div>
                  )}
                  {stillTitles.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      <span className="text-[var(--glass-text-tertiary)]">{t('casting.stills')}</span>
                      {stillTitles.map((title) => (
                        <span key={title} className="max-w-full truncate rounded bg-[var(--glass-tone-info-bg)] px-1.5 py-0.5 text-[var(--glass-tone-info-fg)]">
                          {title}
                        </span>
                      ))}
                    </div>
                  )}
                  {risks[0] && (
                    <p className="mt-1 line-clamp-2 break-words text-[var(--glass-tone-warning-fg)]">
                      {t('casting.risk', { risk: risks[0] })}
                    </p>
                  )}
                  {hasCastingDetails && (
                    <details className="mt-1 rounded border border-[var(--glass-stroke-base)] bg-[var(--glass-bg-muted)] px-1.5 py-1">
                      <summary className="cursor-pointer select-none font-semibold text-[var(--glass-tone-info-fg)]">
                        {t('casting.details')}
                      </summary>
                      <div className="mt-1 max-h-44 space-y-1.5 overflow-y-auto border-t border-[var(--glass-stroke-base)] pt-1.5">
                        {recommendation && (
                          <section>
                            <p className="font-semibold text-[var(--glass-text-primary)]">{t('casting.recommendation')}</p>
                            <p className="whitespace-pre-wrap break-words">{recommendation}</p>
                          </section>
                        )}
                        {strengths.length > 0 && (
                          <section>
                            <p className="font-semibold text-[var(--glass-text-primary)]">{t('casting.strengths')}</p>
                            <ul className="list-disc space-y-0.5 pl-3">
                              {strengths.map((strength) => (
                                <li key={strength} className="whitespace-pre-wrap break-words">{strength}</li>
                              ))}
                            </ul>
                          </section>
                        )}
                        {risks.length > 0 && (
                          <section>
                            <p className="font-semibold text-[var(--glass-text-primary)]">{t('casting.risks')}</p>
                            <ul className="list-disc space-y-0.5 pl-3 text-[var(--glass-tone-warning-fg)]">
                              {risks.map((risk) => (
                                <li key={risk} className="whitespace-pre-wrap break-words">{risk}</li>
                              ))}
                            </ul>
                          </section>
                        )}
                        {fitTags.length > 0 && (
                          <section>
                            <p className="font-semibold text-[var(--glass-text-primary)]">{t('casting.criteria')}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {fitTags.map((tag) => (
                                <span key={tag} className="max-w-full break-words rounded bg-[var(--glass-tone-info-bg)] px-1.5 py-0.5 text-[var(--glass-tone-info-fg)]">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  const appearanceErrorDisplay = resolveErrorDisplay({
    code: props.appearanceErrorMessage || null,
    message: props.appearanceErrorMessage || null,
  })

  return (
    <div className={`relative overflow-hidden rounded-lg border-2 border-[var(--glass-stroke-base)] ${props.aspectClassName}`}>
      {props.currentImageUrl ? (
        <div className="relative h-full w-full">
          <MediaImageWithLoading
            src={props.currentImageUrl}
            alt={`${props.characterName} - ${props.changeReason}`}
            containerClassName="h-full w-full"
            className="h-full w-full object-contain cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => props.onImageClick(props.currentImageUrl!)}
          />
          {props.selectedIndex !== null && props.hasMultipleImages && (
            <div className="absolute bottom-2 left-2 bg-[var(--glass-tone-success-fg)] text-white text-xs px-2 py-0.5 rounded">
              {t('image.optionNumber', { number: props.selectedIndex + 1 })}
            </div>
          )}
        </div>
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[var(--glass-bg-muted)]">
          {appearanceErrorDisplay && !props.isAppearanceTaskRunning ? (
            <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
              <AppIcon name="alert" className="w-8 h-8 text-[var(--glass-tone-danger-fg)] mb-2" />
              <div className="text-[var(--glass-tone-danger-fg)] text-xs font-medium mb-1">{t('common.generateFailed')}</div>
              <div className="text-[var(--glass-tone-danger-fg)] text-xs max-w-full break-words">{appearanceErrorDisplay.message}</div>
            </div>
          ) : (
            <AppIcon name="userAlt" className="w-8 h-8 text-[var(--glass-text-tertiary)]" />
          )}
        </div>
      )}
      {props.isAppearanceTaskRunning && (
        <TaskStatusOverlay state={props.displayTaskPresentation} />
      )}
      {!props.isAppearanceTaskRunning && (
        <div className="absolute top-2 left-2 flex gap-1">
          {props.overlayActions}
        </div>
      )}
    </div>
  )
}
