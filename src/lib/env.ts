/**
 * 🔧 环境配置工具
 * 集中管理环境变量的获取，避免到处重复
 */

/**
 * 获取应用内部 baseUrl。
 * 用于容器内自调用、服务端 fetch 本应用 API、拉取本地 /api/files 资源等场景。
 */
export function getInternalBaseUrl(): string {
    return process.env.INTERNAL_APP_URL
        || process.env.INTERNAL_TASK_API_BASE_URL
        || process.env.NEXTAUTH_URL
        || 'http://localhost:3000'
}
