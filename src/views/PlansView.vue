<script setup lang="ts">
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

const message = useMessage()
const dialog = useDialog()

const plans = ref<Plan[]>([])
const checkedKeys = ref<string[]>([])
const loading = ref(false)
// 会员套餐购买数据统计（对应需求 7：会员套餐购买数据统计功能）
const stats = ref<MembershipStats | null>(null)

const iconMap: Record<string, Component> = {
  moon: MoonOutline,
  'calendar-check': CalendarOutline,
  crown: DiamondOutline,
}

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
const showModal = ref(false)
const isEdit = ref(false)
const editId = ref('')
const form = reactive({ name: '', duration: 30, price: 0, origPrice: undefined as number | undefined, tag: '', benefits: '' })
const saving = ref(false)

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

const canSave = computed(() => !!form.name.trim() && form.duration > 0)

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

/** 批量删除：二次确认 */
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

onMounted(() => {
  load()
  loadStats()
})
</script>

<template>
  <div class="page">
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

    <!-- 会员套餐购买数据统计 -->
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