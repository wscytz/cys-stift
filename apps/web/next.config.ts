import type { NextConfig } from 'next'

const config: NextConfig = {
  // Static export — see spec §3.4 / §6.12.
  // Renders every route to plain HTML at build time, no Node server required.
  // Required because Tauri desktop packages this output and serves it via the
  // system webview.
  output: 'export',
  // Static export can't optimize images at request time — they're already baked.
  images: { unoptimized: true },
  // Keep trailing slash on for friendlier static hosting / file:// usage.
  trailingSlash: true,
  reactStrictMode: true,
}

export default config
