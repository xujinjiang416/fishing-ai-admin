/**
 * vite-env.d.ts — Vite 客户端类型声明入口
 *
 * 职责：引入 vite/client 类型，使 `import.meta.env`、静态资源导入（图片/样式）等具备类型提示。
 * 注意：该文件仅包含类型引用，编译后不产生任何运行时代码，不要在此添加业务类型。
 */
/// <reference types="vite/client" />