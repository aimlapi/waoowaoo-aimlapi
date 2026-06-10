import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { callRoute } from '../integration/api/helpers/call-route'
import { installAuthMocks, mockAuthenticated, resetAuthMockState } from '../helpers/auth'
import { resetSystemState } from '../helpers/db-reset'
import { prisma } from '../helpers/prisma'
import { seedMinimalDomainState } from './helpers/seed'
import { expectLifecycleEvents, listTaskEventTypes, waitForTaskTerminalState } from './helpers/tasks'
import { startSystemWorkers, stopSystemWorkers, type SystemWorkers } from './helpers/workers'

const imageState = vi.hoisted(() => ({
  mode: 'success' as 'success' | 'fatal',
  cosKey: 'cos/system-image-generated.png',
  errorMessage: 'IMAGE_GENERATION_FATAL',
}))

const castingPlanDocument = vi.hoisted(() => ({
  characterDNA: {
    ageRange: '五十到六十岁',
    gender: '男性',
    ethnicityRegion: '中国北方旧城',
    socialClass: '底层小市民',
    occupation: '无稳定职业',
    temperament: '怯懦又虚张声势',
    coreWound: '长期贫困和无后的羞耻',
    desireNeed: '想被承认还能留下后代',
    narrativeFunction: '推动求子荒诞事件',
    bodyEnergy: '被生活压弯又硬撑体面',
    styleCompatibility: '自然主义真人影像',
  },
  castingDirections: [
    {
      id: 'A',
      candidateIndex: 0,
      directionName: 'A 生活真实路线',
      interpretationLogic: '普通旧城老光棍，把荒诞藏在低存在感里。',
      faceFamily: '圆短松软脸',
      bodyType: '矮瘦塌肩',
      emotionalTemperature: '怯懦迟疑',
      screenPresence: '低存在感但可信',
      appearanceDescriptor: {
        faceShape: '圆短脸',
        boneStructure: '低颧骨圆下颌',
        eyes: '眼距宽且闪躲',
        nose: '短鼻梁圆鼻头',
        lips: '薄唇下垂',
        skinTexture: '蜡黄粗糙',
        hairstyle: '稀疏地中海',
        bodyType: '矮瘦塌肩',
        posture: '背微驼手贴身',
        wardrobe: '洗旧灰夹克',
        visualKeywords: ['生活真实', '低存在感'],
      },
      imagePrompt: 'This is casting alternative A for the same character. same character DNA, different actor-like interpretation. Round short face, low cheekbones, evasive eyes, worn gray jacket.',
    },
    {
      id: 'B',
      candidateIndex: 1,
      directionName: 'B 荒诞体面路线',
      interpretationLogic: '用夸张体面掩盖底层羞耻感。',
      faceFamily: '宽短肉感脸',
      bodyType: '短壮前倾',
      emotionalTemperature: '热切焦躁',
      screenPresence: '滑稽但有压迫感',
      appearanceDescriptor: {
        faceShape: '宽短脸',
        boneStructure: '宽下颌厚颧骨',
        eyes: '小眼紧盯',
        nose: '宽鼻翼塌鼻梁',
        lips: '厚唇紧抿',
        skinTexture: '油亮粗糙',
        hairstyle: '短硬稀发',
        bodyType: '短壮前倾',
        posture: '胸口前顶',
        wardrobe: '皱亮红衬衫',
        visualKeywords: ['荒诞体面', '焦躁'],
      },
      imagePrompt: 'This is casting alternative B for the same character. same character DNA, different actor-like interpretation. Broad short face, thick jaw, tense eyes, red shirt.',
    },
    {
      id: 'C',
      candidateIndex: 2,
      directionName: 'C 阴郁脆弱路线',
      interpretationLogic: '把荒诞事件拍成一个被命运压垮的人。',
      faceFamily: '长窄凹陷脸',
      bodyType: '瘦长佝偻',
      emotionalTemperature: '阴郁疲惫',
      screenPresence: '脆弱且电影感',
      appearanceDescriptor: {
        faceShape: '长窄脸',
        boneStructure: '高颧骨凹面颊',
        eyes: '深眼窝垂眼',
        nose: '长鼻梁尖鼻头',
        lips: '干薄唇',
        skinTexture: '灰黄有斑',
        hairstyle: '油塌稀发',
        bodyType: '瘦长佝偻',
        posture: '脖颈前伸',
        wardrobe: '旧深色外套',
        visualKeywords: ['阴郁', '脆弱'],
      },
      imagePrompt: 'This is casting alternative C for the same character. same character DNA, different actor-like interpretation. Long narrow hollow face, deep-set eyes, stooped posture.',
    },
  ],
  diversityCheck: {
    AB: 'face shape, body type and screen presence differ',
    AC: 'bone structure, eyes and posture differ',
    BC: 'face family, emotional temperature and wardrobe differ',
    passed: true,
  },
}))

