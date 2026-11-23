/**
 * admin.ts — 管理后台全部业务接口封装
 *
 * 职责：定义后端返回的领域类型（用户 / 套餐 / 商品 / 天气日志 / 钓点 / 订单 / 缓存 / 配置等），
 *      并按业务域组织 `api` 对象，供各视图调用。
 * 关键流程：视图 -> api.xxx() -> http 实例 -> 响应拦截器解包 {code,data,msg} -> 直接得到业务数据。
 * 依赖：./http（已装配 baseURL=/api、Bearer Token 注入、code 判定与 401 跳转）。
 * 注意：
 * - 所有接口均需管理员鉴权（http 请求拦截器自动附加 Authorization），仅 login 接口无需；
 * - 拦截器已解包，故此处 get/post/put/del 用类型断言还原 Promise<T>；
 * - 订单号参与 URL 时统一使用 encodeURIComponent，避免特殊字符破坏路径。
 */
import http from './http'

// ---------- 类型 ----------

/**
 * 当前登录管理员信息（登录接口返回，持久化于 localStorage）
 */
export interface AdminInfo {
  /** 管理员主键 ID */
  id: number
  /** 登录账号 */
  username: string
  /** 显示名称（侧边栏与顶栏展示） */
  name: string
  /** 角色名称，如「超级管理员」 */
  role: string
  /** 头像占位文字（通常取名称首字） */
  avatarText: string
}

/**
 * 通用分页结果
 * @template T 列表元素类型
 */
export interface Page<T> {
  /** 当前页数据列表 */
  list: T[]
  /** 记录总数 */
  total: number
  /** 当前页码，从 1 开始 */
  page: number
  /** 每页条数 */
  pageSize: number
}

/**
 * 移动端用户（后台「用户管理」列表项）
 */
export interface AdminUser {
  /** 用户业务唯一标识（字符串 ID） */
  uid: string
  /** 用户名（注册账号，历史手机号账号为空串） */
  username: string
  /** 用户昵称 */
  nickname: string
  /** 头像 URL，可为空字符串 */
  avatar: string
  /** 手机号，未绑定为 null */
  phone: string | null
  /** 所在城市，未知为 null */
  city: string | null
  /** 积分余额（整数） */
  points: number
  /** 连续签到天数（整数） */
  streak: number
  /** 会员套餐标识：month / season / year，未开通时为空串 */
  plan: string
  /** 套餐显示名称（如「月卡」） */
  planName: string
  /** 会员到期时间（日期字符串），未开通时为空串 */
  planExpire: string
  /** 注册时间（日期字符串） */
  joined: string
  /** 最近活跃时间（日期字符串） */
  lastActive: string
  /** 账号状态：normal 正常 / disabled 已停用 */
  status: string
  /** 累计天气查询次数 */
  weatherCount: number
}

/**
 * 会员套餐（后台「会员套餐」）
 */
export interface Plan {
  /** 套餐 ID */
  id: string
  /** 套餐名称 */
  name: string
  /** 有效时长（天），用于换算到期时间 */
  duration: number
  /** 时长展示文案（如「30 天」） */
  durationLabel: string
  /** 售价（元） */
  price: number
  /** 划线原价（元），无优惠为 null */
  origPrice: number | null
  /** 套餐图标标识 */
  icon: string
  /** 角标文案，无角标为 null */
  tag: string | null
  /** 角标配色类型（primary/accent/gold 等） */
  tagType: string
  /** 累计销量 */
  sales: number
  /** 上下架状态：on 启用 / off 停用 */
  status: string
  /** 排序权重（非负整数，越大越靠前） */
  sort: number
  /** 权益说明文案列表 */
  benefits: string[]
}

/**
 * 积分商城商品（后台「积分商城」）
 */
export interface Goods {
  /** 商品 ID */
  id: string
  /** 商品名称 */
  name: string
  /** 商品分类：鱼竿 / 渔轮 / 饵料 / 工具 / 装备 */
  cat: string
  /** 售价（元） */
  price: number
  /** 划线原价（元），无为 null */
  origPrice: number | null
  /** 库存数量 */
  stock: number
  /** 销量展示文本（后端可能返回「1.2k」等格式） */
  sales: string
  /** 商品主图 URL，无图为 null */
  img: string | null
  /** 是否支持积分抵扣 */
  pointsEnabled: boolean
  /** 上下架状态：online 已上架 / offline 已下架 */
  status: string
  /** 最后更新时间（日期字符串） */
  updated: string
}

/**
 * 天气查询日志（后台「天气数据」）
 */
export interface WeatherLog {
  /** 记录 ID */
  id: string
  /** 发起查询的用户昵称 */
  user: string
  /** 查询地点名称，可为 null */
  place: string | null
  /** 地点详情（省市区/钓点），可为 null */
  placeDetail: string | null
  /** 查询日期（YYYY-MM-DD） */
  date: string
  /** 适钓评分（0-100，越高越适合出钓） */
  score: number
  /** 结论文案（如「适合出钓」） */
  verdict: string
  /** 鱼情等级：explode 爆户 / hot 连杆 / fair 有口 / slow 慢口 / stop 停口 */
  level: string
  /** 天气状况描述，可为 null */
  condition: string | null
  /** 气温（℃，可为小数），可为 null */
  temp: number | null
  /** 气压（hPa），可为 null */
  pressure: number | null
  /** 风力/风差描述文本，可为 null */
  windDiff: string | null
  /** 数据来源（如 AI 生成 / 缓存命中） */
  source: string
  /** 本次查询消耗（积分等）展示文本 */
  cost: string
}

/**
 * 钓点（后台「钓点管理」）
 */
