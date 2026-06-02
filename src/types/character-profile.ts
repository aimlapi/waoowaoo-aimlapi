/**
 * 角色档案数据结构
 * 用于角色视觉档案生成
 */

export type RoleLevel = 'S' | 'A' | 'B' | 'C' | 'D'

export type CostumeTier = 1 | 2 | 3 | 4 | 5

export interface CharacterProfileData {
    /** 角色重要性层级 */
    role_level: RoleLevel

    /** 角色原型 (如: 霸道总裁, 心机婊) */
    archetype: string

    /** 性格标签 */
    personality_tags: string[]

    /** 时代背景 */
    era_period: string

    /** 社会阶层 */
    social_class: string

    /** 职业 (可选) */
    occupation?: string

    /** 服装华丽度 (1-5) */
    costume_tier: CostumeTier

    /** 建议色彩 */
    suggested_colors: string[]

    /** 主要辨识标志 (S/A级角色必须) */
    primary_identifier?: string

    /** 视觉关键词 */
    visual_keywords: string[]

    /** 性别 */
    gender: string

    /** 年龄段描述 */
    age_range: string

    /** 服化道设定：服装、妆容、发型、配饰、标志性随身物 */
    costume_and_styling?: string

    /** 体型设定：身高感、体型、体态、肩宽、胖瘦、肌肉感 */
    body_profile?: string

    /** 面相设定：脸型、五官、眉眼鼻唇、面部辨识点 */
    facial_profile?: string

    /** 皮肤设定：质感、状态、可见标记；肤色只作为档案设定，不直接放大进出图描述 */
    skin_profile?: string

    /** 可见精神状态：疲惫、清醒、憔悴、紧绷等可见状态 */
    visible_state?: string

    /** 残疾或辅助器具等可见设定，需中性尊重地描述 */
    accessibility_features?: string

    /** 纹身、胎记、痣、明显标记 */
    tattoos_and_marks?: string

    /** 明显疤痕 */
    visible_scars?: string

    /** 选角筛选偏好：辨识度、亲和力、压迫感、镜头适配等 */
    casting_requirements?: string[]
}

/**
 * 将角色档案序列化为JSON字符串
 */
export function stringifyProfileData(profileData: CharacterProfileData): string {
    return JSON.stringify(profileData)
}

/**
 * 验证角色档案数据完整性
 */
export function validateProfileData(data: unknown): data is CharacterProfileData {
    if (!data || typeof data !== 'object') return false
    const candidate = data as Partial<CharacterProfileData>
    return !!(
        typeof candidate.role_level === 'string' &&
        ['S', 'A', 'B', 'C', 'D'].includes(candidate.role_level) &&
        typeof candidate.archetype === 'string' &&
        Array.isArray(candidate.personality_tags) &&
        typeof candidate.era_period === 'string' &&
        typeof candidate.social_class === 'string' &&
        typeof candidate.costume_tier === 'number' &&
        candidate.costume_tier >= 1 &&
        candidate.costume_tier <= 5 &&
        Array.isArray(candidate.suggested_colors) &&
        Array.isArray(candidate.visual_keywords) &&
        typeof candidate.gender === 'string' &&
        typeof candidate.age_range === 'string' &&
        (candidate.costume_and_styling === undefined || typeof candidate.costume_and_styling === 'string') &&
        (candidate.body_profile === undefined || typeof candidate.body_profile === 'string') &&
        (candidate.facial_profile === undefined || typeof candidate.facial_profile === 'string') &&
        (candidate.skin_profile === undefined || typeof candidate.skin_profile === 'string') &&
        (candidate.visible_state === undefined || typeof candidate.visible_state === 'string') &&
        (candidate.accessibility_features === undefined || typeof candidate.accessibility_features === 'string') &&
        (candidate.tattoos_and_marks === undefined || typeof candidate.tattoos_and_marks === 'string') &&
        (candidate.visible_scars === undefined || typeof candidate.visible_scars === 'string') &&
        (candidate.casting_requirements === undefined || Array.isArray(candidate.casting_requirements))
    )
}
