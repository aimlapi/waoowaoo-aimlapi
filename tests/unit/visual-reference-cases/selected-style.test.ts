import { describe, expect, it } from 'vitest'
import {
  extractReusableVisualReferenceStylePrompt,
  renderSelectedVisualReferenceStylePromptBlock,
} from '@/lib/visual-reference-cases/selected-style'

describe('selected visual reference style prompt block', () => {
  it('keeps reusable style language while dropping scene-specific case instructions', () => {
    const rawPrompt = [
      '维度组合：定格动画；粘土+布艺；冷色调低饱和。',
      '必须严格使用视觉方向里描述的共享场景，保留同一批人物、人物站位、道具摆法。',
      '风格处理：棚拍定格质感，粘土指痕、布料缝线清晰。',
    ].join(' ')

    expect(extractReusableVisualReferenceStylePrompt(rawPrompt)).toContain('定格动画')
    expect(extractReusableVisualReferenceStylePrompt(rawPrompt)).toContain('棚拍定格质感')
    expect(extractReusableVisualReferenceStylePrompt(rawPrompt)).not.toContain('保留同一批人物')
    expect(extractReusableVisualReferenceStylePrompt(rawPrompt)).not.toContain('人物站位')

    const block = renderSelectedVisualReferenceStylePromptBlock({
      locale: 'zh',
      style: {
        id: 'style-1',
        title: '动画向｜定格巷口',
        description: '定格动画，粘土与布艺，低饱和冷色。',
        prompt: rawPrompt,
        imageUrl: '/m/style-1',
      },
    })

    expect(block).toContain('选中风格描述')
    expect(block).toContain('不要沿用案例提示词里的共享场景')
    expect(block).not.toContain('可复用风格语言摘要')
    expect(block).not.toContain('棚拍定格质感')
    expect(block).not.toContain('保留同一批人物、人物站位、道具摆法')
  })
})