export interface Spot {
  /** 钓点 ID */
  id: string
  /** 钓点名称 */
  name: string
  /** 所在城市，未知为 null */
  city: string | null
  /** 综合评分（0-5） */
  rating: number
  /** 评论数量 */
  commentCount: number
  /** 常见鱼种名称列表 */
  fish: string[]
  /** 收费方式文本（如「免费」「50 元/天」），可为 null */
  pay: string | null
  /** 经纬度坐标文本（"lng,lat"），可为 null */
  coords: string | null
  /** 状态：normal 正常 / disabled 停用 */
  status: string
  /** 封面图 URL，无图为 null */
  cover: string | null
  /** 图集 URL 列表 */
  gallery: string[]
  /** 详细地址，可为 null */
  address?: string | null
  /** 水域类型（如「野水域」「黑坑」），可为 null */
  water?: string | null
  /** 水底地形，可为 null */
  bottom?: string | null
  /** 人流情况，可为 null */
  crowd?: string | null
  /** 钓点说明，可为 null */
  note?: string | null
  /** 数据来源：ai AI 生成 / admin 后台维护 / ugc 用户投稿 */
  source?: string
  /** 核实等级：unverified / user_verified / verified */
  verifiedLevel?: string
  /** 最近核实时间，可为空串 */
  lastVerifiedAt?: string
  /** 下架原因，可为 null */
  offlineReason?: string | null
  /** 添加人（管理员或用户昵称） */
  addedBy: string
  /** 创建时间（日期字符串） */
  createdAt: string
  /** 反馈「可以正常作钓」的人数 */
  fishYes: number
  /** 反馈「无法正常作钓」的人数 */
  fishNo: number
  /** 是否已因「无法作钓」人数达到阈值而不再对外展示 */
  fishHidden: boolean
}

/**
 * 钓点投稿（后台「钓点审核」列表项）
 */
export interface SpotSubmission {
  /** 投稿 ID */
  id: string
  /** 投稿类型：new_spot 新增 / update_spot 更新 */
  kind: string
  /** 审核状态：pending / reviewing / needs_info / approved / rejected / merged / withdrawn */
  status: string
  /** 钓点名称，可为 null */
  name: string | null
  /** 行政区文案，可为 null */
  region: string | null
  /** 坐标 "lng,lat"，可为 null */
  coord: string | null
  /** 详细地址，可为 null */
  address: string | null
  /** 水域类型，可为 null */
  water: string | null
  /** 鱼种名称列表 */
  fish: string[]
  /** 收费说明，可为 null */
  pay: string | null
  /** 投稿说明，可为 null */
  note: string | null
  /** 现场照片 URL 列表 */
  photos: string[]
  /** 封面图 URL，可为 null */
  cover: string | null
  /** 风险标记（duplicate_nearby / name_missing / note_short 等） */
  riskFlags: string[]
  /** 疑似重复的钓点/投稿 ID，可为 null */
  duplicateOf: string | null
  /** 审核备注，可为 null */
  reviewNote: string | null
  /** 审核通过后发布的钓点 ID，可为 null */
  publishedSpotId: string | null
  /** 提交时间 */
  createdAt: string
  /** 审核时间，未审核为空串 */
  reviewedAt: string
}

/** 投稿审核详情：在列表项基础上追加投稿人、统计与疑似重复钓点 */
export interface SpotSubmissionDetail extends SpotSubmission {
  /** 投稿用户信息，用户被删除时为 null */
  user: { id: number; nickname: string; uid: string } | null
  /** 该用户的投稿统计 */
  userStats: { total: number; approved: number }
  /** 坐标相近的已发布钓点 */
  duplicates: { id: string; name: string; coord: string | null; distanceKm: number }[]
}

/** 钓点纠错 / 举报（后台「纠错处理」列表项） */
export interface SpotReport {
  /** 纠错记录 ID */
  id: string
  /** 关联钓点 ID */
  spotId: string
  /** 问题类型：wrong_location / closed / dry / fee_changed / duplicate / prohibited / other */
  reportType: string
  /** 用户建议的新坐标 "lng,lat"，可为 null */
  proposedCoord: string | null
  /** 佐证照片 URL 列表 */
  photos: string[]
  /** 问题说明，可为 null */
  note: string | null
  /** 处理状态：pending / accepted / rejected */
  status: string
  /** 处理备注，可为 null */
  reviewNote: string | null
  /** 提交时间 */
  createdAt: string
  /** 处理时间，未处理为空串 */
  reviewedAt: string
}

/** 钓点坐标变更历史 */
export interface SpotCoordHistory {
  /** 记录 ID */
  id: number
  /** 变更前坐标，可为 null */
  oldCoord: string | null
  /** 变更后坐标，可为 null */
  newCoord: string | null
  /** 变更原因，可为 null */
  reason: string | null
  /** 来源：admin / report 等 */
  source: string | null
  /** 操作管理员 ID，可为 null */
  operatorId: number | null
  /** 变更时间 */
  createdAt: string
}

/** 钓点钓况反馈明细（后台「反馈」弹窗） */
export interface SpotFishabilityDetail {
  /** 「可以作钓」人数 */
  yes: number
  /** 「无法作钓」人数 */
  no: number
  /** 触发不再展示的阈值 */
  limit: number
  /** 是否已达阈值、不再对外展示 */
  hidden: boolean
  /** 反馈记录列表（按更新时间倒序） */
  list: {
    id: number
    userId: number
    /** 用户昵称，用户已注销时显示「已注销用户」 */
    user: string
    /** 业务用户号，可为空串 */
    uid: string
    /** 反馈结论：yes / no */
    verdict: string
    /** 首次反馈时间 */
    createdAt: string
    /** 最近一次修改时间 */
    updatedAt: string
  }[]
}

/** 坐标校正结果 */
export interface CoordUpdateResult {
  /** 钓点 ID */
  id: string
  /** 新坐标 */
  coord: string
  /** 旧坐标，可为 null */
  oldCoord: string | null
  /** 偏移距离（公里） */
  distanceKm: number
}

/** 钓点上下架结果 */
export interface SpotStatusResult {
  /** 钓点 ID */
  id: string
  /** 变更后的状态：online / offline */
  status: string
  /** 下架原因，恢复上架时为 null */
  offlineReason: string | null
}

/**
 * 数据看板总览（首页 KPI + 趋势 + 动态 + 最新订单）
 */
