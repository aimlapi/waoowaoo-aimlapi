# Visual Style Development

## Purpose

Translate story facts, user requirements, and existing visual context into one visual-style contract shared by images and video, with materially distinct style candidates and preview directions when needed. This Skill governs visual style only; it does not design the specific identity of characters, locations, or props.

## Style Bible field ownership

- `rawUserStyle` preserves the user's original style intent. It is source evidence, not a normalized generation constraint.
- `styleSummary` helps users understand and compare a direction. It is not itself a generation constraint.
- `visualStyle` is the shared image/video look. It combines artistic medium, image treatment, overall finish, and color palette into one concrete, executable description.
- `assetImageStyle` is used only for asset images such as character, location, prop, and style-preview images:
  - `lighting` defines stylized asset-image lighting;
  - `texture` defines asset-image material and detail treatment;
  - `composition` defines reusable asset-image composition.
- Video generation consumes only `visualStyle`; it never inherits `assetImageStyle` lighting, material-detail treatment, or asset-board composition.
- The Style Bible is the sole authority for visual style. Asset design consumes it and must not redefine project style from one reference image or one asset.

## Visual-style boundaries

- Visual style governs artistic medium, image treatment, overall texture, and color direction. It does not decide narrative viewpoint, performance, information rhythm, lens, camera motion, video editing, or sound.
- `visualStyle` excludes lighting, composition, lens, camera movement, and sound; those belong to asset-image policy, directing, video, or sound design.
- Separate the overall visual style shared by images and video from lighting, material-detail, and composition rules used only for asset images. Asset-only rules must never leak into cross-media style.
- A style summary helps people understand the direction. Generation-facing style language must be specific and executable rather than vague labels such as “cinematic,” “premium,” or “dreamlike.”
- Translate references to directors, films, studios, movements, or eras into executable medium, material, palette, silhouette, detail density, and image-treatment characteristics instead of depending on protected names themselves.
- An explicit user-selected style and a confirmed project Style Bible outrank the source style of reference images. A reference may provide identity, structure, and material facts, but it cannot override explicit art direction.

## Style candidates

- Every style candidate remains faithful to the same plot, character, location, prop, and time facts.
- Candidates must differ materially in artistic medium, overall finish, palette, and design language, not merely minor color grading.
- Every candidate forms a complete, internally consistent, executable Style Bible rather than a title plus vague adjectives.
- Do not manufacture variation by changing character identity, location facts, story content, era, or events.
- When the user has explicitly requested a style, candidates explore only the reasonable range allowed by that request; they must not demote a clear requirement into an optional suggestion.

## Candidate inspiration vocabulary (adapted screen-style catalog)

This catalog expands discovery and combination space only. It is not a closed enum or a tag bundle to paste into `visualStyle`. Users may request styles outside it; explicit user direction, a confirmed Style Bible, and story facts always take precedence. The canonical source labels below are Chinese discovery labels from the supplied catalog. For an English task, interpret them semantically and write fluent, executable English rather than echoing untranslated labels.

This catalog describes only visual attributes that can be verified directly in a single frame; it does not expand into temporal or sound dimensions.

The adapted field formula is: `visualStyle = primary medium/production surface + form and design language + color relationships + global image treatment`; `assetImageStyle = stylized asset-image lighting + material/detail expression + reusable asset composition`. Era, region, worldbuilding, genre, and mood are compatibility constraints and interpretation cues only.

### Use algorithm

