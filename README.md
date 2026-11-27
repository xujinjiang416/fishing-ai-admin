# 渔获 AI 管理后台

基于 Vue 3 + Vite + naive-ui 的管理后台，用于用户、商品、订单、钓点、退款、积分等运营管理。生产环境部署在 CloudBase 静态托管，通过 HTTPS 调用云托管上的 FastAPI 服务。

## 技术栈

- Vue 3、TypeScript、Vite
- naive-ui、Pinia、Vue Router（hash 模式）
- Axios（统一响应解包与 401 处理）
- ECharts、Leaflet

## 目录结构

```text
fishing-ai-admin/
├─ src/
│  ├─ api/         # Axios 实例与后台接口封装
│  ├─ components/  # 通用组件
│  ├─ layouts/     # 后台布局
│  ├─ router/      # 路由（hash）
│  ├─ stores/      # Pinia 状态
│  ├─ views/       # 业务页面
│  └─ main.ts
├─ vite.config.ts
├─ package.json
└─ index.html
```

## 环境要求

- Node.js 18+（建议 20 LTS）
- npm
- 本地开发默认使用开发测试环境云托管，无需启动本地 API；如需联调本地后端，修改 `vite.config.ts` 的 `API_TARGET`

## 多环境配置

管理后台按 Vite 构建模式自动选择环境，配置集中在 `src/config/env.ts`：

| 命令 | Vite MODE | 使用环境 | 说明 |
| --- | --- | --- | --- |
| `npm run dev` | `development` | 开发测试环境 | 本地开发，直连当前云托管 |
| `npm run build:test` | `development` | 开发测试环境 | 构建开发/体验版后台，部署到测试静态托管 |
| `npm run build` | `production` | 生产环境 | 构建正式版后台；生产 API 地址当前留空 |

- 生产环境 API 地址在 `src/config/env.ts` 的 `ENVIRONMENTS.production.apiBase` 中预留为空，购买生产云服务后填入并重新构建即可，业务代码无需改动。
- 生产地址为空时构建不会报错；运行时会由请求拦截器明确提示「生产环境尚未配置 API 地址」，不会静默请求错误的地址。
- 所有接口（含导出等原生 `fetch`）统一通过 `src/config/env.ts` 的 `apiUrl()` 拼接地址，新增接口不需要再关心环境。

## 本地开发

```powershell
cd <项目根目录>\fishing-ai-admin
npm ci
npm run dev
```

打开 `http://127.0.0.1:5190`。

开发环境直接使用 `src/config/env.ts` 中的云托管绝对地址，`vite.config.ts` 的 `/api`、`/static` 代理仅作为同源请求的兜底，因此本地不启动 FastAPI 也能直接使用云服务数据。若需要联调本地后端，把 `vite.config.ts` 的 `API_TARGET` 改为 `http://127.0.0.1:8000`。

登录账号由后端首次 seed 创建（`ADMIN_USERNAME` / `ADMIN_PASSWORD`），不是前端硬编码；上线前请修改默认密码。

## 构建

构建开发测试环境后台（当前云服务）：

```powershell
npm run build:test
```

构建生产环境后台（生产地址填写后使用）：

```powershell
npm run build
```

构建产物在 `dist/`。

注意：

- 环境由构建模式自动决定，不需要设置 `VITE_API_BASE`。
- 生产 API 地址必须包含 `/api` 后缀，填写位置为 `src/config/env.ts`。
- 地址在构建时写入产物，修改后需要重新构建。
- 路由为 hash 模式（`/#/login`），静态托管刷新任意页面不会 404。

## 部署到 CloudBase 静态托管

前置：安装 CloudBase CLI 并登录有该环境权限的账号。

```powershell
npm install -g @cloudbase/cli
tcb login

cd <项目根目录>\fishing-ai-admin
npm run build:test
tcb hosting deploy .\dist -e <环境ID> --verify
```

> 当前仅有开发测试环境，部署测试后台使用 `npm run build:test`；生产环境购买后改用 `npm run build` 并部署到生产静态托管。

部署后访问静态托管默认域名即可。静态托管默认缓存 `max-age=300`，发布后如仍看到旧页面，可加版本参数访问或等待缓存刷新。

## 接口与鉴权

- 所有请求经 `src/api/http.ts` 的 Axios 实例发出。
- 请求拦截器自动附加 `Authorization: Bearer <token>`。
- 响应统一为 `{ code, data, msg }`，`code === 0` 表示成功。
- 401 时清理本地登录态并跳转 `#/login`。

## 注意事项

- 不要把 `CLOUDBASE_API_KEY` 或任何服务端密钥写入前端代码，前端只持有管理员登录 token。
- 商品/钓点图片上传后由后端写入公开云存储并返回长期地址；退款凭证走私有存储，后台展示时由接口返回签名 URL。
- 生产环境建议把后端 CORS 收敛到静态托管域名。
- 不要提交 `node_modules/`、`dist/`、`.env*`。
