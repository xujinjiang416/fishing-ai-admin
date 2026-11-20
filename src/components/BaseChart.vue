<script setup lang="ts">
/**
 * BaseChart.vue — ECharts 通用容器组件
 *
 * 职责：接收 ECharts option，完成实例初始化、响应式尺寸适配与销毁，业务页面只需传入配置。
 * 关键流程：
 * 1. onMounted：初始化实例并首次 setOption；
 * 2. ResizeObserver 监听容器尺寸，容器变化时调用 resize，适配侧边栏折叠/窗口缩放；
 * 3. watch option（deep）：配置变化时以 notMerge 方式重设，避免旧系列残留；
 * 4. onBeforeUnmount：断开监听并 dispose 实例，防止内存泄漏。
 * 依赖：echarts（全量引入）。
 * 注意：option 会被深度监听，若由 computed 生成需保证引用稳定；组件不自行处理主题，
 *      配色由调用方通过 chartTheme.ts 注入。
 */
import * as echarts from 'echarts'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

/** 组件入参：option 为 ECharts 配置，height 控制容器高度 */
const props = defineProps<{
  /** ECharts 配置对象（必填），结构由各图表自行决定 */
  option: Record<string, unknown>
  /** 容器高度（CSS 长度），缺省 280px */
  height?: string
}>()

/** 图表容器 DOM 引用 */
const el = ref<HTMLDivElement | null>(null)
/** ECharts 实例，未挂载/已销毁时为 null */
let chart: echarts.ECharts | null = null
/** 尺寸监听器，用于容器自适应 */
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!el.value) return
  // 初始化实例并渲染首屏配置
  chart = echarts.init(el.value)
  chart.setOption(props.option)
  // 容器尺寸变化时重算布局
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(el.value)
})

// 配置变更：deep 监听确保嵌套字段修改也能触发重绘；notMerge=true 清除旧配置
watch(
  () => props.option,
  (opt) => {
    chart?.setOption(opt, true)
  },
  { deep: true }
)

onBeforeUnmount(() => {
  // 先解除尺寸监听，再销毁实例，避免销毁后仍触发 resize
  observer?.disconnect()
  observer = null
  chart?.dispose()
  chart = null
})
</script>

<template>
  <!-- 区块：图表画布 / 宽度撑满父容器，高度由 height prop 控制（默认 280px） -->
  <div ref="el" :style="{ width: '100%', height: height || '280px' }" />
</template>