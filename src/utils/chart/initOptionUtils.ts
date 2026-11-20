/**
 * ECharts option 构造工具集（管理后台通用图表配置）
 *
 * 模块职责：
 * 1. 提供柱状图、折线图、柱状+折线混合图、饼图、折柱混合多轴图的 option 工厂函数；
 * 2. 统一各图表的配色、网格、坐标轴、tooltip、图例与 dataZoom 等基础样式；
 * 3. 统一 tooltip 的 HTML 结构，保证不同图表在页面中的视觉表现一致。
 *
 * 输入输出约定：
 * - 每个 init*Option 函数接收「业务配置对象（含数据列表）」，返回可直接传入
 *   `echarts.setOption()` 的纯配置对象，不持有 DOM / 实例引用，函数内无副作用；
 * - 颜色默认取 chartTheme 的色盘 getColorDisk()；主题色通过 getVariable() 读取 CSS 变量，
 *   因此换肤时无需修改本文件；
 * - tooltip / legend 的 formatter 依赖调用方传入的单位(unit)与小数位(valueDecimals)。
 *
 * 使用方式：
 *   const option = initLineChartOption({ xAxis, unit: 'kg', dataList })
 *   chart.setOption(option)
 *
 * 注意事项：
 * - 返回的 option 允许被调用方覆盖局部字段（自行传入 tooltip / grid / colorList）；
 * - tooltip 使用内联样式拼 HTML，是为了避免 ECharts 生成的 HTML 与全局样式冲突；
 * - 渐变色的 colorStops 统一为「顶部高不透明度 → 底部全透明」，依赖自上而下的坐标方向。
 */
import dayjs from 'dayjs'
import { getVariable, getColorDisk, colorToRgba } from './chartTheme'

/**
 * 初始化柱状图和折线图参数
 * @param config 配置参数
 * @param chartData 数据参数
 * @param chartColors 颜色参数
 * @param gradientConfigs 渐变配置参数
 * @returns 返回柱状图和折线图参数
 */

interface ConfigParams {
  legends: string[] // 图例
  units: string[] // 单位
  grid?: {
    top?: string // 上边距
    left?: string // 左边距
    right?: string // 右边距
    bottom?: string // 下边距
    containLabel?: boolean // 是否包含标签
  } // 网格配置
  tooltipUnit?: string | undefined // 是否显示y副轴单位(用于tooltip中的提示显示)
  showDataZoom?: boolean | undefined // 是否显示数据缩放
  showAreaStyle?: boolean | undefined // 是否显示阴影
  chartType?: string | undefined
  colorsList?: string[]
}

// 数据参数示例
interface DataParams {
  xData: number[] | string[] // x轴数据
  firstBarData: number[] | string[] // 第一个柱状图数据
  secondBarData: number[] | string[] // 第二个柱状图数据
  lineData: number[] | string[] // 折线图数据
}

/**
 * 创建「柱线混合图」使用的数值轴（Y 轴）配置项
 * 左右两条 Y 轴共用同一套视觉规则，仅单位不同。
 * @param unit 轴名/单位（如 kW、条、℃），为空时不显示轴名
 * @returns ECharts Y 轴配置：数值轴 + 单位名称 + 虚线分割线，且强制从 0 起（min: 0）
 */
const createBarLineYAxisItem = (unit?: string) => ({
  type: 'value' as const,
  name: unit || '',
  // 轴名与轴线之间的留白（px），避免与刻度文字重叠
  nameGap: 26,
  nameTextStyle: {
    color: getVariable('foreground-secondary')
  },
  axisLabel: {
    color: getVariable('foreground-secondary')
  },
  splitLine: {
    show: true,
    lineStyle: {
      color: getVariable('border'),
      width: 1,
      type: 'dashed' as const
    }
  },
  min: 0
})

/**
 * 构造「柱状图 + 折线图」双 Y 轴混合图表 option
 *
 * 结构：第 1、2 个系列（柱/线，type 由 chartType 决定）使用左侧 Y 轴，
 * 第 3 个系列固定为折线并使用右侧 Y 轴，适合「数量 + 比例/趋势」类业务数据。
 *
 * @param config 图表配置：legends 图例名称（按 [系列1, 系列2, 系列3] 顺序）、
 *   units 两个 Y 轴的单位（units[2] 为备选单位）、grid 自定义网格、tooltipUnit 第三个系列的
 *   tooltip 单位、showDataZoom 是否显示底部缩放条、showAreaStyle 折线是否加面积渐变、
 *   chartType 前两个系列的图形类型（默认 bar）、colorsList 自定义色板
 * @param chartData 图表数据：xData 类目轴数据，firstBarData/secondBarData 前两个系列数据，
 *   lineData 第三个折线系列数据
 * @returns ECharts option：含 color、dataZoom、grid、tooltip、legend、xAxis、双 yAxis、series
 */
