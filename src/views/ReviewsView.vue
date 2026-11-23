<script setup lang="ts">
/**
 * ReviewsView.vue — 钓点审核 · 用户投稿
 *
 * 职责：按审核状态 / 城市 / 关键词筛选用户投稿，表格展示概要，点击行打开详情抽屉，
 *      在抽屉内查看全部字段、照片、投稿人统计与疑似重复钓点，并执行通过 / 驳回 /
 *      要求补充 / 合并到已有钓点。
 * 接口来源：@/api/admin 的 spotSubmissions / spotSubmission / approveSubmission /
 *          rejectSubmission / requestSubmissionInfo / mergeSubmission。
 * 关键交互：切换 Tab 回到第 1 页；关键词与城市输入 300ms 防抖；审核动作成功后关闭抽屉并刷新列表；
 *          驳回与要求补充必须填写备注，合并需指定目标钓点 ID。
 */
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  GitMergeOutline,
  HelpCircleOutline,
  SearchOutline,
} from '@vicons/ionicons5'
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

import { api, type SpotSubmission, type SpotSubmissionDetail } from '@/api/admin'

/** 状态标签类型（n-tag type 取值） */
type TagType = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

/** 投稿状态元数据：文案与标签色 */
const STATUS_META: Record<string, { label: string; type: TagType }> = {
  pending: { label: '待审核', type: 'warning' },
  reviewing: { label: '审核中', type: 'info' },
  needs_info: { label: '需补充', type: 'info' },
  approved: { label: '已通过', type: 'success' },
  rejected: { label: '已驳回', type: 'error' },
  merged: { label: '已合并', type: 'default' },
  withdrawn: { label: '已撤回', type: 'default' },
}

/** 风险标记文案 */
const RISK_LABELS: Record<string, string> = {
  duplicate_nearby: '邻近重复',
  name_missing: '名称缺失',
  note_short: '说明过短',
}

/** 投稿类型文案 */
const KIND_LABELS: Record<string, string> = {
  new_spot: '新增钓点',
  update_spot: '更新钓点',
}

/** 取状态元数据，未知状态原样展示 */
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, type: 'default' as TagType }
}

/** 单行省略文本 */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

/** 状态标签 VNode */
function statusTag(s: string) {
  const m = statusMeta(s)
  return h(NTag, { size: 'small', round: true, bordered: false, type: m.type }, { default: () => m.label })
}

const message = useMessage()

// 状态 Tab：pending / needs_info / approved / rejected / merged / all
const tabs = [
  { label: '待审核', value: 'pending' },
  { label: '需补充', value: 'needs_info' },
  { label: '已通过', value: 'approved' },
  { label: '已驳回', value: 'rejected' },
  { label: '已合并', value: 'merged' },
  { label: '全部', value: 'all' },
]
const tab = ref('pending')

// 筛选条件：city 匹配行政区，keyword 匹配名称 / 地址 / 说明
const query = reactive({ city: '', keyword: '' })

// 当前页投稿列表
const rows = ref<SpotSubmission[]>([])
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

// 关键词 / 城市输入防抖
let timer: ReturnType<typeof setTimeout> | undefined
/** 输入防抖 300ms，触发时回到第 1 页 */
function onFilterInput() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/** Tab 切换：回到第 1 页并重新查询 */
function onTabChange() {
  pagination.page = 1
  load()
}

