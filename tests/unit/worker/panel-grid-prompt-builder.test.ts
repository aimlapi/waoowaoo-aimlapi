import { describe, expect, it } from 'vitest'
import { buildZenStyleBibleFixture } from '../../fixtures/edit-script-style-bible'
import type { NovelProjectData, NumberedReferenceImage } from '@/lib/workers/handlers/image-task-handler-shared'
import {
  buildStoryboardGridPrompt,
  buildStoryboardGridPromptFacts,
  type StoryboardGridPromptPanel,
} from '@/lib/workers/handlers/panel-grid-prompt-builder'

const referenceImages: readonly NumberedReferenceImage[] = [
  { image_no: '图 1', role: 'location', name: '“心动法则”西餐厅' },
  { image_no: '图 2', role: 'character', name: '施雨', appearance: 'primary' },
  { image_no: '图 3', role: 'character', name: '顾严', appearance: 'primary' },
]

const projectData: NovelProjectData = {
  videoRatio: '16:9',
  characters: [
    {
      id: 'character-shi-yu',
      name: '施雨',
      appearances: [{
        id: 'appearance-shi-yu',
        appearanceIndex: 0,
        changeReason: 'primary',
        description: 'white makeup, red dress, controlled plastic smile',
        descriptions: null,
        imageUrls: null,
        imageUrl: null,
        selectedIndex: null,
      }],
    },
    {
      id: 'character-gu-yan',
      name: '顾严',
      appearances: [{
        id: 'appearance-gu-yan',
        appearanceIndex: 0,
        changeReason: 'primary',
        description: 'dark hair, grey coat, nervous posture',
        descriptions: null,
        imageUrls: null,
        imageUrl: null,
        selectedIndex: null,
      }],
    },
  ],
  locations: [{
    name: '“心动法则”西餐厅',
    images: [{
      isSelected: true,
      imageUrl: 'images/location.png',
      imageIndex: 0,
      description: '四宫格空间板槽位：错误说明，窗在右侧，门在左侧。',
      spatialProfileJson: {
        sceneSummary: '纵向延伸的西餐厅长廊，尽头为整面落地窗，右侧为霓虹卡座。',
        anchors: [
          {
            id: 'black_gold_table_anchor',
            label: '前景黑金餐桌',
            screenArea: '画面中下方',
            depthLayer: '前景',
            spatialRelations: ['桌面中央偏前摆放焦痕菜单'],
          },
          {
            id: 'rear_window_anchor',
            label: '背景落地玻璃窗',
            screenArea: '画面正后方',
            depthLayer: '背景',
            spatialRelations: ['玻璃窗位于长廊尽头'],
          },
        ],
        depthLayout: {
          foreground: '黑金餐桌与菜单',
          midground: '两侧卡座与人物活动区',
          background: '长廊尽头落地窗',
        },
        lightingDirection: '金色顶光与右侧霓虹环境光共同照亮空间',
      },
    }],
  }],
}

