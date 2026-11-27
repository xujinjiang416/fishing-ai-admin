/**
 * http.ts — 全局 Axios 实例与响应解包
 *
 * 职责：
 * 1. 创建 baseURL 为 `/api`、超时 30s 的 Axios 实例；
 * 2. 请求拦截器自动注入 Bearer Token（未配置环境时直接报错）；
 * 3. 响应拦截器统一解包后端 `{ code, data, msg }` 协议，只把 data 交给业务层；
 * 4. 401 时清理本地登录态并跳转登录页。
 *
 * 关键流程：业务调用 -> 请求拦截器附加 Authorization -> 后端返回统一包裹 -> 响应拦截器判断 code
 *          -> code===0 返回 data / 否则弹出错误并 reject。
 * 注意：
 * - 解包后业务函数返回值即为 data，因此 admin.ts 中的封装使用类型断言还原泛型；
 * - TOKEN_KEY / ADMIN_KEY 是前端约定的 localStorage 键名，需与 stores/auth.ts 保持一致。
 */
import axios from 'axios'
import { createDiscreteApi } from 'naive-ui'
import { appConfig, isConfigured } from '@/config/env'

// 独立 API 实例：在组件外（拦截器中）也能调用 message 提示
const { message } = createDiscreteApi(['message'])

/**
 * 后端统一响应包裹结构
 * @template T data 字段的业务数据类型
 */
export interface ApiResp<T = unknown> {
  /** 业务状态码：0 表示成功，非 0 表示失败 */
  code: number
  /** 业务数据，失败时可能为 null */
  data: T
  /** 提示文案，成功时通常为空字符串，失败时为错误原因 */
  msg: string
}

/** localStorage 键：登录令牌（Bearer Token 原文） */
export const TOKEN_KEY = 'fishai_admin_token'
/** localStorage 键：当前管理员信息（AdminInfo 的 JSON 字符串） */
export const ADMIN_KEY = 'fishai_admin_info'

// Axios 实例：baseURL 由 src/config/env.ts 按构建模式自动选择；
// 生产环境地址未配置时，请求拦截器会直接给出明确错误。
const API_BASE = appConfig.apiBase
const http = axios.create({ baseURL: API_BASE || '/', timeout: 30000 })

// 请求拦截：未配置环境直接失败；存在本地 token 时统一附加 Authorization 头
http.interceptors.request.use((config) => {
  if (!isConfigured) {
    return Promise.reject(new Error(`${appConfig.name}尚未配置 API 地址，请先填写 src/config/env.ts`))
  }
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// 响应拦截：成功分支解包统一结构，失败分支统一提示与 401 处理
http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResp
    // 命中后端统一包裹协议时按 code 判定成败
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data as never
      message.error(body.msg || '操作失败')
      return Promise.reject(new Error(body.msg || '操作失败'))
    }
    // 非包裹结构（如文件流）原样返回
    return body as never
  },
  (err) => {
    // 错误优先级：后端 msg > 超时提示 > Axios 原始 message > 兜底文案
    const status: number | undefined = err.response?.status
    const msg: string =
      err.response?.data?.msg ||
      (err.code === 'ECONNABORTED' ? '请求超时' : '') ||
      err.message ||
      '网络错误'
    // 未授权：清理本地登录态并跳转登录页（hash 路由，避免静态托管刷新 404）
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ADMIN_KEY)
      if (!location.hash.startsWith('#/login')) {
        message.error('登录已过期，请重新登录')
        setTimeout(() => (location.hash = '#/login'), 600)
      }
    } else {
      message.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

export default http