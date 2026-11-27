/**
 * env.ts — 管理后台多环境配置（唯一配置入口）
 *
 * development：本地开发 / 开发测试环境（vite dev，或 build --mode development）
 * production：生产环境（vite build 默认 mode）
 *
 * 生产地址当前留空；购买云服务后只填写 production.apiBase，
 * 重新构建即可生效，业务代码无需改动。
 */

export type AppEnvName = 'development' | 'production'

export interface AppEnvConfig {
  /** 环境名称，用于错误提示 */
  name: string
  /** 后端 API 根地址，必须包含 /api 后缀；生产环境当前留空 */
  apiBase: string
}

export const ENVIRONMENTS: Record<AppEnvName, AppEnvConfig> = {
  development: {
    name: '开发测试环境',
    apiBase: 'https://fishing-api-355464-8-1306325032.sh.run.tcloudbase.com/api',
  },
  production: {
    name: '生产环境',
    apiBase: '',
  },
}

/** 根据 Vite 构建模式解析环境名 */
export function resolveAppEnv(mode: string): AppEnvName {
  return mode === 'production' ? 'production' : 'development'
}

export const APP_ENV = resolveAppEnv(import.meta.env.MODE)
export const appConfig = ENVIRONMENTS[APP_ENV]
export const isConfigured = Boolean(appConfig.apiBase)

/**
 * 拼接完整 API 地址，供原生 fetch / 文件导出等不走 Axios 的场景使用。
 * @param path 以 / 开头的接口路径
 */
export function apiUrl(path: string): string {
  if (!appConfig.apiBase) {
    throw new Error(`${appConfig.name}尚未配置 API 地址，请先填写 src/config/env.ts`)
  }
  return appConfig.apiBase.replace(/\/+$/, '') + (path.startsWith('/') ? path : '/' + path)
}
