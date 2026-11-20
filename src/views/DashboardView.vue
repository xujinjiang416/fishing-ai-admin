<script setup lang="ts">
/**
 * DashboardView.vue — 数据看板（后台首页）
 *
 * 职责：汇总展示 KPI 指标、近 7 日天气查询/营收趋势、最近动态与最新订单。
 * 数据来源：GET /admin/overview（api.overview），单次返回 kpi / trend / activity / orders。
 * 关键交互：刷新按钮重新拉取数据；导出报表为演示占位（仅成功提示，未对接导出接口）。
 * 权限/限制：需登录后访问；页面整体只读，不提供写操作。
 */
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

// 全局消息实例：导出报表等操作的轻提示
const message = useMessage()
// 认证 store：仅用于页头展示当前管理员昵称（displayName）
const auth = useAuthStore()

// 看板数据源；null 表示首次加载尚未完成，模板据此展示骨架屏
const overview = ref<Overview | null>(null)
// 请求中标记：驱动刷新按钮 loading 与空数据时的骨架屏
const loading = ref(true)

/**
 * 动态图标映射：后端 activity[].icon 返回语义键（如 user-plus），
 * 此处映射为图标组件；未命中的键在模板中回退为 AlertCircleOutline。
 */
const activityIcons: Record<string, Component> = {
  'user-plus': PersonAddOutline,
  'cloud-sun': CloudOutline,
  package: CubeOutline,
  'map-pin': LocationOutline,
  crown: DiamondOutline,
  'alert-triangle': AlertCircleOutline,
}

/**
 * KPI 卡片配置（由 overview.kpi 派生，数据未就绪时返回空数组）
 * 每项字段：
 * - cls：卡片主题类名，用于配色强调；
 * - icon：卡片图标组件；
 * - label：指标名称；
 * - val：主数值（营收经 money 格式化）；
 * - ft：底部补充说明文案；
 * - up：补充指标是否为正增长，false 时模板加 is-down 样式置灰。
 */
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

/** 近 7 日营收趋势图配置：橙色柱 + 面积，单位「元」；数据未就绪时返回空配置 */
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

/**
 * 加载看板数据
 * 步骤：1) 置 loading；2) 请求 /admin/overview；3) 成功后整体覆盖 overview；
 * 4) finally 复位 loading（请求异常由 axios 拦截器统一提示）。
 * @returns {Promise<void>}
 */
async function load() {
  loading.value = true
  try {
    overview.value = await api.overview()
  } finally {
    loading.value = false
  }
}

/**
 * 导出报表（演示占位）
 * 当前仅给出成功提示，尚未调用后端导出接口。
 * @returns {void}
 */
function exportReport() {
  message.success('报表已导出（演示）')
}

// 首次进入页面即拉取看板数据
onMounted(load)
</script>

<template>
  <!-- 区块：看板根容器 / 页头 + KPI + 图表 + 动态与订单，自上而下单列布局 -->
  <div class="page">
    <!-- 区块：页头 / 左侧标题与欢迎语（含当前日期），右侧导出与刷新操作 -->
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

    <!-- 首次加载骨架：仅 loading 且尚无数据时展示，避免刷新已有数据时页面闪烁 -->
    <n-skeleton v-if="loading && !overview" :repeat="3" text size="large" />

    <!-- 数据区：overview 就绪后整体渲染（骨架与数据二选一） -->
    <template v-else-if="overview">
      <!-- 区块：KPI 卡片网格 / 四列自适应，数据来自 kpis 计算属性 -->
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

      <!-- 区块：趋势图区 / 两列等宽卡片，分别展示天气查询与营收的近 7 日走势 -->
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

      <!-- 区块：动态与订单区 / 左右两列，各含卡片标题与条数统计 -->
      <div class="dash-grid">
        <!-- 卡片：最近动态 / 图标 + 文案 + 时间，按接口返回顺序展示 -->
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
          <!-- 空态：无动态数据时展示占位文案 -->
          <div v-else class="empty">暂无动态</div>
        </div>

        <!-- 卡片：最新订单 / 表格展示订单号、用户、商品、金额、状态与日期 -->
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
          <!-- 空态：无订单数据时展示占位文案 -->
          <div v-else class="empty">暂无订单</div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 订单表格表头：缩小字号并使用次级文字色，弱化表头以突出数据行 */
.n-table :deep(th) {
  font-size: 12.5px;
  color: var(--c-ink-3);
}
</style>