export const initBarLineOption = (
  config: ConfigParams,
  chartData: DataParams
) => {
  const {
    legends,
    units = [],
    grid,
    showDataZoom,
    tooltipUnit,
    showAreaStyle,
    chartType
  } = config
  const { xData, firstBarData, secondBarData, lineData } = chartData
  const chartColors = getColorDisk()
  // 按 option 的渲染层级顺序组装：配色 → 缩放条 → 画布边距 → 提示框 → 图例 → 坐标轴 → 系列
  const option = {
    color: config.colorsList || chartColors,
    // 底部数据缩放滑块：仅显式开启时创建，关闭时置空数组以移除 ECharts 默认组件
    dataZoom:
      showDataZoom === true
        ? [
            {
              show: true,
              type: 'slider',
              bottom: '10px',
              start: 0,
              end: 100,
              backgroundColor: `rgba(${getVariable('primary-rgb')}, 0.1)`, // 背景色
              dataBackground: {
                lineStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 5)` // 数据背景线色
                },
                areaStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 0)` // 数据背景区域色
                }
              },
              fillerColor: `rgba(${getVariable('primary-rgb')}, 0.2)`, // 填充色
              borderColor: `rgba(${getVariable('primary-rgb')}, 0)`, // 边框色
              handleStyle: {
                color: getVariable('primary'), // 两边手柄色
                borderColor: getVariable('primary') // 两边手柄边框色
              },
              moveHandleStyle: {
                color: getVariable('primary'), // 上方移动手柄色
                borderColor: getVariable('primary') // 上方移动手柄边框色
              },
              textStyle: {
                color: getVariable('foreground-secondary') // 文本色
              }
            }
          ]
        : [],
    grid: grid || {
      top: '24%',
      left: '3%',
      right: '4%',
      bottom: '1%',
      containLabel: true
    },
    // 轴触发提示框：formatter 自行拼 HTML，以便同时展示色块、系列名、数值与单位
    tooltip: {
      trigger: 'axis',
      backgroundColor: getVariable('background-secondary'),
      borderColor: getVariable('primary-light'),
      borderWidth: 1,
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: '#999'
        }
      },
      formatter: function (params: any) {
        let result = `<div class="text-sm mb-2 text-foreground font-500">${params[0].axisValue}</div>`
        params.forEach((item: any, index: number) => {
          let backgroundStyle = ''
          const baseColor = chartColors[item.seriesIndex] || chartColors[index]

          if (item.seriesType === 'bar' && typeof item.color === 'object') {
            backgroundStyle = `background: linear-gradient(to bottom, ${colorToRgba(
              baseColor,
              0.9
            )}, ${colorToRgba(baseColor, 0)});`
          } else {
            backgroundStyle = `background: ${baseColor};`
          }

          const hasValue = item.value != null
          const displayValue = hasValue ? item.value : '--'
          const indicatorShape =
            item.seriesType === 'bar' ? '' : 'border-radius: 50%;'
          // units[2] 为备选单位，当 units[0] 为空时使用
          const primaryUnit = units[0] || units[2]
          const unitSuffix = hasValue
            ? index === legends.length - 1
              ? tooltipUnit
                ? `（${tooltipUnit}）`
                : ''
              : primaryUnit
                ? `（${primaryUnit}）`
                : ''
            : ''
          result += `
            <div class="flex items-center">
              <span style="display:inline-block;width:8px;height:8px;${backgroundStyle} margin-right:5px;${indicatorShape}"></span>
              <span class="flex-1 min-w-150px text-foreground-secondary" style="max-width:300px;word-break:break-all;white-space:normal;">${item.seriesName}</span>
              <span class="font-bold text-foreground">${displayValue}</span>
              <span class="text-foreground-secondary">${unitSuffix}</span>
            </div>`
        })
        return result
      }
    },
    // 图例顺序必须与 series 一一对应：前两项为方块（柱/线），第三项固定为圆点（折线）
    legend: {
      data: [
        {
          name: legends[0],
          icon: 'rect'
        },
        {
          name: legends[1],
          icon: 'rect'
        },
        {
          name: legends[2],
          icon: 'circle'
        }
      ],
      top: 0,
      textStyle: {
        color: getVariable('foreground') // 图例文字颜色
      },
      itemGap: 16, // 图例项之间的间距
      itemWidth: 8,
      itemHeight: 8
    },
    // 类目轴：刻度线隐藏，仅保留轴线；axisPointer 为 shadow，悬停时高亮当前类目整列
    xAxis: [
      {
        type: 'category',
        data: xData,
        axisLabel: {
          color: getVariable('foreground-secondary'),
          margin: 18 // 文字与 x 轴线的距离
        },
        axisLine: {
          show: true,
          lineStyle: {
            color: getVariable('border'),
            width: 1,
            type: 'solid'
          }
        },
        axisPointer: {
          type: 'shadow'
        },
        axisTick: {
          show: false // 不显示坐标轴刻度线
        }
      }
    ],
    // 双 Y 轴：前两个系列共用左轴（units[0]），折线系列使用右轴（units[1]），两者刻度互相独立
    yAxis: [createBarLineYAxisItem(units[0]), createBarLineYAxisItem(units[1])],
    // 系列顺序与图例一致；前两个系列按 chartType 切换图形，第三项固定为折线并右轴对齐
    series: [
      {
        name: legends[0],
        type: chartType || 'bar',
        smooth: chartType === 'line',
        // 柱体使用纵向三段渐变（0.9 → 0.6 → 0），营造底部渐隐的轻量视觉，非业务语义
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: colorToRgba(chartColors[0], 0.9) },
              { offset: 0.7, color: colorToRgba(chartColors[0], 0.6) },
              { offset: 1, color: colorToRgba(chartColors[0], 0) }
            ]
          }
        },
        areaStyle:
          showAreaStyle && chartType === 'line'
            ? {
                color: (() => {
                  const baseColor = chartColors[0]
                  return {
                    type: 'linear' as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: colorToRgba(baseColor, 0.9) },
                      { offset: 1, color: colorToRgba(baseColor, 0) }
                    ]
                  }
                })()
              }
            : undefined,
        data: firstBarData
      },
      {
        name: legends[1],
        type: chartType || 'bar',
        smooth: chartType === 'line',
        itemStyle: {
          color: {
            type: 'linear',
            x: 0,
            y: 0,
            x2: 0,
            y2: 1,
            colorStops: [
              { offset: 0, color: colorToRgba(chartColors[1], 0.9) },
              { offset: 0.7, color: colorToRgba(chartColors[1], 0.6) },
              { offset: 1, color: colorToRgba(chartColors[1], 0) }
            ]
          }
        },
        areaStyle:
          showAreaStyle && chartType === 'line'
            ? {
                color: (() => {
                  const baseColor = chartColors[1]
                  return {
                    type: 'linear' as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: colorToRgba(baseColor, 0.9) },
                      { offset: 1, color: colorToRgba(baseColor, 0) }
                    ]
                  }
                })()
              }
            : undefined,
        data: secondBarData
      },
      {
        name: legends[2],
        type: 'line',
        smooth: true,
        yAxisIndex: 1,
        symbol: 'circle',
        symbolSize: 6,
        itemStyle: {
          color: chartColors[2], // 圆点填充颜色
          borderColor: '#ffffff', // 圆点边框颜色
          borderWidth: 1 // 圆点边框宽度
        },
        areaStyle:
          showAreaStyle && chartType === 'line'
            ? {
                color: (() => {
                  const baseColor = chartColors[2]
                  return {
                    type: 'linear' as const,
                    x: 0,
                    y: 0,
                    x2: 0,
                    y2: 1,
                    colorStops: [
                      { offset: 0, color: colorToRgba(baseColor, 0.9) },
                      { offset: 1, color: colorToRgba(baseColor, 0) }
                    ]
                  }
                })()
              }
            : undefined,
        data: lineData
      }
    ]
  }
  return option
}

/**
 * 初始化折线图参数
 * @param lineChartOptionParmas 参数
 * @returns 返回折线图参数
 */
