/** 语义标签映射（与原型 UI.planTag / statusTag / levelTag 保持一致） */

export interface TagStyle {
  text: string
  // color/textColor 会直接透传给 n-tag 的 color / text-color（运行时接受任意 hex，
  // 但 Naive 的类型声明只允许预设色名，这里放宽为 any 以支持设计 token 色值）
  color: any
  textColor: any
}

const T = {
  primary: { color: '#E5F4F4', textColor: '#0A6A6C' },
  accent: { color: '#FFEFE6', textColor: '#E8662B' },
  gold: { color: '#FBF3E2', textColor: '#C08A2E' },
  success: { color: '#E6F6EE', textColor: '#2E9E6B' },
  warn: { color: '#FBF3E2', textColor: '#D9971A' },
  info: { color: '#E8F1FA', textColor: '#1B7FD4' },
  danger: { color: '#FDECEC', textColor: '#E5484D' },
  mute: { color: '#EFF3F2', textColor: '#6E807E' },
}

const PLAN_MAP: Record<string, TagStyle> = {
  month: { text: '月卡', ...T.primary },
  season: { text: '季卡', ...T.info },
  year: { text: '年卡', ...T.gold },
}

export function planTag(plan: string | null | undefined): TagStyle {
  return PLAN_MAP[plan ?? 'none'] ?? { text: '未开通', ...T.mute }
}

export function statusTag(s: string | null | undefined): TagStyle {
  switch (s) {
    case 'normal':
    case 'on':
      return { text: '正常', ...T.success }
    case 'online':
      return { text: '已上架', ...T.success }
    case 'disabled':
    case 'off':
      return { text: '已停用', ...T.mute }
    case 'offline':
      return { text: '已下架', ...T.mute }
    case '待发货':
      return { text: '待发货', ...T.warn }
    case '配送中':
      return { text: '配送中', ...T.info }
    case '已完成':
    case 'done':
      return { text: '已完成', ...T.success }
    default:
      return { text: s ?? '—', ...T.mute }
  }
}

const LEVEL_MAP: Record<string, TagStyle> = {
  explode: { text: '爆户', ...T.accent },
  hot: { text: '狂口', ...T.success },
  fair: { text: '有口', ...T.warn },
  slow: { text: '慢口', ...T.mute },
  stop: { text: '停口', ...T.mute },
}

export function levelTag(level: string | null | undefined): TagStyle {
  return LEVEL_MAP[level ?? ''] ?? { text: level || '—', ...T.mute }
}

export function catTag(cat: string | null | undefined): TagStyle {
  switch (cat) {
    case '鱼竿':
      return { text: cat, ...T.primary }
    case '渔轮':
      return { text: cat, ...T.accent }
    case '饵料':
      return { text: cat, ...T.gold }
    case '工具':
      return { text: cat, ...T.info }
    case '装备':
      return { text: cat, ...T.success }
    default:
      return { text: cat ?? '—', ...T.mute }
  }
}

export function payTag(pay: string | null | undefined): TagStyle {
  if (!pay) return { text: '—', ...T.mute }
  if (pay.includes('免费')) return { text: pay, ...T.success }
  return { text: pay, ...T.gold }
}

/** 鱼种标签（钓点卡内使用） */
export const fishTag = (): TagStyle => ({ text: '', ...T.info })

/** 金额格式化：¥39.90 -> ¥39.9，整数去小数 */
export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0) || 0
  return '¥' + v.toFixed(2).replace(/\.?0+$/, '')
}

/** 数字显示：null/undefined -> 0 */
export function num(n: number | string | null | undefined): string {
  return String(n ?? 0)
}

/** 今天 + 周几（如 2026-11-18 周三） */
export function todayCN(): string {
  const d = new Date()
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${week}`
}