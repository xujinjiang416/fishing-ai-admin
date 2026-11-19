/**
 * chartTheme.ts — 图表配色（本项目管理后台自有色值，不复用外部主题变量）
 *
 * 复制的 initOptionUtils.ts 依赖 getVariable / getColorDisk / colorToRgba，
 * 这里直接用「深邃湖面」设计 token 的固定色值提供，不读取任何外部 CSS 变量。
 */

/** 图表用到的语义色（对齐 assets/styles.css 设计 token） */
const CHART_COLORS: Record<string, string> = {
  primary: '#0F8B8D',
  'primary-light': '#E5F4F4',
  'primary-rgb': '15, 139, 141',
  foreground: '#12211F',
  'foreground-secondary': '#6E807E',
  border: '#E3EAE8',
  'background-secondary': '#FFFFFF',
  scroller: '#EFF3F2',
}

/** 原版按 CSS 变量取色；这里改为返回上方固定色值 */
export function getVariable(name: string): string {
  return CHART_COLORS[name] ?? ''
}

/** 图表色盘（hex） */
const COLOR_DISK_HEX = [
  '#0F8B8D', // primary
  '#FF7A3D', // accent
  '#C08A2E', // gold
  '#1B7FD4', // info
  '#2E9E6B', // success
  '#D9971A', // warn
  '#E5484D', // danger
  '#0A6A6C', // primary-d
  '#E8662B', // accent-d
  '#3D4F4D', // ink-2
]

export function getColorDisk(type: 'hex' | 'rgb' = 'hex'): string[] {
  if (type === 'hex') return [...COLOR_DISK_HEX]
  return COLOR_DISK_HEX.map(hexToRgbString)
}

function hexToRgbString(hex: string): string {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}

/** 将颜色字符串转为 rgba(r,g,b,opacity)，支持 #RGB / #RRGGBB / rgb() / rgba() */
export function colorToRgba(color: string, opacity: number): string {
  color = (color || '').trim()
  const hexMatch = color.match(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/)
  if (hexMatch) {
    let r: number, g: number, b: number
    const hex = hexMatch[1]
    if (hex.length === 3) {
      r = parseInt(hex[0] + hex[0], 16)
      g = parseInt(hex[1] + hex[1], 16)
      b = parseInt(hex[2] + hex[2], 16)
    } else {
      r = parseInt(hex.slice(0, 2), 16)
      g = parseInt(hex.slice(2, 4), 16)
      b = parseInt(hex.slice(4, 6), 16)
    }
    return `rgba(${r},${g},${b},${opacity})`
  }
  const rgbMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)/,
  )
  if (rgbMatch) {
    return `rgba(${rgbMatch[1]},${rgbMatch[2]},${rgbMatch[3]},${opacity})`
  }
  return `rgba(15, 139, 141, ${opacity})` // 兜底用品牌主色
}