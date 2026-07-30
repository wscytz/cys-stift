import type { NextConfig } from 'next'

const config: NextConfig = {
  // Static export — see spec §3.4 / §6.12.
  // Renders every route to plain HTML at build time, no Node server required.
  // Required because Tauri desktop packages this output and serves it via the
  // system webview.
  output: 'export',
  // 部署在子路径时(网页测试版 wscytz.com/cys-stift/app/)设 WEB_DEPLOY_BASEPATH。
  // dev / Tauri 桌面不设 → 仍根路径(行为不变)。Next 自动给 <Link>/_next 资源加前缀。
  ...(process.env.WEB_DEPLOY_BASEPATH ? { basePath: process.env.WEB_DEPLOY_BASEPATH } : {}),
  // Static export can't optimize images at request time — they're already baked.
  images: { unoptimized: true },
  // Keep trailing slash on for friendlier static hosting / file:// usage.
  trailingSlash: true,
  reactStrictMode: true,
}

export default config
