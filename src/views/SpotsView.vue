<script setup lang="ts">
/**
 * SpotsView.vue — 运营管理 · 钓点管理
 *
 * 职责：以卡片网格展示钓点，支持关键字/状态筛选、分页、上下架、编辑、单条/批量删除与新增钓点。
 * 接口来源：@/api/admin 的 spots / createSpot / updateSpot / deleteSpot / batchDeleteSpots / upload，
 *           实体类型 Spot；图片上传返回的 url 直接写入 gallery。
 * 关键交互：关键字输入 300ms 防抖；筛选变更回到第 1 页；上下架为乐观更新（先改本地再刷新提示）；
 *           新增与编辑共用弹窗，通过 isEdit 区分；图片支持多选上传与手工填写路径。
 * 限制：每页条数 6/12/24；仅接受 image/* 文件；首张图片作为封面 cover；
 *       图片路径必须以 /static 或 http 开头才会渲染；批量删除只作用于当前已勾选卡片。
 */
import {
  AddOutline,
  ChatbubbleEllipsesOutline,
  CheckmarkOutline,
  CreateOutline,
  ImageOutline,
  LocationOutline,
  MapOutline,
  RemoveOutline,
  SearchOutline,
  Star,
  StarOutline,
  TimeOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { NButton, NCheckbox, NIcon, NInputNumber, NSelect, NSwitch, NTag, useDialog, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type Spot, type SpotCoordHistory, type SpotFishabilityDetail } from '@/api/admin'
import CoordPicker from '@/components/CoordPicker.vue'
import { fishTag, payTag, statusTag } from '@/utils/tags'

/** 标签类型（n-tag type 取值） */
type TagType = 'default' | 'success' | 'warning' | 'error' | 'info' | 'primary'

/** 数据来源文案 */
function sourceLabel(s: string | undefined) {
  return s === 'ugc' ? '用户投稿' : s === 'admin' ? '后台维护' : s === 'ai' ? 'AI 生成' : s || '—'
}

/** 数据来源标签色 */
function sourceTagType(s: string | undefined): TagType {
  return s === 'ugc' ? 'info' : s === 'admin' ? 'primary' : 'default'
}

/** 核实等级文案 */
function verifiedLabel(v: string | undefined) {
  return v === 'verified' ? '已核实' : v === 'user_verified' ? '用户核实' : '未核实'
}

/** 核实等级标签色 */
function verifiedTagType(v: string | undefined): TagType {
  return v === 'verified' ? 'success' : v === 'user_verified' ? 'info' : 'default'
}

const message = useMessage() // 操作成功/校验失败的轻提示
const dialog = useDialog() // 删除类操作的二次确认弹窗

// 当前页钓点列表，由 api.spots 返回
const rows = ref<Spot[]>([])
// 已勾选的钓点 id 集合（卡片勾选框维护），供批量删除使用
const checkedKeys = ref<string[]>([])
// 列表加载态，请求期间显示 n-spin 遮罩
const loading = ref(false)
// 筛选条件：keyword 匹配钓点名或城市，status=all|online|offline
const query = reactive({ keyword: '', status: 'all' })
// 分页配置（服务端分页）：pageSize 默认 6，可选 6/12/24；切换时重新加载并回填总数
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

// 关键字输入防抖定时器句柄：300ms 内只触发最后一次查询
let timer: ReturnType<typeof setTimeout> | undefined
/**
 * 关键字输入的防抖处理：延迟 300ms 后回到第 1 页重新加载，
 * 避免逐字符请求接口造成卡片列表抖动。
 */
function onKeyword() {
  clearTimeout(timer)
  timer = setTimeout(() => {
    pagination.page = 1
    load()
  }, 300)
}

/** 筛选下拉变更：回到第 1 页并按新条件加载。 */
function resetAndLoad() {
  pagination.page = 1
  load()
}

/**
 * 加载钓点列表（服务端分页）。
 * 成功后回填总数，并清理不在当前页的勾选项，避免批量删除误删不可见数据。
 * 请求异常由 http 拦截器统一提示，这里仅负责复位 loading。
 */
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

/**
 * 将评分四舍五入为 5 个布尔值，供星标图标渲染。
 * @param rating 钓点评分（0~5）
 * @returns 长度为 5 的布尔数组，true 表示该位置显示实心星
 */
function stars(rating: number) {
  const n = Math.round(rating)
  return Array.from({ length: 5 }, (_, i) => i < n)
}

// ---------- 上下架 ----------
const showStatus = ref(false)
const statusTarget = ref<Spot | null>(null)
const statusReason = ref('')
const statusSaving = ref(false)

/** 打开下架 / 恢复弹窗 */
function openStatus(spot: Spot) {
  statusTarget.value = spot
  statusReason.value = ''
  showStatus.value = true
}

/** 调用上下架接口并同步本地状态 */
async function saveStatus() {
  if (!statusTarget.value) return
  statusSaving.value = true
  try {
    const target = statusTarget.value
    const r = await api.toggleSpotStatus(target.id, statusReason.value.trim() || undefined)
    target.status = r.status
    showStatus.value = false
    message.success(r.status === 'online' ? `「${target.name}」已恢复上架` : `「${target.name}」已下架`)
  } finally {
    statusSaving.value = false
  }
}

// ---------- 坐标校正 ----------
const showCoord = ref(false)
const coordTarget = ref<Spot | null>(null)
const coordSaving = ref(false)
const coordForm = reactive({ coords: '', reason: '' })

/** 打开坐标校正弹窗 */
function openCoord(spot: Spot) {
  coordTarget.value = spot
  coordForm.coords = spot.coords ?? ''
  coordForm.reason = ''
  showCoord.value = true
}

/** 提交坐标校正：校验格式与原因后调用接口，成功后刷新列表 */
async function saveCoord() {
  if (!coordTarget.value) return
  const coords = coordForm.coords.trim()
  if (!/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(coords)) {
    message.warning('坐标格式应为 lng,lat，如 120.15,30.28')
    return
  }
  if (!coordForm.reason.trim()) {
    message.warning('请填写校正原因')
    return
  }
  coordSaving.value = true
  try {
    const r = await api.updateSpotCoord(coordTarget.value.id, {
      coords,
      reason: coordForm.reason.trim(),
    })
    message.success(`坐标已更新，偏移约 ${r.distanceKm} km`)
    showCoord.value = false
    load()
  } finally {
    coordSaving.value = false
  }
}

// ---------- 坐标历史 ----------
const showHistory = ref(false)
const historyTarget = ref<Spot | null>(null)
const historyRows = ref<SpotCoordHistory[]>([])
const historyLoading = ref(false)

/** 打开历史弹窗并拉取坐标变更记录 */
async function openHistory(spot: Spot) {
  historyTarget.value = spot
  historyRows.value = []
  showHistory.value = true
  historyLoading.value = true
  try {
    historyRows.value = await api.spotHistory(spot.id)
  } finally {
    historyLoading.value = false
  }
}

// ---------- 钓况反馈 ----------
const showFish = ref(false)
const fishTarget = ref<Spot | null>(null)
const fishLoading = ref(false)
const fishDetail = ref<SpotFishabilityDetail>({
  yes: 0,
  no: 0,
  limit: 5,
  hidden: false,
  list: [],
})

/** 打开钓况反馈弹窗：先用列表中的统计占位，再拉取逐条反馈明细 */
async function openFish(spot: Spot) {
  fishTarget.value = spot
  fishDetail.value = {
    yes: spot.fishYes ?? 0,
    no: spot.fishNo ?? 0,
    limit: 5,
    hidden: !!spot.fishHidden,
    list: [],
  }
  showFish.value = true
  fishLoading.value = true
  try {
    fishDetail.value = await api.spotFishability(spot.id)
  } finally {
    fishLoading.value = false
  }
}

/** 反馈结论文案 */
function verdictLabel(v: string) {
  return v === 'yes' ? '可以作钓' : '无法作钓'
}

/** 反馈结论标签色 */
function verdictTagType(v: string): TagType {
  return v === 'yes' ? 'success' : 'error'
}

/**
 * 删除单个钓点：二次确认后调用删除接口并刷新列表。
 * @param spot 待删除的钓点
 */
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
// 新增/编辑弹窗显隐
const showModal = ref(false)
// 是否为编辑模式：true 走 updateSpot，false 走 createSpot
const isEdit = ref(false)
// 编辑中的钓点 id，仅 isEdit 为 true 时有效
const editId = ref('')
// 表单数据：字段与后端 Spot 对齐；fish/galleryPath 在界面用逗号分隔字符串编辑，提交前再转数组
const form = reactive({
  name: '',
  city: '',
  coords: '',
  address: '',
  water: '',
  bottom: '',
  crowd: '',
  note: '',
  pay: '免费', // 收费说明，默认免费
  fish: '',
  status: true, // 上架开关，true=online
  gallery: [] as string[],
  galleryPath: '', // 手工填写的图片路径（逗号分隔）
})
// 保存请求进行中，用于按钮 loading 防止重复提交
const saving = ref(false)
// 图片上传进行中，用于上传按钮 spinner
const uploading = ref(false)
// 隐藏的文件选择框引用，由图片选择按钮触发
const fileInput = ref<HTMLInputElement | null>(null)

/** 打开新增弹窗：重置为默认表单值并切换为新增模式。 */
function openCreate() {
  isEdit.value = false
  editId.value = ''
  form.name = ''
  form.city = ''
  form.coords = ''
  form.address = ''
  form.water = ''
  form.bottom = ''
  form.crowd = ''
  form.note = ''
  form.pay = '免费'
  form.fish = ''
  form.status = true
  form.gallery = []
  form.galleryPath = ''
  showModal.value = true
}

/**
 * 打开编辑弹窗：把钓点字段回填到表单，鱼种数组转为逗号分隔字符串。
 * @param s 待编辑的钓点
 */
function openEdit(s: Spot) {
  isEdit.value = true
  editId.value = s.id
  form.name = s.name
  form.city = s.city ?? ''
  form.coords = s.coords ?? ''
  form.address = s.address ?? ''
  form.water = s.water ?? ''
  form.bottom = s.bottom ?? ''
  form.crowd = s.crowd ?? ''
  form.note = s.note ?? ''
  form.pay = s.pay ?? '免费'
  form.fish = (s.fish ?? []).join(', ')
  form.status = s.status === 'online'
  form.gallery = [...(s.gallery ?? [])]
  form.galleryPath = ''
  showModal.value = true
}

/** 触发隐藏的文件选择框。 */
function pickFile() {
  fileInput.value?.click()
}

/**
 * 图片上传：逐个过滤非图片文件并串行调用 api.upload，返回的 url 追加到 gallery。
 * 串行可避免并发上传导致顺序错乱；完成后清空 input 以允许重复选择同一文件。
 * @param e 文件选择框的 change 事件
 */
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

/** 从 gallery 中移除指定下标的图片。 */
function removeImg(i: number) {
  form.gallery.splice(i, 1)
}

// 提交用图片列表：上传结果与手工路径合并去重；手工路径支持中英文逗号分隔
const finalGallery = computed(() => {
  const list = [...form.gallery]
  if (form.galleryPath.trim()) {
    for (const p of form.galleryPath.split(/[,，]/).map((s) => s.trim()).filter(Boolean)) {
      if (!list.includes(p)) list.push(p)
    }
  }
  return list
})

/**
 * 保存钓点（新增或编辑）。
 * 先校验名称必填；随后组装 payload：空字符串转 undefined 交给后端默认值，
 * 鱼种与图片转数组，首张图片作为封面，status 布尔值转 online/offline。
 * 成功后关闭弹窗并刷新列表；请求异常由 http 拦截器提示，这里仅复位 saving。
 */
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
    address: form.address.trim() || undefined,
    water: form.water.trim() || undefined,
    bottom: form.bottom.trim() || undefined,
    crowd: form.crowd.trim() || undefined,
    note: form.note.trim() || undefined,
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

// 首屏加载钓点列表（按默认分页与筛选）
onMounted(load)
</script>

<template>
  <div class="page spots-page">
    <!-- 区块：页头 / 左侧标题与说明，右侧已选数量、批量删除与新增入口 / 未勾选时批量删除禁用 -->
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

    <!-- 区块：筛选与分页栏 / 左侧关键字与状态下拉，右侧分页器贴右对齐 / 关键字防抖 300ms，切页立即请求 -->
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

    <!-- 区块：钓点卡片列表 / 列表区独立滚动，页头与筛选分页栏固定 / 无图片时展示占位图标 -->
    <div class="spots-scroll">
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
                <n-tag
                  v-if="s.source"
                  size="tiny"
                  round
                  :bordered="false"
                  :type="sourceTagType(s.source)"
                >
                  {{ sourceLabel(s.source) }}
                </n-tag>
                <n-tag
                  size="tiny"
                  round
                  :bordered="false"
                  :type="verifiedTagType(s.verifiedLevel)"
                >
                  {{ verifiedLabel(s.verifiedLevel) }}
                </n-tag>
                <n-tag
                  size="tiny"
                  round
                  :bordered="false"
                  :type="s.fishNo > 0 ? 'warning' : 'default'"
                  :title="`可以作钓 ${s.fishYes} 人 / 无法作钓 ${s.fishNo} 人`"
                >
                  可钓 {{ s.fishYes }} · 无法 {{ s.fishNo }}
                </n-tag>
                <n-tag v-if="s.fishHidden" size="tiny" round :bordered="false" type="error">
                  已隐藏
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
              <div class="spot-card__by">{{ s.addedBy }} · {{ s.createdAt }}</div>
              <div class="rowbtns" style="margin-top: 6px; flex-wrap: wrap">
                <n-button
                  size="small"
                  :type="s.status === 'online' ? 'warning' : 'primary'"
                  :quaternary="s.status === 'online'"
                  @click="openStatus(s)"
                >
                  <template #icon>
                    <n-icon :component="s.status === 'online' ? RemoveOutline : CheckmarkOutline" />
                  </template>
                  {{ s.status === 'online' ? '下架' : '恢复' }}
                </n-button>
                <n-button size="small" @click="openEdit(s)">
                  <template #icon>
                    <n-icon :component="CreateOutline" />
                  </template>
                  编辑
                </n-button>
                <n-button size="small" @click="openCoord(s)">
                  <template #icon>
                    <n-icon :component="MapOutline" />
                  </template>
                  校正坐标
                </n-button>
                <n-button size="small" quaternary @click="openHistory(s)">
                  <template #icon>
                    <n-icon :component="TimeOutline" />
                  </template>
                  历史
                </n-button>
                <n-button size="small" quaternary @click="openFish(s)">
                  <template #icon>
                    <n-icon :component="ChatbubbleEllipsesOutline" />
                  </template>
                  反馈
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
          <!-- 区块：空态 / 请求结束且无数据时展示，给出「暂无钓点数据」提示 -->
          <div v-if="!rows.length && !loading" class="card empty">
            <n-icon :component="LocationOutline" :size="28" />
            暂无钓点数据
          </div>
        </div>
      </n-spin>
    </div>

    <!-- 区块：新增/编辑弹窗 / 左右两栏：左图片上传，右基础信息表单 / mask-closable=false 防止误点遮罩丢失输入 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑钓点' : '新增钓点'"
      style="width: 680px"
      content-style="max-height: 62vh; overflow-y: auto"
      :mask-closable="false"
    >
      <div class="form-grid">
        <!-- 区块：图片上传 / 缩略图网格 + 添加按钮 + 手工路径输入 / 仅渲染 /static 或 http 路径，非图片地址显示占位 -->
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

        <!-- 区块：基础信息表单 / 名称必填，鱼种逗号分隔，状态开关映射 online/offline -->
        <div>
          <n-form label-placement="top">
            <n-form-item label="钓点名称" required>
              <n-input v-model:value="form.name" placeholder="请输入钓点名称" maxlength="64" />
            </n-form-item>
            <n-form-item label="城市">
              <n-input v-model:value="form.city" placeholder="如：杭州市 西湖区" />
            </n-form-item>
            <n-form-item label="坐标">
              <n-input v-model:value="form.coords" placeholder="如：120.1032,30.2413（lng,lat）" />
            </n-form-item>
            <n-form-item label="详细地址">
              <n-input v-model:value="form.address" placeholder="如：XX 路与 XX 路交叉口东侧" />
            </n-form-item>
            <n-form-item label="水域">
              <n-input v-model:value="form.water" placeholder="如：野水域 / 黑坑 / 水库" />
            </n-form-item>
            <n-form-item label="水底">
              <n-input v-model:value="form.bottom" placeholder="如：泥底 / 石底 / 未知" />
            </n-form-item>
            <n-form-item label="人流">
              <n-input v-model:value="form.crowd" placeholder="如：较多 / 一般 / 较少" />
            </n-form-item>
            <n-form-item label="收费">
              <n-input v-model:value="form.pay" placeholder="如：免费 / 收费 20 元/天" />
            </n-form-item>
            <n-form-item label="鱼种（逗号分隔）">
              <n-input v-model:value="form.fish" placeholder="如：鲫鱼, 鲤鱼, 白条" />
            </n-form-item>
            <n-form-item label="钓点说明" class="full">
              <n-input
                v-model:value="form.note"
                type="textarea"
                :autosize="{ minRows: 2, maxRows: 4 }"
                placeholder="补充说明（可选）"
              />
            </n-form-item>
            <n-form-item label="状态">
              <n-switch v-model:value="form.status" />
              <span class="td-s" style="margin-left: 10px">{{ form.status ? '上架展示' : '已下架' }}</span>
            </n-form-item>
          </n-form>
        </div>
      </div>
      <!-- 区块：弹窗底部操作 / 取消直接关闭，保存时按钮 loading 防重复提交 -->
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 区块：校正坐标弹窗 / 输入新坐标与原因，调用坐标校正接口 -->
    <n-modal
      v-model:show="showCoord"
      preset="card"
      title="校正坐标"
      style="width: 480px"
      content-style="max-height: 68vh; overflow-y: auto"
      :mask-closable="false"
    >
      <n-form label-placement="top">
        <n-form-item :label="`钓点：${coordTarget?.name ?? ''}`">
          <span class="td-s">当前坐标：{{ coordTarget?.coords || '—' }}</span>
        </n-form-item>
        <n-form-item label="新坐标（lng,lat）" required>
          <n-input v-model:value="coordForm.coords" placeholder="如：120.15,30.28" />
        </n-form-item>
        <n-form-item label="地图选点（点击落点 / 拖动标记，与上方文本同步）">
          <CoordPicker v-model="coordForm.coords" :height="300" />
        </n-form-item>
        <n-form-item label="校正原因" required>
          <n-input
            v-model:value="coordForm.reason"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 4 }"
            placeholder="如：现场实测坐标 / 用户纠错核实"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showCoord = false">取消</n-button>
          <n-button type="primary" :loading="coordSaving" @click="saveCoord">保存坐标</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 区块：坐标变更历史弹窗 -->
    <n-modal
      v-model:show="showHistory"
      preset="card"
      :title="`坐标历史 · ${historyTarget?.name ?? ''}`"
      style="width: 680px"
    >
      <n-spin :show="historyLoading">
        <n-table v-if="historyRows.length" size="small" :bordered="false">
          <thead>
            <tr>
              <th style="width: 140px">时间</th>
              <th>坐标变更</th>
              <th style="width: 160px">原因</th>
              <th style="width: 80px">来源</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in historyRows" :key="h.id">
              <td class="td-s">{{ h.createdAt || '—' }}</td>
              <td class="num">{{ h.oldCoord || '—' }} → {{ h.newCoord || '—' }}</td>
              <td>{{ h.reason || '—' }}</td>
              <td>{{ h.source || '—' }}</td>
            </tr>
          </tbody>
        </n-table>
        <div v-else-if="!historyLoading" class="td-s" style="padding: 12px 0">
          暂无坐标变更记录
        </div>
      </n-spin>
      <template #footer>
        <div style="display: flex; justify-content: flex-end">
          <n-button @click="showHistory = false">关闭</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 区块：钓况反馈弹窗 / 统计汇总 + 逐条反馈记录 / 「无法作钓」达阈值后钓点不再对外展示 -->
    <n-modal
      v-model:show="showFish"
      preset="card"
      :title="`钓况反馈 · ${fishTarget?.name ?? ''}`"
      style="width: 680px"
    >
      <n-spin :show="fishLoading">
        <div class="fish-summary">
          <n-tag type="success" :bordered="false" round>可以作钓 {{ fishDetail.yes }}</n-tag>
          <n-tag type="error" :bordered="false" round>无法作钓 {{ fishDetail.no }}</n-tag>
          <n-tag v-if="fishDetail.hidden" type="error" :bordered="false" round>
            已达 {{ fishDetail.limit }} 人阈值，已隐藏
          </n-tag>
          <n-tag v-else type="default" :bordered="false" round>
            距隐藏阈值还差 {{ Math.max(0, fishDetail.limit - fishDetail.no) }} 人
          </n-tag>
        </div>
        <n-table v-if="fishDetail.list.length" size="small" :bordered="false">
          <thead>
            <tr>
              <th style="width: 180px">反馈用户</th>
              <th style="width: 110px">结论</th>
              <th style="width: 140px">最近反馈时间</th>
              <th>用户号</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in fishDetail.list" :key="f.id">
              <td>{{ f.user }}</td>
              <td>
                <n-tag size="small" :type="verdictTagType(f.verdict)" :bordered="false" round>
                  {{ verdictLabel(f.verdict) }}
                </n-tag>
              </td>
              <td class="td-s">{{ f.updatedAt || f.createdAt || '—' }}</td>
              <td class="td-s">{{ f.uid || '—' }}</td>
            </tr>
          </tbody>
        </n-table>
        <div v-else-if="!fishLoading" class="td-s" style="padding: 12px 0">
          暂无钓友反馈
        </div>
      </n-spin>
      <template #footer>
        <div style="display: flex; justify-content: flex-end">
          <n-button @click="showFish = false">关闭</n-button>
        </div>
      </template>
    </n-modal>

    <!-- 区块：下架 / 恢复弹窗 / 下架时可填写原因 -->
    <n-modal
      v-model:show="showStatus"
      preset="card"
      :title="statusTarget?.status === 'online' ? '下架钓点' : '恢复上架'"
      style="width: 440px"
      :mask-closable="false"
    >
      <n-form label-placement="top">
        <n-form-item label="钓点">
          <span>{{ statusTarget?.name }}</span>
        </n-form-item>
        <n-form-item v-if="statusTarget?.status === 'online'" label="下架原因">
          <n-input
            v-model:value="statusReason"
            type="textarea"
            :autosize="{ minRows: 2, maxRows: 3 }"
            placeholder="如：水域禁钓 / 信息失效（可选）"
          />
        </n-form-item>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showStatus = false">取消</n-button>
          <n-button
            :type="statusTarget?.status === 'online' ? 'warning' : 'primary'"
            :loading="statusSaving"
            @click="saveStatus"
          >
            {{ statusTarget?.status === 'online' ? '确认下架' : '确认恢复' }}
          </n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>

<style scoped>
/* 页面固定为视口高度：页头与筛选/分页栏保持不动，仅卡片列表内部滚动 */
.spots-page {
  height: calc(100vh - var(--topbar-h));
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding-bottom: 16px;
}

.spots-page .pagehead,
.spots-page .toolbar {
  flex-shrink: 0;
}

.spots-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 6px;
}

/* 钓况反馈弹窗：统计标签横向排列，与明细表留出间距 */
.fish-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
</style>
