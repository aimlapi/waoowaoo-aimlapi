import { describe, expect, it } from 'vitest'
import {
  compactStoryDevelopmentForStoryboard,
  selectContinuationScreenplayTextForStoryboard,
  selectOpeningScreenplayTextForStoryboard,
} from '@/lib/screenplay-storyboard/service'

describe('selectOpeningScreenplayTextForStoryboard', () => {
  it('keeps only the opening screenplay scenes needed for the requested panel limit', () => {
    const screenplayText = [
      '# 《测试》',
      '',
      '故事说明。',
      '',
      '## 场景 1｜外景. 大排档 - 夜',
      '第一场内容。',
      '',
      '## 场景 2｜内景. 出租屋 - 夜',
      '第二场内容。',
      '',
      '## 场景 3｜外景. 街道 - 日',
      '第三场内容。',
      '',
      '## 场景 4｜内景. 办公室 - 日',
      '第四场内容。',
    ].join('\n')

    const selected = selectOpeningScreenplayTextForStoryboard({
      screenplayText,
      panelLimit: 12,
    })

    expect(selected).toContain('## 场景 1｜外景. 大排档 - 夜')
    expect(selected).toContain('## 场景 2｜内景. 出租屋 - 夜')
    expect(selected).not.toContain('## 场景 3｜外景. 街道 - 日')
    expect(selected).not.toContain('## 场景 4｜内景. 办公室 - 日')
  })

  it('does not count synopsis and character table headings as screenplay scenes', () => {
    const screenplayText = [
      '# 《测试》',
      '',
      '## 故事梗概：',
      '故事说明。',
      '',
      '## 角色表：',
      '角色说明。',
      '',
      '## 场景 1｜外景. 大排档 - 夜',
      '第一场内容。',
      '',
      '## 场景 2｜内景. 出租屋 - 夜',
      '第二场内容。',
      '',
      '## 场景 3｜外景. 街道 - 日',
      '第三场内容。',
      '',
      '## 场景 4｜内景. 办公室 - 日',
      '第四场内容。',
    ].join('\n')

    const selected = selectOpeningScreenplayTextForStoryboard({
      screenplayText,
      panelLimit: 12,
    })

    expect(selected).toContain('## 故事梗概：')
    expect(selected).toContain('## 角色表：')
    expect(selected).not.toContain('## 场景 3｜外景. 街道 - 日')
    expect(selected).not.toContain('## 场景 4｜内景. 办公室 - 日')
  })

  it('keeps the full screenplay when no markdown scene window can be derived', () => {
    const screenplayText = '没有 Markdown 二级标题的短剧本文本。'

    expect(selectOpeningScreenplayTextForStoryboard({
      screenplayText,
      panelLimit: 12,
    })).toBe(screenplayText)
  })

  it('selects the next screenplay scene window for append generation without repeating covered scenes', () => {
    const screenplayText = [
      '# 《测试》',
      '',
      '## 故事梗概：',
      '故事说明。',
      '',
      '## 场景 1｜外景. 大排档 - 夜',
      '第一场内容。',
      '',
      '## 场景 2｜内景. 出租屋 - 夜',
      '第二场内容。',
      '',
      '## 场景 3｜外景. 银行网点 - 日',
      '第三场内容。',
      '',
      '## 场景 4｜外景. 大排档 - 夜',
      '第四场内容。',
      '',
      '## 场景 5｜内景. 麻将馆 - 日',
      '第五场内容。',
    ].join('\n')

    const selected = selectContinuationScreenplayTextForStoryboard({
      screenplayText,
      panelLimit: 12,
      startAfterScreenplaySceneNumber: 2,
    })

    expect(selected).toContain('## 故事梗概：')
    expect(selected).not.toContain('## 场景 1｜外景. 大排档 - 夜')
    expect(selected).not.toContain('## 场景 2｜内景. 出租屋 - 夜')
    expect(selected).toContain('## 场景 3｜外景. 银行网点 - 日')
    expect(selected).toContain('## 场景 4｜外景. 大排档 - 夜')
    expect(selected).not.toContain('## 场景 5｜内景. 麻将馆 - 日')
  })

  it('fails append generation explicitly when the screenplay has no remaining scenes', () => {
    expect(() => selectContinuationScreenplayTextForStoryboard({
      screenplayText: [
        '# 《测试》',
        '',
        '## 场景 1｜外景. 大排档 - 夜',
        '第一场内容。',
      ].join('\n'),
      panelLimit: 12,
      startAfterScreenplaySceneNumber: 1,
    })).toThrow('SCREENPLAY_STORYBOARD_APPEND_NO_REMAINING_SCENE:1')
  })

  it('does not pass full story development json into the storyboard prompt context', () => {
    const compacted = compactStoryDevelopmentForStoryboard({
      characterProfiles: [
        {
          name: '陈志国',
          voiceProfile: '这一段很长，属于分镜阶段不需要反复发送的声音圣经。',
        },
      ],
    })

    expect(JSON.stringify(compacted)).not.toContain('声音圣经')
    expect(compacted.sourcePolicy).toContain('节省 token')
  })
})
