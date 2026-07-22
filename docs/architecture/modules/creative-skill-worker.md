<!-- architecture-module: creative-skill-worker -->

# Creative Skill 与无状态 Worker

## 设计理念

主 Agent 负责读取项目事实、规划、委派、调用完整 Operation registry 和与用户沟通；专业创作推理由后台 Creative Subagent 承担。每个 Subagent 由一个 `creative_work` Task 承载，但 Task 只提供持久生命周期、结果保存和恢复，真正的 Creative Worker 仍是一次性、无状态、无业务写权的模型循环。

Worker 启动时收到完整但紧凑的 Creative Skill 目录，并按目标自主只读加载 Creative Skill。Skill 是专业知识，不是工具权限、工作流、项目事实或第二套运行时。第一版采用单层 Skill：每个 identity 只有 `SKILL.zh.md` 与 `SKILL.en.md`；当前知识量不足以证明需要固定专业角色、`references/`、Discover 阶段或递归知识树。

## 不变量

- **CS-01 — Skill registry 是唯一身份入口。** Skill id、版本、语言文件、标题、摘要、标签、关键词与 `skill://` URI 只由 `CREATIVE_SKILL_REGISTRY` 声明。发现、URI 解析与读取必须经过该 registry，禁止从 Operation 名、目录遍历、模型猜测或任意文件路径推断 Skill。
- **CS-02 — V1 Skill 保持单层且职责分离。** 每个已注册 Skill 只有同目录下的 `SKILL.zh.md` 与 `SKILL.en.md`；V1 不建立 `references/`、角色目录或递归知识树。`visual-development` 已一次性拆分并删除：`style-development` 独占全局视觉语言、媒介、色彩、光线、材质、`visualStyle`、只含光线与质感的 `assetImageStyle`、风格候选和预览；`asset-development` 独占角色、场景、道具、参考图、候选与修改。角色、场景与道具资产图的固定版式只由资产图片生成执行策略裁决，不属于 Style Bible，也不得占用或改写视频导演层的构图判断。纯独立图片资产可以没有 Style Bible；任何视频制作必须先得到并采用 finalized Style Bible，后续资产与视频设计只能消费其精确 Resource revision，不能反向改写。中英文 Skill 必须表达同一业务规则集合。
- **CS-03 — Worker 无状态且隔离。** Creative Worker 每次 Task attempt 内独立创建，不能访问 Prisma、项目读取、Operation registry、Task、Resource、Approval、Choice、计费或任意业务工具。它只预载 `creative-core`，唯一可见工具是 `read_skill({skillId})`；输入来源材料一律视为数据而非系统指令。Task handler 可以传入完整紧凑目录、记录只读 Skill trace 并保存结果，但不能把 Worker 变成业务 Agent。每个 attempt 受统一 Worker 外部运行时上限约束；超时必须中止模型 signal 并以 typed `CREATIVE_WORK_TIMEOUT` 失败，不能依赖永久 heartbeat 保持 processing。用户取消会先由 Task 终态 CAS 立即移出运行态；当前 provider 调用不保证跨进程即时停止，仍只允许终态 fence 拒绝晚到写入。
- **CS-04 — Worker 按目录自主读取任务所需知识组合。** `CREATIVE_SKILL_REGISTRY` 在 Worker 初始上下文中穷尽提供每个 Skill 的 id、标题、摘要、标签和适用范围；Primary、output kind adapter 和服务端均不得注入 `requiredSkillIds` 或预选专业角色。Worker 根据当前请求中的 `outputKind`、目标和目录说明，自主选择并真实调用 `read_skill`；专业 Skill 可以在目录摘要与正文中声明某类 output 所需的同轮伴随 Skill，Worker 必须遵守该知识组合。当前 `video_prompt_set` 由目录明确要求同轮读取 `director-core`、`video-direction` 与 `quality-review`，三者不形成串行 Subagent 或平行结果。服务端仍只验证至少一个非 `creative-core` 的真实读取发生，不维护第二份 output-kind→Skill 映射或选择门禁；专业质量由 Skill 目录说明、Worker 推理、Skill trace 和 strict output 共同承担。
- **CS-05 — 主 Agent 委派入口与生命周期唯一。** `delegate_creative_work` 是主 Agent 获取专业创作推理的唯一 Operation；它接受单个请求或批量请求，并通过既有 Task submitter 为每个逻辑请求创建一个 `creative_work` Task。一个 Subagent 恒等于一个 Task，`Task.id` 是唯一 Subagent identity，`Task.status` 是唯一生命周期事实。禁止恢复同步 Tool 内运行 Worker、`ProjectAgentActivity.id` 充当 Subagent identity、`subagent.progressed` 事件 writer 或第二套 Subagent 状态机。
- **CS-06 — 输出契约穷尽。** Worker output kind 与 strict schema 只由 `creativeWorkOutputRegistry` 声明。当前集合为 `screenplay_draft`、`edit_bible_bundle`、`continuity_analysis`、`style_bible`、`asset_prompt_set`、`video_prompt_set`、`music_direction` 与 `creative_review`；不存在 `story_analysis`。`style_bible` 必须显式选择单个 finalized Style Bible 或经完整候选校验的 candidate set；final 结果只能经 `adopt_style_bible` 写成 `project.style_bible` Resource。`asset_prompt_set` 必须把不含风格的 `stableDescription`、执行 policy 之前的创意 `generationPrompt` 与精确 screenplay/style source 分开；正式剧本资产链缺少 confirmed structured screenplay 或同一 adopted Style 必须原地失败。角色、场景和道具的版式、比例、背景与主体数量由资产图执行 policy 独占。只有不走 `asset_prompt_set` 的纯独立图片创作可以没有 Style Bible；视频设计必须携带唯一、owned、ready 且 fingerprint 一致的 Style Bible revision。未知、缺失、错 kind 或超预算输出必须原地失败，禁止降级成自由文本或猜字段。
- **CS-06A — 导演知识内化进唯一视频 Prompt。** `video_prompt_set` 的 strict 结果只表达执行真正消费的 `kind` 与 `segments`；每个 segment 只含稳定 `key`、允许的整数 `durationSeconds`、唯一创意指令 `prompt` 和待映射的 `referenceKeys`。Primary 只允许传整部/本章总时长，严禁预先指定段数或逐段时长；服务端从固定视频能力注入允许时长、最小/最大时长与项目画幅。Worker 按目录说明同轮读取 `director-core`、`video-direction` 与 `quality-review`，先完成导演判断，再把当前段适用的镜头、表演、动作、连续性、逐字对白、同步声音与条件式转场全部内化进 `prompt`，并在 strict 输出前自检。运行时只验证 key 唯一、时长属于能力枚举且总和准确；画幅是输入与执行上下文，原生音频由视频执行层默认开启，二者都不由 Subagent 回传。章节剪辑链若需要声音先行或跨 Shot 延续，仍由同一个 Segment Prompt 以可选声音时间线表达，不新增第二音频 writer。禁止恢复 `globalDirection`、`directorTimeline`、`finalPrompt`、`audioIntent` 或其他无人消费的平行过程字段，也不得把导演与模型表达拆成隐藏串行 Task。
- **CS-06B — 剧本、确定性编译与资产枚举边界唯一。** 一个公开 `screenplay_draft` Creative Subagent 恒等于一个 `creative_work_v4` Task；00–06T 只是该 Worker attempt 内部的推理、组装与最终验证阶段，不是额外 Agent、Task、Wait、runner 或中间产物。提交 Task 前，服务端重读并冻结当前 adopted Style Bible 的精确 Revision 与完整只读 snapshot；任何声明 Resource provenance 的来源材料也必须由服务端按精确 Revision 与 fingerprint 重读真实持久内容，user scope 可复用、project scope 只限同项目、episode scope 只限同 episode，且只有 `contentText/contentJson` 可冻结，调用方同时提交的 content 没有事实解释权。没有正式 server resolver 的 domain provenance 和第二份 Style Bible Resource 必须显式拒绝，不能接受调用方自报 identity/content。`visualStyle` 以及 `assetImageStyle.lighting/texture` 可约束人物塑造和视觉兼容性，但 Worker 不得改写风格或输出制作指令。最终 strict 结果必须原样携带 Style Revision identity，并以 `canonicalRegistries` 唯一声明人物、事实、地点和道具；其中 characters/locations/props 是后续资产枚举的唯一总表。06T parser 必须反证重复 identity、角色 ontology/profile 缺失、sequence runtime share 非完整总量、sequence→scene→canonical beat chronology 倒退、scene/kernel/state-ledger 覆盖与 mutation 不一致、对白 canonical name 漂移、external hook 未登记地点/状态，以及 parallel join 分支未登记、重复或在 join scene 前没有实际场景；不能因模型自报 `validation.status=pass` 就接受残缺剧本。`materialize_screenplay_draft` 只在 payload/result request identity、completed、06T-valid 且与当前 Operation scope 精确一致的 Task 之后运行本地确定性 07S compiler：按呈现顺序让每个 kernel 恰好出现一次，只合并连续的同场景 kernel，离开后再返回同场景必须成为新 scene instance；它不是 LLM、Subagent、Task 或 Wait，不添加故事、时长、视觉、音频或制作内容。该 Operation 只写结构化 `project.source_script` Resource Revision 与 Task/Style/source lineage，不写确认 Binding；`confirm_script_resource` 是 `confirmed_screenplay` Binding 的唯一 writer，确认时必须重新读取 completed Task、核对 Resource origin/scope，从 Task result 重算 07S 后与待确认文档精确比较，并在事务内锁定、核对当前 adopted Style source tuple，不能先确认陈旧风格剧本再把错误推迟到资产层。`asset_prompt_set` 只接受服务端冻结的该确认剧本与同一 adopted Style source tuple，必须对 registry 中每个且仅每个 character/location/prop 各输出一次，禁止扫描正文另猜资产。
- **CS-06C — 风格输入先于剧本且来源可证明。** 完整主链中的 `style_bible` 只消费 `context.userRequest`、用户在本轮风格选择前直接给出的非持久来源，以及用户主动提供的非剧本 Resource；不得自动读取 confirmed screenplay，也不得把正式 `project.source_script` Resource 作为风格来源。用户主动粘贴的完整剧本仍属于上游用户输入；已有剧本的 restyle 需要未来独立显式契约，不能借通用 sourceMaterials 猜“最新剧本”。任何 Resource provenance 都必须在提交 Task 前由服务端按精确 revision/fingerprint/scope 重读真实 `contentText/contentJson`，调用方自报 content 不进入 Worker；domain provenance 与没有可重读文本／结构化内容的 Resource 原地失败。风格采用后只有精确 adopted Style Revision 向下游流动，剧本只读消费，不能反向重写。
- **CS-07 — Task 是唯一持久容器，Worker 不获得写权。** 完整 strict 结果与 Skill trace 只保存于 `Task.result`；Task payload 中只保存请求、冻结模型、输入指纹、来源身份和小型 lifecycle projection。该 projection 可以包含 provider 明确返回、按稳定 reasoning/tool identity 原位更新且单块有界的用户可见推理文本，以及 `read_skill` 的调用状态和版本/URI/字符数结果元数据；不得包含 Skill 正文、系统提示、provider 签名或完整 Worker history。Task created/progress/terminal Event 与 Assistant continuation 只能使用 TaskDefinition 声明的 reference projection，禁止复制长剧本、Bible、章节上下文或完整 Worker JSON 进入 SSE、Session、Wait 或模型续跑上下文。需要完整结果时主 Agent通过正式 `get_task(taskId)` 读取。
- **CS-08 — 批量只复用既有聚合协议。** `delegate_creative_work` 只有一个 `delegation` 联合：`source=requests` 一次提交一个或多个调用方已备齐上下文的请求，`source=chapters` 由服务端 Context Compiler 直接把每个持久 Chapter 的最小上下文写入对应 Task。一个请求或 Chapter 对应一个 Task。成员只通过现有 `OperationBatch + collecting Wait` 聚合，全部终态后只由现有 Outbox continuation 恢复主 Agent 一次。禁止 nullable 空分支、另建 Subagent Batch 表、每 Task 一个 Wait、首个 Task 完成即恢复、前台阻塞或按结果顺序串行。
- **CS-09 — Subagent UI 只投影 Task。** SessionState 只从当前 scope 最近且声明 `creative_work_v4` protocol 的 `creative_work` Task、`Task.status` 与其小型 lifecycle projection 构造运行中和终态标签、数量、有界 reasoning/read_skill 执行记录、Skill 读取详情与结果摘要，并把运行中的 Creative Task 从普通 `activeTasks` 投影排除；同一 Task 不能同时显示为通用运行卡与 Subagent。顶部只显示 `Primary + Subagents` 标签，选择标签在同一个 Assistant 正文区域切换 View，不得同时常驻展开第二块面板。执行记录在 Task 运行中默认展开，Task 终态后自动折叠且允许用户再次展开；已完成事件、当前活动与失败必须分别使用完成、spinner 与 alert 语义，不能用空心圆把历史事实伪装成待办。完成、失败或取消后的标签和正文记录保留，用户可用终态标签的关闭按钮移除；关闭只是本地 UI 披露状态，不改写 Task。刷新与 SSE 更新均重读 Session 最终 View；传输增量、历史 message、Tool 卡、文案和 DOM 不得反向推断状态，也不得显示不存在公开协议中的隐藏 reasoning。
- **CS-10 — Bible、Chapter 与最小上下文边界明确。** `edit_bible_bundle` 是全局连续性记忆的专业推理结果。`save_edit_source` 是非 AI Source 保存入口；`adopt_edit_bible_bundle` 是该 Worker 结果进入正式 Bible 的唯一采用入口，必须验证 completed Creative Task、精确 SourceDocument provenance、版本、checksum 与完整 normalizedText，并在同一事务内绑定 Task owner、持久化 Bible 和调用唯一 `splitEditBibleIntoChapterPlans` 写 Chapter。Bible Task 完成只恢复主 Agent，由主 Agent显式采用并决定是否继续，不允许代码自动串行唤起下游。`compileCreativeChapterContext` 是纯派生、fail-closed 的 Context Compiler，只从正式 source/Bible/Chapter、必需的 finalized `project.style_bible` 精确 revision 与显式 asset revision 为一个 Chapter 构造有界最小输入，不写事实、不创建 Task、不决定执行顺序；缺失、重复、非 structured 或 fingerprint 变化的 production Style Bible 必须原地失败。
- **CS-11 — 迁移知识，不删除执行能力。** Operation registry、Task/Wait、Approval、Choice、Resource identity、Canvas 卡片、计费、Run fence、严格 schema/parser/normalizer、provider adapter 与确定性 builder 全部保留。只有创意判断从旧固定领域 Prompt 迁到 Skill + Worker；同一种创作判断迁移后旧 Prompt writer 必须删除，不能让 Worker 结果再经过另一个 LLM 重写。尚未迁移的调用链必须明确记录为残余双轨，不能用 adapter 名义合理化永久并存。

