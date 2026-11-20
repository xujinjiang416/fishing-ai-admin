<script setup lang="ts">
/**
 * PlansView.vue — 会员套餐管理
 *
 * 职责：会员套餐的卡片式展示与购买数据统计、新增/编辑/删除/批量删除、上下架切换。
 * 数据来源（@/api/admin）：
 * - GET    /admin/plans                 套餐列表
 * - GET    /admin/membership-stats      会员套餐购买统计
 * - POST   /admin/plans                 创建套餐
 * - PUT    /admin/plans/{id}            更新套餐 / 切换上下架
 * - DELETE /admin/plans/{id}            删除套餐
 * - POST   /admin/plans/batch-delete    批量删除
 * 关键交互：卡片勾选后批量删除；上下架开关即时提交，失败时回滚并重新加载；保存/删除后同步刷新统计。
 * 权限/限制：需登录访问；删除不可恢复；套餐数据同时用于用户管理的会员分配。
 */
import {
  AddOutline,
  CalendarOutline,
  CheckmarkCircleOutline,
  CreateOutline,
  DiamondOutline,
  MoonOutline,
  TrashOutline,
} from '@vicons/ionicons5'
import { NCheckbox, NIcon, NSwitch, useDialog, useMessage } from 'naive-ui'
import type { Component } from 'vue'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type MembershipStats, type Plan } from '@/api/admin'
import { money, statusTag } from '@/utils/tags'

// 全局消息实例：保存、上下架、删除等操作的结果提示
const message = useMessage()
// 对话框实例：删除类操作前弹出二次确认
const dialog = useDialog()

// 套餐列表，一次拉取全量（不限分页），按接口返回顺序渲染卡片
const plans = ref<Plan[]>([])
// 卡片勾选的套餐 id 集合，供批量删除使用
const checkedKeys = ref<string[]>([])
// 套餐列表请求中标记，控制卡片区 n-spin
const loading = ref(false)
// 会员套餐购买数据统计（对应需求 7：会员套餐购买数据统计功能）
const stats = ref<MembershipStats | null>(null)

/**
 * 套餐图标映射：后端 plan.icon 返回语义键（moon / calendar-check / crown），
 * 未命中的键在模板中回退为 DiamondOutline。
 */
const iconMap: Record<string, Component> = {
  moon: MoonOutline,
  'calendar-check': CalendarOutline,
  crown: DiamondOutline,
}

/**
 * 加载套餐列表
 * @returns {Promise<void>} 请求结束后复位 loading（异常由 axios 拦截器统一提示）
 */
async function load() {
  loading.value = true
  try {
    plans.value = await api.plans()
  } finally {
    loading.value = false
  }
}

/** 拉取会员套餐购买统计 */
async function loadStats() {
  stats.value = await api.membershipStats()
}

/** 近 7 日柱状图高度：按当组最大单量归一化到 8~100% */
function barHeight(n: number, arr: number[]): string {
  const max = Math.max(1, ...arr)
  return Math.max(8, Math.round((n / max) * 100)) + '%'
}

/**
 * 切换套餐上下架
 * 先提交接口，成功后同步本地 status；失败时重新加载列表以回滚开关显示。
 * @param {Plan} plan 目标套餐
 * @param {boolean} value 开关目标值：true 上架 / false 下架
 * @returns {Promise<void>}
 */
async function toggle(plan: Plan, value: boolean) {
  const status = value ? 'on' : 'off'
  try {
    await api.updatePlan(plan.id, { status })
    plan.status = status
    message.success(status === 'on' ? `「${plan.name}」已上架` : `「${plan.name}」已下架`)
  } catch {
    load()
  }
}

