import { executeAiTextStep } from '@/lib/ai-exec/engine'
import { safeParseJsonObject } from '@/lib/json-repair'
import {
  compactKernelCompilerForAudio,
  type KernelCompilerScript,
} from './kernel-compiler'
import {
  compactNativeAudioForPrompt,
  nativeAudioAnalysisSchema,
  type NativeAudioAnalysis,
} from './native-audio-types'
import {
  kernelTimelineAlignmentSchema,
  type KernelTimelineAlignment,
} from './kernel-alignment-types'
import { type NativeActionEvent, type TimelineClock } from './types'
import type { VideoVisualAnalysis } from './video-visual-types'

export { kernelTimelineAlignmentSchema } from './kernel-alignment-types'
export type { KernelTimelineAlignment } from './kernel-alignment-types'

export function buildKernelAlignmentPrompt(input: {
  readonly script: KernelCompilerScript
  readonly visualAnalysis: VideoVisualAnalysis
  readonly nativeAudioAnalysis: NativeAudioAnalysis
  readonly clock: TimelineClock
}): string {
  return [
    '# Role',
    'You align a final Kernel Compiler screenplay to a locked 24fps video and its existing native audio.',
    '',
    '# Authority',
    '1. The frame clock is the only timing authority. Never use kernel_runtime_sec as timing.',
    '2. Kernel order is immutable. alignedKernels must contain every input kernel exactly once, in order, with contiguous non-overlapping ranges covering frames 0 through totalFrames.',
    '3. Use screenplay text for dramatic meaning and expected dialogue/action identity; use visual observations and native-audio activity/transients for actual timing.',
    '4. Do not invent an audible action. Mark audibleState=uncertain when waveform evidence is insufficient, and missing only when positive visual timing exists but native audio evidence is absent.',
    '5. Native action events describe already-rendered physical sounds only. Never propose generated Foley, effects, dialogue, ambience, or music.',
    '6. Dialogue ranges must stay inside their owning kernel and use zero-based dialogueIndex. Omit a range when it cannot be aligned reliably.',
    '7. Return strict JSON only with no Markdown or additional fields.',
    '',
    '# Output schema',
    JSON.stringify({
      schemaVersion: 1,
      alignedKernels: [{
        kernelId: 'K-0001',
        range: { startFrame: 0, endFrameExclusive: input.clock.totalFrames },
        confidence: 0.9,
        dialogueRanges: [{ dialogueIndex: 0, range: { startFrame: 10, endFrameExclusive: 40 }, confidence: 0.8 }],
        nativeActionEvents: [{
          eventId: 'native-action-stable-id',
          actionType: 'screenplay action identity',
          range: { startFrame: 45, endFrameExclusive: 55 },
          anchorFrame: 50,
          confidence: 0.8,
          audibleState: 'present',
          mixImportance: 'story',
          description: 'already-rendered synchronized action sound',
        }],
      }],
      unresolvedKernelIds: [],
    }),
    '',
    '# Frame clock',
    JSON.stringify(input.clock),
    '',
    '# Kernel screenplay',
    JSON.stringify(compactKernelCompilerForAudio(input.script)),
    '',
    '# Visual observations',
    JSON.stringify(input.visualAnalysis),
    '',
    '# Native audio evidence',
    JSON.stringify(compactNativeAudioForPrompt(nativeAudioAnalysisSchema.parse(input.nativeAudioAnalysis))),
  ].join('\n')
}

export function parseKernelTimelineAlignment(input: {
  readonly text: string
  readonly script: KernelCompilerScript
  readonly clock: TimelineClock
}): KernelTimelineAlignment {
  const parsed = kernelTimelineAlignmentSchema.safeParse(safeParseJsonObject(input.text))
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}:${issue.message}`).join(',')
    throw new Error(`AUDIO_KERNEL_ALIGNMENT_INVALID:${issues}`)
  }
  const expectedIds = input.script.micro_beat_kernels.map((kernel) => kernel.kernel_id)
  const actualIds = parsed.data.alignedKernels.map((kernel) => kernel.kernelId)
  if (JSON.stringify(actualIds) !== JSON.stringify(expectedIds)) {
    throw new Error(`AUDIO_KERNEL_ALIGNMENT_KERNEL_MAP_INVALID:${actualIds.join(',')}`)
  }
  parsed.data.alignedKernels.forEach((kernel, index) => {
    const expectedStart = index === 0 ? 0 : parsed.data.alignedKernels[index - 1]?.range.endFrameExclusive
    if (kernel.range.startFrame !== expectedStart) {
      throw new Error(`AUDIO_KERNEL_ALIGNMENT_NOT_CONTIGUOUS:${kernel.kernelId}`)
    }
    const scriptKernel = input.script.micro_beat_kernels[index]
    if (!scriptKernel) throw new Error(`AUDIO_KERNEL_ALIGNMENT_SCRIPT_KERNEL_MISSING:${kernel.kernelId}`)
    kernel.dialogueRanges.forEach((dialogue) => {
      if (dialogue.dialogueIndex >= scriptKernel.dialogue.length
        || dialogue.range.startFrame < kernel.range.startFrame
        || dialogue.range.endFrameExclusive > kernel.range.endFrameExclusive) {
        throw new Error(`AUDIO_KERNEL_ALIGNMENT_DIALOGUE_RANGE_INVALID:${kernel.kernelId}:${dialogue.dialogueIndex}`)
      }
    })
    kernel.nativeActionEvents.forEach((event) => {
      if (event.range.startFrame < kernel.range.startFrame || event.range.endFrameExclusive > kernel.range.endFrameExclusive) {
        throw new Error(`AUDIO_KERNEL_ALIGNMENT_ACTION_RANGE_INVALID:${kernel.kernelId}:${event.eventId}`)
      }
    })
  })
  const last = parsed.data.alignedKernels[parsed.data.alignedKernels.length - 1]
  if (last?.range.endFrameExclusive !== input.clock.totalFrames) {
    throw new Error('AUDIO_KERNEL_ALIGNMENT_TIMELINE_COVERAGE_INVALID')
  }
  return parsed.data
}

export async function alignKernelCompilerToTimeline(input: {
  readonly userId: string
  readonly model: string
  readonly projectId: string
  readonly script: KernelCompilerScript
  readonly visualAnalysis: VideoVisualAnalysis
  readonly nativeAudioAnalysis: NativeAudioAnalysis
  readonly clock: TimelineClock
}): Promise<KernelTimelineAlignment> {
  const completion = await executeAiTextStep({
    userId: input.userId,
    model: input.model,
    messages: [{ role: 'user', content: buildKernelAlignmentPrompt(input) }],
    temperature: 0.1,
    projectId: input.projectId,
    action: 'audio_kernel_timeline_alignment_v1',
    meta: {
      stepId: 'audio_kernel_timeline_alignment_v1',
      stepTitle: 'audio_kernel_timeline_alignment_v1',
      stepIndex: 1,
      stepTotal: 1,
    },
  })
  return parseKernelTimelineAlignment({ text: completion.text, script: input.script, clock: input.clock })
}

export function flattenNativeActionEvents(alignment: KernelTimelineAlignment): readonly NativeActionEvent[] {
  const events = alignment.alignedKernels.flatMap((kernel) => kernel.nativeActionEvents)
  const ids = new Set<string>()
  for (const event of events) {
    if (ids.has(event.eventId)) throw new Error(`AUDIO_NATIVE_ACTION_DUPLICATE_ID:${event.eventId}`)
    ids.add(event.eventId)
  }
  return events
}
