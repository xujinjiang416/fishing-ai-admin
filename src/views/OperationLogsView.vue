<script setup lang="ts">
/**
 * OperationLogsView.vue — 系统设置 · 操作日志
 *
 * 功能（对应需求 7 的「操作日志全链路追溯」）：
 * - 分页展示管理后台的关键操作日志（积分配置变更 / 评论删除 / 评论批量删除）；
 * - 支持按动作类型与关键词（详情 / 管理员 / 对象）检索，满足审计追溯。
 */
import { DownloadOutline, SearchOutline } from '@vicons/ionicons5'
import { NButton, NEllipsis, NIcon, NTag, useMessage, type DataTableColumns } from 'naive-ui'
import { h, onMounted, reactive, ref } from 'vue'

import { api, type OperationLogItem } from '@/api/admin'
import { TOKEN_KEY } from '@/api/http'

/** 单行省略文本：超宽时截断为一行 + 悬浮显示全文（n-ellipsis） */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()
const rows = ref<OperationLogItem[]>([])
const loading = ref(false)
const query = reactive({ keyword: '', action: 'all' })

// 动作类型 -> 展示文案与标签色（与后端 oplog 常量对应）
const ACTION_MAP: Record<string, { text: string; type: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  'config.update': { text: '积分配置变更', type: 'info' },
  'comment.delete': { text: '删除评论', type: 'warning' },
  'comment.batch_delete': { text: '批量删除评论', type: 'error' },
  'cache.refresh': { text: '刷新缓存', type: 'info' },
  'cache.batch_refresh': { text: '批量刷新缓存', type: 'info' },
  'cache.delete': { text: '删除缓存', type: 'warning' },
  'cache.batch_delete': { text: '批量删除缓存', type: 'error' },
  'cache.rule.update': { text: '修改缓存规则', type: 'info' },
}

const actionOptions = [
  { label: '全部动作', value: 'all' },
  { label: '积分配置变更', value: 'config.update' },
  { label: '删除评论', value: 'comment.delete' },
  { label: '批量删除评论', value: 'comment.batch_delete' },
  { label: '刷新缓存', value: 'cache.refresh' },
  { label: '批量刷新缓存', value: 'cache.batch_refresh' },
  { label: '删除缓存', value: 'cache.delete' },
  { label: '批量删除缓存', value: 'cache.batch_delete' },
  { label: '修改缓存规则', value: 'cache.rule.update' },
]

async function doExport() {
  const params = new URLSearchParams()
  if (query.keyword) params.set('keyword', query.keyword)
  if (query.action && query.action !== 'all') params.set('action', query.action)
  const token = localStorage.getItem(TOKEN_KEY)
  const resp = await fetch(`/api/admin/logs/export?${params.toString()}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!resp.ok) {
    message.error('导出失败')
    return
  }
  const blob = await resp.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'operation_logs.csv'
  a.click()
  URL.revokeObjectURL(url)
}

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

function onActionChange() {
  pagination.page = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const r = await api.logs({
      keyword: query.keyword,
      action: query.action,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
  } finally {
    loading.value = false
  }
}

const columns: DataTableColumns<OperationLogItem> = [
  {
    title: '动作',
    key: 'action',
    width: 140,
    render: (row) => {
      const m = ACTION_MAP[row.action]
      return h(
        NTag,
        { size: 'small', round: true, type: m?.type ?? 'default', bordered: false },
        { default: () => m?.text ?? row.action },
      )
    },
  },
  { title: '操作人', key: 'admin', width: 140, render: (row) => h('span', { style: 'display: block' }, ellipsis(row.admin || '系统')) },
  {
    title: '操作对象',
    key: 'target',
    width: 240,
    render: (row) => h('span', { class: 'td-s num', style: 'display: block' }, ellipsis(row.target || '—')),
  },
  {
    title: '详情',
    key: 'detail',
    width: 340,
    render: (row) => h('span', { class: 'cmt-text', style: 'display: block' }, ellipsis(row.detail || '—')),
  },
  { title: '来源 IP', key: 'ip', width: 130, render: (row) => h('span', { class: 'td-s num' }, row.ip || '—') },
  {
    title: '时间',
    key: 'createdAt',
    width: 170,
    render: (row) => h('span', { class: 'td-s' }, row.createdAt || '—'),
  },
]

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">操作日志</h2>
        <p class="pagehead__desc">记录管理后台的关键操作（配置变更 / 评论删除 / 缓存管理），支持全链路审计追溯。</p>
      </div>
      <div class="pagehead__actions">
        <n-button ghost @click="doExport">
          <template #icon><n-icon :component="DownloadOutline" /></template>
          导出 CSV
        </n-button>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索详情 / 操作人 / 对象"
        clearable
        style="width: 280px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select
        v-model:value="query.action"
        :options="actionOptions"
        style="width: 160px"
        @update:value="onActionChange"
      />
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: OperationLogItem) => r.id"
        :pagination="pagination"
        :scroll-x="1200"
        remote
        :bordered="false"
      />
    </div>
  </div>
</template>