/** 加载投稿列表 */
async function load() {
  loading.value = true
  try {
    const r = await api.spotSubmissions({
      status: tab.value === 'all' ? undefined : tab.value,
      city: query.city.trim() || undefined,
      keyword: query.keyword.trim() || undefined,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
  } finally {
    loading.value = false
  }
}

/** 允许审核的状态 */
const REVIEWABLE = ['pending', 'reviewing', 'needs_info']

// 表格列：名称 / 地区 / 坐标 / 照片数 / 风险标记 / 状态 / 提交时间 / 操作
const columns: DataTableColumns<SpotSubmission> = [
  {
    title: '名称',
    key: 'name',
    width: 170,
    render: (row) =>
      h('div', { class: 'td-sub' }, [
        h('span', { class: 'td-t' }, ellipsis(row.name || '（未填写）')),
        h('span', { class: 'td-s' }, KIND_LABELS[row.kind] ?? row.kind),
      ]),
  },
  {
    title: '地区',
    key: 'region',
    width: 130,
    render: (row) => h('span', { class: 'td-s' }, ellipsis(row.region || '—')),
  },
  {
    title: '坐标',
    key: 'coord',
    width: 150,
    render: (row) => h('span', { class: 'num' }, ellipsis(row.coord || '—')),
  },
  {
    title: '照片数',
    key: 'photos',
    width: 78,
    render: (row) => `${row.photos.length} 张`,
  },
  {
    title: '风险标记',
    key: 'riskFlags',
    width: 170,
    render: (row) =>
      row.riskFlags.length
        ? h(
            'div',
            { style: 'display:flex;gap:4px;flex-wrap:wrap' },
            row.riskFlags.map((f) =>
              h(
                NTag,
                { size: 'small', round: true, bordered: false, type: f === 'duplicate_nearby' ? 'error' : 'warning' },
                { default: () => RISK_LABELS[f] ?? f },
              ),
            ),
          )
        : h('span', { class: 'td-s' }, '—'),
  },
  {
    title: '状态',
    key: 'status',
    width: 92,
    render: (row) => statusTag(row.status),
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
            openDetail(row)
          },
        },
        { default: () => (REVIEWABLE.includes(row.status) ? '审核' : '查看') },
      ),
  },
]

// ---------- 详情抽屉 ----------
const drawerShow = ref(false)
const detailLoading = ref(false)
const detail = ref<SpotSubmissionDetail | null>(null)
// 审核备注，随通过 / 驳回 / 要求补充 / 合并提交
const reviewNote = ref('')
// 审核动作请求中，防止重复提交
const acting = ref(false)

/** 当前投稿是否可审核 */
function canReview(s: string | undefined) {
  return !!s && REVIEWABLE.includes(s)
}

/** 打开详情抽屉并拉取详情 */
async function openDetail(row: SpotSubmission) {
  drawerShow.value = true
  detailLoading.value = true
  detail.value = null
  reviewNote.value = ''
  try {
    const d = await api.spotSubmission(row.id)
    detail.value = d
    reviewNote.value = d.reviewNote ?? ''
  } finally {
    detailLoading.value = false
  }
}

/**
 * 执行审核动作
 * @param kind approve 通过 / reject 驳回 / request-info 要求补充
 */
async function decide(kind: 'approve' | 'reject' | 'request-info') {
  if (!detail.value) return
  const note = reviewNote.value.trim()
  if (kind !== 'approve' && !note) {
    message.warning('请填写备注说明原因')
    return
  }
  acting.value = true
  try {
    if (kind === 'approve') {
      const r = await api.approveSubmission(detail.value.id, note || undefined)
      message.success(`审核通过，已发布钓点 ${r.spotId}`)
    } else if (kind === 'reject') {
      await api.rejectSubmission(detail.value.id, note)
      message.success('已驳回该投稿')
    } else {
      await api.requestSubmissionInfo(detail.value.id, note)
      message.success('已通知用户补充材料')
    }
    drawerShow.value = false
    await load()
  } finally {
    acting.value = false
  }
}

// ---------- 合并弹窗 ----------
const mergeShow = ref(false)
const mergeSaving = ref(false)
const mergeForm = reactive({ spotId: '', note: '' })

/**
 * 打开合并弹窗
 * @param {string} [spotId] 预填的目标钓点 ID（疑似重复列表快捷合并）
 */
function openMerge(spotId = '') {
  mergeForm.spotId = spotId
  mergeForm.note = reviewNote.value
  mergeShow.value = true
}

