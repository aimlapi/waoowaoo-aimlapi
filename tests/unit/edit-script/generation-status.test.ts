import type { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const txMock = vi.hoisted(() => ({
  projectEditScript: {
    upsert: vi.fn(),
    findUniqueOrThrow: vi.fn(),
  },
  projectEditAssetRequirement: {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    create: vi.fn(),
  },
  projectCharacter: {
    create: vi.fn(),
  },
  projectLocation: {
    create: vi.fn(),
  },
}))

const prismaMock = vi.hoisted(() => ({
  projectEpisode: {
    findFirst: vi.fn(),
  },
  project: {
    findFirst: vi.fn(),
    update: vi.fn(),
  },
  projectEditScript: {
    upsert: vi.fn(),
    findFirst: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
  },
  projectCharacter: {
    findMany: vi.fn(),
  },
  projectLocation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (callback: (tx: typeof txMock) => Promise<unknown>) => callback(txMock)),
}))

const aiExecMock = vi.hoisted(() => ({
  executeAiTextStep: vi.fn(),
}))

const billingMock = vi.hoisted(() => ({
  withTextBilling: vi.fn(async (
    _userId: string,
    _model: string,
    _maxInputTokens: number,
    _billingMeta: unknown,
    runCompletion: () => Promise<unknown>,
  ) => await runCompletion()),
}))

