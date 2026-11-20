/**
 * theme/index.ts — Naive UI 主题与品牌色定义
 *
 * 职责：把原型「深邃湖面」设计 token 映射为 Naive UI 的 GlobalThemeOverrides，
 *      并导出供图表/内联样式复用的品牌色对象。
 * 使用：App.vue 中传入 NConfigProvider 的 :theme-overrides；brand 供图表与布局硬编码场景使用。
 * 注意：
 * - 这里的色值与 src/assets/styles.css 中的 CSS 变量需保持同步；
 * - common 定义全局语义色/圆角/字号，组件级键（Button/DataTable 等）只做局部微调。
 */
import type { GlobalThemeOverrides } from 'naive-ui'

/** Naive UI 主题：映射原型「深邃湖面」设计 token */
export const themeOverrides: GlobalThemeOverrides = {
  // 全局基础 token：主色/状态色/圆角/字号/字体/文本与边框色
  common: {
    /** 品牌主色（湖水青） */
    primaryColor: '#0F8B8D',
    primaryColorHover: '#12A0A2',
    primaryColorPressed: '#0A6A6C',
    primaryColorSuppl: '#12A0A2',
    /** 成功色 */
    successColor: '#2E9E6B',
    successColorHover: '#36AF7A',
    successColorPressed: '#27895D',
    /** 警告色 */
    warningColor: '#D9971A',
    warningColorHover: '#E5A62E',
    warningColorPressed: '#BF8414',
    /** 错误色 */
    errorColor: '#E5484D',
    errorColorHover: '#EA5F64',
    errorColorPressed: '#C93A3F',
    /** 信息色 */
    infoColor: '#1B7FD4',
    infoColorHover: '#3393E0',
    infoColorPressed: '#176DB5',
    /** 圆角：卡片/弹层 10px，小组件 8px */
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    /** 基准字号 */
    fontSize: '14px',
    /** 中文字体栈：优先系统苹方/微软雅黑 */
    fontFamily:
      '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif',
    /** 文本色阶：base 最深，1/2/3 依次变浅 */
    textColorBase: '#12211F',
    textColor1: '#12211F',
    textColor2: '#3D4F4D',
    textColor3: '#6E807E',
    borderColor: '#E3EAE8',
    dividerColor: '#EFF3F2',
    /** 弹窗/表格/卡片/页面底色 */
    modalColor: '#FFFFFF',
    tableHeaderColor: '#F8FAFA',
    tableColorHover: '#F4FAFA',
    cardColor: '#FFFFFF',
    bodyColor: '#F4F7F6',
  },
  // 按钮：统一中等字重
  Button: {
    fontWeight: '500',
  },
  // 表格：表头浅灰底、深色加粗表头文字、悬停行浅青底
  DataTable: {
    thColor: '#F8FAFA',
    thTextColor: '#3D4F4D',
    thFontWeight: '600',
    tdColorHover: '#F4FAFA',
    borderColor: '#EFF3F2',
  },
  // 卡片：统一描边色
  Card: {
    borderColor: '#E3EAE8',
  },
  // 弹窗/对话框：更大圆角
  Modal: {
    borderRadius: '14px',
  },
  Dialog: {
    borderRadius: '14px',
  },
  // 开关：开启态使用品牌主色
  Switch: {
    railColorActive: '#0F8B8D',
  },
}

/** 品牌色板：供图表配置、内联样式等无法读取 CSS 变量的场景使用 */
export const brand = {
  /** 品牌主色 */
  primary: '#0F8B8D',
  /** 主色深色（按压/文字） */
  primaryDark: '#0A6A6C',
  /** 主色浅色（背景/浅底标签） */
  primaryLight: '#E5F4F4',
  /** 强调色（橙） */
  accent: '#FF7A3D',
  /** 金色（会员/等级） */
  gold: '#C08A2E',
  /** 侧边栏深色底 */
  sidebar: '#0B2426',
}