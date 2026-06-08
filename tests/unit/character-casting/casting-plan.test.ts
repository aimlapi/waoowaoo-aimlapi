import { beforeEach, describe, expect, it, vi } from 'vitest'

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(async () => ({ text: buildValidPlanJson() })),
}))

vi.mock('@/lib/ai-exec/engine', () => aiExecMock)

import {
  generateCharacterCastingPlans,
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
    candidates: [
      {
        candidateIndex: 0,
        label: 'A 生活真实路线',
        castingPremise: '普通市井中年男人。',
        faceAndAge: '圆脸、松弛眼皮、蜡黄皮肤。',
        hairAndSilhouette: '稀疏地中海，发丝贴头皮。',
        bodyAndPosture: '塌肩驼背，站姿拘谨。',
        costumeAndMaterials: '洗旧夹克，起球毛衣。',
        performanceState: '怯懦局促，眼神闪躲。',
        storyContext: '破旧出租屋门口。',
        signatureDetails: ['旧夹克袖口', '缺牙', '磨损布鞋'],
        differenceLocks: ['不能使用 B 的红眼压抑状态', '不能使用 C 的粗金链强造型'],
        promptDirective: '生活化、低调、普通。',
      },
      {
        candidateIndex: 1,
        label: 'B 情绪裂痕路线',
        castingPremise: '同一角色但更明显被生活压垮。',
        faceAndAge: '长脸、深眼窝、眼眶泛红。',
        hairAndSilhouette: '乱发贴额，鬓角灰白。',
        bodyAndPosture: '脖子前探，手指攥紧。',
        costumeAndMaterials: '松垮棉袄，皱旧内衫。',
        performanceState: '强撑体面，快要崩溃。',
        storyContext: '昏暗楼道。',
        signatureDetails: ['攥紧手指', '泛红眼眶', '皱旧棉袄'],
        differenceLocks: ['不能使用 A 的圆脸普通感', '不能使用 C 的油亮后梳头'],
        promptDirective: '情绪压迫最强，脸和姿态必须不同。',
      },
      {
        candidateIndex: 2,
        label: 'C 暴富造型路线',
        castingPremise: '同一角色但突出暴富后硬撑体面。',
        faceAndAge: '窄脸、颧骨尖、假笑僵硬。',
        hairAndSilhouette: '油亮后梳稀发，头顶反光。',
        bodyAndPosture: '挺胸但腰背仍弯，姿态矛盾。',
        costumeAndMaterials: '刺眼红衬衫，粗金链，廉价亮面皮带。',
        performanceState: '虚张声势，得意又不安。',
        storyContext: '老旧巷口围观人群前。',
        signatureDetails: ['粗金链', '亮面皮带', '油亮后梳头'],
        differenceLocks: ['不能使用 A 的寒酸夹克', '不能使用 B 的崩溃低头状态'],
        promptDirective: '造型记忆点最强，但仍是同一落魄老男人。',
      },
    ],
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
        prompt: 'stop-motion clay and fabric, muted alley, worn textures',
        imageUrl: '/m/style-1',
      },
    })

    expect(plans).toHaveLength(3)
    expect(plans[0].label).toBe('A 生活真实路线')
    expect(plans[1].faceAndAge).toContain('长脸')
    expect(plans[2].costumeAndMaterials).toContain('粗金链')
    const calls = aiExecMock.executeAiTextStep.mock.calls as unknown as Array<[AiTextStepCall]>
    const call = calls[0]?.[0]
    if (!call) throw new Error('Expected executeAiTextStep to be called')
    expect(call).toEqual(expect.objectContaining({
      action: 'character_casting_plan_generate',
      model: 'analysis-model-1',
      projectId: 'project-1',
    }))
    expect(call.messages[0]?.content).toContain('已选视觉参考案例，唯一风格来源')
    expect(call.messages[0]?.content).toContain('三套方案必须像真正可比较的选角方案')
    expect(call.messages[0]?.content).toContain('不同演员/不同脸')
    expect(call.messages[0]?.content).toContain('必须明显不是同一张脸')
  })

  it('renders a candidate-specific prompt block with concrete visible differences', () => {
    const plans = normalizeCharacterCastingPlans(JSON.parse(buildValidPlanJson()))
    const block = renderCharacterCastingPlanPromptBlock({ plan: plans[2], locale: 'zh' })

    expect(block).toContain('候选 2 的硬差异选角方案：C 暴富造型路线')
    expect(block).toContain('油亮后梳稀发')
    expect(block).toContain('粗金链')
    expect(block).toContain('跨候选身份锁定')
    expect(block).toContain('必须明显不是其他候选那张脸')
    expect(block).toContain('本候选必须严格执行这套方案')
  })

  it('rejects malformed plans instead of silently falling back to generic candidate briefs', () => {
    expect(() => normalizeCharacterCastingPlans({
      candidates: [
        { candidateIndex: 0, label: 'A' },
        { candidateIndex: 0, label: 'duplicate' },
        { candidateIndex: 2, label: 'C' },
      ],
    })).toThrow('CHARACTER_CASTING_PLAN_INVALID')
  })
})
