type Locale = 'zh' | 'en'

export function buildLocationImagePromptCore(params: {
  description: string
  locale: Locale
}): string {
  const promptBody = params.description.trim()

  const fidelityConstraints = params.locale === 'en'
    ? 'Treat the scene description as authoritative. Preserve the core scene identity, fixed structures, built-in elements, materials, era cues, and spatial relationships; do not replace it with a different scene category.'
    : '必须以场景描述为最高优先级，保留核心场景身份、固定结构、内建要素、材质、时代感和空间关系，不要替换成其他场景类型。'

  const assetContentConstraints = params.locale === 'en'
    ? 'Keep only the location itself: no person, crowd, loose furniture, or prop presented as an independent asset subject. Fixed structures and built-in elements that constitute the location remain allowed. Do not prescribe aspect ratio or a competing layout; the execution policy applies the fixed location-asset format.'
    : '只保留场景本身：不加入人物、人群、松散家具或作为独立资产主体的道具；构成场景本身的固定结构与内建要素可以保留。不要自定画幅或另一套版式，固定场景资产图格式由执行 policy 统一追加。'

  const noMarkConstraints = params.locale === 'en'
    ? 'Do not add non-diegetic overlays such as subtitles, captions, explanatory text, watermarks, annotation labels, arrows, guide lines, marking lines, outline placeholders, UI markers, map labels, or blueprint graphics. Natural in-world text may remain only when it is integrated into the described location, such as a built-in sign or door number; keep it secondary and natural.'
    : '不要添加非场景内的叠加元素，例如字幕、说明文字、水印、注释标签、箭头、引导线、标注线、轮廓占位、UI 标记、地图标签、平面图或蓝图式图形。场景世界里自然存在的文字只有在属于场景内建要素时才可保留，例如固定招牌或门牌；保持次要且自然。'

  return `${promptBody}\n\n${fidelityConstraints}\n${assetContentConstraints}\n${noMarkConstraints}`.trim()
}
