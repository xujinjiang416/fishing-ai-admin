<script setup lang="ts">
import {
  AlertCircleOutline,
  CashOutline,
  CubeOutline,
  DownloadOutline,
  RefreshOutline,
  SearchOutline,
  SettingsOutline,
  TimeOutline,
} from '@vicons/ionicons5'
import dayjs from 'dayjs'
import {
  NButton,
  NTag,
  NDropdown,
  useDialog,
  useMessage,
  type DataTableColumns,
  type DropdownOption,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref, watch } from 'vue'

import { api, type AdminOrder, type AdminOrderDetail, type OrderQuery, type OrderStats } from '@/api/admin'
import { TOKEN_KEY } from '@/api/http'
import BaseChart from '@/components/BaseChart.vue'
import { useAuthStore } from '@/stores/auth'
import { initLineBarChartOption } from '@/utils/chart/initOptionUtils'
import { money, orderStatusTag, payStatusTag } from '@/utils/tags'

const message = useMessage()
const dialog = useDialog()
const auth = useAuthStore()

// ---------- 权限 ----------
// 只读角色仅可查看 / 导出，不能执行订单操作（与后端校验保持一致）
const READONLY_ROLES = ['只读管理员', '观察员', '审计员']
const canOperate = computed(() => !READONLY_ROLES.includes(auth.role))

// ---------- 统计概览 ----------
const stats = ref<OrderStats | null>(null)
const statsLoading = ref(false)

const kpis = computed(() => {
  const s = stats.value
  return [
    { cls: 'kpi--accent', icon: TimeOutline, label: '今日订单量', val: s ? `${s.todayOrders}` : '--', ft: `累计 ${s?.totalOrders ?? '--'} 笔` },
    { cls: 'kpi--success', icon: CashOutline, label: '今日成交金额', val: s ? money(s.todayAmount) : '--', ft: '含已支付 / 已发货 / 已完成' },
    { cls: 'kpi--gold', icon: AlertCircleOutline, label: '待处理订单', val: s ? `${s.pendingCount}` : '--', ft: `待付款 ${s?.counts.unpaid ?? '--'} · 待发货 ${s?.counts.unshipped ?? '--'}` },
    { cls: '', icon: CubeOutline, label: '异常 / 退款中', val: s ? `${s.counts.abnormal} / ${s.counts.refunding}` : '--', ft: '可在筛选器中快速定位' },
  ]
})

const chartOption = computed(() => {
  if (!stats.value) return {}
  return initLineBarChartOption({
    colorList: ['#128E90', '#FF7A3D'],
    xAxis: stats.value.trend.days,
    yAxisConfig: { leftAxis: { unit: '单' }, rightAxis: { unit: '元' } },
    tooltipShowTimeRange: false,
    valueDecimals: 0,
    showDataZoom: false,
    grid: { top: '42px', left: '10px', right: '16px', bottom: '4px', containLabel: true },
    dataList: [
      { name: '订单量', data: stats.value.trend.counts, type: 'bar', yAxisIndex: 0, barMaxWidth: 24, showAreaStyle: true },
      { name: '成交金额', data: stats.value.trend.amounts, type: 'line', yAxisIndex: 1, showAreaStyle: true, showSymbol: true },
    ],
  })
})

// ---------- 筛选 ----------
const query = reactive({
  keyword: '',
  userKeyword: '',
  range: null as [number, number] | null,
  payMethod: 'all',
  status: 'all',
  deliveryType: 'all',
  quick: '',
})

const payMethodOptions = [
  { label: '全部支付方式', value: 'all' },
  { label: '微信支付', value: '微信支付' },
  { label: '余额支付', value: '余额支付' },
  { label: '积分抵扣', value: '积分抵扣' },
]
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待支付', value: '待支付' },
  { label: '待发货', value: '待发货' },
  { label: '已发货', value: '已发货' },
  { label: '已完成', value: '已完成' },
  { label: '已关闭', value: '已关闭' },
  { label: '退款中', value: '退款中' },
  { label: '部分退款', value: '部分退款' },
  { label: '已退款', value: '已退款' },
]
const deliveryOptions = [
  { label: '全部配送方式', value: 'all' },
  { label: '快递', value: '快递' },
  { label: '自提', value: '自提' },
]

const quickOptions = computed(() => {
  const c = stats.value?.counts
  return [
    { key: '', label: '全部订单' },
    { key: 'today', label: '今日订单' },
    { key: 'unpaid', label: '待支付', count: c?.unpaid },
    { key: 'unshipped', label: '待发货', count: c?.unshipped },
    { key: 'shipped', label: '已发货' },
    { key: 'refunding', label: '退款中', count: c?.refunding },
    { key: 'abnormal', label: '异常订单', count: c?.abnormal },
  ]
})

function currentQuery(): OrderQuery {
  return {
    keyword: query.keyword || undefined,
    userKeyword: query.userKeyword || undefined,
    startDate: query.range ? dayjs(query.range[0]).format('YYYY-MM-DD') : undefined,
    endDate: query.range ? dayjs(query.range[1]).format('YYYY-MM-DD') : undefined,
    payMethod: query.payMethod !== 'all' ? query.payMethod : undefined,
    status: query.status !== 'all' ? query.status : undefined,
    deliveryType: query.deliveryType !== 'all' ? query.deliveryType : undefined,
    quick: query.quick || undefined,
  }
}