当前阶段仍未迁移的固定专业 LLM 调用包括：旧 `project-agent-script-intake` 问诊、`outline-script` 剧本生成/修订、`ingest_script/generate_bible_from_script` 的四段 Bible 生成、风格候选文本生成、Chapter 结构与 shot execution 生成、角色/场景资产候选与修改描述生成、BGM design。它们继续服务既有专业卡片，但不属于新 Main Agent 推荐路径；在各 kind 获得严格 adopt adapter 的同一阶段，必须一次性把对应旧创意 writer 改为 Skill + Creative Task 并删除旧 Prompt 调用。存在这份清单时只能称本阶段实现完成，不能宣称全仓创意 Prompt 已统一或架构完成。

旧 `ProjectEditBible` 的 source-script 生成、`script_review/approve_script` 确认和后续专业制作链仍是明确残余；它不得写入新链的 `confirmed_screenplay` 保留 Binding，也不得被当作 `screenplay_draft` 的兼容输入。该残余尚未删除，因此剧本层仍非架构完成；后续切换必须选择唯一事实链并删除旧 writer/解释入口，不能长期双轨。

本阶段在 v3 视频输出收敛基础上，为剧本与资产增加服务端冻结 production context、strict lineage 和结构化采用边界，并把 Task protocol 一次性升为 `creative_work_v4`。Session 只投影 v4；历史终态 v3 Task 不进入新 Subagent View。部署前必须先停止旧版本创建 Task，并确认所有 `creative_work_v3` queued/processing Task 已排空，避免旧 Worker 向 v4 parser 写入不兼容 payload/result。不得增加 v3/v4 双 parser、默认 production context、兼容 writer 或双轨投影；切换后只有新委派入口可以写 v4。

