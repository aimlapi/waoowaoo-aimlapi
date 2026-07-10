import type { AiPromptLocale } from '@/lib/ai-prompts'
import { buildLyriaPrompt } from '@/lib/audio-design/lyria-prompt'
import { framesToSeconds, type ScoreCue, type TimelineClock } from '@/lib/audio-design/types'
import type { BgmScorePlan } from './types'

function humanize(value: string): string {
  return value.replace(/_/g, ' ')
}

function localized(locale: AiPromptLocale | undefined, zh: string, en: string): string {
  return locale === 'zh' ? zh : en
}

export function buildDisplayBgmPlan(input: {
  readonly cue: ScoreCue
  readonly clock: TimelineClock
  readonly locale?: AiPromptLocale
}): BgmScorePlan {
  const spec = input.cue.generationSpec
  const durationSeconds = framesToSeconds(
    input.cue.range.endFrameExclusive - input.cue.range.startFrame,
    input.clock,
  )
  const finalPrompt = buildLyriaPrompt({ cue: input.cue, clock: input.clock })
  const sections = spec.sections.map((section) => ({
    category: localized(input.locale, '音乐结构', 'Musical structure'),
    title: humanize(section.function),
    purpose: localized(input.locale, '在连续配乐内部塑造能量、密度和和声张力', 'Shape energy, density, and harmonic tension inside the continuous cue'),
    startSec: framesToSeconds(section.range.startFrame, input.clock),
    endSec: framesToSeconds(section.range.endFrameExclusive, input.clock),
    content: localized(
      input.locale,
      `${humanize(section.density)} 密度，能量 ${Math.round(section.energy * 100)}%，和声张力 ${Math.round(section.harmonicTension * 100)}%`,
      `${humanize(section.density)} density, ${Math.round(section.energy * 100)}% energy, ${Math.round(section.harmonicTension * 100)}% harmonic tension`,
    ),
  }))
  const virtualLayers = spec.instruments.map((instrument) => ({
    name: humanize(instrument),
    purpose: localized(input.locale, '连续主配乐内部的编曲职责', 'Arrangement role inside the continuous master cue'),
    content: localized(input.locale, '保持和声、乐句和动态连续，不作为独立生成轨道', 'Remain harmonically, rhythmically, and dynamically coherent; not independently generated'),
  }))

  return {
    durationSeconds,
    creativeBrief: {
      cueType: localized(input.locale, '跨镜头连续纯器乐配乐', 'continuous cross-shot instrumental underscore'),
      genre: humanize(spec.style),
      mood: humanize(spec.emotionalProfile),
      narrativeFunction: localized(input.locale, '通过连续音乐结构服务剧情，不在镜头切点重启', 'Support narrative through continuous musical form without restarting at shot cuts'),
    },
    scoreDesign: {
      overview: localized(
        input.locale,
        `${spec.bpm} BPM，${spec.key}，${spec.meter}，${humanize(spec.harmonicLanguage)}，整体 ${humanize(spec.density)} 密度`,
        `${spec.bpm} BPM, ${spec.key}, ${spec.meter}, ${humanize(spec.harmonicLanguage)}, ${humanize(spec.density)} overall density`,
      ),
      sections,
    },
    virtualLayers,
    promptSections: sections.map((section) => ({
      ...section,
      category: undefined,
      purpose: localized(input.locale, '由确定性 Lyria Prompt Builder 生成', 'Rendered by the deterministic Lyria Prompt Builder'),
    })),
    finalPrompt,
    negativePrompt: 'no vocals, no lyrics, no spoken word, no dialogue, no literal sound effects, no footsteps, no object sounds, no environmental field recording',
  }
}

export function buildFinalBgmMusicPrompt(plan: BgmScorePlan): string {
  return plan.finalPrompt
}
