import { describe, expect, it } from 'vitest'
import type { NovelProjectData, NumberedReferenceImage } from '@/lib/workers/handlers/image-task-handler-shared'
import {
  buildStoryboardStillPrompt,
  buildStoryboardStillPromptFacts,
  sanitizePanelForStillImagePrompt,
  type StoryboardStillPromptPanel,
} from '@/lib/workers/handlers/panel-still-prompt-builder'

const projectData: NovelProjectData = {
  videoRatio: '16:9',
  characters: [{
    id: 'character-hero',
    name: 'Hero',
    appearances: [{
      id: 'appearance-hero',
      appearanceIndex: 0,
      changeReason: 'primary',
      description: 'black hair, grey coat, tense posture',
      descriptions: null,
      imageUrls: null,
      imageUrl: null,
      selectedIndex: null,
    }],
  }],
  locations: [{
    name: 'Old Town',
    images: [{
      isSelected: true,
      imageUrl: 'images/location.png',
      imageIndex: 0,
      description: '空间板槽位：窗在右侧，门在左侧。',
      spatialProfileJson: {
        sceneSummary: 'rainy old street with a stone wall and distant storefronts',
        anchors: [{
          id: 'stone_wall',
          label: 'stone wall',
          screenArea: 'screen left',
          depthLayer: 'midground',
          spatialRelations: ['street continues behind it'],
        }],
        depthLayout: {
          foreground: 'wet pavement',
          midground: 'stone wall',
          background: 'distant storefronts',
        },
        lightingDirection: 'streetlight from upper right',
      },
    }],
  }],
  props: [{
    id: 'prop-badge',
    name: 'Golden eagle badge',
    assetKind: 'prop',
    selectedImageId: 'prop-badge-image',
    images: [{
      id: 'prop-badge-image',
      imageUrl: 'images/badge.png',
      imageIndex: 0,
      description: 'small worn golden eagle badge with scratched metal edges',
      isSelected: true,
    }],
  }],
}

const referenceImages: readonly NumberedReferenceImage[] = [
  { image_no: '图 1', role: 'character', name: 'Hero', appearance: 'primary' },
  { image_no: '图 2', role: 'location', name: 'Old Town' },
]

const panel: StoryboardStillPromptPanel = {
  id: 'panel-1',
  shotType: 'medium shot',
  cameraMove: '极简横向轨道，镜头从左向右推进，duration 3 fps 24',
  description: 'Hero grips a golden eagle badge while red infrared scan lines cross his face.',
  imagePrompt: 'window on right side. camera pushes forward. duplicate action text should not be used.',
  videoPrompt: 'video_prompt: camera tracks forward for three seconds',
  location: 'Old Town',
  characters: JSON.stringify([{ characterId: 'character-hero', name: 'Hero', appearanceId: 'appearance-hero', appearance: 'primary' }]),
  props: JSON.stringify(['Golden eagle badge']),
  srtSegment: 'Hero grips a golden eagle badge while red infrared scan lines cross his face.',
  photographyRules: JSON.stringify({
    sceneZone: {
      sceneZoneId: 'zone-wall',
      name: 'stone wall corner',
      overallPosition: 'right back corner beside the stone wall',
      fixedAnchors: ['stone wall', 'wet pavement'],
    },
    omittedSceneAssets: [{
      name: 'Villain',
      kind: 'character',
      reason: 'outside this frame',
    }],
    shotBlocking: {
      subjectPosition: 'Hero at screen center',
      cameraPosition: 'static low angle',
      screenComposition: 'Hero framed against the stone wall, camera tracks forward through the corridor.',
      characterPlacements: [{
        characterName: 'Hero',
        subjectPosition: 'screen center',
        facing: 'screen right',
        eyeline: 'toward unseen threat',
      }],
    },
    cameraPlan: {
      shotScale: 'medium shot',
      composition: 'balanced close two-shot. camera tracks forward through the corridor.',
      cameraPosition: 'static low angle',
      axisAndEyeline: 'Hero looks screen right',
    },
  }),
  actingNotes: 'tense but controlled',
}

function countOccurrences(text: string, value: string): number {
  return text.split(value).length - 1
}

describe('panel-still-prompt-builder', () => {
  it('builds a still-frame prompt without video, movement, duration, or duplicate source text', () => {
    const facts = buildStoryboardStillPromptFacts({
      panel,
      projectData,
      referenceImagesMap: referenceImages,
    })
    const prompt = buildStoryboardStillPrompt({
      aspectRatio: '16:9',
      facts,
    })

    expect(prompt).toContain('Generate one still storyboard frame')
    expect(prompt).toContain('SHOT_PRIORITY')
    expect(prompt).toContain('LOCATION_ZONE')
    expect(prompt).toContain('GLOBAL_SCENE_LOCK')
    expect(prompt).toContain('STILL_FRAME')
    expect(prompt).toContain('medium shot')
    expect(prompt).toContain('Hero grips a golden eagle badge')
    expect(prompt).toContain('Golden eagle badge')
    expect(prompt).toContain('small worn golden eagle badge')
    expect(prompt).toContain('Do not show character \\"Villain\\"')
    expect(prompt).not.toContain('video_prompt')
    expect(prompt).not.toContain('横向轨道')
    expect(prompt).not.toContain('camera pushes forward')
    expect(prompt).not.toContain('camera tracks forward')
    expect(prompt).not.toContain('duration 3')
    expect(prompt).not.toContain('fps 24')
    expect(prompt).not.toContain('window on right side')
    expect(prompt).not.toContain('空间板槽位')
    expect(countOccurrences(prompt, 'Hero grips a golden eagle badge while red infrared scan lines cross his face.')).toBe(1)
  })

  it('sanitizes still panel facts from description and static camera fields only', () => {
    const sanitized = sanitizePanelForStillImagePrompt(panel)

    expect(sanitized.shotScale).toBe('medium shot')
    expect(sanitized.staticFraming).toContain('balanced close two-shot')
    expect(sanitized.staticFraming).toContain('static low angle')
    expect(sanitized.staticFraming).not.toContain('tracks forward')
    expect(sanitized.action).toBe('Hero grips a golden eagle badge while red infrared scan lines cross his face.')
    expect(sanitized.propNames).toEqual(['Golden eagle badge'])
    expect(sanitized.shotPriority).toEqual(expect.arrayContaining([
      expect.stringContaining('Visible props must be present and readable: Golden eagle badge.'),
      expect.stringContaining('Freeze any action wording'),
    ]))
  })
})
