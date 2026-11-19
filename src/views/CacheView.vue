<script setup lang="ts">
/**
 * CacheView.vue — 系统设置 · 缓存管理
 *
 * 功能：
 * - 顶部统计看板（总数 / 占用空间 / 今日命中率 / 即将过期 + 近 7 天命中趋势）；
 * - 列表分页 + 多条件筛选（城市 / 状态 / 来源 / 时间范围）；
 * - 详情查看完整缓存天气数据；
 * - 手动刷新（单条 / 批量）、手动删除（单条 / 批量，均二次确认）；
 * - 高危操作（刷新 / 删除）仅超级管理员可见，普通管理员只读。
 */
import {
  RefreshOutline,
  SearchOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import {
  NButton,
  NDescriptions,
  NDescriptionsItem,
  NEllipsis,
  NIcon,
  NInput,
  NModal,
  NSelect,
  NSpin,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref } from 'vue'

import { api, type CacheItem, type CacheStats } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()
const dialog = useDialog()
const auth = useAuthStore()
const isSuper = computed(() => auth.role === '超级管理员')

const rows = ref<CacheItem[]>([])
const checkedKeys = ref<number[]>([])
const loading = ref(false)
const stats = ref<CacheStats | null>(null)
const query = reactive({ keyword: '', status: 'all', source: 'all', startDate: '', endDate: '' })

const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (p: number) => {
    pagination.page = p
    load()
  },
  onUpdatePageSize: (s: number) => {
    pagination.pageSize = s
    pagination.page = 1
    load()
  },
})

let timer: ReturnType<typeof setTimeout> | undefined
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}
function resetAndLoad() {
  pagination.page = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const r = await api.cacheList({
      keyword: query.keyword,
      status: query.status,
      source: query.source,
      startDate: query.startDate || undefined,
      endDate: query.endDate || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
    const ids = new Set(r.list.map((x) => x.id))
    checkedKeys.value = checkedKeys.value.filter((k) => ids.has(k))
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  stats.value = await api.cacheStats()
}

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '有效', value: 'active' },
  { label: '已过期', value: 'expired' },
]
const sourceOptions = [
  { label: '全部来源', value: 'all' },
  { label: '和风天气', value: 'qweather' },
  { label: '大模型', value: 'llm' },
  { label: '兜底', value: 'fallback' },
]

function barHeight(n: number, arr: number[]): string {
  const max = Math.max(1, ...arr)
  return Math.max(6, Math.round((n / max) * 100)) + '%'
}

const columns: DataTableColumns<CacheItem> = [
  { type: 'selection' },
  {
    title: '缓存键',
    key: 'cacheKey',
    width: 180,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.cacheKey)),
  },
  {
    title: '城市区域',
    key: 'region',
    width: 150,
    render: (row) => ellipsis(row.region),
  },
  { title: '日期', key: 'day', width: 110, render: (row) => h('span', { class: 'num' }, row.day) },
  {
    title: '来源',
    key: 'source',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.source === 'qweather' ? 'success' : 'default', bordered: false },
        {
          default: () =>
            ({ qweather: '和风', llm: '大模型', fallback: '兜底' } as Record<string, string>)[row.source] || row.source,
        },
      ),
  },
  { title: '生成时间', key: 'createdAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.createdAt ?? '—') },
  { title: '过期时间', key: 'expireAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.expireAt ?? '—') },
  {
    title: '状态',
    key: 'status',
    width: 80,
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          round: true,
          type: row.status === 'active' ? 'success' : 'warning',
          bordered: false,
        },
        { default: () => (row.status === 'active' ? '有效' : '已过期') },
      ),
  },
  { title: '大小', key: 'sizeKb', width: 90, render: (row) => h('span', { class: 'num' }, row.sizeKb + ' KB') },
  { title: '命中', key: 'hitCount', width: 70, render: (row) => h('span', { class: 'num' }, row.hitCount) },
  {
    title: '天气摘要',
    key: 'condition',
    width: 150,
    render: (row) => h('span', { class: 'td-s' }, `${row.condition ?? '—'} ${row.temp != null ? row.temp + '°C' : ''}`),
  },
  {
    title: '操作',
    key: 'actions',
    width: isSuper.value ? 180 : 80,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns' }, [
        h(NButton, { size: 'tiny', onClick: () => openDetail(row) }, { default: () => '详情' }),
        isSuper.value
          ? h(
              NButton,
              { size: 'tiny', onClick: () => refreshRow(row) },
              { icon: () => h(NIcon, { component: RefreshOutline }), default: () => '刷新' },
            )
          : null,
        isSuper.value
          ? h(
              NButton,
              { size: 'tiny', type: 'error', quaternary: true, onClick: () => confirmDelete(row) },
              { icon: () => h(NIcon, { component: TrashOutline }), default: () => '删除' },
            )
          : null,
      ]),
  },
]

