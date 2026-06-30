type Locale = 'zh' | 'en'

export function buildLocationImagePromptCore(params: {
  description: string
  locale: Locale
}): string {
  const promptBody = params.description.trim()

  const fidelityConstraints = params.locale === 'en'
    ? 'Treat the scene description as authoritative. Preserve the core scene identity, visible objects, materials, era cues, and spatial relationships; do not replace it with a different scene category.'
    : '必须以场景描述为最高优先级，保留核心场景身份、可见物体、材质、时代感和空间关系，不要替换成其他场景类型。'

  const spatialConstraints = params.locale === 'en'
    ? 'Use the requested panoramic spatial reference format as the composition authority. Clearly show the main structure, foreground/midground/background, visible spatial boundaries, and continuous room circumference. Do not generate a generic partial background, cropped anchor, ambiguous layout, unrelated collage, or a single ordinary shot view.'
    : '必须以指定的全景场景参考格式作为构图最高优先级，清楚展示主要结构、前景/中景/背景、空间边界和连续环视空间。禁止生成局部裁切、锚点缺失、空间关系模糊的泛化背景、无关拼贴，或普通单镜头视角。'

  const noMarkConstraints = params.locale === 'en'
    ? 'Do not add artificial layout aids such as arrows, guide lines, marking lines, outline placeholders, UI markers, map callouts, or blueprint graphics. In-world markings on plausible scene objects such as shop signs, street signs, door numbers, posters, packaging, or screens are allowed when they belong to the described environment.'
    : '不要添加人工布局辅助元素，例如箭头、引导线、标注线、轮廓占位、UI标记、地图 callout、平面图或蓝图式图形。场景世界里自然存在的招牌、路标、门牌、海报、包装、屏幕内容等可以保留，只要它们属于当前环境。'

  const placementSpaceConstraints = params.locale === 'en'
    ? 'Keep stable anchor objects and nearby usable open floor or open space visible for later character placement. Treat this as invisible layout guidance only; do not draw outlines, boxes, arrows, guide marks, or artificial placeholders.'
    : '为后续人物落位保留清晰稳定的空间锚点，以及锚点周边可用的地面或空白区域。这只是不可见的布局指导，不要画出轮廓框、箭头、引导线、标记或人工占位图形。'

  return `${promptBody}\n\n${fidelityConstraints}\n${spatialConstraints}\n${placementSpaceConstraints}\n${noMarkConstraints}`.trim()
}