三个全局／全量 output 的单一公开 Subagent 约束落实到同一穷尽 policy registry 与委派 schema：`style_bible`、`screenplay_draft`、`asset_prompt_set` 都不接受 `delegation.source=chapters`，也不能重复或与其他请求混批，只允许走 `delegation.source=requests` 的单一请求。三个风格候选属于同一个 Style Task；完整剧本的 00–06T 属于同一个 screenplay Task；完整 registry 的全部资产设计属于同一个 asset Task。服务端编译出的 `creative_chapter_context` domain provenance 因而不会进入 style/screenplay 来源链，也不会让每个 Chapter 重复生成一整套资产；调用方自报的 domain provenance 继续 fail closed。

06H/06T 的 source identity 与 presentation identity 必须分离：`PRES_*` 全局唯一连续；canonical beat 恰有一个 non-replay payload，replay 只新增 presentation identity/说明并逐字段复用 source；external hook 使用独立 HOOK identity、位于 canonical presentation 前、链接回真实 canonical beat，且不成为 Stage 02/05 的第二实体或场景 registry。07S 对这些已接受 presentation kernel 各复制恰好一次。

## 权威入口

- Skill identity、目录与读取：`src/lib/creative-skills/registry.ts`、`uri.ts`、`loader.ts`。
- 单层 Skill 内容：`src/lib/creative-skills/skills/*/SKILL.zh.md` 与 `SKILL.en.md`；风格与资产分别由 `style-development`、`asset-development` 独占。
- Worker 输出与运行边界：`src/lib/creative-worker/output-registry.ts`、`runtime.ts`、`tools.ts`、`skill-access.ts`。
- 剧本 strict schema、00–06T 最终边界与本地 07S compiler：`src/lib/creative-worker/screenplay-contract.ts`；结构化 Resource 物化：`src/lib/operations/domains/assistant/creative-screenplay-ops.ts` 的 `materialize_screenplay_draft`；确认 Binding 唯一 writer：`src/lib/operations/domains/creative-resource/resource-ops.ts` 的 `confirm_script_resource`。
- 剧本/资产服务端 production context 唯一编译入口：`src/lib/operations/domains/assistant/creative-production-context.ts`；它同时独占 adopted/confirmed Binding 读取，以及 screenplay Resource 来源的精确 Revision/fingerprint/scope 重读与真实 `contentText/contentJson` 替换，无 resolver 的 domain provenance 原地失败。`creative-ops.ts` 只编排委派和把对应 context 放入本次 Task payload，不复制 Style/剧本解析逻辑。
- 委派、Task payload/result 与幂等输入：`src/lib/operations/domains/assistant/creative-ops.ts`、`src/lib/creative-worker/task-contract.ts`。
- finalized Style Bible 采用与唯一 Resource writer：`src/lib/operations/domains/assistant/creative-style-ops.ts`；它只读取 completed `creative_work` Task，可采用 final 或一个精确文字候选，并在同一事务追加不可变 `project.style_bible` revision 和 reserved Binding。
- Task 执行：`src/lib/workers/handlers/creative-work.ts`；它调用无状态 `runCreativeWorker`，不能写领域事实。
- Task reference projection：`src/lib/task/definition.ts`、`src/lib/task/result-projection.ts`；完整结果只在 `Task.result`。
- 批量聚合与恢复：`src/lib/project-agent/operation-batch.ts`、`src/lib/project-agent/waits.ts` 与既有 Task terminal continuation。
- 运行展示最终 View：`src/lib/project-agent/session-state.ts`、`src/lib/project-agent/subagent-events.ts`；生产 UI 只消费该 View。
- Chapter 唯一切分：`splitEditBibleIntoChapterPlans`；正式事实读取与 revision 校验：`src/lib/edit-chapter/creative-context-service.ts`；最小上下文纯派生：`src/lib/creative-worker/context-compiler.ts`。读取 service 不能改写 Chapter/Bible/Resource，纯 compiler 不能访问数据库。
- 主 Agent 运行规则：`src/lib/ai-prompts/templates/project-agent/system/**`；它只声明何时规划和委派，不复制 Skill 正文。

