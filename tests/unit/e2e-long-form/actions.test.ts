import { describe, expect, it } from 'vitest'
import { buildWorkflowNextActionUserMessage, readFollowUpAction, readNextActionFromSessionState } from '../../../scripts/e2e-long-form/actions'
import type { E2eRunnerConfig } from '../../../scripts/e2e-long-form/types'

const baseConfig: E2eRunnerConfig = {
  mode: 'live',
  target: 'assets_approved',
  generation: 'real',
  baseUrl: 'http://localhost:3000',
  locale: 'zh',
  username: null,
  password: null,
  sessionCookie: 'session=1',
  prompt: 'prompt',
  projectName: 'project',
  episodeName: 'episode',
  projectId: null,
  episodeId: null,
  aspectRatio: '16:9',
  assistantPermissionMode: 'ask',
  pollIntervalMs: 1000,
  stageTimeoutMs: 1000,
  overallTimeoutMs: 2000,
  reportDir: '/tmp/e2e',
}

describe('long-form E2E action reader', () => {
  it('selects the first script intake option in every group', () => {
    const action = readNextActionFromSessionState(baseConfig, {
      sessionState: {
        pendingInteraction: {
          kind: 'choice',
          runId: 'run-script-intake',
          interruptionId: 'interrupt-script-intake',
          choiceType: 'script_intake',
          toolCallId: 'tool-script-intake',
          choiceCard: {
            groups: [
              {
                key: 'tone',
                options: [
                  { value: 'cinematic', label: '电影感' },
                  { value: 'documentary', label: '纪实' },
                ],
              },
              {
                key: 'pace',
                options: [
                  { value: 'fast', label: '快节奏' },
                ],
              },
            ],
          },
        },
      },
    })

    expect(action).toEqual({
      kind: 'choice',
      action: {
        runId: 'run-script-intake',
        interruptionId: 'interrupt-script-intake',
        choiceType: 'script_intake',
        toolCallId: 'tool-script-intake',
        output: {
          ok: true,
          selections: {
            tone: 'cinematic',
            pace: 'fast',
          },
          labels: {
            toneLabel: '电影感',
            paceLabel: '快节奏',
          },
        },
      },
    })
  })

  it('approves script review choices', () => {
    const action = readNextActionFromSessionState(baseConfig, {
      sessionState: {
        pendingInteraction: {
          kind: 'choice',
          runId: 'run-script-review',
          interruptionId: 'interrupt-script-review',
          choiceType: 'script_review',
          toolCallId: null,
          choiceCard: { groups: [] },
        },
      },
    })

    expect(action).toEqual({
      kind: 'choice',
      action: {
        runId: 'run-script-review',
        interruptionId: 'interrupt-script-review',
        choiceType: 'script_review',
        toolCallId: null,
        output: {
          ok: true,
          decision: 'approve',
        },
      },
    })
  })

  it('submits bible review with the configured aspect ratio', () => {
    const action = readNextActionFromSessionState(baseConfig, {
      sessionState: {
        pendingInteraction: {
          kind: 'choice',
          runId: 'run-1',
          interruptionId: 'interrupt-1',
          choiceType: 'bible_review',
          toolCallId: 'tool-1',
          choiceCard: { groups: [] },
        },
      },
    })

    expect(action).toEqual({
      kind: 'choice',
      action: {
        runId: 'run-1',
        interruptionId: 'interrupt-1',
        choiceType: 'bible_review',
        toolCallId: 'tool-1',
        output: {
          ok: true,
          decision: 'approve',
          selections: {
            aspectRatio: '16:9',
          },
        },
      },
    })
  })

  it('selects the first style preview option through the choice API payload', () => {
    const action = readNextActionFromSessionState(baseConfig, {
      sessionState: {
        pendingInteraction: {
          kind: 'choice',
          runId: 'run-1',
          interruptionId: 'interrupt-1',
          choiceType: 'style',
          toolCallId: null,
          choiceCard: {
            submit: { aspectRatio: '9:16' },
            groups: [{
              key: 'stylePreviewId',
              options: [
                { value: 'style-1' },
                { value: 'style-2' },
              ],
            }],
          },
        },
      },
    })

    expect(action?.kind).toBe('choice')
    if (action?.kind !== 'choice') throw new Error('choice action expected')
    expect(action.action.output).toEqual({
      ok: true,
      stylePreviewId: 'style-1',
      aspectRatio: '9:16',
    })
  })

  it('builds task follow-up action from a claimed wait response', () => {
    expect(readFollowUpAction({
      success: true,
      followUps: [{
        runId: 'run-1',
        waitId: 'wait-1',
        claimId: 'claim-1',
      }],
    })).toEqual({
      runId: 'run-1',
      waitId: 'wait-1',
      claimId: 'claim-1',
    })
  })

  it('builds workflow next action messages with the operation id', () => {
    expect(buildWorkflowNextActionUserMessage({
      locale: 'zh',
      nextAction: {
        id: 'plan_chapters',
        operationId: 'plan_chapters',
        title: 'Plan chapters',
        requiresUserConfirmation: false,
      },
    })).toContain('operationId=plan_chapters')

    expect(buildWorkflowNextActionUserMessage({
      locale: 'en',
      nextAction: {
        id: 'generate_edit_script_assets',
        operationId: 'generate_edit_script_assets',
        title: 'Generate required assets',
        requiresUserConfirmation: false,
      },
    })).toContain('operationId=generate_edit_script_assets')
  })
})
