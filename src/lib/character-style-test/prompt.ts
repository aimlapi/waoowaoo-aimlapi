import type { Locale } from '@/i18n/routing'
import {
  renderCharacterCastingPlanPromptBlock,
  type CharacterCastingCandidatePlan,
} from '@/lib/character-casting/casting-plan'
import { CHARACTER_ASSET_IMAGE_RATIO } from '@/lib/constants'

export const CHARACTER_STYLE_TEST_ASPECT_RATIO = CHARACTER_ASSET_IMAGE_RATIO

export type CharacterStyleTestPromptMode = 'style_asset' | 'casting_photo'

export function normalizeCharacterStyleTestPromptMode(value: unknown): CharacterStyleTestPromptMode {
  return value === 'casting_photo' ? 'casting_photo' : 'style_asset'
}

function normalizeCharacterRequest(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function buildChineseStyleExpansion(characterRequest: string): string {
  return [
    '本次角色资产风格规范（必须显性执行，不要只在脑中概括）：',
    `- 风格核心：以“${characterRequest}”的身份语义为唯一来源，扩写成强风格化的电影概念设定，而不是普通职业/身份展示。`,
    '- 短输入规则：如果用户只输入一个身份或名词，也必须主动选择鲜明、统一、可继承的视觉方向；不要因为信息少就生成中性白底、普通棚拍或无风格设定图。',
    '- 风格来源边界：不要继承项目既有风格，不要套用历史资产风格；只能使用本次用户输入及其语义推导。',
    '- 背景氛围：使用抽象、符号化、非剧情地点的风格背景，让观众一眼能感到角色所属气质；背景必须有颜色、光影、纹理和空气感。',
    '- 灯光策略：使用有辨识度的主光、轮廓光或环境光，不要使用平光；光线要强化脸部、服装褶皱、材质和剪影。',
    '- 色彩与滤镜：选择明确的主色、辅色和整体滤镜，例如低饱和、胶片颗粒、雾化高光、墨色层次、冷暖对比或其他从输入语义推导出的风格效果。',
    '- 材质质感：强化服装面料、皮肤、配饰、背景表面的触感；不能只有干净线稿或默认 3D 建模质感。',
    '- 构图规则：左侧大头与右侧三视图必须共享同一背景风格和灯光逻辑，整张图像像一张完整资产设定板，而不是四张孤立证件照。',
    '- 禁止项：纯白底、灰白渐变底、普通证件照、无风格三视图、默认棚拍、临时剧情动作、文字标签、编号、水印、Logo。',
  ].join('\n')
}

function buildEnglishStyleExpansion(characterRequest: string): string {
  return [
    'Temporary character asset style guide, visibly apply it rather than only thinking about it:',
    `- Style core: use the identity semantics of "${characterRequest}" as the only source, and expand it into a strongly stylized cinematic concept design, not a plain occupation or identity display.`,
    '- Short-input rule: if the user only entered one identity or noun, still choose a vivid, unified, inheritable visual direction. Do not produce a neutral white-background sheet, plain studio render, or styleless reference just because the input is sparse.',
    '- Style source boundary: do not inherit existing project style, and do not reuse historical asset style. Use only this user input and semantic inference from it.',
    '- Background mood: use an abstract, symbolic, non-story-location style background that immediately communicates the character aura. The background must have color, light, texture, and atmosphere.',
    '- Lighting strategy: use distinctive key light, rim light, or ambient light, not flat lighting. The lighting must strengthen the face, fabric folds, material surfaces, and silhouette.',
    '- Color and filter: choose a clear main color, secondary color, and overall image filter, such as low saturation, film grain, hazed highlights, ink-like tonal layers, warm-cool contrast, or another style effect inferred from the input semantics.',
    '- Material texture: emphasize costume fabric, skin, accessories, and background surface tactility. Do not use only clean line art or a default 3D modeling look.',
    '- Composition rule: the left portrait and right three views must share the same background style and lighting logic, so the image reads as one complete asset board rather than four isolated ID photos.',
    '- Bans: pure white background, gray-white gradient background, plain ID photo, styleless three-view sheet, default studio render, temporary story action, text labels, numbers, watermark, Logo.',
  ].join('\n')
}

export function buildCharacterStyleTestStyleSummary(input: {
  readonly characterRequest: string
  readonly locale: Locale
  readonly promptMode?: CharacterStyleTestPromptMode
}): string {
  const characterRequest = normalizeCharacterRequest(input.characterRequest)
  if (input.promptMode === 'casting_photo') {
    return input.locale === 'en'
      ? `Casting and look-test photo source: ${characterRequest}`
      : `本次选角定妆照来源：${characterRequest}`
  }
  return input.locale === 'en'
    ? `Input-derived temporary asset style source: ${characterRequest}`
    : `本次临时资产风格来源：${characterRequest}`
}

function buildChineseBasePrompt(characterRequest: string): string {
  return [
    '生成一张用于后续分镜参考的风格化角色资产设定图。',
    `用户输入（本次人物与风格的唯一来源）：${characterRequest}`,
    buildChineseStyleExpansion(characterRequest),
    '画面必须保持单张完整图片，不要拆成多张输出。',
    '版式必须保留角色多视图：左侧约 1/3 宽度为角色大头正面身份特写；右侧约 2/3 宽度横向排列同一角色的正面全身、侧面全身、背面全身，三视图高度一致，服装和体型完全一致。',
    '资产图不能使用纯白底。必须把上面的背景、灯光、滤镜、色彩、材质和画面质感落实到画面里；背景只能服务于资产风格，不得绑定具体剧情地点，不得出现可误导分镜的固定场景锚点。',
    '这张图后续会被分镜图片当作人物参考资产，因此风格必须稳定、可复用、能被后续镜头继承；不要生成普通证件照、白底三视图或无风格的建模参考图。',
    '让角色外观、服装、轮廓、发型、体型、主要配饰在后续分镜中容易被引用；不要加入临时表情、动作、剧情事件、文字标签、编号、水印、Logo。',
    '保持角色自然中性表情和静态站姿，完整展示鞋子与服装细节。',
  ].join('\n')
}

function buildEnglishBasePrompt(characterRequest: string): string {
  return [
    'Generate one stylized character asset reference image for later storyboard image generation.',
    `User input, the only source for this character and style: ${characterRequest}`,
    buildEnglishStyleExpansion(characterRequest),
    'The output must be one complete image, not multiple files.',
    'Keep a multi-view character sheet layout: the left third is a frontal head-and-face identity close-up; the right two thirds show the same character as front full-body, side full-body, and back full-body views arranged horizontally, with consistent height, outfit, and body proportions.',
    'Do not use a pure white background. Apply the background, lighting, filter, color, material, and image texture from the guide above directly in the image. The background must support asset style only; it must not lock the character to a specific story location or introduce fixed scene anchors that may pollute later storyboard shots.',
    'This image will later be used as a character reference asset for storyboard images, so the style must be stable, reusable, and inheritable by later shots. Do not generate a plain ID photo, white-background model sheet, or styleless modeling reference.',
    'Make the character identity, outfit, silhouette, hair, body type, and key accessories easy to reuse as storyboard references. Do not add temporary expressions, actions, plot events, text labels, numbers, watermarks, or logos.',
    'Keep a neutral expression and static standing posture. Show full shoes and costume details clearly.',
  ].join('\n')
}

function buildChineseCastingCandidateBrief(candidateIndex: number | undefined): string {
  if (candidateIndex === undefined) return ''
  const briefs = [
    [
      '候选 A 方向：生活真实度优先。',
      '演员脸型、年龄气质和体态要偏普通真实、克制、接近现实中会遇到的人；服装以日常基础层次和真实旧衣质感为主。',
      '必须与候选 B/C 拉开：不要使用强戏剧化眼神、明显造型发型、强配饰或高度记忆点妆造。',
    ].join(' '),
    [
      '候选 B 方向：情绪创伤与表演强度优先。',
      '演员脸部状态、眼神湿度、疲惫感、脆弱表情和内在压抑要明显强于 A/C；服装可以更松垮、磨损或带生活崩塌感。',
      '必须与候选 A/C 拉开：不要只是同一张脸换表情，不要沿用 A 的日常中性妆造或 C 的造型记忆点。',
    ].join(' '),
    [
      '候选 C 方向：造型记忆点与轮廓识别优先。',
      '在仍然适合作为角色定妆候选的范围内，强化不同发型轮廓、服装层次、标志性配饰、身体标记或独特穿搭比例。',
      '必须与候选 A/B 拉开：脸型气质、发型、服装结构和识别点都要明显不同，不能只是同一人物的第三张相似 contact sheet。',
    ].join(' '),
  ] as const
  return briefs[candidateIndex] ?? ''
}

function buildEnglishCastingCandidateBrief(candidateIndex: number | undefined): string {
  if (candidateIndex === undefined) return ''
  const briefs = [
    [
      'Candidate A direction: grounded everyday realism first.',
      'The actor face, age impression, and body presence should feel ordinary, restrained, and close to someone encountered in real life; wardrobe uses practical everyday layers and worn real clothing.',
      'Differentiate from B/C: do not use highly dramatic gaze, statement hair, strong accessories, or memorable styling marks.',
    ].join(' '),
    [
      'Candidate B direction: emotional wound and performance intensity first.',
      'The actor face state, wet gaze, fatigue, vulnerable expressions, and suppressed inner pressure should be much stronger than A/C; wardrobe may feel looser, worn, or life-collapsed.',
      'Differentiate from A/C: do not make this merely the same face with another expression, and do not reuse A’s neutral everyday styling or C’s graphic styling hook.',
    ].join(' '),
    [
      'Candidate C direction: memorable silhouette and styling hook first.',
      'Still realistic and castable, but with stronger hair silhouette, wardrobe layering, signature accessory, visible body mark, or distinctive proportion.',
      'Differentiate from A/B: face impression, hair, costume structure, and visual hook must be visibly different, not a third near-identical contact sheet of the same generated person.',
    ].join(' '),
  ] as const
  return briefs[candidateIndex] ?? ''
}

function buildChineseCastingPhotoPrompt(
  characterRequest: string,
  candidateIndex?: number,
  candidatePlan?: CharacterCastingCandidatePlan,
): string {
  const candidateBrief = buildChineseCastingCandidateBrief(candidateIndex)
  return [
    '生成一张用于选角、试镜与人物定妆判断的 contact sheet / look-test sheet。',
    '媒介和画风必须由已选视觉参考案例决定：真人案例就保持真人向摄影定妆；动画、定格、插画、CG 或其他媒介案例就保持对应媒介的角色定妆包。不要自行指定真人、动画、CG、插画或任何旧风格预设。',
    `人物定妆需求（来自剧本和角色需求）：${characterRequest}`,
    candidateBrief,
    candidatePlan ? renderCharacterCastingPlanPromptBlock({ plan: candidatePlan, locale: 'zh' }) : '',
    '候选差异硬约束：本次如果生成 3 组候选，三组之间必须像三个真实可选角色定妆方案，而不是同一个生成结果的复刻。A/B/C 的脸型气质、发型轮廓、服装结构、表演状态和记忆点必须能被肉眼区分。',
    '画面目标：像剧组用于选角、试镜、定妆和服装试装的候选资料，用来判断这个角色形象与这套妆造是否适合剧本。',
    '这是一组完整候选形象包：整张图必须是一张拼版，包含同一角色身份的多张定妆参考；不是单纯白底三视图，也不是多个不同角色拼在一起。',
    '单人隔离规则：整张候选图只能出现当前这一个角色本人；所有格子、背景、道具细节和生活场景里都绝对不要出现其他人物、围观者、路人、亲友、同事、儿童、手部代入、身体局部、照片/镜子/屏幕里的人像或人形剪影。',
    '必须包含的基础资料：正面半身身份照、正面全身站姿、左侧面、右侧面、背面或 3/4 背面；基础资料可以使用低干扰背景，但背景、光线、材质和色彩仍必须服从已选视觉参考案例。',
    '必须包含的拓展定妆照：至少两种不同表情（例如中性、脆弱/哭过、浅笑/防备笑）、至少两套不同服装或穿搭层次、至少两个故事相关背景或工作/生活场景、至少一个手部/耳后/疤痕/纹身/配饰/关键道具细节特写。',
    '同一候选包内必须保持同一角色身份：脸型、五官距离、鼻梁、颧骨、眼神、体型、身高比例、发量和主要身体标记必须稳定；允许服装、情绪、背景和局部妆造变化，但不能换人或换角色。',
    '画面质感：只继承已选视觉参考案例的媒介、材质、颗粒、光线和色彩体系；不要额外添加参考案例之外的写实摄影、动漫、漫画、插画、CG、赛博、海报或棚拍风格。',
    '场景背景：必须来自剧本中的角色生活/工作/剧情语境，并服从已选视觉参考案例的风格语言；背景服务于判断角色适配度，不要变成与剧本无关的海报、剧照大片或世界观概念图。',
    '构图优先级：清楚看脸、发型、表情变化、身高比例、体态、服装变化、鞋子、侧背轮廓、关键细节；全身照必须完整露出脚。',
    '绝对禁止：任何来自旧项目风格、系统风格预设、用户历史偏好或固定模板的风格注入；不同人物混入、其他人物出镜、文字标签、姓名、电话、邮箱、身高腰围信息、水印、Logo。',
    '如果需要纸质 casting sheet 的感觉，只模拟拼版与留白，不要生成任何可读个人信息。',
  ].filter(Boolean).join('\n')
}

function buildEnglishCastingPhotoPrompt(
  characterRequest: string,
  candidateIndex?: number,
  candidatePlan?: CharacterCastingCandidatePlan,
): string {
  const candidateBrief = buildEnglishCastingCandidateBrief(candidateIndex)
  return [
    'Generate one contact sheet / look-test sheet for casting, audition, and character look approval.',
    'The medium and rendering style must come from the selected visual reference case: keep live-action references live-action, and keep animation, stop-motion, illustration, CG, or any other selected medium in that same medium. Do not independently choose live-action, anime, CG, illustration, or any legacy style preset.',
    `Casting and look-test request from the screenplay and character requirements: ${characterRequest}`,
    candidateBrief,
    candidatePlan ? renderCharacterCastingPlanPromptBlock({ plan: candidatePlan, locale: 'en' }) : '',
    'Candidate separation hard rule: when generating three candidates, they must read like three viable character look-test options, not replicas of the same generated result. A/B/C must be visibly distinguishable in face impression, hair silhouette, costume structure, performance state, and visual hook.',
    'Goal: make it feel like production material for casting, audition, look approval, and costume fitting, used to judge whether this character image and styling fit the screenplay.',
    'This is one complete candidate look package: the image must be one collage containing multiple look-test views of the same character identity. It is not a plain white-background turnaround only, and it must not mix multiple different characters.',
    'Single-character isolation rule: the entire candidate sheet may show only this current character. No other people, extras, bystanders, relatives, coworkers, children, inserted hands, body parts, portraits, reflections, screen images of people, or human silhouettes may appear in any panel, background, prop detail, or story-context setting.',
    'Required identity material: frontal half-body identity view, frontal full-body standing view, left profile, right profile, and back or three-quarter back view. These baseline views may use a low-distraction background, but the background, lighting, material, and palette must still obey the selected visual reference case.',
    'Required extended look-test material: at least two different expressions such as neutral, vulnerable/after crying, slight smile/guarded smile; at least two different outfits or styling layers; at least two story-related backgrounds or work/life settings; at least one close-up of hand, behind-ear detail, scar, tattoo, accessory, or key prop.',
    'Within this candidate package, preserve one character identity: face shape, feature spacing, nose bridge, cheekbones, gaze, body type, height proportion, hair volume, and key body marks must stay stable. Wardrobe, emotion, background, and small makeup/styling changes may vary, but the person or character identity must not change.',
    'Image texture: inherit only the selected visual reference case medium, material, grain, lighting, and palette. Do not add realism, anime, comic, illustration, CG, cyberpunk, poster, or studio-shot styling that is not present in the selected reference case.',
    'Backgrounds: use the character’s story life/work/plot context from the screenplay, while obeying the selected visual reference visual language. Backgrounds must help judge role fit and must not become unrelated posters, finished film stills, or worldbuilding concept art.',
    'Composition priorities: clearly show face, hair, expression variation, height proportion, body posture, costume variation, shoes, side/back silhouette, and key details. Full-body views must show complete feet.',
    'Strict bans: style injection from legacy project style, system style presets, user history, or fixed templates; mixed character identities, other people appearing, text labels, names, phone numbers, emails, height/waist data, watermark, Logo.',
    'If a paper casting-sheet feeling is needed, simulate only the photo collage and blank margins. Do not generate readable personal information.',
  ].filter(Boolean).join('\n')
}

export function buildCharacterStyleTestPrompt(input: {
  readonly characterRequest: string
  readonly locale: Locale
  readonly promptMode?: CharacterStyleTestPromptMode
  readonly candidateIndex?: number
  readonly candidatePlan?: CharacterCastingCandidatePlan
}): string {
  const characterRequest = normalizeCharacterRequest(input.characterRequest)
  if (input.promptMode === 'casting_photo') {
    return input.locale === 'en'
      ? buildEnglishCastingPhotoPrompt(characterRequest, input.candidateIndex, input.candidatePlan)
      : buildChineseCastingPhotoPrompt(characterRequest, input.candidateIndex, input.candidatePlan)
  }
  return input.locale === 'en'
    ? buildEnglishBasePrompt(characterRequest)
    : buildChineseBasePrompt(characterRequest)
}
