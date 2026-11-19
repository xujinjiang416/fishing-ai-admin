<script setup lang="ts">
import {
  AddOutline,
  CheckmarkOutline,
  CreateOutline,
  ImageOutline,
  LocationOutline,
  RemoveOutline,
  SearchOutline,
  Star,
  StarOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { NButton, NCheckbox, NIcon, NInputNumber, NSelect, NSwitch, NTag, useDialog, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type Spot } from '@/api/admin'
import { fishTag, payTag, statusTag } from '@/utils/tags'

const message = useMessage()
const dialog = useDialog()

const rows = ref<Spot[]>([])
const checkedKeys = ref<string[]>([])
const loading = ref(false)
const query = reactive({ keyword: '', status: 'all' })
const pagination = reactive({
  page: 1,
  pageSize: 6,
  itemCount: 0,
  showSizePicker: true,
  pageSizes: [6, 12, 24],
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
    const r = await api.spots({
      keyword: query.keyword,
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

/** 展示用图片：优先 cover，其次 gallery 第一张；仅 /static 或 http 可访问 */
function imgSrc(spot: Spot): string {
  const src = spot.cover || spot.gallery[0] || ''
  return src.startsWith('/static') || src.startsWith('http') ? src : ''
}

function stars(rating: number) {
  const n = Math.round(rating)
  return Array.from({ length: 5 }, (_, i) => i < n)
}

async function toggle(spot: Spot) {
  const status = spot.status === 'online' ? 'offline' : 'online'
  await api.updateSpot(spot.id, { status })
  spot.status = status
  message.success(status === 'online' ? `「${spot.name}」已上架` : `「${spot.name}」已下架`)
}

function confirmDelete(spot: Spot) {
  dialog.warning({
    title: '删除钓点',
    content: `确认删除钓点「${spot.name}」？该操作不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deleteSpot(spot.id)
      message.success('钓点已删除')
      load()
    },
  })
}

/** 卡片勾选切换 */
function toggleCheck(id: string, checked: boolean) {
  if (checked) {
    if (!checkedKeys.value.includes(id)) checkedKeys.value.push(id)
  } else {
    checkedKeys.value = checkedKeys.value.filter((k) => k !== id)
  }
}

/** 批量删除：二次确认 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的钓点')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除钓点',
    content: `确认删除已选中的 ${count} 个钓点？该操作不可恢复。`,
    positiveText: `确认删除 ${count} 个`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeleteSpots(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 个钓点`)
      checkedKeys.value = []
      load()
    },
  })
}

// ---------- 新增 / 编辑 ----------
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref('')
const form = reactive({
  name: '',
  city: '',
  coords: '',
  dist: 0,
  pay: '免费',
  fish: '',
  status: true,
  gallery: [] as string[],
  galleryPath: '', // 手工填写的图片路径（逗号分隔）
})
const saving = ref(false)
const uploading = ref(false)
const fileInput = ref<HTMLInputElement | null>(null)

function openCreate() {
  isEdit.value = false
  editId.value = ''
  form.name = ''
  form.city = ''
  form.coords = ''
  form.dist = 0
  form.pay = '免费'
  form.fish = ''
  form.status = true
  form.gallery = []
  form.galleryPath = ''
  showModal.value = true
}

function openEdit(s: Spot) {
  isEdit.value = true
  editId.value = s.id
  form.name = s.name
  form.city = s.city ?? ''
  form.coords = s.coords ?? ''
  form.dist = s.dist
  form.pay = s.pay ?? '免费'
  form.fish = (s.fish ?? []).join(', ')
  form.status = s.status === 'online'
  form.gallery = [...(s.gallery ?? [])]
  form.galleryPath = ''
  showModal.value = true
}

function pickFile() {
  fileInput.value?.click()
}

async function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return
  uploading.value = true
  try {
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue
      const r = await api.upload(file)
      form.gallery.push(r.url)
    }
    message.success('图片已上传')
  } finally {
    uploading.value = false
    input.value = ''
  }
}

function removeImg(i: number) {
  form.gallery.splice(i, 1)
}

const finalGallery = computed(() => {
  const list = [...form.gallery]
  if (form.galleryPath.trim()) {
    for (const p of form.galleryPath.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
      if (!list.includes(p)) list.push(p)
    }
  }
  return list
})

async function save() {
  if (!form.name.trim()) {
    message.warning('请填写钓点名称')
    return
  }
  saving.value = true
  const payload = {
    name: form.name.trim(),
    city: form.city.trim() || undefined,
    coords: form.coords.trim() || undefined,
    dist: form.dist,
    pay: form.pay.trim() || '免费',
    fish: form.fish.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    gallery: finalGallery.value,
    cover: finalGallery.value[0] || null,
    status: form.status ? 'online' : 'offline',
  }
  try {
    if (isEdit.value) {
      await api.updateSpot(editId.value, payload as Record<string, unknown>)
      message.success('已保存')
    } else {
      await api.createSpot(payload as Record<string, unknown>)
      message.success('钓点已创建')
    }
    showModal.value = false
    load()
  } finally {
    saving.value = false
  }
}

onMounted(load)
</script>

<template>
  <div class="page">
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">钓点管理</h2>
        <p class="pagehead__desc">管理已生成的钓点，支持上传图片、编辑信息、上下架与新增钓点。</p>
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
            <n-icon :component="LocationOutline" />
          </template>
          新增钓点
        </n-button>
      </div>
    </div>

    <div class="toolbar">
      <n-input
        v-model:value="query.keyword"
        placeholder="搜索钓点名 / 城市"
        clearable
        style="width: 240px"
        @update:value="onKeyword"
      >
        <template #prefix>
          <n-icon :component="SearchOutline" />
        </template>
      </n-input>
      <n-select
        v-model:value="query.status"
        :options="[
          { label: '全部', value: 'all' },
          { label: '上架', value: 'online' },
          { label: '下架', value: 'offline' },
        ]"
        style="width: 110px"
        @update:value="resetAndLoad"
      />
      <div style="margin-left: auto; display: flex; align-items: center; gap: 10px">
        <n-pagination
          v-model:page="pagination.page"
          :item-count="pagination.itemCount"
          :page-size="pagination.pageSize"
          :page-sizes="pagination.pageSizes"
          show-size-picker
          :on-update:page="(p: number) => { pagination.page = p; load() }"
          :on-update:page-size="(s: number) => { pagination.pageSize = s; pagination.page = 1; load() }"
        />
      </div>
    </div>

    <n-spin :show="loading">
      <div class="spot-grid">
        <div v-for="s in rows" :key="s.id" class="spot-card">
          <template v-if="imgSrc(s)">
            <img v-if="imgSrc(s)" :src="imgSrc(s)" class="spot-card__cover" alt="" />
          </template>
          <div v-else class="spot-card__cover" style="display: flex; align-items: center; justify-content: center; color: var(--c-ink-4)">
            <n-icon :component="ImageOutline" :size="24" />
          </div>

          <div class="spot-card__body">
            <div class="spot-card__title">
              <n-checkbox
                :checked="checkedKeys.includes(s.id)"
                @update:checked="(v: boolean) => toggleCheck(s.id, v)"
              />
              {{ s.name }}
              <n-tag
                size="small"
                round
                :color="statusTag(s.status).color"
                :text-color="statusTag(s.status).textColor"
              >
                {{ s.status === 'online' ? '已上架' : '已下架' }}
              </n-tag>
              <n-tag size="small" round :color="payTag(s.pay).color" :text-color="payTag(s.pay).textColor">
                {{ s.pay ?? '—' }}
              </n-tag>
            </div>
            <div class="spot-card__sub">{{ s.city ?? '—' }}{{ s.coords ? ` · ${s.coords}` : '' }}</div>
            <div class="spot-card__fish">
              <n-tag
                v-for="f in s.fish"
                :key="f"
                size="tiny"
                round
                :color="fishTag().color"
                :text-color="fishTag().textColor"
              >
                {{ f }}
              </n-tag>
            </div>
            <div class="stars">
              <n-icon
                v-for="(on, i) in stars(s.rating)"
                :key="i"
                :component="on ? Star : StarOutline"
                :size="14"
              />
              <span class="rate-num">{{ s.rating.toFixed(1) }}</span>
              <span class="td-s">· {{ s.commentCount }} 条评论</span>
            </div>
          </div>

          <div class="spot-card__right">
            <div class="spot-card__dist">{{ s.dist.toFixed(1) }} km</div>
            <div class="spot-card__by">{{ s.addedBy }} · {{ s.createdAt }}</div>
            <div class="rowbtns" style="margin-top: 6px">
              <n-button
                size="small"
                :type="s.status === 'online' ? 'warning' : 'primary'"
                :quaternary="s.status === 'online'"
                @click="toggle(s)"
              >
                <template #icon>
                  <n-icon :component="s.status === 'online' ? RemoveOutline : CheckmarkOutline" />
                </template>
                {{ s.status === 'online' ? '下架' : '上架' }}
              </n-button>
              <n-button size="small" @click="openEdit(s)">
                <template #icon>
                  <n-icon :component="CreateOutline" />
                </template>
                编辑
              </n-button>
              <n-button size="small" type="error" quaternary @click="confirmDelete(s)">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
                删除
              </n-button>
            </div>
          </div>
        </div>
        <div v-if="!rows.length && !loading" class="card empty">
          <n-icon :component="LocationOutline" :size="28" />
          暂无钓点数据
        </div>
      </div>
    </n-spin>

    <!-- 新增 / 编辑弹窗 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑钓点' : '新增钓点'"
      style="width: 680px"
      :mask-closable="false"
    >
      <div class="form-grid">
        <div>
          <div class="td-s" style="margin-bottom: 8px; font-weight: 600; color: var(--c-ink-2)">钓点图片（多图）</div>
          <div class="uploader-grid">
            <div v-for="(g, i) in form.gallery" :key="i" class="uploader-item">
              <img
                v-if="g.startsWith('/static') || g.startsWith('http')"
                :src="g"
                alt=""
              />
              <div v-else style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; color: var(--c-ink-4); background: var(--c-surface-2)">
                <n-icon :component="ImageOutline" :size="22" />
              </div>
              <span class="uploader-item__del" @click="removeImg(i)">
                <n-icon :size="12" :component="TrashOutline" />
              </span>
            </div>
            <div class="uploader-add" @click="pickFile">
              <n-spin :show="uploading">
                <n-icon v-if="!uploading" :component="AddOutline" :size="20" />
              </n-spin>
            </div>
            <input ref="fileInput" type="file" accept="image/*" multiple style="display: none" @change="onFileChange" />
          </div>
          <n-input
            v-model:value="form.galleryPath"
            placeholder="或填写图片路径（逗号分隔多条）"
            style="margin-top: 10px"
          />
        </div>

        <div>
          <n-form label-placement="top">
            <n-form-item label="钓点名称" required>
              <n-input v-model:value="form.name" placeholder="请输入钓点名称" maxlength="64" />
            </n-form-item>
            <n-form-item label="城市">
              <n-input v-model:value="form.city" placeholder="如：杭州市 西湖区" />
            </n-form-item>
            <n-form-item label="坐标">
              <n-input v-model:value="form.coords" placeholder="如：30.2413°N, 120.1032°E" />
            </n-form-item>
            <n-form-item label="距离（km）">
              <n-input-number v-model:value="form.dist" :min="0" :precision="1" :step="0.5" style="width: 100%" />
            </n-form-item>
            <n-form-item label="收费">
              <n-input v-model:value="form.pay" placeholder="如：免费 / 收费 20 元/天" />
            </n-form-item>
            <n-form-item label="鱼种（逗号分隔）">
              <n-input v-model:value="form.fish" placeholder="如：鲫鱼, 鲤鱼, 白条" />
            </n-form-item>
            <n-form-item label="状态">
              <n-switch v-model:value="form.status" />
              <span class="td-s" style="margin-left: 10px">{{ form.status ? '上架展示' : '已下架' }}</span>
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