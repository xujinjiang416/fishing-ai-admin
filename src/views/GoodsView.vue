<script setup lang="ts">
import {
  CreateOutline,
  ImageOutline,
  SearchOutline,
  TrashOutline,
  CloudUploadOutline,
} from '@vicons/ionicons5'
import {
  NButton,
  NIcon,
  NInput,
  NSelect,
  NSwitch,
  NTag,
  useDialog,
  useMessage,
  type DataTableColumns,
} from 'naive-ui'
import { computed, h, onMounted, reactive, ref } from 'vue'

import { api, type Goods } from '@/api/admin'
import { catTag, money, statusTag } from '@/utils/tags'

const message = useMessage()
const dialog = useDialog()

// ---------- 列表 ----------
const rows = ref<Goods[]>([])
const checkedKeys = ref<string[]>([])
const loading = ref(false)
const query = reactive({ keyword: '', cat: '全部', status: 'all' })
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
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

function resetAndLoad() {
  pagination.page = 1
  load()
}

async function load() {
  loading.value = true
  try {
    const r = await api.goods({
      keyword: query.keyword,
      cat: query.cat,
      status: query.status,
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

const catOptions = ['全部', '鱼竿', '渔轮', '饵料', '工具', '装备'].map((c) => ({ label: c, value: c }))
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '上架中', value: 'on' },
  { label: '已下架', value: 'off' },
]

/** 仅展示可访问的图片（/static 上传图或 http 外链），其余显示占位 */
function imgSrc(img: string | null): string {
  if (!img) return ''
  return img.startsWith('/static') || img.startsWith('http') ? img : ''
}

const columns: DataTableColumns<Goods> = [
  { type: 'selection' },
  {
    title: '商品',
    key: 'goods',
    render: (row) =>
      h('div', { class: 'td-main' }, [
        imgSrc(row.img)
          ? h('img', { class: 'td-thumb', src: imgSrc(row.img) })
          : h('div', { class: 'td-thumb', style: 'display:flex;align-items:center;justify-content:center;color:var(--c-ink-4)' }, [
              h(NIcon, { component: ImageOutline, size: 20 }),
            ]),
        h('div', { class: 'td-sub' }, [
          h('span', { class: 'td-t' }, row.name),
          h('span', { class: 'td-s num' }, row.id),
        ]),
      ]),
  },
  {
    title: '分类',
    key: 'cat',
    render: (row) =>
      h(
        NTag,
        {
          size: 'small',
          round: true,
          color: catTag(row.cat).color,
          'text-color': catTag(row.cat).textColor,
        },
        { default: () => catTag(row.cat).text },
      ),
  },
  {
    title: '价格',
    key: 'price',
    render: (row) =>
      h('div', [
        h('span', { class: 'price-now' }, money(row.price)),
        row.origPrice && row.origPrice > row.price
          ? h('span', { class: 'price-ori' }, money(row.origPrice))
          : null,
      ]),
  },
  { title: '库存', key: 'stock', render: (row) => h('span', { class: 'num' }, row.stock) },
  { title: '销量', key: 'sales', render: (row) => h('span', { class: 'num td-s' }, row.sales) },
  {
    title: '积分抵扣',
    key: 'pointsEnabled',
    render: (row) =>
      row.pointsEnabled
        ? h(
            NTag,
            { size: 'small', round: true, color: '#E6F6EE' as never, 'text-color': '#2E9E6B' as never },
            { default: () => '支持' },
          )
        : h(
            NTag,
            { size: 'small', round: true, color: '#EFF3F2' as never, 'text-color': '#6E807E' as never },
            { default: () => '不支持' },
          ),
  },
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
        { default: () => (row.status === 'on' ? '上架中' : '已下架') },
      ),
  },
  { title: '更新时间', key: 'updated', render: (row) => h('span', { class: 'td-s' }, row.updated ?? '—') },
  {
    title: '操作',
    key: 'actions',
    width: 130,
    fixed: 'right',
    render: (row) =>
      h('div', { class: 'rowbtns' }, [
        h(
          NButton,
          { size: 'tiny', onClick: () => openEdit(row) },
          {
            icon: () => h(NIcon, { component: CreateOutline }),
            default: () => '编辑',
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

// ---------- 上传 / 编辑弹窗 ----------
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref('')
const form = reactive({
  name: '',
  cat: '鱼竿',
  price: 0,
  origPrice: undefined as number | undefined,
  stock: 0,
  pointsEnabled: true,
  status: true, // true=on 上架
  img: '' as string, // 最终图片 URL
  imgPath: '', // 手工填写的图片路径
  preview: '', // 上传后的预览
})
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function openCreate() {
  isEdit.value = false
  editId.value = ''
  form.name = ''
  form.cat = '鱼竿'
  form.price = 0
  form.origPrice = undefined
  form.stock = 0
  form.pointsEnabled = true
  form.status = false
  form.img = ''
  form.imgPath = ''
  form.preview = ''
  showModal.value = true
}

function openEdit(g: Goods) {
  isEdit.value = true
  editId.value = g.id
  form.name = g.name
  form.cat = g.cat
  form.price = g.price
  form.origPrice = g.origPrice ?? undefined
  form.stock = g.stock
  form.pointsEnabled = g.pointsEnabled
  form.status = g.status === 'on'
  form.img = g.img ?? ''
  form.imgPath = g.img ?? ''
  form.preview = ''
  showModal.value = true
}

const previewSrc = computed(() => {
  if (form.preview) return form.preview
  if (form.imgPath) return imgSrc(form.imgPath)
  if (form.img) return imgSrc(form.img)
  return ''
})

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  if (!file.type.startsWith('image/')) {
    message.warning('请选择图片文件')
    return
  }
  uploading.value = true
  try {
    const r = await api.upload(file)
    form.img = r.url
    form.preview = r.url
    form.imgPath = ''
    message.success('图片已上传')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

const finalImg = computed(() => form.img || form.imgPath || '')

async function save() {
  if (!form.name.trim()) {
    message.warning('请填写商品名称')
    return
  }
  saving.value = true
  const payload = {
    name: form.name.trim(),
    cat: form.cat,
    price: form.price,
    origPrice: form.origPrice ?? form.price,
    stock: form.stock,
    pointsEnabled: form.pointsEnabled,
    status: form.status ? 'on' : 'off',
    img: finalImg.value || undefined,
  }
  try {
    if (isEdit.value) {
      await api.updateGoods(editId.value, payload as Record<string, unknown>)
      message.success('已保存')
    } else {
      await api.createGoods(payload as Record<string, unknown>)
      message.success('商品已上传')
    }
    showModal.value = false
    load()
  } finally {
    saving.value = false
  }
}

function confirmDelete(g: Goods) {
  dialog.warning({
    title: '删除商品',
    content: `确认删除商品「${g.name}」？该操作不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteGoods(g.id)
      message.success('商品已删除')
      load()
    },
  })
}

/** 批量删除：二次确认 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的商品')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除商品',
    content: `确认删除已选中的 ${count} 个商品？该操作不可恢复。`,
    positiveText: `确认删除 ${count} 个`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteGoods(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 个商品`)
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
        <h2 class="pagehead__title">积分商城</h2>
        <p class="pagehead__desc">管理积分商城商品，支持上传商品、配置价格、库存、积分抵扣与上下架。</p>
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
            <n-icon :component="CloudUploadOutline" />
          </template>
          上传商品
        </n-button>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索商品名 / 编号"
        clearable
        style="width: 240px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select v-model:value="query.cat" :options="catOptions" style="width: 110px" @update:value="resetAndLoad" />
      <n-select v-model:value="query.status" :options="statusOptions" style="width: 110px" @update:value="resetAndLoad" />
    </div>

    <div class="card">
      <n-data-table
        :columns="columns"
        :data="rows"
        :loading="loading"
        :row-key="(r: Goods) => r.id"
        v-model:checked-row-keys="checkedKeys"
        :pagination="pagination"
        remote
        :bordered="false"
      />
    </div>

    <!-- 上传 / 编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑商品' : '上传商品'"
      style="width: 680px"
      :mask-closable="false"
    >
      <div class="form-grid">
        <div>
          <div class="td-s" style="margin-bottom: 8px; font-weight: 600; color: var(--c-ink-2)">商品图片</div>
          <div class="uploader-grid">
            <div v-if="previewSrc || form.img" class="uploader-item">
              <img v-if="previewSrc" :src="previewSrc" alt="" />
              <div v-else style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:var(--c-ink-4);background:var(--c-surface-2)">
                <n-icon :component="ImageOutline" :size="22" />
              </div>
              <span class="uploader-item__del" title="移除图片" @click="form.img = ''; form.imgPath = ''; form.preview = ''">
                <n-icon :size="12" :component="TrashOutline" />
              </span>
            </div>
            <div v-else class="uploader-add" @click="pickFile">
              <n-spin :show="uploading">
                <n-icon v-if="!uploading" :component="CloudUploadOutline" :size="20" />
              </n-spin>
            </div>
            <input ref="fileInput" type="file" accept="image/*" style="display: none" @change="onFileChange" />
          </div>
          <n-input v-model:value="form.imgPath" placeholder="或填写图片路径（http/https）" style="margin-top: 10px" />
        </div>

        <div>
          <n-form label-placement="top">
            <n-form-item label="商品名称" required>
              <n-input v-model:value="form.name" placeholder="请输入商品名称" maxlength="64" />
            </n-form-item>
            <n-form-item label="分类">
              <n-select v-model:value="form.cat" :options="catOptions.slice(1)" />
            </n-form-item>
            <n-form-item label="价格（元）">
              <n-input-number v-model:value="form.price" :min="0" :precision="2" style="width: 100%" />
            </n-form-item>
            <n-form-item label="原价（元）">
              <n-input-number v-model:value="form.origPrice" :min="0" :precision="2" style="width: 100%" />
            </n-form-item>
            <n-form-item label="库存">
              <n-input-number v-model:value="form.stock" :min="0" style="width: 100%" />
            </n-form-item>
            <n-form-item label="积分抵扣">
              <n-switch v-model:value="form.pointsEnabled" />
              <span class="td-s" style="margin-left: 10px">开启后可支持积分抵扣</span>
            </n-form-item>
            <n-form-item label="上架状态">
              <n-switch v-model:value="form.status" />
              <span class="td-s" style="margin-left: 10px">{{ form.status ? '上架销售中' : '已下架' }}</span>
            </n-form-item>
          </n-form>
        </div>
      </div>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>