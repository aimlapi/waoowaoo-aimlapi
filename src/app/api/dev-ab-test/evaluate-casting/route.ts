import { NextRequest, NextResponse } from 'next/server'
import { apiHandler, ApiError } from '@/lib/api-errors'
import { isErrorResponse, requireUserAuth } from '@/lib/api-auth'
import { evaluateDevAbCasting } from '@/lib/dev-ab-test/casting-evaluator'
import type { Locale } from '@/i18n/routing'

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function readLocale(value: unknown): Locale {
  return value === 'en' ? 'en' : 'zh'
}

export const POST = apiHandler(async (request: NextRequest) => {
  const authResult = await requireUserAuth()
  if (isErrorResponse(authResult)) return authResult

  const body = toObject(await request.json().catch(() => ({})))
  const baseRequest = readString(body.baseRequest)
  const requestA = readString(body.requestA)
  const requestB = readString(body.requestB)
  const imageUrlA = readString(body.imageUrlA)
  const imageUrlB = readString(body.imageUrlB)

  if (!baseRequest || !requestA || !requestB || !imageUrlA || !imageUrlB) {
    throw new ApiError('INVALID_PARAMS')
  }

  const result = await evaluateDevAbCasting({
    userId: authResult.session.user.id,
    locale: readLocale(body.locale),
    baseRequest,
    variants: [
      { id: 'A', request: requestA, imageUrl: imageUrlA },
      { id: 'B', request: requestB, imageUrl: imageUrlB },
    ],
  })

  return NextResponse.json(result)
})
