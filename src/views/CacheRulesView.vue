<script setup lang="ts">
/**
 * CacheRulesView.vue — 系统设置 · 缓存规则
 *
 * 天气数据缓存与鱼情分析缓存的有效期规则（默认 3 小时）：
 * - 3 小时内重复查询：直接返回缓存，不调用和风天气 / 大模型；
 * - 超过有效期：自动重新拉取并重置有效期。
 * 仅超级管理员可修改；普通管理员只读。
 */
import { SaveOutline } from '@vicons/ionicons5'
import { NButton, NIcon, NInputNumber, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type CacheRules } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const DEFAULT_HOURS = 3
const DEFAULT_MINUTES = DEFAULT_HOURS * 60

const message = useMessage()
const auth = useAuthStore()
const isSuper = computed(() => auth.role === '超级管理员')

const loading = ref(false)
const saving = ref(false)
const minutes = reactive({ weather: DEFAULT_MINUTES, fish: DEFAULT_MINUTES })
const savedAt = ref<string>('')

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

function resetDefault() {
  minutes.weather = DEFAULT_MINUTES
  minutes.fish = DEFAULT_MINUTES
  message.info('已恢复默认 3 小时，请点击「保存规则」生效')
}

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

onMounted(load)
</script>

<template>
  <div class="page">
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

    <div class="card card--pad" :class="{ 'is-loading': loading }">
      <div class="card__title">缓存有效期（分钟）</div>
      <div class="card__sub">
        同一地址的天气查询、相同参数的鱼情请求在有效期内直接返回缓存，完全不会重复调用第三方接口。
      </div>

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

      <div class="notice" style="margin-top: 16px; color: var(--c-ink-3); font-size: 12px">
        规则存储于系统配置表，无需重启服务；过期条目会在下一次同名查询时自动重新拉取并重置有效期。
        <span v-if="savedAt"> 上次保存：{{ savedAt }}</span>
      </div>
    </div>

    <div v-if="!isSuper" class="card card--pad mt12" style="color: var(--c-ink-4)">
      当前账号为普通管理员，仅支持查看规则，无权修改缓存有效期。
    </div>
  </div>
</template>