// ---------- 新增 / 编辑 ----------
// 新增/编辑弹窗显隐
const showModal = ref(false)
// 是否编辑态：true 走 PUT 更新，false 走 POST 新增
const isEdit = ref(false)
// 编辑态下的套餐 id；新增时为空串
const editId = ref('')
/**
 * 套餐表单模型
 * - name：套餐名称，必填，提交时 trim
 * - duration：时长（天），默认 30，范围 1~3650
 * - price / origPrice：现价与原价（元），原价为空时提交回退为现价
 * - tag：套餐角标文案（可选，如「超值之选」）
 * - benefits：权益列表，文本域按行录入，提交时按换行拆分为数组
 */
const form = reactive({ name: '', duration: 30, price: 0, origPrice: undefined as number | undefined, tag: '', benefits: '' })
// 保存请求中标记，控制弹窗「保存」按钮 loading
const saving = ref(false)

/** 打开新增弹窗：重置为默认表单（30 天、0 元、无标签与权益） */
function openCreate() {
  isEdit.value = false
  editId.value = ''
  form.name = ''
  form.duration = 30
  form.price = 0
  form.origPrice = undefined
  form.tag = ''
  form.benefits = ''
  showModal.value = true
}

/**
 * 打开编辑弹窗：回填套餐数据，权益数组按行拼接为文本域内容
 * @param {Plan} p 目标套餐
 * @returns {void}
 */
function openEdit(p: Plan) {
  isEdit.value = true
  editId.value = p.id
  form.name = p.name
  form.duration = p.duration
  form.price = p.price
  form.origPrice = p.origPrice ?? undefined
  form.tag = p.tag ?? ''
  form.benefits = (p.benefits ?? []).join('\n')
  showModal.value = true
}

// 表单可提交条件：套餐名称非空且时长大于 0
const canSave = computed(() => !!form.name.trim() && form.duration > 0)

/**
 * 保存套餐（新增或编辑）
 * 步骤：1) canSave 校验；2) 权益文本按行拆分并过滤空行；
 * 3) 组装 payload 后按 isEdit 调用更新或创建接口；
 * 4) 成功后关闭弹窗，并刷新套餐列表与购买统计；5) finally 复位 saving。
 * @returns {Promise<void>}
 */
async function save() {
  if (!canSave.value) {
    message.warning('请填写套餐名称与时长')
    return
  }
  saving.value = true
  const benefits = form.benefits.split('\n').map((s) => s.trim()).filter(Boolean)
  const payload = {
    name: form.name.trim(),
    duration: form.duration,
    price: form.price,
    origPrice: form.origPrice ?? form.price,
    tag: form.tag.trim() || undefined,
    benefits,
  }
  try {
    if (isEdit.value) {
      await api.updatePlan(editId.value, payload)
      message.success('已保存')
    } else {
      await api.createPlan(payload)
      message.success('套餐已创建')
    }
    showModal.value = false
    load()
    loadStats()
  } finally {
    saving.value = false
  }
}

/**
 * 删除单个套餐（二次确认后执行），成功后刷新列表与统计
 * @param {Plan} p 目标套餐
 * @returns {void}
 */
