import { beforeEach, describe, expect, it, vi } from 'vitest'

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({ text: buildValidPlanJson() })),
}))

vi.mock('@/lib/ai-exec/engine', () => aiExecMock)

import {
  generateCharacterCastingPlanDocument,
  generateCharacterCastingPlans,
  normalizeCharacterCastingPlanDocument,
  normalizeCharacterCastingPlans,
  renderCharacterCastingPlanPromptBlock,
} from '@/lib/character-casting/casting-plan'

type AiTextStepCall = {
  readonly action: string
  readonly model: string
  readonly projectId?: string
  readonly messages: ReadonlyArray<{
    readonly content: string
  }>
}

function buildValidPlanJson(): string {
  return JSON.stringify({
    characterDNA: {
      ageRange: '五十到六十岁',
      gender: '男性',
      ethnicityRegion: '中国北方县城与旧城巷口气质',
      socialClass: '底层小市民，长期贫困但突然暴富',
      occupation: '无稳定职业，靠临时活和人情关系生活',
      temperament: '局促、虚荣、长期被看轻后渴望被承认',
      coreWound: '一生被贫穷和无后压低尊严',
      desireNeed: '想用钱证明自己还能被需要',
      narrativeFunction: '推动荒诞求子事件并暴露乡土欲望与羞耻',
      bodyEnergy: '被生活压弯但暴富后强撑体面',
      styleCompatibility: '定格动画、粘土与布艺材质、冷色旧巷',
    },
    castingDirections: [
      {
        id: 'A',
        directionName: 'A 生活真实路线',
        interpretationLogic: '把荒诞欲望压进最普通的县城旧人身上。',
        faceFamily: '圆短脸、松软面部组织、低攻击性普通人脸',
        bodyType: '矮瘦塌肩',
        emotionalTemperature: '怯懦、迟疑、带一点讨好',
        screenPresence: '像街角常被忽略的人，存在感低但可信',
        appearanceDescriptor: {
          faceShape: '圆短脸，下庭短，脸颊松弛',
          boneStructure: '颧骨低平，下颌圆钝，额头窄',
          eyes: '眼距略宽，松弛眼皮，眼神闪躲',
          nose: '短鼻梁，鼻头圆钝',
          lips: '薄而内收，嘴角下垂',
          skinTexture: '蜡黄粗糙，有旧斑和细纹',
          hairstyle: '稀疏地中海，发丝贴头皮',
          bodyType: '矮瘦塌肩，四肢干细',
          posture: '背微驼，手臂贴身，站姿拘谨',
          wardrobe: '洗旧夹克、起球毛衣、磨损布鞋',
          visualKeywords: ['普通市井', '旧夹克袖口', '低存在感', '生活真实'],
        },
        imagePrompt: 'This is casting alternative A for the same character. same character DNA, different actor-like interpretation. Round short face, low cheekbones, soft jaw, evasive eyes, worn jacket, restrained everyday look-test contact sheet.',
      },
      {
        id: 'B',
        directionName: 'B 情绪裂痕路线',
        interpretationLogic: '把角色的无后羞耻和突然暴富后的不安推到脸上。',
        faceFamily: '窄长脸、深眼窝、脆弱疲惫型演员脸',
        bodyType: '高瘦前探',
        emotionalTemperature: '湿冷、快要崩溃、强撑礼貌',
        screenPresence: '脆弱而刺痛，观众会先感到他的内伤',
        appearanceDescriptor: {
          faceShape: '窄长脸，下巴尖长，脸颊凹陷',
          boneStructure: '颧骨高而外突，眉骨深，下颌线窄',
          eyes: '深眼窝，眼眶泛红，眼神湿润',
          nose: '细长鼻梁，鼻翼窄',
          lips: '干裂薄唇，常微张',
          skinTexture: '灰黄干燥，眼下暗沉明显',
          hairstyle: '乱发贴额，鬓角灰白',
          bodyType: '高瘦单薄，脖子前探',
          posture: '肩膀下沉，手指攥紧，身体向前缩',
          wardrobe: '松垮棉袄、皱旧内衫、旧围巾',
          visualKeywords: ['深眼窝', '泛红眼眶', '情绪裂痕', '生活崩塌'],
        },
        imagePrompt: 'This is casting alternative B for the same character. same character DNA, different actor-like interpretation. Long narrow face, high cheekbones, red wet eyes, thin nose, collapsed posture, emotionally wounded look-test contact sheet.',
      },
      {
        id: 'C',
        directionName: 'C 暴富造型路线',
        interpretationLogic: '把角色的突然有钱和长期自卑做成矛盾的炫耀感。',
        faceFamily: '倒三角窄脸、尖颧骨、僵硬假笑型脸',
        bodyType: '瘦小但刻意挺胸',
        emotionalTemperature: '燥热、虚张声势、得意里带不安',
        screenPresence: '一眼记住的荒诞暴富感，滑稽但有悲凉',
        appearanceDescriptor: {
          faceShape: '倒三角窄脸，太阳穴窄，下巴尖',
          boneStructure: '颧骨尖利，鼻梁硬，下颌收紧',
          eyes: '眼睛细长，眼尾吊起，目光游移',
          nose: '鹰钩感高鼻梁，鼻尖下压',
          lips: '嘴唇偏厚，假笑僵硬露齿',
          skinTexture: '油亮粗糙，额头反光，皱纹深',
          hairstyle: '油亮后梳稀发，头顶反光',
          bodyType: '瘦小干瘪但胸口硬挺',
          posture: '挺胸叉腰但腰背仍弯，姿态矛盾',
          wardrobe: '刺眼红衬衫、粗金链、廉价亮面皮带',
          visualKeywords: ['粗金链', '油亮后梳头', '僵硬假笑', '暴富荒诞'],
        },
        imagePrompt: 'This is casting alternative C for the same character. same character DNA, different actor-like interpretation. Inverted triangle narrow face, sharp cheekbones, hooked nose, stiff grin, glossy combed-back hair, red shirt and gold chain look-test contact sheet.',
      },
    ],
    diversityCheck: {
      AB: 'A 圆短低颧普通脸，B 窄长高颧脆弱脸；眼鼻唇、体态和银幕存在感均不同，DNA 未漂移。',
      AC: 'A 低存在感生活真实，C 尖颧倒三角与暴富炫耀；脸型、骨相、鼻唇、姿态和 presence 均不同。',
      BC: 'B 湿冷脆弱高瘦前探，C 燥热虚张瘦小挺胸；五官和 screen presence 明确互斥。',
      passed: true,
    },
  })
}

