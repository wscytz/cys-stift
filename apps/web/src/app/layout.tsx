import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import '../styles/globals.css'
import { CaptureHost } from '@/features/capture/capture-host'
import { AppMenu } from '@/components/app-menu'
import { ThemeBoot } from '@/components/theme-boot'
import { I18nProvider } from '@/lib/i18n'
import { SearchShortcut } from '@/components/search-shortcut'

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

export const metadata: Metadata = {
  title: "cy's Stift",
  description: '本地优先的灵感画布。灵感 3 秒记，画布上慢慢养。',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning className={`${display.variable} ${body.variable}`}>
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
        <I18nProvider>
          <AppMenu />
          {children}
          <CaptureHost />
          <SearchShortcut />
        </I18nProvider>
      </body>
    </html>
  )
}