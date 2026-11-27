<script setup lang="ts">
/** 退款申请管理：查看质量凭证并审核用户已完成订单的退款申请。 */
import { CheckmarkCircleOutline, CloseCircleOutline, SearchOutline } from '@vicons/ionicons5'
import {
  NButton,
  NEllipsis,
  NIcon,
  NImage,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref } from 'vue'

import { api, type RefundRequestItem } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

type TagType = 'default' | 'success' | 'warning' | 'error' | 'info'

const STATUS_META: Record<string, { label: string; type: TagType }> = {
  pending: { label: '待审核', type: 'warning' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已驳回', type: 'error' },
}
const tabs = [
  { label: '待审核', value: 'pending' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '全部', value: 'all' },
]
const READONLY_ROLES = ['只读管理员', '观察员', '审计员']

const message = useMessage()
const dialog = useDialog()
const auth = useAuthStore()
const canOperate = computed(() => !READONLY_ROLES.includes(auth.role))
const tab = ref('pending')
const query = reactive({ keyword: '' })
const rows = ref<RefundRequestItem[]>([])
const loading = ref(false)
const drawerShow = ref(false)
const detailLoading = ref(false)
const detail = ref<RefundRequestItem | null>(null)
const reviewNote = ref('')
const refundAmount = ref(0)
const acting = ref(false)
let timer: ReturnType<typeof setTimeout> | undefined

const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
  onChange: (page: number) => {
    pagination.page = page
    load()
  },
  onUpdatePageSize: (pageSize: number) => {
    pagination.pageSize = pageSize
    pagination.page = 1
    load()
  },
})

function statusMeta(status: string) {
  return STATUS_META[status] ?? { label: status, type: 'default' as TagType }
}

function statusTag(status: string) {
  const meta = statusMeta(status)
  return h(NTag, { size: 'small', round: true, bordered: false, type: meta.type }, { default: () => meta.label })
}

const columns: DataTableColumns<RefundRequestItem> = [
  {
    title: '申请 / 订单', key: 'requestNo', width: 200,
    render: (row) => h('div', { class: 'td-sub' }, [
      h('span', { class: 'td-t num' }, row.requestNo),
      h('span', { class: 'td-s num' }, row.orderNo),
    ]),
  },
  {
    title: '商品 / 用户', key: 'goods', width: 190,
    render: (row) => h('div', { class: 'td-sub' }, [
      h(NEllipsis, null, { default: () => `${row.order.goods} × ${row.order.qty}` }),
      h('span', { class: 'td-s' }, `${row.user.nickname} · ${row.user.phone}`),
    ]),
  },
  {
    title: '退款原因', key: 'reason', minWidth: 220,
    render: (row) => h(NEllipsis, { lineClamp: 2 }, { default: () => row.reason }),
  },
  { title: '凭证', key: 'images', width: 70, render: (row) => `${row.images.length} 张` },
  {
    title: '实付金额', key: 'amount', width: 100,
    render: (row) => h('span', { class: 'num' }, `¥${row.order.amount.toFixed(2)}`),
  },
  { title: '状态', key: 'status', width: 90, render: (row) => statusTag(row.status) },
  { title: '申请时间', key: 'requestedAt', width: 150 },
  {
    title: '操作', key: 'actions', width: 90, fixed: 'right',
    render: (row) => h(NButton, {
      size: 'small', type: 'primary', quaternary: true,
      onClick: (event: Event) => { event.stopPropagation(); openDetail(row) },
    }, { default: () => row.canReview ? '审核' : '查看' }),
  },
]

