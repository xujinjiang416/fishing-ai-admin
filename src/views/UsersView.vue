<script setup lang="ts">
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

const message = useMessage()
const dialog = useDialog()

// ---------- 列表 ----------
const rows = ref<AdminUser[]>([])
const checkedKeys = ref<string[]>([])
const loading = ref(false)
const query = reactive({ keyword: '', plan: 'all', status: 'all' })
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
function onKeyword(v: string) {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

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

const planOptions = [
  { label: '全部会员', value: 'all' },
  { label: '未开通', value: 'none' },
  { label: '月卡', value: 'month' },
  { label: '季卡', value: 'season' },
  { label: '年卡', value: 'year' },
]
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '正常', value: 'normal' },
  { label: '已停用', value: 'disabled' },
]

const columns: DataTableColumns<AdminUser> = [
  { type: 'selection' },
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
  { title: '手机号', key: 'phone', render: (row) => h('span', { class: 'num' }, row.phone ?? '—') },
  { title: '城市', key: 'city', render: (row) => row.city ?? '—' },
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
  { title: '积分', key: 'points', render: (row) => h('span', { class: 'num' }, row.points) },
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
  { title: '最近活跃', key: 'lastActive', render: (row) => h('span', { class: 'td-s' }, row.lastActive ?? '—') },
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
const showModal = ref(false)
const isEdit = ref(false)
const editUid = ref('')
const form = reactive({ nickname: '', phone: '', city: '', status: 'normal' })
const saving = ref(false)

function openCreate() {
  isEdit.value = false
  editUid.value = ''
  form.nickname = ''
  form.phone = ''
  form.city = ''
  form.status = 'normal'
  showModal.value = true
}

function openEdit(row: AdminUser) {
  isEdit.value = true
  editUid.value = row.uid
  form.nickname = row.nickname
  form.phone = row.phone ?? ''
  form.city = row.city ?? ''
  form.status = row.status
  showModal.value = true
}

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
const showAssign = ref(false)
const assignUid = ref('')
const assignTarget = ref<AdminUser | null>(null)
const assignForm = reactive({ planId: 'none', durationDays: 30 })
const assigning = ref(false)
const plans = ref<Plan[]>([])

async function openAssign(row: AdminUser) {
  assignTarget.value = row
  assignUid.value = row.uid
  assignForm.planId = 'none'
  assignForm.durationDays = 30
  plans.value = await api.plans()
  showAssign.value = true
}

const assignOptions = computed(() => [
  { label: '撤销会员', value: 'none' },
  ...plans.value.map((p) => ({ label: `${p.name}（${p.durationLabel}）`, value: p.id })),
])

function onPlanChange(v: string) {
  const p = plans.value.find((x) => x.id === v)
  assignForm.durationDays = p ? p.duration : 30
}

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

/** 批量删除：二次确认 */
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

onMounted(load)
</script>

<template>
  <div class="page">
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

    <!-- 新增 / 编辑弹窗 -->
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

    <!-- 分配会员弹窗 -->
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