/** 提交合并 */
async function confirmMerge() {
  if (!detail.value) return
  const spotId = mergeForm.spotId.trim()
  if (!spotId) {
    message.warning('请填写目标钓点 ID')
    return
  }
  mergeSaving.value = true
  try {
    await api.mergeSubmission(detail.value.id, {
      spotId,
      note: mergeForm.note.trim() || undefined,
    })
    message.success('已合并到目标钓点')
    mergeShow.value = false
    drawerShow.value = false
    await load()
  } finally {
    mergeSaving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 -->
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">钓点审核</h2>
        <p class="pagehead__desc">审核用户投稿的钓点，支持通过、驳回、要求补充与合并到已有钓点。</p>
      </div>
    </div>

    <!-- 区块：状态 Tab -->
    <n-tabs v-model:value="tab" type="line" @update:value="onTabChange">
      <n-tab-pane v-for="t in tabs" :key="t.value" :name="t.value">
        <template #tab>{{ t.label }}</template>
      </n-tab-pane>
    </n-tabs>

    <!-- 区块：筛选栏 -->
    <div class="toolbar">
      <n-input
        v-model:value="query.city"
        placeholder="城市 / 行政区"
        clearable
        style="width: 180px"
        @update:value="onFilterInput"
      />
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索名称 / 地址 / 说明"
        clearable
        style="width: 260px"
        @update:value="onFilterInput"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
    </div>

    <!-- 区块：投稿表格 -->
    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: SpotSubmission) => r.id"
        :pagination="pagination"
        :scroll-x="1120"
        :row-props="(r: SpotSubmission) => ({ style: 'cursor: pointer', onClick: () => openDetail(r) })"
        max-height="var(--table-max-h)"
        remote
        :bordered="false"
      />
    </div>

    <!-- 区块：详情抽屉 -->
    <n-drawer v-model:show="drawerShow" :width="720" placement="right">
      <n-drawer-content title="投稿详情" closable>
        <n-skeleton v-if="detailLoading" :repeat="10" text />
        <template v-else-if="detail">
          <!-- 头部：名称 + 状态 + 风险标记 -->
          <div class="rv-head">
            <span class="rv-head__name">{{ detail.name || '（未填写名称）' }}</span>
            <n-tag size="small" round :bordered="false" type="default">
              {{ KIND_LABELS[detail.kind] ?? detail.kind }}
            </n-tag>
            <n-tag
              size="small"
              round
              :bordered="false"
              :type="statusMeta(detail.status).type"
            >
              {{ statusMeta(detail.status).label }}
            </n-tag>
            <n-tag
              v-for="f in detail.riskFlags"
              :key="f"
              size="small"
              round
              :bordered="false"
              :type="f === 'duplicate_nearby' ? 'error' : 'warning'"
            >
              {{ RISK_LABELS[f] ?? f }}
            </n-tag>
          </div>

          <div class="rv-title">基础信息</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="投稿 ID">{{ detail.id }}</n-descriptions-item>
            <n-descriptions-item label="提交时间">{{ detail.createdAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="地区">{{ detail.region || '—' }}</n-descriptions-item>
            <n-descriptions-item label="坐标">{{ detail.coord || '—' }}</n-descriptions-item>
            <n-descriptions-item label="地址" :span="2">{{ detail.address || '—' }}</n-descriptions-item>
            <n-descriptions-item label="水域">{{ detail.water || '—' }}</n-descriptions-item>
            <n-descriptions-item label="收费">{{ detail.pay || '—' }}</n-descriptions-item>
            <n-descriptions-item label="鱼种" :span="2">
              {{ detail.fish.length ? detail.fish.join('、') : '—' }}
            </n-descriptions-item>
            <n-descriptions-item label="审核时间">{{ detail.reviewedAt || '—' }}</n-descriptions-item>
            <n-descriptions-item label="发布钓点">{{ detail.publishedSpotId || '—' }}</n-descriptions-item>
            <n-descriptions-item label="疑似重复">{{ detail.duplicateOf || '—' }}</n-descriptions-item>
          </n-descriptions>

          <div class="rv-title">投稿说明</div>
          <div class="rv-note">{{ detail.note || '（无）' }}</div>

          <div class="rv-title">现场照片（{{ detail.photos.length }} 张）</div>
          <n-image-group v-if="detail.photos.length">
            <div class="rv-photos">
              <n-image
                v-for="(p, i) in detail.photos"
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

          <div class="rv-title">投稿人</div>
          <n-descriptions bordered size="small" :column="2" label-placement="left">
            <n-descriptions-item label="昵称">
              {{ detail.user?.nickname || '（用户已删除）' }}
            </n-descriptions-item>
            <n-descriptions-item label="UID">{{ detail.user?.uid || '—' }}</n-descriptions-item>
            <n-descriptions-item label="累计投稿">{{ detail.userStats.total }}</n-descriptions-item>
            <n-descriptions-item label="审核通过">{{ detail.userStats.approved }}</n-descriptions-item>
          </n-descriptions>

          <div class="rv-title">疑似重复钓点（{{ detail.duplicates.length }}）</div>
          <div v-if="detail.duplicates.length" class="rv-dups">
            <div v-for="d in detail.duplicates" :key="d.id" class="rv-dup">
              <div class="td-sub" style="min-width: 0">
                <span class="td-t">{{ d.name }}</span>
                <span class="td-s">{{ d.id }} · {{ d.coord || '—' }} · {{ d.distanceKm }} km</span>
              </div>
              <n-button size="tiny" type="primary" quaternary @click="openMerge(d.id)">
                合并到此
              </n-button>
            </div>
          </div>
          <div v-else class="td-s">未发现坐标相近的已发布钓点</div>

          <div class="rv-title">审核备注</div>
          <n-input
            v-model:value="reviewNote"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="通过 / 驳回 / 要求补充时的说明，驳回与要求补充必填"
          />
        </template>

        <template #footer>
          <div style="display: flex; gap: 10px; flex-wrap: wrap">
            <n-button
              type="success"
              :disabled="!canReview(detail?.status)"
              :loading="acting"
              @click="decide('approve')"
            >
              <template #icon>
                <n-icon :component="CheckmarkCircleOutline" />
              </template>
              通过
            </n-button>
            <n-button
              type="warning"
              :disabled="!canReview(detail?.status)"
              :loading="acting"
              @click="decide('request-info')"
            >
              <template #icon>
                <n-icon :component="HelpCircleOutline" />
              </template>
              要求补充
            </n-button>
            <n-button
              type="error"
              :disabled="!canReview(detail?.status)"
              :loading="acting"
              @click="decide('reject')"
            >
              <template #icon>
                <n-icon :component="CloseCircleOutline" />
              </template>
              驳回
            </n-button>
            <n-button
              :disabled="!canReview(detail?.status)"
              @click="openMerge()"
            >
              <template #icon>
                <n-icon :component="GitMergeOutline" />
              </template>
              合并到已有钓点
            </n-button>
            <span style="flex: 1" />
            <n-button @click="drawerShow = false">关闭</n-button>
          </div>
        </template>
      </n-drawer-content>
    </n-drawer>

    <!-- 区块：合并弹窗 -->
    <n-modal
      v-model:show="mergeShow"
      preset="card"
      title="合并到已有钓点"
      style="width: 460px"
      :mask-closable="false"
      :z-index="3000"
    >
      <n-form label-placement="top">
        <n-form-item label="目标钓点 ID" required>
          <n-input v-model:value="mergeForm.spotId" placeholder="输入要合并到的钓点 ID" />
        </n-form-item>
        <n-form-item label="备注">
          <n-input
            v-model:value="mergeForm.note"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="合并说明（可选）"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="mergeShow = false">取消</n-button>
          <n-button type="primary" :loading="mergeSaving" @click="confirmMerge">确认合并</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
.rv-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.rv-head__name {
  font-size: 17px;
  font-weight: 600;
  color: var(--c-ink);
}

.rv-title {
  margin: 18px 0 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--c-ink-2);
}

.rv-note {
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--c-surface-2);
  color: var(--c-ink-2);
  font-size: 13px;
  line-height: 1.6;
  white-space: pre-wrap;
}

.rv-photos {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rv-dups {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rv-dup {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border: 1px solid var(--c-line);
  border-radius: 8px;
}
</style>