## 生命周期

1. 主 Agent 从正式项目 View/Resource 读取目标所需事实；复杂任务可先用 `update_plan` 记录非权威计划。
2. 主 Agent 调用 `delegate_creative_work`：`delegation.source=requests` 传入一个或多个调用方已备齐的独立上下文；长片使用 `delegation.source=chapters`，只传 Chapter identity、稳定 requestKey、目标、约束与显式 Resource revisions，由服务端 Context Compiler 直接为每个 Task 构造最小上下文。
3. Operation 冻结模型与 Skill 版本指纹，并经统一 Task submitter 为每个请求创建一个 `creative_work` Task；所有成员加入当前模型步骤的唯一 OperationBatch/collecting Wait，前台只收到 durable receipt，不被阻塞。
4. text worker claim 某个 Task attempt，Task handler 启动一次无状态流式 Worker。Worker 自动读取 `creative-core`，看到完整紧凑 Skill 目录后自行读取相关专业 Skill；provider 公开 reasoning 与 `read_skill` 调用/结果元数据以有界 lifecycle projection 更新同一 Task，Skill 正文与完整 history 不进入该 projection。
5. Worker 返回 strict output；handler 校验 output kind、结构、预算与真实 Skill trace，把完整结果写入 `Task.result`，终态事件和 continuation 只携带 reference projection。
6. 全部批量成员终态后，collecting Wait 只恢复主 Agent 一次。主 Agent 按 taskId 读取所需完整结果，再通过既有 Operation 唯一入口采用 Bible、建立/修改 Resource、生成媒体或继续规划。

