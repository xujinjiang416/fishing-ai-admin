<script setup lang="ts">
/**
 * UsersView.vue — 用户管理
 *
 * 职责：注册用户的分页查询、筛选（关键词/会员/状态）、新增、编辑、删除、批量删除与会员分配。
 * 数据来源（@/api/admin）：
 * - GET    /admin/users                      分页列表
 * - POST   /admin/users                      新增用户
 * - PUT    /admin/users/{uid}                编辑用户
 * - DELETE /admin/users/{uid}                删除用户
 * - POST   /admin/users/batch-delete         批量删除
 * - PUT    /admin/users/{uid}/membership     分配/撤销会员
 * - GET    /admin/plans                      会员套餐下拉数据
 * 关键交互：关键词输入 300ms 防抖；筛选变更后回到第 1 页；删除均二次确认。
 * 权限/限制：需登录访问；删除不可恢复；勾选仅对当前页有效，翻页后自动清理。
 */
import {
  CreateOutline,
  DiamondOutline,
  PersonAddOutline,
  SearchOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import {
  NButton,
  NIcon,
  NInput,
  NSelect,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref } from 'vue'

import { api, type AdminUser, type Plan } from '@/api/admin'
import { planTag, statusTag } from '@/utils/tags'

// 全局消息实例：保存、删除等操作的结果提示
const message = useMessage()
// 对话框实例：删除类操作前弹出二次确认
const dialog = useDialog()

// ---------- 列表 ----------
// 当前页用户列表，由 load() 请求后整体覆盖
const rows = ref<AdminUser[]>([])
// 表格勾选行的 uid 集合；每次加载后剔除已不在当前页的项
const checkedKeys = ref<string[]>([])
// 列表请求中标记，透传给 n-data-table 的 loading
const loading = ref(false)
/**
 * 筛选条件
 * - keyword：昵称 / 手机号 / uid 模糊搜索
 * - plan：会员类型，'all' 全部；其余取值为 none / month / season / year
 * - status：账号状态，'all' 全部；其余取值为 normal / disabled
 */
const query = reactive({ keyword: '', plan: 'all', status: 'all' })
/**
 * 分页配置（remote 模式，由后端分页）
 * - page：当前页码，默认 1
 * - pageSize：每页条数，默认 8，可选 8 / 16 / 30
 * - itemCount：总条数，由接口 total 回填
 * - onChange / onUpdatePageSize：页码或每页条数变化后重新加载
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

// 关键词防抖计时器句柄：连续输入时清除上一次待执行的请求
let timer: ReturnType<typeof setTimeout> | undefined
/**
 * 关键词输入防抖处理（300ms）
 * 用户停止输入后才回到第 1 页并请求，避免逐字符触发接口。
 * @param {string} v 输入框最新值；v-model 已同步到 query.keyword，此处仅作触发信号
 * @returns {void}
 */
function onKeyword(v: string) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/**
 * 加载当前页用户列表
 * 步骤：1) 置 loading；2) 携带筛选与分页参数请求 /admin/users；
 * 3) 回填 rows 与 itemCount；4) 清理已不在当前页的勾选项；
 * 5) finally 复位 loading（异常由 axios 拦截器统一提示）。
 * @returns {Promise<void>}
 */
async function load() {
  loading.value = true
  try {
    const r = await api.users({
      keyword: query.keyword,
      plan: query.plan,
      status: query.status,
      page: pagination.page,
      pageSize: pagination.pageSize,
    })
    rows.value = r.list
    pagination.itemCount = r.total
    // 清理已不在当前页的选中项
    const ids = new Set(r.list.map((x) => x.uid))
    checkedKeys.value = checkedKeys.value.filter((k) => ids.has(k))
  } finally {
    loading.value = false
  }
}

// 会员筛选下拉：value 与后端 plan 字段取值一致，'all' 表示不筛选
const planOptions = [
  { label: '全部会员', value: 'all' },
  { label: '未开通', value: 'none' },
  { label: '月卡', value: 'month' },
  { label: '季卡', value: 'season' },
  { label: '年卡', value: 'year' },
]
// 账号状态筛选下拉：'all' 表示不筛选
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '正常', value: 'normal' },
  { label: '已停用', value: 'disabled' },
]