interface LineChartOptionParams {
  colorList?: string[] | null | undefined
  xAxis: string[] // 横坐标数据
  unit: string // 单位(如: kW, ℃, %, 应用与Y轴名和tooltip提示中的单位)
  grid?: {
    top?: string // 上边距
    left?: string // 左边距
    right?: string // 右边距
    bottom?: string // 下边距
    containLabel?: boolean // 是否包含标签
  } // 网格配置
  tooltip?: any // 提示框配置
  showDataZoom?: boolean // 是否显示数据缩放
  dataZoomStart?: number // 数据缩放开始位置
  dataZoomEnd?: number // 数据缩放结束位置
  dataList: {
    name: string // 系列名称
    data: (number | null | undefined)[] // 数据
    hideAreaStyle?: boolean // 是否隐藏区域渐变样式,默认不隐藏渐变色，按需传参
    step?: 'start' | 'middle' | 'end' // 阶梯折线类型，设置后呈现阶梯状
    smooth?: boolean // 是否平滑曲线，默认 !step
    lineType?: 'dotted' | 'solid' | 'dashed' // 折线类型，默认虚线
    showSymbol?: boolean // 是否显示圆点，默认 false
  }[] // 数据列表,有几条折线就有几个对象
}
/**
 * 构造纯折线图 option（支持多系列、阶梯线、自定义线型与面积渐变）
 *
 * @param lineChartOptionParmas 图表参数：
 *   colorList 可选自定义色板、xAxis 类目轴刻度、unit 唯一 Y 轴单位、grid 画布边距、
 *   tooltip 整体覆盖提示框、showDataZoom 是否显示缩放条（false 时隐藏）、
 *   dataZoomStart/dataZoomEnd 缩放区间百分比、dataList 折线系列数组
 * @returns ECharts option：color、grid、tooltip、legend、dataZoom、单 xAxis、单 yAxis、series
 */
export const initLineChartOption = (
  lineChartOptionParmas: LineChartOptionParams
) => {
  const {
    colorList,
    xAxis,
    unit,
    grid,
    tooltip,
    dataList,
    dataZoomStart,
    dataZoomEnd,
    showDataZoom
  } = lineChartOptionParmas
  // 未传色板时回落到主题色盘；全部系列按索引顺序循环取色
  const colors = colorList || getColorDisk()
  return {
    color: colors,
    grid: grid || {
      top: '50px',
      left: '50px',
      right: '50px',
      bottom: '40px',
      containLabel: true
    },
    tooltip: tooltip || {
      trigger: 'axis',
      backgroundColor: getVariable('background-secondary'),
      boxShadow: '0px 64px 26px 0px #00000003, 0px 100px 28px 0px #00000000',
      borderColor: getVariable('primary-light'),
      borderWidth: 1,
      // HTML tooltip 挂 body，避免抽屉/滚动容器 overflow 裁剪（仅 renderMode 为 html 时生效）
      // appendTo: 'body',
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: getVariable('border')
        }
      },
      formatter: function (params: any) {
        let result = `<div style="font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;">${params[0].axisValue}</div>`
        params.forEach((item: any, index: number) => {
          result += `
            <div style="display:flex;align-items:center;margin:5px 0;color:var(--foreground);">
              <span style="display:inline-block;width:10px;height:10px;background:${item.color};margin-right:5px;border-radius: 50%"></span>
              <span style="flex:1; min-width: 150px;max-width: 300px;margin-right: 10px;color:var(--foreground-secondary);word-break:break-all;white-space:normal;">${item.seriesName}</span>
              <span style="font-weight:500;">${item.value || item.value === 0 ? item.value : '--'}</span>
              <span style="color:var(--foreground-secondary);font-weight:400;">${unit ? '（' + unit + '）' : ''}</span>
            </div>`
        })
        return result
      }
    },
    legend: {
      data: dataList.map((item) => item.name),
      top: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 20,
      icon: 'rect',
      textStyle: {
        color: getVariable('foreground'),
        fontSize: 12
      }
    },
    dataZoom:
      showDataZoom === false
        ? []
        : [
            {
              show: true,
              type: 'slider',
              height: 20,
              bottom: '10px',
              start: dataZoomStart || 0,
              end: dataZoomEnd || 100,
              backgroundColor: `rgba(${getVariable('primary-rgb')}, 0.1)`, // 背景色
              dataBackground: {
                lineStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 5)` // 数据背景线色
                },
                areaStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 0)` // 数据背景区域色
                }
              },
              fillerColor: `rgba(${getVariable('primary-rgb')}, 0.2)`, // 填充色
              borderColor: `rgba(${getVariable('primary-rgb')}, 0)`, // 边框色
              handleStyle: {
                color: getVariable('primary'), // 两边手柄色
                borderColor: getVariable('primary') // 两边手柄边框色
              },
              moveHandleStyle: {
                color: getVariable('primary'), // 上方移动手柄色
                borderColor: getVariable('primary') // 上方移动手柄边框色
              },
              textStyle: {
                color: getVariable('foreground-secondary') // 文本色
              }
            }
          ],
    xAxis: [
      {
        type: 'category',
        data: xAxis,
        axisPointer: {
          type: 'shadow'
        },
        axisTick: {
          show: false // 不显示坐标轴刻度线
        },
        axisLine: {
          lineStyle: {
            color: getVariable('border')
          }
        },
        axisLabel: {
          color: getVariable('foreground-secondary')
        }
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: unit,
        nameTextStyle: {
          color: getVariable('foreground-secondary')
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: getVariable('border'),
            width: 1,
            type: 'dashed'
          }
        },
        axisLine: {
          lineStyle: {
            color: getVariable('border')
          }
        },
        axisLabel: {
          color: getVariable('foreground-secondary')
        }
      }
    ],
    // 逐系列生成折线：阶梯线(smooth=false)、平滑曲线、线型与面积渐变均由 dataList 项控制
    series: dataList.map((item, index) => {
      return {
        name: item.name,
        type: 'line',
        data: item.data,
        smooth: item.smooth ?? !item.step,
        step: item.step,
        showSymbol: item.showSymbol ?? false,
        lineStyle: {
          type: item.lineType || 'solid' // 'dotted' 点型虚线 'solid' 实线 'dashed' 线型虚线
        },
        areaStyle: item.hideAreaStyle
          ? undefined
          : {
              // 使用 colors 中 index 对应的颜色，仅从上到下做透明度渐变
              color: (() => {
                const baseColor = colors[index % colors.length] || colors[0]
                return {
                  type: 'linear' as const,
                  x: 0,
                  y: 0,
                  x2: 0,
                  y2: 1,
                  colorStops: [
                    { offset: 0, color: colorToRgba(baseColor, 0.9) },
                    { offset: 1, color: colorToRgba(baseColor, 0) }
                  ]
                }
              })()
            }
      }
    })
  }
}

/**
 * 初始化柱状图参数
 * @param barChartOptionParmas 参数
 * @returns 返回柱状图参数
 */
