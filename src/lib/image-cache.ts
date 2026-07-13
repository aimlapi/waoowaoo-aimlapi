import { logInfo as _ulogInfo, logError as _ulogError } from '@/lib/logging/core'
import { toFetchableUrl } from '@/lib/storage'
import { LRUCache } from 'lru-cache'
/**
 * 🔥 图片下载缓存系统
 * 
 * 解决问题：批量生成分镜时，每个请求都重复下载相同的参考图片
 * 
 * 实现方式：
 * - 使用 LRU 缓存正在进行的下载 Promise
 * - 同一 URL 的并发请求共享同一个 Promise
 * - 缓存有 TTL，避免内存泄漏
 */

// 缓存条目类型
interface CacheEntry {
    promise: Promise<string>  // Base64 结果的 Promise
    expiresAt: number         // 过期时间戳
    size?: number             // 图片大小（字节）
}

// 缓存配置
const CACHE_TTL_MS = 5 * 60 * 1000  // 5 分钟 TTL
const MAX_CACHE_SIZE = 100          // 最多缓存 100 张图片

// 全局缓存
const imageCache = new LRUCache<string, CacheEntry>({
    max: MAX_CACHE_SIZE,
    ttl: CACHE_TTL_MS,
    ttlAutopurge: true,
})

// 统计信息
let cacheHits = 0
let cacheMisses = 0

/**
 * 获取图片的 Base64（带缓存）
 * 
 * @param imageUrl 图片 URL（http/https）或已经是 base64
 * @param options 选项
 * @returns Base64 格式的图片数据（data:image/...;base64,...）
 */
export async function getImageBase64Cached(
    imageUrl: string,
    options: {
        logPrefix?: string
        forceRefresh?: boolean
    } = {}
): Promise<string> {
    const { logPrefix = '[图片缓存]', forceRefresh = false } = options

    // 如果已经是 base64，直接返回
    if (imageUrl.startsWith('data:')) {
        return imageUrl
    }

    let fullUrl = imageUrl
    if (!imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
        throw new Error(`无效的图片 URL: ${imageUrl.substring(0, 50)}...`)
    }
    fullUrl = toFetchableUrl(fullUrl)

    const cacheKey = imageUrl

    // 检查缓存
    if (!forceRefresh) {
        const cached = imageCache.get(cacheKey)
        if (cached && cached.expiresAt > Date.now()) {
            cacheHits++
            _ulogInfo(`${logPrefix} ✅ 缓存命中 (${cacheHits}/${cacheHits + cacheMisses})`)
            return cached.promise
        }
    }

    cacheMisses++

    // 创建下载 Promise（共享给所有并发请求）
    const downloadPromise = downloadImageAsBase64(fullUrl, logPrefix)

    // 存入缓存
    imageCache.set(cacheKey, {
        promise: downloadPromise,
        expiresAt: Date.now() + CACHE_TTL_MS
    })

    // 下载完成后更新大小
    downloadPromise.then(base64 => {
        const entry = imageCache.get(cacheKey)
        if (entry) {
            entry.size = base64.length
        }
    }).catch(() => {
        // 下载失败，从缓存中移除
        imageCache.delete(cacheKey)
    })

    return downloadPromise
}

/**
 * 实际下载图片并转换为 Base64
 */
async function downloadImageAsBase64(imageUrl: string, logPrefix: string): Promise<string> {
    const startTime = Date.now()
    _ulogInfo(`${logPrefix} 开始下载: ${imageUrl.substring(0, 80)}...`)

    try {
        const response = await fetch(toFetchableUrl(imageUrl), {
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; ImageDownloader/1.0)'
            }
        })

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }

        const buffer = await response.arrayBuffer()
        const base64 = Buffer.from(buffer).toString('base64')
        const contentType = response.headers.get('content-type') || 'image/png'

        const duration = Date.now() - startTime
        const sizeKB = Math.round(buffer.byteLength / 1024)

        _ulogInfo(`${logPrefix} ✅ 下载完成: ${sizeKB}KB, ${duration}ms`)

        return `data:${contentType};base64,${base64}`
    } catch (error: unknown) {
        const duration = Date.now() - startTime
        const message =
            error instanceof Error
                ? error.message
                : (typeof error === 'object' && error !== null && typeof (error as { message?: unknown }).message === 'string')
                    ? (error as { message: string }).message
                    : '未知错误'
        _ulogError(`${logPrefix} ❌ 下载失败 (${duration}ms): ${message}`)
        throw error
    }
}
