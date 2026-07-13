import type { AiPromptLocale } from '@/lib/ai-prompts'
import {
  buildLyriaPrompts,
  type LyriaPromptPair,
} from '@/lib/audio-design/lyria-prompt'
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
  const spec = input.cue.musicTheorySpec
  const durationSeconds = framesToSeconds(
    input.cue.range.endFrameExclusive - input.cue.range.startFrame,
    input.clock,
  )
  const providerPrompts = buildLyriaPrompts({
    cue: input.cue,
    clock: input.clock,
    strategy: 'balanced_ensemble',
  })
  const sections = spec.phases.map((phase) => ({
    category: localized(input.locale, '音乐结构', 'Musical structure'),
    title: humanize(phase.function),
    purpose: localized(input.locale, '在连续配乐内部塑造能量、密度、频谱和瞬态变化', 'Shape energy, density, spectrum, and transient behavior inside the continuous cue'),
    startSec: framesToSeconds(phase.range.startFrame, input.clock),
    endSec: framesToSeconds(phase.range.endFrameExclusive, input.clock),
    content: localized(
      input.locale,
      `${humanize(phase.density)} 密度，能量 ${Math.round(phase.energy * 100)}%，${humanize(phase.spectralBand)} 频谱重心，瞬态密度 ${Math.round(phase.transientDensity * 100)}%`,
      `${humanize(phase.density)} density, ${Math.round(phase.energy * 100)}% energy, ${humanize(phase.spectralBand)} spectral focus, ${Math.round(phase.transientDensity * 100)}% transient density`,
    ),
  }))
  const virtualLayers = spec.orchestration.map((part) => ({
    name: humanize(part.instrument),
    purpose: localized(input.locale, `${humanize(part.role)} 职责`, `${humanize(part.role)} role`),
    content: localized(
      input.locale,
      `${humanize(part.register)} 音区；${part.techniques.map(humanize).join('、')}；保持整体连续，不作为独立生成轨道`,
      `${humanize(part.register)} register; ${part.techniques.map(humanize).join(', ')}; remain continuous inside the master cue, not an independently generated stem`,
    ),
  }))

  return {
    durationSeconds,
    creativeBrief: {
      cueType: localized(input.locale, '跨镜头连续纯器乐配乐', 'continuous cross-shot instrumental underscore'),
      genre: humanize(spec.form),
      mood: `${humanize(spec.pitch.centerType)} / ${humanize(spec.harmony.cadencePolicy)}`,
      narrativeFunction: localized(input.locale, '通过连续音乐结构服务剧情，不在镜头切点重启', 'Support narrative through continuous musical form without restarting at shot cuts'),
    },
    scoreDesign: {
      overview: localized(
        input.locale,
        `${spec.bpm} BPM，${spec.meter}，${humanize(spec.pitch.centerType)}，${humanize(spec.harmony.cadencePolicy)}，整体 ${humanize(spec.texture.density)} 密度`,
        `${spec.bpm} BPM, ${spec.meter}, ${humanize(spec.pitch.centerType)}, ${humanize(spec.harmony.cadencePolicy)}, ${humanize(spec.texture.density)} overall density`,
      ),
      sections,
    },
    virtualLayers,
    promptSections: sections.map((section) => ({
      ...section,
      category: undefined,
      purpose: localized(input.locale, '由确定性 Lyria Prompt Builder 生成', 'Rendered by the deterministic Lyria Prompt Builder'),
    })),
    finalPrompt: providerPrompts.prompt,
    negativePrompt: providerPrompts.negativePrompt,
  }
}

export function buildFinalBgmMusicRequests(input: {
  readonly cue: ScoreCue
  readonly clock: TimelineClock
}): readonly LyriaPromptPair[] {
  return input.cue.musicTheorySpec.renderStrategies.map((strategy) => buildLyriaPrompts({
    cue: input.cue,
    clock: input.clock,
    strategy,
  }))
}
