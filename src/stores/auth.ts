import { defineStore } from 'pinia'

import { api, type AdminInfo } from '@/api/admin'
import { ADMIN_KEY, TOKEN_KEY } from '@/api/http'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    admin: (() => {
      try {
        return JSON.parse(localStorage.getItem(ADMIN_KEY) || 'null') as AdminInfo | null
      } catch {
        return null
      }
    })(),
  }),
  getters: {
    isAuthed: (s) => !!s.token,
    displayName: (s) => s.admin?.name || '系统管理员',
    role: (s) => s.admin?.role || '超级管理员',
    avatarText: (s) => s.admin?.avatarText || '渔',
  },
  actions: {
    async login(username: string, password: string) {
      const r = await api.login(username, password)
      this.token = r.token
      this.admin = r.admin
      localStorage.setItem(TOKEN_KEY, r.token)
      localStorage.setItem(ADMIN_KEY, JSON.stringify(r.admin))
    },
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