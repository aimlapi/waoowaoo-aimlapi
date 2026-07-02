import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createOpenAiSdkLanguageModel } from '@/lib/ai-providers/shared/language-model'
import { runCcLlmCompletion, runCcLlmStream } from './llm'

export const ccAdapter: AiProviderAdapter = {
  providerKey: 'cc',
  completeLlm: (input) => runCcLlmCompletion({
    modelId: input.selection.modelId,
    providerConfig: input.providerConfig,
    messages: input.messages,
    temperature: input.temperature,
    reasoning: input.reasoning,
    reasoningEffort: input.reasoningEffort,
    maxTokens: input.maxTokens,
    maxRetries: input.maxRetries,
  }),
  languageModel: {
    create: (input) => {
      if (!input.providerConfig.baseUrl) {
        throw new Error('PROVIDER_BASE_URL_MISSING: cc (language-model)')
      }
      return createOpenAiSdkLanguageModel(input)
    },
  },
  streamLlm: runCcLlmStream,
}
