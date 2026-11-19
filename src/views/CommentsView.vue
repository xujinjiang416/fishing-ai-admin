<script setup lang="ts">
/**
 * CommentsView.vue — 内容管理 · 评论管理
 *
 * 功能（对应需求 6）：
 * - 分页展示全平台用户评论：评论人信息 / 关联内容（钓点）/ 发布时间 / 评论正文；
 * - 支持单条删除 与 批量选中删除，均带二次确认；
 * - 删除后后端同步维护钓点评论数，小程序端拉取的评论列表即不再包含该条；
 * - 所有删除操作记录到「操作日志」。
 */
import { SearchOutline, TrashOutline } from '@vicons/ionicons5'
import {
  NButton,
  NEllipsis,
  NIcon,
  NImage,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { h, onMounted, reactive, ref } from 'vue'

import { api, type AdminComment } from '@/api/admin'

/** 单行省略文本：超宽时截断为一行 + 悬浮显示全文（n-ellipsis） */
function ellipsis(text: string) {
  return h(NEllipsis, { style: 'max-width: 100%' }, { default: () => text })
}

const message = useMessage()
const dialog = useDialog()

const rows = ref<AdminComment[]>([])
const loading = ref(false)
const query = reactive({ keyword: '' })
// 多选选中的评论 id 集合
const checkedKeys = ref<string[]>([])

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

// 关键词搜索防抖
let timer: ReturnType<typeof setTimeout> | undefined
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

async function load() {
  loading.value = true
  try {
    const r = await api.comments({
      keyword: query.keyword,
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

const columns: DataTableColumns<AdminComment> = [
  { type: 'selection' },
  {
    title: '评论人',
    key: 'user',
    width: 160,
    render: (row) =>
      h('div', { class: 'td-main' }, [
        h('span', { class: 'avatar avatar--sm' }, row.avatar),
        h('div', { class: 'td-sub', style: 'min-width: 0' }, [
          h('span', { class: 'td-t' }, ellipsis(row.user)),
          h('span', { class: 'td-s' }, row.userId ? `UID ${row.userId}` : '游客'),
        ]),
      ]),
  },
  {
    title: '关联内容',
    key: 'spot',
    width: 180,
    render: (row) => h('span', { style: 'display: block' }, ellipsis(row.spot || row.spotId)),
  },
  {
    title: '评论内容',
    key: 'text',
    width: 300,
    render: (row) =>
      h('div', { style: 'min-width: 0' }, [
        h('div', { class: 'cmt-text' }, ellipsis(row.text || '（无正文）')),
        row.images && row.images.length
          ? h(
              'div',
              { class: 'cmt-imgs' },
              row.images.map((src) => h(NImage, { src, width: 46, height: 46, objectFit: 'cover' })),
            )
          : null,
        h('div', { class: 'td-s' }, `评分 ${row.rating} 星`),
      ]),
  },
  {
    title: '发布时间',
    key: 'createdAt',
    width: 160,
    render: (row) => h('span', { class: 'td-s' }, ellipsis(row.createdAt || row.date || '—')),
  },
  {
    title: '操作',
    key: 'actions',
    width: 100,
    fixed: 'right',
    render: (row) =>
      h(
        NButton,
        { size: 'tiny', type: 'error', quaternary: true, onClick: () => confirmDelete(row) },
        { icon: () => h(NIcon, { component: TrashOutline }), default: () => '删除' },
      ),
  },
]

/** 单条删除：二次确认 */
function confirmDelete(row: AdminComment) {
  dialog.warning({
    title: '删除评论',
    content: `确认删除「${row.user}」在「${row.spot}」下的这条评论？删除后不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteComment(row.id)
      message.success('评论已删除')
      load()
    },
  })
}

/** 批量删除：二次确认 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的评论')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除评论',
    content: `确认删除已选中的 ${count} 条评论？删除后不可恢复。`,
    positiveText: `确认删除 ${count} 条`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteComments(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 条评论`)
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
        <h2 class="pagehead__title">评论管理</h2>
        <p class="pagehead__desc">查看并管理全平台用户评论，支持单条 / 批量删除（删除后小程序端同步移除）。</p>
      </div>
      <div class="pagehead__actions">
        <n-tag :bordered="false" round type="warning">
          已选 {{ checkedKeys.length }} 条
        </n-tag>
        <n-button type="error" :disabled="!checkedKeys.length" @click="confirmBatchDelete">
          <template #icon>
            <n-icon :component="TrashOutline" />
          </template>
          批量删除
        </n-button>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索评论内容 / 评论人"
        clearable
        style="width: 280px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: AdminComment) => r.id"
        v-model:checked-row-keys="checkedKeys"
        :pagination="pagination"
        :scroll-x="1150"
        remote
        :bordered="false"
      />
    </div>
  </div>
</template>
