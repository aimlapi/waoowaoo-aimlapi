/**
 * 检查错误是否是由于页面卸载/刷新导致的 fetch 中止
 * 用于避免在页面刷新时显示无意义的错误提示
 */
export function isAbortError(error: unknown): boolean {
    if (!error) return false

    // 检查 AbortError
    if (error instanceof DOMException && error.name === 'AbortError') {
        return true
    }

    // 检查 fetch 失败相关的错误信息
    if (error instanceof Error) {
        const message = error.message.toLowerCase()
        if (
            message.includes('abort') ||
            message.includes('cancelled') ||
            message.includes('canceled') ||
            message.includes('failed to fetch') ||
            message.includes('network request failed') ||
            message.includes('load failed') ||
            message.includes('the operation was aborted')
        ) {
            return true
        }
    }

    // 检查 TypeError (通常是网络错误)
    if (error instanceof TypeError && error.message.includes('fetch')) {
        return true
    }

    return false
}

/**
 * 安全的错误处理函数
 * 返回是否应该显示错误（如果是页面刷新导致的错误则返回 false）
 */
export function shouldShowError(error: unknown): boolean {
    return !isAbortError(error)
}
