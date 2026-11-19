<script setup lang="ts">
import { RefreshOutline, SearchOutline, TrashOutline } from '@vicons/ionicons5'
import {
  NButton,
  NEllipsis,
  NIcon,
  NSelect,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { h, onMounted, reactive, ref } from 'vue'

import { api, type WeatherLog } from '@/api/admin'
import { levelTag } from '@/utils/tags'

/** 单行省略文本：超宽时截断为一行 + 悬浮显示全文（n-ellipsis） */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()
const dialog = useDialog()

const rows = ref<WeatherLog[]>([])
const checkedKeys = ref<string[]>([])
const loading = ref(false)
const query = reactive({ keyword: '', source: '全部' })
const pagination = reactive({
  page: 1,
  pageSize: 8,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [8, 16, 30],
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
    const r = await api.weatherLogs({
      keyword: query.keyword,
      source: query.source,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
    // 清理已不在当前页的选中项
    const ids = new Set(r.list.map((x) => x.id))
    checkedKeys.value = checkedKeys.value.filter((k) => ids.has(k))
  } finally {
    loading.value = false
  }
}

const sourceOptions = ['全部', '手动选点', '手机定位'].map((s) => ({ label: s, value: s }))

const columns: DataTableColumns<WeatherLog> = [
  { type: 'selection' },
  {
    title: '记录编号',
    key: 'id',
    width: 140,
    render: (row) => h('span', { class: 'num td-s' }, ellipsis(row.id)),
  },
  {
    title: '用户',
    key: 'user',
    width: 120,
    render: (row) =>
      h('div', { class: 'td-main' }, [
        h('span', { class: 'avatar avatar--sm' }, row.user.slice(0, 1)),
        h('span', { class: 'td-t' }, ellipsis(row.user)),
      ]),
  },
  {
    title: '地点',
    key: 'place',
    width: 260,
    render: (row) =>
      h('div', { class: 'td-sub', style: 'min-width: 0' }, [
        h('span', { class: 'td-t' }, ellipsis(row.place ?? '—')),
        h('span', { class: 'td-s' }, ellipsis(row.placeDetail ?? '')),
      ]),
  },
  {
    title: '结论',
    key: 'level',
    width: 80,
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          round: true,
          color: levelTag(row.level).color,
          'text-color': levelTag(row.level).textColor,
        },
        { default: () => levelTag(row.level).text },
      ),
  },
  {
    title: '分数',
    key: 'score',
    width: 70,
    render: (row) => h('span', { class: 'num' }, row.score),
  },
  {
    title: '气温',
    key: 'temp',
    width: 80,
    render: (row) => h('span', { class: 'num', style: 'white-space: nowrap' }, (row.temp ?? '—') + '°C'),
  },
  {
    title: '气压',
    key: 'pressure',
    width: 100,
    render: (row) => h('span', { class: 'num', style: 'white-space: nowrap' }, (row.pressure ?? '—') + ' hPa'),
  },
  {
    title: '生成时间',
    key: 'date',
    width: 150,
    render: (row) => h('span', { class: 'td-s' }, ellipsis(row.date)),
  },
  { title: '来源', key: 'source', width: 90, render: (row) => h('span', { class: 'td-s' }, row.source) },
  { title: '解锁方式', key: 'cost', width: 100, render: (row) => h('span', { class: 'td-s' }, row.cost) },
  {
    title: '操作',
    key: 'actions',
    width: 160,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns' }, [
        h(
          NButton,
          { size: 'tiny', onClick: () => regenerate(row) },
          {
            icon: () => h(NIcon, { component: RefreshOutline }),
            default: () => '重新生成',
          },
        ),
        h(
          NButton,
          { size: 'tiny', type: 'error', quaternary: true, onClick: () => confirmDelete(row) },
          {
            icon: () => h(NIcon, { component: TrashOutline }),
            default: () => '删除',
          },
        ),
      ]),
  },
]

