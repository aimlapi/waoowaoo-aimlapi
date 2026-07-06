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
  { image_no: '图 4', role: 'prop', name: '粉红药液高脚杯' },
  { image_no: '图 5', role: 'prop', name: '金色飞鹰徽章' },
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
  props: [
    {
      name: '粉红药液高脚杯',
      summary: '透明高脚杯，杯中有粉红色药液。',
      images: [],
    },
    {
      name: '金色飞鹰徽章',
      summary: '顾严衣襟上的小型金色飞鹰徽章。',
      images: [],
    },
    {
      name: '心动检测脖环',
      summary: '金属脖环，带红色电子倒计时。',
      images: [],
    },
  ],
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
    props: JSON.stringify(['粉红药液高脚杯', '焦痕纸质菜单']),
    srtSegment: '焦痕纸质菜单保持在桌面中央偏前区域。',
    photographyRules: JSON.stringify({
      sceneZone: {
        sceneZoneId: 'zone-table-left-front',
        name: '黑金餐桌左前局部',
        overallPosition: '只拍桌面左前角，不重建整间餐厅。',
        fixedAnchors: ['黑金桌面左前边缘', '杯脚阴影'],
        spatialHardLocks: {
          anchorLayout: ['黑金桌面左前边缘始终位于画面下方'],
          screenDirectionLocks: ['杯脚阴影始终落在杯子右后侧'],
          forbiddenSpatialChanges: ['不得把桌面左前角镜像成右前角'],
        },
      },
      shotBlocking: {
        subjectPosition: '粉红药液高脚杯位于画面中央偏左。',
        cameraPosition: '低机位贴近桌面。',
        screenComposition: '只保留桌面左前角和杯子。',
      },
    }),
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
    props: JSON.stringify(['金色飞鹰徽章']),
    srtSegment: null,
    photographyRules: JSON.stringify({
      sceneZone: {
        sceneZoneId: 'zone-table-two-shot',
        name: '餐桌对峙局部',
        overallPosition: '只拍同一张餐桌两侧人物关系。',
        fixedAnchors: ['黑金餐桌边缘', '右后方霓虹卡座'],
        spatialHardLocks: {
          anchorLayout: ['黑金餐桌边缘始终横贯画面下方', '右后方霓虹卡座始终在画面右后景'],
          screenDirectionLocks: ['顾严保持在画面左侧，施雨保持在画面右侧'],
          forbiddenSpatialChanges: ['不得镜像翻转顾严和施雨的左右关系', '不得把右后方霓虹卡座移到左后景'],
        },
      },
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
    srtSegment: null,
    props: JSON.stringify(['心动检测脖环']),
    photographyRules: JSON.stringify({
      sceneZone: {
        sceneZoneId: 'zone-gu-yan-neck',
        name: '顾严颈部特写区',
        overallPosition: '只拍顾严颈部与衣领局部。',
        fixedAnchors: ['灰色衣领', '红色倒计时光'],
        spatialHardLocks: {
          anchorLayout: ['灰色衣领始终包围颈部下缘'],
          screenDirectionLocks: ['红色倒计时光始终贴近颈部正前方'],
          forbiddenSpatialChanges: ['不得把颈环改成背景灯或衣服装饰'],
        },
      },
      omittedSceneAssets: [{
        name: '施雨',
        kind: 'character',
        reason: '颈部特写裁掉对面人物。',
      }],
    }),
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
    props: JSON.stringify(['金色飞鹰徽章']),
    srtSegment: null,
    photographyRules: JSON.stringify({
      sceneZone: {
        sceneZoneId: 'zone-table-two-shot',
        name: '餐桌对峙局部',
        overallPosition: '只拍同一张餐桌两侧人物关系。',
        fixedAnchors: ['黑金餐桌边缘', '右后方霓虹卡座'],
        spatialHardLocks: {
          anchorLayout: ['黑金餐桌边缘始终横贯画面下方', '右后方霓虹卡座始终在画面右后景'],
          screenDirectionLocks: ['顾严保持在画面左侧，施雨保持在画面右侧'],
          forbiddenSpatialChanges: ['不得镜像翻转顾严和施雨的左右关系', '不得把右后方霓虹卡座移到左后景'],
        },
      },
    }),
    actingNotes: null,
  },
]

function countSection(prompt: string, section: string): number {
  return (prompt.match(new RegExp(`^${section}$`, 'gm')) || []).length
}

describe('panel-grid-prompt-builder', () => {
  it('builds grid prompt from per-panel still facts without the old graph inference chain', () => {
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

    expect(countSection(prompt, 'REFERENCE_IMAGES')).toBe(1)
    expect(countSection(prompt, 'CHARACTER_GRAPH')).toBe(4)
    expect(countSection(prompt, 'PROP_GRAPH')).toBe(4)
    expect(countSection(prompt, 'LOCATION_ZONE')).toBe(4)
    expect(countSection(prompt, 'SPATIAL_HARD_LOCKS')).toBe(4)
    expect(countSection(prompt, 'STILL_FRAME')).toBe(4)
    expect(prompt).toContain('GRID_CONTINUITY_LOCKS')
    expect(prompt).toContain('顾严保持在画面左侧，施雨保持在画面右侧')
    expect(prompt).toContain('不得镜像翻转顾严和施雨的左右关系')
    expect(prompt).not.toContain('SCENE_GRAPH')
    expect(prompt).not.toContain('BLOCKING_STATE')
    expect(prompt).not.toContain('shot_delta')
    expect(prompt).not.toContain('pink_wine_glass')
    expect(cellText).not.toContain('四宫格空间板槽位')
    expect(cellText).not.toContain('纵向延伸的西餐厅长廊')
    expect(cellText).not.toContain('door on the left')
    expect(prompt).not.toContain('video_prompt forbidden')
    expect(prompt).not.toContain('track shot video movement')
    expect(prompt).not.toContain('horizontal track')
    expect(prompt).not.toContain('横向轨道')
    expect(cellText).not.toContain('运镜')
    expect(prompt).not.toContain('空间板槽位')
    expect(prompt).toContain('Visible props must be present and readable: 粉红药液高脚杯, 焦痕纸质菜单.')
    expect(prompt).toContain('"source": "panel.props"')
    expect(prompt).toContain('"zone_name": "黑金餐桌左前局部"')
    expect(prompt).toContain('Do not show character \\"施雨\\" because: 颈部特写裁掉对面人物。')
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
