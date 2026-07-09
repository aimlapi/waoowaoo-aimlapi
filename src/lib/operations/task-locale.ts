import type { ProjectAgentOperationContext } from '@/lib/operations/types'
import { resolveRequiredTaskLocale } from '@/lib/task/resolve-locale'

export function resolveRequiredOperationTaskLocale(
  ctx: ProjectAgentOperationContext,
  payload?: unknown,
) {
  const contextLocale = typeof ctx.context.locale === 'string' ? ctx.context.locale.trim() : ''
  if (contextLocale) {
    return resolveRequiredTaskLocale(ctx.request, { meta: { locale: contextLocale } })
  }
  return resolveRequiredTaskLocale(ctx.request, payload)
}
