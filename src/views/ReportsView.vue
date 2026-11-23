<script setup lang="ts">
/**
 * ReportsView.vue — 钓点审核 · 纠错处理
 *
 * 职责：分页展示用户提交的钓点纠错 / 举报，支持按状态筛选；处理时可接受（并选择是否下架）
 *      或拒绝，处理备注一并提交。
 * 接口来源：@/api/admin 的 spotReports / resolveReport。
 * 关键交互：切换 Tab 回到第 1 页并重新查询；处理动作成功后关闭抽屉并刷新列表；
 *          拒绝时必须填写备注；接受时若勾选「同时下架」则后端将钓点置为 offline。
 */
import { CheckmarkCircleOutline, CloseCircleOutline } from '@vicons/ionicons5'
import {
  NButton,
  NEllipsis,
  NIcon,
  NImage,
  NTag,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { h, onMounted, reactive, ref } from 'vue'

import { api, type SpotReport } from '@/api/admin'

/** 状态标签类型 */
type TagType = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

/** 处理状态元数据 */
const STATUS_META: Record<string, { label: string; type: TagType }> = {
  pending: { label: '待处理', type: 'warning' },
  accepted: { label: '已接受', type: 'success' },
  rejected: { label: '已拒绝', type: 'error' },
}

/** 问题类型文案 */
const TYPE_LABELS: Record<string, string> = {
  wrong_location: '位置错误',
  closed: '已关闭',
  dry: '水域干涸',
  fee_changed: '收费变化',
  duplicate: '重复钓点',
  prohibited: '禁钓区域',
  other: '其他问题',
}

/** 取状态元数据 */
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, type: 'default' as TagType }
}

/** 单行省略文本 */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()

// 状态 Tab
const tabs = [
  { label: '待处理', value: 'pending' },
  { label: '已接受', value: 'accepted' },
  { label: '已拒绝', value: 'rejected' },
  { label: '全部', value: 'all' },
]
const tab = ref('pending')

// 当前页纠错数据
const rows = ref<SpotReport[]>([])
const loading = ref(false)

// 分页配置（remote 模式）
const pagination = reactive({
  page: 1,
  pageSize: 20,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [20, 50, 100],
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

/** Tab 切换 */
function onTabChange() {
  pagination.page = 1
  load()
}

/** 加载纠错列表 */
async function load() {
  loading.value = true
  try {
    const r = await api.spotReports({
      status: tab.value === 'all' ? undefined : tab.value,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
  } finally {
    loading.value = false
  }
}

// 表格列：钓点 ID / 问题类型 / 建议坐标 / 照片 / 说明 / 状态 / 时间 / 操作
const columns: DataTableColumns<SpotReport> = [
  {
    title: '钓点 ID',
    key: 'spotId',
    width: 140,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.spotId)),
  },
  {
    title: '问题类型',
    key: 'reportType',
    width: 108,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, bordered: false, type: 'info' },
        { default: () => TYPE_LABELS[row.reportType] ?? row.reportType },
      ),
  },
  {
    title: '建议坐标',
    key: 'proposedCoord',
    width: 150,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.proposedCoord || '—')),
  },
  {
    title: '照片',
    key: 'photos',
    width: 130,
    render: (row) =>
      row.photos.length
        ? h(
            'div',
            { style: 'display:flex;gap:4px' },
            row.photos.slice(0, 3).map((src) =>
              h(NImage, { src, width: 36, height: 36, objectFit: 'cover', style: 'border-radius:6px' }),
            ),
          )
        : h('span', { class: 'td-s' }, '—'),
  },
  {
    title: '说明',
    key: 'note',
    width: 240,
    render: (row) => h('div', { style: 'min-width:0' }, ellipsis(row.note || '（无）')),
  },
  {
    title: '状态',
    key: 'status',
    width: 92,
    render: (row) =>
      h(
        NTag,
        { size: 'small', round: true, bordered: false, type: statusMeta(row.status).type },
        { default: () => statusMeta(row.status).label },
      ),
  },
  {
    title: '提交时间',
    key: 'createdAt',
    width: 140,
    render: (row) => h('span', { class: 'td-s' }, row.createdAt || '—'),
  },
  {
    title: '操作',
    key: 'actions',
    width: 96,
    fixed: 'right',
    render: (row) =>
      h(
        NButton,
        {
          size: 'tiny',
          type: 'primary',
          quaternary: true,
          onClick: (e: MouseEvent) => {
            e.stopPropagation()
            openResolve(row)
          },
        },
        { default: () => (row.status === 'pending' ? '处理' : '查看') },
      ),
  },
]