interface BarChartOptionParams {
  colorList?: string[] | null | undefined
  xAxis: string[] // 横坐标数据
  unit: string // 单位(如: kW, ℃, %, 应用与Y轴名和tooltip提示中的单位)
  grid?: {
    top?: string // 上边距
    left?: string // 左边距
    right?: string // 右边距
    bottom?: string // 下边距
    containLabel?: boolean // 是否包含标签
  } // 网格配置
  tooltip?: any // 提示框配置
  legendSelected?: any // 图例选中状态
  tooltipShowTimeRange?: boolean // 提示框中是否显示时间范围，例用电量中显示：2026-02-10 10:00 - 11:00
  /** tooltip 时间范围起始相对当前点向前偏移的分钟数，仅 tooltipShowTimeRange 为 true 时生效，默认 15 */
  tooltipTimeRangeSubtractMinutes?: number
  valueDecimals?: number // 数值保留小数位数，用于 tooltip 展示
  showDataZoom?: boolean // 是否显示数据缩放
  dataZoomStart?: number // 数据缩放开始位置
  dataZoomEnd?: number // 数据缩放结束位置
  dataList: {
    name: string // 系列名称
    data: (number | null | undefined)[] // 数据
    barMaxWidth?: number
    stack?: string | null | undefined // 是否呈现堆叠图
    showAreaStyle?: boolean // 是否显示柱状图渐变样式,默认不展示渐变色，按需传参
  }[] // 数据列表,有几条折线就有几个对象
}
/**
 * 构造柱状图 option（支持多系列、堆叠、柱宽限制与顶部渐隐渐变）
 *
 * @param barChartOptionParmas 图表参数：
 *   colorList 自定义色板、xAxis 类目轴刻度、unit 唯一 Y 轴单位、grid 画布边距、
 *   tooltip 整体覆盖提示框、legendSelected 图例初始选中态、
 *   tooltipShowTimeRange 是否在提示框头部展示时间区间（如用电量 10:00-11:00）、
 *   tooltipTimeRangeSubtractMinutes 时间区间起点相对当前点向前偏移的分钟数（默认 15）、
 *   valueDecimals 数值保留小数位、showDataZoom/dataZoomStart/dataZoomEnd 缩放条配置、
 *   dataList 柱状系列数组（barMaxWidth 柱最大宽度、stack 堆叠分组、showAreaStyle 是否渐变）
 * @returns ECharts option：color、grid、tooltip、legend、dataZoom、单 xAxis、单 yAxis、series
 */
export const initBarChartOption = (
  barChartOptionParmas: BarChartOptionParams
) => {
  const {
    colorList,
    xAxis,
    unit,
    grid,
    tooltip,
    dataList,
    dataZoomStart,
    dataZoomEnd,
    tooltipShowTimeRange,
    tooltipTimeRangeSubtractMinutes = 15,
    valueDecimals,
    showDataZoom,
    legendSelected
  } = barChartOptionParmas
  const colors = colorList || getColorDisk()
  // 供 tooltip 计算时间区间起点，抽成局部变量避免 formatter 内重复解构
  const tooltipRangeSubtractM = tooltipTimeRangeSubtractMinutes
  return {
    color: colors,
    grid: grid || {
      top: '50px',
      left: '50px',
      right: '50px',
      bottom: '40px',
      containLabel: true
    },
    tooltip: tooltip || {
      trigger: 'axis',
      backgroundColor: getVariable('background-secondary'),
      boxShadow: '0px 64px 26px 0px #00000003, 0px 100px 28px 0px #00000000',
      borderColor: getVariable('primary-light'),
      borderWidth: 1,
      // appendTo: 'body',
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: getVariable('border')
        }
      },
      formatter: function (params: any) {
        let result = !tooltipShowTimeRange
          ? `<div style="font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;">${params[0].axisValue}</div>`
          : `<div style="display:flex;align-items:center;gap: 8px;font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;">
            <span>${dayjs(params[0].axisValue).subtract(tooltipRangeSubtractM, 'minutes').format('YYYY-MM-DD')}</span>
            <span>${dayjs(params[0].axisValue).subtract(tooltipRangeSubtractM, 'minutes').format('HH:mm') + '-' + dayjs(params[0].axisValue).format('HH:mm')}</span>
          </div>`
        params.forEach((item: any, index: number) => {
          let backgroundStyle = ''
          if (item.seriesType === 'bar' && typeof item.color === 'object') {
            const baseColor =
              colors[item.seriesIndex] ?? colors[index] ?? colors[0]
            backgroundStyle = `background: linear-gradient(to bottom, ${colorToRgba(baseColor, 0.9)}, ${colorToRgba(baseColor, 0.6)}, ${colorToRgba(baseColor, 0)});`
          } else {
            backgroundStyle = `background: ${item.color};`
          }
          const displayValue =
            item.value != null && item.value !== ''
              ? typeof valueDecimals === 'number'
                ? Number(item.value).toFixed(valueDecimals)
                : item.value
              : '--'
          result += `
            <div style="display:flex;align-items:center;margin:5px 0;color:var(--foreground);">
              <span style="display:inline-block;width:10px;height:10px;${backgroundStyle} margin-right:5px;border-radius: 50%"></span>
              <span style="flex:1; min-width: 150px;max-width: 300px;margin-right: 10px;color:var(--foreground-secondary);word-break:break-all;white-space:normal;">${item.seriesName}</span>
              <span style="font-weight:500;">${displayValue}</span>
              <span style="color:var(--foreground-secondary);font-weight:400;">${unit ? '（' + unit + '）' : ''}</span>
            </div>`
        })
        return result
      }
    },
    legend: {
      data: dataList.map((item) => item.name),
      selected: legendSelected || {},
      top: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 20,
      icon: 'rect',
      textStyle: {
        color: getVariable('foreground'),
        fontSize: 12
      }
    },
    dataZoom:
      showDataZoom === false
        ? []
        : [
            {
              show: true,
              type: 'slider',
              height: 20,
              bottom: '10px',
              start: dataZoomStart || 0,
              end: dataZoomEnd || 100,
              backgroundColor: `rgba(${getVariable('primary-rgb')}, 0.1)`, // 背景色
              dataBackground: {
                lineStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 5)` // 数据背景线色
                },
                areaStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 0)` // 数据背景区域色
                }
              },
              fillerColor: `rgba(${getVariable('primary-rgb')}, 0.2)`, // 填充色
              borderColor: `rgba(${getVariable('primary-rgb')}, 0)`, // 边框色
              handleStyle: {
                color: getVariable('primary'), // 两边手柄色
                borderColor: getVariable('primary') // 两边手柄边框色
              },
              moveHandleStyle: {
                color: getVariable('primary'), // 上方移动手柄色
                borderColor: getVariable('primary') // 上方移动手柄边框色
              },
              textStyle: {
                color: getVariable('foreground-secondary') // 文本色
              }
            }
          ],
    xAxis: [
      {
        type: 'category',
        data: xAxis,
        axisPointer: {
          type: 'shadow'
        },
        axisTick: {
          show: false // 不显示坐标轴刻度线
        },
        axisLine: {
          lineStyle: {
            color: getVariable('border')
          }
        },
        axisLabel: {
          color: getVariable('foreground-secondary')
        }
      }
    ],
    yAxis: [
      {
        type: 'value',
        name: unit,
        nameTextStyle: {
          color: getVariable('foreground-secondary')
        },
        splitLine: {
          show: true,
          lineStyle: {
            color: getVariable('border'),
            width: 1,
            type: 'dashed'
          }
        },
        axisLine: {
          lineStyle: {
            color: getVariable('border')
          }
        },
        axisLabel: {
          color: getVariable('foreground-secondary')
        }
      }
    ],
    // 柱状系列：stack 相同的系列自动堆叠；showAreaStyle 时启用顶部高不透明、底部透明的三段渐变
    series: dataList.map((item, index) => {
      return {
        name: item.name,
        type: 'bar',
        data: item.data,
        barMaxWidth: item.barMaxWidth || 20,
        stack: item.stack || undefined,
        itemStyle: item.showAreaStyle
          ? {
              color: {
                type: 'linear',
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  {
                    offset: 0,
                    color: colorToRgba(
                      colors[index % colors.length] || colors[0],
                      0.9
                    )
                  },
                  {
                    offset: 0.7,
                    color: colorToRgba(
                      colors[index % colors.length] || colors[0],
                      0.6
                    )
                  },
                  {
                    offset: 1,
                    color: colorToRgba(
                      colors[index % colors.length] || colors[0],
                      0
                    )
                  }
                ]
              }
            }
          : undefined
      }
    })
  }
}

