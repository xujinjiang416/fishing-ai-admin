<script setup lang="ts">
/**
 * PointsView.vue — 积分管理（总览 / 流水 / 批次 / 行为分析）
 *
 * 数据来源：
 * - GET /admin/points/overview
 * - GET /admin/points/logs
 * - GET /admin/points/batches
 * - GET /admin/points/liability（积分永久有效）
 * - GET /admin/analytics/summary & /funnel
 */
import {
  AlertCircleOutline,
  CashOutline,
  DownloadOutline,
  RefreshOutline,
  SparklesOutline,
  TimeOutline,
  TrendingDownOutline,
  TrendingUpOutline,
} from '@vicons/ionicons5'
import dayjs from 'dayjs'
import { computed, onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'

import {
  api,
  type AdminPointsBatch,
  type AdminPointsLog,
  type PointsOverview,
} from '@/api/admin'
import { TOKEN_KEY } from '@/api/http'
import BaseChart from '@/components/BaseChart.vue'
import { getColorDisk } from '@/utils/chart/chartTheme'

const message = useMessage()
const colors = getColorDisk()

const days = ref(30)
const loading = ref(false)
const overview = ref<PointsOverview | null>(null)
const liability = ref<PointsOverview['liability'] | null>(null)
const analytics = ref<{ events: { event: string; count: number; users: number }[] } | null>(null)
const funnel = ref<{ steps: { step: string; users: number; count: number; rate: number }[] } | null>(null)
const retention = ref<{ cohorts: { cohort: string; users: number; d1: number; d7: number; d30: number }[] } | null>(null)

const logs = ref<AdminPointsLog[]>([])
const logTotal = ref(0)
const logPage = ref(1)
const logPageSize = ref(20)
const logQuery = reactive({ userId: '', source: '', dateFrom: '', dateTo: '' })

const batches = ref<AdminPointsBatch[]>([])
const batchTotal = ref(0)
const batchPage = ref(1)
const batchPageSize = ref(20)

const activeTab = ref('logs')

const sourceOptions = [
  { label: '全部来源', value: '' },
  { label: '签到', value: 'checkin' },
  { label: '广告', value: 'ad' },
  { label: '订单抵扣', value: 'order' },
  { label: '退款返还', value: 'refund' },
  { label: '后台调整', value: 'admin' },
  { label: '任务', value: 'task' },
]

const kpis = computed(() => {
  const k = overview.value?.kpi
  if (!k) return []
  return [
    { icon: TrendingUpOutline, label: '发行积分', val: fmt(k.issuedPoints), ft: `价值 ¥${k.issuedValue}`, cls: 'kpi--accent' },
    { icon: TrendingDownOutline, label: '消耗积分', val: fmt(k.spentPoints), ft: `价值 ¥${k.spentValue}`, cls: '' },
    { icon: CashOutline, label: '积分负债', val: `¥${k.liabilityYuan}`, ft: `余额 ${fmt(k.balancePoints)} 分`, cls: 'kpi--warn' },
    { icon: SparklesOutline, label: '兑付率', val: `${k.redemptionRate}%`, ft: `成本率 ${k.pointsCostRate}% GMV`, cls: '' },
    { icon: TimeOutline, label: '会员积分成本', val: `${k.memberPointsCostRate}%`, ft: `会员收入 ¥${k.membershipRevenue}`, cls: k.memberPointsCostRate > 25 ? 'kpi--danger' : '' },
    { icon: AlertCircleOutline, label: '退款返还', val: fmt(k.refundedPoints), ft: '所有积分永久有效', cls: '' },
  ]
})

const trendOption = computed(() => {
  const t = overview.value?.trend
  if (!t) return {}
  return {
    color: [colors[0], colors[1]],
    tooltip: { trigger: 'axis' },
    legend: { data: ['发行', '消耗'], bottom: 0 },
    grid: { left: 48, right: 24, top: 24, bottom: 48 },
    xAxis: { type: 'category', data: t.days, axisLine: { lineStyle: { color: '#E3EAE8' } }, axisLabel: { color: '#6E807E' } },
    yAxis: { type: 'value', axisLabel: { color: '#6E807E' }, splitLine: { lineStyle: { color: '#EFF3F2' } } },
    series: [
      { name: '发行', type: 'bar', data: t.issued, barMaxWidth: 18, itemStyle: { borderRadius: [3, 3, 0, 0] } },
      { name: '消耗', type: 'line', smooth: true, data: t.spent, symbolSize: 5, lineStyle: { width: 2 } },
    ],
  }
})

function fmt(n: number | null | undefined) {
  return Number(n || 0).toLocaleString('zh-CN')
}

async function loadOverview() {
  loading.value = true
  try {
    overview.value = await api.pointsOverview(days.value)
    liability.value = await api.pointsLiability()
  } finally {
    loading.value = false
  }
}

async function loadLogs() {
  const res = await api.pointsLogs({
    userId: logQuery.userId ? Number(logQuery.userId) : undefined,
    source: logQuery.source || undefined,
    dateFrom: logQuery.dateFrom || undefined,
    dateTo: logQuery.dateTo || undefined,
    page: logPage.value,
    pageSize: logPageSize.value,
  })
  logs.value = res.list
  logTotal.value = res.total
}

async function loadBatches() {
  const res = await api.pointsBatches({
    userId: logQuery.userId ? Number(logQuery.userId) : undefined,
    activeOnly: true,
    page: batchPage.value,
    pageSize: batchPageSize.value,
  })
  batches.value = res.list
  batchTotal.value = res.total
}

async function loadAnalytics() {
  analytics.value = await api.analyticsSummary(days.value)
  funnel.value = await api.analyticsFunnel('membership', days.value)
  retention.value = await api.analyticsRetention(days.value)
}

function resetLogPage() {
  logPage.value = 1
  loadLogs()
}

function resetBatchPage() {
  batchPage.value = 1
  loadBatches()
}

async function exportLogs() {
  const url = api.pointsExportUrl({
    userId: logQuery.userId ? Number(logQuery.userId) : undefined,
    source: logQuery.source || undefined,
    dateFrom: logQuery.dateFrom || undefined,
    dateTo: logQuery.dateTo || undefined,
  })
  const token = localStorage.getItem(TOKEN_KEY) || ''
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (!res.ok) {
    message.error('导出失败，请稍后重试')
    return
  }
  const blob = await res.blob()
  const href = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = href
  a.download = `积分流水_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(href)
  message.success('导出完成，Excel 可直接打开')
}

function changeDays() {
  loadOverview()
  loadAnalytics()
}

onMounted(() => {
  loadOverview()
  loadLogs()
  loadBatches()
  loadAnalytics()
})
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">积分管理</h2>
        <p class="pagehead__desc">
          发行、消耗、负债、来源与 Top 用户；积分永久有效，所有数字以积分流水为准。
        </p>
      </div>
      <div class="pagehead__actions">
        <n-select v-model:value="days" :options="[7, 30, 90, 180].map(v => ({ label: `近 ${v} 天`, value: v }))" style="width: 118px" @update:value="changeDays" />
        <n-button :loading="loading" @click="loadOverview">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          刷新
        </n-button>
        <n-button @click="exportLogs">
          <template #icon><n-icon :component="DownloadOutline" /></template>
          导出流水
        </n-button>
      </div>
    </div>

    <div v-if="overview?.alerts?.length" class="notice notice--warn" style="margin-bottom: 16px">
      <n-icon :component="AlertCircleOutline" :size="16" />
      <div>
        <div v-for="a in overview.alerts" :key="a">{{ a }}</div>
      </div>
    </div>

    <div class="kpi-grid">
      <div v-for="k in kpis" :key="k.label" class="kpi" :class="k.cls">
        <div class="kpi__label">
          <n-icon :component="k.icon" :size="16" />
          {{ k.label }}
        </div>
        <div class="kpi__value">{{ k.val }}</div>
        <div class="kpi__foot">{{ k.ft }}</div>
      </div>
    </div>

    <div class="card card--pad" style="margin-bottom: 16px">
      <div class="card__title">发行与消耗趋势</div>
      <BaseChart :option="trendOption" height="300px" />
    </div>

    <div class="two-col">
      <div class="card card--pad">
        <div class="card__title">来源结构</div>
        <n-table :bordered="false" :single-line="false" size="small">
          <thead>
            <tr><th>来源</th><th>获得</th><th>消耗</th><th>流水条数</th></tr>
          </thead>
          <tbody>
            <tr v-for="s in overview?.sources || []" :key="s.source">
              <td>{{ s.source || 'other' }}</td>
              <td class="num">{{ fmt(s.earned) }}</td>
              <td class="num">{{ fmt(s.spent) }}</td>
              <td class="num">{{ s.count }}</td>
            </tr>
            <tr v-if="!overview?.sources?.length"><td colspan="4" class="muted">暂无数据</td></tr>
          </tbody>
        </n-table>
      </div>

      <div class="card card--pad">
        <div class="card__title">Top 获取用户</div>
        <n-table :bordered="false" :single-line="false" size="small">
          <thead>
            <tr><th>用户</th><th>积分</th><th>价值</th></tr>
          </thead>
          <tbody>
            <tr v-for="u in overview?.topUsers || []" :key="u.userId">
              <td>{{ u.nickname || `#${u.userId}` }}</td>
              <td class="num">{{ fmt(u.points) }}</td>
              <td class="num">¥{{ u.value }}</td>
            </tr>
            <tr v-if="!overview?.topUsers?.length"><td colspan="3" class="muted">暂无数据</td></tr>
          </tbody>
        </n-table>
      </div>
    </div>

    <div class="card card--pad" style="margin-top: 16px">
      <div class="card__title">积分负债（永久有效）</div>
      <div class="liability-row">
        <div><span class="muted">余额</span><b>{{ fmt(liability?.balancePoints) }} 分</b></div>
        <div><span class="muted">负债</span><b>¥{{ liability?.liabilityYuan }}</b></div>
        <div><span class="muted">批次剩余</span><b>{{ fmt(liability?.batchRemaining) }} 分</b></div>
      </div>
    </div>

    <n-tabs v-model:value="activeTab" type="line" style="margin-top: 20px">
      <n-tab-pane name="logs" tab="积分流水">
        <div class="filter-row">
          <n-input v-model:value="logQuery.userId" placeholder="用户 ID" clearable style="width: 110px" @keyup.enter="resetLogPage" />
          <n-select v-model:value="logQuery.source" :options="sourceOptions" style="width: 130px" @update:value="resetLogPage" />
          <n-input v-model:value="logQuery.dateFrom" placeholder="开始日期 YYYY-MM-DD" clearable style="width: 170px" />
          <n-input v-model:value="logQuery.dateTo" placeholder="结束日期 YYYY-MM-DD" clearable style="width: 170px" />
          <n-button type="primary" @click="resetLogPage">查询</n-button>
        </div>
        <n-data-table
          :columns="[
            { title: '时间', key: 'date', width: 140 },
            { title: '用户', key: 'nickname', width: 120 },
            { title: '变动', key: 'change', width: 90, render: (r: AdminPointsLog) => (r.change > 0 ? `+${r.change}` : String(r.change)) },
            { title: '来源', key: 'source', width: 90 },
            { title: '场景', key: 'scene', width: 100 },
            { title: '关联单号', key: 'refId', width: 160 },
            { title: '余额', key: 'balance', width: 90 },
            { title: '原因', key: 'reason' }
          ]"
          :data="logs"
          :bordered="false"
          :single-line="false"
          size="small"
        />
        <div class="pager">
          <n-pagination v-model:page="logPage" :page-size="logPageSize" :item-count="logTotal" @update:page="loadLogs" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="batches" tab="积分批次">
        <div class="filter-row">
          <n-input v-model:value="logQuery.userId" placeholder="用户 ID" clearable style="width: 110px" @keyup.enter="resetBatchPage" />
          <n-button type="primary" @click="resetBatchPage">查询</n-button>
        </div>
        <n-data-table
          :columns="[
            { title: '批次', key: 'id', width: 80 },
            { title: '用户', key: 'nickname', width: 120 },
            { title: '来源', key: 'source', width: 100 },
            { title: '原始', key: 'amount', width: 100 },
            { title: '剩余', key: 'remaining', width: 100 },
            { title: '获得时间', key: 'createdAt', width: 160 }
          ]"
          :data="batches"
          :bordered="false"
          :single-line="false"
          size="small"
        />
        <div class="pager">
          <n-pagination v-model:page="batchPage" :page-size="batchPageSize" :item-count="batchTotal" @update:page="loadBatches" />
        </div>
      </n-tab-pane>

      <n-tab-pane name="analytics" tab="行为分析">
        <div class="two-col">
          <div class="card card--pad">
            <div class="card__title">事件汇总</div>
            <n-table :bordered="false" :single-line="false" size="small">
              <thead><tr><th>事件</th><th>次数</th><th>去重用户</th></tr></thead>
              <tbody>
                <tr v-for="e in analytics?.events || []" :key="e.event">
                  <td>{{ e.event }}</td><td class="num">{{ e.count }}</td><td class="num">{{ e.users }}</td>
                </tr>
                <tr v-if="!analytics?.events?.length"><td colspan="3" class="muted">暂无事件，请先在小程序端接入上报</td></tr>
              </tbody>
            </n-table>
          </div>
          <div class="card card--pad">
            <div class="card__title">会员漏斗</div>
            <n-table :bordered="false" :single-line="false" size="small">
              <thead><tr><th>步骤</th><th>用户</th><th>转化率</th></tr></thead>
              <tbody>
                <tr v-for="s in funnel?.steps || []" :key="s.step">
                  <td>{{ s.step }}</td><td class="num">{{ s.users }}</td><td class="num">{{ s.rate }}%</td>
                </tr>
                <tr v-if="!funnel?.steps?.length"><td colspan="3" class="muted">暂无漏斗数据</td></tr>
              </tbody>
            </n-table>
          </div>
        </div>
        <div class="card card--pad" style="margin-top: 16px">
          <div class="card__title">注册 cohort 留存</div>
          <n-table :bordered="false" :single-line="false" size="small">
            <thead><tr><th>注册日</th><th>用户数</th><th>D1</th><th>D7</th><th>D30</th></tr></thead>
            <tbody>
              <tr v-for="c in retention?.cohorts || []" :key="c.cohort">
                <td>{{ c.cohort }}</td><td class="num">{{ c.users }}</td>
                <td class="num">{{ c.d1 }}%</td><td class="num">{{ c.d7 }}%</td><td class="num">{{ c.d30 }}%</td>
              </tr>
              <tr v-if="!retention?.cohorts?.length"><td colspan="5" class="muted">暂无 cohort 数据</td></tr>
            </tbody>
          </n-table>
        </div>
      </n-tab-pane>
    </n-tabs>
  </div>
