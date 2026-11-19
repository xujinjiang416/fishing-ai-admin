<script setup lang="ts">
import {
  AlertCircleOutline,
  CloudOutline,
  CubeOutline,
  DiamondOutline,
  DownloadOutline,
  LocationOutline,
  PeopleOutline,
  PersonAddOutline,
  RefreshOutline,
  StatsChartOutline,
  TrendingUpOutline,
} from '@vicons/ionicons5'
import type { Component } from 'vue'
import { computed, onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { api, type Overview } from '@/api/admin'
import BaseChart from '@/components/BaseChart.vue'
import { useAuthStore } from '@/stores/auth'
import { initBarChartOption } from '@/utils/chart/initOptionUtils'
import { money, statusTag, todayCN } from '@/utils/tags'

const message = useMessage()
const auth = useAuthStore()

const overview = ref<Overview | null>(null)
const loading = ref(true)

const activityIcons: Record<string, Component> = {
  'user-plus': PersonAddOutline,
  'cloud-sun': CloudOutline,
  package: CubeOutline,
  'map-pin': LocationOutline,
  crown: DiamondOutline,
  'alert-triangle': AlertCircleOutline,
}

const kpis = computed(() => {
  const k = overview.value?.kpi
  if (!k) return []
  return [
    {
      cls: 'kpi--accent',
      icon: PeopleOutline,
      label: '注册用户',
      val: k.users,
      ft: `今日 +${k.usersToday}`,
      up: k.usersToday > 0,
    },
    {
      cls: '',
      icon: CloudOutline,
      label: '本周天气查询',
      val: k.weather,
      ft: `昨日 +${k.weatherYesterday}`,
      up: k.weatherYesterday > 0,
    },
    {
      cls: 'kpi--gold',
      icon: DiamondOutline,
      label: '会员用户',
      val: k.members,
      ft: `付费率 ${k.memberRate}%`,
      up: k.memberRate > 0,
    },
    {
      cls: 'kpi--success',
      icon: TrendingUpOutline,
      label: '本周营收',
      val: money(k.revenue),
      ft: `昨日 ${money(k.revenueYesterday)}`,
      up: k.revenueYesterday > 0,
    },
  ]
})

/**
 * 两张趋势图用 ECharts 渲染，参数由 initOptionUtils 的 initBarChartOption 生成，
 * 颜色直接使用本项目设计 token 的色值（不复用外部主题变量）。
 */
const weatherOption = computed(() => {
  if (!overview.value) return {}
  return initBarChartOption({
    colorList: ['#128E90'],
    xAxis: overview.value.trend.days,
    unit: '次',
    grid: { top: '42px', left: '10px', right: '16px', bottom: '4px', containLabel: true },
    showDataZoom: false,
    dataList: [
      {
        name: '天气查询',
        data: overview.value.trend.weather,
        showAreaStyle: true,
        barMaxWidth: 26,
      },
    ],
  })
})

const revenueOption = computed(() => {
  if (!overview.value) return {}
  return initBarChartOption({
    colorList: ['#FF7A3D'],
    xAxis: overview.value.trend.days,
    unit: '元',
    grid: { top: '42px', left: '10px', right: '16px', bottom: '4px', containLabel: true },
    showDataZoom: false,
    dataList: [
      {
        name: '营收',
        data: overview.value.trend.revenue,
        showAreaStyle: true,
        barMaxWidth: 26,
      },
    ],
  })
})

async function load() {
  loading.value = true
  try {
    overview.value = await api.overview()
  } finally {
    loading.value = false
  }
}

function exportReport() {
  message.success('报表已导出（演示）')
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">数据看板</h2>
        <p class="pagehead__desc">欢迎回来，{{ auth.displayName }} · {{ todayCN() }}</p>
      </div>
      <div class="pagehead__actions">
        <n-button ghost @click="exportReport">
          <template #icon>
            <n-icon :component="DownloadOutline" />
          </template>
          导出报表
        </n-button>
        <n-button type="primary" :loading="loading" @click="load">
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          刷新
        </n-button>
      </div>
    </div>

    <n-skeleton v-if="loading && !overview" :repeat="3" text size="large" />

    <template v-else-if="overview">
      <div class="kpi-grid">
        <div v-for="k in kpis" :key="k.label" class="kpi" :class="k.cls">
          <div class="kpi__label">
            <n-icon :component="k.icon" :size="15" />
            {{ k.label }}
          </div>
          <div class="kpi__val">{{ k.val }}</div>
          <div class="kpi__ft"><b :class="{ 'is-down': !k.up }">{{ k.ft }}</b></div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card__hd">
            <span class="card__title">近 7 日天气查询趋势</span>
            <n-icon :component="StatsChartOutline" :size="17" style="color: var(--c-ink-4)" />
          </div>
          <div style="padding: 4px 16px 14px">
            <BaseChart :option="weatherOption" height="230px" />
          </div>
        </div>
        <div class="card">
          <div class="card__hd">
            <span class="card__title">近 7 日营收趋势</span>
            <n-icon :component="TrendingUpOutline" :size="17" style="color: var(--c-ink-4)" />
          </div>
          <div style="padding: 4px 16px 14px">
            <BaseChart :option="revenueOption" height="230px" />
          </div>
        </div>
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card__hd">
            <span class="card__title">最近动态</span>
            <span class="card__sub">最新 {{ overview.activity.length }} 条</span>
          </div>
          <n-list v-if="overview.activity.length" style="padding: 8px 18px 14px">
            <n-list-item v-for="(a, i) in overview.activity" :key="i">
              <template #prefix>
                <n-icon
                  :component="activityIcons[a.icon] ?? AlertCircleOutline"
                  :size="17"
                  style="color: var(--c-primary)"
                />
              </template>
              <div class="td-main">
                <span style="flex: 1">{{ a.text }}</span>
                <span class="td-s">{{ a.time }}</span>
              </div>
            </n-list-item>
          </n-list>
          <div v-else class="empty">暂无动态</div>
        </div>

        <div class="card">
          <div class="card__hd">
            <span class="card__title">最新订单</span>
            <span class="card__sub">最近 {{ overview.orders.length }} 笔</span>
          </div>
          <n-table v-if="overview.orders.length" size="small" :bordered="false" style="padding: 6px 10px 10px">
            <thead>
              <tr>
                <th>订单号</th>
                <th>用户</th>
                <th>商品</th>
                <th>金额</th>
                <th>状态</th>
                <th>日期</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="o in overview.orders" :key="o.no">
                <td class="num">{{ o.no }}</td>
                <td>{{ o.user }}</td>
                <td>
                  <div class="td-sub">
                    <span>{{ o.goods }}</span>
                    <span v-if="o.usePoints > 0" class="td-s">积分抵扣 {{ o.usePoints }}</span>
                  </div>
                </td>
                <td class="price-now">{{ money(o.amount) }}</td>
                <td>
                  <n-tag
                    size="small"
                    round
                    :color="statusTag(o.status).color"
                    :text-color="statusTag(o.status).textColor"
                  >
                    {{ statusTag(o.status).text }}
                  </n-tag>
                </td>
                <td class="td-s">{{ o.date }}</td>
              </tr>
            </tbody>
          </n-table>
          <div v-else class="empty">暂无订单</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.n-table :deep(th) {
  font-size: 12.5px;
  color: var(--c-ink-3);
}
</style>