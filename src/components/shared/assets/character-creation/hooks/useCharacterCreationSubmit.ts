'use client'

import { useCallback, useState } from 'react'
import { useTranslations } from 'next-intl'
import { shouldShowError } from '@/lib/error-utils'
import {
  useAiCreateProjectCharacter,
  useCreateProjectCharacter,
  useGenerateProjectCharacterFromReference,
  useGenerateProjectCharacterImage,
  useCreateProjectCharacterAppearance,
  useExtractProjectReferenceCharacterDescription,
  useUploadProjectTempMedia,
} from '@/lib/query/hooks'
import { useImageGenerationCount } from '@/lib/image-generation/use-image-generation-count'

type CreatedCharacterResponse = {
  character?: {
    id: string
    appearances?: Array<{
      id: string
      appearanceIndex: number
    }>
  }
}

interface UseCharacterCreationSubmitParams {
  projectId: string
  name: string
  description: string
  aiInstruction: string
  referenceImagesBase64: string[]
  referenceSubMode: 'direct' | 'extract'
  isSubAppearance: boolean
  selectedCharacterId: string
  changeReason: string
  setDescription: (value: string) => void
  setAiInstruction: (value: string) => void
  onSuccess: () => void
  onClose: () => void
}

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

export function useCharacterCreationSubmit({
  projectId,
  name,
  description,
  aiInstruction,
  referenceImagesBase64,
  referenceSubMode,
  isSubAppearance,
  selectedCharacterId,
  changeReason,
  setDescription,
  setAiInstruction,
  onSuccess,
  onClose,
}: UseCharacterCreationSubmitParams) {
  const t = useTranslations('assetModal')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAiDesigning, setIsAiDesigning] = useState(false)
  const [isExtracting, setIsExtracting] = useState(false)

  const uploadProjectTemp = useUploadProjectTempMedia(projectId)
  const aiCreateProjectCharacter = useAiCreateProjectCharacter(projectId)
  const extractProjectDescription = useExtractProjectReferenceCharacterDescription(projectId)
  const createProjectCharacter = useCreateProjectCharacter(projectId)
  const generateProjectCharacterFromReference = useGenerateProjectCharacterFromReference(projectId)
  const generateProjectCharacterImage = useGenerateProjectCharacterImage(projectId)
  const createProjectAppearance = useCreateProjectCharacterAppearance(projectId)
  const {
    count: characterGenerationCount,
    setCount: setCharacterGenerationCount,
  } = useImageGenerationCount('character')
  const {
    count: referenceCharacterGenerationCount,
    setCount: setReferenceCharacterGenerationCount,
  } = useImageGenerationCount('reference-to-character')

  const uploadReferenceImages = useCallback(async () => {
    return Promise.all(
      referenceImagesBase64.map(async (base64) => {
        const data = await uploadProjectTemp.mutateAsync({ imageBase64: base64 })
        if (!data.url) throw new Error(t('errors.uploadFailed'))
        return data.url
      }),
    )
  }, [referenceImagesBase64, t, uploadProjectTemp])

  const handleExtractDescription = useCallback(async () => {
    if (referenceImagesBase64.length === 0) return

    try {
      setIsExtracting(true)
      const referenceImageUrls = await uploadReferenceImages()
      const result = await extractProjectDescription.mutateAsync(referenceImageUrls)
      if (result?.description) {
        setDescription(result.description)
      }
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.extractDescriptionFailed')))
      }
    } finally {
      setIsExtracting(false)
    }
  }, [
    extractProjectDescription,
    referenceImagesBase64.length,
    setDescription,
    t,
    uploadReferenceImages,
  ])

  const handleCreateWithReference = useCallback(async () => {
    if (!name.trim() || referenceImagesBase64.length === 0) return

    try {
      setIsSubmitting(true)
      const referenceImageUrls = await uploadReferenceImages()

      let finalDescription = description.trim()
      if (referenceSubMode === 'extract') {
        const result = await extractProjectDescription.mutateAsync(referenceImageUrls)
        finalDescription = result?.description || finalDescription
      }

      const created = await createProjectCharacter.mutateAsync({
        name: name.trim(),
        description: finalDescription || t('character.defaultDescription', { name: name.trim() }),
      })
      const character = created.character
      const appearance = character?.appearances?.find((item) => item.appearanceIndex === 0)
      if (!character?.id || !appearance?.id) {
        throw new Error('PROJECT_CHARACTER_PRIMARY_APPEARANCE_MISSING')
      }
      await generateProjectCharacterFromReference.mutateAsync({
        referenceImageUrls,
        characterName: name.trim(),
        characterId: character.id,
        appearanceId: appearance.id,
        customDescription: referenceSubMode === 'extract' ? finalDescription : undefined,
        count: referenceCharacterGenerationCount,
      })

      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    createProjectCharacter,
    description,
    extractProjectDescription,
    generateProjectCharacterFromReference,
    name,
    onClose,
    onSuccess,
    referenceCharacterGenerationCount,
    referenceImagesBase64.length,
    referenceSubMode,
    t,
    uploadReferenceImages,
  ])

  const handleAiDesign = useCallback(async () => {
    if (!aiInstruction.trim()) return

    try {
      setIsAiDesigning(true)
      const result = await aiCreateProjectCharacter.mutateAsync({ userInstruction: aiInstruction })

      if (result?.prompt) {
        setDescription(result.prompt)
        setAiInstruction('')
      }
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.aiDesignFailed')))
      }
    } finally {
      setIsAiDesigning(false)
    }
  }, [aiCreateProjectCharacter, aiInstruction, setAiInstruction, setDescription, t])

  const handleSubmit = useCallback(async () => {
    if (isSubAppearance) {
      if (!selectedCharacterId.trim() || !changeReason.trim() || !description.trim()) return
      try {
        setIsSubmitting(true)
        await createProjectAppearance.mutateAsync({
          characterId: selectedCharacterId,
          changeReason: changeReason.trim(),
          description: description.trim(),
        })
        onSuccess()
        onClose()
      } catch (error: unknown) {
        if (shouldShowError(error)) {
          alert(getErrorMessage(error, t('errors.addSubAppearanceFailed')))
        }
      } finally {
        setIsSubmitting(false)
      }
      return
    }

    if (!name.trim() || !description.trim()) return
    try {
      setIsSubmitting(true)
      await createProjectCharacter.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      })
      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    changeReason,
    createProjectAppearance,
    createProjectCharacter,
    description,
    isSubAppearance,
    name,
    onClose,
    onSuccess,
    selectedCharacterId,
    t,
  ])

  const handleSubmitAndGenerate = useCallback(async () => {
    if (isSubAppearance) {
      await handleSubmit()
      return
    }

    if (!name.trim() || !description.trim()) return

    try {
      setIsSubmitting(true)

      const result = await createProjectCharacter.mutateAsync({
        name: name.trim(),
        description: description.trim(),
      }) as CreatedCharacterResponse
      const createdCharacterId = result.character?.id
      const createdAppearanceId = result.character?.appearances?.[0]?.id
      if (!createdCharacterId || !createdAppearanceId) {
        throw new Error(t('errors.createFailed'))
      }
      await generateProjectCharacterImage.mutateAsync({
        characterId: createdCharacterId,
        appearanceId: createdAppearanceId,
        count: characterGenerationCount,
      })

      onSuccess()
      onClose()
    } catch (error: unknown) {
      if (shouldShowError(error)) {
        alert(getErrorMessage(error, t('errors.createFailed')))
      }
    } finally {
      setIsSubmitting(false)
    }
  }, [
    characterGenerationCount,
    createProjectCharacter,
    description,
    generateProjectCharacterImage,
    handleSubmit,
    isSubAppearance,
    name,
    onClose,
    onSuccess,
    t,
  ])

  return {
    isSubmitting,
    isAiDesigning,
    isExtracting,
    characterGenerationCount,
    setCharacterGenerationCount,
    referenceCharacterGenerationCount,
    setReferenceCharacterGenerationCount,
    handleExtractDescription,
    handleCreateWithReference,
    handleAiDesign,
    handleSubmit,
    handleSubmitAndGenerate,
  }
}
