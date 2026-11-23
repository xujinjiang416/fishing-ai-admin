<script setup lang="ts">
/**
 * AdminLayout.vue — 后台主布局（侧边栏 + 顶栏 + 内容区）
 *
 * 职责：
 * 1. 渲染固定侧边栏，按业务域分组展示菜单，高亮当前路由；
 * 2. 渲染顶栏：页面标题、全局搜索框、通知入口、当前管理员信息；
 * 3. 中部 <router-view /> 承载各业务页面；
 * 4. 侧边栏底部展示当前管理员并提供退出登录。
 * 关键流程：route.path -> currentTitle 计算属性 -> 顶栏标题；onLogout -> auth.logout() -> 跳转 /login。
 * 依赖：@vicons/ionicons5 图标、@/stores/auth 登录态、vue-router 当前路由。
 * 注意：菜单项 path 必须与 router/index.ts 中子路由保持一致，否则高亮与跳转会失效。
 */
import {
  ArchiveOutline,
  BagHandleOutline,
  CartOutline,
  ChatbubbleEllipsesOutline,
  CheckmarkDoneOutline,
  CloudOutline,
  FishOutline,
  LocationOutline,
  LogOutOutline,
  NotificationsOutline,
  OptionsOutline,
  PeopleOutline,
  ReceiptOutline,
  RibbonOutline,
  SearchOutline,
  StatsChartOutline,
  TimerOutline,
  WarningOutline,
} from '@vicons/ionicons5'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const route = useRoute() // 当前路由：用于侧边栏高亮与顶栏标题
const router = useRouter() // 路由实例：菜单跳转与退出登录后重定向
const auth = useAuthStore() // 管理员登录态：顶栏展示名称/角色，退出时清理

/**
 * 侧边栏单个菜单项
 */
interface MenuItem {
  /** 菜单唯一键（用于 v-for :key） */
  key: string
  /** 菜单显示文案 */
  label: string
  /** 菜单图标组件（@vicons 组件） */
  icon: Component
  /** 目标路由绝对路径，需与路由表一致 */
  path: string
}

/**
 * 侧边栏分组
 */
interface MenuGroup {
  /** 分组标题（如「数据中心」） */
  title: string
  /** 该分组下的菜单项 */
  items: MenuItem[]
}

// 侧边栏按业务域分组：数据中心 / 运营管理 / 内容管理 / 系统设置
const menuGroups: MenuGroup[] = [
  {
    title: '数据中心',
    items: [{ key: 'dashboard', label: '数据看板', icon: StatsChartOutline, path: '/dashboard' }],
  },
  {
    title: '运营管理',
    items: [
      { key: 'users', label: '用户管理', icon: PeopleOutline, path: '/users' },
      { key: 'plans', label: '会员套餐', icon: RibbonOutline, path: '/plans' },
      { key: 'goods', label: '积分商城', icon: BagHandleOutline, path: '/goods' },
      { key: 'orders', label: '订单管理', icon: CartOutline, path: '/orders' },
      { key: 'weather', label: '天气数据', icon: CloudOutline, path: '/weather' },
      { key: 'spots', label: '钓点管理', icon: LocationOutline, path: '/spots' },
      { key: 'reviews', label: '钓点审核', icon: CheckmarkDoneOutline, path: '/reviews' },
      { key: 'reports', label: '纠错处理', icon: WarningOutline, path: '/reports' },
    ],
  },
  {
    title: '内容管理',
    items: [
      { key: 'comments', label: '评论管理', icon: ChatbubbleEllipsesOutline, path: '/comments' },
    ],
  },
  {
    title: '系统设置',
    items: [
      { key: 'points-config', label: '积分配置', icon: OptionsOutline, path: '/points-config' },
      { key: 'cache', label: '缓存管理', icon: ArchiveOutline, path: '/cache' },
      { key: 'cache-rules', label: '缓存规则', icon: TimerOutline, path: '/cache-rules' },
      { key: 'logs', label: '操作日志', icon: ReceiptOutline, path: '/logs' },
    ],
  },
]

/** 顶栏标题：取当前路由 meta.title，缺省为空串 */
const currentTitle = computed(() => String(route.meta.title ?? ''))

/**
 * 退出登录：清理登录态后回到登录页（replace 避免回退到后台页）
 * @returns {Promise<void>}
 */
async function onLogout() {
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <!-- 区块：后台整体骨架 / 左侧固定侧边栏 + 右侧主区域左右两栏布局 -->
  <div class="admin-shell">
    <!-- 区块：侧边栏 / 自上而下为品牌区、分组菜单、底部管理员信息 -->
    <aside class="admin-sider">
      <!-- 区块：品牌区 / logo + 产品名与「后台管理系统」副标题 -->
      <div class="admin-sider__brand">
        <div class="admin-sider__logo">
          <n-icon :component="FishOutline" :size="22" />
        </div>
        <div class="admin-sider__brand-text">
          <span class="admin-sider__brand-title">渔获 AI</span>
          <span class="admin-sider__brand-sub">后台管理系统</span>
        </div>
      </div>
      <!-- 区块：菜单列表 / 按 menuGroups 双层循环，外层分组标题、内层路由链接；当前路径命中时加 is-active -->
      <nav class="admin-sider__list">
        <template v-for="g in menuGroups" :key="g.title">
          <div class="admin-sider__group">{{ g.title }}</div>
          <router-link
            v-for="m in g.items"
            :key="m.key"
            :to="m.path"
            class="admin-sider__item"
            :class="{ 'is-active': route.path === m.path }"
          >
            <n-icon :component="m.icon" :size="17" />
            <span>{{ m.label }}</span>
          </router-link>
        </template>
      </nav>
      <!-- 区块：侧边栏底部 / 当前管理员头像与名称，以及退出登录（悬停显示 tooltip） -->
      <div class="admin-sider__foot">
        <span class="avatar avatar--md">{{ auth.avatarText }}</span>
        <div class="admin-sider__foot-info">
          <span class="admin-sider__foot-name">{{ auth.displayName }}</span>
          <span class="admin-sider__foot-role">{{ auth.role }}</span>
        </div>
        <n-tooltip placement="top">
          <template #trigger>
            <span class="admin-sider__logout" @click="onLogout">
              <n-icon :component="LogOutOutline" :size="17" />
            </span>
          </template>
          退出登录
        </n-tooltip>
      </div>
    </aside>

    <!-- 区块：右侧主区域 / 顶栏 + 可滚动内容区 -->
    <div class="admin-main">
      <!-- 区块：顶栏 / 左标题、搜索框、弹性占位、通知图标、分隔线与当前用户 -->
      <header class="admin-top">
        <span class="admin-top__title">{{ currentTitle }}</span>
        <n-input
          class="admin-top__search"
          size="small"
          round
          clearable
          placeholder="全局搜索…"
        >
          <template #prefix>
            <n-icon :component="SearchOutline" />
          </template>
        </n-input>
        <span style="flex: 1" />
        <span class="admin-top__ico">
          <n-icon :component="NotificationsOutline" :size="19" />
          <span class="dot-badge" />
        </span>
        <span class="admin-top__split" />
        <div class="admin-top__me">
          <span class="avatar avatar--sm">{{ auth.avatarText }}</span>
          {{ auth.displayName }}
        </div>
      </header>
      <!-- 区块：内容区 / 各业务页面在此渲染 -->
      <main>
        <router-view />
      </main>
    </div>
  </div>
</template>