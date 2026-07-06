import type { Metadata, Viewport } from 'next'
import localFont from 'next/font/local'
import '../styles/globals.css'
// katex CSS(数学公式):走 bundle 进静态产物(本地优先,不走 CDN)。放根布局全局
// 生效 —— MarkdownBody 渲染数学时依赖它(放 markdown.tsx 会进单测 import 图,
// vite 在 test 环境解析 CSS 里的字体 url 会失败)。
import 'katex/dist/katex.min.css'
import { CaptureHost } from '@/features/capture/capture-host'
import { FileDropHandler } from '@/features/capture/file-drop-handler'
import { AppMenu } from '@/components/app-menu'
import { ThemeBoot } from '@/components/theme-boot'
import { ToastHost } from '@/components/toast'
import { I18nProvider } from '@/lib/i18n'
import { SearchShortcut } from '@/components/search-shortcut'
import { ErrorTrace } from '@/components/error-trace'
import { AIProviderSync } from '@/features/ai/ai-settings-provider'
import { ArchiveReleaseGate } from '@/features/archive/archive-release-gate'
import { SkipLink } from '@/components/skip-link'
import { RouteFocus } from '@/components/route-focus'

// 字体自托管(2026-07-06):next/font/google 在 build 时拉 fonts.googleapis.com,
// 网络不稳(梯子/CDN)即 build 失败。cy's Stift 本地优先,不该 build 时依赖 CDN。
// 三字体 variable ttf 落 apps/web/public/fonts/,走 next/font/local —— build 不
// 联网,产物字体内联进静态包,跨平台一致 + 离线可 build。
const display = localFont({
  src: '../../public/fonts/SpaceGrotesk.ttf',
  variable: '--font-space-grotesk',
  display: 'swap',
})

const body = localFont({
  src: '../../public/fonts/Inter.ttf',
  variable: '--font-inter',
  display: 'swap',
})

// 等宽自托管:JetBrains Mono 是 Bauhaus UI 的骨架(时间戳/标签/DSL/mono-label),
// Windows 无此字体回退 Consolas 违和。variable ttf 本地,跨平台等宽一致。
const mono = localFont({
  src: '../../public/fonts/JetBrainsMono.ttf',
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "cy's Stift",
  description: '本地优先的灵感画布。你的灵感，在画布上生长。',
}

// viewport:device-width + initialScale 1。不禁 pinch(保 WCAG 1.4.4 文字缩放无障碍);
// 画布已设 touch-action:none(self-canvas/graph,防浏览器默认触摸抢 pinch;viewport 不禁 pinch 保 WCAG)。
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <head>
        {/*
         * Early-apply theme (spec §5.6, 2026-06-20). The inline script
         * runs synchronously before any page paints, so users with
         * dark-mode preference don't see a light-mode flash. Reads the
         * stored preference and resolves 'system' against the OS
         * media query, then writes data-theme on <html>.
         *
         * After hydration the <ThemeBoot> component takes over for
         * live OS-theme-change tracking (this script only runs once).
         */}
        <script
          // eslint-disable-next-line react/no-danger
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var raw=localStorage.getItem('cys-stift.settings.v1');var pref='system';if(raw){var p=JSON.parse(raw);if(p&&p.settings&&(p.settings.theme==='light'||p.settings.theme==='dark'||p.settings.theme==='system'))pref=p.settings.theme;}var resolved=pref==='dark'?'dark':pref==='light'?'light':(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');document.documentElement.setAttribute('data-theme',resolved);}catch(e){document.documentElement.setAttribute('data-theme','light');}})();`,
          }}
        />
      </head>
      <body>
        <ErrorTrace />
        <I18nProvider>
          <SkipLink />
          <RouteFocus />
          <AppMenu />
          {children}
          <AIProviderSync />
          <ArchiveReleaseGate />
          <ThemeBoot />
          <CaptureHost />
          <FileDropHandler />
          <ToastHost />
          <SearchShortcut />
        </I18nProvider>
      </body>
    </html>
  )
}