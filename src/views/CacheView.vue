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
 *
 * 接口来源：@/api/admin 中的 /admin/cache* 系列接口，实体类型为 CacheItem / FishCacheItem / CacheStats。
 * 关键交互：切换 Tab 加载对应列表；关键字与日期输入 300ms 防抖；筛选变更回到第 1 页重新查询；
 *           批量刷新与批量删除均需二次确认。
 * 限制：批量操作只作用于当前已勾选行（列表刷新后会剔除不在当前页的选中项），前端未限制条数；
 *       天气缓存支持手动刷新，鱼情缓存仅支持删除，删除后由下一次查询重新调用大模型。
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
import BaseChart from '@/components/BaseChart.vue'
import { useAuthStore } from '@/stores/auth'
import { initBarChartOption } from '@/utils/chart/initOptionUtils'

/**
 * 生成文本省略渲染：超出容器宽度时以省略号截断，用于表格长文本列。
 * @param text 需要展示的原始文本
 * @returns 包裹 NEllipsis 的 VNode，最大宽度受单元格约束
 */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage() // 轻提示（成功/警告）
const dialog = useDialog() // 二次确认弹窗
const auth = useAuthStore() // 当前登录管理员信息，用于判断权限
// 是否超级管理员：只有超管可见刷新/删除入口，普通管理员只读
const isSuper = computed(() => auth.role === '超级管理员')

// 当前激活的缓存类型 Tab：weather=天气缓存，fish=鱼情缓存；默认天气，切换时加载对应列表
const cacheType = ref<'weather' | 'fish'>('weather')
// 列表加载态，两个 Tab 共用，请求期间显示表格 loading 与遮罩
const loading = ref(false)
// 统计看板数据（总量/占用空间/命中率/趋势），null 表示尚未加载、不渲染看板
const stats = ref<CacheStats | null>(null)

// ---------- 天气缓存 ----------
// 当前页天气缓存条目，由 api.cacheList 返回
const rows = ref<CacheItem[]>([])
// 已勾选条目的 id 集合；列表刷新后会剔除已不在当前页的 id，避免跨页误操作
const checkedKeys = ref<number[]>([])
// 天气缓存筛选条件：keyword 匹配标准地址或缓存键，status=all|active|expired，
// source=all|qweather|llm|fallback，日期区间为 YYYY-MM-DD 字符串，空串表示不限
const query = reactive({ keyword: '', status: 'all', source: 'all', startDate: '', endDate: '' })
// 分页配置（remote 模式）：页码范围从 1 开始，pageSize 可选 10/20/50；
// 切换页码或页大小时重新请求；总数由接口 total 回填
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

// ---------- 鱼情缓存 ----------
// 当前页鱼情缓存条目，由 api.fishCacheList 返回
const fishRows = ref<FishCacheItem[]>([])
// 鱼情缓存已勾选条目 id 集合（仅用于批量删除）
const fishCheckedKeys = ref<number[]>([])
// 鱼情缓存筛选条件：keyword 同时匹配查询地址、缓存键与参数；source=all|llm|rule
const fishQuery = reactive({ keyword: '', status: 'all', source: 'all', startDate: '', endDate: '' })
// 鱼情缓存分页配置，结构与天气缓存一致，独立维护避免两个列表互相干扰
const fishPagination = reactive({
  page: 1,
  pageSize: 10,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [10, 30, 50],
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

/**
 * 将界面筛选条件转换为接口查询参数，空日期转为 undefined，避免后端解析空字符串失败。
 * @param source 筛选条件对象（keyword/status/source/startDate/endDate）
 * @param page 页码，从 1 开始
 * @param pageSize 每页条数
 * @returns 符合 CacheQuery 的请求参数
 */
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

// 关键字/日期输入的防抖定时器句柄：300ms 内的连续输入只触发最后一次查询
let timer: ReturnType<typeof setTimeout> | undefined
/**
 * 关键字与日期输入的防抖处理：延迟 300ms 后按当前 Tab 回到第 1 页重新加载，
 * 避免逐字符请求接口造成列表抖动与无效查询。
 */
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

/**
 * 加载天气缓存列表（服务端分页）。
 * 成功后同步总数，并把 checkedKeys 限定在当前页返回的 id 内，防止跨页误删。
 * 请求异常由 http 拦截器统一提示，这里仅负责复位 loading。
 */
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

/**
 * 加载鱼情缓存列表（服务端分页），逻辑与天气缓存一致：
 * 回填总数并清理已不在当前页的勾选项。
 */
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

/** 加载统计看板数据（缓存总量、占用空间、命中率、近 7 天趋势）。 */
async function loadStats() {
  stats.value = await api.cacheStats()
}

/** 筛选条件变化后回到第 1 页并按当前 Tab 重新加载，保证分页与筛选结果一致。 */
function resetAndLoad() {
  if (cacheType.value === 'weather') {
    pagination.page = 1
    load()
  } else {
    fishPagination.page = 1
    loadFish()
  }
}

/** Tab 切换时加载对应缓存列表；两个列表各自保留分页与筛选状态。 */
function onTypeChange() {
  if (cacheType.value === 'weather') load()
  else loadFish()
}

// 状态筛选选项：与后端 status 字段取值一一对应（active=有效，expired=已过期）
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '有效', value: 'active' },
  { label: '已过期', value: 'expired' },
]
// 天气缓存来源选项：qweather=和风天气，llm=大模型，fallback=兜底/规则
const sourceOptions = [
  { label: '全部来源', value: 'all' },
  { label: '和风天气', value: 'qweather' },
  { label: '大模型', value: 'llm' },
  { label: '兜底/规则', value: 'fallback' },
]
// 鱼情缓存来源选项：llm=大模型，rule=规则引擎
const fishSourceOptions = [
  { label: '全部来源', value: 'all' },
  { label: '大模型', value: 'llm' },
  { label: '规则引擎', value: 'rule' },
]