export interface Overview {
  /** 核心指标区 */
  kpi: {
    /** 用户总数 */
    users: number
    /** 天气查询总次数 */
    weather: number
    /** 会员总数 */
    members: number
    /** 累计营收（元） */
    revenue: number
    /** 今日新增用户数 */
    usersToday: number
    /** 昨日天气查询次数，用于环比 */
    weatherYesterday: number
    /** 昨日营收（元），用于环比 */
    revenueYesterday: number
    /** 会员占比指标（后端计算口径，直接展示） */
    memberRate: number
  }
  /** 近 N 日趋势数据 */
  trend: {
    /** 日期标签数组（如 11-01） */
    days: string[]
    /** 每日天气查询量，与 days 等长 */
    weather: number[]
    /** 每日新增用户数，与 days 等长 */
    users: number[]
    /** 每日营收（元），与 days 等长 */
    revenue: number[]
  }
  /** 最近动态列表 */
  activity: {
    /** 动态图标标识 */
    icon: string
    /** 动态描述文案 */
    text: string
    /** 相对时间文案（如「5 分钟前」） */
    time: string
  }[]
  /** 最新订单列表 */
  orders: {
    /** 订单号 */
    no: string
    /** 下单用户昵称 */
    user: string
    /** 商品名称 */
    goods: string
    /** 订单金额（元） */
    amount: number
    /** 使用积分数量 */
    usePoints: number
    /** 订单状态文本 */
    status: string
    /** 下单日期 */
    date: string
  }[]
}

/** 积分配置（后台「系统设置 · 积分配置」） */
export interface PointsConfig {
  /** 会员每日签到奖励积分 */
  checkinMemberPoints: number
  /** 普通用户每日签到奖励积分 */
  checkinNormalPoints: number
  /** 观看一次广告奖励积分 */
  adPoints: number
  /** 广告需完整观看的时长（秒） */
  adSeconds: number
  /** 普通用户每日广告奖励次数上限 */
  adLimitNormal: number
  /** 会员每日广告奖励次数上限 */
  adLimitMember: number
  /** 自定义评论敏感词（英文逗号分隔），留空表示使用内置词库 */
  sensitiveWords: string
  /** 配置项元数据（名称 / 说明 / 取值范围），供表单渲染 */
  defs: {
    /** 配置键名（与上方字段同名） */
    key: string
    /** 配置项说明文案 */
    remark: string
    /** 允许的最小值，null 表示不限制 */
    min: number | null
    /** 允许的最大值，null 表示不限制 */
    max: number | null
  }[]
}

/** 评论（后台「内容管理 · 评论管理」） */
export interface AdminComment {
  /** 评论 ID */
  id: string
  /** 评论用户 ID，用户被删除后可能为 null */
  userId: number | null
  /** 评论用户昵称 */
  user: string
  /** 用户头像 URL */
  avatar: string
  /** 关联钓点 ID */
  spotId: string
  /** 关联钓点名称 */
  spot: string
  /** 评分（1-5 星） */
  rating: number
  /** 评论正文 */
  text: string
  /** 评论图片 URL 列表 */
  images: string[]
  /** 评论日期（展示用） */
  date: string
  /** 创建时间（含时分秒） */
  createdAt: string
}

/** 操作日志（后台「系统设置 · 操作日志」） */
export interface OperationLogItem {
  /** 日志 ID */
  id: number
  /** 操作管理员 ID，系统自动操作时为 null */
  adminId: number | null
  /** 操作管理员名称 */
  admin: string
  /** 操作动作类型（如「新增」「删除」） */
  action: string
  /** 操作对象描述，可为 null */
  target: string | null
  /** 操作详情，可为 null */
  detail: string | null
  /** 操作来源 IP，可为 null */
  ip: string | null
  /** 操作时间（含时分秒） */
  createdAt: string
}

/** 会员套餐购买数据统计 */
export interface MembershipStats {
  /** 累计订单数 */
  totalOrders: number
  /** 累计成交金额（元） */
  totalAmount: number
  /** 按套餐聚合的销售数据 */
  byPlan: {
    /** 套餐标识（month/season/year） */
    plan: string
    /** 套餐名称 */
    name: string
    /** 购买笔数 */
    count: number
    /** 成交金额（元） */
    amount: number
    /** 销售份数 */
    sales: number
  }[]
  /** 近 N 日趋势 */
  trend: {
    /** 日期标签数组 */
    days: string[]
    /** 每日订单数，与 days 等长 */
    counts: number[]
    /** 每日金额（元），与 days 等长 */
    amounts: number[]
  }
  /** 最近购买记录 */
  recent: {
    /** 订单号 */
    orderNo: string
    /** 购买用户昵称 */
    user: string
    /** 套餐标识 */
    plan: string
    /** 购买月数 */
    months: number
    /** 支付金额（元） */
    amount: number
    /** 订单状态文本 */
    status: string
    /** 购买日期 */
    date: string
  }[]
}

/** 天气缓存条目（后台「系统设置 · 缓存管理」） */
export interface CacheItem {
  /** 缓存类型标识，固定为 weather */
  type: 'weather'
  /** 缓存记录 ID（数字主键） */
  id: number
  /** 缓存键 */
  cacheKey: string
  /** 缓存对应地区名称 */
  region: string
  /** 缓存对应日期（YYYY-MM-DD） */
  day: string
  /** 数据来源（如 ai / cache） */
  source: string
  /** 创建时间，可为 null */
  createdAt: string | null
  /** 过期时间，可为 null（永不过期或未知） */
  expireAt: string | null
  /** 最近命中时间，可为 null（从未命中） */
  lastHitAt: string | null
  /** 占用空间（字节） */
  sizeBytes: number
  /** 占用空间（KB，后端换算值） */
  sizeKb: number
  /** 累计命中次数 */
  hitCount: number
  /** 缓存状态：active 有效 / expired 已过期 */
  status: 'active' | 'expired'
  /** 天气状况描述，可为 null */
  condition: string | null
  /** 气温（℃），可为 null */
  temp: number | null
}

/** 鱼情分析缓存条目 */
export interface FishCacheItem {
  /** 缓存类型标识，固定为 fish */
  type: 'fish'
  /** 缓存记录 ID（数字主键） */
  id: number
  /** 缓存键 */
  cacheKey: string
  /** 缓存对应地区名称 */
  region: string
  /** 缓存对应日期，可为 null（跨天共享缓存） */
  day: string | null
  /** 生成该缓存时的查询参数键值对 */
  params: Record<string, string>
  /** 数据来源（如 ai / cache） */
  source: string
  /** 创建时间，可为 null */
  createdAt: string | null
  /** 过期时间，可为 null */
  expireAt: string | null
  /** 最近命中时间，可为 null */
  lastHitAt: string | null
  /** 占用空间（字节） */
  sizeBytes: number
  /** 占用空间（KB） */
  sizeKb: number
  /** 累计命中次数 */
  hitCount: number
  /** 缓存状态：active 有效 / expired 已过期 */
  status: 'active' | 'expired'
  /** 鱼情评分（0-100），可为 null */
  score: number | null
  /** 结论文案，可为 null */
  verdict: string | null
  /** 鱼情等级（explode/hot/fair/slow/stop），可为 null */
  level: string | null
  /** 是否由 AI 生成 */
  aiGenerated: boolean
}