剧本专用交接仍服从上述同一生命周期：主 Agent 先获得 completed `screenplay_draft` Task，再显式调用 `materialize_screenplay_draft` 运行无模型的 07S compiler 并写一个结构化 Resource；用户审阅后才可由 `confirm_script_resource` 更新保留 Binding。随后 `asset_prompt_set` 的 Task 输入由服务端从该 Binding 与 adopted Style Binding 编译，Primary 不能把历史消息、自由文本剧本或另一 Style revision 塞入该上下文。07S 不创建 Task/Wait，也不会自动提交资产 Task。

主 Agent 按总时长选择配方：不超过 15 秒可单次生成；15–180 秒使用 finalized Style Bible → 一个 `screenplay_draft` Task → 07S 物化并确认剧本 → 从 canonical registries 生成重复身份所需资产 → 一个整片 `video_prompt_set` → 并行片段与合成；只有大于 180 秒才建立正式 Source/全局 Bible、使用唯一 splitter 与 `delegation.source=chapters`。Bible、Style Bible、Chapter 或 Subagent Task 任一步都不自动调用下一步；依赖来自主 Agent 的显式 plan 与精确输入引用，而不是隐藏工作流。

取消、超 turn、超读取预算、Skill URI 非法、输出不合约或 provider 失败只影响当前 Task attempt，并继续服从 Task retry/terminal 规则。Worker 自己没有 retry、Wait 或补偿权。失败不会写领域事实；是否重新委派由主 Agent 在 continuation 或后续用户 turn 中显式决定。

