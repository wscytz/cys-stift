'use client'

/**
 * Theme application — Bauhaus light-only(2026-07-11 删 dark)。
 *
 * 历史曾支持 dark(spec §5.6),但自研 canvas 引擎不响应主题切换重渲染
 * (token 缓存清空靠 MutationObserver,与 adapter 的 RAF 重渲有时序竞态),
 * 导致暗色下箭头不可见 + 「有时候切不过去」。cy's Stift 是 Bauhaus 白底
 * 黑字经典,light 是主设计;dark 移除以聚焦 + 彻底消除渲染 bug。
 *
 * data-theme 恒 "light"。resolveTheme 保留签名但恒返 'light'(向后兼容
 * 旧 settings.theme='dark',无视它;tokens.css 的 dark 块也已删,即便
 * data-theme='dark' 也无 dark 样式)。layout inline script + ThemeBoot 恒设 light。
 */
import { useEffect } from 'react'
import type { ThemePreference } from './settings-store'

/** 恒 'light'(light-only)。pref 参数保留仅为签名兼容(旧调用方/设置无视)。 */
export function resolveTheme(_pref: ThemePreference): 'light' {
  return 'light'
}

function applyTheme(): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', 'light')
}

export function applyInitialTheme(): void {
  applyTheme()
}

/**
 * useThemeApplication — mount once near the root。light-only 下主题不再变化,
 * 仅确保首帧 data-theme="light" 落定(inline script 已先设,此处兜底防
 * Strict Mode 双效应/脚本未跑)。不再订阅 OS prefers-color-scheme。
 */
export function useThemeApplication(): void {
  useEffect(() => {
    applyTheme()
  }, [])
}
