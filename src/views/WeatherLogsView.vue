<script setup lang="ts">
/**
 * WeatherLogsView.vue — 数据管理 · 天气数据
 *
 * 页面职责：
 * - 分页展示用户生成的 AI 天气 / 鱼情记录（用户、地点、鱼情结论、气温气压、来源等）；
 * - 支持关键词（用户 / 地点 / 记录编号）与来源（手动选点 / 手机定位）筛选；
 * - 支持单条重新生成、单条删除、批量重新生成与批量删除；
 * - 行点击打开详情弹窗，查看完整天气指标与解锁方式。
 *
 * 接口来源：`@/api/admin` 的 api.weatherLogs / api.regenerateWeather /
 * api.deleteWeatherLog / api.batchDeleteWeatherLogs。
 *
 * 关键交互：关键词输入 300ms 防抖；筛选变更回到第 1 页；翻页后清理不在当前页的选中项。
 * 删除为不可恢复操作，单条与批量均需二次确认。
 */
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

const message = useMessage() // Naive UI 轻提示实例
const dialog = useDialog() // Naive UI 确认对话框实例（删除二次确认）

// 当前页天气记录
const rows = ref<WeatherLog[]>([])
// 多选选中的记录 id 集合（row-key 为记录 id）
const checkedKeys = ref<string[]>([])
// 表格加载态
const loading = ref(false)
// 筛选条件：keyword 匹配用户 / 地点 / 编号；source 取值见 sourceOptions，'全部' 表示不过滤
const query = reactive({ keyword: '', source: '全部' })
/**
 * 分页配置（remote 模式）：page 当前页、pageSize 每页条数（默认 8）、
 * itemCount 服务端总数；翻页或调整每页条数后重新请求。
 */
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
/** 关键词输入防抖（300ms）：触发时重置到第 1 页再查询 */
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/** 来源筛选变化：回到第 1 页重新查询 */
function resetAndLoad() {
  pagination.page = 1
  load()
}

/**
 * 拉取天气记录列表并同步总数。
 * 请求成功后过滤选中项，仅保留仍在当前页的记录，避免跨页误删。
 */
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

// 来源筛选项：与小程序端记录来源文案一致
const sourceOptions = ['全部', '手动选点', '手机定位'].map((s) => ({ label: s, value: s }))

// 表格列：首列为多选，其后依次为记录信息、天气指标与操作列
const columns: DataTableColumns<WeatherLog> = [
  // 列：多选
  { type: 'selection' },
  // 列：记录编号
  {
    title: '记录编号',
    key: 'id',
    width: 140,
    render: (row) => h('span', { class: 'num td-s' }, ellipsis(row.id)),
  },
  // 列：用户（首字头像 + 昵称）
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
  // 列：地点（主地点 + 详细位置，两级均单行省略）
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
  // 列：结论（鱼情等级标签，levelTag 映射文案与配色）
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
  // 列：分数（鱼情评分）
  {
    title: '分数',
    key: 'score',
    width: 70,
    render: (row) => h('span', { class: 'num' }, row.score),
  },
  // 列：气温（空值显示 “—”，单位 °C）
  {
    title: '气温',
    key: 'temp',
    width: 80,
    render: (row) => h('span', { class: 'num', style: 'white-space: nowrap' }, (row.temp ?? '—') + '°C'),
  },
  // 列：气压（空值显示 “—”，单位 hPa）
  {
    title: '气压',
    key: 'pressure',
    width: 100,
    render: (row) => h('span', { class: 'num', style: 'white-space: nowrap' }, (row.pressure ?? '—') + ' hPa'),
  },
  // 列：生成时间
  {
    title: '生成时间',
    key: 'date',
    width: 150,
    render: (row) => h('span', { class: 'td-s' }, ellipsis(row.date)),
  },
  // 列：来源（手动选点 / 手机定位）
  { title: '来源', key: 'source', width: 90, render: (row) => h('span', { class: 'td-s' }, row.source) },
  // 列：解锁方式（记录生成时的消耗方式）
  { title: '解锁方式', key: 'cost', width: 100, render: (row) => h('span', { class: 'td-s' }, row.cost) },
  // 列：操作（重新生成 / 删除）
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

/**
 * 单条重新生成：调用后端重新分析天气并返回新结论，成功后刷新列表。
 * @param row 目标记录
 */
async function regenerate(row: WeatherLog) {
  try {
    const r = await api.regenerateWeather(row.id)
    message.success('已重新生成，新的结论：' + r.verdict)
    load()
  } catch {
    /* 拦截器已提示 */
  }
}

/** 批量重新生成：当前仅演示提示，未调用后端批量接口 */
function batchRegenerate() {
  message.success('已提交批量任务（演示）')
}

/**
 * 单条删除：二次确认后删除并刷新列表。
 * @param row 目标记录
 */
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
// 详情弹窗显隐
const showDetail = ref(false)
// 当前查看的记录；null 时不渲染描述列表
const detail = ref<WeatherLog | null>(null)

/**
 * 打开详情弹窗：直接复用列表行数据，不再单独请求详情接口。
 * @param row 目标记录
 */
function openDetail(row: WeatherLog) {
  detail.value = row
  showDetail.value = true
}

// 首屏加载列表
onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 / 标题描述在左；右侧为已选数量与批量删除、批量重新生成入口 -->
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

    <!-- 区块：筛选栏 / 关键词输入（300ms 防抖）+ 来源下拉（变更即查询） -->
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

    <!-- 区块：天气记录表格 / remote 分页 + 多选；行点击打开详情，横向滚动宽度 1400 -->
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

    <!-- 区块：详情弹窗 / 两列描述列表展示完整天气指标，底部仅保留关闭按钮 -->
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