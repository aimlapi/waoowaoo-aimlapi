<!-- architecture-module: project-asset-ownership -->

# 项目资产所有权

## 设计理念

角色、场景和道具只存在于项目内。资产身份由 owner user、project、asset kind、asset ID 和可选 variant ID 共同组成；不存在全局 scope、全局资产库、跨项目复制或从其他记录推断归属的旁路。

Route 鉴权只证明调用者拥有请求中的项目。共享项目资产所有权 service 继续证明 asset 与 variant 确实属于同一个项目且 kind 一致。Route、UI、Operation 和 Task 都只能消费这个结论，不能各自用裸 ID 重新解释所有权。

## 不变量

- **PAO-01 — 项目身份不可拆分。** 每个资产请求必须显式携带 project ID；项目必须属于当前用户，资产必须属于该项目，请求 kind 必须与持久化 kind 一致。
- **PAO-02 — 子实体不能悬空。** appearance、image、render 或其他 variant ID 只有在它属于已验证的 parent asset 时才有效。
- **PAO-03 — 共享 service 是唯一所有权裁判。** 所有 mutation、plan 和 read-for-write 都必须调用 `project-asset-ownership.ts`；Route 项目鉴权不能代替 asset/variant 校验。
- **PAO-04 — 不匹配不得泄露资源存在性。** missing、foreign project、wrong kind 和 cross-parent 必须在副作用发生前统一以 `NOT_FOUND` 失败。
- **PAO-05 — 只有项目级单轨。** 禁止恢复全局资产模型、Asset Hub route/UI/task、scope 分支、跨项目 copy、source-global bridge 或 global fallback。
- **PAO-06 — 删除不得只凭裸 ID。** destructive deletion 必须经过与 update、select、revert 相同的 project + owner + kind 身份证明。
- **PAO-07 — 制作规划资产来源显式。** `confirmEpisodeEditBible` 的确认事务通过 `ensureEditBibleAssets` 物化 ProjectCharacter/ProjectLocation 及其首个 variant；后续 `generate_edit_script_assets` 只为这些既有 identity 提交生成任务，不再创建同义资产。
- **PAO-08 — 领域关系不拥有共享媒体回收权。** select、confirm、revert、cleanup、delete 与 project delete 只更新领域关系。只有本次上传新建且尚未提交到任何关系的临时对象，才可在所属事务失败时按 prepare identity 补偿。

## 权威入口

| 事实或动作 | 唯一权威入口 | 持久化依据 |
| --- | --- | --- |
| owner、project、kind、parent/variant 解析 | `src/lib/assets/services/project-asset-ownership.ts` | Project.userId、asset.projectId、assetKind、variant parent foreign key |
| 资产 mutation 与删除 | `src/lib/assets/services/asset-actions.ts` | 上述 service 验证的完整 target |
| location-backed 资产操作 | `src/lib/assets/services/location-backed-assets.ts`，仅由 project asset actions 调用 | 已验证的 project asset identity |
| upload/render 写入 | `src/lib/assets/services/project-upload-render.ts` | 事务外预检与上传；短事务用 target identity + prepare `updatedAt` CAS 取得写权；失败只补偿本次未建立关系的临时 key |
| API 与 Operation | `src/app/api/assets/**`、`src/app/api/projects/[projectId]/assets/**`、`src/lib/operations/api-only/assets-api-ops.ts` | `requireProjectAuthLight` + ownership service |

请求 body 中的 ID、UI card identity、最近记录或裸 variant ID 都不是所有权事实。调用方不得在 ownership service 失败后回退到 `findUnique({ id })`。

## 验证

- `npm run check:project-asset-ownership` 拒绝恢复全局资产入口、scope/copy bridge、raw-ID mutation、跨父级 variant、鉴权旁路和领域侧物理媒体删除。
- `tests/integration/api/specific/project-asset-ownership.integration.test.ts` 使用真实 MySQL 验证 character/location/prop 的合法项目身份、跨项目/wrong-kind/cross-parent 拒绝，以及共享 prepare 版本的第二次上传必须被 stale `updatedAt` CAS 拒绝。
- `GJ-PROJECT-ASSET-CROSS-PROJECT-DENIAL` 通过真实浏览器登录、生产项目资产 PATCH route 和只读 MySQL oracle，证明用户不能借自己拥有的项目改写另一项目的资产。

结构检查只证明已知旁路没有恢复；跨用户拒绝由最小安全 Journey 证明，普通合法/非法组合与并发 CAS 由真实 MySQL integration 证明。

## 历史回归

- unified asset service 初版只对来源做 owner 限定，项目 target 仍使用裸 `findUnique({ id })`。用户可以通过自己项目的 Route 鉴权，再把另一个项目的 asset ID 作为 target。修复把 owner、project、kind 与 parent/variant 收敛到共享 resolver，Golden Journey 保留真实跨项目反证。
- 旧系统同时维护用户级 Asset Hub 与项目资产库，并用 copy operation、source-global bridge、scope 分支和两套 UI/worker 连接。只要任一触点漏接，便会重新出现双 writer、跨 scope 误判和难以穷尽的组合。删除前只读数据检查确认全局表、桥接引用和备份表均为空；当前版本一次删除全局模型、入口、任务与复制链路，只保留项目资产。
- 上传流程曾把图片处理、对象存储和空间分析放进 interactive transaction，并在事务内外混用 Prisma client。当前 Operation 分为事务外 prepare、短事务 commit 与按 prepare identity 补偿；同步媒体规范化和投影复用同一 transaction client。
- 项目删除曾先枚举 URL 并删除 storage，再删除数据库。这既无法在 DB 失败时恢复对象，也误把项目引用当成媒体独占所有权。当前 `delete_project` 只在事务内删除领域关系；物理回收由媒体生命周期 owner 独立证明零引用。

## 修改检查表

- 是否显式传递 owner、project、kind、asset 与 variant identity，而不是裸 ID？
- child/variant 是否通过 parent foreign key 验证，没有最近记录或独立 ID 查询旁路？
- mutation、plan、Task、upload 或 storage 副作用是否全部发生在 ownership 校验之后？
- missing、foreign、wrong-kind、cross-parent 是否都在副作用前以不泄露存在性的错误失败？
- 是否恢复了 global scope、Asset Hub、copy、source-global bridge 或第二套资产 writer？任何一项都违反 PAO-05。
- destructive helper 是否仍只能从 `asset-actions.ts` 的项目资产入口调用？
- 是否把关系删除误写成 storageKey 物理删除？除本次失败上传的唯一临时 key 外，领域操作不得承担媒体 GC。
- 若新增资产 kind 或 variant，是否同步 production registry、ownership service、真实 MySQL conformance 与适用 Golden Journey？
- 是否运行 `npm run check:architecture-docs`、`npm run check:project-asset-ownership` 和行为影响对应的 canonical test command？