async function load() {
  loading.value = true
  try {
    const result = await api.refundRequests({
      status: tab.value === 'all' ? undefined : tab.value,
      keyword: query.keyword.trim() || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = result.list
    pagination.itemCount = result.total
  } finally {
    loading.value = false
  }
}

function onFilterInput() {
  clearTimeout(timer)
  timer = setTimeout(() => { pagination.page = 1; load() }, 300)
}

function onTabChange() {
  pagination.page = 1
  load()
}

async function openDetail(row: RefundRequestItem) {
  drawerShow.value = true
  detailLoading.value = true
  detail.value = null
  reviewNote.value = ''
  refundAmount.value = row.order.amount
  try {
    detail.value = await api.refundRequestDetail(row.requestNo)
    reviewNote.value = detail.value.reviewNote
    refundAmount.value = detail.value.order.amount
  } finally {
    detailLoading.value = false
  }
}

function decide(approve: boolean) {
  const current = detail.value
  if (!current || !current.canReview) return
  if (!canOperate.value) { message.error('当前角色仅可查看，不能审核退款申请'); return }
  const note = reviewNote.value.trim()
  const amount = Number(refundAmount.value || 0)
  if (!approve && !note) { message.warning('驳回申请时必须填写审核备注'); return }
  const invalidAmount = current.order.amount === 0
    ? amount !== 0
    : amount <= 0 || amount > current.order.amount
  if (approve && invalidAmount) {
    message.warning(current.order.amount === 0 ? '该订单实付为 0 元，退款金额须为 0 元' : `退款金额应大于 0 且不超过 ¥${current.order.amount.toFixed(2)}`)
    return
  }
  dialog.warning({
    title: approve ? '确认审核通过' : '确认驳回申请',
    content: approve
      ? `将为订单 ${current.orderNo} 退款 ¥${amount.toFixed(2)}，结果会同步给用户。`
      : '驳回后订单恢复为已完成，审核结果和备注会同步给用户。',
    positiveText: approve ? '确认通过' : '确认驳回',
    negativeText: '取消',
    onPositiveClick: async () => {
      acting.value = true
      try {
        await api.refundOrder(current.orderNo, { amount: approve ? amount : 0, reason: note, approve })
        message.success(approve ? '退款申请已通过' : '退款申请已驳回')
        drawerShow.value = false
        await load()
      } finally {
        acting.value = false
      }
    },
  })
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="page-head">
      <div>
        <h2>退款申请</h2>
        <p>审核已完成订单七天内提交的质量问题退款，凭证与结果全程留痕。</p>
      </div>
      <n-button :loading="loading" @click="load">刷新</n-button>
    </div>

    <div class="card filter-card">
      <n-tabs v-model:value="tab" type="line" @update:value="onTabChange">
        <n-tab v-for="item in tabs" :key="item.value" :name="item.value" :tab="item.label" />
      </n-tabs>
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索申请编号 / 订单号 / 商品 / 用户"
        clearable
        style="width: 320px"
        @update:value="onFilterInput"
      >
        <template #prefix><n-icon :component="SearchOutline" /></template>
      </n-input>
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(row: RefundRequestItem) => row.requestNo"
        :pagination="pagination"
        :scroll-x="1240"
        :row-props="(row: RefundRequestItem) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
        max-height="var(--table-max-h)"
        remote
        :bordered="false"
      />
    </div>

    <n-drawer v-model:show="drawerShow" :width="720" placement="right">
      <n-drawer-content title="退款申请详情" closable>
        <n-skeleton v-if="detailLoading" :repeat="10" text />
        <template v-else-if="detail">
          <div class="rf-head">
            <div>
              <div class="rf-no num">{{ detail.requestNo }}</div>
              <div class="td-s">订单 {{ detail.orderNo }}</div>
            </div>
            <n-tag size="small" round :bordered="false" :type="statusMeta(detail.status).type">
              {{ statusMeta(detail.status).label }}
            </n-tag>
          </div>

          <n-alert type="warning" :show-icon="true" style="margin-top: 16px">
            非质量问题不支持退款。请结合退款原因与图片凭证核实商品质量问题。
          </n-alert>

          <div class="rf-title">申请信息</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="申请时间">{{ detail.requestedAt }}</n-descriptions-item>
            <n-descriptions-item label="审核时间">{{ detail.reviewedAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="退款原因" :span="2">
              <span class="rf-reason">{{ detail.reason }}</span>
            </n-descriptions-item>
          </n-descriptions>

          <div class="rf-title">质量问题图片（{{ detail.images.length }} 张）</div>
          <n-image-group>
            <div class="rf-images">
              <n-image
                v-for="url in detail.images"
                :key="url"
                :src="url"
                width="112"
                height="112"
                object-fit="cover"
                style="border-radius: 8px"
              />
            </div>
          </n-image-group>

          <div class="rf-title">关联订单</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="商品" :span="2">{{ detail.order.goods }} × {{ detail.order.qty }}</n-descriptions-item>
            <n-descriptions-item label="订单状态">{{ detail.order.status }}</n-descriptions-item>
            <n-descriptions-item label="实付金额">¥{{ detail.order.amount.toFixed(2) }}</n-descriptions-item>
            <n-descriptions-item label="完成时间">{{ detail.order.completedAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="支付方式">{{ detail.order.payMethod }}</n-descriptions-item>
            <n-descriptions-item label="收货人">{{ detail.order.receiver }} · {{ detail.order.receiverPhone }}</n-descriptions-item>
            <n-descriptions-item label="配送方式">{{ detail.order.deliveryType }}</n-descriptions-item>
            <n-descriptions-item label="收货地址" :span="2">{{ detail.order.address || '—' }}</n-descriptions-item>
          </n-descriptions>

          <div class="rf-title">申请用户</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="昵称">{{ detail.user.nickname }}</n-descriptions-item>
            <n-descriptions-item label="用户名">{{ detail.user.username || '—' }}</n-descriptions-item>
            <n-descriptions-item label="UID">{{ detail.user.uid }}</n-descriptions-item>
            <n-descriptions-item label="手机号">{{ detail.user.phone }}</n-descriptions-item>
          </n-descriptions>

          <template v-if="detail.canReview">
            <div class="rf-title">审核操作</div>
            <n-form label-placement="top">
              <n-form-item label="退款金额（审核通过时生效）">
                <n-input-number
                  v-model:value="refundAmount"
                  :min="detail.order.amount === 0 ? 0 : 0.01"
                  :max="detail.order.amount"
                  :precision="2"
                  :disabled="!canOperate"
                  style="width: 100%"
                >
                  <template #prefix>¥</template>
                </n-input-number>
              </n-form-item>
              <n-form-item label="审核备注（驳回时必填）">
                <n-input
                  v-model:value="reviewNote"
                  type="textarea"
                  :autosize="{ minRows: 3, maxRows: 5 }"
                  maxlength="1000"
                  show-count
                  :disabled="!canOperate"
                  placeholder="填写审核结论、退款说明或驳回依据"
                />
              </n-form-item>
            </n-form>
          </template>
          <template v-else>
            <div class="rf-title">审核备注</div>
            <div class="rf-note">{{ detail.reviewNote || '（无）' }}</div>
          </template>
        </template>

        <template v-if="detail?.canReview" #footer>
          <div style="display: flex; gap: 10px">
            <n-button type="success" :loading="acting" :disabled="!canOperate" @click="decide(true)">
              <template #icon><n-icon :component="CheckmarkCircleOutline" /></template>
              审核通过并退款
            </n-button>
            <n-button type="error" :loading="acting" :disabled="!canOperate" @click="decide(false)">
              <template #icon><n-icon :component="CloseCircleOutline" /></template>
              驳回申请
            </n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.filter-card { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 14px; }
.filter-card :deep(.n-tabs) { flex: 1; }
.rf-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.rf-no { font-size: 18px; font-weight: 700; }
.rf-title { margin: 22px 0 10px; font-size: 14px; font-weight: 700; }
.rf-images { display: flex; flex-wrap: wrap; gap: 10px; }
.rf-reason { white-space: pre-wrap; word-break: break-word; }
.rf-note { padding: 12px; border-radius: 8px; background: var(--n-color-hover); white-space: pre-wrap; }
@media (max-width: 900px) {
  .filter-card { align-items: stretch; flex-direction: column; }
  .filter-card .n-input { width: 100% !important; }
}
</style>