/** 缓存统计看板 */
export interface CacheStats {
  /** 缓存总条数 */
  totalCount: number
  /** 天气缓存条数 */
  weatherCount: number
  /** 鱼情缓存条数 */
  fishCount: number
  /** 总占用空间（字节） */
  totalSizeBytes: number
  /** 总占用空间（KB） */
  totalSizeKb: number
  /** 今日命中率（百分比数值） */
  todayHitRate: number
  /** 即将过期条数 */
  expiringSoon: number
  /** 近 N 日趋势 */
  trend: {
    /** 日期标签数组 */
    days: string[]
    /** 每日命中次数，与 days 等长 */
    hits: number[]
    /** 每日缓存总量，与 days 等长 */
    totals: number[]
  }
}

/** 缓存有效期规则（天气 / 鱼情，单位秒，默认 3 小时） */
export interface CacheRules {
  /** 天气缓存有效期（秒），默认 10800 */
  weather: number
  /** 鱼情缓存有效期（秒），默认 10800 */
  fish: number
}

/** 缓存列表查询参数 */
export interface CacheQuery {
  /** 关键词（匹配缓存键 / 地区） */
  keyword?: string
  /** 状态筛选：active / expired */
  status?: string
  /** 来源筛选 */
  source?: string
  /** 创建起始日期（YYYY-MM-DD） */
  startDate?: string
  /** 创建结束日期（YYYY-MM-DD） */
  endDate?: string
  /** 页码，从 1 开始 */
  page: number
  /** 每页条数 */
  pageSize: number
}

/** 订单（后台「运营管理 · 订单管理」） */
export interface AdminOrder {
  /** 订单号（业务主键，参与 URL 时需 encodeURIComponent） */
  no: string
  /** 下单用户数字 ID */
  userId: number
  /** 下单用户业务标识 */
  uid: string
  /** 下单用户昵称 */
  user: string
  /** 用户头像 URL */
  userAvatar: string
  /** 用户手机号 */
  userPhone: string
  /** 商品 ID */
  goodsId: string
  /** 商品名称 */
  goods: string
  /** 商品图片 URL，可为 null */
  goodsImg: string | null
  /** 购买数量 */
  qty: number
  /** 商品总价（元，积分抵扣前） */
  total: number
  /** 使用积分数量 */
  usePoints: number
  /** 实付金额（元） */
  amount: number
  /** 支付方式（如微信 / 积分） */
  payMethod: string
  /** 支付状态：未支付 / 已支付 / 已退款 / 已关闭 */
  payStatus: string
  /** 订单状态：待支付 / 待发货 / 已发货 / 已完成 / 已关闭 / 退款中 / 部分退款 / 已退款 */
  status: string
  /** 配送方式（如快递 / 自提） */
  deliveryType: string
  /** 收货人姓名 */
  receiver: string
  /** 收货人电话 */
  receiverPhone: string
  /** 收货详细地址 */
  address: string
  /** 物流公司名称，未发货为空串 */
  logisticsCompany: string
  /** 物流单号，未发货为空串 */
  logisticsNo: string
  /** 退款金额（元），无退款为 0 */
  refundAmount: number
  /** 退款状态文本 */
  refundStatus: string
  /** 退款原因 */
  refundReason: string
  /** 是否标记为异常订单 */
  abnormal: boolean
  /** 商家备注 */
  remark: string
  /** 下单时间 */
  createdAt: string
  /** 支付时间，未支付为空串 */
  paidAt: string
  /** 发货时间，未发货为空串 */
  shippedAt: string
  /** 完成时间，未完成为空串 */
  completedAt: string
  /** 关闭时间，未关闭为空串 */
  closedAt: string
}

/** 订单操作日志条目（详情页时间线） */
export interface OrderLogItem {
  /** 操作动作名称 */
  action: string
  /** 操作人（管理员或系统） */
  operator: string
  /** 操作详情描述 */
  detail: string
  /** 操作时间 */
  createdAt: string
}

/**
 * 订单详情（在订单主体基础上追加商品快照、用户信息与操作日志）
 */
export interface AdminOrderDetail extends AdminOrder {
  /** 下单时的商品快照 */
  goodsDetail: {
    /** 商品 ID */
    id: string
    /** 商品名称 */
    name: string
    /** 商品分类 */
    cat: string
    /** 商品图片 URL，可为 null */
    img: string | null
    /** 规格描述 */
    spec: string
    /** 下单时单价（元） */
    price: number
    /** 购买数量 */
    qty: number
    /** 小计金额（元） */
    subtotal: number
  }
  /** 下单用户概要 */
  userInfo: {
    /** 用户业务标识 */
    uid: string
    /** 用户昵称 */
    nickname: string
    /** 手机号 */
    phone: string
    /** 所在城市 */
    city: string
    /** 是否为会员 */
    isMember: boolean
  }
  /** 订单操作日志（按时间正序） */
  logs: OrderLogItem[]
}

/** 订单筛选条件（列表 / 导出共用） */
export interface OrderQuery {
  /** 订单号 / 商品关键词 */
  keyword?: string
  /** 用户关键词（昵称 / 手机号） */
  userKeyword?: string
  /** 下单起始日期（YYYY-MM-DD） */
  startDate?: string
  /** 下单结束日期（YYYY-MM-DD） */
  endDate?: string
  /** 支付方式筛选 */
  payMethod?: string
  /** 订单状态筛选 */
  status?: string
  /** 配送方式筛选 */
  deliveryType?: string
  /** 快捷筛选标识（如 today 今日 / pending 待处理） */
  quick?: string
  /** 页码，从 1 开始；缺省由后端决定 */
  page?: number
  /** 每页条数，缺省由后端决定 */
  pageSize?: number
}