function confirmDelete(p: Plan) {
  dialog.warning({
    title: '删除套餐',
    content: `确认删除套餐「${p.name}」？该操作不可恢复。`,
    positiveText: '确认删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await api.deletePlan(p.id)
      message.success('套餐已删除')
      load()
      loadStats()
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

/**
 * 批量删除：二次确认
 * 未勾选时给出提示；确认后按勾选的套餐 id 调用批量删除，
 * 成功则清空勾选并刷新列表与统计。
 * @returns {void}
 */
function confirmBatchDelete() {
  if (!checkedKeys.value.length) {
    message.warning('请先勾选要删除的套餐')
    return
  }
  const count = checkedKeys.value.length
  dialog.warning({
    title: '批量删除套餐',
    content: `确认删除已选中的 ${count} 个套餐？该操作不可恢复。`,
    positiveText: `确认删除 ${count} 个`,
    negativeText: '取消',
    onPositiveClick: async () => {
      const r = await api.batchDeletePlans(checkedKeys.value)
      message.success(`已删除 ${r.deleted} 个套餐`)
      checkedKeys.value = []
      load()
      loadStats()
    },
  })
}

// 首次进入页面：并行发起套餐列表与购买统计两个请求
onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <!-- 区块：会员套餐根容器 / 页头 + 购买统计 + 购买分布与趋势 + 套餐卡片 + 编辑弹窗 -->
  <div class="page">
    <!-- 区块：页头 / 左侧标题说明，右侧已选计数、批量删除与新增套餐 -->
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">会员套餐</h2>
        <p class="pagehead__desc">管理会员套餐（月卡/季卡/年卡），可配置名称、价格、权益并上下架。</p>
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
            <n-icon :component="AddOutline" />
          </template>
          新增套餐
        </n-button>
      </div>
    </div>

    <!-- 区块：购买数据统计 / 四列 KPI（单量、收入、在售套餐、累计已售），依赖 stats 加载完成 -->
    <div v-if="stats" class="stat-row">
      <div class="kpi">
        <div class="kpi__label">会员购买单量</div>
        <div class="kpi__val">{{ stats.totalOrders }}</div>
        <div class="kpi__ft">累计订单数</div>
      </div>
      <div class="kpi kpi--gold">
        <div class="kpi__label">会员收入合计</div>
        <div class="kpi__val">{{ money(stats.totalAmount) }}</div>
        <div class="kpi__ft">累计成交金额</div>
      </div>
      <div class="kpi kpi--success">
        <div class="kpi__label">在售套餐</div>
        <div class="kpi__val">{{ plans.filter((p) => p.status === 'on').length }}</div>
        <div class="kpi__ft">共 {{ plans.length }} 个套餐</div>
      </div>
      <div class="kpi kpi--accent">
        <div class="kpi__label">累计已售</div>
        <div class="kpi__val">{{ plans.reduce((s, p) => s + (p.sales || 0), 0) }}</div>
        <div class="kpi__ft">含后台分配与用户购买</div>
      </div>
    </div>

    <!-- 区块：统计图表区 / 左列各套餐购买分布表格（套餐、单量、金额、已售），右列近 7 日单量迷你柱图 -->
    <div v-if="stats" class="dash-grid">
      <div class="card card--pad">
        <div class="card__title">各套餐购买分布</div>
        <n-data-table
          size="small"
          :bordered="false"
          :columns="[
            { title: '套餐', key: 'name' },
            { title: '购买单量', key: 'count' },
            { title: '成交金额', key: 'amount', render: (r: any) => money(r.amount) },
            { title: '累计已售', key: 'sales' },
          ]"
          :data="stats.byPlan"
        />
      </div>
      <div class="card card--pad">
        <div class="card__title">近 7 日购买趋势</div>
        <div class="card__sub">单量</div>
        <div class="mini-bars">
          <div
            v-for="(n, i) in stats.trend.counts"
            :key="i"
            class="mini-bars__bar"
            :style="{ height: barHeight(n, stats.trend.counts) }"
            :title="`${stats.trend.days[i]}：${n} 单 / ${money(stats.trend.amounts[i])}`"
          ></div>
        </div>
        <div class="mini-bars" style="height: auto; margin-top: 6px">
          <span v-for="(d, i) in stats.trend.days" :key="i" class="td-s" style="flex: 1; text-align: center">
            {{ d }}
          </span>
        </div>
      </div>
    </div>

    <!-- 区块：套餐卡片区 / 加载态用 n-spin 包裹，卡片网格逐个渲染套餐，含勾选、价格、权益与上下架开关 -->
    <n-spin :show="loading">
      <div class="plan-grid">
        <div v-for="p in plans" :key="p.id" class="plan-card">
          <div class="plan-card__head">
            <div style="display: flex; gap: 12px; align-items: flex-start">
              <n-checkbox
                :checked="checkedKeys.includes(p.id)"
                @update:checked="(v: boolean) => toggleCheck(p.id, v)"
              />
              <div class="plan-card__ic">
                <n-icon :component="iconMap[p.icon] ?? DiamondOutline" :size="20" />
              </div>
              <div>
                <div class="plan-card__name">
                  {{ p.name }}
                  <n-tag v-if="p.tag" size="tiny" round :color="'#FBF3E2'" :text-color="'#C08A2E'">
                    {{ p.tag }}
                  </n-tag>
                </div>
                <div class="td-s" style="margin-top: 3px">{{ p.durationLabel }} · 已售 {{ p.sales }}</div>
              </div>
            </div>
            <n-tag
              size="small"
              round
              :color="statusTag(p.status).color"
              :text-color="statusTag(p.status).textColor"
            >
              {{ statusTag(p.status).text }}
            </n-tag>
          </div>

          <div>
            <span class="plan-card__price">{{ money(p.price) }}</span>
            <span v-if="p.origPrice && p.origPrice > p.price" class="price-ori">
              {{ money(p.origPrice) }}
            </span>
          </div>

          <ul class="plan-card__benefits">
            <li v-for="(b, i) in p.benefits" :key="i">
              <n-icon :component="CheckmarkCircleOutline" :size="15" />
              {{ b }}
            </li>
          </ul>

          <div class="plan-card__foot">
            <div class="rowbtns">
              <n-button size="small" @click="openEdit(p)">
                <template #icon>
                  <n-icon :component="CreateOutline" />
                </template>
                编辑
              </n-button>
              <n-button size="small" type="error" quaternary @click="confirmDelete(p)">
                <template #icon>
                  <n-icon :component="TrashOutline" />
                </template>
                删除
              </n-button>
            </div>
            <div style="display: flex; align-items: center; gap: 8px">
              <span class="td-s">{{ p.status === 'on' ? '上架中' : '已下架' }}</span>
              <n-switch :value="p.status === 'on'" @update:value="(v: boolean) => toggle(p, v)" />
            </div>
          </div>
        </div>
      </div>
    </n-spin>

    <!-- 区块：新增 / 编辑套餐弹窗 / 两列栅格表单，权益按行录入，保存后同步刷新列表与统计 -->
    <n-modal
      v-model:show="showModal"
      preset="card"
      :title="isEdit ? '编辑套餐' : '新增套餐'"
      style="width: 640px"
      :mask-closable="false"
    >
      <n-form label-placement="top">
        <div class="form-grid">
          <n-form-item label="套餐名称" required>
            <n-input v-model:value="form.name" placeholder="如：月卡" maxlength="16" />
          </n-form-item>
          <n-form-item label="时长（天）" required>
            <n-input-number v-model:value="form.duration" :min="1" :max="3650" style="width: 100%" />
          </n-form-item>
          <n-form-item label="价格（元）">
            <n-input-number v-model:value="form.price" :min="0" :precision="2" style="width: 100%" />
          </n-form-item>
          <n-form-item label="原价（元）">
            <n-input-number v-model:value="form.origPrice" :min="0" :precision="2" style="width: 100%" />
          </n-form-item>
          <n-form-item label="标签" class="full">
            <n-input v-model:value="form.tag" placeholder="如：超值之选" maxlength="16" />
          </n-form-item>
          <n-form-item label="权益（每行一条）" class="full">
            <n-input
              v-model:value="form.benefits"
              type="textarea"
              :autosize="{ minRows: 4, maxRows: 8 }"
              placeholder="无限次 AI 查询&#10;全程免广告&#10;专属会员标识"
            />
          </n-form-item>
        </div>
      </n-form>
      <template #footer>
        <div style="display: flex; justify-content: flex-end; gap: 10px">
          <n-button @click="showModal = false">取消</n-button>
          <n-button type="primary" :loading="saving" @click="save">保存</n-button>
        </div>
      </template>
    </n-modal>
  </div>
</template>