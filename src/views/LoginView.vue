<script setup lang="ts">
import { AlertCircleOutline, FishOutline } from '@vicons/ionicons5'
import { useMessage } from 'naive-ui'
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const auth = useAuthStore()
const message = useMessage()

const form = reactive({ username: '', password: '' })
const loading = ref(false)
const error = ref('')

onMounted(() => {
  // 已登录直接进看板
  if (auth.isAuthed) router.replace('/')
})

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
  <div class="login-page">
    <div class="login-card">
      <div class="login-card__brand">
        <div class="login-card__logo">
          <n-icon :component="FishOutline" :size="26" />
        </div>
        <div>
          <h1>渔获 AI · 管理后台</h1>
          <p class="sub">深邃湖面 · 商务管理台</p>
        </div>
      </div>

      <div v-if="error" class="login-err">
        <n-icon :component="AlertCircleOutline" :size="15" />
        {{ error }}
      </div>

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

      <p class="login-tip">演示账号 admin · 密码 meng01040416</p>
    </div>
  </div>
</template>