// ---------- 详情 ----------
const showDetail = ref(false)
const detail = ref<{ cache: CacheItem; payload: Record<string, unknown> } | null>(null)

async function openDetail(row: CacheItem) {
  detail.value = await api.cacheDetail(row.id)
  showDetail.value = true
}

const weatherFields = computed(() => {
  const w = (detail.value?.payload?.weather as Record<string, unknown>) || {}
  return w
})

// ---------- 刷新 / 删除 ----------
async function refreshRow(row: CacheItem) {
  try {
    await api.refreshCache(row.id)
    message.success('缓存已刷新')
    load()
    loadStats()
  } catch {
    /* 拦截器已提示 */
  }
}

function confirmRefreshBatch() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要刷新的缓存')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量刷新缓存',
    content: `确认刷新已选中的 ${count} 条缓存？将重新调用上游天气源获取最新数据。`,
    positiveText: `确认刷新 ${count} 条`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchRefreshCache(checkedKeys.value)
      message.success(`已刷新 ${r.refreshed} 条缓存`)
      checkedKeys.value = []
      load()
      loadStats()
    },
  })
}

function confirmDelete(row: CacheItem) {
  dialog.warning({
    title: '删除缓存',
    content: `确认删除缓存「${row.cacheKey}」？删除后不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteCache(row.id)
      message.success('缓存已删除')
      load()
      loadStats()
    },
  })
}

function confirmDeleteBatch() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的缓存')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除缓存',
    content: `确认删除已选中的 ${count} 条缓存？删除后不可恢复。`,
    positiveText: `确认删除 ${count} 条`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteCache(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 条缓存`)
      checkedKeys.value = []
      load()
      loadStats()
    },
  })
}

onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">缓存管理</h2>
        <p class="pagehead__desc">管理天气缓存全生命周期，支持查看、刷新、删除与过期规则配置。</p>
      </div>
      <div class="pagehead__actions">
        <n-tag :bordered="false" round type="warning">已选 {{ checkedKeys.length }} 条</n-tag>
        <n-button v-if="isSuper" type="error" :disabled="!checkedKeys.length" @click="confirmDeleteBatch">
          <template #icon><n-icon :component="TrashOutline" /></template>
          批量删除
        </n-button>
        <n-button v-if="isSuper" ghost :disabled="!checkedKeys.length" @click="confirmRefreshBatch">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          批量刷新
        </n-button>
      </div>
    </div>

    <!-- 统计看板 -->
    <div v-if="stats" class="stat-row">
      <div class="kpi">
        <div class="kpi__label">缓存总数量</div>
        <div class="kpi__val">{{ stats.totalCount }}</div>
        <div class="kpi__ft">条有效/过期缓存</div>
      </div>
      <div class="kpi kpi--gold">
        <div class="kpi__label">总占用空间</div>
        <div class="kpi__val">{{ stats.totalSizeKb }} KB</div>
        <div class="kpi__ft">约 {{ (stats.totalSizeKb / 1024).toFixed(2) }} MB</div>
      </div>
      <div class="kpi kpi--success">
        <div class="kpi__label">今日命中率</div>
        <div class="kpi__val">{{ stats.todayHitRate }}%</div>
        <div class="kpi__ft">命中 / 今日查询总量</div>
      </div>
      <div class="kpi kpi--accent">
        <div class="kpi__label">即将过期</div>
        <div class="kpi__val">{{ stats.expiringSoon }}</div>
        <div class="kpi__ft">未来 24 小时内到期</div>
      </div>
    </div>

    <div v-if="stats" class="card card--pad mt12">
      <div class="card__title">近 7 天缓存命中趋势</div>
      <div class="row" style="align-items: flex-end; gap: 6px; height: 70px; margin-top: 12px">
        <div
          v-for="(n, i) in stats.trend.hits"
          :key="i"
          class="grow"
          :style="{ height: barHeight(n, stats.trend.hits), background: 'var(--c-primary)', opacity: 0.85, borderRadius: '5px 5px 2px 2px' }"
          :title="`${stats.trend.days[i]}：命中 ${n} / ${stats.trend.totals[i]}`"
        ></div>
      </div>
      <div class="row mt4">
        <span v-for="(d, i) in stats.trend.days" :key="i" class="td-s" style="flex: 1; text-align: center">{{ d }}</span>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索城市 / 区域"
        clearable
        style="width: 220px"
        @update:value="onKeyword"
      >
        <template #prefix><n-icon :component="SearchOutline" /></template>
      </n-input>
      <n-select v-model:value="query.status" :options="statusOptions" style="width: 120px" @update:value="resetAndLoad" />
      <n-select v-model:value="query.source" :options="sourceOptions" style="width: 120px" @update:value="resetAndLoad" />
      <n-input v-model:value="query.startDate" placeholder="开始日期 YYYY-MM-DD" style="width: 180px" @update:value="onKeyword" />
      <n-input v-model:value="query.endDate" placeholder="结束日期 YYYY-MM-DD" style="width: 180px" @update:value="onKeyword" />
    </div>

    <div class="card">
      <n-spin :show="loading">
        <n-data-table
          :columns="columns"
          :data="rows"
          :loading="loading"
          :row-key="(r: CacheItem) => r.id"
          v-model:checked-row-keys="checkedKeys"
          :pagination="pagination"
          :scroll-x="1500"
          remote
          :bordered="false"
        />
      </n-spin>
    </div>

    <!-- 详情弹窗 -->
    <n-modal v-model:show="showDetail" preset="card" title="缓存的天气数据详情" style="width: 720px">
      <n-descriptions v-if="detail" label-placement="left" :column="2" size="small" bordered>
        <n-descriptions-item label="缓存键">
          <span class="td-t">{{ detail.cache.cacheKey }}</span>
        </n-descriptions-item>
        <n-descriptions-item label="数据来源"><span class="td-t">{{ detail.cache.source }}</span></n-descriptions-item>
        <n-descriptions-item label="生成时间">{{ detail.cache.createdAt ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="过期时间">{{ detail.cache.expireAt ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="天气现象">{{ weatherFields.condition ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="当前温度">{{ weatherFields.temp ?? '—' }}°C</n-descriptions-item>
        <n-descriptions-item label="最高 / 最低温">{{ weatherFields.tempMax ?? '—' }}°C / {{ weatherFields.tempMin ?? '—' }}°C</n-descriptions-item>
        <n-descriptions-item label="体感温度">{{ weatherFields.tempFeel ?? '—' }}°C</n-descriptions-item>
        <n-descriptions-item label="相对湿度">{{ weatherFields.humidity ?? '—' }}%</n-descriptions-item>
        <n-descriptions-item label="风向风力">{{ weatherFields.windDir ?? '—' }}{{ weatherFields.windLevel ?? '' }}</n-descriptions-item>
        <n-descriptions-item label="气压">{{ weatherFields.pressure ?? '—' }} hPa</n-descriptions-item>
        <n-descriptions-item label="空气质量">{{ weatherFields.aqiText ?? '—' }}（AQI {{ weatherFields.aqi ?? '—' }}）</n-descriptions-item>
        <n-descriptions-item label="紫外线指数">{{ weatherFields.uv ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="日出 / 日落">{{ weatherFields.sunrise ?? '—' }} / {{ weatherFields.sunset ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="能见度">{{ weatherFields.visibility ?? '—' }} km</n-descriptions-item>
      </n-descriptions>
      <template #footer>
        <div style="display: flex; justify-content: flex-end">
          <n-button @click="showDetail = false">关闭</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>