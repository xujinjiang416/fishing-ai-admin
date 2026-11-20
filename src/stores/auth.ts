/**
 * stores/auth.ts — 管理员登录态 Store（Pinia）
 *
 * 职责：维护当前管理员 Token 与信息，提供登录/退出动作及展示用 getter。
 * 关键流程：
 * - 初始化：从 localStorage（TOKEN_KEY / ADMIN_KEY）恢复登录态，解析失败则降级为未登录；
 * - login：调用 api.login -> 写入 state 与 localStorage；
 * - logout：调用 api.logout（失败忽略）-> 清空 state 与 localStorage。
 * 依赖：@/api/admin 的登录接口、@/api/http 的存储键名。
 * 注意：守卫与 http 拦截器直接读取 localStorage，因此登录/退出时必须同步持久化，不能只改 state。
 */
import { defineStore } from 'pinia'

import { api, type AdminInfo } from '@/api/admin'
import { ADMIN_KEY, TOKEN_KEY } from '@/api/http'

/** 管理员登录态 Store：state 见下方各字段注释，getters 提供展示态，actions 负责登录/退出与持久化 */
export const useAuthStore = defineStore('auth', {
  // 初始状态：优先从 localStorage 恢复，避免刷新后掉登录
  state: () => ({
    /** 登录令牌，空串表示未登录 */
    token: localStorage.getItem(TOKEN_KEY) || '',
    /**
     * 管理员信息，未登录为 null；
     * 使用 IIFE + try/catch，防止本地 JSON 损坏导致应用启动崩溃
     */
    admin: (() => {
      try {
        return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null') as AdminInfo | null
      } catch {
        return null
      }
    })(),
  }),
  getters: {
    /** 是否已登录（仅以 token 是否存在判断） */
    isAuthed: (s) => !!s.token,
    /** 顶栏/侧边栏显示名称，缺省「系统管理员」 */
    displayName: (s) => s.admin?.name || '系统管理员',
    /** 角色显示名称，缺省「超级管理员」 */
    role: (s) => s.admin?.role || '超级管理员',
    /** 头像占位文字，缺省「渔」 */
    avatarText: (s) => s.admin?.avatarText || '渔',
  },
  actions: {
    /**
     * 登录并持久化登录态
     * @param {string} username 登录账号
     * @param {string} password 登录密码
     * @returns {Promise<void>}
     * @throws 登录失败时由 api.login 抛出（拦截器已提示）
     */
    async login(username: string, password: string) {
      const r = await api.login(username, password)
      this.token = r.token
      this.admin = r.admin
      localStorage.setItem(TOKEN_KEY, r.token)
      localStorage.setItem(ADMIN_KEY, JSON.stringify(r.admin))
    },
    /**
     * 退出登录：无论服务端接口是否成功，都清理本地登录态
     * @returns {Promise<void>}
     */
    async logout() {
      try {
        await api.logout()
      } catch {
        /* 忽略退出接口错误 */
      }
      this.token = ''
      this.admin = null
      localStorage.removeItem(TOKEN_KEY)
      localStorage.removeItem(ADMIN_KEY)
    },
  },
})