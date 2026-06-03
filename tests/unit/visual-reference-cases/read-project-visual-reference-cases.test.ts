import { beforeEach, describe, expect, it, vi } from 'vitest'

const prismaMock = vi.hoisted(() => ({
  task: {
    findFirst: vi.fn(),
  },
  projectVisualReferenceCase: {
    findMany: vi.fn(),
  },
}))

vi.mock('@/lib/prisma', () => ({ prisma: prismaMock }))

import { readProjectVisualReferenceCases } from '@/lib/visual-reference-cases/service'

interface VisualReferenceCaseTestRow {
  readonly id: string
  readonly projectId: string
  readonly episodeId: string
  readonly screenplayId: string
  readonly title: string
  readonly description: string
  readonly prompt: string
  readonly status: string
  readonly taskId: string | null
  readonly errorMessage: string | null
  readonly imageUrl: string | null
  readonly isSelected: boolean
  readonly sortIndex: number
  readonly createdAt: Date
  readonly updatedAt: Date
  readonly imageMedia: null
}

function buildCaseRow(overrides: Partial<VisualReferenceCaseTestRow>): VisualReferenceCaseTestRow {
  const now = new Date('2026-01-01T00:00:00.000Z')
  return {
    id: 'case-id',
    projectId: 'project-1',
    episodeId: 'episode-1',
    screenplayId: 'screenplay-1',
    title: '视觉参考',
    description: '描述',
    prompt: '提示词',
    status: 'completed',
    taskId: 'task-old',
    errorMessage: null,
    imageUrl: '/m/old',
    isSelected: false,
    sortIndex: 0,
    createdAt: now,
    updatedAt: now,
    imageMedia: null,
    ...overrides,
  }
}

describe('readProjectVisualReferenceCases', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    prismaMock.task.findFirst.mockResolvedValue({ id: 'task-new' })
  })

  it('shows the latest task batch instead of mixing old visual reference attempts', async () => {
    prismaMock.projectVisualReferenceCase.findMany.mockResolvedValue([
      buildCaseRow({
        id: 'new-case-2',
        taskId: 'task-new',
        imageUrl: '/m/new-2',
        sortIndex: 1,
        createdAt: new Date('2026-01-01T00:05:01.000Z'),
      }),
      buildCaseRow({
        id: 'new-case-1',
        taskId: 'task-new',
        imageUrl: '/m/new-1',
        sortIndex: 0,
        createdAt: new Date('2026-01-01T00:05:00.000Z'),
      }),
    ])

    const cases = await readProjectVisualReferenceCases({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(cases.map((item) => item.id)).toEqual(['new-case-1', 'new-case-2'])
    expect(prismaMock.projectVisualReferenceCase.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        OR: [
          { taskId: 'task-new' },
          { isSelected: true },
        ],
      },
    }))
    expect(prismaMock.task.findFirst).toHaveBeenCalledWith({
      where: {
        projectId: 'project-1',
        episodeId: 'episode-1',
        type: 'visual_reference_cases',
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    })
  })

  it('keeps a selected older case visible alongside the latest batch', async () => {
    prismaMock.projectVisualReferenceCase.findMany.mockResolvedValue([
      buildCaseRow({
        id: 'selected-old-case',
        taskId: 'task-old',
        imageUrl: '/m/selected-old',
        isSelected: true,
        sortIndex: 1,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
      }),
      buildCaseRow({
        id: 'unselected-old-case',
        taskId: 'task-old',
        imageUrl: '/m/unselected-old',
        sortIndex: 0,
        createdAt: new Date('2026-01-01T00:00:01.000Z'),
      }),
      buildCaseRow({
        id: 'latest-case',
        taskId: 'task-new',
        imageUrl: '/m/latest',
        sortIndex: 0,
        createdAt: new Date('2026-01-01T00:05:00.000Z'),
      }),
    ])

    const cases = await readProjectVisualReferenceCases({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(cases.map((item) => item.id)).toEqual(['selected-old-case', 'latest-case'])
    expect(cases.find((item) => item.id === 'selected-old-case')?.isSelected).toBe(true)
  })

  it('uses the latest task rather than a late-created row from an older task', async () => {
    prismaMock.projectVisualReferenceCase.findMany.mockResolvedValue([
      buildCaseRow({
        id: 'old-task-late-case',
        taskId: 'task-old',
        imageUrl: '/m/old-late',
        sortIndex: 2,
        createdAt: new Date('2026-01-01T00:10:00.000Z'),
      }),
      buildCaseRow({
        id: 'latest-task-case',
        taskId: 'task-new',
        imageUrl: '/m/latest',
        sortIndex: 0,
        createdAt: new Date('2026-01-01T00:05:00.000Z'),
      }),
    ])

    const cases = await readProjectVisualReferenceCases({
      projectId: 'project-1',
      episodeId: 'episode-1',
    })

    expect(cases.map((item) => item.id)).toEqual(['latest-task-case'])
  })
})
