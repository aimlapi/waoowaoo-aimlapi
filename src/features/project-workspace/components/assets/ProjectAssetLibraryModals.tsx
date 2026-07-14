'use client'

import ImagePreviewModal from '@/components/ui/ImagePreviewModal'
import {
  CharacterCreationModal,
  CharacterEditModal,
  LocationCreationModal,
  LocationEditModal,
  PropCreationModal,
  PropEditModal,
} from '@/components/shared/assets'

interface EditingAppearanceState {
  characterId: string
  characterName: string
  appearanceId: string
  description: string
  descriptionIndex?: number
  introduction?: string | null
}

interface EditingLocationState {
  locationId: string
  locationName: string
  description: string
}

interface EditingPropState {
  propId: string
  propName: string
  summary: string
  description: string
  variantId?: string
}

interface ProjectAssetLibraryModalsProps {
  projectId: string
  onRefresh: () => void
  onClosePreview: () => void
  handleGenerateImage: (type: 'character' | 'location' | 'prop', id: string, appearanceId?: string) => Promise<void>
  handleUpdateAppearanceDescription: (newDescription: string) => Promise<void>
  handleUpdateLocationDescription: (newDescription: string) => Promise<void>
  closeEditingAppearance: () => void
  closeEditingLocation: () => void
  closeEditingProp: () => void
  closeAddCharacter: () => void
  closeAddLocation: () => void
  closeAddProp: () => void
  previewImage: string | null
  editingAppearance: EditingAppearanceState | null
  editingLocation: EditingLocationState | null
  editingProp: EditingPropState | null
  showAddCharacter: boolean
  showAddLocation: boolean
  showAddProp: boolean
}

export default function ProjectAssetLibraryModals({
  projectId,
  onRefresh,
  onClosePreview,
  handleGenerateImage,
  handleUpdateAppearanceDescription,
  handleUpdateLocationDescription,
  closeEditingAppearance,
  closeEditingLocation,
  closeEditingProp,
  closeAddCharacter,
  closeAddLocation,
  closeAddProp,
  previewImage,
  editingAppearance,
  editingLocation,
  editingProp,
  showAddCharacter,
  showAddLocation,
  showAddProp,
}: ProjectAssetLibraryModalsProps) {
  return (
    <>
      {previewImage && <ImagePreviewModal imageUrl={previewImage} onClose={onClosePreview} />}

      {editingAppearance && (
        <CharacterEditModal
          characterId={editingAppearance.characterId}
          characterName={editingAppearance.characterName}
          appearanceId={editingAppearance.appearanceId}
          description={editingAppearance.description}
          descriptionIndex={editingAppearance.descriptionIndex}
          introduction={editingAppearance.introduction}
          projectId={projectId}
          onClose={closeEditingAppearance}
          onSave={(characterId, appearanceId) => void handleGenerateImage('character', characterId, appearanceId)}
          onUpdate={handleUpdateAppearanceDescription}
        />
      )}

      {editingLocation && (
        <LocationEditModal
          locationId={editingLocation.locationId}
          locationName={editingLocation.locationName}
          description={editingLocation.description}
          projectId={projectId}
          onClose={closeEditingLocation}
          onSave={(locationId) => void handleGenerateImage('location', locationId)}
          onUpdate={handleUpdateLocationDescription}
        />
      )}

      {showAddCharacter && (
        <CharacterCreationModal
          projectId={projectId}
          onClose={closeAddCharacter}
          onSuccess={() => {
            closeAddCharacter()
            onRefresh()
          }}
        />
      )}

      {showAddLocation && (
        <LocationCreationModal
          projectId={projectId}
          onClose={closeAddLocation}
          onSuccess={() => {
            closeAddLocation()
            onRefresh()
          }}
        />
      )}

      {showAddProp && (
        <PropCreationModal
          projectId={projectId}
          onClose={closeAddProp}
          onSuccess={() => {
            closeAddProp()
            onRefresh()
          }}
        />
      )}

      {editingProp && (
        <PropEditModal
          propId={editingProp.propId}
          propName={editingProp.propName}
          summary={editingProp.summary}
          description={editingProp.description}
          variantId={editingProp.variantId}
          projectId={projectId}
          onClose={closeEditingProp}
          onRefresh={onRefresh}
        />
      )}

    </>
  )
}