1. Lock explicit user requirements and every supplied plot, character, location, prop, era, and world-rule fact before consulting the vocabulary. Catalog terms never rewrite those facts.
2. Filter for compatible medium/design-language, palette/image-treatment, and asset-image-policy seeds. Never force a term merely to cover the catalog.
3. Give each candidate one primary medium and one compatible design language, or one explicit medium–design-language pairing, then one compatible palette/image-treatment group and one asset-image lighting/texture/composition policy. Do not produce an unranked pile of tags.
4. The three candidates must differ materially on at least two visual dimensions, including the primary medium or design language on at least one axis; changing only color, brightness, or a mood adjective is insufficient.
5. Translate every selected label into executable medium, silhouette, material, detail-density, color-relation, and image-treatment language. A final Style Bible must not depend on bare labels, work titles, studio names, or protected names.
6. Put lighting and asset composition only in `assetImageStyle.lighting` and `assetImageStyle.composition`.
7. Use historical/regional, genre, worldbuilding, and mood terms only for compatibility filtering. Adopt one only when the input already supports it and it maps unambiguously to single-frame medium, form, color, material, or global image-treatment traits; otherwise it does not enter the Style Bible. Never invent an era, region, architecture, technology, creature, or plot element from a label.
8. Collapse synonymous or near-synonymous families before generating candidates. Do not repeat one family inside a candidate, and do not manufacture three candidates by swapping labels within one family. Common families include 新现实主义／意大利新现实主义; 诗意现实主义／法国诗意现实主义／伊朗诗意现实主义; 魔幻现实主义／拉丁美洲魔幻现实主义; 表现主义／德国表现主义; 印象主义／法国印象派; 日本侘寂／侘寂; 公路电影美学／公路; 拼贴／拼贴动画; 水墨电影／水墨动画; 油画／油画动画; 像素／像素动画; 阈限空间／阈限空间恐怖; 空核／空核恐怖; and VHS／录像带电影／模拟恐怖.

### Seeds that may be translated directly into `visualStyle`

**Color and image treatment:**黑白电影、高反差黑白、银盐灰阶、单色、双色、去饱和、低饱和高级灰、高饱和糖果色、莫兰迪色系、马卡龙色系、粉彩色系、大地色系、冷色、暖色、青橙、蓝绿、黄绿病态色、红黑、金黄史诗色、银蓝科技色、紫粉霓虹、褪色怀旧、漂白绕银、交叉冲洗、日晒反转、胶片颗粒、16 毫米、35 毫米、65／70 毫米、8 毫米家庭录像、即时成像相纸、VHS、DV、CCD 千禧年、Hi8、早期数字电影、高清商业广告、HDR 通透、柔焦、光晕溢出、镜头炫光、色差故障、低保真、脏污划痕、胶片烧灼、过曝、欠曝、雾面低对比、锐利数码。

**Animation medium and form:**传统手绘二维、数字二维、赛璐璐、定格、黏土、木偶、剪纸、皮影、沙动画、油画动画、水彩动画、水墨动画、粉笔动画、玻璃绘制、实物动画、像素动画、矢量动画、早期网页矢量补间动画、三维 CG、卡通渲染、二渲三、三渲二、转描、真人动画混合、拼贴动画、美式卡通、日式动漫、欧式绘本、法式漫画、比利时漫画、苏式动画、中国美术片、国潮动画、Q 版、萌系、少年漫画、少女漫画、青年漫画、写实动漫、超写实 CG、橡皮管动画、大眼商业童话动画、几何扁平、极简线稿、涂鸦、蜡笔儿童画、水彩绘本、油画、版画、木刻、剪影、低多边形、体素、像素、玩具模型、毛毡手工、纸艺、折纸、布偶、怪诞卡通、暗黑童话。

**Internet and youth visual culture:**Vaporwave／蒸汽波、Synthwave／合成器浪潮、Retrowave／复古浪潮、Outrun、Cyber Y2K、Frutiger Aero、Acid Graphics、Glitch Art、Webcore、Weirdcore、Dreamcore、Traumacore、Kidcore、Lovecore、Angelcore、Devilcore、Fairycore、Goblincore、Cottagecore、Royalcore、Princesscore、Knightcore、Dark Academia、Light Academia、Goth、Emo、Punk、Grunge、Metal、Indie Sleaze、Twee、Coquette、Balletcore、粉色玩偶时尚美学、Dopamine、Clean Girl、Old Money、极繁千禧、赛博禅意、怀旧核、数字废墟、低保真互联网。

### Seeds restricted to `assetImageStyle`

