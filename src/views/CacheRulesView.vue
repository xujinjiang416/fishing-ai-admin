<script setup lang="ts">
/**
 * CacheRulesView.vue — 系统设置 · 缓存过期规则配置
 *
 * 支持按「城市等级」与「数据精度」两维差异化配置缓存过期时长（TTL，秒）。
 * 仅超级管理员可修改；普通管理员只读。
 */
import { SaveOutline } from '@vicons/ionicons5'
import { NButton, NIcon, NInputNumber, useMessage } from 'naive-ui'
import { computed, onMounted, reactive, ref } from 'vue'

import { api, type CacheRules } from '@/api/admin'
import { useAuthStore } from '@/stores/auth'

const message = useMessage()
const auth = useAuthStore()
const isSuper = computed(() => auth.role === '超级管理员')

const loading = ref(false)
const saving = ref(false)
const rules = reactive<CacheRules>({ cityLevels: {}, precisions: {} })

const cityLevelOptions = [
  { key: '一线', label: '一线城市', hint: '北京 / 上海 / 广州 / 深圳' },
  { key: '新一线', label: '新一线城市', hint: '成都 / 杭州 / 合肥 / 南京 / 武汉 等' },
  { key: '二线', label: '二线城市', hint: '厦门 / 福州 / 济南 / 大连 等' },
  { key: '三线', label: '三线及其他', hint: '其余城市' },
]
const precisionOptions = [
  { key: 'province', label: '省级', hint: '仅定位到省（数据最粗）' },
  { key: 'city', label: '市级', hint: '定位到市' },
  { key: 'district', label: '区级', hint: '精确到区（数据最细，建议较短）' },
]

function fmt(sec: number): string {
  if (!sec) return '—'
  if (sec < 60) return `${sec} 秒`
  if (sec < 3600) return `${Math.round(sec / 60)} 分钟`
  return `${(sec / 3600).toFixed(1)} 小时`
}

async function load() {
  loading.value = true
  try {
    const r = await api.cacheRules()
    rules.cityLevels = r.cityLevels || {}
    rules.precisions = r.precisions || {}
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!isSuper.value) return
  saving.value = true
  try {
    await api.updateCacheRules({ cityLevels: rules.cityLevels, precisions: rules.precisions })
    message.success('缓存过期规则已保存，即刻生效')
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
        <h2 class="pagehead__title">缓存过期规则</h2>
        <p class="pagehead__desc">按城市等级与数据精度配置差异化的缓存过期时长（TTL），规则变更后新缓存即时生效。</p>
      </div>
      <div class="pagehead__actions">
        <n-button v-if="isSuper" type="primary" :loading="saving" @click="save">
          <template #icon><n-icon :component="SaveOutline" /></template>
          保存规则
        </n-button>
      </div>
    </div>

    <div class="card card--pad">
      <div class="card__title">城市等级 TTL（秒）</div>
      <div class="card__sub">越是一线城市，天气变化关注度越高，建议配置更短的缓存时长以获取更新数据。</div>
      <div class="form-grid" style="margin-top: 14px">
        <div v-for="o in cityLevelOptions" :key="o.key">
          <div class="td-t" style="font-weight: 600">{{ o.label }}</div>
          <div class="td-s" style="margin: 2px 0 6px">{{ o.hint }}</div>
          <n-input-number
            v-model:value="rules.cityLevels[o.key]"
            :disabled="!isSuper"
            :min="60"
            :max="2592000"
            :step="300"
            style="width: 100%"
          />
          <div class="td-s" style="margin-top: 4px">≈ {{ fmt(rules.cityLevels[o.key]) }}</div>
        </div>
      </div>
    </div>

    <div class="card card--pad mt12">
      <div class="card__title">数据精度 TTL（秒）</div>
      <div class="card__sub">精度越高（到区）数据越细，建议更短；到省可放宽。最终 TTL 取「城市等级」与「数据精度」中较小值。</div>
      <div class="form-grid" style="margin-top: 14px">
        <div v-for="o in precisionOptions" :key="o.key">
          <div class="td-t" style="font-weight: 600">{{ o.label }}</div>
          <div class="td-s" style="margin: 2px 0 6px">{{ o.hint }}</div>
          <n-input-number
            v-model:value="rules.precisions[o.key]"
            :disabled="!isSuper"
            :min="60"
            :max="2592000"
            :step="300"
            style="width: 100%"
          />
          <div class="td-s" style="margin-top: 4px">≈ {{ fmt(rules.precisions[o.key]) }}</div>
        </div>
      </div>
    </div>

    <div v-if="!isSuper" class="card card--pad mt12" style="color: var(--c-ink-4)">
      当前账号为普通管理员，仅支持查看规则，无权修改缓存过期规则。
    </div>
  </div>
</template>