// ---------- 处理抽屉 ----------
const drawerShow = ref(false)
// 当前处理中的纠错记录（列表接口已返回全部字段，无需再请求详情）
const current = ref<SpotReport | null>(null)
const note = ref('')
const offline = ref(false)
const acting = ref(false)

/** 打开处理抽屉 */
function openResolve(row: SpotReport) {
  current.value = row
  note.value = row.reviewNote ?? ''
  offline.value = false
  drawerShow.value = true
}

/**
 * 提交处理结果
 * @param {boolean} accept true 接受纠错 / false 拒绝
 */
async function resolve(accept: boolean) {
  if (!current.value) return
  if (!accept && !note.value.trim()) {
    message.warning('请填写拒绝原因')
    return
  }
  acting.value = true
  try {
    await api.resolveReport(current.value.id, {
      accept,
      offline: accept ? offline.value : false,
      note: note.value.trim() || undefined,
    })
    message.success(accept ? '已接受纠错' : '已拒绝纠错')
    drawerShow.value = false
    await load()
  } finally {
    acting.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 -->
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">纠错处理</h2>
        <p class="pagehead__desc">处理用户提交的钓点位置纠错与异常举报，接受后可按需同步下架钓点。</p>
      </div>
    </div>

    <!-- 区块：状态 Tab -->
    <n-tabs v-model:value="tab" type="line" @update:value="onTabChange">
      <n-tab-pane v-for="t in tabs" :key="t.value" :name="t.value">
        <template #tab>{{ t.label }}</template>
      </n-tab-pane>
    </n-tabs>

    <!-- 区块：纠错表格 -->
    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: SpotReport) => r.id"
        :pagination="pagination"
        :scroll-x="1080"
        :row-props="(r: SpotReport) => ({ style: 'cursor: pointer', onClick: () => openResolve(r) })"
        max-height="var(--table-max-h)"
        remote
        :bordered="false"
      />
    </div>

    <!-- 区块：处理抽屉 -->
    <n-drawer v-model:show="drawerShow" :width="620" placement="right">
      <n-drawer-content title="纠错详情" closable>
        <template v-if="current">
          <div class="rp-head">
            <span class="rp-head__type">{{ TYPE_LABELS[current.reportType] ?? current.reportType }}</span>
            <n-tag size="small" round :bordered="false" :type="statusMeta(current.status).type">
              {{ statusMeta(current.status).label }}
            </n-tag>
          </div>

          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="记录 ID">{{ current.id }}</n-descriptions-item>
            <n-descriptions-item label="钓点 ID">{{ current.spotId }}</n-descriptions-item>
            <n-descriptions-item label="建议坐标">{{ current.proposedCoord || '—' }}</n-descriptions-item>
            <n-descriptions-item label="提交时间">{{ current.createdAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="处理时间">{{ current.reviewedAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="处理备注">{{ current.reviewNote || '—' }}</n-descriptions-item>
          </n-descriptions>

          <div class="rp-title">问题说明</div>
          <div class="rp-note">{{ current.note || '（无）' }}</div>

          <div class="rp-title">佐证照片（{{ current.photos.length }} 张）</div>
          <n-image-group v-if="current.photos.length">
            <div class="rp-photos">
              <n-image
                v-for="(p, i) in current.photos"
                :key="i"
                :src="p"
                width="88"
                height="88"
                object-fit="cover"
                style="border-radius: 8px"
              />
            </div>
          </n-image-group>
          <div v-else class="td-s">暂无照片</div>

          <template v-if="current.status === 'pending'">
            <div class="rp-title">处理</div>
            <n-checkbox v-model:checked="offline">接受纠错的同时下架该钓点</n-checkbox>
            <n-input
              v-model:value="note"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 4 }"
              placeholder="处理备注（拒绝时必填）"
              style="margin-top: 12px"
            />
          </template>
        </template>

        <template #footer>
          <div style="display: flex; gap: 10px">
            <template v-if="current?.status === 'pending'">
              <n-button type="success" :loading="acting" @click="resolve(true)">
                <template #icon>
                  <n-icon :component="CheckmarkCircleOutline" />
                </template>
                接受纠错
              </n-button>
              <n-button type="error" :loading="acting" @click="resolve(false)">
                <template #icon>
                  <n-icon :component="CloseCircleOutline" />
                </template>
                拒绝
              </n-button>
            </template>
            <span style="flex: 1" />
            <n-button @click="drawerShow = false">关闭</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>
  </div>
</template>

<style scoped>
.rp-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.rp-head__type {
  font-size: 17px;
  font-weight: 600;
  color: var(--c-ink);
}

.rp-title {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}

.rp-note {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--c-surface-2);
  color: var(--c-ink-2);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.rp-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
