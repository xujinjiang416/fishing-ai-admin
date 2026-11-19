<script setup lang="ts">
/**
 * CacheView.vue — 系统设置 · 缓存管理
 *
 * 统一管理两类本地缓存（有效期均默认 3 小时）：
 * - 天气数据缓存：键 = 标准化地址 + 日期，命中时不调用和风天气；
 * - 鱼情分析缓存：键 = 全部查询参数哈希，命中时不调用大模型。
 *
 * 功能：统计看板 / 列表筛选 / 详情 / 手动刷新（天气）/ 删除（单条、批量）。
 * 高危操作仅超级管理员可见，普通管理员只读。
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
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref } from 'vue'

import { api, type CacheItem, type CacheQuery, type CacheStats, type FishCacheItem } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()
const dialog = useDialog()
const auth = useAuthStore()
const isSuper = computed(() => auth.role === '超级管理员')

const cacheType = ref<'weather' | 'fish'>('weather')
const loading = ref(false)
const stats = ref<CacheStats | null>(null)

// ---------- 天气缓存 ----------
const rows = ref<CacheItem[]>([])
const checkedKeys = ref<number[]>([])
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

// ---------- 鱼情缓存 ----------
const fishRows = ref<FishCacheItem[]>([])
const fishCheckedKeys = ref<number[]>([])
const fishQuery = reactive({ keyword: '', status: 'all', source: 'all', startDate: '', endDate: '' })
const fishPagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 20, 50],
  onChange: (p: number) => {
    fishPagination.page = p
    loadFish()
  },
  onUpdatePageSize: (s: number) => {
    fishPagination.pageSize = s
    fishPagination.page = 1
    loadFish()
  },
})

function buildParams(
  source: { keyword: string; status: string; source: string; startDate: string; endDate: string },
  page: number,
  pageSize: number,
): CacheQuery {
  return {
    keyword: source.keyword,
    status: source.status,
    source: source.source,
    startDate: source.startDate || undefined,
    endDate: source.endDate || undefined,
    page,
    pageSize,
  }
}

let timer: ReturnType<typeof setTimeout> | undefined
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    if (cacheType.value === 'weather') {
      pagination.page = 1
      load()
    } else {
      fishPagination.page = 1
      loadFish()
    }
  }, 300)
}

async function load() {
  loading.value = true
  try {
    const r = await api.cacheList(buildParams(query, pagination.page, pagination.pageSize))
    rows.value = r.list
    pagination.itemCount = r.total
    const ids = new Set(r.list.map((x) => x.id))
    checkedKeys.value = checkedKeys.value.filter((k) => ids.has(k))
  } finally {
    loading.value = false
  }
}

async function loadFish() {
  loading.value = true
  try {
    const r = await api.fishCacheList(
      buildParams(fishQuery, fishPagination.page, fishPagination.pageSize),
    )
    fishRows.value = r.list
    fishPagination.itemCount = r.total
    const ids = new Set(r.list.map((x) => x.id))
    fishCheckedKeys.value = fishCheckedKeys.value.filter((k) => ids.has(k))
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  stats.value = await api.cacheStats()
}

function resetAndLoad() {
  if (cacheType.value === 'weather') {
    pagination.page = 1
    load()
  } else {
    fishPagination.page = 1
    loadFish()
  }
}

function onTypeChange() {
  if (cacheType.value === 'weather') load()
  else loadFish()
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
  { label: '兜底/规则', value: 'fallback' },
]
const fishSourceOptions = [
  { label: '全部来源', value: 'all' },
  { label: '大模型', value: 'llm' },
  { label: '规则引擎', value: 'rule' },
]

const sourceText = (s: string) =>
  ({ qweather: '和风', llm: '大模型', fallback: '兜底', rule: '规则' } as Record<string, string>)[s] || s

function barHeight(n: number, arr: number[]): string {
  const max = Math.max(1, ...arr)
  return Math.max(6, Math.round((n / max) * 100)) + '%'
}

const columns: DataTableColumns<CacheItem> = [
  { type: 'selection' },
  {
    title: '缓存键',
    key: 'cacheKey',
    width: 200,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.cacheKey)),
  },
  {
    title: '标准地址',
    key: 'region',
    width: 160,
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
        { default: () => sourceText(row.source) },
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

const fishColumns: DataTableColumns<FishCacheItem> = [
  { type: 'selection' },
  {
    title: '缓存键',
    key: 'cacheKey',
    width: 220,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.cacheKey)),
  },
  {
    title: '查询地址',
    key: 'region',
    width: 170,
    render: (row) => ellipsis(row.region),
  },
  { title: '日期', key: 'day', width: 110, render: (row) => h('span', { class: 'num' }, row.day ?? '—') },
  {
    title: '来源',
    key: 'source',
    width: 90,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, type: row.source === 'llm' ? 'success' : 'default', bordered: false },
        { default: () => sourceText(row.source) },
      ),
  },
  {
    title: '鱼情评分',
    key: 'score',
    width: 100,
    render: (row) =>
      h('span', { class: 'num' }, row.score != null ? `${row.score} 分` : '—'),
  },
  {
    title: '研判结论',
    key: 'verdict',
    width: 120,
    render: (row) => h('span', { class: 'td-s' }, row.verdict ?? '—'),
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
    title: '操作',
    key: 'actions',
    width: isSuper.value ? 150 : 80,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns' }, [
        h(NButton, { size: 'tiny', onClick: () => openFishDetail(row) }, { default: () => '详情' }),
        isSuper.value
          ? h(
              NButton,
              { size: 'tiny', type: 'error', quaternary: true, onClick: () => confirmFishDelete(row) },
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

const showFishDetail = ref(false)
const fishDetail = ref<{
  cache: FishCacheItem
  payload: Record<string, unknown>
  params: Record<string, string>
} | null>(null)

async function openFishDetail(row: FishCacheItem) {
  fishDetail.value = await api.fishCacheDetail(row.id)
  showFishDetail.value = true
}

const fishVerdict = computed(() => {
  const v = (fishDetail.value?.payload?.verdict as Record<string, unknown>) || {}
  return v
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
    title: '批量刷新天气缓存',
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

function confirmFishDelete(row: FishCacheItem) {
  dialog.warning({
    title: '删除鱼情缓存',
    content: `确认删除缓存「${row.cacheKey}」？删除后下次查询会重新调用大模型。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteFishCache(row.id)
      message.success('缓存已删除')
      loadFish()
      loadStats()
    },
  })
}

function confirmFishDeleteBatch() {
  if (!fishCheckedKeys.value.length) {
    message.warning('请先勾选要删除的缓存')
    return
  }
  const count = fishCheckedKeys.value.length
  dialog.warning({
    title: '批量删除鱼情缓存',
    content: `确认删除已选中的 ${count} 条缓存？删除后不可恢复。`,
    positiveText: `确认删除 ${count} 条`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteFishCache(fishCheckedKeys.value)
      message.success(`已删除 ${r.deleted} 条缓存`)
      fishCheckedKeys.value = []
      loadFish()
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
        <p class="pagehead__desc">
          天气数据与鱼情分析统一缓存 3 小时：命中时不再调用和风天气 / 大模型，过期后自动重新拉取。
        </p>
      </div>
      <div class="pagehead__actions">
        <template v-if="cacheType === 'weather'">
          <n-tag :bordered="false" round type="warning">已选 {{ checkedKeys.length }} 条</n-tag>
          <n-button v-if="isSuper" type="error" :disabled="!checkedKeys.length" @click="confirmDeleteBatch">
            <template #icon><n-icon :component="TrashOutline" /></template>
            批量删除
          </n-button>
          <n-button v-if="isSuper" ghost :disabled="!checkedKeys.length" @click="confirmRefreshBatch">
            <template #icon><n-icon :component="RefreshOutline" /></template>
            批量刷新
          </n-button>
        </template>
        <template v-else>
          <n-tag :bordered="false" round type="warning">已选 {{ fishCheckedKeys.length }} 条</n-tag>
          <n-button v-if="isSuper" type="error" :disabled="!fishCheckedKeys.length" @click="confirmFishDeleteBatch">
            <template #icon><n-icon :component="TrashOutline" /></template>
            批量删除
          </n-button>
        </template>
      </div>
    </div>

    <!-- 统计看板 -->
    <div v-if="stats" class="stat-row">
      <div class="kpi">
        <div class="kpi__label">缓存总数量</div>
        <div class="kpi__val">{{ stats.totalCount }}</div>
        <div class="kpi__ft">天气 {{ stats.weatherCount }} · 鱼情 {{ stats.fishCount }}</div>
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

    <n-tabs v-model:value="cacheType" type="line" class="mt12" @update:value="onTypeChange">
      <!-- 天气数据缓存 -->
      <n-tab-pane name="weather" tab="天气数据缓存（和风天气 · 3 小时）">
        <div class="toolbar">
          <n-input
            v-model:value="query.keyword"
            placeholder="搜索地址 / 缓存键"
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
              :scroll-x="1600"
              remote
              :bordered="false"
            />
          </n-spin>
        </div>
      </n-tab-pane>

      <!-- 鱼情分析缓存 -->
      <n-tab-pane name="fish" tab="鱼情分析缓存（大模型 · 3 小时）">
        <div class="toolbar">
          <n-input
            v-model:value="fishQuery.keyword"
            placeholder="搜索地址 / 缓存键 / 参数"
            clearable
            style="width: 240px"
            @update:value="onKeyword"
          >
            <template #prefix><n-icon :component="SearchOutline" /></template>
          </n-input>
          <n-select v-model:value="fishQuery.status" :options="statusOptions" style="width: 120px" @update:value="resetAndLoad" />
          <n-select v-model:value="fishQuery.source" :options="fishSourceOptions" style="width: 120px" @update:value="resetAndLoad" />
          <n-input v-model:value="fishQuery.startDate" placeholder="开始日期 YYYY-MM-DD" style="width: 180px" @update:value="onKeyword" />
          <n-input v-model:value="fishQuery.endDate" placeholder="结束日期 YYYY-MM-DD" style="width: 180px" @update:value="onKeyword" />
        </div>

        <div class="card">
          <n-spin :show="loading">
            <n-data-table
              :columns="fishColumns"
              :data="fishRows"
              :loading="loading"
              :row-key="(r: FishCacheItem) => r.id"
              v-model:checked-row-keys="fishCheckedKeys"
              :pagination="fishPagination"
              :scroll-x="1600"
              remote
              :bordered="false"
            />
          </n-spin>
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- 天气缓存详情 -->
    <n-modal v-model:show="showDetail" preset="card" title="天气缓存详情" style="width: 720px">
      <n-descriptions v-if="detail" label-placement="left" :column="2" size="small" bordered>
        <n-descriptions-item label="缓存键">
          <span class="td-t">{{ detail.cache.cacheKey }}</span>
        </n-descriptions-item>
        <n-descriptions-item label="数据来源"><span class="td-t">{{ sourceText(detail.cache.source) }}</span></n-descriptions-item>
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

    <!-- 鱼情缓存详情 -->
    <n-modal v-model:show="showFishDetail" preset="card" title="鱼情分析缓存详情" style="width: 720px">
      <n-descriptions v-if="fishDetail" label-placement="left" :column="2" size="small" bordered>
        <n-descriptions-item label="缓存键">
          <span class="td-t">{{ fishDetail.cache.cacheKey }}</span>
        </n-descriptions-item>
        <n-descriptions-item label="数据来源">
          {{ fishDetail.cache.source === 'llm' ? '大模型' : '规则引擎' }}
        </n-descriptions-item>
        <n-descriptions-item label="查询地址">{{ fishDetail.cache.region }}</n-descriptions-item>
        <n-descriptions-item label="查询日期">{{ fishDetail.cache.day ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="生成时间">{{ fishDetail.cache.createdAt ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="过期时间">{{ fishDetail.cache.expireAt ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="鱼情评分">{{ fishVerdict.score ?? '—' }} 分</n-descriptions-item>
        <n-descriptions-item label="研判结论">{{ fishVerdict.name ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="适宜鱼种">
          {{ Array.isArray(fishVerdict.species) ? (fishVerdict.species as string[]).join('、') : '—' }}
        </n-descriptions-item>
        <n-descriptions-item label="时段数">{{ (fishDetail.payload.slots as unknown[] | undefined)?.length ?? 0 }}</n-descriptions-item>
        <n-descriptions-item label="总体依据" :span="2">{{ fishVerdict.reason ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="出钓建议" :span="2">{{ fishVerdict.advice ?? '—' }}</n-descriptions-item>
      </n-descriptions>
      <template #footer>
        <div style="display: flex; justify-content: flex-end">
          <n-button @click="showFishDetail = false">关闭</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>
