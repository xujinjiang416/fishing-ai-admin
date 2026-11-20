<script setup lang="ts">
/**
 * LoginView.vue — 管理员登录页
 *
 * 职责：管理员输入账号密码登录，成功后进入数据看板。
 * 数据来源：useAuthStore().login()，底层为 POST /admin/login，返回 { token, admin }。
 * 关键交互：输入框回车或点击按钮提交；提交前做非空校验；失败时展示行内错误提示。
 * 权限/限制：未登录可访问；已登录用户进入本页会自动重定向到看板（/）。
 */
import { AlertCircleOutline, FishOutline } from '@vicons/ionicons5'
import { useMessage } from 'naive-ui'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

// 路由实例：登录成功后 replace 跳转，避免浏览器回退再次回到登录页
const router = useRouter()
// 认证 store：提供 login()、isAuthed 等登录态能力
const auth = useAuthStore()
// 全局消息实例，用于登录成功提示
const message = useMessage()

/**
 * 登录表单模型
 * - username：账号，默认空串，提交时去除首尾空格
 * - password：密码，默认空串，按原样提交（不做 trim）
 */
const form = reactive({ username: '', password: '' })
/** 登录请求中标记：true 时禁用输入与按钮，防止重复提交 */
const loading = ref(false)
/** 行内错误文案：空串表示无错误，由前端校验失败或登录接口异常写入 */
const error = ref('')

// 页面挂载时检查登录态：已登录则直接进入看板
onMounted(() => {
  // 已登录直接进看板
  if (auth.isAuthed) router.replace('/')
})

/**
 * 提交登录
 * 步骤：1) 非空校验；2) 置 loading 并清空旧错误；3) 调用认证 store 登录并跳转；
 * 4) 捕获异常写入行内错误；5) finally 复位 loading。
 * @returns {Promise<void>}
 * @throws 不向外抛出：登录异常在此转换为 error 文案展示
 */
async function submit() {
  if (!form.username.trim() || !form.password) {
    error.value = '请输入账号和密码'
    return
  }
  loading.value = true
  error.value = ''
  try {
    await auth.login(form.username.trim(), form.password)
    message.success('登录成功')
    router.replace('/')
  } catch (e) {
    error.value = (e as Error).message || '账号或密码错误'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <!-- 区块：登录页外层 / 铺满视口的居中容器，背景与尺寸由全局样式控制 -->
  <div class="login-page">
    <!-- 区块：登录卡片 / 纵向排列品牌头、错误提示、表单与演示账号提示 -->
    <div class="login-card">
      <!-- 品牌区：Logo、标题与副标题，纯展示无交互 -->
      <div class="login-card__brand">
        <div class="login-card__logo">
          <n-icon :component="FishOutline" :size="26" />
        </div>
        <div>
          <h1>渔获 AI · 管理后台</h1>
          <p class="sub">深邃湖面 · 商务管理台</p>
        </div>
      </div>

      <!-- 错误提示：仅在 error 非空时展示，来源为前端非空校验或登录接口异常 -->
      <div v-if="error" class="login-err">
        <n-icon :component="AlertCircleOutline" :size="15" />
        {{ error }}
      </div>

      <!-- 区块：登录表单 / 账号、密码与提交按钮；表单容器监听回车触发表单快捷提交 -->
      <n-form label-placement="top" size="large" @keyup.enter="submit">
        <n-form-item label="账号">
          <n-input
            v-model:value="form.username"
            placeholder="请输入账号（admin）"
            :disabled="loading"
          />
        </n-form-item>
        <n-form-item label="密码">
          <n-input
            v-model:value="form.password"
            type="password"
            show-password-on="click"
            placeholder="请输入密码"
            :disabled="loading"
          />
        </n-form-item>
        <n-button
          type="primary"
          block
          size="large"
          :loading="loading"
          attr-type="submit"
          @click="submit"
        >
          {{ loading ? '登录中…' : '登 录' }}
        </n-button>
      </n-form>

      <!-- 演示账号提示：静态文案，正式环境应移除或替换 -->
      <p class="login-tip">演示账号 admin · 密码 meng01040416</p>
    </div>
  </div>
</template>