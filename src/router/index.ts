import { createRouter, createWebHistory } from 'vue-router'

import { TOKEN_KEY } from '@/api/http'

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
      redirect: '/dashboard',
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
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
})

router.beforeEach((to) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (to.path !== '/login' && !token) return { path: '/login' }
  if (to.path === '/login' && token) return { path: '/' }
  document.title = `${to.meta.title ?? ''} · 渔获 AI 后台`
  return true
})

export default router