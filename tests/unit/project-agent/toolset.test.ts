import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import {
  isProjectAgentOperationAlwaysEnabled,
  isProjectAgentOperationEnabled,
  resolveProjectAgentToolset,
} from '@/lib/project-agent/toolset'
import type { ProjectAgentOperationRegistry } from '@/lib/operations/types'
import type { EditFirstWorkflowOperationId, EditFirstWorkflowState } from '@/lib/project-workflow/edit-first'
import { EDIT_FIRST_WORKFLOW_OPERATION_IDS } from '@/lib/project-workflow/edit-first'
import {
  EDIT_FIRST_CHOICE_OPERATION_IDS,
  EDIT_FIRST_CHOICE_TOOL_IDS,
  isEditFirstChoiceToolId,
} from '@/lib/project-agent/edit-first-choice-tools'
import { EFFECTS_BILLABLE, EFFECTS_NONE, makeTestOperation } from '../../helpers/project-agent-operations'

function makeOperation(id: string, intent: 'query' | 'plan' | 'act' = 'query') {
  return makeTestOperation({
    id,
    summary: id,
    intent,
    groupPath: id.startsWith('get_') || id.startsWith('list_') ? ['project', 'read'] : ['edit-script'],
    effects: intent === 'act' ? EFFECTS_BILLABLE : EFFECTS_NONE,
    inputSchema: z.object({}),
    outputSchema: z.unknown(),
    execute: async () => ({}),
  })
}

function workflow(stage: EditFirstWorkflowState['stage'], operationIds: string[]): EditFirstWorkflowState {
  const operationId = operationIds[0]
  return {
    active: true,
    stage,
    blocking: {
      kind: operationId ? 'needs_confirmation' : 'none',
      reason: null,
    },
    nextAction: operationId
      ? {
          id: operationId,
          operationId: operationId as EditFirstWorkflowOperationId,
          title: operationId,
          requiresUserConfirmation: true,
        }
      : null,
    allowedOperationIds: operationIds as EditFirstWorkflowState['allowedOperationIds'],
  }
}

function registry(): ProjectAgentOperationRegistry {
  const ids = [
    'get_project_phase',
    'get_project_context',
    'get_project_snapshot',
    'get_task_status',
    ...EDIT_FIRST_CHOICE_OPERATION_IDS,
    ...EDIT_FIRST_WORKFLOW_OPERATION_IDS,
  ]
  return Object.fromEntries(ids.map((id) => [
    id,
    makeOperation(id, id.startsWith('get_') || isEditFirstChoiceToolId(id) ? 'query' : 'act'),
  ]))
}

describe('project agent live toolset registration', () => {
  it('registers read tools, the choice tool, and the full workflow surface for an episode run', () => {
    const result = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })

    expect(result.source).toBe('live-workflow')
    expect(result.operationIds).toEqual(expect.arrayContaining([
      'get_project_phase',
      'get_project_context',
      ...EDIT_FIRST_CHOICE_OPERATION_IDS,
      ...EDIT_FIRST_WORKFLOW_OPERATION_IDS,
    ]))
  })

  it('keeps the choice tool available without forcing a continuation operation', () => {
    const result = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })

    expect(result.operationIds).toContain('generate_edit_screenplay')
    expect(result.operationIds).toEqual(expect.arrayContaining([...EDIT_FIRST_CHOICE_OPERATION_IDS]))
    expect(result.includeChoiceOperation).toBe(true)
  })

  it('fails explicitly when a workflow operation is missing from the registry', () => {
    const missingRegistry = registry()
    delete missingRegistry.generate_edit_script_assets

    expect(() => resolveProjectAgentToolset({
      registry: missingRegistry,
      context: { episodeId: 'episode-1' },
    })).toThrow('PROJECT_AGENT_REQUIRED_OPERATION_MISSING:generate_edit_script_assets')
  })
})

describe('project agent live operation enablement', () => {
  it('enables only the current direct workflow operation plus the next action', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })
    const current = workflow('ready_to_generate_assets', ['generate_edit_script_assets'])

    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: current,
      operationId: 'generate_edit_script_assets',
    })).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: current,
      operationId: 'generate_edit_script_storyboard',
    })).toBe(false)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: current,
      operationId: 'generate_episode_videos',
    })).toBe(false)
  })

  it('enables the next stage operation as soon as the workflow advances mid-run', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
      resumeOperationId: 'generate_edit_script_assets',
    })

    const beforeAssets = workflow('ready_to_generate_assets', ['generate_edit_script_assets'])
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: beforeAssets,
      operationId: 'generate_edit_script_storyboard',
    })).toBe(false)

    // The asset operation completed inside this run and advanced the stage:
    // direct storyboard generation must light up without re-registering the toolset.
    const afterAssets = workflow('ready_to_generate_storyboard', ['generate_edit_script_storyboard'])
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: afterAssets,
      operationId: 'generate_edit_script_storyboard',
    })).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: afterAssets,
      operationId: 'generate_edit_screenplay',
    })).toBe(false)
  })

  it('keeps the resumed approval operation enabled even when the workflow has moved on', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
      resumeOperationId: 'generate_edit_screenplay',
    })
    const movedOn = workflow('screenplay_ready_for_review', ['generate_edit_style_previews'])

    expect(isProjectAgentOperationAlwaysEnabled(toolset, 'generate_edit_screenplay')).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: movedOn,
      operationId: 'generate_edit_screenplay',
    })).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: movedOn,
      operationId: 'generate_edit_style_previews',
    })).toBe(true)
  })

  it('does not always enable a workflow operation just because it follows a choice result', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })
    const review = workflow('screenplay_ready_for_review', ['generate_edit_style_previews'])

    expect(isProjectAgentOperationAlwaysEnabled(toolset, 'generate_edit_screenplay')).toBe(false)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: review,
      operationId: 'generate_edit_screenplay',
    })).toBe(false)
  })

  it('treats core read tools as always enabled while choice tools follow workflow stage gates', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })
    const review = workflow('screenplay_ready_for_review', ['generate_edit_style_previews'])
    const styleChoice = workflow('needs_style_choice', ['generate_edit_style_previews'])

    expect(isProjectAgentOperationAlwaysEnabled(toolset, 'get_project_phase')).toBe(true)
    expect(isProjectAgentOperationAlwaysEnabled(toolset, EDIT_FIRST_CHOICE_TOOL_IDS.screenplay_review)).toBe(false)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: review,
      operationId: EDIT_FIRST_CHOICE_TOOL_IDS.screenplay_review,
    })).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: styleChoice,
      operationId: EDIT_FIRST_CHOICE_TOOL_IDS.screenplay_review,
    })).toBe(false)
    expect(isProjectAgentOperationAlwaysEnabled(toolset, 'generate_edit_script')).toBe(false)
  })

  it('keeps stage capability rules like screenplay revision during review', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })
    const review = workflow('screenplay_ready_for_review', ['generate_edit_style_previews'])

    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: review,
      operationId: 'revise_edit_screenplay',
    })).toBe(true)
    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: review,
      operationId: 'generate_edit_script_storyboard',
    })).toBe(false)
  })

  it('does not enable asset review choice in the direct storyboard workflow', () => {
    const toolset = resolveProjectAgentToolset({
      registry: registry(),
      context: { episodeId: 'episode-1' },
    })
    const storyboardReady = workflow('ready_to_generate_storyboard', ['generate_edit_script_storyboard'])

    expect(isProjectAgentOperationEnabled({
      toolset,
      workflow: storyboardReady,
      operationId: 'request_edit_asset_review_choice',
    })).toBe(false)
  })
})
