<script setup lang="ts">
/**
 * GoodsView.vue — 积分商城商品管理
 *
 * 职责：商品的分页查询、筛选、上传/编辑（含图片上传）、删除与批量删除、上下架与积分抵扣配置。
 * 数据来源（@/api/admin）：
 * - GET    /admin/goods                    分页列表
 * - POST   /admin/goods                    新增商品
 * - PUT    /admin/goods/{id}               更新商品
 * - DELETE /admin/goods/{id}               删除商品
 * - POST   /admin/goods/batch-delete       批量删除
 * - POST   /admin/upload                   图片上传（返回 { url }）
 * 关键交互：关键词 300ms 防抖；筛选变更回到第 1 页；图片上传前校验文件类型；删除二次确认。
 * 权限/限制：需登录访问；删除不可恢复；仅 /static 或 http(s) 图片可预览。
 */
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

// 全局消息实例：保存、上传、删除等操作的结果提示
const message = useMessage()
// 对话框实例：删除类操作前弹出二次确认
const dialog = useDialog()

// ---------- 列表 ----------
// 当前页商品列表，由 load() 请求后整体覆盖
const rows = ref<Goods[]>([])
// 表格勾选行的商品 id 集合；每次加载后剔除已不在当前页的项
const checkedKeys = ref<string[]>([])
// 列表请求中标记，透传给 n-data-table 的 loading
const loading = ref(false)
/**
 * 筛选条件
 * - keyword：商品名 / 编号模糊搜索
 * - cat：分类，'全部' 表示不筛选；其余取值为鱼竿/渔轮/饵料/工具/装备
 * - status：上架状态，'all' 全部；其余取值为 on / off
 */
const query = reactive({ keyword: '', cat: '全部', status: 'all' })
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
 * 停止输入后回到第 1 页并请求，避免逐字符触发接口。
 * @returns {void}
 */
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/**
 * 筛选变更后重置页码并重新加载（分类、状态下拉使用）
 * @returns {void}
 */
function resetAndLoad() {
  pagination.page = 1
  load()
}

/**
 * 加载当前页商品列表
 * 步骤：1) 置 loading；2) 携带筛选与分页参数请求 /admin/goods；
 * 3) 回填 rows 与 itemCount；4) 清理已不在当前页的勾选项；
 * 5) finally 复位 loading（异常由 axios 拦截器统一提示）。
 * @returns {Promise<void>}
 */
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

// 分类下拉：'全部' 表示不筛选，其余为固定商品分类
const catOptions = ['全部', '鱼竿', '渔轮', '饵料', '工具', '装备'].map((c) => ({ label: c, value: c }))
// 上架状态下拉：'all' 表示不筛选
const statusOptions = [
  { label: '全部', value: 'all' },
  { label: '上架中', value: 'on' },
  { label: '已下架', value: 'off' },
]

/**
 * 仅展示可访问的图片（/static 上传图或 http 外链），其余显示占位
 * @param {string | null} img 后端返回的图片地址
 * @returns {string} 可安全用于 <img> 的地址，空串表示使用占位图标
 */
function imgSrc(img: string | null): string {
  if (!img) return ''
  return img.startsWith('/static') || img.startsWith('http') ? img : ''
}