## 验证

- `scripts/guards/prompt-semantic-regression.mjs` 应同时验证主 Agent 运行闭环、双语 Skill 关键语义、条件式转场与完整提示词示例、`style-development`/`asset-development` 分离以及旧 `visual-development` 身份删除。
- `tests/contracts/project-agent-toolset-conformance.test.ts` 从生产 Operation registry 证明唯一委派 Operation 进入完整 toolset，并验证 strict `delegation.source=requests|chapters` schema。
- `tests/unit/creative-worker/screenplay-compiler.test.ts` 以纯 schema/compiler 为 oracle，反证非连续同场景错误合并、kernel payload 丢失、持久 07S 文档被篡改，以及角色 profile/canonical name、sequence→scene→beat chronology、state mutation、exact replay、external hook 地点/状态/scene identity、entity reference 和 parallel join 的适用 06T 缺口；conformance suite 只锁定 `creative_work_v4`、chapter output capability policy 与剧本确认/风格采用的 Tool 契约。风格／剧本来源 Revision canonicalize、materialize scope、confirm 的 Task/Resource origin/scope 与 07S 重算仍无专门 execute-path 测试；这些测试都不替代从真实模型到确认剧本再到资产集的组合 Journey。
- `tests/unit/project-agent/subagent-events.test.ts` 以 Task.status 和 lifecycle projection 为独立 oracle，反证 reasoning/read_skill 记录被 parser 丢弃或工具结果未进入 Skill 读取 View；TaskDefinition conformance、OperationBatch/Wait Critical 场景和 Assistant Session/Task SSE 场景仍是 Task 生命周期与聚合语义的适用证据。真实 provider 流、批量 Subagent、刷新、失败、终态自动折叠和单次恢复仍为未验证范围。
- TypeScript、ESLint 与 architecture guards 只能验证类型和结构；它们不能证明真实外部模型一定选择正确 Skill、按长片配方规划或产出高质量导演结果。

## 历史回归

