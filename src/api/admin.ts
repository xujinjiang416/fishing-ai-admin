import http from './http'

// ---------- 类型 ----------
export interface AdminInfo {
  id: number
  username: string
  name: string
  role: string
  avatarText: string
}

export interface Page<T> {
  list: T[]
  total: number
  page: number
  pageSize: number
}

export interface AdminUser {
  uid: string
  nickname: string
  avatar: string
  phone: string | null
  city: string | null
  points: number
  streak: number
  plan: string
  planName: string
  planExpire: string
  joined: string
  lastActive: string
  status: string
  weatherCount: number
}

export interface Plan {
  id: string
  name: string
  duration: number
  durationLabel: string
  price: number
  origPrice: number | null
  icon: string
  tag: string | null
  tagType: string
  sales: number
  status: string
  sort: number
  benefits: string[]
}

export interface Goods {
  id: string
  name: string
  cat: string
  price: number
  origPrice: number | null
  stock: number
  sales: string
  img: string | null
  pointsEnabled: boolean
  status: string
  updated: string
}

export interface WeatherLog {
  id: string
  user: string
  place: string | null
  placeDetail: string | null
  date: string
  score: number
  verdict: string
  level: string
  condition: string | null
  temp: number | null
  pressure: number | null
  windDiff: string | null
  source: string
  cost: string
}

export interface Spot {
  id: string
  name: string
  city: string | null
  dist: number
  rating: number
  commentCount: number
  fish: string[]
  pay: string | null
  coords: string | null
  status: string
  cover: string | null
  gallery: string[]
  addedBy: string
  createdAt: string
}

export interface Overview {
  kpi: {
    users: number
    weather: number
    members: number
    revenue: number
    usersToday: number
    weatherYesterday: number
    revenueYesterday: number
    memberRate: number
  }
  trend: { days: string[]; weather: number[]; users: number[]; revenue: number[] }
  activity: { icon: string; text: string; time: string }[]
  orders: { no: string; user: string; goods: string; amount: number; usePoints: number; status: string; date: string }[]
}

/** 积分配置（后台「系统设置 · 积分配置」） */
export interface PointsConfig {
  checkinMemberPoints: number
  checkinNormalPoints: number
  adPoints: number
  adSeconds: number
  adLimitNormal: number
  adLimitMember: number
  /** 自定义评论敏感词（英文逗号分隔），留空表示使用内置词库 */
  sensitiveWords: string
  /** 配置项元数据（名称 / 说明 / 取值范围），供表单渲染 */
  defs: { key: string; remark: string; min: number | null; max: number | null }[]
}

/** 评论（后台「内容管理 · 评论管理」） */
export interface AdminComment {
  id: string
  userId: number | null
  user: string
  avatar: string
  spotId: string
  spot: string
  rating: number
  text: string
  images: string[]
  date: string
  createdAt: string
}

/** 操作日志（后台「系统设置 · 操作日志」） */
export interface OperationLogItem {
  id: number
  adminId: number | null
  admin: string
  action: string
  target: string | null
  detail: string | null
  ip: string | null
  createdAt: string
}

/** 会员套餐购买数据统计 */
export interface MembershipStats {
  totalOrders: number
  totalAmount: number
  byPlan: { plan: string; name: string; count: number; amount: number; sales: number }[]
  trend: { days: string[]; counts: number[]; amounts: number[] }
  recent: { orderNo: string; user: string; plan: string; months: number; amount: number; status: string; date: string }[]
}

/** 天气缓存条目（后台「系统设置 · 缓存管理」） */
export interface CacheItem {
  id: number
  cacheKey: string
  region: string
  day: string
  source: string
  createdAt: string | null
  expireAt: string | null
  lastHitAt: string | null
  sizeBytes: number
  sizeKb: number
  hitCount: number
  status: 'active' | 'expired'
  condition: string | null
  temp: number | null
}

/** 缓存统计看板 */
export interface CacheStats {
  totalCount: number
  totalSizeBytes: number
  totalSizeKb: number
  todayHitRate: number
  expiringSoon: number
  trend: { days: string[]; hits: number[]; totals: number[] }
}

/** 缓存过期规则（城市等级 / 数据精度差异化 TTL） */
export interface CacheRules {
  cityLevels: Record<string, number>
  precisions: Record<string, number>
}


// ---------- 请求封装（拦截器已解包 {code,data,msg}） ----------
const get = <T>(url: string, params?: Record<string, unknown>) =>
  http.get(url, { params }) as unknown as Promise<T>
const post = <T>(url: string, data?: unknown) => http.post(url, data) as unknown as Promise<T>
const put = <T>(url: string, data?: unknown) => http.put(url, data) as unknown as Promise<T>
const del = <T>(url: string) => http.delete(url) as unknown as Promise<T>

