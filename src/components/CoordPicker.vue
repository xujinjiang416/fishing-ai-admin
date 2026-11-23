<script setup lang="ts">
/**
 * CoordPicker.vue — 钓点坐标地图选点
 *
 * 职责：基于 Leaflet + 高德卫星瓦片（GCJ-02）渲染地图，支持点击落点与拖动 marker 选点，
 *      并把选中的 "lng,lat" 通过 v-model 同步给父组件。
 * 关键流程：modelValue -> 解析中心点与 marker 位置；地图点击 / marker 拖拽 -> emit update:modelValue（6 位小数）。
 * 注意：
 * - 后端坐标与高德瓦片同为 GCJ-02，因此不做坐标偏移换算，直接映射即可对齐；
 * - 组件卸载时调用 map.remove() 释放 DOM 与事件，避免弹窗反复打开导致内存泄漏。
 */
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** 当前坐标 "lng,lat"，缺省时以合肥为初始中心 */
    modelValue?: string
    /** 地图容器高度（px） */
    height?: number
  }>(),
  { modelValue: '', height: 320 },
)

const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

/** 默认中心：合肥（lng,lat） */
const DEFAULT_CENTER: [number, number] = [117.2272, 31.8206]

/**
 * 解析 "lng,lat" 字符串
 * @param {string | undefined} value 坐标文本
 * @returns {[number, number] | null} [lng, lat]，格式非法时为 null
 */
function parse(value: string | undefined): [number, number] | null {
  if (!value) return null
  const parts = value.split(',').map((s) => Number(s.trim()))
  if (parts.length !== 2 || parts.some((n) => Number.isNaN(n))) return null
  const [lng, lat] = parts
  if (lng < -180 || lng > 180 || lat < -90 || lat > 90) return null
  return [lng, lat]
}

/** 将 Leaflet 经纬度格式化为 "lng,lat"（保留 6 位小数） */
function format(latlng: L.LatLng): string {
  return `${latlng.lng.toFixed(6)},${latlng.lat.toFixed(6)}`
}

// 地图容器
const mapEl = ref<HTMLDivElement | null>(null)
// Leaflet 实例与标记，卸载时置空
let map: L.Map | null = null
let marker: L.Marker | null = null
// 最近一次由组件内部 emit 的值：父级回传时跳过重复定位，避免地图抖动
let lastValue = ''

/** 向外同步坐标 */
function emitLatLng(latlng: L.LatLng) {
  const value = format(latlng)
  lastValue = value
  emit('update:modelValue', value)
}

onMounted(() => {
  if (!mapEl.value) return
  const [lng, lat] = parse(props.modelValue) ?? DEFAULT_CENTER

  map = L.map(mapEl.value, {
    center: [lat, lng],
    zoom: 15,
    zoomControl: true,
    attributionControl: false,
  })

  // 高德卫星瓦片（GCJ-02），子域 1-4
  L.tileLayer('https://webst0{s}.is.autonavi.com/appmaptile?style=6&x={x}&y={y}&z={z}', {
    subdomains: ['1', '2', '3', '4'],
    minZoom: 3,
    maxZoom: 18,
  }).addTo(map)

  // 自定义圆形图标，避免默认 marker 图片在打包后路径失效
  marker = L.marker([lat, lng], {
    draggable: true,
    icon: L.divIcon({
      className: '',
      html:
        '<div style="width:16px;height:16px;border-radius:50%;background:#0F8B8D;' +
        'border:3px solid #fff;box-shadow:0 0 0 2px rgba(15,139,141,.55)"></div>',
      iconSize: [16, 16],
      iconAnchor: [8, 8],
    }),
  }).addTo(map)

  // 拖拽结束：以 marker 新位置为准
  marker.on('dragend', () => {
    if (!marker) return
    emitLatLng(marker.getLatLng())
  })

  // 点击地图：移动 marker 并回传坐标
  map.on('click', (e: L.LeafletMouseEvent) => {
    marker?.setLatLng(e.latlng)
    emitLatLng(e.latlng)
  })

  // 弹窗展开动画结束后修正地图尺寸，避免出现空白区域
  setTimeout(() => map?.invalidateSize(), 200)
})

// 文本框修改时同步地图位置与 marker
watch(
  () => props.modelValue,
  (value) => {
    if (!map || !marker || !value || value === lastValue) return
    const parsed = parse(value)
    if (!parsed) return
    const [lng, lat] = parsed
    marker.setLatLng([lat, lng])
    map.panTo([lat, lng])
  },
)

onBeforeUnmount(() => {
  map?.remove()
  map = null
  marker = null
})
</script>

<template>
  <div ref="mapEl" class="coord-picker" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.coord-picker {
  width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--c-line);
  background: var(--c-surface-2);
}
</style>
