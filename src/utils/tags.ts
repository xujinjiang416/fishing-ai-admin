/**
 * tags.ts — 列表/卡片语义标签与格式化工具
 *
 * 职责：
 * 1. 把后端返回的枚举值（套餐、状态、鱼情等级、分类、支付方式、订单/支付状态）
 *    映射为「文案 + 前景/背景色」的 TagStyle，供 n-tag 直接渲染；
 * 2. 提供金额、数字、日期等展示层格式化函数。
 * 依赖：无外部依赖，色值与主题/原型保持一致（Naive 主题见 src/theme）。
 * 注意：
 * - 所有映射函数对 null/undefined 均返回兜底标签，调用方无需再做空值判断；
 * - 色值为固定设计 token，修改时需同步 src/theme/index.ts。
 */

/**
 * 标签样式
 */
export interface TagStyle {
  /** 标签文案 */
  text: string
  // color/textColor 会直接透传给 n-tag 的 color / text-color（运行时接受任意 hex，
  // 但 Naive 的类型声明只允许预设色名，这里放宽为 any 以支持设计 token 色值）
  color: any
  textColor: any
}

/** 基础色板：按语义提供浅底 + 深字的组合 */
const T = {
  /** 主色（青） */
  primary: { color: '#E5F4F4', textColor: '#0A6A6C' },
  /** 强调色（橙） */
  accent: { color: '#FFEFE6', textColor: '#E8662B' },
  /** 金色（会员） */
  gold: { color: '#FBF3E2', textColor: '#C08A2E' },
  /** 成功（绿） */
  success: { color: '#E6F6EE', textColor: '#2E9E6B' },
  /** 警告（黄） */
  warn: { color: '#FBF3E2', textColor: '#D9971A' },
  /** 信息（蓝） */
  info: { color: '#E8F1FA', textColor: '#1B7FD4' },
  /** 危险（红） */
  danger: { color: '#FDECEC', textColor: '#E5484D' },
  /** 中性（灰） */
  mute: { color: '#EFF3F2', textColor: '#6E807E' },
}

/** 会员套餐映射：month 月卡 / season 季卡 / year 年卡 */
const PLAN_MAP: Record<string, TagStyle> = {
  month: { text: '月卡', ...T.primary },
  season: { text: '季卡', ...T.info },
  year: { text: '年卡', ...T.gold },
}

/**
 * 套餐标签
 * @param {string | null | undefined} plan 套餐标识
 * @returns {TagStyle} 对应套餐标签，未知或空值返回「未开通」
 */
export function planTag(plan: string | null | undefined): TagStyle {
  return PLAN_MAP[plan ?? 'none'] ?? { text: '未开通', ...T.mute }
}

/**
 * 通用状态标签（用户/商品/订单等共用）
 * @param {string | null | undefined} s 状态值（normal/on/online/disabled/off/offline/待发货/配送中/已完成/done）
 * @returns {TagStyle} 状态标签，未知值原样展示为灰色
 */
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

/** 鱼情等级映射：爆户 / 连杆 / 有口 / 慢口 / 停口 */
const LEVEL_MAP: Record<string, TagStyle> = {
  explode: { text: '爆户', ...T.accent },
  hot: { text: '连杆', ...T.success },
  fair: { text: '有口', ...T.warn },
  slow: { text: '慢口', ...T.mute },
  stop: { text: '停口', ...T.mute },
}

/**
 * 鱼情等级标签
 * @param {string | null | undefined} level 等级标识（explode/hot/fair/slow/stop）
 * @returns {TagStyle} 等级标签，未知值原样展示为灰色
 */
export function levelTag(level: string | null | undefined): TagStyle {
  return LEVEL_MAP[level ?? ''] ?? { text: level || '—', ...T.mute }
}

/**
 * 商品分类标签
 * @param {string | null | undefined} cat 分类名（鱼竿/渔轮/饵料/工具/装备）
 * @returns {TagStyle} 分类标签，未知值灰色
 */
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

/**
 * 钓点收费方式标签
 * @param {string | null | undefined} pay 收费文本（包含「免费」视为免费）
 * @returns {TagStyle} 免费绿色，其余金色；空值「—」
 */
export function payTag(pay: string | null | undefined): TagStyle {
  if (!pay) return { text: '—', ...T.mute }
  if (pay.includes('免费')) return { text: pay, ...T.success }
  return { text: pay, ...T.gold }
}

/** 鱼种标签（钓点卡内使用） */
export const fishTag = (): TagStyle => ({ text: '', ...T.info })

/**
 * 订单状态标签：覆盖待支付 → 待发货 → 已发货 → 已完成及退款 / 关闭分支
 * @param {string | null | undefined} s 订单状态文案
 * @returns {TagStyle} 对应颜色标签，未知值灰色
 */
export function orderStatusTag(s: string | null | undefined): TagStyle {
  switch (s) {
    case '待支付':
      return { text: '待支付', ...T.warn }
    case '待发货':
      return { text: '待发货', ...T.warn }
    case '已发货':
      return { text: '已发货', ...T.info }
    case '已完成':
      return { text: '已完成', ...T.success }
    case '已关闭':
      return { text: '已关闭', ...T.mute }
    case '退款中':
      return { text: '退款中', ...T.accent }
    case '待退款审核':
      return { text: '待退款审核', ...T.accent }
    case '部分退款':
      return { text: '部分退款', ...T.gold }
    case '已退款':
      return { text: '已退款', ...T.danger }
    default:
      return { text: s || '—', ...T.mute }
  }
}

/**
 * 支付状态标签
 * @param {string | null | undefined} s 支付状态（已支付/未支付/已退款/已关闭）
 * @returns {TagStyle} 对应颜色标签，未知值灰色
 */
export function payStatusTag(s: string | null | undefined): TagStyle {
  switch (s) {
    case '已支付':
      return { text: '已支付', ...T.success }
    case '未支付':
      return { text: '未支付', ...T.warn }
    case '已退款':
      return { text: '已退款', ...T.danger }
    case '已关闭':
      return { text: '已关闭', ...T.mute }
    default:
      return { text: s || '—', ...T.mute }
  }
}

/**
 * 金额格式化：¥39.90 -> ¥39.9，整数去小数
 * @param {number | string | null | undefined} n 金额数值或数字字符串
 * @returns {string} 带 ¥ 前缀的展示文本，空值按 0 处理
 */
export function money(n: number | string | null | undefined): string {
  const v = Number(n ?? 0) || 0
  return '¥' + v.toFixed(2).replace(/\.?0+$/, '')
}

/**
 * 数字显示：null/undefined -> 0
 * @param {number | string | null | undefined} n 原始数字
 * @returns {string} 字符串形式的数字
 */
export function num(n: number | string | null | undefined): string {
  return String(n ?? 0)
}

/**
 * 今天 + 周几（如 2026-11-18 周三）
 * @returns {string} 本地时区的「YYYY-MM-DD 周X」
 */
export function todayCN(): string {
  const d = new Date()
  // 0=周日，映射为中文「日一二三四五六」
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} 周${week}`
}