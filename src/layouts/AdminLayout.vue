<script setup lang="ts">
import {
  ArchiveOutline,
  BagHandleOutline,
  ChatbubbleEllipsesOutline,
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
} from '@vicons/ionicons5'
import type { Component } from 'vue'
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

interface MenuItem {
  key: string
  label: string
  icon: Component
  path: string
}

interface MenuGroup {
  title: string
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
      { key: 'weather', label: '天气数据', icon: CloudOutline, path: '/weather' },
      { key: 'spots', label: '钓点管理', icon: LocationOutline, path: '/spots' },
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

const currentTitle = computed(() => String(route.meta.title ?? ''))

async function onLogout() {
  await auth.logout()
  router.replace('/login')
}
</script>

<template>
  <div class="admin-shell">
    <aside class="admin-sider">
      <div class="admin-sider__brand">
        <div class="admin-sider__logo">
          <n-icon :component="FishOutline" :size="22" />
        </div>
        <div class="admin-sider__brand-text">
          <span class="admin-sider__brand-title">渔获 AI</span>
          <span class="admin-sider__brand-sub">后台管理系统</span>
        </div>
      </div>
      <div class="admin-sider__label">管理中心</div>
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

    <div class="admin-main">
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
      <main>
        <router-view />
      </main>
    </div>
  </div>
</template>