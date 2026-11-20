<script setup lang="ts">
/**
 * App.vue — 应用根组件，负责全局 Provider 装配
 *
 * 职责：用 NConfigProvider 注入主题与中文语言包，用 NDialogProvider / NMessageProvider
 *      提供全局对话框与消息提示上下文，内部渲染 router-view。
 * 关键流程：themeOverrides（src/theme）-> NConfigProvider -> Dialog/Message Provider -> 路由视图。
 * 注意：业务页面调用 useMessage() / useDialog() 时必须处于对应 Provider 之下，
 *      因此 Provider 必须包裹 router-view，不可移除或调整层级。
 */
import { dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, zhCN } from 'naive-ui'

import { themeOverrides } from '@/theme'
</script>

<template>
  <!-- 区块：全局配置与反馈 Provider / 注入主题覆盖 + 中文本地化，并向下提供消息与对话框 API -->
  <NConfigProvider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NDialogProvider>
      <NMessageProvider>
        <!-- 区块：路由出口 / 登录页与后台布局均在此渲染 -->
        <router-view />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>