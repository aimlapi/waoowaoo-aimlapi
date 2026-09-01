'use client'

import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useMemo, useState } from 'react'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  type DragEndEvent,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CustomModel, Provider } from '../api-config'
import { ProviderCard } from '../api-config'
import { AppIcon } from '@/components/ui/icons'

interface DefaultModels {
  assistantModel?: string
  analysisModel?: string
  characterModel?: string
  locationModel?: string
  editModel?: string
  videoModel?: string
  musicModel?: string
}

interface ApiConfigProviderListProps {
  modelProviders: Provider[]
  allModels: CustomModel[]
  defaultModels: DefaultModels
  getModelsForProvider: (providerId: string) => CustomModel[]
  onToggleModel: (modelKey: string, providerId: string) => void
  onUpdateApiKey: (providerId: string, apiKey: string) => void
  onUpdateBaseUrl: (providerId: string, baseUrl: string) => void
  onReorderProviders: (activeProviderId: string, overProviderId: string) => void
  onDeleteModel: (modelKey: string, providerId: string) => void
  onUpdateModel: (modelKey: string, updates: Partial<CustomModel>, providerId: string) => void
  onDeleteProvider: (providerId: string) => void
  onAddModel: (model: Omit<CustomModel, 'enabled'>) => void
  onFlushConfig: () => Promise<void>
  onToggleProviderEnabled: (providerId: string, enabled: boolean) => void
  labels: {
    providerPool: string
    dragToSort: string
    dragToSortHint: string
    disableProvider: string
    enableProvider: string
    showProviderExtensions: string
    hideProviderExtensions: string
  }
}

export function ApiConfigProviderList({
  modelProviders,
  allModels,
  defaultModels,
  getModelsForProvider,
  onToggleModel,
  onUpdateApiKey,
  onUpdateBaseUrl,
  onReorderProviders,
  onDeleteModel,
  onUpdateModel,
  onDeleteProvider,
  onAddModel,
  onFlushConfig,
  onToggleProviderEnabled,
  labels,
}: ApiConfigProviderListProps) {
  const [showProviderExtensions, setShowProviderExtensions] = useState(false)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event
      if (!over || active.id === over.id) return
      onReorderProviders(String(active.id), String(over.id))
    },
    [onReorderProviders],
  )

  const providerModelsById = useMemo(() => {
    const map = new Map<string, CustomModel[]>()
    for (const provider of modelProviders) {
      map.set(provider.id, getModelsForProvider(provider.id))
    }
    return map
  }, [getModelsForProvider, modelProviders])

  const extensionProviders = useMemo(() => {
    return modelProviders.filter((provider) => provider.featured !== true && !provider.enabled)
  }, [modelProviders])

  const primaryProviders = useMemo(() => {
    const extensionIds = new Set(extensionProviders.map((provider) => provider.id))
    return modelProviders.filter((provider) => !extensionIds.has(provider.id))
  }, [extensionProviders, modelProviders])

  return (
    <>
      <div id="provider-pool-section" className="space-y-4 scroll-mt-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2.5">
            <span className="glass-surface-soft inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--glass-text-secondary)]">
              <AppIcon name="cube" className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-xl font-bold text-[var(--glass-text-primary)]">{labels.providerPool}</h2>
              <p className="text-[12px] text-[var(--glass-text-tertiary)]">{labels.dragToSortHint}</p>
            </div>
          </div>
        </div>
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={primaryProviders.map((provider) => provider.id)} strategy={rectSortingStrategy}>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {primaryProviders.map((provider) => (
                <SortableProviderCardItem key={provider.id} providerId={provider.id} dragLabel={labels.dragToSort}>
                  {({ dragHandle }) => (
                    <ProviderCard
                      provider={provider}
                      dragHandle={dragHandle}
                      models={providerModelsById.get(provider.id) || []}
                      allModels={allModels}
                      defaultModels={defaultModels}
                      onToggleModel={(modelKey) => onToggleModel(modelKey, provider.id)}
                      onUpdateApiKey={onUpdateApiKey}
                      onUpdateBaseUrl={onUpdateBaseUrl}
                      onDeleteModel={(modelKey) => onDeleteModel(modelKey, provider.id)}
                      onUpdateModel={(modelKey, updates) => onUpdateModel(modelKey, updates, provider.id)}
                      onDeleteProvider={onDeleteProvider}
                      onAddModel={onAddModel}
                      onFlushConfig={onFlushConfig}
                      onToggleProviderEnabled={onToggleProviderEnabled}
                      disableProviderLabel={labels.disableProvider}
                      enableProviderLabel={labels.enableProvider}
                    />
                  )}
                </SortableProviderCardItem>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {extensionProviders.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => setShowProviderExtensions((prev) => !prev)}
              className="glass-btn-base glass-btn-secondary flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left"
            >
              <p className="truncate text-sm font-medium text-[var(--glass-text-primary)]">
                {showProviderExtensions
                  ? labels.hideProviderExtensions
                  : `${labels.showProviderExtensions} (${extensionProviders.length})`}
              </p>
              <AppIcon
                name={showProviderExtensions ? 'chevronUp' : 'chevronDown'}
                className="h-4 w-4 shrink-0 text-[var(--glass-text-secondary)]"
              />
            </button>
            {showProviderExtensions && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {extensionProviders.map((provider) => (
                  <ProviderCard
                    key={`extension-${provider.id}`}
                    provider={provider}
                    models={providerModelsById.get(provider.id) || []}
                    allModels={allModels}
                    defaultModels={defaultModels}
                    onToggleModel={(modelKey) => onToggleModel(modelKey, provider.id)}
                    onUpdateApiKey={onUpdateApiKey}
                    onUpdateBaseUrl={onUpdateBaseUrl}
                    onDeleteModel={(modelKey) => onDeleteModel(modelKey, provider.id)}
                    onUpdateModel={(modelKey, updates) => onUpdateModel(modelKey, updates, provider.id)}
                    onDeleteProvider={onDeleteProvider}
                    onAddModel={onAddModel}
                    onFlushConfig={onFlushConfig}
                    onToggleProviderEnabled={onToggleProviderEnabled}
                    disableProviderLabel={labels.disableProvider}
                    enableProviderLabel={labels.enableProvider}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}

interface SortableProviderCardItemProps {
  providerId: string
  dragLabel: string
  children: (props: { dragHandle: ReactNode }) => ReactNode
}

function SortableProviderCardItem({ providerId, dragLabel, children }: SortableProviderCardItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: providerId })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.9 : 1,
    zIndex: isDragging ? 20 : 1,
  }

  return (
    <div ref={setNodeRef} style={style}>
      {children({
        dragHandle: (
          <button
            type="button"
            aria-label={dragLabel}
            title={dragLabel}
            className="inline-flex cursor-grab items-center justify-center rounded-md p-1 text-[var(--glass-text-tertiary)] touch-none transition-colors hover:text-[var(--glass-text-secondary)] active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <AppIcon name="gripVertical" className="h-3.5 w-3.5" />
          </button>
        ),
      })}
    </div>
  )
}