/**
 * 初始化饼图参数
 */
interface PieChartOptionParams {
  title: string // 图表标题
  unit: string // 单位(如: kW, ℃, %, 应用与tooltip提示中的单位)
  radius: string[] | string // 饼图半径，格式为：['65%', '80%'] 或 50%，单个字符串表示饼图，数组表示环形图
  dataList: {
    name: string | any // 系列名称
    value: number | any // 数据
  }[] // 数据列表
  /** tooltip 中数值保留小数位数，不传则按原值展示 */
  valueDecimals?: number
}
/**
 * 构造饼图 / 环形图 option
 *
 * 空数据处理：饼图只表达正值，若数据全为空、全 0 或全负数，则渲染一个灰色占位环
 * 并关闭 tooltip，避免出现空白画布或 0 值扇区。
 *
 * @param pieChartOptionParmas 图表参数：
 *   title 系列名（tooltip 标题）、unit 数值单位、radius 半径
 *   （字符串为实心饼图，['65%','80%'] 形式为环形图）、dataList 扇区数据、valueDecimals 数值小数位
 * @returns ECharts option：color、tooltip、series（单个 pie 系列，无坐标轴）
 */
export const initPieChartOption = (
  pieChartOptionParmas: PieChartOptionParams
) => {
  const { title, unit, radius, dataList, valueDecimals } = pieChartOptionParmas
  const colors = getColorDisk()
  // 饼图仅能表达正值；全空 / 全 0 / 全负数时统一走「暂无数据」占位环
  const validList = (dataList ?? []).filter((item) => Number(item?.value) > 0)
  const isEmpty = validList.length === 0
  const chartData = isEmpty
    ? [
        {
          name: '暂无数据',
          value: 100,
          percentValue: 100,
          itemStyle: {
            color: getVariable('scroller'),
            borderColor: getVariable('border'),
            borderWidth: 1
          }
        }
      ]
    : validList
  return {
    color: colors,
    tooltip: {
      show: !isEmpty, // 无数据时不显示 tooltip
      trigger: 'item',
      backgroundColor: getVariable('background-secondary'),
      boxShadow: '0px 64px 26px 0px #00000003, 0px 100px 28px 0px #00000000',
      borderColor: getVariable('primary-light'),
      borderWidth: 1,
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: getVariable('border')
        }
      },
      position: function (point: any) {
        // 固定在鼠标右侧显示
        return [point[0] + 10, point[1]]
      },
      formatter: function (params: any) {
        const isPlaceholder = params.name === '暂无数据'
        const valueText = (() => {
          if (isPlaceholder) return '--'
          if (params.value != null || params.value === 0) {
            if (typeof valueDecimals === 'number') {
              return Number(params.value).toFixed(valueDecimals)
            }
            return params.value
          }
          return '--'
        })()
        let result = `<div style="font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;max-width:300px;word-break:break-all;white-space:normal;">${params.seriesName}</div>`
        result += `
          <div style="display:flex;align-items:center;margin:5px 0;color:var(--foreground);">
            <span style="display:inline-block;width:10px;height:10px;background:${params.color};margin-right:5px;border-radius: 50%"></span>
            <span style="flex:1; min-width: 150px;max-width: 300px;margin-right: 10px;color:var(--foreground-secondary);word-break:break-all;white-space:normal;">${params.name}</span>
            <span style="font-weight:500;">${valueText}</span>
            <span style="color:var(--foreground-secondary);font-weight:400;">${!isPlaceholder && unit ? '（' + unit + '）' : ''}</span>
          </div>`
        return result
      }
    },
    series: [
      {
        name: title,
        type: 'pie',
        radius: radius,
        avoidLabelOverlap: false,
        // 多个扇区之间留 1° 间隙；单扇区（含「暂无数据」占位环）时为 0，避免出现缺口
        padAngle: chartData.length > 1 ? 1 : 0,
        label: {
          show: false,
          position: 'center'
        },
        emphasis: {
          label: {
            show: false
          }
        },
        labelLine: {
          show: false
        },
        data: chartData
      }
    ]
  }
}

/** 三轴配置，leftAxis 对应 yAxisIndex:0，rightAxis 对应 yAxisIndex:1，farRightAxis 对应 yAxisIndex:2 */
interface TripleYAxisConfig {
  leftAxis?: {
    unit?: string
    name?: string
    min?: number
    max?: number
    interval?: number
  }
  rightAxis?: {
    unit?: string
    name?: string
    min?: number
    max?: number
    interval?: number
  }
  /** 第三个Y轴（最右侧），对应 yAxisIndex: 2 */
  farRightAxis?: {
    unit?: string
    name?: string
    min?: number
    max?: number
    interval?: number
  }
}

/** @deprecated 使用 TripleYAxisConfig 替代 */
interface DualYAxisConfig extends TripleYAxisConfig {}

/**
 * 初始化折柱混合图参数
 * @param lineBarChartOptionParmas 参数
 * @returns 返回折线柱状图参数
 */
