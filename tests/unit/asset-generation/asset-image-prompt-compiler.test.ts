import { describe, expect, it } from 'vitest'
import { compileAssetImagePrompt } from '@/lib/asset-generation'

describe('asset image prompt compiler', () => {
  it('combines stable identity with the adopted non-photographic direction and fixed format', () => {
    const prompt = compileAssetImagePrompt({
      kind: 'character',
      stableDescription: '短发青年，窄肩，深色立领外套，黑色布鞋。',
      creativeDirection: {
        styleSummary: '定格木偶民俗悬疑',
        rawUserStyle: '不要真人',
        visual: {
          renderMedium: 'stop_motion',
          realismLevel: 'highly_stylized',
          crossMediaStyle: '手工木偶、可见接缝、矿物颜料与粗粝布料。',
          visualStyle: '有限色彩和夸张剪影。',
          assetImageStyle: {
            lighting: '柔和棚拍侧光。',
            texture: '木纹、布纹和手工涂色痕迹。',
            renderingRules: '角色必须保持手工木偶比例与关节结构。',
          },
        },
        narrative: '通过物件变化逐步揭示规则。',
        directing: '稳定观察，动作完成后再切。',
        editing: '因果硬切。',
        sound: '强调木质关节与布料摩擦。',
        assetPolicy: '所有角色都保持同一木偶制作体系。',
      },
      locale: 'zh-CN',
    })

    expect(prompt).toContain('【角色稳定身份】短发青年')
    expect(prompt).toContain('【权威渲染媒介】stop_motion')
    expect(prompt).toContain('禁止把该设计转成照片、真人实拍剧照')
    expect(prompt).toContain('【角色资产图固定版式】')
  })
})
