<script setup lang="ts">
/**
 * PointsConfigView.vue — 系统设置 · 积分配置
 *
 * 功能（对应需求 4）：
 * - 可视化配置「签到领取积分」的 会员值 / 非会员值；
 * - 配置「观看广告赚取积分」的单次积分值；广告展示次数与时长遵循微信流量主规范；
 * - 可选配置评论敏感词词库；
 * - 保存后写入后端 app_configs 表，实时生效（小程序端拉取到最新配置），并记录操作日志。
 *
 * 接口：GET /admin/config 读取配置、PUT /admin/config 保存配置（api.config / api.updateConfig）。
 * 权限/限制：需登录的管理员；各数值项非负，输入框 min/max 仅作前端约束，最终以后端配置为准。
 */
import { OptionsOutline, SaveOutline } from '@vicons/ionicons5'
import { onMounted, reactive, ref } from 'vue'
import { useMessage } from 'naive-ui'

import { api } from '@/api/admin'

// 全局消息实例：保存成功等结果提示
const message = useMessage()
// 读取配置请求中标记，控制整页 n-spin
const loading = ref(false)
// 保存请求中标记，控制「保存配置」按钮 loading
const saving = ref(false)

// 表单数据：与后端 /admin/config 的 camelCase 字段一一对应
const form = reactive({
  // 会员每日签到积分，默认 5，范围 0~100000
  checkinMemberPoints: 5,
  // 非会员每日签到积分，默认 1，范围 0~100000
  checkinNormalPoints: 1,
  // 单次观看广告奖励积分，默认 5，范围 0~100000
  adPoints: 5,
  // 单笔订单积分抵扣全局上限（分）
  pointsGlobalCap: 1500,
  // 非会员 / 会员单用户自然月获取上限
  pointsMonthlyCapNormal: 2000,
  pointsMonthlyCapMember: 2000,
  // 会员权益服务端校验开关：1 开 / 0 关
  entitlementEnforcement: 1,
  // 自定义评论敏感词（英文逗号分隔），默认空串表示使用内置词库
  sensitiveWords: '',
})

/**
 * 读取积分配置
 * 将接口返回值逐项回填到表单；sensitiveWords 为 null 时转为空串。
 * @returns {Promise<void>} 请求结束后复位 loading（异常由 axios 拦截器统一提示）
 */
async function load() {
  loading.value = true
  try {
    const cfg = await api.config()
    form.checkinMemberPoints = cfg.checkinMemberPoints
    form.checkinNormalPoints = cfg.checkinNormalPoints
    form.adPoints = cfg.adPoints
    form.pointsGlobalCap = cfg.pointsGlobalCap
    form.pointsMonthlyCapNormal = cfg.pointsMonthlyCapNormal
    form.pointsMonthlyCapMember = cfg.pointsMonthlyCapMember
    form.entitlementEnforcement = cfg.entitlementEnforcement
    form.sensitiveWords = cfg.sensitiveWords || ''
  } finally {
    loading.value = false
  }
}

/**
 * 保存积分配置
 * 步骤：1) 置 saving；2) 提交整份表单；3) 成功后提示并重新加载以确认服务端最新值；
 * 4) finally 复位 saving。
 * @returns {Promise<void>}
 */
async function save() {
  saving.value = true
  try {
    // 提交整份配置；后端仅更新传值项，并写入操作日志
    await api.updateConfig({
      checkinMemberPoints: form.checkinMemberPoints,
      checkinNormalPoints: form.checkinNormalPoints,
      adPoints: form.adPoints,
      pointsGlobalCap: form.pointsGlobalCap,
      pointsMonthlyCapNormal: form.pointsMonthlyCapNormal,
      pointsMonthlyCapMember: form.pointsMonthlyCapMember,
      entitlementEnforcement: form.entitlementEnforcement,
      sensitiveWords: form.sensitiveWords,
    })
    message.success('配置已保存并实时生效')
    load()
  } finally {
    saving.value = false
  }
}

// 首次进入页面即读取当前配置
onMounted(load)
</script>

<template>
  <!-- 区块：积分配置根容器 / 页头 + 签到、广告、敏感词三组配置卡片 -->
  <div class="page">
    <!-- 区块：页头 / 左侧标题与生效说明，右侧全局「保存配置」按钮 -->
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

    <!-- 整页加载态：配置读取完成前以 n-spin 遮罩，避免闪现默认值 -->
    <n-spin :show="loading">
      <!-- 区块：签到积分 / 两列配置项（会员与非会员的每日签到积分） -->
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

      <!-- 区块：广告积分 / 仅配置单次奖励；展示次数与时长由微信流量主规范控制 -->
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
        </div>
      </div>

      <!-- 区块：成本闸门 / 全局上限、月上限与权益校验；积分永久有效 -->
      <div class="card card--pad" style="margin-bottom: 14px">
        <div class="card__title" style="margin-bottom: 14px">积分成本</div>
        <div class="config-grid">
          <div class="config-item">
            <div>
              <div class="config-item__label">单笔抵扣全局上限（分）</div>
              <div class="config-item__desc">1500 分 = 10 元；不再按品类设置抵扣率，足额抵扣可 0 元购</div>
            </div>
            <n-input-number v-model:value="form.pointsGlobalCap" class="config-item__input" :min="0" :max="100000" />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">非会员月获取上限</div>
              <div class="config-item__desc">单用户自然月最多获得积分</div>
            </div>
            <n-input-number v-model:value="form.pointsMonthlyCapNormal" class="config-item__input" :min="0" :max="1000000" />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">会员月获取上限</div>
              <div class="config-item__desc">单用户自然月最多获得积分</div>
            </div>
            <n-input-number v-model:value="form.pointsMonthlyCapMember" class="config-item__input" :min="0" :max="1000000" />
          </div>
          <div class="config-item">
            <div>
              <div class="config-item__label">会员权益服务端校验</div>
              <div class="config-item__desc">开启后，非会员全量天气/钓点请求会被服务端拦截</div>
            </div>
            <n-switch v-model:value="form.entitlementEnforcement" :checked-value="1" :unchecked-value="0" />
          </div>
        </div>
      </div>

      <!-- 区块：评论敏感词 / 文本域按英文逗号分隔录入，留空表示沿用系统内置词库 -->
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

      <!-- 页脚提示：说明配置即时生效并写入操作日志，供审计追溯 -->
      <div class="config-item__desc" style="margin-top: 14px">
        <n-icon :component="OptionsOutline" :size="14" style="vertical-align: -2px" />
        提示：所有配置项修改后立即生效，并会记录到「系统设置 · 操作日志」中以便审计追溯。
      </div>
    </n-spin>
  </div>
</template>
