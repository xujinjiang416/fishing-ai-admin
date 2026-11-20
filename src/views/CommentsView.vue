<script setup lang="ts">
/**
 * CommentsView.vue — 内容管理 · 评论管理
 *
 * 功能（对应需求 6）：
 * - 分页展示全平台用户评论：评论人信息 / 关联内容（钓点）/ 发布时间 / 评论正文；
 * - 支持单条删除 与 批量选中删除，均带二次确认；
 * - 删除后后端同步维护钓点评论数，小程序端拉取的评论列表即不再包含该条；
 * - 所有删除操作记录到「操作日志」。
 *
 * 接口来源：`@/api/admin` 的 api.comments / api.deleteComment / api.batchDeleteComments。
 *
 * 关键交互：关键词输入 300ms 防抖；翻页后自动清理不在当前页的选中项；
 * 页面不做角色限制，删除按钮对所有已登录后台角色可见，由后端最终校验。
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

const message = useMessage() // Naive UI 轻提示实例
const dialog = useDialog() // Naive UI 确认对话框实例（删除二次确认）

// 当前页评论数据
const rows = ref<AdminComment[]>([])
// 表格加载态
const loading = ref(false)
// 筛选条件：keyword 匹配评论正文 / 评论人
const query = reactive({ keyword: '' })
// 多选选中的评论 id 集合
const checkedKeys = ref<string[]>([])

/**
 * 分页配置（remote 模式）：page 当前页、pageSize 每页条数、itemCount 服务端总数；
 * 翻页或调整每页条数后重新请求，调整条数时回到第 1 页。
 */
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
/** 关键词输入防抖（300ms）：触发时回到第 1 页再查询 */
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/**
 * 拉取评论列表并同步总数。
 * 请求成功后过滤选中项，仅保留仍在当前页的评论，避免跨页误删。
 */
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

// 表格列：多选、评论人、关联内容、评论正文（含图片与评分）、发布时间、操作
const columns: DataTableColumns<AdminComment> = [
  // 列：多选
  { type: 'selection' },
  // 列：评论人（头像 + 昵称 + UID，游客显示「游客」）
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
  // 列：关联内容（钓点名称，缺失时回退展示钓点 id）
  {
    title: '关联内容',
    key: 'spot',
    width: 180,
    render: (row) => h('span', { style: 'display: block' }, ellipsis(row.spot || row.spotId)),
  },
  // 列：评论内容（正文省略、最多行内展示图片缩略图 + 评分）
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
  // 列：发布时间（优先 createdAt，缺失时回退 date）
  {
    title: '发布时间',
    key: 'createdAt',
    width: 160,
    render: (row) => h('span', { class: 'td-s' }, ellipsis(row.createdAt || row.date || '—')),
  },
  // 列：操作（单条删除，危险色弱化按钮）
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

/**
 * 单条删除：二次确认后调用删除接口并刷新列表。
 * @param row 目标评论
 */
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

// 首屏加载评论列表
onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 / 标题描述在左；右侧为已选数量与批量删除入口（未选中时按钮禁用） -->
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

    <!-- 区块：筛选栏 / 关键词搜索（300ms 防抖），匹配评论正文与评论人 -->
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

    <!-- 区块：评论表格 / remote 分页 + 多选，横向滚动宽度 1150，无空数据自定义插槽 -->
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