/** 订单统计概览 */
export interface OrderStats {
  /** 今日订单数 */
  todayOrders: number
  /** 今日成交金额（元） */
  todayAmount: number
  /** 待处理订单数 */
  pendingCount: number
  /** 累计订单数 */
  totalOrders: number
  /** 各待办状态计数 */
  counts: {
    /** 待支付数 */
    unpaid: number
    /** 待发货数 */
    unshipped: number
    /** 退款中数 */
    refunding: number
    /** 异常订单数 */
    abnormal: number
  }
  /** 近 N 日趋势 */
  trend: {
    /** 日期标签数组 */
    days: string[]
    /** 每日订单数，与 days 等长 */
    counts: number[]
    /** 每日金额（元），与 days 等长 */
    amounts: number[]
  }
}


// ---------- 请求封装（拦截器已解包 {code,data,msg}） ----------
/**
 * GET 请求
 * @param {string} url 相对路径（以 / 开头，实际请求 /api + url）
 * @param {Record<string, unknown>} [params] 查询参数对象
 * @returns {Promise<T>} 已解包的业务数据
 */
const get = <T>(url: string, params?: Record<string, unknown>) =>
  http.get(url, { params }) as unknown as Promise<T>
/**
 * POST 请求
 * @param {string} url 相对路径
 * @param {unknown} [data] 请求体（对象或 FormData）
 * @returns {Promise<T>} 已解包的业务数据
 */
const post = <T>(url: string, data?: unknown) => http.post(url, data) as unknown as Promise<T>
/**
 * PUT 请求
 * @param {string} url 相对路径
 * @param {unknown} [data] 请求体
 * @returns {Promise<T>} 已解包的业务数据
 */
const put = <T>(url: string, data?: unknown) => http.put(url, data) as unknown as Promise<T>
/**
 * DELETE 请求
 * @param {string} url 相对路径
 * @returns {Promise<T>} 已解包的业务数据
 */
const del = <T>(url: string) => http.delete(url) as unknown as Promise<T>

// ---------- 接口 ----------
/**
 * 管理后台接口集合
 * 约定：返回 Promise<业务数据>（已解包），失败时抛出 Error 且拦截器已弹出错误提示；
 *      除 login 外均需管理员 Token，由 http 请求拦截器自动附加。
 */