interface LineBarChartOptionParams {
  colorList?: string[] | null | undefined
  xAxis: string[] // 横坐标数据
  xAxisName?: string // 横坐标轴名称
  xAxisNameLocation?: 'start' | 'middle' | 'end' // 横坐标轴名称位置
  unit?: string // 单轴时的单位(如: kW, ℃, %)
  /** 单轴时 Y 轴位置，默认 left */
  singleAxisPosition?: 'left' | 'right'
  /** 多轴配置，设置后启用多Y轴（支持最多3个轴：leftAxis/rightAxis/farRightAxis） */
  yAxisConfig?: TripleYAxisConfig
  grid?: {
    top?: string // 上边距
    left?: string // 左边距
    right?: string // 右边距
    bottom?: string // 下边距
    containLabel?: boolean // 是否包含标签
  } // 网格配置
  tooltip?: any // 提示框配置
  legendSelected?: any // 图例选中状态
  tooltipShowTimeRange?: boolean // 提示框中是否显示时间范围，例用电量中显示：2026-02-10 10:00 - 11:00
  timeRangeMinutes?: number // 时间范围分钟数，用于 tooltip 中显示时间范围，默认15分钟
  /** 为 true 时 tooltip 中数值按绝对值展示（如充放电为负功率时仍显示正数） */
  tooltipAbsoluteValues?: boolean
  valueDecimals?: number // 数值保留小数位数，用于 tooltip 展示
  showDataZoom?: boolean // 是否显示数据缩放
  dataZoomStart?: number // 数据缩放开始位置
  dataZoomEnd?: number // 数据缩放结束位置
  /** 图表方向：vertical 为垂直柱状图(category 在 X 轴)，horizontal 为水平柱状图(category 在 Y 轴) */
  orientation?: 'vertical' | 'horizontal'
  /** 是否显示图例，默认 true */
  legendShow?: boolean
  dataList: {
    name: string // 系列名称
    data: (number | null | undefined)[] // 数据
    type: 'line' | 'bar' // 数据类型
    yAxisIndex?: number // 多轴时指定使用哪个Y/X轴，默认0
    /** tooltip 中显示的单位，不传则使用对应 Y 轴；传空字符串则不显示单位 */
    unit?: string
    showAreaStyle?: boolean // 是否显示区域渐变样式
    showSymbol?: boolean // 折线是否显示圆点，默认 false
    barMaxWidth?: number // 柱状图最大宽度
    stack?: string | null | undefined // 柱状图堆叠分组，相同 stack 值的系列将堆叠显示
    step?: 'start' | 'middle' | 'end' // 阶梯折线类型
    lineType?: 'dotted' | 'solid' | 'dashed' // 折线类型，默认 solid
    /** 折线节点图形，空心点为 emptyCircle */
    symbol?: 'emptyCircle' | 'circle' | 'none'
    /** 柱状图按数值条件着色，返回颜色值。如：value < 0 为负色，value >= 0 为正色 */
    itemColorCallback?: (value: number, dataIndex: number) => string
  }[] // 数据列表
}
/**
 * 创建数值轴（Y 轴，横向图时即 X 轴）配置项
 * @param config 轴配置：unit 单位、name 轴名（优先级高于 unit）、min/max 取值范围、
 *   interval 刻度间隔、splitLineShow 是否显示分割线（默认显示）、
 *   offset 轴的像素偏移（多轴叠加时用于错开）、axisLineShow 预留开关
 * @returns ECharts 数值轴配置；min/max/interval/offset 仅在显式传入时才写入，避免覆盖默认自适应
 */
const createYAxisItem = (
  config:
    | {
        unit?: string
        name?: string
        min?: number
        max?: number
        interval?: number
        splitLineShow?: boolean
        offset?: number
        axisLineShow?: boolean
      }
    | undefined
) => ({
  type: 'value' as const,
  name: config?.name ?? config?.unit ?? '',
  nameGap: 26,
  nameTextStyle: {
    color: getVariable('foreground-secondary')
  },
  axisLabel: {
    color: getVariable('foreground-secondary')
  },
  splitLine: {
    show: config?.splitLineShow !== false,
    lineStyle: {
      color: getVariable('border'),
      width: 1,
      type: 'dashed' as const
    }
  },
  axisLine: {
    lineStyle: {
      color: getVariable('border')
    }
  },
  ...(config?.min !== undefined && { min: config.min }),
  ...(config?.max !== undefined && { max: config.max }),
  ...(config?.interval !== undefined && { interval: config.interval }),
  ...(config?.offset !== undefined && { offset: config.offset })
})

/**
 * 构造折柱混合图 option（核心通用图表函数）
 *
 * 轴模式：
 * - 竖向（默认）：类目在 X 轴、数值在多条 Y 轴（最多 3 条：leftAxis/rightAxis/farRightAxis）；
 * - 横向：类目在 Y 轴，原多条 Y 轴转为多条 X 轴（用于长类目名的排行对比）。
 *
 * @param lineBarChartOptionParmas 图表参数：
 *   colorList 色板、xAxis 类目数据、xAxisName/xAxisNameLocation 类目轴名称及位置、
 *   unit 单轴单位、singleAxisPosition 单轴时 Y 轴位置（默认 left）、
 *   yAxisConfig 多轴配置（每轴可设 unit/name/min/max/interval）、grid 画布边距、
 *   tooltip 整体覆盖提示框、legendSelected 图例选中态、
 *   tooltipShowTimeRange + timeRangeMinutes 提示框时间区间、
 *   tooltipAbsoluteValues 是否按绝对值展示、valueDecimals 小数位、
 *   showDataZoom/dataZoomStart/dataZoomEnd 缩放条、orientation 图表方向、legendShow 是否显示图例、
 *   dataList 系列数组（type 图形类型、yAxisIndex 绑定轴、unit 提示框单位、stack 堆叠、
 *   itemColorCallback 按数值动态着色）
 * @returns ECharts option：color、grid、tooltip、legend、dataZoom、xAxis、yAxis、series
 */
