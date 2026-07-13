'use client'

import { useState } from 'react'
import { AppIcon } from '@/components/ui/icons'

interface ProjectNameEditorProps {
    projectName?: string
    onRename?: (newName: string) => void | Promise<void>
    t: (key: 'cancel' | 'editProjectName' | 'project' | 'projectNamePlaceholder' | 'projectRenameFailed' | 'save') => string
}

export function ProjectNameEditor({ projectName, onRename, t }: ProjectNameEditorProps) {
    const displayName = projectName?.trim() || t('project')
    const [isEditing, setIsEditing] = useState(false)
    const [draftName, setDraftName] = useState(displayName)
    const [isSaving, setIsSaving] = useState(false)
    const [errorMessage, setErrorMessage] = useState<string | null>(null)

    const startEditing = () => {
        setDraftName(displayName)
        setErrorMessage(null)
        setIsEditing(true)
    }

    const cancelEditing = () => {
        setDraftName(displayName)
        setErrorMessage(null)
        setIsEditing(false)
    }

    const submitRename = async () => {
        const nextName = draftName.trim()
        if (!nextName || isSaving) return
        if (!onRename || nextName === displayName) {
            setIsEditing(false)
            return
        }

        setIsSaving(true)
        setErrorMessage(null)
        try {
            await onRename(nextName)
            setIsEditing(false)
        } catch (error: unknown) {
            setErrorMessage(error instanceof Error && error.message ? error.message : t('projectRenameFailed'))
        } finally {
            setIsSaving(false)
        }
    }

    if (isEditing) {
        return (
            <div className="mb-1 px-2 py-1.5">
                <div className="flex items-center gap-1.5">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]">
                        <AppIcon name="folder" className="h-3.5 w-3.5" />
                    </div>
                    <input
                        type="text"
                        value={draftName}
                        onChange={(event) => setDraftName(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                                void submitRename()
                            } else if (event.key === 'Escape') {
                                cancelEditing()
                            }
                        }}
                        className="min-w-0 flex-1 rounded-md border border-[var(--glass-stroke-base)] bg-white/40 px-2 py-1 text-sm font-bold text-[var(--glass-text-primary)] outline-none focus:border-[var(--glass-stroke-strong)]"
                        placeholder={t('projectNamePlaceholder')}
                        autoFocus
                    />
                    <button
                        type="button"
                        onClick={() => { void submitRename() }}
                        disabled={isSaving || !draftName.trim()}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--glass-text-secondary)] transition-colors hover:bg-[var(--glass-bg-surface-strong)] hover:text-[var(--glass-text-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                        title={t('save')}
                    >
                        <AppIcon name="check" className="h-3.5 w-3.5" />
                    </button>
                    <button
                        type="button"
                        onClick={cancelEditing}
                        disabled={isSaving}
                        className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--glass-text-tertiary)] transition-colors hover:bg-[var(--glass-bg-surface-strong)] hover:text-[var(--glass-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
                        title={t('cancel')}
                    >
                        <AppIcon name="close" className="h-3.5 w-3.5" />
                    </button>
                </div>
                {errorMessage && (
                    <div className="mt-2 text-xs text-[var(--glass-tone-danger-fg)]">
                        {errorMessage}
                    </div>
                )}
            </div>
        )
    }

    return (
        <div className="mb-1 flex items-center gap-1.5 px-2 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-[var(--glass-bg-muted)] text-[var(--glass-text-tertiary)]">
                <AppIcon name="folder" className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 truncate text-sm font-bold text-[var(--glass-text-primary)]">{displayName}</div>
            {onRename && (
                <button
                    type="button"
                    onClick={startEditing}
                    className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[var(--glass-text-tertiary)] transition-colors hover:bg-[var(--glass-bg-surface-strong)] hover:text-[var(--glass-text-secondary)]"
                    title={t('editProjectName')}
                >
                    <AppIcon name="edit" className="h-3.5 w-3.5" />
                </button>
            )}
        </div>
    )
}