const panels: readonly StoryboardGridPromptPanel[] = [
  {
    id: 'panel-1',
    storyboardId: 'storyboard-1',
    panelIndex: 0,
    shotType: 'close-up',
    cameraMove: 'static',
    description: '粉红药液高脚杯在黑金餐桌左前区域发光。窗在右侧。',
    imagePrompt: 'The room layout has a door on the left. Raises the glass.',
    videoPrompt: 'video_prompt forbidden duration 3 fps 24',
    location: '“心动法则”西餐厅',
    characters: JSON.stringify([]),
    props: null,
    srtSegment: '焦痕纸质菜单保持在桌面中央偏前区域。',
    photographyRules: null,
    actingNotes: null,
  },
  {
    id: 'panel-2',
    storyboardId: 'storyboard-1',
    panelIndex: 1,
    shotType: 'medium shot',
    cameraMove: 'track shot video movement should be compact',
    description: '顾严与施雨隔着同一张黑金餐桌面对面。顾严擦拭金色飞鹰徽章，施雨露出塑料假笑，红外雷达格栅线扫过两人面部。',
    imagePrompt: 'window on right side. Two characters face each other.',
    videoPrompt: null,
    location: '“心动法则”西餐厅',
    characters: JSON.stringify([
      { characterId: 'character-gu-yan', name: '顾严', appearanceId: 'appearance-gu-yan', appearance: 'primary' },
      { characterId: 'character-shi-yu', name: '施雨', appearanceId: 'appearance-shi-yu', appearance: 'primary' },
    ]),
    props: null,
    srtSegment: null,
    photographyRules: JSON.stringify({
      cameraPlan: {
        shotScale: 'medium shot',
        composition: '房间布局：窗在右侧。严格对称构图。',
        shotBlocking: {
          absolutePosition: '窗在右侧',
          relativePosition: '门在左侧',
          screenPosition: '顾严左侧，施雨右侧',
        },
        continuityIn: '从右侧窗户切入',
        continuityOut: '向左侧门切出',
      },
    }),
    actingNotes: null,
  },
  {
    id: 'panel-3',
    storyboardId: 'storyboard-1',
    panelIndex: 2,
    shotType: 'close-up',
    cameraMove: 'static',
    description: '顾严的心动检测脖环收紧，红色倒计时发光。',
    imagePrompt: null,
    videoPrompt: null,
    location: '“心动法则”西餐厅',
    characters: JSON.stringify([
      { characterId: 'character-gu-yan', name: '顾严', appearanceId: 'appearance-gu-yan', appearance: 'primary' },
    ]),
    props: null,
    srtSegment: null,
    photographyRules: null,
    actingNotes: null,
  },
  {
    id: 'panel-4',
    storyboardId: 'storyboard-1',
    panelIndex: 3,
    shotType: 'medium close-up',
    cameraMove: 'static',
    description: '施雨逼近索吻，顾严后撤，但两人仍在同一 blocking 内局部移动。',
    imagePrompt: null,
    videoPrompt: null,
    location: '“心动法则”西餐厅',
    characters: JSON.stringify([
      { characterId: 'character-gu-yan', name: '顾严', appearanceId: 'appearance-gu-yan', appearance: 'primary' },
      { characterId: 'character-shi-yu', name: '施雨', appearanceId: 'appearance-shi-yu', appearance: 'primary' },
    ]),
    props: null,
    srtSegment: null,
    photographyRules: null,
    actingNotes: null,
  },
]

function countSection(prompt: string, section: string): number {
  return (prompt.match(new RegExp(`^${section}$`, 'gm')) || []).length
}

describe('panel-grid-prompt-builder', () => {
  it('builds compact graph-based storyboard grid prompt with stable cell mapping', () => {
    const facts = buildStoryboardGridPromptFacts({
      panels,
      projectData,
      referenceImagesMap: referenceImages,
      sourceVideoBlockId: 'edit-script-1:videoBlock:1',
      styleBible: buildZenStyleBibleFixture(),
    })
    const prompt = buildStoryboardGridPrompt({
      aspectRatio: '16:9',
      facts,
    })
    const cellText = prompt.slice(prompt.indexOf('CELL 1 TOP_LEFT'), prompt.indexOf('NEGATIVE'))

    expect(countSection(prompt, 'SCENE_GRAPH')).toBe(1)
    expect(countSection(prompt, 'BLOCKING_STATE')).toBe(1)
    expect(countSection(prompt, 'CHARACTER_GRAPH')).toBe(1)
    expect(countSection(prompt, 'PROP_GRAPH')).toBe(1)
    expect(cellText).not.toContain('四宫格空间板槽位')
    expect(cellText).not.toContain('纵向延伸的西餐厅长廊')
    expect(cellText).not.toContain('door on the left')
    expect(prompt).not.toContain('video_prompt forbidden')
    expect(prompt).not.toContain('track shot video movement')
    expect(prompt).not.toContain('horizontal track')
    expect(prompt).not.toContain('横向轨道')
    expect(prompt).not.toContain('运镜')
    expect(prompt).not.toContain('空间板槽位')
    expect(prompt).toContain('do not create a second pink liquid wine glass unless a panel explicitly asks for two')
    expect(prompt).toContain('Gu Yan / 顾严 remains screen left; Shi Yu / 施雨 remains screen right')
    expect(prompt).toContain('central 70% safe area')
    expect(prompt).toContain('Use inner padding')
    expect(prompt).toContain('No subject, limb, prop, light beam, or divider crosses cell boundaries')
    expect(facts.grid.cells.map((cell) => cell.cell_position)).toEqual([
      'top_left',
      'top_right',
      'bottom_left',
      'bottom_right',
    ])
    expect(facts.grid.cells.map((cell) => cell.panel_id)).toEqual([
      'panel-1',
      'panel-2',
      'panel-3',
      'panel-4',
    ])
  })
})
