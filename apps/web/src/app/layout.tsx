import type { Metadata } from 'next'
import { Space_Grotesk, Inter, JetBrains_Mono } from 'next/font/google'
import '../styles/globals.css'
import { CaptureHost } from '@/features/capture/capture-host'
import { FileDropHandler } from '@/features/capture/file-drop-handler'
import { AppMenu } from '@/components/app-menu'
import { ThemeBoot } from '@/components/theme-boot'
import { ToastHost } from '@/components/toast'
import { I18nProvider } from '@/lib/i18n'
import { SearchShortcut } from '@/components/search-shortcut'
import { ErrorTrace } from '@/components/error-trace'
import { AIProviderSync } from '@/features/ai/ai-settings-provider'
import { SkipLink } from '@/components/skip-link'
import { RouteFocus } from '@/components/route-focus'

const display = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  display: 'swap',
})

const body = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

// 等宽自托管(v0.39.1):JetBrains Mono 是 Bauhaus UI 的骨架(时间戳/标签/
// DSL/mono-label),Windows 无此字体且回退到 Consolas 最违和。自托管保证跨平台
// 等宽一致。subsets: latin(等宽主要是拉丁/符号;代码块中文走 --font-content 回退)。
const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: "cy's Stift",
  description: '本地优先的灵感画布。你的灵感，在画布上生长。',
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