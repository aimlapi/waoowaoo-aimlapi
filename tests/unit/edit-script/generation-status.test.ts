import type { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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
  projectEditStylePreview: {
    deleteMany: vi.fn(),
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
    updateMany: vi.fn(),
  },
  projectEditScreenplay: {
    findFirst: vi.fn(),
    upsert: vi.fn(),
    update: vi.fn(),
  },
  projectEditStylePreview: {
    findFirst: vi.fn(),
    deleteMany: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  projectEditDirectorDecoupage: {
    findFirst: vi.fn(),
  },
  projectCharacter: {
    findMany: vi.fn(),
  },
  projectLocation: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
  },
  projectEditAssetRequirement: {
    update: vi.fn(),
  },
  task: {
    findFirst: vi.fn(),
  },
  $transaction: vi.fn(async (input: ((tx: typeof txMock) => Promise<unknown>) | readonly Promise<unknown>[]) => (
    typeof input === 'function' ? input(txMock) : Promise.all(input)
  )),
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
  buildDefaultTaskBillingInfo: vi.fn((_taskType: string, payload: Record<string, unknown>) => ({
    chargeType: 'free',
    billablePayload: payload,
  })),
}))

const assetActionsMock = vi.hoisted(() => ({
  submitAssetGenerateTask: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))
vi.mock('@/lib/config-service', () => ({
  getProjectModelConfig: vi.fn(async () => ({ analysisModel: 'analysis-model-1', storyboardModel: 'image-model-1' })),
  getUserModelConfig: vi.fn(async () => ({ capabilityDefaults: {} })),
  buildImageBillingPayloadFromUserConfig: vi.fn((input: {
    basePayload: Record<string, unknown>
    imageModel: string | null
    aspectRatio?: string | null
  }) => ({
    ...input.basePayload,
    imageModel: input.imageModel,
    ...(input.aspectRatio ? { generationOptions: { aspectRatio: input.aspectRatio } } : {}),
  })),
}))
vi.mock('@/lib/ai-exec/engine', () => aiExecMock)
vi.mock('@/lib/billing', () => billingMock)
vi.mock('@/lib/edit-script/asset-design', () => ({
  designEditAssetRequirements: vi.fn(async (input: { requirements: unknown }) => input.requirements),
}))
vi.mock('@/lib/assets/services/asset-actions', () => assetActionsMock)
vi.mock('@/lib/task/submitter', () => ({
  submitTask: vi.fn(async () => ({ taskId: 'style-preview-task-1', status: 'queued' })),
}))
vi.mock('@/lib/storage', () => ({
  getSignedUrl: vi.fn((key: string) => `https://cdn.example.com/${key}`),
}))

const structuredUserPrompt = [
  '做一个科幻短片',
  '',
  '剪辑先行结构化参数：时长档位 medium（中，约 60 秒）；最终画面比例 16:9。',
].join('\n')

const structuredRevisedUserPrompt = [
  '做一个60秒 16:9 科幻短片',
  '',
  '剧本修改要求：改得更克苏鲁一些',
  '剪辑先行结构化参数：时长档位 medium（中，约 60 秒）；最终画面比例 16:9。',
].join('\n')

import {
  confirmProjectEditStylePreview,
  generateProjectEditScreenplay,
  generateProjectEditScript,
  generateProjectEditScriptAssets,
  generateProjectEditStylePreviews,
  readProjectEditScreenplay,
  readProjectEditScript,
  reviseProjectEditScreenplay,
} from '@/lib/edit-script/service'
import { AI_PROMPT_IDS } from '@/lib/ai-prompts'
import { submitTask } from '@/lib/task/submitter'
import { getProjectModelConfig } from '@/lib/config-service'

function createRequest(): NextRequest {
  return new Request('http://localhost/api/projects/project-1/edit-script', {
    method: 'POST',
    headers: { 'accept-language': 'zh' },
  }) as unknown as NextRequest
}

const mockStyleBible = {
  strategy: 'style_bible',
  rawUserStyle: '科幻短片',
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
    directing: {
      pointOfViewPrompt: 'restricted protagonist viewpoint',
      performancePrompt: 'restrained performance through small gestures',
      informationReleasePrompt: 'reveal information through reaction before event truth',
      rhythmPrompt: 'hold suspense pauses before faster turns',
    },
    sound: {
      soundFilterPrompt: 'clean modern sci-fi sound, wide-band clarity, low mechanical hum, restrained spatial reverb',
    },
    hardBans: ['no subtitles'],
  },
}

const mockStylePreviewOptions = {
  stylePreviews: [
    {
      styleKey: 'style_a',
      aspectRatio: '9:16',
      title: '静冷科幻',
      summary: '冷色、克制、空间感强。',
      styleBible: mockStyleBible,
      gridImagePrompt: 'Generate one 3x3 contact sheet from the screenplay in quiet realistic sci-fi style.',
    },
    {
      styleKey: 'style_b',
      aspectRatio: '16:9',
      title: '暖色悬疑',
      summary: '暖光、阴影、悬疑节奏。',
      styleBible: {
        ...mockStyleBible,
        styleSummary: 'warm suspense sci-fi',
      },
      gridImagePrompt: 'Generate one 3x3 contact sheet from the screenplay in warm suspense sci-fi style.',
    },
    {
      styleKey: 'style_c',
      aspectRatio: '21:9',
      title: '硬朗工业',
      summary: '工业质感、强结构、低饱和。',
      styleBible: {
        ...mockStyleBible,
        styleSummary: 'industrial realistic sci-fi',
      },
      gridImagePrompt: 'Generate one 3x3 contact sheet from the screenplay in industrial realistic sci-fi style.',
    },
  ],
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
            dramaticPurpose: 'test dramatic purpose',
            visibleAction: 'A station corridor flickers awake.',
            audienceFocus: 'test audience focus',
            viewpoint: 'test viewpoint',
            revealPlan: 'test reveal plan',
            performanceBeat: 'test performance beat',
            continuityIn: 'test continuity in',
            continuityOut: 'test continuity out',
            charactersAndScene: 'Station corridor',
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
          },
        ],
        videoBlock: {
          shotNumbers: [1],
          prompt: 'A cinematic station corridor flickers awake, slow push in.',
        },
      }),
    })
}