</template>

<style scoped>
.kpi-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
.kpi { background: #fff; border: 1px solid #E3EAE8; border-radius: 12px; padding: 14px 16px; }
.kpi__label { display: flex; align-items: center; gap: 6px; color: #6E807E; font-size: 12px; }
.kpi__value { font-size: 26px; font-weight: 700; margin: 6px 0 2px; color: #12211F; font-variant-numeric: tabular-nums; }
.kpi__foot { font-size: 12px; color: #6E807E; }
.kpi--accent { border-left: 3px solid #0F8B8D; }
.kpi--warn { border-left: 3px solid #D9971A; }
.kpi--danger { border-left: 3px solid #E5484D; }
.two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.notice { display: flex; gap: 8px; align-items: flex-start; padding: 12px 14px; border-radius: 10px; background: #FFF7E8; color: #8A5A00; font-size: 13px; }
.liability-row { display: flex; flex-wrap: wrap; gap: 12px 28px; margin-bottom: 14px; }
.liability-row > div { display: flex; flex-direction: column; gap: 2px; font-size: 12px; }
.liability-row b { font-size: 18px; color: #12211F; }
.filter-row { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
.pager { display: flex; justify-content: flex-end; margin-top: 12px; }
.num { font-variant-numeric: tabular-nums; }
@media (max-width: 1100px) { .kpi-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .two-col { grid-template-columns: 1fr; } }
</style>
