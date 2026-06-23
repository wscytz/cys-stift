import { defineConfig } from 'vitest/config'

/**
 * 引擎测试在 jsdom 环境跑 —— 部分纯函数(self-built-render / colorOf)依赖 DOM
 * (getComputedStyle 读 CSS 变量 = 默认 domTokenResolver 行为),jsdom 提供该 API。
 * 与 apps/web/vitest.config.ts 的 environment 设置一致。
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
  },
})
