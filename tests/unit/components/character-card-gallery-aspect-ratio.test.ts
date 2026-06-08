import * as React from 'react'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { NextIntlClientProvider } from 'next-intl'
import type { AbstractIntlMessages } from 'next-intl'
import type { CharacterAppearanceCandidateMetadata } from '@/types/character-casting'

vi.mock('@/components/ui/icons', () => ({
  AppIcon: () => createElement('span', null),
}))

vi.mock('@/components/task/TaskStatusOverlay', () => ({
  default: () => createElement('div', null, 'overlay'),
}))

vi.mock('@/components/media/MediaImageWithLoading', () => ({
  MediaImageWithLoading: (props: { containerClassName?: string; className?: string }) =>
    createElement('div', { className: [props.containerClassName, props.className].filter(Boolean).join(' ') }),
}))

const messages = {
  assets: {
    common: {
      generateFailed: '生成失败',
    },
    image: {
      optionNumber: '方案 {number}',
      useThis: '使用此方案',
      cancelSelection: '取消选择',
    },
    casting: {
      optionNotes: '选角',
      score: '{score}分',
      details: '查看评分详情',
      recommendation: '推荐理由',
      strengths: '优势',
      risks: '风险',
      criteria: '评分维度',
      stills: '定妆：',
      risk: '风险：{risk}',
    },
  },
} as const

const TestIntlProvider = NextIntlClientProvider as React.ComponentType<{
  locale: string
  messages: AbstractIntlMessages
  timeZone: string
  children?: React.ReactNode
}>

describe('CharacterCardGallery aspect ratio', () => {
  it('renders the single-image slot at a fixed 3:2 ratio', async () => {
    Reflect.set(globalThis, 'React', React)
    const { default: CharacterCardGallery } = await import('@/features/project-workspace/components/assets/character-card/CharacterCardGallery')

    const html = renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(CharacterCardGallery, {
          mode: 'single',
          characterName: '沈烬',
          changeReason: '默认形象',
          aspectClassName: 'aspect-[3/2]',
          currentImageUrl: null,
          selectedIndex: null,
          hasMultipleImages: false,
          isAppearanceTaskRunning: true,
          displayTaskPresentation: null,
          onImageClick: () => undefined,
          overlayActions: null,
        }),
      ),
    )

    expect(html).toContain('aspect-[3/2]')
  })

  it('renders expandable casting scoring details without truncating the source text', async () => {
    Reflect.set(globalThis, 'React', React)
    const { default: CharacterCardGallery } = await import('@/features/project-workspace/components/assets/character-card/CharacterCardGallery')
    const metadata: CharacterAppearanceCandidateMetadata = {
      description: '候选一',
      visualTraits: {
        face: '沟壑很深的窄脸',
        hair: '稀疏灰白短发',
        body: '佝偻瘦削',
        costume: '旧棉袄',
        makeupAndAccessories: '',
        skin: '',
        visibleState: '',
        accessibility: '',
        tattoosAndMarks: '',
        scars: '',
      },
      castingNotes: {
        score: 88,
        recommendation: '这组候选保留了穷困潦倒的生活压迫感，同时在暴富后仍然能看到没有被金钱洗掉的局促、贪婪和自卑。',
        strengths: ['年龄和处境可信', '造型能承接剧情反差'],
        risks: ['如果表情过喜剧化，会削弱荒诞现实主义的质感'],
        fitTags: ['角色贴合: 9/10', '风格一致: 8/10'],
      },
      castingStills: [],
    }

    const html = renderToStaticMarkup(
      createElement(
        TestIntlProvider,
        {
          locale: 'zh',
          messages: messages as unknown as AbstractIntlMessages,
          timeZone: 'Asia/Shanghai',
        },
        createElement(CharacterCardGallery, {
          mode: 'selection',
          characterId: 'character-1',
          appearanceId: 'appearance-1',
          characterName: '老周',
          imageUrlsWithIndex: [{ url: 'https://example.com/candidate.png', originalIndex: 0 }],
          candidateMetadata: [metadata],
          selectedIndex: null,
          isGroupTaskRunning: false,
          isImageTaskRunning: () => false,
          displayTaskPresentation: null,
          onImageClick: () => undefined,
          onSelectImage: () => undefined,
        }),
      ),
    )

    expect(html).toContain('查看评分详情')
    expect(html).toContain('推荐理由')
    expect(html).toContain(metadata.castingNotes.recommendation)
    expect(html).toContain('年龄和处境可信')
    expect(html).toContain('如果表情过喜剧化')
    expect(html).toContain('角色贴合: 9/10')
  })
})
