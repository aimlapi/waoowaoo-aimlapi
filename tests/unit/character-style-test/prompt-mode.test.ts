import { describe, expect, it } from 'vitest'
import {
  buildCharacterStyleTestPrompt,
  buildCharacterStyleTestStyleSummary,
  normalizeCharacterStyleTestPromptMode,
} from '@/lib/character-style-test/prompt'

describe('character style test prompt modes', () => {
  it('keeps style asset mode as the default', () => {
    expect(normalizeCharacterStyleTestPromptMode(undefined)).toBe('style_asset')
    expect(normalizeCharacterStyleTestPromptMode('unknown')).toBe('style_asset')

    const prompt = buildCharacterStyleTestPrompt({
      characterRequest: '冷峻黑客',
      locale: 'zh',
    })

    expect(prompt).toContain('风格化角色资产设定图')
    expect(prompt).toContain('本次角色资产风格规范')
  })

  it('builds casting photo prompts for actor look-test sheets', () => {
    const prompt = buildCharacterStyleTestPrompt({
      characterRequest: '冷峻女黑客，黑色长风衣',
      locale: 'zh',
      promptMode: 'casting_photo',
    })

    expect(prompt).toContain('真人摄影 contact sheet')
    expect(prompt).toContain('完整候选形象包')
    expect(prompt).toContain('至少两种不同表情')
    expect(prompt).toContain('至少两套不同服装或穿搭层次')
    expect(prompt).toContain('至少两个故事相关背景或工作/生活场景')
    expect(prompt).toContain('姓名、电话、邮箱')
    expect(prompt).not.toContain('强风格化的电影概念设定')
  })

  it('adds distinct candidate direction when generating casting candidates', () => {
    const prompt = buildCharacterStyleTestPrompt({
      characterRequest: '公司新来的实习生，温柔但有距离感',
      locale: 'zh',
      promptMode: 'casting_photo',
      candidateIndex: 2,
    })

    expect(prompt).toContain('候选组方向：造型记忆点优先')
    expect(prompt).toContain('同一候选包内必须保持同一演员身份')
  })

  it('summarizes casting mode without reusing style asset wording', () => {
    expect(buildCharacterStyleTestStyleSummary({
      characterRequest: 'cold hacker',
      locale: 'en',
      promptMode: 'casting_photo',
    })).toBe('Casting and look-test photo source: cold hacker')
  })
})