vi.mock('@/lib/character-casting/casting-plan', async () => {
  const actual = await vi.importActual<typeof import('@/lib/character-casting/casting-plan')>(
    '@/lib/character-casting/casting-plan',
  )
  return {
    ...actual,
    generateCharacterCastingPlanDocument: vi.fn(async () => castingPlanDocument),
  }
})

vi.mock('@/lib/workers/handlers/image-task-handler-shared', async () => {
  const actual = await vi.importActual<typeof import('@/lib/workers/handlers/image-task-handler-shared')>(
    '@/lib/workers/handlers/image-task-handler-shared',
  )
  return {
    ...actual,
    generateCleanImageToStorage: vi.fn(async () => {
      if (imageState.mode === 'fatal') {
        throw new Error(imageState.errorMessage)
      }
      return imageState.cosKey
    }),
  }
})

vi.mock('@/lib/media/outbound-image', async () => {
  const actual = await vi.importActual<typeof import('@/lib/media/outbound-image')>('@/lib/media/outbound-image')
  return {
    ...actual,
    normalizeReferenceImagesForGeneration: vi.fn(async (refs: string[]) => refs.map((item) => `normalized:${item}`)),
  }
})

describe('system - generate image', () => {
  let workers: SystemWorkers = {}

  beforeEach(async () => {
    vi.resetModules()
    vi.clearAllMocks()
    imageState.mode = 'success'
    imageState.cosKey = 'cos/system-image-generated.png'
    imageState.errorMessage = 'IMAGE_GENERATION_FATAL'
    await resetSystemState()
    installAuthMocks()
  })

  afterEach(async () => {
    await stopSystemWorkers(workers)
    workers = {}
    resetAuthMockState()
  })

  it('route -> queue -> worker -> db writes imageUrl and lifecycle events', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    workers = await startSystemWorkers(['image'])

    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        type: 'character',
        id: seeded.character.id,
        appearanceId: seeded.appearance.id,
        count: 1,
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { async: boolean; taskId: string }
    expect(json.async).toBe(true)
    expect(typeof json.taskId).toBe('string')

    const task = await waitForTaskTerminalState(json.taskId)
    expect(task.status).toBe('completed')
    expect(task.type).toBe('image_character')
    expect(task.targetId).toBe(seeded.appearance.id)

    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    expect(appearance).toEqual({
      imageUrl: imageState.cosKey,
      imageUrls: JSON.stringify([imageState.cosKey]),
      selectedIndex: 0,
    })

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'completed')
  })

  it('fatal provider path -> task fails and existing appearance images stay unchanged', async () => {
    const seeded = await seedMinimalDomainState()
    mockAuthenticated(seeded.user.id)
    imageState.mode = 'fatal'
    imageState.errorMessage = 'IMAGE_GENERATION_FATAL'
    workers = await startSystemWorkers(['image'])

    const originalAppearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })

    const mod = await import('@/app/api/projects/[projectId]/generate-image/route')
    const response = await callRoute(
      mod.POST,
      'POST',
      {
        locale: 'zh',
        type: 'character',
        id: seeded.character.id,
        appearanceId: seeded.appearance.id,
        count: 1,
      },
      { params: { projectId: seeded.project.id } },
    )

    expect(response.status).toBe(200)
    const json = await response.json() as { taskId: string }
    const task = await waitForTaskTerminalState(json.taskId)
    expect(task.status).toBe('failed')
    expect(task.errorMessage).toContain('IMAGE_GENERATION_FATAL')

    const appearance = await prisma.characterAppearance.findUnique({
      where: { id: seeded.appearance.id },
      select: { imageUrl: true, imageUrls: true, selectedIndex: true },
    })
    expect(appearance).toEqual(originalAppearance)

    const eventTypes = await listTaskEventTypes(json.taskId)
    expectLifecycleEvents(eventTypes, 'failed')
  })
})