const columns: DataTableColumns<AdminUser> = [
  // 勾选列：与 v-model:checked-row-keys 双向绑定，供批量删除使用
  { type: 'selection' },
  // 用户列：头像 + 昵称 + uid 主副两行渲染
  {
    title: '用户',
    key: 'user',
    render: (row) =>
      h('div', { class: 'td-main' }, [
        h('span', { class: 'avatar avatar--sm' }, row.avatar),
        h('div', { class: 'td-sub' }, [
          h('span', { class: 'td-t' }, row.nickname),
          h('span', { class: 'td-s num' }, row.uid),
        ]),
      ]),
  },
  // 手机号列：null 时显示占位符「—」，等宽数字样式
  { title: '手机号', key: 'phone', render: (row) => h('span', { class: 'num' }, row.phone ?? '—') },
  // 城市列：未填写时显示「—」
  { title: '城市', key: 'city', render: (row) => row.city ?? '—' },
  // 会员列：套餐标签（planTag 配色）+ 到期时间副行；未开通时不显示到期文案
  {
    title: '会员',
    key: 'plan',
    render: (row) =>
      h('div', { class: 'td-sub' }, [
        h(
          NTag,
          {
            size: 'small',
            round: true,
            color: planTag(row.plan).color,
            'text-color': planTag(row.plan).textColor,
            style: 'width: fit-content',
          },
          { default: () => planTag(row.plan).text },
        ),
        h('span', { class: 'td-s' }, row.planExpire === '—' ? '' : `到期 ${row.planExpire}`),
      ]),
  },
  // 积分列：当前可用积分，等宽数字展示
  { title: '积分', key: 'points', render: (row) => h('span', { class: 'num' }, row.points) },
  // 状态列：正常 / 已停用标签，配色由 statusTag 统一映射
  {
    title: '状态',
    key: 'status',
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          round: true,
          color: statusTag(row.status).color,
          'text-color': statusTag(row.status).textColor,
        },
        { default: () => statusTag(row.status).text },
      ),
  },
  // 最近活跃列：后端返回的格式化时间文案，缺失时显示「—」
  { title: '最近活跃', key: 'lastActive', render: (row) => h('span', { class: 'td-s' }, row.lastActive ?? '—') },
  // 操作列：编辑、分配会员、删除；固定右侧，宽度 220 保证按钮不换行
  {
    title: '操作',
    key: 'actions',
    width: 220,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns' }, [
        h(NButton, { size: 'tiny', onClick: () => openEdit(row) }, { default: () => '编辑' }),
        h(
          NButton,
          { size: 'tiny', onClick: () => openAssign(row) },
          {
            icon: () => h(NIcon, { component: DiamondOutline }),
            default: () => '分配会员',
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

// ---------- 新增 / 编辑 ----------
// 新增/编辑弹窗显隐
const showModal = ref(false)
// 是否编辑态：true 走 PUT 更新，false 走 POST 新增
const isEdit = ref(false)
// 编辑态下的用户 uid；新增时为空串
const editUid = ref('')
/**
 * 新增/编辑表单模型
 * - nickname：昵称，必填，提交时 trim
 * - phone：手机号，可选，留空提交 undefined（编辑时表示不修改）
 * - city：城市，可选
 * - status：账号状态，默认 normal，可选 normal / disabled
 */
const form = reactive({ nickname: '', phone: '', city: '', status: 'normal' })
// 保存请求中标记，控制弹窗「保存」按钮 loading
const saving = ref(false)

/** 打开新增弹窗：重置为编辑态之外的空白表单，状态回默认 normal */
function openCreate() {
  isEdit.value = false
  editUid.value = ''
  form.nickname = ''
  form.phone = ''
  form.city = ''
  form.status = 'normal'
  showModal.value = true
}

/**
 * 打开编辑弹窗：以选中行数据回填表单（phone/city 的 null 转为空串）
 * @param {AdminUser} row 表格当前行用户数据
 * @returns {void}
 */
function openEdit(row: AdminUser) {
  isEdit.value = true
  editUid.value = row.uid
  form.nickname = row.nickname
  form.phone = row.phone ?? ''
  form.city = row.city ?? ''
  form.status = row.status
  showModal.value = true
}

/**
 * 保存用户（新增或编辑）
 * 步骤：1) 昵称非空校验；2) 组装 payload（phone/city 空白转 undefined）；
 * 3) 按 isEdit 调用更新或创建接口；4) 成功后关闭弹窗并刷新列表；
 * 5) finally 复位 saving（接口异常由 axios 拦截器统一提示）。
 * @returns {Promise<void>}
 */
async function save() {
  if (!form.nickname.trim()) {
    message.warning('请填写昵称')
    return
  }
  saving.value = true
  try {
    const payload = {
      nickname: form.nickname.trim(),
      phone: form.phone.trim() || undefined,
      city: form.city.trim() || undefined,
      status: form.status,
    }
    if (isEdit.value) {
      await api.updateUser(editUid.value, payload)
      message.success('已保存')
    } else {
      await api.createUser(payload)
      message.success('用户已创建')
    }
    showModal.value = false
    load()
  } finally {
    saving.value = false
  }
}

// ---------- 分配会员 ----------
// 分配会员弹窗显隐
const showAssign = ref(false)
// 当前被分配用户的 uid，提交时使用
const assignUid = ref('')
// 当前被分配用户对象，仅用于弹窗标题展示昵称
const assignTarget = ref<AdminUser | null>(null)
/**
 * 分配会员表单
 * - planId：套餐 id，'none' 表示撤销会员，默认 'none'
 * - durationDays：生效天数，默认 30，选择套餐后按套餐 duration 回填
 */
const assignForm = reactive({ planId: 'none', durationDays: 30 })
// 分配请求中标记，控制弹窗「确定」按钮 loading
const assigning = ref(false)
// 可选套餐列表，打开弹窗时按需拉取
const plans = ref<Plan[]>([])

/**
 * 打开分配会员弹窗
 * 先重置表单，再拉取最新套餐列表（保证新增套餐后立即可选）。
 * @param {AdminUser} row 目标用户
 * @returns {Promise<void>}
 */
async function openAssign(row: AdminUser) {
  assignTarget.value = row
  assignUid.value = row.uid
  assignForm.planId = 'none'
  assignForm.durationDays = 30
  plans.value = await api.plans()
  showAssign.value = true
}

// 套餐下拉选项：「撤销会员」固定首项，其后为全部套餐（名称 + 时长标签）
const assignOptions = computed(() => [
  { label: '撤销会员', value: 'none' },
  ...plans.value.map((p) => ({ label: `${p.name}（${p.durationLabel}）`, value: p.id })),
])

/**
 * 套餐切换：按所选套餐的时长回填生效天数，未匹配到时回退默认 30 天
 * @param {string} v 选中的套餐 id
 * @returns {void}
 */
function onPlanChange(v: string) {
  const p = plans.value.find((x) => x.id === v)
  assignForm.durationDays = p ? p.duration : 30
}

/**
 * 提交会员分配
 * planId 为 'none' 时表示撤销会员，否则按所选套餐与天数分配；
 * 成功后关闭弹窗并刷新列表，finally 复位 assigning。
 * @returns {Promise<void>}
 */
async function saveAssign() {
  assigning.value = true
  try {
    await api.assignMembership(assignUid.value, {
      planId: assignForm.planId,
      durationDays: assignForm.durationDays,
    })
    message.success(assignForm.planId === 'none' ? '已撤销会员' : '会员已分配')
    showAssign.value = false
    load()
  } finally {
    assigning.value = false
  }
}

// ---------- 删除 ----------
/**
 * 删除单个用户（二次确认后执行）
 * @param {AdminUser} row 目标用户
 * @returns {void}
 */
function confirmDelete(row: AdminUser) {
  dialog.warning({
    title: '删除用户',
    content: `确认删除用户「${row.nickname}」？该操作不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteUser(row.uid)
      message.success('用户已删除')
      load()
    },
  })
}

/**
 * 批量删除：二次确认
 * 未勾选时给出提示；确认后按勾选的 uid 调用批量删除，
 * 成功则清空勾选并刷新列表。
 * @returns {void}
 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的用户')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除用户',
    content: `确认删除已选中的 ${count} 个用户？该操作不可恢复。`,
    positiveText: `确认删除 ${count} 个`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteUsers(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 个用户`)
      checkedKeys.value = []
      load()
    },
  })
}

// 首次进入页面加载第 1 页用户数据
onMounted(load)
</script>

<template>
  <!-- 区块：用户管理根容器 / 页头 + 筛选工具栏 + 表格卡片，底部为两个弹窗 -->
  <div class="page">
    <!-- 区块：页头 / 左侧标题说明，右侧已选计数、批量删除与新增用户 -->
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">用户管理</h2>
        <p class="pagehead__desc">管理注册用户，可新增、编辑、禁用/启用、分配会员。</p>
      </div>
      <div class="pagehead__actions">
        <n-tag :bordered="false" round type="warning">已选 {{ checkedKeys.length }} 条</n-tag>
        <n-button type="error" :disabled="!checkedKeys.length" @click="confirmBatchDelete">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          批量删除
        </n-button>
        <n-button type="primary" @click="openCreate">
          <template #icon>
            <n-icon :component="PersonAddOutline" />
          </template>
          新增用户
        </n-button>
      </div>
    </div>

    <!-- 区块：筛选工具栏 / 关键词搜索 + 会员筛选 + 状态筛选，横向排列 -->
    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索昵称 / 手机号 / uid"
        clearable
        style="width: 260px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select
        v-model:value="query.plan"
        :options="planOptions"
        style="width: 130px"
        @update:value="
          () => {
            pagination.page = 1
            load()
          }
        "
      />
      <n-select
        v-model:value="query.status"
        :options="statusOptions"
        style="width: 130px"
        @update:value="
          () => {
            pagination.page = 1
            load()
          }
        "
      />
    </div>

    <!-- 区块：用户表格卡片 / remote 分页，勾选与 loading 由脚本状态驱动 -->
    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: AdminUser) => r.uid"
        v-model:checked-row-keys="checkedKeys"
        :pagination="pagination"
        remote
        :bordered="false"
      />
    </div>

    <!-- 区块：新增 / 编辑弹窗 / 标题随 isEdit 切换，遮罩不可点击关闭以防误触 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑用户' : '新增用户'"
      style="width: 480px"
      :mask-closable="false"
    >
      <n-form label-placement="top">
        <n-form-item label="昵称" required>
          <n-input v-model:value="form.nickname" placeholder="请输入昵称" maxlength="32" />
        </n-form-item>
        <n-form-item label="手机号">
          <n-input v-model:value="form.phone" placeholder="请输入手机号（留空不修改）" maxlength="11" />
        </n-form-item>
        <n-form-item label="城市">
          <n-input v-model:value="form.city" placeholder="如：杭州" />
        </n-form-item>
        <n-form-item label="状态">
          <n-select
            v-model:value="form.status"
            :options="[
              { label: '正常', value: 'normal' },
              { label: '已停用', value: 'disabled' },
            ]"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 区块：分配会员弹窗 / 选择套餐并设置生效天数；套餐为「撤销会员」时隐藏天数输入 -->
    <n-modal
      v-model:show="showAssign"
      preset="card"
      title="分配会员"
      style="width: 420px"
      :mask-closable="false"
    >
      <p class="pagehead__desc" style="margin: 0 0 14px">
        为「{{ assignTarget?.nickname }}」选择会员套餐
      </p>
      <n-form label-placement="top">
        <n-form-item label="套餐">
          <n-select v-model:value="assignForm.planId" :options="assignOptions" @update:value="onPlanChange" />
        </n-form-item>
        <n-form-item v-if="assignForm.planId !== 'none'" label="生效天数">
          <n-input-number v-model:value="assignForm.durationDays" :min="1" :max="3650" style="width: 100%" />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showAssign = false">取消</n-button>
          <n-button type="primary" :loading="assigning" @click="saveAssign">确定</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>