**Lighting:**自然光写实、可用光、高调、低调、明暗对照、黑色电影硬光、柔光、轮廓光剪影、顶光、底光、侧逆光、窗光、烛光、舞台光、霓虹光、冷峻荧光灯、黄绿钠灯、月光蓝调、黄金时刻、蓝调时刻、雾化光、丁达尔光束、高反差、低反差灰调、伦勃朗式光、卡拉瓦乔式明暗、黑场吞没式照明、无影棚拍。

Any lighting seed that implies a source or time must be compatible with supplied facts. Window light, candlelight, neon, moonlight, golden hour, or blue hour cannot invent a window, candle, sign, night, or sunset. `assetImageStyle.lighting` defines stylized treatment only; asset design still owns physical sources and time facts.

**Material and detail treatment:**赛璐璐平涂与干净边缘、黏土指纹、木偶关节与接缝、纸纤维与剪切边缘、皮影半透明纤维、砂粒、油画厚涂、水彩渗化、水墨晕染、粉笔粉尘、玻璃绘制层次、像素硬边、矢量平面、版画压痕、木刻刀痕、低多边形折面、体素块面、玩具塑料或木材、毛毡绒毛、折纸折痕、布偶织物与缝线。Material treatment must derive naturally from the primary medium; it cannot conflict with that medium or rewrite the real material facts of a character, location, or prop. Film grain and dirty scratches are global image treatments, not the asset's physical surface.

**Asset composition:**对称、中心、几何、留白、拥挤。These constrain reusable asset imagery only; every option must keep the subject complete, unobscured, and easy to identify. “Crowded” changes layout density only and cannot invent people, objects, or environmental clutter. Asset design still owns a location's physical light sources, time, and spatial structure.

### Semantic seeds used only when they map unambiguously to single-frame visual traits

**Overall visual traditions:**写实主义、自然主义、社会现实主义、纪实、新现实主义、诗意现实主义、魔幻现实主义、超现实主义、表现主义、印象主义、象征主义、形式主义、极简主义、极繁主义、戏剧化舞台、梦境、荒诞主义、存在主义、虚无主义、后现代主义、拼贴、类型混搭。

**Historical and regional visual traditions:**德国表现主义、法国印象派、法国诗意现实主义、意大利新现实主义、法国新浪潮、英国自由电影、厨房水槽现实主义、德国新电影、欧洲艺术电影、新好莱坞、美国独立电影、美国地下电影、公路电影美学、黑色电影、新黑色电影、磨坊／剥削电影、B 级片、邪典电影、录像带电影、新真诚主义、中国水墨电影、中国第五代电影美学、中国第六代纪实美学、中国乡土现实主义、中国古典意境、港片黄金时代、香港新浪潮、港式黑帮、港式武侠、港式无厘头、台湾新电影、台湾青春电影、日本时代剧、日本侘寂、日本物哀、日本新浪潮、日式青春、韩国现实主义、韩式犯罪惊悚、韩式唯美爱情、宝莱坞、印度平行电影、伊朗诗意现实主义、东南亚热带电影、拉丁美洲魔幻现实主义、第三电影、非洲电影美学。

**Art era and visual culture:**古典主义、新古典主义、浪漫主义、巴洛克、洛可可、哥特、新哥特、文艺复兴、中世纪、维多利亚、爱德华时代、摄政时代、装饰艺术、新艺术、包豪斯、现代主义、粗野主义、后现代建筑、苏联构成主义、社会主义现实主义、东方主义、中国古典、汉唐、宋式、明清、民国、江南水乡、西域、敦煌、禅意、侘寂、浮世绘、和风时代剧、韩式古典、印度宫廷、阿拉伯、波斯、埃及、希腊罗马、北欧极简、美式复古、西部拓荒、南方哥特、热带、沙漠、海洋、工业废墟、都市水泥森林、郊区、小镇怀旧、乡土。