export const api = {
  /**
   * 管理员登录（POST /admin/login，无需鉴权）
   * @param {string} username 登录账号
   * @param {string} password 登录密码
   * @returns {Promise<{token: string; admin: AdminInfo}>} 令牌与管理员信息
   */
  login: (username: string, password: string) =>
    post<{ token: string; admin: AdminInfo }>('/admin/login', { username, password }),
  /**
   * 退出登录（POST /admin/logout），使服务端令牌失效
   * @returns {Promise<null>}
   */
  logout: () => post<null>('/admin/logout'),
  /**
   * 数据看板总览（GET /admin/overview）
   * @returns {Promise<Overview>} KPI、趋势、动态与最新订单
   */
  overview: () => get<Overview>('/admin/overview'),

  /**
   * 用户分页列表（GET /admin/users）
   * @param {{keyword?: string; plan?: string; status?: string; page: number; pageSize: number}} params 关键词/套餐/状态与分页
   * @returns {Promise<Page<AdminUser>>} 分页用户数据
   */
  users: (params: { keyword?: string; plan?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<AdminUser>>('/admin/users', params),
  /**
   * 新增用户（POST /admin/users）
   * @param {{nickname: string; phone?: string; city?: string; status: string}} data 昵称、手机号、城市与状态
   * @returns {Promise<AdminUser>} 新建后的用户
   */
  createUser: (data: { nickname: string; phone?: string; city?: string; status: string }) =>
    post<AdminUser>('/admin/users', data),
  /**
   * 更新用户（PUT /admin/users/{uid}）
   * @param {string} uid 用户业务标识
   * @param {Record<string, unknown>} data 需要更新的字段
   * @returns {Promise<AdminUser>} 更新后的用户
   */
  updateUser: (uid: string, data: Record<string, unknown>) => put<AdminUser>(`/admin/users/${uid}`, data),
  /**
   * 分配会员套餐（PUT /admin/users/{uid}/membership）
   * @param {string} uid 用户业务标识
   * @param {{planId: string; durationDays: number}} data 套餐 ID 与开通天数
   * @returns {Promise<AdminUser>} 更新后的用户
   */
  assignMembership: (uid: string, data: { planId: string; durationDays: number }) =>
    put<AdminUser>(`/admin/users/${uid}/membership`, data),
  /**
   * 删除单个用户（DELETE /admin/users/{uid}）
   * @param {string} uid 用户业务标识
   * @returns {Promise<null>}
   */
  deleteUser: (uid: string) => del<null>(`/admin/users/${uid}`),
  /**
   * 批量删除用户（POST /admin/users/batch-delete）
   * @param {string[]} ids 用户业务标识数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteUsers: (ids: string[]) => post<{ deleted: number }>('/admin/users/batch-delete', { ids }),

  /**
   * 会员套餐列表（GET /admin/plans）
   * @returns {Promise<Plan[]>} 全部套餐
   */
  plans: () => get<Plan[]>('/admin/plans'),
  /**
   * 新增套餐（POST /admin/plans）
   * @param {Record<string, unknown>} data 套餐字段
   * @returns {Promise<Plan>} 新建后的套餐
   */
  createPlan: (data: Record<string, unknown>) => post<Plan>('/admin/plans', data),
  /**
   * 更新套餐（PUT /admin/plans/{id}）
   * @param {string} id 套餐 ID
   * @param {Record<string, unknown>} data 需要更新的字段
   * @returns {Promise<Plan>} 更新后的套餐
   */
  updatePlan: (id: string, data: Record<string, unknown>) => put<Plan>(`/admin/plans/${id}`, data),
  /**
   * 删除套餐（DELETE /admin/plans/{id}）
   * @param {string} id 套餐 ID
   * @returns {Promise<null>}
   */
  deletePlan: (id: string) => del<null>(`/admin/plans/${id}`),
  /**
   * 批量删除套餐（POST /admin/plans/batch-delete）
   * @param {string[]} ids 套餐 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeletePlans: (ids: string[]) => post<{ deleted: number }>('/admin/plans/batch-delete', { ids }),

  /**
   * 商品分页列表（GET /admin/goods）
   * @param {{keyword?: string; cat?: string; status?: string; page: number; pageSize: number}} params 关键词/分类/状态与分页
   * @returns {Promise<Page<Goods>>} 分页商品数据
   */
  goods: (params: { keyword?: string; cat?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<Goods>>('/admin/goods', params),
  /**
   * 新增商品（POST /admin/goods）
   * @param {Record<string, unknown>} data 商品字段
   * @returns {Promise<Goods>} 新建后的商品
   */
  createGoods: (data: Record<string, unknown>) => post<Goods>('/admin/goods', data),
  /**
   * 更新商品（PUT /admin/goods/{id}）
   * @param {string} id 商品 ID
   * @param {Record<string, unknown>} data 需要更新的字段
   * @returns {Promise<Goods>} 更新后的商品
   */
  updateGoods: (id: string, data: Record<string, unknown>) => put<Goods>(`/admin/goods/${id}`, data),
  /**
   * 删除商品（DELETE /admin/goods/{id}）
   * @param {string} id 商品 ID
   * @returns {Promise<null>}
   */
  deleteGoods: (id: string) => del<null>(`/admin/goods/${id}`),
  /**
   * 批量删除商品（POST /admin/goods/batch-delete）
   * @param {string[]} ids 商品 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteGoods: (ids: string[]) => post<{ deleted: number }>('/admin/goods/batch-delete', { ids }),

  /**
   * 天气查询日志分页列表（GET /admin/weather-logs）
   * @param {{keyword?: string; source?: string; page: number; pageSize: number}} params 关键词/来源与分页
   * @returns {Promise<Page<WeatherLog>>} 分页日志数据
   */
  weatherLogs: (params: { keyword?: string; source?: string; page: number; pageSize: number }) =>
    get<Page<WeatherLog>>('/admin/weather-logs', params),
  /**
   * 重新生成某条天气数据（POST /admin/weather-logs/{id}/regenerate）
   * @param {string} id 日志 ID
   * @returns {Promise<WeatherLog>} 重新生成后的记录
   */
  regenerateWeather: (id: string) => post<WeatherLog>(`/admin/weather-logs/${id}/regenerate`),
  /**
   * 删除天气日志（DELETE /admin/weather-logs/{id}）
   * @param {string} id 日志 ID
   * @returns {Promise<null>}
   */
  deleteWeatherLog: (id: string) => del<null>(`/admin/weather-logs/${id}`),
  /**
   * 批量删除天气日志（POST /admin/weather-logs/batch-delete）
   * @param {string[]} ids 日志 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteWeatherLogs: (ids: string[]) => post<{ deleted: number }>('/admin/weather-logs/batch-delete', { ids }),

  /**
   * 钓点分页列表（GET /admin/spots）
   * @param {{keyword?: string; status?: string; page: number; pageSize: number}} params 关键词/状态与分页
   * @returns {Promise<Page<Spot>>} 分页钓点数据
   */
  spots: (params: { keyword?: string; status?: string; page: number; pageSize: number }) =>
    get<Page<Spot>>('/admin/spots', params),
  /**
   * 新增钓点（POST /admin/spots）
   * @param {Record<string, unknown>} data 钓点字段
   * @returns {Promise<Spot>} 新建后的钓点
   */
  createSpot: (data: Record<string, unknown>) => post<Spot>('/admin/spots', data),
  /**
   * 更新钓点（PUT /admin/spots/{id}）
   * @param {string} id 钓点 ID
   * @param {Record<string, unknown>} data 需要更新的字段
   * @returns {Promise<Spot>} 更新后的钓点
   */
  updateSpot: (id: string, data: Record<string, unknown>) => put<Spot>(`/admin/spots/${id}`, data),
  /**
   * 删除钓点（DELETE /admin/spots/{id}）
   * @param {string} id 钓点 ID
   * @returns {Promise<null>}
   */
  deleteSpot: (id: string) => del<null>(`/admin/spots/${id}`),
  /**
   * 批量删除钓点（POST /admin/spots/batch-delete）
   * @param {string[]} ids 钓点 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteSpots: (ids: string[]) => post<{ deleted: number }>('/admin/spots/batch-delete', { ids }),
  /**
   * 人工校正钓点坐标（POST /admin/spots/{id}/coord）
   * @param {string} id 钓点 ID
   * @param {{coords: string; reason: string}} data 新坐标 "lng,lat" 与变更原因
   * @returns {Promise<CoordUpdateResult>} 校正后的坐标与偏移距离
   */
  updateSpotCoord: (id: string, data: { coords: string; reason: string }) =>
    post<CoordUpdateResult>(`/admin/spots/${id}/coord`, data),
  /**
   * 钓点坐标变更历史（GET /admin/spots/{id}/history）
   * @param {string} id 钓点 ID
   * @returns {Promise<SpotCoordHistory[]>} 按时间倒序的历史记录
   */
  spotHistory: (id: string) => get<SpotCoordHistory[]>(`/admin/spots/${id}/history`),
  /**
   * 钓点钓况反馈明细（GET /admin/spots/{id}/fishability）
   * @param {string} id 钓点 ID
   * @returns {Promise<SpotFishabilityDetail>} 反馈统计与逐条记录
   */
  spotFishability: (id: string) => get<SpotFishabilityDetail>(`/admin/spots/${id}/fishability`),
  /**
   * 切换钓点上下架（POST /admin/spots/{id}/status）
   * @param {string} id 钓点 ID
   * @param {string} [reason] 下架原因，恢复上架时可省略
   * @returns {Promise<SpotStatusResult>} 变更后的状态与下架原因
   */
  toggleSpotStatus: (id: string, reason?: string) =>
    post<SpotStatusResult>(`/admin/spots/${id}/status`, { reason }),

  // ---------- 钓点审核 · 用户投稿 ----------
  /**
   * 投稿审核分页列表（GET /admin/spot-submissions）
   * @param {{status?: string; city?: string; keyword?: string; page: number; pageSize: number}} params 状态/城市/关键词与分页
   * @returns {Promise<Page<SpotSubmission>>} 分页投稿数据
   */
  spotSubmissions: (params: {
    status?: string
    city?: string
    keyword?: string
    page: number
    pageSize: number
  }) => get<Page<SpotSubmission>>('/admin/spot-submissions', params),
  /**
   * 投稿审核详情（GET /admin/spot-submissions/{id}）
   * @param {string} id 投稿 ID
   * @returns {Promise<SpotSubmissionDetail>} 投稿详情、投稿人统计与疑似重复钓点
   */
  spotSubmission: (id: string) => get<SpotSubmissionDetail>(`/admin/spot-submissions/${id}`),
  /**
   * 审核通过并发布钓点（POST /admin/spot-submissions/{id}/approve）
   * @param {string} id 投稿 ID
   * @param {string} [note] 审核备注
   * @returns {Promise<{submission: SpotSubmission; spotId: string}>} 投稿状态与新钓点 ID
   */
  approveSubmission: (id: string, note?: string) =>
    post<{ submission: SpotSubmission; spotId: string }>(`/admin/spot-submissions/${id}/approve`, { note }),
  /**
   * 驳回投稿（POST /admin/spot-submissions/{id}/reject）
   * @param {string} id 投稿 ID
   * @param {string} [note] 驳回原因
   * @returns {Promise<SpotSubmission>} 更新后的投稿
   */
  rejectSubmission: (id: string, note?: string) =>
    post<SpotSubmission>(`/admin/spot-submissions/${id}/reject`, { note }),
  /**
   * 要求补充材料（POST /admin/spot-submissions/{id}/request-info）
   * @param {string} id 投稿 ID
   * @param {string} [note] 补充说明
   * @returns {Promise<SpotSubmission>} 更新后的投稿
   */
  requestSubmissionInfo: (id: string, note?: string) =>
    post<SpotSubmission>(`/admin/spot-submissions/${id}/request-info`, { note }),
  /**
   * 合并投稿到已有钓点（POST /admin/spot-submissions/{id}/merge）
   * @param {string} id 投稿 ID
   * @param {{spotId: string; note?: string}} data 目标钓点 ID 与备注
   * @returns {Promise<SpotSubmission>} 更新后的投稿（状态 merged）
   */
  mergeSubmission: (id: string, data: { spotId: string; note?: string }) =>
    post<SpotSubmission>(`/admin/spot-submissions/${id}/merge`, { spot_id: data.spotId, note: data.note }),

  // ---------- 钓点审核 · 纠错处理 ----------
  /**
   * 纠错/举报分页列表（GET /admin/spot-reports）
   * @param {{status?: string; page: number; pageSize: number}} params 状态与分页
   * @returns {Promise<Page<SpotReport>>} 分页纠错数据
   */
  spotReports: (params: { status?: string; page: number; pageSize: number }) =>
    get<Page<SpotReport>>('/admin/spot-reports', params),
  /**
   * 处理纠错/举报（POST /admin/spot-reports/{id}/resolve）
   * @param {string} id 纠错记录 ID
   * @param {{accept: boolean; offline: boolean; note?: string}} data 是否接受、是否下架与备注
   * @returns {Promise<SpotReport>} 处理后的纠错记录
   */
  resolveReport: (id: string, data: { accept: boolean; offline: boolean; note?: string }) =>
    post<SpotReport>(`/admin/spot-reports/${id}/resolve`, data),

  /**
   * 上传文件（POST /admin/upload，multipart/form-data）
   * @param {File} file 待上传文件
   * @returns {Promise<{url: string}>} 可访问的资源地址
   */
  upload: (file: File) => {
    const form = new FormData()
    form.append('file', file)
    return post<{ url: string }>('/admin/upload', form)
  },

  // ---------- 系统设置 · 积分配置 ----------
  /**
   * 读取积分配置（GET /admin/config）
   * @returns {Promise<PointsConfig>} 配置值及表单元数据
   */
  config: () => get<PointsConfig>('/admin/config'),
  /**
   * 更新积分配置（PUT /admin/config）
   * @param {Record<string, unknown>} data 待更新配置字段
   * @returns {Promise<PointsConfig>} 更新后的完整配置
   */
  updateConfig: (data: Record<string, unknown>) => put<PointsConfig>('/admin/config', data),

  // ---------- 内容管理 · 评论管理 ----------
  /**
   * 评论分页列表（GET /admin/comments）
   * @param {{keyword?: string; spotId?: string; page: number; pageSize: number}} params 关键词/钓点与分页
   * @returns {Promise<Page<AdminComment>>} 分页评论数据
   */
  comments: (params: { keyword?: string; spotId?: string; page: number; pageSize: number }) =>
    get<Page<AdminComment>>('/admin/comments', params),
  /**
   * 删除评论（DELETE /admin/comments/{id}）
   * @param {string} id 评论 ID
   * @returns {Promise<null>}
   */
  deleteComment: (id: string) => del<null>(`/admin/comments/${id}`),
  /**
   * 批量删除评论（POST /admin/comments/batch-delete）
   * @param {string[]} ids 评论 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteComments: (ids: string[]) =>
    post<{ deleted: number }>('/admin/comments/batch-delete', { ids }),

  // ---------- 系统设置 · 操作日志 ----------
  /**
   * 操作日志分页列表（GET /admin/logs）
   * @param {{keyword?: string; action?: string; page: number; pageSize: number}} params 关键词/动作与分页
   * @returns {Promise<Page<OperationLogItem>>} 分页日志数据
   */
  logs: (params: { keyword?: string; action?: string; page: number; pageSize: number }) =>
    get<Page<OperationLogItem>>('/admin/logs', params),

  // ---------- 会员套餐 · 购买数据统计 ----------
  /**
   * 会员套餐购买统计（GET /admin/membership-stats）
   * @returns {Promise<MembershipStats>} 汇总、按套餐聚合、趋势与最近记录
   */
  membershipStats: () => get<MembershipStats>('/admin/membership-stats'),

  // ---------- 系统设置 · 缓存管理 ----------
  /**
   * 天气缓存分页列表（GET /admin/cache）
   * @param {CacheQuery} params 筛选与分页条件
   * @returns {Promise<Page<CacheItem>>} 分页缓存数据
   */
  cacheList: (params: CacheQuery) => get<Page<CacheItem>>('/admin/cache', { ...params }),
  /**
   * 天气缓存详情（GET /admin/cache/{id}）
   * @param {number} id 缓存记录 ID
   * @returns {Promise<{cache: CacheItem; payload: Record<string, unknown>}>} 元信息与原始报文
   */
  cacheDetail: (id: number) => get<{ cache: CacheItem; payload: Record<string, unknown> }>(`/admin/cache/${id}`),
  /**
   * 缓存统计看板（GET /admin/cache/stats）
   * @returns {Promise<CacheStats>} 数量、体积、命中率与趋势
   */
  cacheStats: () => get<CacheStats>('/admin/cache/stats'),
  /**
   * 读取缓存有效期规则（GET /admin/cache/rules）
   * @returns {Promise<CacheRules>} 天气/鱼情有效期（秒）
   */
  cacheRules: () => get<CacheRules>('/admin/cache/rules'),
  /**
   * 更新缓存有效期规则（PUT /admin/cache/rules）
   * @param {CacheRules} data 天气/鱼情有效期（秒）
   * @returns {Promise<CacheRules>} 更新后的规则
   */
  updateCacheRules: (data: CacheRules) => put<CacheRules>('/admin/cache/rules', data),
  /**
   * 刷新单条天气缓存（POST /admin/cache/{id}/refresh）
   * @param {number} id 缓存记录 ID
   * @returns {Promise<CacheItem>} 刷新后的缓存条目
   */
  refreshCache: (id: number) => post<CacheItem>(`/admin/cache/${id}/refresh`),
  /**
   * 批量刷新天气缓存（POST /admin/cache/batch-refresh）
   * @param {number[]} ids 缓存记录 ID 数组
   * @returns {Promise<{refreshed: number}>} 实际刷新条数
   */
  batchRefreshCache: (ids: number[]) => post<{ refreshed: number }>('/admin/cache/batch-refresh', { ids }),
  /**
   * 删除单条天气缓存（DELETE /admin/cache/{id}）
   * @param {number} id 缓存记录 ID
   * @returns {Promise<null>}
   */
  deleteCache: (id: number) => del<null>(`/admin/cache/${id}`),
  /**
   * 批量删除天气缓存（POST /admin/cache/batch-delete）
   * @param {number[]} ids 缓存记录 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteCache: (ids: number[]) => post<{ deleted: number }>('/admin/cache/batch-delete', { ids }),
  /**
   * 鱼情缓存分页列表（GET /admin/cache/fish）
   * @param {CacheQuery} params 筛选与分页条件
   * @returns {Promise<Page<FishCacheItem>>} 分页鱼情缓存数据
   */
  fishCacheList: (params: CacheQuery) => get<Page<FishCacheItem>>('/admin/cache/fish', { ...params }),
  /**
   * 鱼情缓存详情（GET /admin/cache/fish/{id}）
   * @param {number} id 缓存记录 ID
   * @returns {Promise<{cache: FishCacheItem; payload: Record<string, unknown>; params: Record<string, string>}>}
   *          元信息、原始报文与生成参数
   */
  fishCacheDetail: (id: number) =>
    get<{ cache: FishCacheItem; payload: Record<string, unknown>; params: Record<string, string> }>(
      `/admin/cache/fish/${id}`,
    ),
  /**
   * 删除单条鱼情缓存（DELETE /admin/cache/fish/{id}）
   * @param {number} id 缓存记录 ID
   * @returns {Promise<null>}
   */
  deleteFishCache: (id: number) => del<null>(`/admin/cache/fish/${id}`),
  /**
   * 批量删除鱼情缓存（POST /admin/cache/fish/batch-delete）
   * @param {number[]} ids 缓存记录 ID 数组
   * @returns {Promise<{deleted: number}>} 实际删除条数
   */
  batchDeleteFishCache: (ids: number[]) =>
    post<{ deleted: number }>('/admin/cache/fish/batch-delete', { ids }),

  // ---------- 运营管理 · 订单管理 ----------
  /**
   * 订单分页列表（GET /admin/orders）
   * @param {OrderQuery} params 筛选与分页条件
   * @returns {Promise<Page<AdminOrder>>} 分页订单数据
   */
  orders: (params: OrderQuery) => get<Page<AdminOrder>>('/admin/orders', { ...params }),
  /**
   * 订单统计概览（GET /admin/orders/stats）
   * @returns {Promise<OrderStats>} 今日/累计指标与趋势
   */
  orderStats: () => get<OrderStats>('/admin/orders/stats'),
  /**
   * 订单详情（GET /admin/orders/{no}）
   * @param {string} no 订单号（内部已 URL 编码）
   * @returns {Promise<AdminOrderDetail>} 订单主体 + 商品快照 + 用户信息 + 日志
   */
  orderDetail: (no: string) => get<AdminOrderDetail>(`/admin/orders/${encodeURIComponent(no)}`),
  /**
   * 关闭订单（POST /admin/orders/{no}/close）
   * @param {string} no 订单号
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  closeOrder: (no: string) => post<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/close`),
  /**
   * 订单发货（POST /admin/orders/{no}/ship）
   * @param {string} no 订单号
   * @param {{logisticsCompany: string; logisticsNo: string; deliveryType?: string}} data 物流公司与单号、可选配送方式
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  shipOrder: (no: string, data: { logisticsCompany: string; logisticsNo: string; deliveryType?: string }) =>
    post<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/ship`, data),
  /**
   * 修改收货地址（PUT /admin/orders/{no}/address）
   * @param {string} no 订单号
   * @param {{receiver: string; receiverPhone: string; address: string}} data 收货人、电话与地址
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  updateOrderAddress: (no: string, data: { receiver: string; receiverPhone: string; address: string }) =>
    put<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/address`, data),
  /**
   * 备注/异常标记（POST /admin/orders/{no}/remark）
   * @param {string} no 订单号
   * @param {{remark?: string; abnormal?: boolean}} data 备注内容与异常标记
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  remarkOrder: (no: string, data: { remark?: string; abnormal?: boolean }) =>
    post<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/remark`, data),
  /**
   * 订单退款（POST /admin/orders/{no}/refund）
   * @param {string} no 订单号
   * @param {{amount: number; reason?: string; approve: boolean}} data 退款金额、原因与是否通过
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  refundOrder: (no: string, data: { amount: number; reason?: string; approve: boolean }) =>
    post<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/refund`, data),
  /**
   * 完成订单（POST /admin/orders/{no}/complete）
   * @param {string} no 订单号
   * @returns {Promise<AdminOrder>} 更新后的订单
   */
  completeOrder: (no: string) => post<AdminOrder>(`/admin/orders/${encodeURIComponent(no)}/complete`),
  /**
   * 删除订单（DELETE /admin/orders/{no}）
   * @param {string} no 订单号
   * @returns {Promise<null>}
   */
  deleteOrder: (no: string) => del<null>(`/admin/orders/${encodeURIComponent(no)}`),
}