const assetDesignMock = vi.hoisted(() => ({
  designEditAssetRequirements: vi.fn(async (input: { requirements: unknown }) => input.requirements),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ analysisModel: 'analysis-model-1' })),
}))
vi.mock('@/lib/ai-exec/engine', () => aiExecMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/edit-script/asset-design', () => assetDesignMock)
vi.mock('@/lib/assets/services/asset-actions', () => ({ submitAssetGenerateTask: vi.fn() }))

import {
  generateProjectEditScreenplay,
  generateProjectEditScript,
  readProjectEditScreenplay,
  readProjectEditScript,
} from '@/lib/edit-script/service'
import { storyDevelopmentPackageSchema } from '@/lib/edit-script/types'
import { AI_PROMPT_IDS } from '@/lib/ai-prompts'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/edit-script', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

const mockStyleBible = {
  strategy: 'style_bible',
  styleSummary: 'quiet realistic sci-fi',
  stylePolicy: {
    visual: {
      negativePrompt: '不要字幕，不要水印，不要廉价塑料科幻感。',
      imageFilterPrompt: 'low contrast, clean futuristic texture, subtle bloom, 35mm lens',
      lightingPrompt: 'cold practical lights and restrained bloom',
      colorPrompt: 'cool blue gray',
      texturePrompt: 'clean metal and glass texture',
      compositionPrompt: 'minimal corridor composition with negative space',
    },
    camera: {
      movementPrompt: 'slow controlled camera movement',
      lensAndDepthPrompt: '35mm lens with readable corridor depth',
      videoRhythmPrompt: 'slow push-in, restrained pacing',
    },
    sound: {
      soundFilterPrompt: 'clean modern sci-fi sound, wide-band clarity, low mechanical hum, restrained spatial reverb',
    },
    hardBans: ['no subtitles'],
  },
}

const mockStoryDevelopment = {
  schemaVersion: 2,
  premise: '50多岁穷困潦倒的老光棍，一夜暴富求子。',
  protagonist: {
    name: '刘满仓',
    ageRange: '50多岁',
    socialPosition: '北方县城边缘村庄里的老光棍',
    externalState: '穷困潦倒后突然暴富',
    innerWound: '害怕老去无人记得',
    lie: '只要有儿子续香火，自己就能摆脱被人轻贱和遗忘的命运',
    want: '娶一个能生孩子的女人并留下儿子',
    need: '承认自己真正害怕的是孤独，而不是没有后代',
  },
  themeEngine: {
    valueA: '传宗接代的体面',
    valueB: '把人当人看的陪伴',
    centralDramaticQuestion: '刘满仓会继续把婚姻当成求子的功能，还是承认自己需要的是一个真实的人',
    controllingIdea: '当一个人放弃用血脉证明体面，才可能第一次把陪伴当作尊严而不是工具',
  },
  world: {
    era: '当代',
    region: '北方资源衰败县城下辖村庄',
    socialReality: '村庄用儿子和香火衡量男人体面',
    conflictFunction: '放大主角对生育和尊严的混淆',
  },
  antagonistSystem: {
    embodiedAntagonist: {
      name: '王媒婆',
      socialPosition: '村里掌握婚事资源的媒人',
      activeOpposition: '不断把李桂香包装成能给刘满仓生子的机会，逼他按求子逻辑推进婚事',
    },
    institutionalAntagonist: {
      name: '村庄香火伦理',
      rulesOrMechanism: '男人必须有儿子才算翻身，婚姻被默认服务于传宗接代',
      activeOpposition: '用闲话、喜联和婚宴仪式持续把刘满仓推回求子的外部目标',
    },
    abstractAntagonist: {
      name: '被遗忘的恐惧',
      existentialThreat: '无人记得、无人送终、老去后像从未存在',
      activeOpposition: '把孤独伪装成必须生子的焦虑，阻碍他看见真实的陪伴需求',
    },
  },
  characterNetwork: [
    {
      name: '李桂香',
      ageRange: '40多岁',
      relationshipToProtagonist: '准备结婚的寡妇',
      dramaticFunction: 'mirror',
      themePosition: '人不是生育功能，陪伴必须建立在被看见之上',
      fateRepresentation: '如果刘满仓选择把关系当成人，他可能得到不保证圆满但真实的晚年',
      questionToProtagonist: '你要的是我这个人，还是我的肚子',
      desireInStory: '找一个能把她当作人接纳的伴侣',
      pressureApplied: '她不能生育的事实逼主角面对自己的执念',
    },
    {
      name: '王媒婆',
      ageRange: '60岁上下',
      relationshipToProtagonist: '媒人',
      dramaticFunction: 'pressure',
      themePosition: '体面可以被交易，婚姻可以被功能化',
      fateRepresentation: '如果刘满仓成为她，他会把所有关系都变成买卖和算盘',
      questionToProtagonist: '你花了钱，难道不该买一个有用的结果吗',
      desireInStory: '促成婚事并从中获利',
      pressureApplied: '不断用早生贵子和村庄眼光催促主角',
    },
  ],
  fateNetwork: [
    {
      label: 'Future A',
      characterName: '李桂香',
      lifePath: '放弃功能化关系，承受不圆满但真实的陪伴',
      gain: '得到一个能互相看见的人',
      ending: '婚事未必顺利，却不再把晚年寄托在血脉证明上',
    },
    {
      label: 'Future B',
      characterName: '王媒婆',
      lifePath: '把所有关系都变成交易',
      gain: '短期利益和村庄认可',
      ending: '永远无法被任何关系真正触动',
    },
    {
      label: 'Future C',
      characterName: '刘满仓的旧自己',
      lifePath: '继续用儿子证明自己存在过',
      gain: '看似体面的香火叙事',
      ending: '即使结婚也仍旧孤独，因为他没有真正面对人',
    },
  ],
  pressureLadder: [
    {
      level: 1,
      domain: 'career',
      pressure: '暴富后村里人突然围上来，把他当成可重新定价的男人',
      escalation: '外部身份从穷光棍变成有钱但必须证明价值的人',
    },
    {
      level: 2,
      domain: 'relationship',
      pressure: '婚事推进，李桂香开始要求他把自己当作伴侣而非生育机会',
      escalation: '求子目标开始伤害真实关系',
    },
    {
      level: 3,
      domain: 'identity',
      pressure: '不能生育的真相公开，他的体面叙事当场坍塌',
      escalation: '他必须面对自己是不是也在轻贱别人',
    },
    {
      level: 4,
      domain: 'existence',
      pressure: '婚宴将开，所有人都等他选择继续体面还是承认孤独',
      escalation: '选择不再只是婚事成败，而是他如何定义自己活过',
    },
  ],
  hardChoices: [
    {
      valueA: '传宗接代的体面',
      valueB: '把人当人看的陪伴',
      decision: '刘满仓撕掉早生贵子的喜联',
      cost: '失去村里人眼中最容易证明翻身的方式',
    },
    {
      valueA: '保住婚宴脸面',
      valueB: '承认自己伤害了李桂香',
      decision: '他停止催促婚事继续，允许对方离开',
      cost: '暴富后的面子当众破裂',
    },
    {
      valueA: '继续相信有儿子才算存在',
      valueB: '承认自己害怕孤独',
      decision: '他说出自己真正怕的是没人陪',
      cost: '暴露最不体面的软弱',
    },
  ],
  valueArc: {
    openingBelief: '有钱后只要有儿子，自己就能从被轻贱的命里翻身',
    closingBelief: '如果连眼前的人都看不见，有没有儿子都不能证明自己活得有尊严',
    openingValueState: '把尊严寄托在血脉和外界评价上',
    closingValueState: '开始把尊严转向真实陪伴和自我承认',
  },
  storyExpansion: [
    {
      act: 'Act 1',
      goal: '刘满仓一夜暴富后宣布马上结婚求子',
      pressure: '村庄香火伦理和媒人一起把他推向早生贵子的体面叙事',
      choice: '他通过媒人找来四十多岁的寡妇准备办婚事',
      cost: '他把未来伴侣先看成生育机会，关系从一开始就被功能化',
      newValueState: '他更相信钱和儿子能买回尊严',
    },
    {
      act: 'Act 2',
      goal: '他想把婚事办成，让村里人承认自己翻身',
      pressure: '李桂香不能生育的事实逼近，婚宴和村庄闲话也在加速',
      choice: '他失控质问李桂香为何不能生',
      cost: '他伤透对方，也看见自己从被轻贱的人变成了轻贱别人的人',
      newValueState: '他开始怀疑求子是否真能解决孤独',
    },
    {
      act: 'Act 3',
      goal: '他必须决定婚宴继续还是承认自己的执念',
      pressure: '所有人都等着看他如何处理不能生育的未婚妻',
      choice: '他撕掉早生贵子的喜联，不再把婚姻只当作求子工具',
      cost: '婚事没有圆满落地，他也失去最省事的体面证明',
      newValueState: '他第一次承认自己需要的是陪伴而不是功能',
    },
  ],
  narrativeStructure: {
    type: 'classic_three_act',
    reason: '线性三幕式能集中呈现暴富、求子幻觉和婚前真相的代价',
    mapping: {
      openingMovement: '暴富与求子欲望建立',
      developmentMovement: '婚事推进，关系出现真实可能',
      endingMovement: '不能生育的事实揭开，主角做出代价选择',
    },
  },
  screenplayConstraints: {
    sceneCount: '2-4',
    tone: '克制、尖锐、生活化',
    endingState: '不突然圆满，留下关系是否还能继续的余味',
  },
}

function mockSuccessfulAiSteps() {
  aiExecMock.executeAiTextStep
    .mockResolvedValueOnce({
      text: JSON.stringify({
        title: 'Sci-Fi Short',
        logline: 'A quiet signal wakes a station.',
        durationSec: 4,
        shots: [
          {
            shotNumber: 1,
            durationSec: 4,
            visualAction: 'A station corridor flickers awake.',
            charactersAndScene: 'Station corridor',
            camera: 'slow push in',
            sound: 'low electrical hum',
          },
        ],
        videoBlocks: [
          {
            type: 'single',
            shotNumbers: [1],
            reason: 'Single establishing shot.',
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        assets: [
          {
            kind: 'location',
            name: 'Station Corridor',
            description: 'A cold sci-fi corridor.',
            shotNumbers: [1],
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        sourceVideoBlockIndex: 0,
        shotNumbers: [1],
        shots: [
          {
            shotNumber: 1,
            videoPrompt: 'A cinematic station corridor flickers awake.',
          },
        ],
        videoBlock: {
          shotNumbers: [1],
          prompt: 'A cinematic station corridor flickers awake, slow push in.',
        },
      }),
    })
}

describe('edit script generation status persistence', () => {
  it('rejects story development when want equals need', () => {
    const invalidStoryDevelopment = {
      ...mockStoryDevelopment,
      protagonist: {
        ...mockStoryDevelopment.protagonist,
        need: mockStoryDevelopment.protagonist.want,
      },
    }

    const parsed = storyDevelopmentPackageSchema.safeParse(invalidStoryDevelopment)

    expect(parsed.success).toBe(false)
  })

  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    aiExecMock.executeAiTextStep.mockReset()
    assetDesignMock.designEditAssetRequirements.mockReset()
    assetDesignMock.designEditAssetRequirements.mockImplementation(async (input: { requirements: unknown }) => input.requirements)
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      artStyle: 'realistic',
      videoRatio: '9:16',
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([])
    prismaMock.projectLocation.findMany.mockResolvedValue([])
    prismaMock.projectLocation.findFirst.mockResolvedValue(null)
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '做一个科幻短片',
      styleBibleJson: mockStyleBible,
      storyDevelopmentJson: mockStoryDevelopment,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'ready',
    })
    prismaMock.projectEditScreenplay.upsert.mockResolvedValue({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '50多岁穷困潦倒的老光棍，一夜暴富求子。',
      styleBibleJson: null,
      storyDevelopmentJson: mockStoryDevelopment,
      screenplayText: '标题：《旧屋喜事》\n\n故事梗概：刘满仓一夜暴富后急着求子，却在婚前发现未婚妻不能生育。',
      status: 'ready',
    })
    prismaMock.task.findFirst.mockResolvedValue(null)
    txMock.projectEditScript.upsert.mockResolvedValue({ id: 'edit-1' })
    txMock.projectEditAssetRequirement.deleteMany.mockResolvedValue({ count: 0 })
    txMock.projectEditAssetRequirement.createMany.mockResolvedValue({ count: 1 })
    txMock.projectEditAssetRequirement.create.mockResolvedValue({ id: 'req-1' })
    txMock.projectLocation.create.mockResolvedValue({ id: 'location-1' })
    txMock.projectCharacter.create.mockResolvedValue({
      id: 'character-1',
      appearances: [{ id: 'appearance-1' }],
    })
    txMock.projectEditScript.findUniqueOrThrow.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '做一个科幻短片',
      styleBibleJson: mockStyleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      title: 'Sci-Fi Short',
      logline: 'A quiet signal wakes a station.',
      durationSec: 4,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'A station corridor flickers awake.',
          charactersAndScene: 'Station corridor',
          camera: 'slow push in',
          videoPrompt: 'A cinematic station corridor flickers awake.',
          sound: 'low electrical hum',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'single',
          shotNumbers: [1],
          reason: 'Single establishing shot.',
          prompt: 'A cinematic station corridor flickers awake, slow push in.',
        },
      ],
      requirements: [],
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('generates screenplay independently before edit script generation', async () => {
    aiExecMock.executeAiTextStep
      .mockResolvedValueOnce({
        text: JSON.stringify(mockStoryDevelopment),
      })
      .mockResolvedValueOnce({
        text: '标题：《旧屋喜事》\n\n故事梗概：刘满仓一夜暴富后急着求子，却在婚前发现未婚妻不能生育。',
      })

    const screenplay = await generateProjectEditScreenplay({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '50多岁穷困潦倒的老光棍，一夜暴富求子。',
    })

    expect(screenplay.id).toBe('screenplay-1')
    expect(screenplay.styleBible).toBeNull()
    expect(screenplay.storyDevelopment).toEqual(mockStoryDevelopment)
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(2)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_STORY_DEVELOPMENT,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_STORY_DEVELOPMENT,
        stepIndex: 1,
        stepTotal: 2,
      }),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
      reasoning: false,
      messages: [
        expect.objectContaining({
          content: expect.stringContaining('刘满仓'),
        }),
      ],
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
        stepIndex: 2,
        stepTotal: 2,
      }),
    }))
    expect(prismaMock.projectEditScreenplay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        styleBibleJson: Prisma.JsonNull,
        storyDevelopmentJson: mockStoryDevelopment,
        screenplayText: '标题：《旧屋喜事》\n\n故事梗概：刘满仓一夜暴富后急着求子，却在婚前发现未婚妻不能生育。',
        status: 'ready',
      }),
      update: expect.objectContaining({
        styleBibleJson: Prisma.JsonNull,
        storyDevelopmentJson: mockStoryDevelopment,
        screenplayText: '标题：《旧屋喜事》\n\n故事梗概：刘满仓一夜暴富后急着求子，却在婚前发现未婚妻不能生育。',
        status: 'ready',
      }),
    }))
    expect(prismaMock.projectEditScript.upsert).not.toHaveBeenCalled()
  })

  it('fails a slow story development step only at the extended development deadline', async () => {
    vi.useFakeTimers()
    aiExecMock.executeAiTextStep.mockImplementationOnce(() => new Promise(() => {}))

    const resultPromise = generateProjectEditScreenplay({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '50多岁穷困潦倒的老光棍，一夜暴富求子。',
    }).then(
      () => null,
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(359_999)
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(prismaMock.projectEditScreenplay.upsert).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2)
    const error = await resultPromise

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(`EDIT_SCRIPT_STEP_TIMEOUT:${AI_PROMPT_IDS.EDIT_SCRIPT_STORY_DEVELOPMENT}:360s`)
    expect(prismaMock.projectEditScreenplay.upsert).not.toHaveBeenCalled()
  })

  it('reads legacy screenplay without story development as nullable storyDevelopment', async () => {
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'legacy-screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '旧剧本',
      styleBibleJson: null,
      storyDevelopmentJson: null,
      screenplayText: '旧剧本文本',
      status: 'ready',
    })

    const screenplay = await readProjectEditScreenplay({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(screenplay).toEqual({
      id: 'legacy-screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '旧剧本',
      styleBible: null,
      storyDevelopment: null,
      screenplayText: '旧剧本文本',
      status: 'ready',
    })
  })

  it('reads legacy edit script without Style Bible as nullable styleBible', async () => {
    prismaMock.projectEditScript.findFirst.mockResolvedValueOnce({
      id: 'legacy-edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '旧分镜',
      styleBibleJson: null,
      screenplayText: '旧剧本文本',
      title: '旧分镜',
      logline: null,
      durationSec: 4,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: '旧镜头动作',
          charactersAndScene: '旧场景',
          camera: '静态',
          videoPrompt: '旧视频提示词',
          sound: '环境声',
        },
      ],
      videoBlocksJson: [
        {
          kind: 'single',
          shotNumbers: [1],
          reason: '单镜头',
          prompt: '旧视频块提示词',
        },
      ],
      requirements: [],
    })

    const editScript = await readProjectEditScript({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(editScript).toEqual(expect.objectContaining({
      id: 'legacy-edit-1',
      styleBible: null,
      title: '旧分镜',
      shotCount: 1,
      requirements: [],
    }))
    expect(editScript?.shots[0]).toEqual(expect.objectContaining({
      shotNumber: 1,
      videoPrompt: '旧视频提示词',
    }))
    expect(editScript?.videoBlocks[0]).toEqual(expect.objectContaining({
      prompt: '旧视频块提示词',
    }))
  })

  it('surfaces a failed asset regeneration even when an old preview image exists', async () => {
    prismaMock.projectLocation.findFirst.mockResolvedValueOnce({
      id: 'location-1',
      images: [
        {
          imageUrl: 'https://cdn.example.com/old-location.png',
          imageMediaId: null,
        },
      ],
    })
    prismaMock.task.findFirst.mockResolvedValueOnce({
      status: 'failed',
      errorMessage: 'IMAGE_PROVIDER_FAILED',
      errorCode: 'EXTERNAL_ERROR',
    })
    prismaMock.projectEditScript.findFirst.mockResolvedValueOnce({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '做一个科幻短片',
      styleBibleJson: mockStyleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      title: 'Sci-Fi Short',
      logline: 'A quiet signal wakes a station.',
      durationSec: 4,
      shotCount: 1,
      status: 'ready',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          visualAction: 'A station corridor flickers awake.',
          charactersAndScene: 'Station corridor',
          camera: 'slow push in',
          videoPrompt: 'A cinematic station corridor flickers awake.',
          sound: 'low electrical hum',
        },
      ],
      videoBlocksJson: [],
      requirements: [
        {
          id: 'requirement-1',
          kind: 'location',
          name: 'Station Corridor',
          description: 'A cold sci-fi corridor.',
          shotIndexes: [1],
          status: 'generating',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    })

    const editScript = await readProjectEditScript({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(editScript?.requirements[0]).toEqual(expect.objectContaining({
      id: 'requirement-1',
      status: 'failed',
      errorMessage: 'IMAGE_PROVIDER_FAILED',
      previewImageUrl: 'https://cdn.example.com/old-location.png',
    }))
    expect(prismaMock.task.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectId: 'project-1',
        targetType: 'LocationImage',
        targetId: 'location-1',
      }),
      orderBy: { updatedAt: 'desc' },
    }))
  })

  it('persists a generating edit script before running the AI chain', async () => {
    mockSuccessfulAiSteps()

    await generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    })

    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { episodeId: 'episode-1' },
      create: expect.objectContaining({
        status: 'generating',
        userPrompt: '做一个科幻短片',
        styleBibleJson: Prisma.JsonNull,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
        shotCount: 0,
        shotsJson: [],
        videoBlocksJson: [],
      }),
      update: expect.objectContaining({
        status: 'generating',
        userPrompt: '做一个科幻短片',
        styleBibleJson: Prisma.JsonNull,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
      }),
    }))
    const generatingCall = prismaMock.projectEditScript.upsert.mock.calls[0]?.[0]
    expect(generatingCall?.update).not.toHaveProperty('shotCount')
    expect(generatingCall?.update).not.toHaveProperty('shotsJson')
    expect(generatingCall?.update).not.toHaveProperty('videoBlocksJson')
    expect(prismaMock.projectEditScript.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      aiExecMock.executeAiTextStep.mock.invocationCallOrder[0],
    )
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(3)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
        stepIndex: 1,
        stepTotal: 3,
      }),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
        stepIndex: 2,
        stepTotal: 3,
      }),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(3, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT_BLOCK,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_VIDEO_PROMPT_BLOCK,
        stepIndex: 3,
        stepTotal: 3,
      }),
    }))
    expect(txMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        styleBibleJson: Prisma.JsonNull,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
      }),
      update: expect.objectContaining({
        status: 'ready',
        styleBibleJson: Prisma.JsonNull,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
      }),
    }))
    expect(txMock.projectLocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: 'project-1',
        name: 'Station Corridor',
        summary: 'A cold sci-fi corridor.',
        images: expect.objectContaining({
          create: expect.objectContaining({
            imageIndex: 0,
            description: 'A cold sci-fi corridor.',
          }),
        }),
      }),
    }))
    expect(txMock.projectEditAssetRequirement.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name: 'Station Corridor',
        targetId: 'location-1',
        status: 'pending',
      }),
    }))
    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'generating',
        styleBibleJson: Prisma.JsonNull,
        shotsJson: [
          expect.objectContaining({
            shotNumber: 1,
            visualAction: 'A station corridor flickers awake.',
            charactersAndScene: 'Station corridor',
            camera: 'slow push in',
            sound: 'low electrical hum',
          }),
        ],
      }),
    }))
  })

  it('marks the persisted edit script failed when generation throws', async () => {
    aiExecMock.executeAiTextStep.mockRejectedValueOnce(new Error('LLM_DOWN'))

    await expect(generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    })).rejects.toThrow('LLM_DOWN')

    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledTimes(2)
    expect(prismaMock.projectEditScript.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'failed',
        styleBibleJson: Prisma.JsonNull,
        logline: 'LLM_DOWN',
      }),
    }))
  })

  it('fails a slow edit script step at the stage deadline', async () => {
    vi.useFakeTimers()
    aiExecMock.executeAiTextStep.mockImplementationOnce(() => new Promise(() => {}))

    const resultPromise = generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    }).then(
      () => null,
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(180_001)
    const error = await resultPromise

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe(`EDIT_SCRIPT_STEP_TIMEOUT:${AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY}:180s`)
    expect(prismaMock.projectEditScript.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'failed',
        styleBibleJson: Prisma.JsonNull,
        logline: `EDIT_SCRIPT_STEP_TIMEOUT:${AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY}:180s`,
      }),
    }))
  })

  it('fails a slow edit script asset design stage at the stage deadline', async () => {
    vi.useFakeTimers()
    aiExecMock.executeAiTextStep
      .mockResolvedValueOnce({
        text: JSON.stringify({
          title: 'Sci-Fi Short',
          logline: 'A quiet signal wakes a station.',
          durationSec: 4,
          shots: [
            {
              shotNumber: 1,
              durationSec: 4,
              visualAction: 'A station corridor flickers awake.',
              charactersAndScene: 'Station corridor',
              camera: 'slow push in',
              sound: 'low electrical hum',
            },
          ],
          videoBlocks: [
            {
              type: 'single',
              shotNumbers: [1],
              reason: 'Single establishing shot.',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          assets: [
            {
              kind: 'location',
              name: 'Station Corridor',
              description: 'A cold sci-fi corridor.',
              shotNumbers: [1],
            },
          ],
        }),
      })
    assetDesignMock.designEditAssetRequirements.mockImplementationOnce(() => new Promise(() => {}))

    const resultPromise = generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    }).then(
      () => null,
      (error: unknown) => error,
    )

    await vi.advanceTimersByTimeAsync(90_001)
    const error = await resultPromise

    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('EDIT_SCRIPT_STEP_TIMEOUT:edit_script_asset_design:90s')
    expect(prismaMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'generating',
        shotCount: 1,
        shotsJson: [
          expect.objectContaining({
            shotNumber: 1,
            visualAction: 'A station corridor flickers awake.',
          }),
        ],
      }),
    }))
    expect(prismaMock.projectEditScript.upsert).toHaveBeenLastCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: 'failed',
        logline: 'EDIT_SCRIPT_STEP_TIMEOUT:edit_script_asset_design:90s',
      }),
    }))
  })
})
