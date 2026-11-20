<script setup lang="ts">
/**
 * OperationLogsView.vue — 系统设置 · 操作日志
 *
 * 功能（对应需求 7 的「操作日志全链路追溯」）：
 * - 分页展示管理后台的关键操作日志（积分配置变更 / 评论删除 / 评论批量删除）；
 * - 支持按动作类型与关键词（详情 / 管理员 / 对象）检索，满足审计追溯。
 *
 * 接口来源：`@/api/admin` 的 api.logs；导出直接请求 `/api/admin/logs/export`
 * （需手动携带 Bearer Token，返回 CSV Blob）。
 *
 * 关键交互：关键词输入 300ms 防抖；动作下拉变更立即回到第 1 页查询。
 * 页面为只读审计视图，不提供任何写操作；操作动作与文案映射见 ACTION_MAP。
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

const message = useMessage() // Naive UI 轻提示实例（导出失败等反馈）
// 当前页操作日志
const rows = ref<OperationLogItem[]>([])
// 表格加载态
const loading = ref(false)
// 筛选条件：keyword 匹配详情 / 操作人 / 对象；action 为动作 key，'all' 表示全部
const query = reactive({ keyword: '', action: 'all' })

// 动作类型 -> 展示文案与标签色（与后端 oplog 常量对应）
const ACTION_MAP: Record<string, { text: string; type: 'success' | 'warning' | 'error' | 'info' | 'default' }> = {
  'config.update': { text: '积分配置变更', type: 'info' }, // 修改积分规则 / 兑换比例等配置
  'comment.delete': { text: '删除评论', type: 'warning' }, // 单条删除用户评论
  'comment.batch_delete': { text: '批量删除评论', type: 'error' }, // 批量删除用户评论
  'cache.refresh': { text: '刷新缓存', type: 'info' }, // 重新生成单条天气缓存
  'cache.batch_refresh': { text: '批量刷新缓存', type: 'info' }, // 批量重新生成天气缓存
  'cache.delete': { text: '删除缓存', type: 'warning' }, // 删除单条天气缓存
  'cache.batch_delete': { text: '批量删除缓存', type: 'error' }, // 批量删除天气缓存
  'cache.rule.update': { text: '修改缓存规则', type: 'info' }, // 调整缓存过期 / 命中策略
  'order.close': { text: '关闭订单', type: 'warning' }, // 关闭待支付订单
  'order.ship': { text: '订单发货', type: 'info' }, // 填写物流信息完成发货
  'order.address': { text: '修改收货地址', type: 'info' }, // 修改订单收货人 / 电话 / 地址
  'order.remark': { text: '订单备注 / 异常', type: 'warning' }, // 保存运营备注或异常标记
  'order.refund': { text: '订单退款', type: 'error' }, // 通过退款或驳回退款申请
  'order.complete': { text: '订单完成', type: 'success' }, // 人工确认订单完成
  'order.delete': { text: '删除订单', type: 'error' }, // 删除订单记录（不可恢复）
}

// 动作筛选项：value 与 ACTION_MAP / 后端 action 字段对应
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
  { label: '关闭订单', value: 'order.close' },
  { label: '订单发货', value: 'order.ship' },
  { label: '修改收货地址', value: 'order.address' },
  { label: '订单备注 / 异常', value: 'order.remark' },
  { label: '订单退款', value: 'order.refund' },
  { label: '订单完成', value: 'order.complete' },
  { label: '删除订单', value: 'order.delete' },
]

/**
 * 导出当前筛选条件下的操作日志：
 * 1. 仅携带非空关键词与非 all 动作；
 * 2. 手动附加 Bearer Token 请求导出接口；
 * 3. 成功后以 Blob 触发 CSV 下载，并回收临时对象 URL。
 */
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

/**
 * 分页配置（remote 模式）：page 当前页、pageSize 每页条数、itemCount 服务端总数；
 * 翻页或调整每页条数后重新请求，调整条数时回到第 1 页。
 */
const pagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 30, 50],
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
/** 关键词输入防抖（300ms）：触发时回到第 1 页再查询 */
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/** 动作筛选变化：立即回到第 1 页查询 */
function onActionChange() {
  pagination.page = 1
  load()
}

/** 拉取操作日志列表并同步总数 */
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

// 表格列：动作、操作人、操作对象、详情、来源 IP、时间；均为只读展示
const columns: DataTableColumns<OperationLogItem> = [
  // 列：动作（ACTION_MAP 映射文案与标签色，未知动作原样展示）
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
  // 列：操作人（缺失时视为系统操作）
  { title: '操作人', key: 'admin', width: 140, render: (row) => h('span', { style: 'display: block' }, ellipsis(row.admin || '系统')) },
  // 列：操作对象（如订单编号、评论 id、配置项）
  {
    title: '操作对象',
    key: 'target',
    width: 240,
    render: (row) => h('span', { class: 'td-s num', style: 'display: block' }, ellipsis(row.target || '—')),
  },
  // 列：详情（操作摘要，超长单行省略）
  {
    title: '详情',
    key: 'detail',
    width: 340,
    render: (row) => h('span', { class: 'cmt-text', style: 'display: block' }, ellipsis(row.detail || '—')),
  },
  // 列：来源 IP
  { title: '来源 IP', key: 'ip', width: 130, render: (row) => h('span', { class: 'td-s num' }, row.ip || '—') },
  // 列：操作时间
  {
    title: '时间',
    key: 'createdAt',
    width: 170,
    render: (row) => h('span', { class: 'td-s' }, row.createdAt || '—'),
  },
]

// 首屏加载日志列表
onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 / 标题描述在左，右侧为按当前筛选条件导出 CSV 的入口 -->
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

    <!-- 区块：筛选栏 / 关键词搜索（300ms 防抖）+ 动作类型下拉（变更即查询） -->
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

    <!-- 区块：日志表格 / remote 分页，只读无操作列；表体独立纵向滚动，表头常驻 -->
    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: OperationLogItem) => r.id"
        :pagination="pagination"
        :scroll-x="1200"
        max-height="var(--table-max-h)"
        remote
        :bordered="false"
      />
    </div>
  </div>
</template>
