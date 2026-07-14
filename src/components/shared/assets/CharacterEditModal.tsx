'use client'

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { AppIcon } from '@/components/ui/icons'
import { shouldShowError } from '@/lib/error-utils'
import TaskStatusInline from '@/components/task/TaskStatusInline'
import { resolveTaskPresentationState } from '@/lib/task/presentation'
import {
    useAiModifyProjectAppearanceDescription,
    useUpdateProjectAppearanceDescription,
    useUpdateProjectCharacterIntroduction,
    useUpdateProjectCharacterName,
} from '@/lib/query/hooks'
import { AiModifyDescriptionField } from './AiModifyDescriptionField'

export interface CharacterEditModalProps {
    characterId: string
    characterName: string
    description: string
    projectId: string
    appearanceId: string
    descriptionIndex?: number
    isTaskRunning?: boolean
    introduction?: string | null
    onClose: () => void
    onSave: (characterId: string, appearanceId: string) => void
    onUpdate?: (newDescription: string) => void
    onIntroductionUpdate?: (newIntroduction: string) => void
    onNameUpdate?: (newName: string) => void
    onRefresh?: () => void
}

export function CharacterEditModal({
    characterId,
    characterName,
    description,
    projectId,
    appearanceId,
    descriptionIndex,
    isTaskRunning = false,
    introduction,
    onClose,
    onSave,
    onUpdate,
    onIntroductionUpdate,
    onNameUpdate,
    onRefresh,
}: CharacterEditModalProps) {
    const t = useTranslations('assets')

    const [editingName, setEditingName] = useState(characterName)
    const [editingDescription, setEditingDescription] = useState(description)
    const [editingIntroduction, setEditingIntroduction] = useState(introduction || '')
    const [aiModifyInstruction, setAiModifyInstruction] = useState('')
    const [isAiModifying, setIsAiModifying] = useState(false)
    const [isSaving, setIsSaving] = useState(false)
    const aiModifyingState = isAiModifying
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null
    const savingState = isSaving
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'process',
            resource: 'text',
            hasOutput: false,
        })
        : null
    const taskRunningState = isTaskRunning
        ? resolveTaskPresentationState({
            phase: 'processing',
            intent: 'modify',
            resource: 'image',
            hasOutput: true,
        })
        : null

    const updateProjectName = useUpdateProjectCharacterName(projectId)
    const updateProjectAppearanceDesc = useUpdateProjectAppearanceDescription(projectId)
    const updateProjectIntroduction = useUpdateProjectCharacterIntroduction(projectId)
    const aiModifyProject = useAiModifyProjectAppearanceDescription(projectId)

    const getErrorMessage = (error: unknown, fallback: string) => {
        if (error instanceof Error && error.message) return error.message
        return fallback
    }

    const persistNameIfNeeded = async () => {
        const nextName = editingName.trim()
        if (!nextName || nextName === characterName) return

        await updateProjectName.mutateAsync({ characterId, name: nextName })
        onNameUpdate?.(nextName)
    }

    const persistDescription = async () => {
        await updateProjectAppearanceDesc.mutateAsync({
            characterId,
            appearanceId,
            description: editingDescription,
            descriptionIndex,
        })
    }

    const persistIntroductionIfNeeded = async () => {
        if (editingIntroduction === (introduction || '')) return

        const nextIntro = editingIntroduction.trim()
        await updateProjectIntroduction.mutateAsync({
            characterId,
            introduction: nextIntro,
        })
        onIntroductionUpdate?.(nextIntro)
    }

    const handleAiModify = async () => {
        if (!aiModifyInstruction.trim()) return false

        try {
            setIsAiModifying(true)

            const data = await aiModifyProject.mutateAsync({
                characterId,
                appearanceId,
                currentDescription: editingDescription,
                modifyInstruction: aiModifyInstruction,
            })
            if (data?.modifiedDescription) {
                setEditingDescription(data.modifiedDescription)
                onUpdate?.(data.modifiedDescription)
                setAiModifyInstruction('')
                return true
            }
            return false
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(`${t('modal.modifyFailed')}: ${getErrorMessage(error, t('errors.failed'))}`)
            }
            return false
        } finally {
            setIsAiModifying(false)
        }
    }

    const handleSaveName = async () => {
        try {
            await persistNameIfNeeded()
            onRefresh?.()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(t('modal.saveName') + t('errors.failed'))
            }
        }
    }

    const handleSaveOnly = async () => {
        try {
            setIsSaving(true)
            await persistNameIfNeeded()
            await persistDescription()
            await persistIntroductionIfNeeded()

            onUpdate?.(editingDescription)
            onRefresh?.()
            onClose()
        } catch (error: unknown) {
            if (shouldShowError(error)) {
                alert(getErrorMessage(error, t('errors.saveFailed')))
            }
        } finally {
            setIsSaving(false)
        }
    }

    const handleSaveAndGenerate = async () => {
        const savedDescription = editingDescription
        const savedAppearanceId = appearanceId
        onClose()

        ; (async () => {
            try {
                await persistNameIfNeeded()
                await persistDescription()
                await persistIntroductionIfNeeded()

                onUpdate?.(savedDescription)
                onRefresh?.()
                onSave(characterId, savedAppearanceId)
            } catch (error: unknown) {
                if (shouldShowError(error)) {
                    alert(getErrorMessage(error, t('errors.saveFailed')))
                }
            }
        })()
    }

    return (
        <div className="fixed inset-0 glass-overlay flex items-center justify-center z-50 p-4">
            <div className="glass-surface-modal max-w-2xl w-full max-h-[80vh] flex flex-col">
                <div className="p-6 space-y-4 overflow-y-auto flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-[var(--glass-text-primary)]">
                            {t('modal.editCharacter')} - {characterName}
                        </h3>
                        <button
                            onClick={onClose}
                            className="glass-btn-base glass-btn-soft w-9 h-9 rounded-full text-[var(--glass-text-tertiary)]"
                        >
                            <AppIcon name="close" className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="space-y-2">
                        <label className="glass-field-label block">
                            {t('character.name')}
                        </label>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={editingName}
                                onChange={(e) => setEditingName(e.target.value)}
                                className="glass-input-base flex-1 px-3 py-2"
                                placeholder={t('modal.namePlaceholder')}
                            />
                            {editingName !== characterName && (
                                <button
                                    onClick={handleSaveName}
                                    disabled={updateProjectName.isPending || !editingName.trim()}
                                    className="glass-btn-base glass-btn-tone-success px-3 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed text-sm whitespace-nowrap"
                                >
                                    {updateProjectName.isPending
                                        ? t('modal.processing')
                                        : t('modal.saveName')}
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2">
                            <label className="glass-field-label block">
                                {t('modal.introduction')}
                            </label>
                            <textarea
                                value={editingIntroduction}
                                onChange={(e) => setEditingIntroduction(e.target.value)}
                                rows={3}
                                className="glass-textarea-base w-full px-3 py-2 resize-none"
                                placeholder={t('modal.introductionPlaceholder')}
                            />
                            <p className="glass-field-hint">
                                {t('modal.introductionTip')}
                            </p>
                    </div>

                    <AiModifyDescriptionField
                        label={t('modal.appearancePrompt')}
                        description={editingDescription}
                        onDescriptionChange={setEditingDescription}
                        descriptionPlaceholder={t('modal.descPlaceholder')}
                        descriptionHeightClassName="h-64"
                        aiInstruction={aiModifyInstruction}
                        onAiInstructionChange={setAiModifyInstruction}
                        aiInstructionPlaceholder={t('modal.modifyPlaceholderCharacter')}
                        onAiModify={handleAiModify}
                        isAiModifying={isAiModifying}
                        aiModifyingState={aiModifyingState}
                        actionLabel={t('modal.modifyDescription')}
                        cancelLabel={t('common.cancel')}
                    />
                </div>

                <div className="flex gap-3 justify-end p-4 border-t border-[var(--glass-stroke-base)] bg-[var(--glass-bg-surface-strong)] rounded-b-lg flex-shrink-0">
                    <button
                        onClick={onClose}
                        className="glass-btn-base glass-btn-secondary px-4 py-2 rounded-lg"
                        disabled={isSaving}
                    >
                        {t('common.cancel')}
                    </button>
                    <button
                        onClick={handleSaveOnly}
                        disabled={isSaving || !editingDescription.trim()}
                        className="glass-btn-base glass-btn-tone-info px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isSaving ? (
                            <TaskStatusInline state={savingState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('modal.saveOnly')
                        )}
                    </button>
                    <button
                        onClick={handleSaveAndGenerate}
                        disabled={isSaving || isTaskRunning || !editingDescription.trim()}
                        className="glass-btn-base glass-btn-primary px-4 py-2 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                        {isTaskRunning ? (
                            <TaskStatusInline state={taskRunningState} className="text-white [&>span]:text-white [&_svg]:text-white" />
                        ) : (
                            t('modal.saveAndGenerate')
                        )}
                    </button>
                </div>
            </div>
        </div>
    )
}