- v4 剧本链第一版虽冻结 Style 与 strict output，却仍把 caller 提交的 source `content` 和其声称的 Resource/domain provenance 一起写入 Task；06T 又只检查 ID 已知，未证明角色 profile、scene/kernel/stateDelta 覆盖、kernel→scene entity subset 与 join 的实际先行分支，materializer/confirm 也只信同 project、operation marker 和已解析文档。结构测试因此可通过，而伪 lineage、跨 episode 物化和残缺 06T 仍能进入正式 Resource。当前防线由 production-context compiler 重读 Resource 内容/精确 scope、拒绝无 resolver 的 domain provenance，strict schema 补齐适用覆盖，materializer 精确匹配 Task scope，confirm 从 completed Task 重算 07S 并核对 Resource origin/scope；这些执行路径尚缺真实 Critical/Golden 组合证据。

- 风格 Task 前移到剧本之前后，第一版只在主 Agent Prompt 写了“先风格后剧本”，通用 sourceMaterials 仍允许调用方把下游 `project.source_script` 或任意自报 content 交给 `style_bible`，采用时却把其 Resource identity 记成精确 lineage；因此顺序说明不能反证旧的“从生成剧本反推风格”路径。当前 Task 提交前由共享 source resolver 重读精确 Resource revision/scope，拒绝正式 source-script、domain provenance 与不可重读内容，Worker/Skill 同时只把用户起始简报和主动参考视为主链风格输入。恶意把下游正文伪装成 `provenance=none` 无法由当前 Task 协议证明来源，真实提交路径也尚缺 Critical/Golden 证据。

- v4 Task payload 与 result 各自 strict 并不等于二者属于同一逻辑请求；早期 materialize/confirm/adopt 只检查 output kind，错配的 requestKey/lifecycle projection 仍可能冠以另一 Task provenance。当前共享 envelope matcher 要求 payload/result 的 requestKey、output kind、goal/lifecycle identity 一致，Style 与 screenplay 的唯一采用入口都必须复用；requests Tool schema 还把完整 screenplay 限为单元素分支，不能与另一请求混批或改走 Chapter batch。

- Resource-native 剧本确认首次只增加“把某个文字 Revision 设为当前剧本”的 Binding 入口，却没有限定 Revision 必须来自 completed Creative Task，也没有让完整结构、Style lineage 与 canonical asset registries 由唯一 materializer 持久化；旧 `ProjectEditBible` 生成/确认路径同时保留，形成两个可被解释为正式剧本的来源。当前 v4 防线把 00–06T 锁在一个 `screenplay_draft` Task 内，由唯一 07S 确定性 materializer 写结构化 Resource，`confirm_script_resource` 拒绝非该 Task/Operation 来源，资产 Worker 只消费确认 Binding 中的 registry。遗留 `ProjectEditBible` 路径尚未删除，因此当前只算新链局部收敛，不能宣称剧本架构完成。