export const initLineBarChartOption = (
  lineBarChartOptionParmas: LineBarChartOptionParams
) => {
  const {
    colorList,
    xAxis,
    xAxisName,
    xAxisNameLocation,
    unit,
    singleAxisPosition = 'left',
    yAxisConfig,
    grid,
    tooltip,
    dataList,
    dataZoomStart,
    dataZoomEnd,
    tooltipShowTimeRange,
    timeRangeMinutes,
    tooltipAbsoluteValues,
    valueDecimals,
    showDataZoom,
    legendSelected,
    orientation = 'vertical',
    legendShow = true
  } = lineBarChartOptionParmas

  const colors = colorList || getColorDisk()
  // 横向模式下类目轴与数值轴互换，后续所有轴构建逻辑都以此标记分流
  const isHorizontal = orientation === 'horizontal'
  // 检测使用的Y轴数量：根据 dataList 中的 yAxisIndex 和 yAxisConfig 配置决定
  const usedYAxisIndices = new Set(dataList.map((item) => item.yAxisIndex ?? 0))
  const maxYAxisIndex = Math.max(...usedYAxisIndices, 0)
  const hasMultipleAxes = !isHorizontal && maxYAxisIndex > 0
  const isTripleAxis = hasMultipleAxes && maxYAxisIndex >= 2
  // 横排时，原多Y轴变成多X轴
  const hasMultiAxisInHorizontal =
    isHorizontal &&
    yAxisConfig &&
    (yAxisConfig.rightAxis || yAxisConfig.farRightAxis)

  // 获取每个系列在 tooltip 中显示的单位：优先用 dataList[].unit，否则用对应 Y 轴的单位
  // 显式传 unit: '' 时不展示单位后缀（如 PUE 无量纲不宜带轴名称）
  const getTooltipUnit = (index: number) => {
    const item = dataList[index]
    if (item != null && Object.prototype.hasOwnProperty.call(item, 'unit')) {
      const u = item.unit
      return u == null || u === '' ? '' : String(u)
    }
    if (hasMultipleAxes && yAxisConfig) {
      const yAxisIdx = item?.yAxisIndex ?? 0
      if (yAxisIdx === 0)
        return yAxisConfig.leftAxis?.unit ?? yAxisConfig.leftAxis?.name
      if (yAxisIdx === 1)
        return yAxisConfig.rightAxis?.unit ?? yAxisConfig.rightAxis?.name
      if (yAxisIdx === 2)
        return yAxisConfig.farRightAxis?.unit ?? yAxisConfig.farRightAxis?.name
    }
    return unit
  }

  // 构建轴配置：vertical 时 category 在 x 轴，horizontal 时 category 在 y 轴
  const categoryAxisConfig = {
    type: 'category' as const,
    data: xAxis,
    ...(xAxisName && {
      name: xAxisName,
      nameLocation: xAxisNameLocation,
      nameGap: 20,
      nameTextStyle: { color: getVariable('foreground-secondary') }
    }),
    axisPointer: { type: 'shadow' as const },
    axisTick: { show: false },
    axisLine: { lineStyle: { color: getVariable('border') } },
    axisLabel: { color: getVariable('foreground-secondary') }
  }

  // 构建X轴配置：竖排时为分类轴，横排时为数值轴（直接使用axisYConfigDto配置）
  const builtXAxis = (() => {
    if (!isHorizontal) return [categoryAxisConfig]
    // 横排时，X轴配置即是axisYConfigDto，根据实际使用的yAxisIndex创建对应数量的X轴
    const axes = []
    const maxIndex = Math.max(...usedYAxisIndices, 0)

    for (let i = 0; i <= maxIndex; i++) {
      let axisConfig
      if (i === 0)
        axisConfig = yAxisConfig?.leftAxis // left -> 索引0
      else if (i === 1)
        axisConfig = yAxisConfig?.rightAxis // right -> 索引1
      else if (i === 2) axisConfig = yAxisConfig?.farRightAxis // right2 -> 索引2

      axes.push({
        ...createYAxisItem({
          unit: axisConfig?.unit ?? unit,
          name: axisConfig?.name ?? axisConfig?.unit ?? unit,
          splitLineShow: i === 0 ? undefined : false,
          offset: i > 1 ? (i - 1) * 30 : undefined
        }),
        axisTick: { show: false },
        position: i === 0 ? 'bottom' : 'top'
      })
    }

    return axes.length > 0
      ? axes
      : [
          {
            ...createYAxisItem({ unit, name: unit }),
            axisTick: { show: false },
            position: 'bottom'
          }
        ]
  })()

  // 构建Y轴配置：横排时为分类轴，竖排时为数值轴（支持多轴）
  const builtYAxis = (() => {
    if (isHorizontal) return [categoryAxisConfig]
    if (!hasMultipleAxes || !yAxisConfig) {
      return [
        {
          ...createYAxisItem({ unit, name: unit }),
          position: singleAxisPosition
        }
      ]
    }
    // 多轴模式：根据实际使用的轴数构建
    const axes = []
    // 左轴（索引0）
    if (yAxisConfig.leftAxis || usedYAxisIndices.has(0)) {
      axes.push(createYAxisItem(yAxisConfig.leftAxis))
    }
    // 右轴（索引1）
    if (yAxisConfig.rightAxis || usedYAxisIndices.has(1)) {
      axes.push(
        createYAxisItem({
          ...(yAxisConfig.rightAxis || {}),
          splitLineShow: false
        })
      )
    }
    // 最右轴（索引2）- 设置 offset 避免与第一条右轴重叠
    if (yAxisConfig.farRightAxis || usedYAxisIndices.has(2)) {
      axes.push(
        createYAxisItem({
          ...(yAxisConfig.farRightAxis || {}),
          splitLineShow: false,
          offset: 30 // 向右偏移 30px（略大于轴标签宽度），避免与第一条右轴重叠
        })
      )
    }
    return axes.length > 0
      ? axes
      : [
          {
            ...createYAxisItem({ unit, name: unit }),
            position: singleAxisPosition
          }
        ]
  })()

  return {
    color: colors,
    grid: grid || {
      top: '50px',
      left: '50px',
      right: '50px',
      bottom: '40px',
      containLabel: true
    },
    tooltip: tooltip || {
      trigger: 'axis',
      backgroundColor: getVariable('background-secondary'),
      boxShadow: '0px 64px 26px 0px #00000003, 0px 100px 28px 0px #00000000',
      borderColor: getVariable('primary-light'),
      borderWidth: 1,
      // appendTo: 'body',
      // 限制提示框在图表画布内，避免靠近容器边缘时超出可视区域被裁切
      confine: true,
      axisPointer: {
        type: 'cross',
        crossStyle: {
          color: getVariable('border')
        }
      },
      formatter: function (params: any) {
        let result = !tooltipShowTimeRange
          ? `<div style="font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;">${params[0].axisValue}</div>`
          : `<div style="display:flex;align-items:center;gap: 8px;font-size:14px;margin-bottom:5px;color:var(--foreground);font-weight:500;">
            <span>${dayjs(params[0].axisValue)
              .subtract(timeRangeMinutes ?? 15, 'minutes')
              .format('YYYY-MM-DD')}</span>
            <span>${
              dayjs(params[0].axisValue)
                .subtract(timeRangeMinutes ?? 15, 'minutes')
                .format('HH:mm') +
              '-' +
              dayjs(params[0].axisValue).format('HH:mm')
            }</span>
          </div>`
        params.forEach((item: any, index: number) => {
          let backgroundStyle = ''
          const paletteColor =
            colors[item.seriesIndex % colors.length] ??
            colors[index % colors.length] ??
            colors[0]
          if (item.seriesType === 'bar' && typeof item.color === 'object') {
            const baseColor =
              colors[item.seriesIndex] ?? colors[index] ?? colors[0]
            backgroundStyle = `background: linear-gradient(to bottom, ${colorToRgba(baseColor, 0.9)}, ${colorToRgba(baseColor, 0.6)}, ${colorToRgba(baseColor, 0)});`
          } else if (item.seriesType === 'line') {
            // 折线在部分主题/混合图下 params.color 不可靠，统一用 colorList 序位取色
            backgroundStyle = `background: ${paletteColor};`
          } else {
            backgroundStyle = `background: ${item.color ?? paletteColor};`
          }
          const raw = item.value
          let displayValue = '--'
          if (raw != null && raw !== '') {
            const n = Number(raw)
            if (!Number.isNaN(n)) {
              const v = tooltipAbsoluteValues ? Math.abs(n) : n
              displayValue =
                typeof valueDecimals === 'number'
                  ? v.toFixed(valueDecimals)
                  : String(v)
            } else {
              displayValue = String(raw)
            }
          }
          const tooltipUnit = getTooltipUnit(index)
          const unitSuffix = tooltipUnit ? `（${tooltipUnit}）` : ''
          result += `
            <div style="display:flex;align-items:center;margin:5px 0;color:var(--foreground);">
              <span style="display:inline-block;width:10px;height:10px;${backgroundStyle} margin-right:5px;border-radius: 50%"></span>
              <span style="flex:1; min-width: 150px;max-width: 300px;margin-right: 10px;color:var(--foreground-secondary);word-break:break-all;white-space:normal;">${item.seriesName}</span>
              <span style="font-weight:500;">${displayValue}</span>
              <span style="color:var(--foreground-secondary);font-weight:400;">${unitSuffix}</span>
            </div>`
        })
        return result
      }
    },
    // 图例：type 为 scroll，系列过多时自动分页；文本超宽用省略号截断
    legend: {
      show: legendShow,
      data: dataList.map((item) => ({
        name: item.name,
        icon: item.type === 'line' ? 'circle' : 'rect'
      })),
      selected: legendSelected || {},
      top: 0,
      left: 'center',
      itemWidth: 10,
      itemHeight: 10,
      itemGap: 20,
      // icon: 'rect',
      type: 'scroll',
      pageIconColor: getVariable('primary'),
      pageIconInactiveColor: getVariable('foreground'),
      pageTextStyle: {
        color: getVariable('foreground')
      },
      textStyle: {
        color: getVariable('foreground'),
        fontSize: 12,
        overflow: 'truncate',
        ellipsis: '...',
        width: 120
      }
    },
    dataZoom:
      showDataZoom === false
        ? []
        : [
            {
              show: true,
              type: 'slider',
              height: 20,
              bottom: '10px',
              start: dataZoomStart || 0,
              end: dataZoomEnd || 100,
              backgroundColor: `rgba(${getVariable('primary-rgb')}, 0.1)`, // 背景色
              dataBackground: {
                lineStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 5)` // 数据背景线色
                },
                areaStyle: {
                  color: `rgba(${getVariable('primary-rgb')}, 0)` // 数据背景区域色
                }
              },
              fillerColor: `rgba(${getVariable('primary-rgb')}, 0.2)`, // 填充色
              borderColor: `rgba(${getVariable('primary-rgb')}, 0)`, // 边框色
              handleStyle: {
                color: getVariable('primary'), // 两边手柄色
                borderColor: getVariable('primary') // 两边手柄边框色
              },
              moveHandleStyle: {
                color: getVariable('primary'), // 上方移动手柄色
                borderColor: getVariable('primary') // 上方移动手柄边框色
              },
              textStyle: {
                color: getVariable('foreground-secondary') // 文本色
              }
            }
          ],
    xAxis: builtXAxis,
    yAxis: builtYAxis,
    // 系列：折线显式绑定颜色（否则自定义色板会失效），柱状支持按数值回调着色或整体渐变
    series: dataList.map((item, index) => {
      const baseColor = colors[index % colors.length] || colors[0]
      const axisIndex =
        hasMultipleAxes || hasMultiAxisInHorizontal ? (item.yAxisIndex ?? 0) : 0
      const isLine = item.type === 'line'

      const seriesConfig: any = {
        name: item.name,
        type: item.type,
        data: item.data,
        showSymbol: item.showSymbol ?? false,
        smooth: isLine && !item.step,
        step: item.step
      }

      // 横排时原多Y轴变成多X轴，竖排时用yAxisIndex
      if (isHorizontal) {
        seriesConfig.xAxisIndex = axisIndex
      } else {
        seriesConfig.yAxisIndex = axisIndex
      }

      if (isLine) {
        // 必须显式绑定线条/拐点颜色，否则传入 colorList 时折线会落回主题默认色，图例与 tooltip 也会错位
        seriesConfig.lineStyle = {
          type: item.lineType || 'solid',
          color: baseColor
        }
        seriesConfig.itemStyle = {
          color: baseColor
        }
        if (item.showAreaStyle) {
          seriesConfig.areaStyle = {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colorToRgba(baseColor, 0.9) },
                { offset: 1, color: colorToRgba(baseColor, 0) }
              ]
            }
          }
        }
      } else {
        seriesConfig.barMaxWidth = item.barMaxWidth ?? 20
        if (item.stack) {
          seriesConfig.stack = item.stack
        }
        if (item.itemColorCallback) {
          seriesConfig.itemStyle = {
            color: (params: any) =>
              item.itemColorCallback!(params.value, params.dataIndex)
          }
        } else if (item.showAreaStyle) {
          seriesConfig.itemStyle = {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: colorToRgba(baseColor, 0.9) },
                { offset: 0.7, color: colorToRgba(baseColor, 0.6) },
                { offset: 1, color: colorToRgba(baseColor, 0) }
              ]
            }
          }
        }
      }

      return seriesConfig
    })
  }
}

/**
 * 估算文本渲染宽度（用于判断 X 轴标签是否放得下）
 * 借助 canvas measureText 获取真实字宽，避免不同字体的估算误差。
 * @param text 待测量的文本（空串返回 0）
 * @param font canvas 字体简写，默认 12px sans-serif，需与坐标轴标签字号保持一致
 * @returns 文本宽度（px）；无 canvas 上下文时退化为「字符数 × 8」的粗略估算
 */
const measureTextWidth = (text: string, font = '12px sans-serif') => {
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return text.length * 8
  ctx.font = font
  return ctx.measureText(text).width
}

/**
 * 判断 X 轴标签是否需要旋转（按实际文本宽度计算，而非固定类目数量）
 * @param labels X 轴类目文本数组
 * @param chartWidth 图表容器宽度（px）
 * @returns 当单个类目可用宽度小于「最宽标签 + 8px 间距」时返回 true，调用方据此设置 axisLabel.rotate
 */
export const needRotateXLabel = (labels: string[], chartWidth: number) => {
  if (!labels.length || chartWidth <= 0) return false
  const maxLabelW = Math.max(...labels.map((l) => measureTextWidth(l || '')))
  // 预留左右 Y 轴/边距空间
  const plotWidth = Math.max(chartWidth - 100, 0)
  return plotWidth / labels.length < maxLabelW + 8
}