async function regenerate(row: WeatherLog) {
  try {
    const r = await api.regenerateWeather(row.id)
    message.success('已重新生成，新的结论：' + r.verdict)
    load()
  } catch {
    /* 拦截器已提示 */
  }
}

function batchRegenerate() {
  message.success('已提交批量任务（演示）')
}

function confirmDelete(row: WeatherLog) {
  dialog.warning({
    title: '删除记录',
    content: `确认删除记录「${row.id}」？该操作不可恢复。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteWeatherLog(row.id)
      message.success('记录已删除')
      load()
    },
  })
}

/** 批量删除：二次确认 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的记录')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除记录',
    content: `确认删除已选中的 ${count} 条记录？该操作不可恢复。`,
    positiveText: `确认删除 ${count} 条`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteWeatherLogs(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 条记录`)
      checkedKeys.value = []
      load()
    },
  })
}

// ---------- 详情弹窗 ----------
const showDetail = ref(false)
const detail = ref<WeatherLog | null>(null)

function openDetail(row: WeatherLog) {
  detail.value = row
  showDetail.value = true
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">天气数据</h2>
        <p class="pagehead__desc">查看用户生成的 AI 天气/鱼情记录，可按关键词与来源筛选，支持单条重新生成。</p>
      </div>
      <div class="pagehead__actions">
        <n-tag :bordered="false" round type="warning">已选 {{ checkedKeys.length }} 条</n-tag>
        <n-button type="error" :disabled="!checkedKeys.length" @click="confirmBatchDelete">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          批量删除
        </n-button>
        <n-button ghost @click="batchRegenerate">
          <template #icon>
            <n-icon :component="RefreshOutline" />
          </template>
          批量重新生成
        </n-button>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索用户 / 地点 / 记录编号"
        clearable
        style="width: 260px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select
        v-model:value="query.source"
        :options="sourceOptions"
        style="width: 120px"
        @update:value="resetAndLoad"
      />
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: WeatherLog) => r.id"
        v-model:checked-row-keys="checkedKeys"
        :pagination="pagination"
        :row-props="(row: WeatherLog) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
        :scroll-x="1400"
        remote
        :bordered="false"
      />
    </div>

    <!-- 详情弹窗 -->
    <n-modal v-model:show="showDetail" preset="card" title="天气记录详情" style="width: 640px">
      <n-descriptions v-if="detail" label-placement="left" :column="2" size="small" bordered>
        <n-descriptions-item label="地点"><span class="td-t">{{ detail.place ?? '—' }}</span></n-descriptions-item>
        <n-descriptions-item label="详细位置">{{ detail.placeDetail ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="生成时间">{{ detail.date }}</n-descriptions-item>
        <n-descriptions-item label="来源">{{ detail.source }}</n-descriptions-item>
        <n-descriptions-item label="用户">{{ detail.user }}</n-descriptions-item>
        <n-descriptions-item label="解锁方式">{{ detail.cost }}</n-descriptions-item>
        <n-descriptions-item label="天气">{{ detail.condition ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="气温">{{ detail.temp ?? '—' }}°C</n-descriptions-item>
        <n-descriptions-item label="气压">{{ detail.pressure ?? '—' }} hPa</n-descriptions-item>
        <n-descriptions-item label="风向">{{ detail.windDiff ?? '—' }}</n-descriptions-item>
        <n-descriptions-item label="分数"><span class="num">{{ detail.score }}</span></n-descriptions-item>
        <n-descriptions-item label="鱼情结论">
          <n-tag
            size="small"
            round
            :color="levelTag(detail.level).color"
            :text-color="levelTag(detail.level).textColor"
          >
            {{ levelTag(detail.level).text }}
          </n-tag>
        </n-descriptions-item>
      </n-descriptions>
      <template #footer>
        <div style="display: flex; justify-content: flex-end">
          <n-button @click="showDetail = false">关闭</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>