- 2026-07 的视频链路重构曾一次性缩短主 Agent Prompt，并连带删除 Choice、Task continuation、失败边界等仍有效运行规则；真实模型随后遗漏 Choice，deterministic provider 又无法反证。Creative Skill 迁移不得重演“删除大段 Prompt 等于迁移”：当前防线先分类运行规则、专业知识、严格 adapter、确定性 builder 与确实 obsolete 内容，只有 owner 已替换的创意 Prompt 才删除。
- 初版 Creative Worker 把 Subagent 作为同一 Tool call 内同步 Activity，`ProjectAgentActivity.id`、`subagent.progressed` 和 response data part 共同解释运行态；它不能后台存活、不能批量聚合，也会把长输出直接带回模型上下文。当前一次性删除该解释权：Task.id/status 是唯一身份与状态，OperationBatch/Wait 是唯一聚合恢复，Task.result 保存完整输出，Session/continuation 只收 reference projection。
- 视觉专业知识最初合并为 `visual-development`，同时包含全局风格裁决与角色/场景/道具生成，导致资产修改可能反向改写 Style Bible。当前删除旧 identity，并分别由 `style-development` 与 `asset-development` 独占职责；资产可独立工作，但提供确认风格时只能消费该事实。
- 后续为自由创作补充图片与视频方法时，详细专业知识全部常驻主 Prompt，使简单请求也支付整份上下文成本，并让主 Agent 同时承担编排与专业创作。当前主 Prompt 只保留委派纪律，专业方法由 Worker 按需读取；Worker 没有项目写权，因此不会形成第二业务 Agent runtime。
- 一分钟视频真实请求曾由 Primary 在委派前硬编码“6 段、每段 10 秒”，同时跳过剧本诊断、Style Bible 与重复身份资产；Worker 没有服务端能力上下文，只能服从该错误切分。旧 Prompt 又让“完整作品走最短通用路径”与长作品规则竞争，无法确定哪条优先。当前防线以 15/180 秒划分唯一 Playbook，Primary 只传总时长；服务端注入项目画幅与允许时长，Worker 独占分段并优先最大允许时长；任何视频 Worker 请求缺少精确 Style Bible 均 fail closed。真实外部模型是否稳定选择正确配方仍待用户手工复验。
- 首次试图约束视频导演质量时，`video_prompt_set` 同时输出 `globalDirection + directorTimeline + finalPrompt`；运行时只能证明时间线连续覆盖，却无法证明平行字段中的专业判断真的进入最终视频模型输入，Primary 还必须再次理解或总结这些过程字段，形成两个竞争的创意表达。真实成功样例只消费每段最终 Prompt，并已把入口/出口状态、可见动作、逐字对白、同步声音和接缝设计直接写入其中。当前删除所有平行过程字段，以唯一 `prompt` 作为创意指令权威；strict schema 只保留执行元数据，Skill 通过完整示例约束内化质量。真实外部模型能否长期稳定遵守仍需手工复验。
- 条件式转场初版只要求描述前镜终点与后镜起点，没有显式拒绝叠化；真实视频模型即使没有收到“叠化”字样，也可能按生成先验自行使用交叉溶解、淡入或淡出。黑暗示例中的“降至全黑、逐渐揭示”还会放大这一倾向。当前防线要求每份多 Shot 最终提示词携带固定禁止句，把黑暗衔接限定为场景内真实变暗后清楚切换，并由双语 Skill guard 锁定；真实外部模型服从性仍需生成复验。
- 同场景、同人物的相邻独立片段曾以近似宽幅构图衔接，人物却从画面边缘跳到中央。旧 Skill 只要求前段末镜头与后段首镜头具有“景别或角度差异”，Worker 以宽幅侧景到宽幅背景满足字面要求；旧语义 guard 也只证明泛化规则存在，不能反证同景别换角度和缺失站位锚点。当前防线删除该二选一表述：最终输出前逐对检查全部独立片段接缝，前后必须形成真实可见的不同景别，角度变化不能替代景别变化；需要站位的首尾画面以稳定实物锚点、画面区域或纵深、朝向和道具关系正向描述，并由双语成对示例与现有 Skill guard 锁定。`video_prompt_set` 仍只消费唯一 `prompt`，没有新增过程字段；真实外部视频模型对空间指令的服从度仍需生成复验。
- 同一次真实视频提示词任务只读取了 `video-direction` 与连续性知识，未读取同时包含通用导演方法和输出前审查的 `director-core`、`quality-review`；因此只修改未被选中的 Skill 不能影响该次结果。当前不在服务端建立第二份映射，而把 `outputKind=video_prompt_set` 所需的三 Skill 组合同时写进 registry 摘要和三份 Skill 正文，使 Worker 在读取正文前即可看到适用关系，并由双语语义 guard 防止说明回退。服务端仍不伪装模型已遵守；真实运行是否读取齐全以 `skillTrace` 为证。

## 修改检查表

1. 新知识是否进入既有 Skill identity，而不是新增固定角色或第二 Worker？
2. Worker 是否仍只有 `read_skill` 一个只读工具，且完整目录由 registry 注入而非 Discover？
3. output kind 是否来自穷尽 registry，并保持 strict/fail closed；是否错误恢复了 `story_analysis`？
4. 每个 Subagent 是否只对应一个 `creative_work` Task，identity/status 是否只来自 Task？
5. 批量是否只复用 OperationBatch/collecting Wait，并只恢复主 Agent 一次？
6. 完整结果是否只在 Task.result，SSE/Session/continuation 是否只使用 reference projection？
7. `video_prompt_set` 是否只保留执行所需字段，并把全部适用导演知识内化进唯一 `prompt`，没有平行过程字段或隐藏串行 Task？
8. Bible 后是否仍由主 Agent 显式决定，Chapter 是否只由唯一 splitter 产生，Context Compiler 是否纯派生？
9. 风格与资产是否分别归 `style-development` / `asset-development`，旧 `visual-development` 是否完全删除？
10. 是否保留 Operation、Canvas、计费、Approval/Choice、严格 adapter 与 provider builder，且未新增第二业务写入口？