**Fantasy, science-fiction, and speculative semantics:**高魔、低魔、黑暗奇幻、史诗奇幻、童话奇幻、都市奇幻、东方奇幻、仙侠、玄幻、神话史诗、志怪、克苏鲁、太空歌剧、硬科幻、软科幻、复古未来、原子朋克、柴油朋克、蒸汽朋克、赛博朋克、后赛博朋克、生物朋克、纳米朋克、太阳朋克、月球朋克、时钟朋克、特斯拉朋克、太空朋克、废土朋克、垃圾朋克、水世界、冰雪末世、核灾难、末日、后末日、反乌托邦、乌托邦、超现实科幻、外星异域、太空工业、模拟科技、Y2K 未来、全息界面、机械复古、新怪谈、怪兽特摄。

**Genre semantics:**史诗、战争、军事纪实、西部、意大利式西部、武侠、功夫、剑戟、警匪、黑帮、犯罪、谍战、政治惊悚、法庭、灾难、冒险、公路、航海、寻宝、超级英雄、怪兽、特摄、歌舞、音乐录像带、青春、校园、唯美爱情、家庭伦理、职场、医疗、情景喜剧、肥皂剧、偶像剧、短剧爽感、真人秀、广告电影、时尚电影。

**Horror and thriller semantics:**哥特恐怖、民俗恐怖、宗教恐怖、心理恐怖、身体恐怖、宇宙恐怖、怪谈、都市传说、日式恐怖、韩式恐怖、中式民俗恐怖、南洋邪术、铅黄电影、砍杀、血浆、极端恐怖、密室惊悚、家庭录像恐怖、伪纪录恐怖、模拟恐怖、网络恐怖、VHS 恐怖、乡村恐怖、南方哥特恐怖、怪物恐怖、深海恐怖、太空恐怖、克苏鲁恐怖、梦魇超现实、阈限空间恐怖、空核恐怖、后室、可爱恐怖、童话恐怖。

**Mood, space, and atmosphere:**唯美、浪漫、清新、治愈、温暖、怀旧、诗意、梦幻、空灵、神圣、静谧、孤独、疏离、冷峻、压抑、阴郁、忧郁、悲怆、粗粝、野性、肃杀、苍凉、颓废、糜烂、奢华、华丽、妖艳、诡谲、怪诞、荒诞、神秘、惊悚、恐怖、不安、窒息、热血、燃系、轻快、喜剧化、无厘头、童趣、史诗感、崇高感、阈限空间、空核。

## Style previews

- A style preview exists to compare visual directions. It is not a new story version or a new source of asset facts.
- Preview imagery uses the candidate's own `visualStyle` and `assetImageStyle`; never mix lighting, texture, or composition from another candidate.
- A preview may depict key story moments to demonstrate style fit, but it must not change character identity, location facts, prop state, or story content.
- Incidental preview composition, pose, lighting detail, and generation defects do not automatically become Style Bible or asset facts.

## Interface with asset design

- This Skill defines cross-media visual policy and asset-image policy. Asset design owns stable character appearance, location structure, and prop form.
- `assetImageStyle.lighting` defines the stylized lighting shared by asset images. A location's real physical sources, positions, time, and illumination conditions are location facts supplied by asset design.
- A final asset-image prompt composes stable asset facts with the confirmed Style Bible. It must not write stylized lighting, filters, or asset composition back into stable character or location identity descriptions.
- When reference-image style conflicts with the Style Bible, retain reference-supported identity, silhouette, structure, and material facts while following the Style Bible for the final image treatment.

## Review

- Does `visualStyle` contain only medium, image treatment, overall finish, and palette shared by images and video?
- Does `assetImageStyle` contain only asset-image lighting, texture, and composition?
- Have abstract or named style references been translated into executable visual traits?
- Do candidates differ materially while remaining faithful to the same story facts?
- Does a preview compare style without creating new plot or asset facts?
- Has one reference image been prevented from redefining confirmed project style?

## Boundary

This Skill provides methods for Style Bibles, style candidates, and style previews. The asset-design Skill owns specific character, location, prop, and reference-asset design; directing, shots, video, sound, and music belong to their respective Skills. Output schemas, candidate count, preview-grid layout, image aspect ratio, provider parameters, real-person safety policy, and final generation suffixes are defined by the caller and execution layer.