/** 来源标识转为中文短标签；未知来源原样返回，避免展示空白。 */
const sourceText = (s: string) =>
  ({ qweather: '和风', llm: '大模型', fallback: '兜底', rule: '规则' } as Record<string, string>)[s] || s

/**
 * 近 7 天缓存命中趋势图配置：查询总量与命中次数双柱对比。
 * 复用后台统一的 ECharts 柱状图基础配置，与数据看板 / 订单页保持相同的坐标轴与提示框样式；
 * stats 未加载时返回空对象，BaseChart 渲染空配置不报错。
 */
const hitChartOption = computed(() => {
  const s = stats.value
  if (!s) return {}
  return initBarChartOption({
    colorList: ['#A9DEE0', '#128E90'],
    xAxis: s.trend.days,
    unit: '次',
    grid: { top: '46px', left: '8px', right: '16px', bottom: '4px', containLabel: true },
    showDataZoom: false,
    dataList: [
      { name: '查询总量', data: s.trend.totals, barMaxWidth: 26, showAreaStyle: true },
      { name: '命中次数', data: s.trend.hits, barMaxWidth: 26, showAreaStyle: true },
    ],
  })
})

// 天气缓存表格列（remote 服务端分页）：长文本统一走 ellipsis，时间/数值使用等宽字体样式
const columns: DataTableColumns<CacheItem> = [
  // 多选列：勾选结果与 checkedKeys 双向绑定，驱动批量刷新/删除
  { type: 'selection' },
  // 缓存键（cacheKey）：标准化地址 + 日期生成的唯一键，超长省略
  {
    title: '缓存键',
    key: 'cacheKey',
    width: 200,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.cacheKey)),
  },
  // 标准地址（region）：标准化后的查询地址，超长省略
  {
    title: '标准地址',
    key: 'region',
    width: 160,
    render: (row) => ellipsis(row.region),
  },
  // 日期（day）：缓存对应的天气日期
  { title: '日期', key: 'day', width: 110, render: (row) => h('span', { class: 'num' }, row.day) },
  // 来源（source）：和风天气用绿色标签，其余来源用默认标签
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
  // 生成时间（createdAt）：缓存写入时间，缺失展示 —
  { title: '生成时间', key: 'createdAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.createdAt ?? '—') },
  // 过期时间（expireAt）：超过该时间即视为过期，缺失展示 —
  { title: '过期时间', key: 'expireAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.expireAt ?? '—') },
  // 状态（status）：active 显示绿色「有效」，其余视为「已过期」并使用警告色
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
  // 大小（sizeKb）：单条缓存占用空间，单位 KB
  { title: '大小', key: 'sizeKb', width: 90, render: (row) => h('span', { class: 'num' }, row.sizeKb + ' KB') },
  // 命中（hitCount）：该缓存被读取的次数，用于评估缓存收益
  { title: '命中', key: 'hitCount', width: 70, render: (row) => h('span', { class: 'num' }, row.hitCount) },
  // 天气摘要（condition/temp）：天气现象与当前温度拼接展示，缺失显示 —
  {
    title: '天气摘要',
    key: 'condition',
    width: 150,
    render: (row) => h('span', { class: 'td-s' }, `${row.condition ?? '—'} ${row.temp != null ? row.temp + '°C' : ''}`),
  },
  // 操作列：详情所有人可见；刷新/删除仅超管，列宽随权限变化（不固定，避免横向滚动时遮挡其他列）
  {
    title: '操作',
    key: 'actions',
    width: isSuper.value ? 180 : 80,
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

// 鱼情缓存表格列：展示分析结果摘要，字段口径与天气表一致
const fishColumns: DataTableColumns<FishCacheItem> = [
  // 多选列：勾选结果与 fishCheckedKeys 双向绑定，驱动批量删除
  { type: 'selection' },
  // 缓存键（cacheKey）：全部查询参数的哈希值，超长省略
  {
    title: '缓存键',
    key: 'cacheKey',
    width: 220,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.cacheKey)),
  },
  // 查询地址（region）：发起鱼情分析时的地区，超长省略
  {
    title: '查询地址',
    key: 'region',
    width: 170,
    render: (row) => ellipsis(row.region),
  },
  // 日期（day）：分析对应的日期，缺失展示 —
  { title: '日期', key: 'day', width: 110, render: (row) => h('span', { class: 'num' }, row.day ?? '—') },
  // 来源（source）：大模型结果用绿色标签，规则引擎用默认标签
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
  // 鱼情评分（score）：0~100 分，缺失展示 —
  {
    title: '鱼情评分',
    key: 'score',
    width: 100,
    render: (row) =>
      h('span', { class: 'num' }, row.score != null ? `${row.score} 分` : '—'),
  },
  // 研判结论（verdict）：如「适宜出钓」等短语结论，缺失展示 —
  {
    title: '研判结论',
    key: 'verdict',
    width: 120,
    render: (row) => h('span', { class: 'td-s' }, row.verdict ?? '—'),
  },
  // 生成时间（createdAt）：缓存写入时间，缺失展示 —
  { title: '生成时间', key: 'createdAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.createdAt ?? '—') },
  // 过期时间（expireAt）：超过该时间即视为过期，缺失展示 —
  { title: '过期时间', key: 'expireAt', width: 150, render: (row) => h('span', { class: 'td-s' }, row.expireAt ?? '—') },
  // 状态（status）：active 显示绿色「有效」，其余视为「已过期」并使用警告色
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
  // 大小（sizeKb）：单条缓存占用空间，单位 KB
  { title: '大小', key: 'sizeKb', width: 90, render: (row) => h('span', { class: 'num' }, row.sizeKb + ' KB') },
  // 命中（hitCount）：该缓存被读取的次数，用于评估缓存收益
  { title: '命中', key: 'hitCount', width: 70, render: (row) => h('span', { class: 'num' }, row.hitCount) },
  // 操作列：详情所有人可见；删除仅超管，列宽随权限变化（不固定，避免横向滚动时遮挡其他列）
  {
    title: '操作',
    key: 'actions',
    width: isSuper.value ? 150 : 80,
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
// 天气缓存详情弹窗显隐
const showDetail = ref(false)
// 天气缓存详情数据：cache 为行信息，payload 为缓存 JSON（weather 字段用于详情展示）
const detail = ref<{ cache: CacheItem; payload: Record<string, unknown> } | null>(null)

/**
 * 打开天气缓存详情：先按 id 拉取完整 payload，成功后再展示弹窗。
 * @param row 列表中的天气缓存行
 */
async function openDetail(row: CacheItem) {
  detail.value = await api.cacheDetail(row.id)
  showDetail.value = true
}

// 从 payload.weather 提取天气字段（天气现象/温度/湿度/风力等），payload 缺失时回退为空对象
const weatherFields = computed(() => {
  const w = (detail.value?.payload?.weather as Record<string, unknown>) || {}
  return w
})

// 鱼情缓存详情弹窗显隐
const showFishDetail = ref(false)
// 鱼情缓存详情数据：cache 行信息、payload 完整分析结果、params 生成缓存时的查询参数
const fishDetail = ref<{
  cache: FishCacheItem
  payload: Record<string, unknown>
  params: Record<string, string>
} | null>(null)

/**
 * 打开鱼情缓存详情：拉取完整分析结果后展示弹窗。
 * @param row 列表中的鱼情缓存行
 */
async function openFishDetail(row: FishCacheItem) {
  fishDetail.value = await api.fishCacheDetail(row.id)
  showFishDetail.value = true
}

// 从 payload.verdict 提取评分/结论/适宜鱼种/依据/建议，payload 缺失时回退为空对象
const fishVerdict = computed(() => {
  const v = (fishDetail.value?.payload?.verdict as Record<string, unknown>) || {}
  return v
})

// ---------- 刷新 / 删除 ----------
/**
 * 刷新单条天气缓存：重新调用上游天气源并覆盖缓存，成功后刷新列表与统计。
 * 失败时由 axios 拦截器统一提示，此处吞掉异常避免重复弹窗。
 * @param row 待刷新的天气缓存行
 */
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

/**
 * 批量刷新天气缓存（仅超管）：未勾选时提示；勾选后二次确认，确认后调用批量接口。
 * 成功后清空勾选并刷新列表与统计。
 */
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

/**
 * 删除单条天气缓存（仅超管）：二次确认后调用删除接口，并同步列表与统计。
 * @param row 待删除的天气缓存行
 */
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

/** 批量删除天气缓存（仅超管）：需先勾选，二次确认后删除并刷新列表与统计。 */
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

/**
 * 删除单条鱼情缓存：删除后下一次相同查询会重新调用大模型生成。
 * @param row 待删除的鱼情缓存行
 */
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

/** 批量删除鱼情缓存：需先勾选，二次确认后删除并刷新列表与统计。 */
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

// 首屏加载天气缓存列表与统计看板（鱼情列表在 Tab 切换时再加载）
onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <div class="page">
    <!-- 区块：页头 / 左侧标题与缓存策略说明，右侧按当前 Tab 展示已选数量与批量操作按钮 / 批量按钮仅超管可见，未勾选时禁用 -->
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

    <!-- 区块：统计看板 / 四列 KPI 卡片（总数量、占用空间、今日命中率、即将过期）/ stats 未加载时不渲染，避免空白占位 -->
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

    <!-- 区块：命中趋势 / 近 7 天柱状图，使用 ECharts 渲染，双柱对比查询总量与命中次数 -->
    <div v-if="stats" class="card card--pad mt12">
      <div class="card__hd" style="padding: 0">
        <span class="card__title">近 7 天缓存命中趋势</span>
        <span class="card__sub">命中次数 / 查询总量</span>
      </div>
      <div class="mt4">
        <BaseChart :option="hitChartOption" height="240px" />
      </div>
    </div>

    <!-- 区块：缓存类型 Tab / weather 与 fish 两个面板，切换时由 onTypeChange 加载对应列表 -->
    <n-tabs v-model:value="cacheType" type="line" class="mt12" @update:value="onTypeChange">
      <!-- 区块：天气缓存面板 / 筛选栏 + 远程分页表格 -->
      <n-tab-pane name="weather" tab="天气数据缓存（和风天气 · 3 小时）">
        <!-- 区块：天气筛选栏 / 关键字、状态、来源、日期区间横向排列 / 文本输入防抖 300ms，下拉变更立即回到第 1 页 -->
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

        <!-- 区块：天气缓存表格 / remote 分页，勾选与批量按钮联动 / max-height 让表体独立纵向滚动，表头常驻；scroll-x 保证所有列可完整横向浏览 -->
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
              max-height="var(--table-max-h)"
              remote
              :bordered="false"
            />
          </n-spin>
        </div>
      </n-tab-pane>

      <!-- 区块：鱼情缓存面板 / 筛选栏 + 远程分页表格，仅支持删除不支持刷新 -->
      <n-tab-pane name="fish" tab="鱼情分析缓存（大模型 · 3 小时）">
        <!-- 区块：鱼情筛选栏 / 关键字额外匹配查询参数 / 与天气面板共用防抖与重置逻辑 -->
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

        <!-- 区块：鱼情缓存表格 / 独立分页与勾选状态 / 列定义见 fishColumns；同样启用表体纵向滚动 -->
        <div class="card">
          <n-spin :show="loading">
            <n-data-table
              :columns="fishColumns"
              :data="fishRows"
              :loading="loading"
              :row-key="(r: FishCacheItem) => r.id"
              v-model:checked-row-keys="fishCheckedKeys"
              :pagination="fishPagination"
              :scroll-x="1580"
              max-height="var(--table-max-h)"
              remote
              :bordered="false"
            />
          </n-spin>
        </div>
      </n-tab-pane>
    </n-tabs>

    <!-- 区块：天气缓存详情弹窗 / 两列描述列表展示缓存元信息与天气字段 / detail 为空时不渲染内容 -->
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

    <!-- 区块：鱼情缓存详情弹窗 / 展示评分、结论、适宜鱼种与出钓建议 / 鱼种需判空后 join 展示 -->
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