// ---------- 接口 ----------
export const api = {
  login: (username: string, password: string) =>
    post<{ token: string; admin: AdminInfo }>('/admin/login', { username, password }),
  logout: () => post<null>('/admin/logout'),
  overview: () => get<Overview>('/admin/overview'),

  users: (params: { keyword?: string; plan?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<AdminUser>>('/admin/users', params),
  createUser: (data: { nickname: string; phone?: string; city?: string; status: string }) =>
    post<AdminUser>('/admin/users', data),
  updateUser: (uid: string, data: Record<string, unknown>) => put<AdminUser>(`/admin/users/${uid}`, data),
  assignMembership: (uid: string, data: { planId: string; durationDays: number }) =>
    put<AdminUser>(`/admin/users/${uid}/membership`, data),
  deleteUser: (uid: string) => del<null>(`/admin/users/${uid}`),
  batchDeleteUsers: (ids: string[]) => post<{ deleted: number }>('/admin/users/batch-delete', { ids }),

  plans: () => get<Plan[]>('/admin/plans'),
  createPlan: (data: Record<string, unknown>) => post<Plan>('/admin/plans', data),
  updatePlan: (id: string, data: Record<string, unknown>) => put<Plan>(`/admin/plans/${id}`, data),
  deletePlan: (id: string) => del<null>(`/admin/plans/${id}`),
  batchDeletePlans: (ids: string[]) => post<{ deleted: number }>('/admin/plans/batch-delete', { ids }),

  goods: (params: { keyword?: string; cat?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<Goods>>('/admin/goods', params),
  createGoods: (data: Record<string, unknown>) => post<Goods>('/admin/goods', data),
  updateGoods: (id: string, data: Record<string, unknown>) => put<Goods>(`/admin/goods/${id}`, data),
  deleteGoods: (id: string) => del<null>(`/admin/goods/${id}`),
  batchDeleteGoods: (ids: string[]) => post<{ deleted: number }>('/admin/goods/batch-delete', { ids }),

  weatherLogs: (params: { keyword?: string; source?: string; page: number; pageSize: number }) =>
    get<Page<WeatherLog>>('/admin/weather-logs', params),
  regenerateWeather: (id: string) => post<WeatherLog>(`/admin/weather-logs/${id}/regenerate`),
  deleteWeatherLog: (id: string) => del<null>(`/admin/weather-logs/${id}`),
  batchDeleteWeatherLogs: (ids: string[]) => post<{ deleted: number }>('/admin/weather-logs/batch-delete', { ids }),

  spots: (params: { keyword?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<Spot>>('/admin/spots', params),
  createSpot: (data: Record<string, unknown>) => post<Spot>('/admin/spots', data),
  updateSpot: (id: string, data: Record<string, unknown>) => put<Spot>(`/admin/spots/${id}`, data),
  deleteSpot: (id: string) => del<null>(`/admin/spots/${id}`),
  batchDeleteSpots: (ids: string[]) => post<{ deleted: number }>('/admin/spots/batch-delete', { ids }),

  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<{ url: string }>('/admin/upload', form)
  },

  // ---------- 系统设置 · 积分配置 ----------
  config: () => get<PointsConfig>('/admin/config'),
  updateConfig: (data: Record<string, unknown>) => put<PointsConfig>('/admin/config', data),

  // ---------- 内容管理 · 评论管理 ----------
  comments: (params: { keyword?: string; spotId?: string; page: number; pageSize: number }) =>
    get<Page<AdminComment>>('/admin/comments', params),
  deleteComment: (id: string) => del<null>(`/admin/comments/${id}`),
  batchDeleteComments: (ids: string[]) =>
    post<{ deleted: number }>('/admin/comments/batch-delete', { ids }),

  // ---------- 系统设置 · 操作日志 ----------
  logs: (params: { keyword?: string; action?: string; page: number; pageSize: number }) =>
    get<Page<OperationLogItem>>('/admin/logs', params),

  // ---------- 会员套餐 · 购买数据统计 ----------
  membershipStats: () => get<MembershipStats>('/admin/membership-stats'),

  // ---------- 系统设置 · 缓存管理 ----------
  cacheList: (params: {
    keyword?: string
    status?: string
    source?: string
    startDate?: string
    endDate?: string
    page: number
    pageSize: number
  }) => get<Page<CacheItem>>('/admin/cache', params),
  cacheDetail: (id: number) => get<{ cache: CacheItem; payload: Record<string, unknown> }>(`/admin/cache/${id}`),
  cacheStats: () => get<CacheStats>('/admin/cache/stats'),
  cacheRules: () => get<CacheRules>('/admin/cache/rules'),
  updateCacheRules: (data: CacheRules) => put<CacheRules>('/admin/cache/rules', data),
  refreshCache: (id: number) => post<CacheItem>(`/admin/cache/${id}/refresh`),
  batchRefreshCache: (ids: number[]) => post<{ refreshed: number }>('/admin/cache/batch-refresh', { ids }),
  deleteCache: (id: number) => del<null>(`/admin/cache/${id}`),
  batchDeleteCache: (ids: number[]) => post<{ deleted: number }>('/admin/cache/batch-delete', { ids }),
}