function mockSuccessfulScreenplayDevelopmentSteps() {
  aiExecMock.executeAiTextStep
    .mockResolvedValueOnce({
      text: JSON.stringify({
          screenplaySkeleton: {
            skeletonPremise: 'A quiet signal wakes a station.',
            centralDramaticQuestion: 'Can the operator answer the signal without losing herself?',
          storyCoreEngine: {
            incitingIncident: '操作员收到一段带有生命体征编码的异常信号。',
            globalGoal: '我要回应信号',
            dramaticProblem: '回应信号会牺牲空间站安全，切断信号会抹掉可能幸存的人。',
            protagonistWound: '操作员相信沉默比回应更安全。',
            gearLock: {},
          },
          storyOriginDiagnosis: {
            primaryOrigin: 'concept',
            originDerivationChain: {
              derivedExternalValueOpposition: {
                valueA: '沉默',
                valueB: '回应',
                oppositionTest: '她不能同时沉默和回应。',
              },
              protagonistInference: {
                wound: '操作员相信沉默比回应更安全。',
              },
            },
          },
          storyStructureBlueprint: {
            structuralBeats: {},
            coreValueAndStoryTriangle: {
              valueSpectrumAndDualOppositions: {
                externalValueOpposition: {
                  valueA: '沉默',
                  valueB: '回应',
                  oppositionTest: '她不能同时沉默和回应。',
                },
              },
            },
          },
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        valueSequenceLoop: {
          defaultLoopCount: 1,
          maxLoopCount: 2,
          noInfiniteLoop: true,
          draftValueSwingSystem: { externalValueSpectrum: '沉默到回应' },
          draftRiskRewardSystem: { globalRisk: '空间站失控', globalReward: '确认生命信号' },
          draftSequenceSpine: [
            { sequenceNumber: 1, sequenceFunction: '发现异常', valueSwing: '安全到失控', riskRewardShift: '风险升高', outcome: '进入核心舱' },
            { sequenceNumber: 2, sequenceFunction: '回应信号', valueSwing: '恐惧到选择', riskRewardShift: '以生存换回应', outcome: '改变航向' },
          ],
          auditRound1: { valueCoverage: '完整', riskRewardProgression: '递进', sequenceCausality: '成立', bridgeOnlySequenceFindings: 'none' },
          repairRound1: { valueSystemRepair: 'none', riskRewardRepair: 'none', sequenceSpineRepair: 'none', whyRepairWorks: '初稿已成立' },
          lockedValueSwingSystem: { externalValueSpectrum: '沉默到回应' },
          lockedRiskRewardSystem: { globalRisk: '空间站失控', globalReward: '确认生命信号' },
          lockedSequenceSpine: [
            { sequenceNumber: 1, actPosition: 'act1', structuralTurnAnnotation: 'act1_turn', sequenceFunction: '发现异常', valueSwing: '安全到失控', riskRewardShift: '风险升高', outcome: '进入核心舱', nextSequenceTrigger: '核心舱锁死' },
            { sequenceNumber: 2, actPosition: 'act3', structuralTurnAnnotation: 'climax_reversal', sequenceFunction: '回应信号', valueSwing: '恐惧到选择', riskRewardShift: '以生存换回应', outcome: '改变航向', nextSequenceTrigger: '故事结束' },
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        characterIdentityVoiceBible: {
          characterRoster: [
            { characterName: '操作员', dramaticFunction: 'protagonist', valuePosition: '回应未知' },
            { characterName: '空间站系统', dramaticFunction: 'antagonist', valuePosition: '维持沉默' },
          ],
          mirroringMap: { protagonistOpposite: '空间站系统' },
          characterProfiles: [
            {
              characterName: '操作员',
              identityProfile: { profession: '空间站操作员' },
              tasteProfile: { hobbyInterest: '监听旧频段' },
              psychologicalProfile: { coreFear: '无人回应' },
              behaviorProfile: { conflictStyle: '先试探再冒险' },
              voiceProfile: { sentenceRhythm: '短句克制' },
              relationshipVoiceShifts: { underThreat: '更低声' },
            },
          ],
          relationshipVoiceRules: [
            {
              fromCharacter: '操作员',
              toCharacter: '空间站系统',
              initialSocialDistance: '职业操作者与失控系统',
              addressRules: '只用功能称呼',
              disclosureRules: '不直接自白恐惧',
              forbiddenIntimacy: '不得写成亲密同伴',
              stageVoiceProgression: '从命令到质问',
            },
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        sequenceLayer: {
          sequences: [
            { sequenceNumber: 1, sequenceGoal: '发现异常并进入核心舱' },
            { sequenceNumber: 2, sequenceGoal: '理解信号并做出选择' },
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        sceneLayerPackage: {
          sceneLayer: [
            {
              sceneNumber: 1,
              sceneGoal: '确认信号来源',
              sceneAntagonist: '失控的空间站系统',
              outcome: '操作员被迫进入核心舱',
              turningPoint: '舱门从身后锁死',
              relationshipState: {
                primaryPair: '操作员 / 空间站系统',
                stage: '职业控制关系破裂',
                socialDistance: '操作者与系统',
                trustLevel: '低信任',
                powerBalance: '系统暂时夺权',
                knowledgeAsymmetry: '系统隐藏信号真实来源',
                allowedAddressMode: '功能性称呼',
                forbiddenRelationshipLeap: '不得突然像亲密同伴',
                relationshipTurn: '从操作关系转为对抗关系',
              },
            },
            {
              sceneNumber: 2,
              sceneGoal: '切断异常信号',
              sceneAntagonist: '信号中的未知意识',
              outcome: '操作员发现信号正在求救',
              turningPoint: '屏幕显示另一端仍有人存活',
              relationshipState: {
                primaryPair: '操作员 / 未知信号',
                stage: '未知接触',
                socialDistance: '完全陌生',
                trustLevel: '无信任',
                powerBalance: '信息不对等',
                knowledgeAsymmetry: '信号知道自身处境，操作员不知道',
                allowedAddressMode: '试探性称呼',
                forbiddenRelationshipLeap: '不得突然互相信任',
                relationshipTurn: '从噪声对象转为可能生命',
              },
            },
            {
              sceneNumber: 3,
              sceneGoal: '决定是否回应信号',
              sceneAntagonist: '即将关闭的生存系统',
              outcome: '操作员回应信号并改变空间站航向',
              turningPoint: '她把备用电源接入发射阵列',
              relationshipState: {
                primaryPair: '操作员 / 未知信号',
                stage: '有限回应',
                socialDistance: '陌生但承认存在',
                trustLevel: '有限信任',
                powerBalance: '操作员掌握最后回应权',
                knowledgeAsymmetry: '操作员仍不知道对方完整身份',
                allowedAddressMode: '保持试探称呼',
                forbiddenRelationshipLeap: '不得突然写成旧识',
                relationshipTurn: '从拒绝回应转向承担回应',
              },
            },
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        beatLayerPackage: {
          sceneBeatBlocks: [
            {
              sceneNumber: 1,
              beats: [
                {
                  beatNumber: 1,
                  sceneNumber: 1,
                  action: { actor: '操作员', strategy: 'probe', intent: '按下监听键' },
                  reaction: { actor: '空间站系统', strategy: 'force', intent: '锁死舱门' },
                  actionReactionCouple: '试探 ↔ 逼迫',
                  strategyChange: '操作员从远程排查改为进入核心舱',
                  informationChange: 'setup',
                  subtextSeed: '她害怕信号不是机器故障。',
                  valuePressure: {
                    externalPressure: '信号威胁空间站安全',
                    internalPressure: '她必须承认自己想听见回应',
                  },
                  relationshipPressure: {
                    currentStage: '职业控制关系破裂',
                    pressureApplied: '系统锁门迫使操作员承认失控',
                    trustMovement: '信任下降',
                    powerMovement: '系统夺取主动权',
                    distanceMovement: '从工具关系变成对抗关系',
                    forbiddenLeapGuard: '不得写成亲密同伴',
                  },
                  newCondition: '她无法再从外部切断信号',
                },
              ],
            },
          ],
        },
      }),
    })
    .mockResolvedValueOnce({
      text: JSON.stringify({
        dialogueLayer: [
          {
            sceneNumber: 1,
            dialogueBeats: [
              {
                beatNumber: 1,
                speakerName: '操作员',
                dialogue: '别再装成噪声。',
                relationshipExecution: {
                  relationshipStage: '职业控制关系破裂',
                  socialDistanceFit: '仍是命令和质问，不像熟人',
                  disclosureLimitFit: '不直接自白恐惧',
                  intimacyLeapCheck: '没有亲密跳跃',
                },
              },
            ],
          },
        ],
      }),
    })
    .mockResolvedValueOnce({
      text: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
    })
}

describe('edit script generation status persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    aiExecMock.executeAiTextStep.mockReset()
    prismaMock.projectEpisode.findFirst.mockResolvedValue({ id: 'episode-1' })
    prismaMock.project.findFirst.mockResolvedValue({
      id: 'project-1',
      artStyle: 'realistic',
      videoRatio: '9:16',
    })
    prismaMock.projectCharacter.findMany.mockResolvedValue([])
    prismaMock.projectLocation.findMany.mockResolvedValue([])
    prismaMock.projectLocation.findFirst.mockResolvedValue(null)
    prismaMock.projectLocation.create.mockResolvedValue({ id: 'created-location-1' })
    prismaMock.projectEditAssetRequirement.update.mockResolvedValue({})
    assetActionsMock.submitAssetGenerateTask.mockResolvedValue({
      success: true,
      async: true,
      taskId: 'asset-task-1',
      runId: null,
      status: 'queued',
      deduped: false,
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValue({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: mockStyleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'ready',
    })
    prismaMock.projectEditScreenplay.upsert.mockResolvedValue({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: mockStyleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'ready',
    })
    prismaMock.projectEditDirectorDecoupage.findFirst.mockResolvedValue({
      id: 'director-decoupage-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScreenplayId: 'screenplay-1',
      userPrompt: structuredUserPrompt,
      decoupageJson: {
        strategy: 'director_decoupage',
        schemaVersion: 1,
        shots: [
          {
            shotNumber: 1,
            durationSec: 4,
            dramaticPurpose: 'test dramatic purpose',
            visibleAction: 'A station corridor flickers awake.',
            audienceFocus: 'test audience focus',
            viewpoint: 'test viewpoint',
            revealPlan: 'test reveal plan',
            performanceBeat: 'test performance beat',
            continuityIn: 'test continuity in',
            continuityOut: 'test continuity out',
            charactersAndScene: 'Station corridor',
            sound: 'low electrical hum',
          },
        ],
        hardBans: ['no subtitles'],
      },
      status: 'ready',
    })
    prismaMock.task.findFirst.mockResolvedValue(null)
    txMock.projectEditScript.upsert.mockResolvedValue({ id: 'edit-1' })
    txMock.projectEditAssetRequirement.deleteMany.mockResolvedValue({ count: 0 })
    txMock.projectEditAssetRequirement.createMany.mockResolvedValue({ count: 1 })
    txMock.projectEditAssetRequirement.create.mockResolvedValue({ id: 'req-1' })
    prismaMock.projectEditScript.updateMany.mockResolvedValue({ count: 0 })
    txMock.projectLocation.create.mockResolvedValue({ id: 'location-1' })
    txMock.projectCharacter.create.mockResolvedValue({
      id: 'character-1',
      appearances: [{ id: 'appearance-1' }],
    })
    txMock.projectEditStylePreview.deleteMany.mockResolvedValue({ count: 0 })
    txMock.projectEditStylePreview.create.mockImplementation(async (input: {
      data: {
        projectId: string
        episodeId: string
        editScreenplayId: string
        styleKey: string
        aspectRatio: string
        title: string
        summary: string
        styleBibleJson: unknown
        imagePrompt: string
        status: string
      }
    }) => ({
      id: `style-preview-${input.data.styleKey}`,
      projectId: input.data.projectId,
      episodeId: input.data.episodeId,
      editScreenplayId: input.data.editScreenplayId,
      styleKey: input.data.styleKey,
      aspectRatio: input.data.aspectRatio,
      title: input.data.title,
      summary: input.data.summary,
      styleBibleJson: input.data.styleBibleJson,
      imagePrompt: input.data.imagePrompt,
      imageKey: null,
      status: input.data.status,
      taskId: null,
      errorMessage: null,
    }))
    prismaMock.projectEditStylePreview.update.mockResolvedValue({})
    prismaMock.projectEditStylePreview.deleteMany.mockResolvedValue({ count: 0 })
    prismaMock.projectEditStylePreview.updateMany.mockResolvedValue({ count: 0 })
    prismaMock.projectEditStylePreview.findFirst.mockResolvedValue(null)
    txMock.projectEditScript.findUniqueOrThrow.mockResolvedValue({
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
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
          dramaticPurpose: 'test dramatic purpose',
          visibleAction: 'A station corridor flickers awake.',
          audienceFocus: 'test audience focus',
          viewpoint: 'test viewpoint',
          revealPlan: 'test reveal plan',
          performanceBeat: 'test performance beat',
          continuityIn: 'test continuity in',
          continuityOut: 'test continuity out',
          charactersAndScene: 'Station corridor',
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

  it('generates screenplay for user review without starting style preview tasks', async () => {
    mockSuccessfulScreenplayDevelopmentSteps()
    prismaMock.projectEditScreenplay.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: null,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'screenplay_ready',
      stylePreviews: [],
    })

    const screenplay = await generateProjectEditScreenplay({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      prompt: '做一个科幻短片',
      durationTier: 'medium',
      aspectRatio: '16:9',
    })

    expect(screenplay.id).toBe('screenplay-1')
    expect(screenplay.styleBible).toBeNull()
    expect(screenplay.status).toBe('screenplay_ready')
    expect(screenplay.stylePreviews).toHaveLength(0)
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(8)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY_SKELETON,
      temperature: 0.2,
      maxTokens: undefined,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY_SKELETON,
        stepIndex: 1,
        stepTotal: 8,
      }),
    }))
    const firstAiCall = aiExecMock.executeAiTextStep.mock.calls[0]?.[0] as {
      readonly messages?: ReadonlyArray<{ readonly role?: string; readonly content?: unknown }>
    } | undefined
    expect(firstAiCall?.messages?.[0]).toEqual({
      role: 'system',
      content: expect.stringContaining('Return exactly one valid JSON object and nothing else.'),
    })
    expect(firstAiCall?.messages?.[1]).toEqual(expect.objectContaining({
      role: 'user',
      content: expect.stringContaining('Screenplay Skeleton Layer'),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(8, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY,
        stepIndex: 8,
        stepTotal: 8,
      }),
    }))
    expect(prismaMock.projectEditScreenplay.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        userPrompt: expect.stringContaining('场景骨架必须为 3-4 场，推荐 3 场。'),
        screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
        status: 'screenplay_ready',
      }),
      update: expect.objectContaining({
        userPrompt: expect.stringContaining('场景骨架必须为 3-4 场，推荐 3 场。'),
        screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
        status: 'screenplay_ready',
      }),
    }))
    expect(prismaMock.projectEditStylePreview.deleteMany).toHaveBeenCalledWith({
      where: { editScreenplayId: 'screenplay-1' },
    })
    expect(txMock.projectEditStylePreview.create).not.toHaveBeenCalled()
    expect(prismaMock.projectEditStylePreview.update).not.toHaveBeenCalled()
    expect(submitTask).not.toHaveBeenCalled()
    expect(prismaMock.projectEditScript.upsert).not.toHaveBeenCalled()
  })

  it('revises screenplay during review without starting style preview tasks', async () => {
    aiExecMock.executeAiTextStep.mockResolvedValueOnce({
      text: '标题：《深空低语》\n\n故事梗概：空间站收到不可名状的深海星图。',
    })
    prismaMock.projectEditScreenplay.findFirst
      .mockResolvedValueOnce({
        id: 'screenplay-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: [
          '做一个60秒 16:9 科幻短片',
          '',
          '剪辑先行结构化参数：时长档位 medium（中，约 60 秒）；最终画面比例 16:9。',
        ].join('\n'),
        styleBibleJson: null,
        screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
        status: 'screenplay_ready',
      })
      .mockResolvedValueOnce({
        id: 'screenplay-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: structuredRevisedUserPrompt,
        styleBibleJson: null,
        screenplayText: '标题：《深空低语》\n\n故事梗概：空间站收到不可名状的深海星图。',
        status: 'screenplay_ready',
        stylePreviews: [],
      })

    const screenplay = await reviseProjectEditScreenplay({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      revisionInstruction: '改得更克苏鲁一些',
      durationTier: 'medium',
      aspectRatio: '16:9',
    })

    expect(screenplay.status).toBe('screenplay_ready')
    expect(screenplay.screenplayText).toContain('不可名状')
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY_REVISION,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_SCREENPLAY_REVISION,
        stepIndex: 1,
        stepTotal: 1,
      }),
    }))
    expect(prismaMock.projectEditScreenplay.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'screenplay-1' },
      data: expect.objectContaining({
        userPrompt: structuredRevisedUserPrompt,
        screenplayText: '标题：《深空低语》\n\n故事梗概：空间站收到不可名状的深海星图。',
        status: 'screenplay_ready',
      }),
    }))
    expect(prismaMock.projectEditStylePreview.deleteMany).toHaveBeenCalledWith({
      where: { editScreenplayId: 'screenplay-1' },
    })
    expect(txMock.projectEditStylePreview.create).not.toHaveBeenCalled()
    expect(prismaMock.projectEditStylePreview.update).not.toHaveBeenCalled()
    expect(submitTask).not.toHaveBeenCalled()
    expect(prismaMock.projectEditScript.upsert).not.toHaveBeenCalled()
  })

  it('generates screenplay-based style preview tasks after screenplay review', async () => {
    aiExecMock.executeAiTextStep.mockResolvedValueOnce({
      text: JSON.stringify(mockStylePreviewOptions),
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: null,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'screenplay_ready',
      stylePreviews: [],
    })

    const result = await generateProjectEditStylePreviews({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      screenplayId: 'screenplay-1',
      parentTaskId: 'parent-task-1',
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      async: true,
      projectId: 'project-1',
      episodeId: 'episode-1',
      screenplayId: 'screenplay-1',
      status: 'queued',
      total: 3,
      taskIds: ['style-preview-task-1', 'style-preview-task-1', 'style-preview-task-1'],
    }))
    expect(result.stylePreviews.map((preview) => preview.styleKey)).toEqual(['style_a', 'style_b', 'style_c'])
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(1)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_STYLE_PREVIEW_OPTIONS,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_STYLE_PREVIEW_OPTIONS,
        stepIndex: 2,
        stepTotal: 2,
      }),
    }))
    expect(txMock.projectEditStylePreview.create).toHaveBeenCalledTimes(3)
    expect(txMock.projectEditStylePreview.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        styleKey: 'style_a',
        aspectRatio: '9:16',
      }),
    }))
    expect(prismaMock.projectEditScreenplay.update).toHaveBeenCalledWith({
      where: { id: 'screenplay-1' },
      data: {
        status: 'style_preview_generating',
      },
    })
    expect(prismaMock.projectEditStylePreview.update).toHaveBeenCalledTimes(3)
    expect(submitTask).toHaveBeenCalledTimes(3)
    expect(submitTask).toHaveBeenNthCalledWith(1, expect.objectContaining({
      parentTaskId: 'parent-task-1',
      type: 'edit_style_preview_image',
      targetType: 'ProjectEditStylePreview',
      targetId: 'style-preview-style_a',
      payload: expect.objectContaining({
        generationOptions: {
          aspectRatio: '16:9',
        },
      }),
    }))
    expect(prismaMock.projectEditScript.upsert).not.toHaveBeenCalled()
  })

  it('appends regenerated style previews from user direction during style choice without replacing existing candidates', async () => {
    aiExecMock.executeAiTextStep.mockResolvedValueOnce({
      text: JSON.stringify({
        stylePreviews: mockStylePreviewOptions.stylePreviews.slice(0, 2),
      }),
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: null,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'style_preview_ready',
      stylePreviews: mockStylePreviewOptions.stylePreviews.map((preview) => ({
        styleKey: preview.styleKey,
      })),
    })

    const result = await generateProjectEditStylePreviews({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      screenplayId: 'screenplay-1',
      styleDirection: '更黑暗一些，低照度，强阴影',
      count: 2,
    })

    expect(result.total).toBe(2)
    expect(result.stylePreviews.map((preview) => preview.styleKey)).toEqual(['style_a_2', 'style_b_2'])
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_STYLE_PREVIEW_OPTIONS,
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('用户本轮风格调整方向：更黑暗一些，低照度，强阴影'),
        }),
      ]),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledWith(expect.objectContaining({
      messages: expect.arrayContaining([
        expect.objectContaining({
          content: expect.stringContaining('候选数量必须严格等于 2'),
        }),
      ]),
    }))
    expect(txMock.projectEditStylePreview.deleteMany).not.toHaveBeenCalled()
    expect(txMock.projectEditStylePreview.create).toHaveBeenCalledTimes(2)
    expect(txMock.projectEditStylePreview.create).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        styleKey: 'style_a_2',
      }),
    }))
    expect(submitTask).toHaveBeenCalledTimes(2)
  })

  it('reads legacy screenplay without Style Bible as nullable styleBible', async () => {
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'legacy-screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: '旧剧本',
      styleBibleJson: null,
      screenplayText: '旧剧本文本',
      status: 'ready',
      stylePreviews: [],
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
      stylePreviews: [],
      screenplayText: '旧剧本文本',
      status: 'ready',
    })
  })

  it('confirms a completed style preview with the user-selected aspect ratio', async () => {
    prismaMock.projectEditStylePreview.findFirst.mockResolvedValueOnce({
      id: 'style-preview-style_b',
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScreenplayId: 'screenplay-1',
      styleKey: 'style_b',
      aspectRatio: '16:9',
      title: '暖色悬疑',
      summary: '暖光、阴影、悬疑节奏。',
      styleBibleJson: mockStylePreviewOptions.stylePreviews[1].styleBible,
      imagePrompt: mockStylePreviewOptions.stylePreviews[1].gridImagePrompt,
      imageKey: 'style-preview/style-b.png',
      status: 'completed',
      taskId: 'style-preview-task-b',
      errorMessage: null,
      editScreenplay: {
        id: 'screenplay-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: structuredUserPrompt,
        styleBibleJson: null,
        screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
        status: 'style_preview_ready',
        stylePreviews: mockStylePreviewOptions.stylePreviews.map((preview) => ({
          id: `style-preview-${preview.styleKey}`,
          projectId: 'project-1',
          episodeId: 'episode-1',
          editScreenplayId: 'screenplay-1',
          styleKey: preview.styleKey,
          aspectRatio: preview.aspectRatio,
          title: preview.title,
          summary: preview.summary,
          styleBibleJson: preview.styleBible,
          imagePrompt: preview.gridImagePrompt,
          imageKey: `style-preview/${preview.styleKey}.png`,
          status: 'completed',
          taskId: `task-${preview.styleKey}`,
          errorMessage: null,
        })),
      },
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: mockStylePreviewOptions.stylePreviews[1].styleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'ready',
      stylePreviews: mockStylePreviewOptions.stylePreviews.map((preview) => ({
        id: `style-preview-${preview.styleKey}`,
        projectId: 'project-1',
        episodeId: 'episode-1',
        editScreenplayId: 'screenplay-1',
        styleKey: preview.styleKey,
        aspectRatio: preview.aspectRatio,
        title: preview.title,
        summary: preview.summary,
        styleBibleJson: preview.styleBible,
        imagePrompt: preview.gridImagePrompt,
        imageKey: `style-preview/${preview.styleKey}.png`,
        status: preview.styleKey === 'style_b' ? 'confirmed' : 'completed',
        taskId: `task-${preview.styleKey}`,
        errorMessage: null,
      })),
    })

    const screenplay = await confirmProjectEditStylePreview({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      stylePreviewId: 'style-preview-style_b',
      aspectRatio: '9:16',
    })

    expect(prismaMock.projectEditStylePreview.updateMany).toHaveBeenCalledWith({
      where: {
        editScreenplayId: 'screenplay-1',
        status: 'confirmed',
      },
      data: {
        status: 'completed',
      },
    })
    expect(prismaMock.projectEditStylePreview.update).toHaveBeenCalledWith({
      where: { id: 'style-preview-style_b' },
      data: {
        status: 'confirmed',
        errorMessage: null,
      },
    })
    expect(prismaMock.projectEditScreenplay.update).toHaveBeenCalledWith({
      where: { id: 'screenplay-1' },
      data: {
        styleBibleJson: mockStylePreviewOptions.stylePreviews[1].styleBible,
        status: 'ready',
      },
    })
    expect(prismaMock.project.update).toHaveBeenCalledWith({
      where: { id: 'project-1' },
      data: {
        videoRatio: '9:16',
      },
    })
    expect(screenplay.status).toBe('ready')
    expect(screenplay.styleBible?.styleSummary).toBe('warm suspense sci-fi')
    expect(screenplay.stylePreviews.find((preview) => preview.styleKey === 'style_b')?.status).toBe('confirmed')
  })

  it('confirms a completed style preview when sibling preview tasks have failed', async () => {
    const previews = mockStylePreviewOptions.stylePreviews.map((preview) => ({
      id: `style-preview-${preview.styleKey}`,
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScreenplayId: 'screenplay-1',
      styleKey: preview.styleKey,
      aspectRatio: preview.aspectRatio,
      title: preview.title,
      summary: preview.summary,
      styleBibleJson: preview.styleBible,
      imagePrompt: preview.gridImagePrompt,
      imageKey: preview.styleKey === 'style_b' ? `style-preview/${preview.styleKey}.png` : null,
      status: preview.styleKey === 'style_b' ? 'completed' : 'failed',
      taskId: `task-${preview.styleKey}`,
      errorMessage: preview.styleKey === 'style_b' ? null : 'provider balance exhausted',
    }))
    prismaMock.projectEditStylePreview.findFirst.mockResolvedValueOnce({
      id: 'style-preview-style_b',
      projectId: 'project-1',
      episodeId: 'episode-1',
      editScreenplayId: 'screenplay-1',
      styleKey: 'style_b',
      aspectRatio: '16:9',
      title: '暖色悬疑',
      summary: '暖光、阴影、悬疑节奏。',
      styleBibleJson: mockStylePreviewOptions.stylePreviews[1].styleBible,
      imagePrompt: mockStylePreviewOptions.stylePreviews[1].gridImagePrompt,
      imageKey: 'style-preview/style-b.png',
      status: 'completed',
      taskId: 'style-preview-task-b',
      errorMessage: null,
      editScreenplay: {
        id: 'screenplay-1',
        projectId: 'project-1',
        episodeId: 'episode-1',
        userPrompt: structuredUserPrompt,
        styleBibleJson: null,
        screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
        status: 'style_preview_ready',
        stylePreviews: previews,
      },
    })
    prismaMock.projectEditScreenplay.findFirst.mockResolvedValueOnce({
      id: 'screenplay-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: mockStylePreviewOptions.stylePreviews[1].styleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      status: 'ready',
      stylePreviews: previews.map((preview) => ({
        ...preview,
        status: preview.styleKey === 'style_b' ? 'confirmed' : preview.status,
      })),
    })

    const screenplay = await confirmProjectEditStylePreview({
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      stylePreviewId: 'style-preview-style_b',
      aspectRatio: '16:9',
    })

    expect(prismaMock.projectEditStylePreview.update).toHaveBeenCalledWith({
      where: { id: 'style-preview-style_b' },
      data: {
        status: 'confirmed',
        errorMessage: null,
      },
    })
    expect(screenplay.stylePreviews.find((preview) => preview.styleKey === 'style_b')?.status).toBe('confirmed')
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
          dramaticPurpose: 'test dramatic purpose',
          visibleAction: '旧镜头动作',
          audienceFocus: 'test audience focus',
          viewpoint: 'test viewpoint',
          revealPlan: 'test reveal plan',
          performanceBeat: 'test performance beat',
          continuityIn: 'test continuity in',
          continuityOut: 'test continuity out',
          charactersAndScene: '旧场景',
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
      userPrompt: structuredUserPrompt,
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
          dramaticPurpose: 'test dramatic purpose',
          visibleAction: 'A station corridor flickers awake.',
          audienceFocus: 'test audience focus',
          viewpoint: 'test viewpoint',
          revealPlan: 'test reveal plan',
          performanceBeat: 'test performance beat',
          continuityIn: 'test continuity in',
          continuityOut: 'test continuity out',
          charactersAndScene: 'Station corridor',
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

  it('reuses a bound location asset without output instead of creating a duplicate project location', async () => {
    const persistedScript = {
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
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
          dramaticPurpose: 'test dramatic purpose',
          visibleAction: 'A station corridor flickers awake.',
          audienceFocus: 'test audience focus',
          viewpoint: 'test viewpoint',
          revealPlan: 'test reveal plan',
          performanceBeat: 'test performance beat',
          continuityIn: 'test continuity in',
          continuityOut: 'test continuity out',
          charactersAndScene: 'Station corridor',
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
          status: 'pending',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    }
    prismaMock.projectEditScript.findFirst
      .mockResolvedValueOnce(persistedScript)
      .mockResolvedValueOnce(persistedScript)
    prismaMock.projectLocation.findFirst.mockResolvedValue({
      id: 'location-1',
      selectedImageId: null,
      images: [
        {
          id: 'location-image-1',
          imageUrl: null,
          imageMediaId: null,
          isSelected: false,
          spatialProfileJson: null,
          spatialProfileStatus: null,
          spatialProfileError: null,
          spatialProfileAnalyzedAt: null,
          spatialProfileModel: null,
        },
      ],
    })

    const result = await generateProjectEditScriptAssets({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editScriptId: 'edit-1',
      requirementId: 'requirement-1',
    })

    expect(result).toEqual(expect.objectContaining({
      success: true,
      async: true,
      taskIds: ['asset-task-1'],
      results: [{
        refId: 'requirement-1',
        taskId: 'asset-task-1',
        taskType: 'image_location',
        targetType: 'LocationImage',
        targetId: 'location-1',
      }],
    }))
    expect(result.editScript.requirements[0]).toEqual(expect.objectContaining({
      id: 'requirement-1',
      targetId: 'location-1',
    }))
    expect(prismaMock.projectLocation.create).not.toHaveBeenCalled()
    expect(prismaMock.projectEditAssetRequirement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'requirement-1' },
      data: expect.objectContaining({
        targetId: 'location-1',
        status: 'generating',
      }),
    }))
    expect(assetActionsMock.submitAssetGenerateTask).toHaveBeenCalledWith(expect.objectContaining({
      episodeId: 'episode-1',
      kind: 'location',
      assetId: 'location-1',
      access: expect.objectContaining({
        projectId: 'project-1',
        scope: 'project',
      }),
    }))
  })

  it('fails edit script asset generation when every requirement task submission fails', async () => {
    const persistedScript = {
      id: 'edit-1',
      projectId: 'project-1',
      episodeId: 'episode-1',
      userPrompt: structuredUserPrompt,
      styleBibleJson: mockStyleBible,
      screenplayText: '标题：《科幻短片》\n\n故事梗概：一条安静信号唤醒空间站。',
      title: 'Sci-Fi Short',
      logline: 'A quiet signal wakes a station.',
      durationSec: 4,
      shotCount: 1,
      status: 'ready',
      assetReviewStatus: 'pending',
      shotsJson: [
        {
          shotNumber: 1,
          durationSec: 4,
          dramaticPurpose: 'test dramatic purpose',
          visibleAction: 'A station corridor flickers awake.',
          audienceFocus: 'test audience focus',
          viewpoint: 'test viewpoint',
          revealPlan: 'test reveal plan',
          performanceBeat: 'test performance beat',
          continuityIn: 'test continuity in',
          continuityOut: 'test continuity out',
          charactersAndScene: 'Station corridor',
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
          status: 'pending',
          targetId: 'location-1',
          errorMessage: null,
        },
      ],
    }
    prismaMock.projectEditScript.findFirst
      .mockResolvedValueOnce(persistedScript)
      .mockResolvedValueOnce(persistedScript)
    prismaMock.projectLocation.findFirst.mockResolvedValue({
      id: 'location-1',
      selectedImageId: null,
      images: [
        {
          id: 'location-image-1',
          imageUrl: null,
          imageMediaId: null,
          isSelected: false,
          spatialProfileJson: null,
          spatialProfileStatus: null,
          spatialProfileError: null,
          spatialProfileAnalyzedAt: null,
          spatialProfileModel: null,
        },
      ],
    })
    assetActionsMock.submitAssetGenerateTask.mockRejectedValueOnce(new Error('BILLING_CAPABILITY_PRICE_NOT_FOUND:image fal::gpt-image-2'))

    await expect(generateProjectEditScriptAssets({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
      editScriptId: 'edit-1',
      requirementId: 'requirement-1',
    })).rejects.toMatchObject({
      code: 'INVALID_PARAMS',
      message: 'No edit script asset generation tasks were submitted.',
      details: expect.objectContaining({
        code: 'EDIT_SCRIPT_ASSET_GENERATION_FAILED',
        failedRequirements: [
          {
            requirementId: 'requirement-1',
            kind: 'location',
            name: 'Station Corridor',
            errorMessage: 'BILLING_CAPABILITY_PRICE_NOT_FOUND:image fal::gpt-image-2',
          },
        ],
      }),
    })
    expect(prismaMock.projectEditAssetRequirement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'requirement-1' },
      data: expect.objectContaining({
        targetId: 'location-1',
        status: 'generating',
      }),
    }))
    expect(prismaMock.projectEditAssetRequirement.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'requirement-1' },
      data: expect.objectContaining({
        targetId: 'location-1',
        status: 'failed',
        errorMessage: 'BILLING_CAPABILITY_PRICE_NOT_FOUND:image fal::gpt-image-2',
      }),
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
        userPrompt: structuredUserPrompt,
        styleBibleJson: mockStyleBible,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
        shotCount: 0,
        shotsJson: [],
        videoBlocksJson: [],
      }),
      update: expect.objectContaining({
        status: 'generating',
        userPrompt: structuredUserPrompt,
        styleBibleJson: mockStyleBible,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
        shotCount: 0,
        shotsJson: [],
        videoBlocksJson: [],
      }),
    }))
    expect(prismaMock.projectEditScript.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      aiExecMock.executeAiTextStep.mock.invocationCallOrder[0],
    )
    expect(aiExecMock.executeAiTextStep).toHaveBeenCalledTimes(2)
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(1, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_PRIMARY,
        stepIndex: 1,
        stepTotal: 2,
      }),
    }))
    expect(aiExecMock.executeAiTextStep).toHaveBeenNthCalledWith(2, expect.objectContaining({
      action: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
      meta: expect.objectContaining({
        stepId: AI_PROMPT_IDS.EDIT_SCRIPT_ASSET_EXTRACT,
        stepIndex: 2,
        stepTotal: 2,
      }),
    }))
    expect(txMock.projectEditScript.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        styleBibleJson: mockStyleBible,
        screenplayText: expect.stringContaining('标题：《科幻短片》'),
      }),
      update: expect.objectContaining({
        status: 'ready',
        styleBibleJson: mockStyleBible,
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
        styleBibleJson: mockStyleBible,
        shotsJson: [
          expect.objectContaining({
            shotNumber: 1,
            dramaticPurpose: 'test dramatic purpose',
            visibleAction: 'A station corridor flickers awake.',
            audienceFocus: 'test audience focus',
            viewpoint: 'test viewpoint',
            revealPlan: 'test reveal plan',
            performanceBeat: 'test performance beat',
            continuityIn: 'test continuity in',
            continuityOut: 'test continuity out',
            charactersAndScene: 'Station corridor',
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
        styleBibleJson: mockStyleBible,
        logline: 'LLM_DOWN',
      }),
    }))
  })

  it('marks an existing generating edit script failed when model config resolution throws before prompt execution', async () => {
    const message = 'PLATFORM_DEFAULT_MODEL_NOT_FOUND: analysisModel=openrouter::google/gemini-3.5-flash'
    vi.mocked(getProjectModelConfig).mockRejectedValueOnce(new Error(message))

    await expect(generateProjectEditScript({
      request: createRequest(),
      projectId: 'project-1',
      episodeId: 'episode-1',
      userId: 'user-1',
      locale: 'zh',
    })).rejects.toThrow(message)

    expect(prismaMock.projectEditScript.upsert).not.toHaveBeenCalled()
    expect(prismaMock.projectEditScript.updateMany).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        status: 'generating',
      },
      data: {
        title: 'Edit table generation failed',
        logline: message,
        status: 'failed',
      },
    })
  })
})