/** 日期区间变化：只接受 daterange 的 [start, end]，其余情况视为清空 */
function onDateChange(v: number | [number, number] | null) {
  query.range = Array.isArray(v) && v.length === 2 ? [v[0], v[1]] : null
  resetAndLoad()
}

function pickQuick(key: string) {
  query.quick = key
  pagination.page = 1
  load()
}

// ---------- 列表 ----------
const rows = ref<AdminOrder[]>([])
const loading = ref(false)
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

async function load() {
  loading.value = true
  try {
    const r = await api.orders({ ...currentQuery(), page: pagination.page, pageSize: pagination.pageSize })
    rows.value = r.list
    pagination.itemCount = r.total
  } catch {
    /* 拦截器已统一提示 */
  } finally {
    loading.value = false
  }
}

async function loadStats() {
  statsLoading.value = true
  try {
    stats.value = await api.orderStats()
  } catch {
    /* 拦截器已统一提示 */
  } finally {
    statsLoading.value = false
  }
}

function refreshAll() {
  load()
  loadStats()
}

let kwTimer: ReturnType<typeof setTimeout> | undefined
function onKeyword() {
  clearTimeout(kwTimer)
  kwTimer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

function resetAndLoad() {
  pagination.page = 1
  load()
}

function resetFilters() {
  query.keyword = ''
  query.userKeyword = ''
  query.range = null
  query.payMethod = 'all'
  query.status = 'all'
  query.deliveryType = 'all'
  query.quick = ''
  pagination.page = 1
  load()
}

// ---------- 列显示 / 隐藏（自定义列，选择结果持久化） ----------
const COLUMN_DEFS = [
  { key: 'no', label: '订单编号' },
  { key: 'user', label: '下单用户' },
  { key: 'goods', label: '商品信息' },
  { key: 'amount', label: '订单金额' },
  { key: 'usePoints', label: '抵扣积分' },
  { key: 'payMethod', label: '支付方式' },
  { key: 'payStatus', label: '支付状态' },
  { key: 'status', label: '订单状态' },
  { key: 'deliveryType', label: '配送方式' },
  { key: 'receiver', label: '收货信息' },
  { key: 'createdAt', label: '下单时间' },
  { key: 'logistics', label: '物流信息' },
  { key: 'remark', label: '备注 / 异常' },
]
const COLUMN_KEY = 'fishai.orders.columns.v1'
const visibleKeys = ref<string[]>(loadColumnPrefs())

function loadColumnPrefs(): string[] {
  const all = COLUMN_DEFS.map((c) => c.key)
  try {
    const raw = localStorage.getItem(COLUMN_KEY)
    if (!raw) return all
    const parsed = JSON.parse(raw) as string[]
    const valid = parsed.filter((k) => all.includes(k))
    return valid.length ? valid : all
  } catch {
    return all
  }
}
watch(visibleKeys, (v) => {
  try {
    localStorage.setItem(COLUMN_KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
})
const visible = (key: string) => visibleKeys.value.includes(key)

function imgSrc(img: string | null | undefined): string {
  if (!img) return ''
  // 仅展示后端可访问的图片（上传图 / 外链）；小程序内置图片不在此静态目录下
  if (img.startsWith('/static/uploads') || img.startsWith('http')) return img
  return ''
}

const columns = computed<DataTableColumns<AdminOrder>>(() => {
  const cols: DataTableColumns<AdminOrder> = []

  if (visible('no')) {
    cols.push({
      title: '订单编号',
      key: 'no',
      width: 170,
      render: (row) =>
        h('div', { class: 'td-sub' }, [
          h('span', { class: 'num td-t' }, row.no),
          row.abnormal
            ? h('span', { class: 'td-s', style: 'color: var(--c-danger)' }, '异常订单')
            : row.remark
              ? h('span', { class: 'td-s ellipsis' }, row.remark)
              : null,
        ]),
    })
  }
  if (visible('user')) {
    cols.push({
      title: '下单用户',
      key: 'user',
      width: 160,
      render: (row) =>
        h('div', { class: 'td-main' }, [
          h('span', { class: 'avatar avatar--sm' }, row.userAvatar),
          h('div', { class: 'td-sub' }, [
            h('span', { class: 'td-t' }, row.user),
            h('span', { class: 'td-s num' }, row.uid || '—'),
          ]),
        ]),
    })
  }
  if (visible('goods')) {
    cols.push({
      title: '商品信息',
      key: 'goods',
      width: 240,
      render: (row) =>
        h('div', { class: 'td-main' }, [
          imgSrc(row.goodsImg)
            ? h('img', { class: 'td-thumb', src: imgSrc(row.goodsImg) })
            : h('div', { class: 'td-thumb', style: 'display:flex;align-items:center;justify-content:center' }),
          h('div', { class: 'td-sub' }, [
            h('span', { class: 'td-t ellipsis' }, row.goods),
            h('span', { class: 'td-s' }, `× ${row.qty}`),
          ]),
        ]),
    })
  }
  if (visible('amount')) {
    cols.push({
      title: '订单金额',
      key: 'amount',
      width: 120,
      render: (row) =>
        h('div', { class: 'td-sub' }, [
          h('span', { class: 'price-now' }, money(row.amount)),
          h('span', { class: 'td-s' }, `商品 ${money(row.total)}`),
        ]),
    })
  }
  if (visible('usePoints')) {
    cols.push({
      title: '抵扣积分',
      key: 'usePoints',
      width: 100,
      render: (row) => h('span', { class: 'num' }, row.usePoints ? `${row.usePoints}` : '—'),
    })
  }
  if (visible('payMethod')) {
    cols.push({ title: '支付方式', key: 'payMethod', width: 100 })
  }
  if (visible('payStatus')) {
    cols.push({
      title: '支付状态',
      key: 'payStatus',
      width: 100,
      render: (row) =>
        h(
          NTag,
          { size: 'small', round: true, color: payStatusTag(row.payStatus).color, 'text-color': payStatusTag(row.payStatus).textColor },
          { default: () => payStatusTag(row.payStatus).text },
        ),
    })
  }
  if (visible('status')) {
    cols.push({
      title: '订单状态',
      key: 'status',
      width: 100,
      render: (row) =>
        h(
          NTag,
          { size: 'small', round: true, color: orderStatusTag(row.status).color, 'text-color': orderStatusTag(row.status).textColor },
          { default: () => orderStatusTag(row.status).text },
        ),
    })
  }
  if (visible('deliveryType')) {
    cols.push({ title: '配送方式', key: 'deliveryType', width: 90 })
  }
  if (visible('receiver')) {
    cols.push({
      title: '收货信息',
      key: 'receiver',
      width: 200,
      render: (row) =>
        h('div', { class: 'td-sub' }, [
          h('span', { class: 'td-t' }, `${row.receiver || '--'} ${row.receiverPhone || ''}`.trim()),
          h('span', { class: 'td-s ellipsis', title: row.address || '' }, row.address || '--'),
        ]),
    })
  }
  if (visible('createdAt')) {
    cols.push({
      title: '下单时间',
      key: 'createdAt',
      width: 160,
      render: (row) => h('span', { class: 'num td-s', style: 'margin-top:0' }, row.createdAt || '--'),
    })
  }
  if (visible('logistics')) {
    cols.push({
      title: '物流信息',
      key: 'logistics',
      width: 170,
      render: (row) =>
        row.logisticsNo
          ? h('div', { class: 'td-sub' }, [
              h('span', { class: 'td-t' }, row.logisticsCompany || '—'),
              h('span', { class: 'td-s num' }, row.logisticsNo),
            ])
          : h('span', { class: 'td-s', style: 'margin-top:0' }, '—'),
    })
  }
  if (visible('remark')) {
    cols.push({
      title: '备注 / 异常',
      key: 'remark',
      width: 160,
      render: (row) =>
        h('div', { class: 'td-sub' }, [
          row.abnormal
            ? h(
                NTag,
                { size: 'tiny', type: 'error', round: true, style: 'width:fit-content' },
                { default: () => '异常' },
              )
            : null,
          h('span', { class: 'td-s ellipsis', title: row.remark || '' }, row.remark || '—'),
        ]),
    })
  }

  cols.push({
    title: '操作',
    key: 'actions',
    width: 130,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns', onClick: (e: MouseEvent) => e.stopPropagation() }, [
        h(NButton, { size: 'tiny', onClick: () => openDetail(row) }, { default: () => '详情' }),
        h(
          NDropdown,
          {
            trigger: 'click',
            options: actionOptions(row),
            disabled: !canOperate.value,
            onSelect: (key: string | number) => onAction(String(key), row),
          },
          { default: () => h(NButton, { size: 'tiny', quaternary: true, disabled: !canOperate.value }, { default: () => '操作' }) },
        ),
      ]),
  })
  return cols
})

function actionOptions(row: AdminOrder): DropdownOption[] {
  const opts: DropdownOption[] = []
  if (row.status === '待支付') opts.push({ label: '关闭订单', key: 'close' })
  if (row.status === '待发货') opts.push({ label: '发货', key: 'ship' })
  if (row.status === '待发货' || row.status === '已发货') opts.push({ label: '修改收货地址', key: 'address' })
  if (row.status === '已发货') opts.push({ label: '确认完成', key: 'complete' })
  if (!['待支付', '已关闭', '已退款'].includes(row.status)) opts.push({ label: '退款 / 部分退款', key: 'refund' })
  opts.push({ label: '备注 / 异常标记', key: 'remark' })
  opts.push({ label: '删除订单', key: 'delete' })
  return opts
}

// ---------- 详情抽屉 ----------
const drawerShow = ref(false)
const detailNo = ref('')
const detail = ref<AdminOrderDetail | null>(null)
const detailLoading = ref(false)

async function openDetail(row: AdminOrder) {
  drawerShow.value = true
  detailNo.value = row.no
  await loadDetail(row.no)
}

async function loadDetail(no: string) {
  detailLoading.value = true
  try {
    detail.value = await api.orderDetail(no)
  } catch {
    /* 拦截器已统一提示 */
  } finally {
    detailLoading.value = false
  }
}

function detailActions(row: AdminOrder) {
  return actionOptions(row).map((o) => ({
    key: String(o.key),
    label: String(o.label),
    type: (o.key === 'refund' || o.key === 'delete' ? 'error' : o.key === 'ship' ? 'primary' : 'default') as
      | 'primary'
      | 'error'
      | 'default',
  }))
}

function onDetailAction(key: string) {
  if (detail.value) onAction(key, detail.value)
}

// ---------- 操作 ----------
async function afterMutation(no: string, tip: string) {
  message.success(tip)
  await Promise.allSettled([load(), loadStats()])
  if (drawerShow.value && detailNo.value === no) await loadDetail(no)
}

function onAction(key: string, row: AdminOrder) {
  if (!canOperate.value) {
    message.warning('当前角色无订单操作权限')
    return
  }
  switch (key) {
    case 'close':
      dialog.warning({
        title: '关闭订单',
        content: `确认关闭订单 ${row.no}？关闭后用户将无法继续支付。`,
        positiveText: '确认关闭',
        negativeText: '取消',
        onPositiveClick: async () => {
          try {
            await api.closeOrder(row.no)
            await afterMutation(row.no, '订单已关闭')
          } catch {
            /* 拦截器已提示 */
          }
        },
      })
      break
    case 'ship':
      openShip(row)
      break
    case 'address':
      openAddress(row)
      break
    case 'remark':
      openRemark(row)
      break
    case 'refund':
      openRefund(row)
      break
    case 'complete':
      dialog.success({
        title: '确认完成',
        content: `确认订单 ${row.no} 已完成？完成后不可再修改物流信息。`,
        positiveText: '确认完成',
        negativeText: '取消',
        onPositiveClick: async () => {
          try {
            await api.completeOrder(row.no)
            await afterMutation(row.no, '订单已完成')
          } catch {
            /* 拦截器已提示 */
          }
        },
      })
      break
    case 'delete':
      dialog.error({
        title: '删除订单',
        content: `确认删除订单 ${row.no}（${row.status}）？删除后不可恢复，且不会自动退款，请先完成退款流程。`,
        positiveText: '确认删除',
        negativeText: '取消',
        onPositiveClick: async () => {
          try {
            await api.deleteOrder(row.no)
            message.success('订单已删除')
            if (drawerShow.value && detailNo.value === row.no) {
              drawerShow.value = false
              detailNo.value = ''
              detail.value = null
            }
            await Promise.allSettled([load(), loadStats()])
          } catch {
            /* 拦截器已提示 */
          }
        },
      })
      break
  }
}

// 发货
const ship = reactive({
  show: false,
  no: '',
  company: '顺丰速运',
  logisticsNo: '',
  deliveryType: '快递',
  saving: false,
})
const expressOptions = ['顺丰速运', '中通快递', '圆通速递', '韵达快递', '京东物流', '邮政EMS', '极兔速递'].map(
  (v) => ({ label: v, value: v }),
)

function openShip(row: AdminOrder) {
  ship.no = row.no
  ship.company = row.logisticsCompany || '顺丰速运'
  ship.logisticsNo = row.logisticsNo || ''
  ship.deliveryType = row.deliveryType === '自提' ? '自提' : '快递'
  ship.show = true
}

async function submitShip() {
  if (!ship.company.trim() || !ship.logisticsNo.trim()) {
    message.warning('请填写物流公司与运单号')
    return
  }
  ship.saving = true
  try {
    await api.shipOrder(ship.no, {
      logisticsCompany: ship.company.trim(),
      logisticsNo: ship.logisticsNo.trim(),
      deliveryType: ship.deliveryType,
    })
    ship.show = false
    await afterMutation(ship.no, '发货成功')
  } catch {
    /* 拦截器已提示 */
  } finally {
    ship.saving = false
  }
}

// 修改地址
const addr = reactive({ show: false, no: '', receiver: '', phone: '', address: '', saving: false })

function openAddress(row: AdminOrder) {
  addr.no = row.no
  addr.receiver = row.receiver || ''
  addr.phone = row.receiverPhone || ''
  addr.address = row.address || ''
  addr.show = true
}

async function submitAddress() {
  if (!addr.receiver.trim() || !addr.phone.trim() || !addr.address.trim()) {
    message.warning('请完整填写收货人、电话与地址')
    return
  }
  addr.saving = true
  try {
    await api.updateOrderAddress(addr.no, {
      receiver: addr.receiver.trim(),
      receiverPhone: addr.phone.trim(),
      address: addr.address.trim(),
    })
    addr.show = false
    await afterMutation(addr.no, '收货地址已更新')
  } catch {
    /* 拦截器已提示 */
  } finally {
    addr.saving = false
  }
}

// 备注 / 异常
const remark = reactive({ show: false, no: '', text: '', abnormal: false, saving: false })

function openRemark(row: AdminOrder) {
  remark.no = row.no
  remark.text = row.remark || ''
  remark.abnormal = !!row.abnormal
  remark.show = true
}

async function submitRemark() {
  remark.saving = true
  try {
    await api.remarkOrder(remark.no, { remark: remark.text, abnormal: remark.abnormal })
    remark.show = false
    await afterMutation(remark.no, '订单备注已保存')
  } catch {
    /* 拦截器已提示 */
  } finally {
    remark.saving = false
  }
}

// 退款
const refund = reactive({ show: false, no: '', amount: 0, max: 0, reason: '', approve: true, saving: false })

function openRefund(row: AdminOrder) {
  refund.no = row.no
  refund.max = row.amount
  refund.amount = row.amount
  refund.reason = row.refundReason || ''
  refund.approve = true
  refund.show = true
}

async function submitRefund() {
  if (refund.approve && (!refund.amount || refund.amount <= 0)) {
    message.warning('请输入退款金额')
    return
  }
  if (refund.approve && refund.amount > refund.max) {
    message.warning('退款金额不能超过实付金额')
    return
  }
  refund.saving = true
  try {
    await api.refundOrder(refund.no, {
      amount: refund.approve ? refund.amount : 0,
      reason: refund.reason,
      approve: refund.approve,
    })
    refund.show = false
    await afterMutation(refund.no, refund.approve ? '退款已处理' : '退款申请已驳回')
  } catch {
    /* 拦截器已提示 */
  } finally {
    refund.saving = false
  }
}

// ---------- 导出 ----------
const EXPORT_FIELDS: { value: string; label: string }[] = [
  { value: 'no', label: '订单编号' },
  { value: 'user', label: '下单用户' },
  { value: 'uid', label: '用户ID' },
  { value: 'userPhone', label: '用户手机号' },
  { value: 'goods', label: '商品' },
  { value: 'qty', label: '数量' },
  { value: 'total', label: '商品金额' },
  { value: 'usePoints', label: '抵扣积分' },
  { value: 'amount', label: '实付金额' },
  { value: 'payMethod', label: '支付方式' },
  { value: 'payStatus', label: '支付状态' },
  { value: 'status', label: '订单状态' },
  { value: 'deliveryType', label: '配送方式' },
  { value: 'receiver', label: '收货人' },
  { value: 'receiverPhone', label: '收货电话' },
  { value: 'address', label: '收货地址' },
  { value: 'logisticsCompany', label: '物流公司' },
  { value: 'logisticsNo', label: '物流单号' },
  { value: 'refundAmount', label: '退款金额' },
  { value: 'remark', label: '备注' },
  { value: 'createdAt', label: '下单时间' },
  { value: 'paidAt', label: '支付时间' },
  { value: 'shippedAt', label: '发货时间' },
]
const exportShow = ref(false)
const exporting = ref(false)
const exportFields = ref<string[]>(EXPORT_FIELDS.map((f) => f.value))

async function doExport() {
  if (!exportFields.value.length) {
    message.warning('请至少选择一个导出字段')
    return
  }
  exporting.value = true
  try {
    const params = new URLSearchParams()
    const q = currentQuery()
    ;(Object.keys(q) as (keyof OrderQuery)[]).forEach((k) => {
      const v = q[k]
      if (v !== undefined && v !== '') params.set(k, String(v))
    })
    params.set('fields', exportFields.value.join(','))
    const token = localStorage.getItem(TOKEN_KEY) || ''
    const res = await fetch(`/api/admin/orders/export?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) throw new Error('export failed')
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `订单导出_${dayjs().format('YYYYMMDD_HHmmss')}.csv`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
    exportShow.value = false
    message.success(`已按当前筛选条件导出 ${exportFields.value.length} 个字段（Excel 可直接打开）`)
  } catch {
    message.error('导出失败，请稍后重试')
  } finally {
    exporting.value = false
  }
}

function selectAllExport() {
  exportFields.value = EXPORT_FIELDS.map((f) => f.value)
}
function clearExport() {
  exportFields.value = []
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
        <h2 class="pagehead__title">订单管理</h2>
        <p class="pagehead__desc">
          全平台订单统一管控：支持组合筛选、详情全链路追溯、发货 / 退款 / 备注等操作与自定义字段导出。
        </p>
      </div>
      <div class="pagehead__actions">
        <n-button ghost :loading="statsLoading" @click="loadStats">
          <template #icon><n-icon :component="RefreshOutline" /></template>
          刷新统计
        </n-button>
        <n-button type="primary" @click="exportShow = true">
          <template #icon><n-icon :component="DownloadOutline" /></template>
          导出订单
        </n-button>
      </div>
    </div>

    <!-- 统计概览 -->
    <div class="kpi-grid">
      <div v-for="k in kpis" :key="k.label" class="kpi" :class="k.cls">
        <div class="kpi__label">
          <n-icon :component="k.icon" :size="15" />
          {{ k.label }}
        </div>
        <div class="kpi__val">{{ k.val }}</div>
        <div class="kpi__ft">{{ k.ft }}</div>
      </div>
    </div>

    <div class="card orders-chart">
      <div class="card__hd">
        <span class="card__title">近 7 天订单趋势</span>
        <span class="card__sub">订单量（单） / 成交金额（元）</span>
      </div>
      <div style="padding: 4px 16px 12px">
        <BaseChart :option="chartOption" height="210px" />
      </div>
    </div>

    <!-- 快捷筛选 -->
    <div class="order-quick">
      <button
        v-for="q in quickOptions"
        :key="q.key"
        class="order-quick__btn"
        :class="{ 'is-active': query.quick === q.key }"
        @click="pickQuick(q.key)"
      >
        {{ q.label }}
        <span v-if="q.count !== undefined" class="order-quick__badge">{{ q.count }}</span>
      </button>
    </div>

    <!-- 组合筛选 -->
    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="订单编号 / 商品名称"
        clearable
        style="width: 200px"
        @update:value="onKeyword"
      >
        <template #prefix><n-icon :component="SearchOutline" /></template>
      </n-input>
      <n-input
        v-model:value="query.userKeyword"
        placeholder="用户昵称 / UID / 手机号"
        clearable
        style="width: 200px"
        @update:value="onKeyword"
      />
      <n-date-picker
        v-model:value="query.range"
        type="daterange"
        clearable
        style="width: 250px"
        start-placeholder="开始日期"
        end-placeholder="结束日期"
        @update:value="onDateChange"
      />
      <n-select v-model:value="query.payMethod" :options="payMethodOptions" style="width: 140px" @update:value="resetAndLoad" />
      <n-select v-model:value="query.status" :options="statusOptions" style="width: 130px" @update:value="resetAndLoad" />
      <n-select v-model:value="query.deliveryType" :options="deliveryOptions" style="width: 140px" @update:value="resetAndLoad" />
      <n-button quaternary @click="resetFilters">重置</n-button>
      <span class="toolbar__spacer" />
      <n-popover trigger="click" placement="bottom-end">
        <template #trigger>
          <n-button>
            <template #icon><n-icon :component="SettingsOutline" /></template>
            列设置
          </n-button>
        </template>
        <n-checkbox-group v-model:value="visibleKeys">
          <div class="col-pref">
            <n-checkbox v-for="c in COLUMN_DEFS" :key="c.key" :value="c.key">{{ c.label }}</n-checkbox>
          </div>
        </n-checkbox-group>
      </n-popover>
      <n-button :loading="loading" @click="refreshAll">
        <template #icon><n-icon :component="RefreshOutline" /></template>
        刷新
      </n-button>
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: AdminOrder) => r.no"
        :pagination="pagination"
        :row-props="(r: AdminOrder) => ({ style: 'cursor: pointer', onClick: () => openDetail(r) })"
        :scroll-x="1560"
        remote
        :bordered="false"
      />
    </div>

    <!-- 订单详情 -->
    <n-drawer v-model:show="drawerShow" :width="760" placement="right">
      <n-drawer-content title="订单详情" closable>
        <n-skeleton v-if="detailLoading" :repeat="8" text />
        <template v-else-if="detail">
          <div class="od-head">
            <div>
              <div class="od-no num">{{ detail.no }}</div>
              <div class="od-tags">
                <n-tag size="small" round :color="orderStatusTag(detail.status).color" :text-color="orderStatusTag(detail.status).textColor">
                  {{ orderStatusTag(detail.status).text }}
                </n-tag>
                <n-tag size="small" round :color="payStatusTag(detail.payStatus).color" :text-color="payStatusTag(detail.payStatus).textColor">
                  {{ payStatusTag(detail.payStatus).text }}
                </n-tag>
                <n-tag v-if="detail.abnormal" size="small" round type="error">异常订单</n-tag>
                <n-tag v-if="detail.refundStatus === 'rejected'" size="small" round>退款已驳回</n-tag>
              </div>
            </div>
            <div class="od-amount">
              <span>实付</span>
              <b>{{ money(detail.amount) }}</b>
            </div>
          </div>

          <div class="od-title">订单信息</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="订单编号">{{ detail.no }}</n-descriptions-item>
            <n-descriptions-item label="下单时间">{{ detail.createdAt || '--' }}</n-descriptions-item>
            <n-descriptions-item label="支付方式">{{ detail.payMethod || '--' }}</n-descriptions-item>
            <n-descriptions-item label="支付时间">{{ detail.paidAt || '--' }}</n-descriptions-item>
            <n-descriptions-item label="配送方式">{{ detail.deliveryType || '--' }}</n-descriptions-item>
            <n-descriptions-item label="发货时间">{{ detail.shippedAt || '--' }}</n-descriptions-item>
            <n-descriptions-item label="完成时间">{{ detail.completedAt || '--' }}</n-descriptions-item>
            <n-descriptions-item label="关闭时间">{{ detail.closedAt || '--' }}</n-descriptions-item>
          </n-descriptions>

          <div class="od-title">用户与收货信息</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="下单用户">
              {{ detail.userInfo.nickname }}（{{ detail.userInfo.uid || '--' }}）
            </n-descriptions-item>
            <n-descriptions-item label="用户手机号">{{ detail.userInfo.phone || '--' }}</n-descriptions-item>
            <n-descriptions-item label="收货人">{{ detail.receiver || '--' }}</n-descriptions-item>
            <n-descriptions-item label="收货电话">{{ detail.receiverPhone || '--' }}</n-descriptions-item>
            <n-descriptions-item label="收货地址" :span="2">{{ detail.address || '--' }}</n-descriptions-item>
          </n-descriptions>

          <div class="od-title">商品明细</div>
          <n-table size="small" :bordered="false">
            <thead>
              <tr>
                <th>商品</th>
                <th>规格</th>
                <th>单价</th>
                <th>数量</th>
                <th>小计</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <div class="td-main">
                    <img v-if="imgSrc(detail.goodsDetail.img)" class="td-thumb" :src="imgSrc(detail.goodsDetail.img)" alt="" />
                    <div class="td-sub">
                      <span class="td-t">{{ detail.goodsDetail.name }}</span>
                      <span class="td-s num">{{ detail.goodsDetail.id || '--' }}</span>
                    </div>
                  </div>
                </td>
                <td class="td-s">{{ detail.goodsDetail.spec || '--' }}</td>
                <td class="price-now">{{ money(detail.goodsDetail.price) }}</td>
                <td class="num">{{ detail.goodsDetail.qty }}</td>
                <td class="price-now">{{ money(detail.goodsDetail.subtotal) }}</td>
              </tr>
            </tbody>
          </n-table>

          <div class="od-title">优惠抵扣与金额明细</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="商品金额">{{ money(detail.total) }}</n-descriptions-item>
            <n-descriptions-item label="积分抵扣">
              {{ detail.usePoints ? `${detail.usePoints} 积分（约 -${money(detail.total - detail.amount)}）` : '未使用' }}
            </n-descriptions-item>
            <n-descriptions-item label="实付金额">{{ money(detail.amount) }}</n-descriptions-item>
            <n-descriptions-item label="退款金额">
              {{ detail.refundAmount ? money(detail.refundAmount) : '--' }}
            </n-descriptions-item>
            <n-descriptions-item v-if="detail.refundReason" label="退款原因" :span="2">
              {{ detail.refundReason }}
            </n-descriptions-item>
          </n-descriptions>

          <div class="od-title">支付记录与物流跟踪</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="支付方式">{{ detail.payMethod || '--' }}</n-descriptions-item>
            <n-descriptions-item label="支付状态">{{ detail.payStatus || '--' }}</n-descriptions-item>
            <n-descriptions-item label="支付时间">{{ detail.paidAt || '--' }}</n-descriptions-item>
            <n-descriptions-item label="物流公司">{{ detail.logisticsCompany || '--' }}</n-descriptions-item>
            <n-descriptions-item label="物流单号" :span="2">{{ detail.logisticsNo || '--' }}</n-descriptions-item>
            <n-descriptions-item label="运营备注" :span="2">{{ detail.remark || '--' }}</n-descriptions-item>
          </n-descriptions>

          <div class="od-title">订单操作日志</div>
          <n-timeline v-if="detail.logs.length">
            <n-timeline-item
              v-for="(l, i) in detail.logs"
              :key="i"
              :type="l.action === 'close' || l.action === 'refund' ? 'error' : l.action === 'complete' ? 'success' : 'default'"
              :title="l.detail"
              :content="`${l.operator} · ${l.createdAt}`"
            />
          </n-timeline>
          <div v-else class="empty">暂无操作日志</div>
        </template>

        <template v-if="detail && canOperate" #footer>
          <div class="od-actions">
            <n-button
              v-for="a in detailActions(detail)"
              :key="a.key"
              :type="a.type"
              size="small"
              @click="onDetailAction(a.key)"
            >
              {{ a.label }}
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 发货 -->
    <n-modal v-model:show="ship.show" preset="card" title="订单发货" style="width: 520px" :mask-closable="false">
      <n-form label-placement="top">
        <n-form-item label="订单编号">
          <span class="num">{{ ship.no }}</span>
        </n-form-item>
        <n-form-item label="配送方式">
          <n-select v-model:value="ship.deliveryType" :options="deliveryOptions.slice(1)" />
        </n-form-item>
        <n-form-item label="物流公司" required>
          <n-select v-model:value="ship.company" :options="expressOptions" filterable tag placeholder="选择或输入物流公司" />
        </n-form-item>
        <n-form-item label="物流单号" required>
          <n-input v-model:value="ship.logisticsNo" placeholder="请输入运单号" maxlength="64" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="ship.show = false">取消</n-button>
          <n-button type="primary" :loading="ship.saving" @click="submitShip">确认发货</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 修改收货地址 -->
    <n-modal v-model:show="addr.show" preset="card" title="修改收货地址" style="width: 560px" :mask-closable="false">
      <n-form label-placement="top">
        <n-form-item label="订单编号">
          <span class="num">{{ addr.no }}</span>
        </n-form-item>
        <div class="form-grid">
          <n-form-item label="收货人" required>
            <n-input v-model:value="addr.receiver" placeholder="请输入收货人" maxlength="32" />
          </n-form-item>
          <n-form-item label="联系电话" required>
            <n-input v-model:value="addr.phone" placeholder="请输入联系电话" maxlength="32" />
          </n-form-item>
        </div>
        <n-form-item label="收货地址" required>
          <n-input v-model:value="addr.address" type="textarea" :rows="3" placeholder="请输入完整收货地址" maxlength="255" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="addr.show = false">取消</n-button>
          <n-button type="primary" :loading="addr.saving" @click="submitAddress">保存</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 备注 / 异常 -->
    <n-modal v-model:show="remark.show" preset="card" title="订单备注与异常标记" style="width: 520px" :mask-closable="false">
      <n-form label-placement="top">
        <n-form-item label="订单编号">
          <span class="num">{{ remark.no }}</span>
        </n-form-item>
        <n-form-item label="运营备注">
          <n-input v-model:value="remark.text" type="textarea" :rows="4" placeholder="记录跟进情况、用户沟通结果等" maxlength="300" show-count />
        </n-form-item>
        <n-form-item label="标记为异常订单">
          <n-switch v-model:value="remark.abnormal" />
          <span class="td-s" style="margin-left: 10px">标记后可在「异常订单」快捷筛选中定位</span>
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="remark.show = false">取消</n-button>
          <n-button type="primary" :loading="remark.saving" @click="submitRemark">保存</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 退款 -->
    <n-modal v-model:show="refund.show" preset="card" title="退款 / 部分退款处理" style="width: 560px" :mask-closable="false">
      <n-form label-placement="top">
        <n-form-item label="订单编号">
          <span class="num">{{ refund.no }}（实付 {{ money(refund.max) }}）</span>
        </n-form-item>
        <n-form-item label="处理结果">
          <n-radio-group v-model:value="refund.approve">
            <n-space>
              <n-radio :value="true">通过退款</n-radio>
              <n-radio :value="false">驳回申请</n-radio>
            </n-space>
          </n-radio-group>
        </n-form-item>
        <n-form-item v-if="refund.approve" label="退款金额（元）" required>
          <n-input-number v-model:value="refund.amount" :min="0" :max="refund.max" :precision="2" style="width: 200px" />
          <span class="td-s" style="margin-left: 10px">等于实付金额为全额退款，否则为部分退款</span>
        </n-form-item>
        <n-form-item label="退款 / 驳回原因">
          <n-input v-model:value="refund.reason" type="textarea" :rows="3" placeholder="请填写处理原因" maxlength="200" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="refund.show = false">取消</n-button>
          <n-button :type="refund.approve ? 'error' : 'primary'" :loading="refund.saving" @click="submitRefund">
            {{ refund.approve ? '确认退款' : '确认驳回' }}
          </n-button>
        </div>
      </template>
    </n-modal>

    <!-- 导出 -->
    <n-modal v-model:show="exportShow" preset="card" title="导出订单" style="width: 620px" :mask-closable="false">
      <p class="td-s" style="margin: 0 0 12px">
        将按当前筛选条件导出（最多 10000 条），文件为 Excel 可直接打开的 CSV（含 UTF-8 BOM）。
      </p>
      <div class="export-head">
        <span class="td-t">选择导出字段</span>
        <div class="rowbtns">
          <n-button size="tiny" quaternary @click="selectAllExport">全选</n-button>
          <n-button size="tiny" quaternary @click="clearExport">清空</n-button>
        </div>
      </div>
      <n-checkbox-group v-model:value="exportFields">
        <div class="export-grid">
          <n-checkbox v-for="f in EXPORT_FIELDS" :key="f.value" :value="f.value">{{ f.label }}</n-checkbox>
        </div>
      </n-checkbox-group>
      <template #footer>
        <div class="modal-foot">
          <n-button @click="exportShow = false">取消</n-button>
          <n-button type="primary" :loading="exporting" :disabled="!exportFields.length" @click="doExport">
            导出 {{ exportFields.length }} 个字段
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.orders-chart {
  margin-bottom: 14px;
}

.order-quick {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 14px;
}

.order-quick__btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  color: var(--c-ink-2);
  background: var(--c-surface);
  border: 1px solid var(--c-line);
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.14s ease-out;
}

.order-quick__btn:hover {
  border-color: var(--c-primary);
  color: var(--c-primary-d);
}

.order-quick__btn.is-active {
  background: var(--c-primary-l);
  border-color: var(--c-primary);
  color: var(--c-primary-d);
  font-weight: 600;
}

.order-quick__badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--c-accent);
  color: #fff;
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

.col-pref {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 18px;
  padding: 4px 2px;
}

.ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.od-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 16px;
  border-radius: 12px;
  background: var(--c-surface-2);
  border: 1px solid var(--c-line-soft);
}

.od-no {
  font-size: 16px;
  font-weight: 600;
  color: var(--c-ink);
}

.od-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.od-amount {
  text-align: right;
  flex-shrink: 0;
}

.od-amount span {
  display: block;
  font-size: 12px;
  color: var(--c-ink-4);
}

.od-amount b {
  font-family: var(--font-display);
  font-size: 26px;
  color: var(--c-accent-d);
}

.od-title {
  margin: 20px 0 10px;
  font-size: 14px;
  font-weight: 600;
  color: var(--c-ink);
}

.od-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.modal-foot {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.export-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.export-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px 12px;
}
</style>
