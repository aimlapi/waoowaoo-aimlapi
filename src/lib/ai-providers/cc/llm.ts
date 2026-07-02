import { runOpenAIBaseUrlLlmCompletion, runOpenAIBaseUrlLlmStream } from '@/lib/ai-providers/shared/openai-base-llm'
import type {
  AiProviderLlmResult,
  AiProviderLlmStreamContext,
} from '@/lib/ai-providers/runtime-types'
import type { ProviderChatMessage } from '@/lib/ai-providers/shared/llm-support'

export async function runCcLlmCompletion(input: {
  modelId: string
  providerConfig: {
    apiKey: string
    baseUrl?: string
  }
  messages: ProviderChatMessage[]
  temperature: number
  reasoning: boolean
  reasoningEffort: 'minimal' | 'low' | 'medium' | 'high'
  maxTokens?: number
  maxRetries: number
}): Promise<AiProviderLlmResult> {
  if (!input.providerConfig.baseUrl) {
    throw new Error('PROVIDER_BASE_URL_MISSING: cc (llm)')
  }
  return await runOpenAIBaseUrlLlmCompletion({
    providerName: 'cc',
    providerKey: 'cc',
    modelId: input.modelId,
    baseUrl: input.providerConfig.baseUrl,
    apiKey: input.providerConfig.apiKey,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxTokens: input.maxTokens,
    maxRetries: input.maxRetries,
  })
}

export async function runCcLlmStream(input: AiProviderLlmStreamContext): Promise<AiProviderLlmResult> {
  if (!input.providerConfig.baseUrl) {
    throw new Error('PROVIDER_BASE_URL_MISSING: cc (stream)')
  }
  return await runOpenAIBaseUrlLlmStream({
    ...input,
    providerName: 'cc',
    providerKey: 'cc',
  })
}
