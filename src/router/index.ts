/**
 * router/index.ts — 路由表与全局导航守卫
 *
 * 职责：
 * 1. 定义登录页与后台主布局两棵路由树，业务页面全部按路由懒加载；
 * 2. 通过 meta.title 提供顶栏标题与浏览器标题；
 * 3. beforeEach 守卫基于 localStorage 中的 Token 做登录态跳转，并同步 document.title。
 *
 * 关键流程：访问任意路径 -> 守卫读取 TOKEN_KEY -> 未登录跳 /login / 已登录访问 /login 跳首页
 *          -> 放行并按 meta.title 设置标题。
 * 依赖：@/api/http 的 TOKEN_KEY、各 views 下的页面组件、layouts/AdminLayout.vue。
 * 注意：
 * - 采用 history 模式，生产环境需 Nginx 配置 fallback 到 index.html；
 * - 布局子路由使用相对路径（不带前导斜杠），最终路径为父级 `/` + 子路径；
 * - 未匹配路径统一重定向到 `/`，再由 `/` 重定向到 `/dashboard`。
 */
import { createRouter, createWebHistory } from 'vue-router'

import { TOKEN_KEY } from '@/api/http'

// 路由实例：history 模式 + 二级路由结构
const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('@/views/LoginView.vue'),
      meta: { title: '登录' },
    },
    {
      path: '/',
      component: () => import('@/layouts/AdminLayout.vue'),
      // 访问根路径时默认进入数据看板
      redirect: '/dashboard',
      // 后台子路由：均渲染在 AdminLayout 的 main 区域内
      children: [
        {
          path: 'dashboard',
          component: () => import('@/views/DashboardView.vue'),
          meta: { title: '数据看板' },
        },
        {
          path: 'users',
          component: () => import('@/views/UsersView.vue'),
          meta: { title: '用户管理' },
        },
        {
          path: 'plans',
          component: () => import('@/views/PlansView.vue'),
          meta: { title: '会员套餐' },
        },
        {
          path: 'goods',
          component: () => import('@/views/GoodsView.vue'),
          meta: { title: '积分商城' },
        },
        {
          path: 'orders',
          component: () => import('@/views/OrdersView.vue'),
          meta: { title: '订单管理' },
        },
        {
          path: 'weather',
          component: () => import('@/views/WeatherLogsView.vue'),
          meta: { title: '天气数据' },
        },
        {
          path: 'spots',
          component: () => import('@/views/SpotsView.vue'),
          meta: { title: '钓点管理' },
        },
        // 内容管理 · 评论管理
        {
          path: 'comments',
          component: () => import('@/views/CommentsView.vue'),
          meta: { title: '评论管理' },
        },
        // 系统设置 · 积分配置
        {
          path: 'points-config',
          component: () => import('@/views/PointsConfigView.vue'),
          meta: { title: '积分配置' },
        },
        // 系统设置 · 操作日志
        {
          path: 'logs',
          component: () => import('@/views/OperationLogsView.vue'),
          meta: { title: '操作日志' },
        },
        // 系统设置 · 缓存管理
        {
          path: 'cache',
          component: () => import('@/views/CacheView.vue'),
          meta: { title: '缓存管理' },
        },
        // 系统设置 · 缓存过期规则
        {
          path: 'cache-rules',
          component: () => import('@/views/CacheRulesView.vue'),
          meta: { title: '缓存规则' },
        },
      ],
    },
    // 兜底路由：任何未匹配地址回到首页
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

/**
 * 全局前置守卫：登录态校验 + 页面标题同步
 * @param {RouteLocationNormalized} to 即将进入的目标路由
 * @returns {true | {path: string}} 放行返回 true，否则返回重定向目标
 */
router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  // 未登录访问受保护页面：重定向登录页
  if (to.path !== '/login' && !token) return { path: '/login' }
  // 已登录再访问登录页：直接回首页
  if (to.path === '/login' && token) return { path: '/' }
  // 标题格式：页面名 · 渔获 AI 后台（无 meta.title 时仅保留后缀前的内容）
  document.title = `${to.meta.title ?? ''} · 渔获 AI 后台`
  return true
})

export default router