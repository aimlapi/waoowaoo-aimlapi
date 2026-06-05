import { Prisma } from '@prisma/client'
import { DEFAULT_GROUP_VIDEO_MODEL } from '@/lib/ai-exec/video-defaults'
import { prisma } from '@/lib/prisma'

export async function createDevStoryboardProjectShell(input: {
  readonly userId: string
  readonly name: string
  readonly description: string
  readonly videoRatio: string
  readonly artStyle: string
}) {
  const userPreference = await prisma.userPreference.findUnique({ where: { userId: input.userId } })
  const projectData: Prisma.ProjectUncheckedCreateInput = {
    name: input.name,
    description: input.description,
    userId: input.userId,
    ...(userPreference
      ? {
          analysisModel: userPreference.analysisModel,
          characterModel: userPreference.characterModel,
          locationModel: userPreference.locationModel,
          storyboardModel: userPreference.storyboardModel,
          editModel: userPreference.editModel,
          videoModel: userPreference.videoModel,
          singleShotVideoModel: userPreference.videoModel,
          sequenceVideoModel: DEFAULT_GROUP_VIDEO_MODEL,
          audioModel: userPreference.audioModel,
          musicModel: userPreference.musicModel,
          videoResolution: userPreference.videoResolution,
          imageResolution: userPreference.imageResolution,
        }
      : {}),
    videoRatio: input.videoRatio,
    artStyle: input.artStyle,
    visualStylePresetSource: 'system',
    visualStylePresetId: input.artStyle,
  }
  return await prisma.project.create({ data: projectData })
}
