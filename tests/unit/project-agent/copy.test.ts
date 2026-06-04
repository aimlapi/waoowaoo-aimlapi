import { describe, expect, it } from 'vitest'
import { buildProjectAgentSystemPrompt } from '@/lib/project-agent/copy'

describe('project agent prompt copy', () => {
  it('uses direct operation rules instead of fixed workflow or skill-gateway rules', () => {
    const prompt = buildProjectAgentSystemPrompt({
      locale: 'zh',
      projectId: 'project-1',
      episodeId: 'episode-1',
      stage: 'concept',
      interactionMode: 'plan',
    })

    expect(prompt).toContain('只能使用当前注入的 tool 定义和当前项目上下文')
    expect(prompt).toContain('剧本 -> 视觉风格参考图 -> 角色选角测试与人物/场景/道具资产 -> 空间分析 -> 分镜 panel 文本 -> 分镜图 -> 视频片段 -> 最终成片')
    expect(prompt).toContain('若没有 ready 的 editScreenplay，先调用 generate_edit_screenplay')
    expect(prompt).toContain('若已有 ready 的 editScreenplay，先生成视觉风格参考，再直接创建/生成项目资产')
    expect(prompt).toContain('调用 generate_character_casting_test，并传 promptMode=casting_photo 与 appearanceId')
    expect(prompt).toContain('固定生成三组选角/定妆候选包')
    expect(prompt).toContain('只有当用户明确要求“剪辑表”或旧剪辑先行表时，才调用 generate_edit_script')
    expect(prompt).toContain('只有当用户明确询问技能、可复用计划或 skill catalog 文档时，才使用 Agent Skill 工具')
    expect(prompt).not.toContain('只能通过固定 workflow package 执行')
    expect(prompt).not.toContain('workflow package 内部 skills 顺序不可更改')
    expect(prompt).not.toContain('先调用 search_skills')
  })
})
