import type { Metadata } from 'next'
import { Space_Grotesk, Inter } from 'next/font/google'
import '../styles/globals.css'
import { CaptureHost } from '@/features/capture/capture-host'
import { AppMenu } from '@/components/app-menu'

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
    <html lang="zh-CN" className={`${display.variable} ${body.variable}`}>
      <body>
        <AppMenu />
        {children}
        <CaptureHost />
      </body>
    </html>
  )
}