describe('character casting plan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiExecMock.executeAiTextStep.mockResolvedValue({ text: buildValidPlanJson() })
  })

  it('generates three hard-differentiated casting plans from screenplay role and selected visual reference', async () => {
    const plans = await generateCharacterCastingPlans({
      userId: 'user-1',
      projectId: 'project-1',
      locale: 'zh',
      analysisModel: 'analysis-model-1',
      characterRequest: '五十多岁穷困潦倒的老光棍，一夜暴富重金求子。',
      selectedVisualReferenceStyle: {
        id: 'style-1',
        title: '动画向｜定格巷口',
        description: '定格动画、粘土与布艺材质、冷色旧巷。',
        prompt: '维度组合：定格动画；粘土与布艺；冷色旧巷。必须严格使用视觉方向里描述的共享场景，保留同一批人物、人物站位、道具摆法。',
        imageUrl: '/m/style-1',
      },
    })

    expect(plans).toHaveLength(3)
    expect(plans[0].directionName).toBe('A 生活真实路线')
    expect(plans[1].appearanceDescriptor.faceShape).toContain('窄长脸')
    expect(plans[2].appearanceDescriptor.wardrobe).toContain('粗金链')
    const calls = aiExecMock.executeAiTextStep.mock.calls as unknown as Array<[AiTextStepCall]>
    const call = calls[0]?.[0]
    if (!call) throw new Error('Expected executeAiTextStep to be called')
    expect(call).toEqual(expect.objectContaining({
      action: 'character_casting_plan_generate',
      model: 'analysis-model-1',
      projectId: 'project-1',
    }))
    expect(call.messages[0]?.content).toContain('已选视觉参考案例，唯一风格来源')
    expect(call.messages[0]?.content).toContain('必须先生成 Character DNA')
    expect(call.messages[0]?.content).toContain('Character DNA Generator')
    expect(call.messages[0]?.content).toContain('Casting Space Planner')
    expect(call.messages[0]?.content).toContain('Appearance Descriptor Generator')
    expect(call.messages[0]?.content).toContain('Image Prompt Builder')
    expect(call.messages[0]?.content).toContain('Diversity Judge')
    expect(call.messages[0]?.content).toContain('禁止生成具体五官')
    expect(call.messages[0]?.content).toContain('same character DNA, different actor-like interpretation')
    expect(call.messages[0]?.content).not.toContain('保留同一批人物')
  })

  it('renders a candidate-specific prompt block with concrete visible differences', () => {
    const plans = normalizeCharacterCastingPlans(JSON.parse(buildValidPlanJson()))
    const block = renderCharacterCastingPlanPromptBlock({ plan: plans[2], locale: 'zh' })

    expect(block).toContain('选角方向 C：C 暴富造型路线')
    expect(block).toContain('油亮后梳稀发')
    expect(block).toContain('粗金链')
    expect(block).toContain('faceShape')
    expect(block).toContain('本方向独立生图 prompt')
    expect(block).toContain('不要把这个演员式诠释与 A/B/C 其他方案平均混合')
  })

  it('normalizes the full Character DNA -> directions -> descriptors -> prompts JSON document', async () => {
    const document = await generateCharacterCastingPlanDocument({
      userId: 'user-1',
      projectId: 'project-1',
      locale: 'zh',
      analysisModel: 'analysis-model-1',
      characterRequest: '五十多岁穷困潦倒的老光棍，一夜暴富重金求子。',
      selectedVisualReferenceStyle: {
        id: 'style-1',
        title: '动画向｜定格巷口',
        description: '定格动画、粘土与布艺材质、冷色旧巷。',
        prompt: '维度组合：定格动画。',
        imageUrl: '/m/style-1',
      },
    })

    expect(document.characterDNA).toEqual(expect.objectContaining({
      ageRange: '五十到六十岁',
      narrativeFunction: expect.stringContaining('推动荒诞求子事件'),
    }))
    expect(document.castingDirections[0].id).toBe('A')
    expect(document.castingDirections[0].imagePrompt).toContain('This is casting alternative A for the same character.')
    expect(document.diversityCheck.passed).toBe(true)
  })

  it('accepts an already-normalized shared casting plan document with derived candidateIndex fields', () => {
    const firstPass = normalizeCharacterCastingPlanDocument(JSON.parse(buildValidPlanJson()))
    const secondPass = normalizeCharacterCastingPlanDocument(firstPass)

    expect(secondPass.castingDirections.map((direction) => direction.candidateIndex)).toEqual([0, 1, 2])
    expect(secondPass.castingDirections[0].imagePrompt).toContain('This is casting alternative A for the same character.')
  })

  it('rejects malformed plans instead of silently falling back to generic candidate briefs', () => {
    expect(() => normalizeCharacterCastingPlans({
      characterDNA: {
        ageRange: '50s',
        gender: 'male',
        ethnicityRegion: 'region',
        socialClass: 'class',
        occupation: 'occupation',
        temperament: 'temperament',
        coreWound: 'wound',
        desireNeed: 'need',
        narrativeFunction: 'function',
        bodyEnergy: 'energy',
        styleCompatibility: 'style',
      },
      castingDirections: [],
      diversityCheck: { AB: 'x', AC: 'x', BC: 'x', passed: true },
    })).toThrow('CHARACTER_CASTING_PLAN_INVALID')
  })

  it('rejects near-duplicate appearance descriptors before image generation', () => {
    const document = JSON.parse(buildValidPlanJson()) as Record<string, unknown>
    const directions = document.castingDirections as Array<Record<string, unknown>>
    const descriptorA = directions[0]?.appearanceDescriptor
    if (!descriptorA) throw new Error('Expected descriptor A')
    directions[1] = {
      ...directions[1],
      faceFamily: directions[0]?.faceFamily,
      screenPresence: directions[0]?.screenPresence,
      appearanceDescriptor: descriptorA,
    }

    expect(() => normalizeCharacterCastingPlanDocument(document)).toThrow('CHARACTER_CASTING_PLAN_INSUFFICIENT_DIVERSITY')
  })
})
