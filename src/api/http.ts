import axios from 'axios'
import { createDiscreteApi } from 'naive-ui'

const { message } = createDiscreteApi(['message'])

export interface ApiResp<T = unknown> {
  code: number
  data: T
  msg: string
}

export const TOKEN_KEY = 'fishai_admin_token'
export const ADMIN_KEY = 'fishai_admin_info'

const http = axios.create({ baseURL: '/api', timeout: 30000 })

http.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResp
    if (body && typeof body === 'object' && 'code' in body) {
      if (body.code === 0) return body.data as never
      message.error(body.msg || '操作失败')
      return Promise.reject(new Error(body.msg || '操作失败'))
    }
    return body as never
  },
  (err) => {
    const status: number | undefined = err.response?.status
    const msg: string =
      err.response?.data?.msg ||
      (err.code === 'ECONNABORTED' ? '请求超时' : '') ||
      err.message ||
      '网络错误'
    if (status === 401) {
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ADMIN_KEY)
      if (!location.pathname.startsWith('/login')) {
        message.error('登录已过期，请重新登录')
        setTimeout(() => (location.href = '/login'), 600)
      }
    } else {
      message.error(msg)
    }
    return Promise.reject(new Error(msg))
  }
)

export default http