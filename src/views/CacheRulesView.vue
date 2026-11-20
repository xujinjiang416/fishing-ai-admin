<script setup lang="ts">
/**
 * CacheRulesView.vue — 系统设置 · 缓存规则
 *
 * 天气数据缓存与鱼情分析缓存的有效期规则（默认 3 小时）：
 * - 3 小时内重复查询：直接返回缓存，不调用和风天气 / 大模型；
 * - 超过有效期：自动重新拉取并重置有效期。
 * 仅超级管理员可修改；普通管理员只读。
 *
 * 接口来源：@/api/admin 的 cacheRules / updateCacheRules（/admin/cache/rules），类型 CacheRules。
 * 关键交互：打开页面加载规则；修改分钟数后点击「保存规则」生效；可一键恢复默认 3 小时。
 * 限制：输入范围 1~43200 分钟（最长 30 天），步进 30 分钟；后端以秒存储，前端展示与提交时做换算；
 *       非超管输入框禁用且不展示保存按钮。
 */
import { SaveOutline } from '@vicons/ionicons5'
import { NButton, NIcon, NInputNumber, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type CacheRules } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

// 默认有效期：3 小时；DEFAULT_MINUTES 为界面使用的分钟数，提交时再换算为秒
const DEFAULT_HOURS = 3
const DEFAULT_MINUTES = DEFAULT_HOURS * 60

const message = useMessage() // 保存/恢复默认的操作反馈
const auth = useAuthStore() // 当前管理员信息，用于判断是否超管
// 是否超级管理员：决定输入框是否可编辑、保存按钮是否展示
const isSuper = computed(() => auth.role === '超级管理员')

// 规则加载态（加载中给卡片加 is-loading 样式）
const loading = ref(false)
// 保存请求进行中，用于按钮 loading 防止重复提交
const saving = ref(false)
// 两类缓存的有效期（分钟）：weather=天气缓存，fish=鱼情缓存；默认均为 180
const minutes = reactive({ weather: DEFAULT_MINUTES, fish: DEFAULT_MINUTES })
// 最近一次保存成功的时间文本，用于提示「上次保存」，空串表示本次会话尚未保存
const savedAt = ref<string>('')

// 规则编辑项：key 对应 minutes 的字段名，label/hint 用于表单展示与说明
const ruleItems = [
  {
    key: 'weather' as const,
    label: '天气数据缓存',
    hint: '基于标准化地址 + 日期命中，命中时不再调用和风天气接口。',
  },
  {
    key: 'fish' as const,
    label: '鱼情分析缓存',
    hint: '基于全部查询参数的哈希命中，命中时不再调用大模型服务。',
  },
]

/**
 * 加载缓存有效期规则。
 * 接口返回秒数，缺失或为 0 时回退默认 3 小时；随后四舍五入换算为分钟供输入框展示。
 */
async function load() {
  loading.value = true
  try {
    const r = await api.cacheRules()
    const rules: CacheRules = {
      weather: r.weather || DEFAULT_MINUTES * 60,
      fish: r.fish || DEFAULT_MINUTES * 60,
    }
    minutes.weather = Math.round(rules.weather / 60)
    minutes.fish = Math.round(rules.fish / 60)
  } finally {
    loading.value = false
  }
}

/** 恢复默认 3 小时：仅修改本地表单值，需再次点击「保存规则」才会提交后端。 */
function resetDefault() {
  minutes.weather = DEFAULT_MINUTES
  minutes.fish = DEFAULT_MINUTES
  message.info('已恢复默认 3 小时，请点击「保存规则」生效')
}

/**
 * 保存有效期规则（仅超管）：分钟换算为秒后提交，成功则回填接口返回值并记录保存时间。
 * 请求异常由 http 拦截器统一提示，这里仅负责复位 saving。
 */
async function save() {
  if (!isSuper.value) return
  saving.value = true
  try {
    const r = await api.updateCacheRules({
      weather: Math.round(minutes.weather * 60),
      fish: Math.round(minutes.fish * 60),
    })
    minutes.weather = Math.round(r.weather / 60)
    minutes.fish = Math.round(r.fish / 60)
    savedAt.value = new Date().toLocaleTimeString()
    message.success('缓存有效期规则已保存，即刻生效')
  } finally {
    saving.value = false
  }
}

// 首屏加载当前规则（非超管同样加载，用于只读展示）
onMounted(load)
</script>

<template>
  <div class="page">
    <!-- 区块：页头 / 左侧标题与规则说明，右侧操作按钮 / 恢复默认与保存仅超管可见 -->
    <div class="pagehead">
      <div>
        <h2 class="pagehead__title">缓存规则</h2>
        <p class="pagehead__desc">
          天气数据与鱼情分析的本地缓存有效期，默认均为 3 小时；规则保存后对新查询与过期判定即时生效。
        </p>
      </div>
      <div class="pagehead__actions">
        <n-button v-if="isSuper" ghost @click="resetDefault">恢复默认 3 小时</n-button>
        <n-button v-if="isSuper" type="primary" :loading="saving" @click="save">
          <template #icon><n-icon :component="SaveOutline" /></template>
          保存规则
        </n-button>
      </div>
    </div>

    <!-- 区块：规则表单 / 单卡片承载两类缓存的有效期输入 / loading 时追加 is-loading 样式，非超管输入禁用 -->
    <div class="card card--pad" :class="{ 'is-loading': loading }">
      <div class="card__title">缓存有效期（分钟）</div>
      <div class="card__sub">
        同一地址的天气查询、相同参数的鱼情请求在有效期内直接返回缓存，完全不会重复调用第三方接口。
      </div>

      <!-- 区块：有效期输入 / 两列表单，每项含标题、命中说明与分钟输入 / 取值范围 1~43200，步进 30 分钟 -->
      <div class="form-grid" style="margin-top: 14px">
        <div v-for="o in ruleItems" :key="o.key">
          <div class="td-t" style="font-weight: 600">{{ o.label }}</div>
          <div class="td-s" style="margin: 2px 0 6px">{{ o.hint }}</div>
          <n-input-number
            v-model:value="minutes[o.key]"
            :disabled="!isSuper"
            :min="1"
            :max="43200"
            :step="30"
            style="width: 100%"
          />
          <div class="td-s" style="margin-top: 4px">
            ≈ {{ (minutes[o.key] / 60).toFixed(1) }} 小时 · 默认 3 小时
          </div>
        </div>
      </div>

      <!-- 区块：规则说明 / 提示规则存储位置与生效方式，保存后追加显示上次保存时间 -->
      <div class="notice" style="margin-top: 16px; color: var(--c-ink-3); font-size: 12px">
        规则存储于系统配置表，无需重启服务；过期条目会在下一次同名查询时自动重新拉取并重置有效期。
        <span v-if="savedAt"> 上次保存：{{ savedAt }}</span>
      </div>
    </div>

    <!-- 区块：只读提示 / 普通管理员无修改权限时展示，超管不渲染 -->
    <div v-if="!isSuper" class="card card--pad mt12" style="color: var(--c-ink-4)">
      当前账号为普通管理员，仅支持查看规则，无权修改缓存有效期。
    </div>
  </div>
</template>
