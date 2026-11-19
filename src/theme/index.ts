import type { GlobalThemeOverrides } from 'naive-ui'

/** Naive UI 主题：映射原型「深邃湖面」设计 token */
export const themeOverrides: GlobalThemeOverrides = {
  common: {
    primaryColor: '#0F8B8D',
    primaryColorHover: '#12A0A2',
    primaryColorPressed: '#0A6A6C',
    primaryColorSuppl: '#12A0A2',
    successColor: '#2E9E6B',
    successColorHover: '#36AF7A',
    successColorPressed: '#27895D',
    warningColor: '#D9971A',
    warningColorHover: '#E5A62E',
    warningColorPressed: '#BF8414',
    errorColor: '#E5484D',
    errorColorHover: '#EA5F64',
    errorColorPressed: '#C93A3F',
    infoColor: '#1B7FD4',
    infoColorHover: '#3393E0',
    infoColorPressed: '#176DB5',
    borderRadius: '10px',
    borderRadiusSmall: '8px',
    fontSize: '14px',
    fontFamily:
      '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",system-ui,sans-serif',
    textColorBase: '#12211F',
    textColor1: '#12211F',
    textColor2: '#3D4F4D',
    textColor3: '#6E807E',
    borderColor: '#E3EAE8',
    dividerColor: '#EFF3F2',
    modalColor: '#FFFFFF',
    tableHeaderColor: '#F8FAFA',
    tableColorHover: '#F4FAFA',
    cardColor: '#FFFFFF',
    bodyColor: '#F4F7F6',
  },
  Button: {
    fontWeight: '500',
  },
  DataTable: {
    thColor: '#F8FAFA',
    thTextColor: '#3D4F4D',
    thFontWeight: '600',
    tdColorHover: '#F4FAFA',
    borderColor: '#EFF3F2',
  },
  Card: {
    borderColor: '#E3EAE8',
  },
  Modal: {
    borderRadius: '14px',
  },
  Dialog: {
    borderRadius: '14px',
  },
  Switch: {
    railColorActive: '#0F8B8D',
  },
}

export const brand = {
  primary: '#0F8B8D',
  primaryDark: '#0A6A6C',
  primaryLight: '#E5F4F4',
  accent: '#FF7A3D',
  gold: '#C08A2E',
  sidebar: '#0B2426',
}