const columns: DataTableColumns<Goods> = [
  // 勾选列：与 v-model:checked-row-keys 双向绑定，供批量删除使用
  { type: 'selection' },
  // 商品列：缩略图（无有效图片时显示占位图标）+ 商品名 + 编号
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
  // 分类列：分类标签，配色由 catTag 统一映射
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
  // 价格列：现价高亮；原价大于现价时追加划线原价
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
  // 库存列：当前可售库存，等宽数字展示
  { title: '库存', key: 'stock', render: (row) => h('span', { class: 'num' }, row.stock) },
  // 销量列：累计销量，弱化样式展示
  { title: '销量', key: 'sales', render: (row) => h('span', { class: 'num td-s' }, row.sales) },
  // 积分抵扣列：根据 pointsEnabled 展示「支持 / 不支持」标签（色值直接使用设计 token）
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
  // 状态列：on 显示「上架中」，否则「已下架」，底色由 statusTag 映射
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
  // 更新时间列：缺失时显示「—」
  { title: '更新时间', key: 'updated', render: (row) => h('span', { class: 'td-s' }, row.updated ?? '—') },
  // 操作列：编辑与删除，固定右侧避免横向滚动时被遮挡
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
// 上传/编辑弹窗显隐
const showModal = ref(false)
// 是否编辑态：true 走 PUT 更新，false 走 POST 新增
const isEdit = ref(false)
// 编辑态下的商品 id；新增时为空串
const editId = ref('')
/**
 * 商品表单模型
 * - name：商品名，必填，提交时 trim
 * - cat：分类，默认「鱼竿」
 * - price / origPrice：现价与原价（元），origPrice 为空时提交回退为 price
 * - stock：库存，默认 0
 * - pointsEnabled：是否支持积分抵扣，默认 true
 * - status：上架状态，true=上架 / false=下架
 * - img：已上传或已有的最终图片 URL
 * - imgPath：手工填写的图片路径（与上传二选一）
 * - preview：上传成功后的本地预览地址
 */
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
// 保存请求中标记，控制弹窗「保存」按钮 loading
const saving = ref(false)
// 图片上传中标记，控制上传占位的旋转加载状态
const uploading = ref(false)
// 隐藏文件选择框的引用，用于点击自定义上传区域时触发系统选图
const fileInput = ref<HTMLInputElement | null>(null)

/** 打开上传弹窗：重置商品表单为默认值（新增商品默认下架） */
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

/**
 * 打开编辑弹窗：以选中行数据回填表单
 * @param {Goods} g 当前商品行数据
 * @returns {void}
 */
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

/**
 * 预览图地址（优先级由高到低）
 * 上传后的 preview > 手工填写的 imgPath > 已保存的 img，均经 imgSrc 过滤非法地址。
 */
const previewSrc = computed(() => {
  if (form.preview) return form.preview
  if (form.imgPath) return imgSrc(form.imgPath)
  if (form.img) return imgSrc(form.img)
  return ''
})

/** 触发隐藏文件选择框，打开系统选图对话框 */
function pickFile() {
  fileInput.value?.click()
}

/**
 * 选择图片后上传
 * 步骤：1) 读取首个文件并校验 MIME 是否为图片；
 * 2) 置 uploading 并调用 /admin/upload；3) 成功后写入 img / preview 并清空手工路径；
 * 4) finally 关闭 loading 并清空 input，便于重复选择同一文件。
 * @param {Event} e 文件输入框的 change 事件
 * @returns {Promise<void>}
 */
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

// 最终提交的图片地址：优先上传结果 img，其次手工路径 imgPath，均无则为空串
const finalImg = computed(() => form.img || form.imgPath || '')

/**
 * 保存商品（新增或编辑）
 * 步骤：1) 商品名非空校验；2) 组装 payload（原价缺省取现价、状态转 on/off）；
 * 3) 按 isEdit 调用更新或创建接口；4) 成功后关闭弹窗并刷新列表；
 * 5) finally 复位 saving（接口异常由 axios 拦截器统一提示）。
 * @returns {Promise<void>}
 */
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

/**
 * 删除单个商品（二次确认后执行）
 * @param {Goods} g 目标商品
 * @returns {void}
 */
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

/**
 * 批量删除：二次确认
 * 未勾选时给出提示；确认后按勾选的商品 id 调用批量删除，
 * 成功则清空勾选并刷新列表。
 * @returns {void}
 */
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

// 首次进入页面加载第 1 页商品数据
onMounted(load)
</script>

<template>
  <!-- 区块：商品管理根容器 / 页头 + 筛选工具栏 + 表格卡片 + 上传/编辑弹窗 -->
  <div class="page">
    <!-- 区块：页头 / 左侧标题说明，右侧已选计数、批量删除与上传商品入口 -->
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

    <!-- 区块：筛选工具栏 / 关键词搜索 + 分类筛选 + 上架状态筛选，横向排列 -->
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

    <!-- 区块：商品表格卡片 / remote 分页，勾选与 loading 由脚本状态驱动 -->
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

    <!-- 区块：上传 / 编辑弹窗 / 左右两栏：左侧图片上传与路径，右侧商品基础信息表单 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑商品' : '上传商品'"
      style="width: 680px"
      :mask-closable="false"
    >
      <!-- 弹窗两栏布局：.form-grid 为两列等宽栅格（列间距 16px），左右两栏各自纵向排列 -->
      <div class="form-grid">
        <div>
          <div class="td-s" style="margin-bottom: 8px; font-weight: 600; color: var(--c-ink-2)">商品图片</div>
          <!-- 图片上传区：已有预览时显示缩略图与删除角标，否则显示点击上传占位 -->
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
          <!-- 右侧：商品基础信息表单；价格与库存使用 input-number 约束非负，开关控制积分抵扣与上架 -->
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