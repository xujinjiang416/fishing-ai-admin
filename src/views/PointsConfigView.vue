<script setup lang="ts">
/**
 * PointsConfigView.vue — 系统设置 · 积分配置
 *
 * 功能（对应需求 4）：
 * - 可视化配置「签到领取积分」的 会员值 / 非会员值；
 * - 配置「观看广告赚取积分」的单次积分值（以及广告时长、每日额度）；
 * - 可选配置评论敏感词词库；
 * - 保存后写入后端 app_configs 表，实时生效（小程序端拉取到最新配置），并记录操作日志。
 */
import { OptionsOutline, SaveOutline } from '@vicons/ionicons5'
import { onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/admin'

const message = useMessage()
const loading = ref(false)
const saving = ref(false)

// 表单数据：与后端 /admin/config 的 camelCase 字段一一对应
const form = reactive({
  checkinMemberPoints: 5,
  checkinNormalPoints: 1,
  adPoints: 5,
  adSeconds: 30,
  adLimitNormal: 15,
  adLimitMember: 20,
  sensitiveWords: '',
})

async function load() {
  loading.value = true
  try {
    const cfg = await api.config()
    form.checkinMemberPoints = cfg.checkinMemberPoints
    form.checkinNormalPoints = cfg.checkinNormalPoints
    form.adPoints = cfg.adPoints
    form.adSeconds = cfg.adSeconds
    form.adLimitNormal = cfg.adLimitNormal
    form.adLimitMember = cfg.adLimitMember
    form.sensitiveWords = cfg.sensitiveWords || ''
  } finally {
    loading.value = false
  }
}

async function save() {
  saving.value = true
  try {
    // 提交整份配置；后端仅更新传值项，并写入操作日志
    await api.updateConfig({
      checkinMemberPoints: form.checkinMemberPoints,
      checkinNormalPoints: form.checkinNormalPoints,
      adPoints: form.adPoints,
      adSeconds: form.adSeconds,
      adLimitNormal: form.adLimitNormal,
      adLimitMember: form.adLimitMember,
      sensitiveWords: form.sensitiveWords,
    })
    message.success('配置已保存并实时生效')
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
        <h2 class="pagehead__title">积分配置</h2>
        <p class="pagehead__desc">
          配置签到与观看广告的积分规则。保存后立即生效，小程序端无需发版即可同步最新规则。
        </p>
      </div>
      <div class="pagehead__actions">
        <n-button type="primary" :loading="saving" @click="save">
          <template #icon>
            <n-icon :component="SaveOutline" />
          </template>
          保存配置
        </n-button>
      </div>
    </div>

    <n-spin :show="loading">
      <!-- 签到积分 -->
      <div class="card card--pad" style="margin-bottom: 14px">
        <div class="card__title" style="margin-bottom: 14px">签到领取积分</div>
        <div class="config-grid">
          <div class="config-item">
            <div>
              <div class="config-item__label">会员用户签到积分</div>
              <div class="config-item__desc">会员每日签到可获得的积分</div>
            </div>
            <n-input-number
              v-model:value="form.checkinMemberPoints"
              class="config-item__input"
              :min="0"
              :max="100000"
            />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">非会员用户签到积分</div>
              <div class="config-item__desc">非会员每日签到可获得的积分</div>
            </div>
            <n-input-number
              v-model:value="form.checkinNormalPoints"
              class="config-item__input"
              :min="0"
              :max="100000"
            />
          </div>
        </div>
      </div>

      <!-- 广告积分 -->
      <div class="card card--pad" style="margin-bottom: 14px">
        <div class="card__title" style="margin-bottom: 14px">观看广告赚取积分</div>
        <div class="config-grid">
          <div class="config-item">
            <div>
              <div class="config-item__label">单次观看广告积分</div>
              <div class="config-item__desc">每看完 1 个广告可获得的积分</div>
            </div>
            <n-input-number v-model:value="form.adPoints" class="config-item__input" :min="0" :max="100000" />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">单次广告时长（秒）</div>
              <div class="config-item__desc">广告播放时长，影响观看体验</div>
            </div>
            <n-input-number v-model:value="form.adSeconds" class="config-item__input" :min="5" :max="180" />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">非会员每日广告额度</div>
              <div class="config-item__desc">非会员每日最多可观看的广告条数</div>
            </div>
            <n-input-number
              v-model:value="form.adLimitNormal"
              class="config-item__input"
              :min="0"
              :max="1000"
            />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">会员每日广告额度</div>
              <div class="config-item__desc">会员每日最多可观看的广告条数</div>
            </div>
            <n-input-number
              v-model:value="form.adLimitMember"
              class="config-item__input"
              :min="0"
              :max="1000"
            />
          </div>
        </div>
      </div>

      <!-- 评论敏感词 -->
      <div class="card card--pad">
        <div class="card__title" style="margin-bottom: 6px">评论敏感词词库</div>
        <div class="config-item__desc" style="margin-bottom: 12px">
          多个敏感词用英文逗号分隔；留空则使用系统内置词库。发布评论命中敏感词会被前置拦截。
        </div>
        <n-input
          v-model:value="form.sensitiveWords"
          type="textarea"
          :autosize="{ minRows: 3, maxRows: 6 }"
          placeholder="例如：加微信,代购,刷单,赌博"
        />
      </div>

      <div class="config-item__desc" style="margin-top: 14px">
        <n-icon :component="OptionsOutline" :size="14" style="vertical-align: -2px" />
        提示：所有配置项修改后立即生效，并会记录到「系统设置 · 操作日志」中以便审计追溯。
      </div>
    </n-spin>
  </div>
</template>
