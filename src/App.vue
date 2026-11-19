<script setup lang="ts">
import { dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, zhCN } from 'naive-ui'

import { themeOverrides } from '@/theme'
</script>

<template>
  <NConfigProvider :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <NDialogProvider>
      <NMessageProvider>
        <router-view />
      </NMessageProvider>
    </NDialogProvider>
  </NConfigProvider>
</template>