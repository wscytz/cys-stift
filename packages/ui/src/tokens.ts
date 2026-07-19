/**
 * Bauhaus tokens — TypeScript mirror of tokens.css (spec §5.1).
 *
 * Two sources on purpose:
 *   1. tokens.css — the runtime values injected as CSS variables.
 *   2. tokens.ts — this file, used by Tailwind preset + component prop types.
 *
 * If you change one, change both. A grep for `var(--color-` in components will
 * tell you whether anything bypassed the token system.
 */

export const tokens = {
  color: {
    red: { DEFAULT: '#d40000', soft: '#ffe5e5' },
    yellow: { DEFAULT: '#ffce00', soft: '#fff8dc' },
    blue: { DEFAULT: '#003f7f', soft: '#e0ebf5' },
    black: { DEFAULT: '#0a0a0a', soft: '#2b2b2b' },
    white: { DEFAULT: '#fafafa', soft: '#ffffff' },
    gray: { DEFAULT: '#666666', soft: '#d9d9d9' },
    // canvas 是 surface 色(非 6 原色),不进色板;CSS 变量 --color-canvas 在 tokens.css 定义
  },
  font: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: 'Inter, system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '20px',
    xl: '24px',
    '2xl': '32px',
    '3xl': '48px',
    '4xl': '64px',
  },
  space: {
    0: '0',
    1: '8px',
    2: '16px',
    3: '24px',
    4: '32px',
    5: '40px',
    6: '48px',
    8: '64px',
    10: '80px',
    12: '96px',
    16: '128px',
  },
  border: {
    none: '0',
    hairline: '1px solid var(--color-black)',
    thick: '2px solid var(--color-black)',
  },
  radius: {
    none: '0',
    sm: '2px',
    md: '4px',
    full: '9999px',
  },
  shadow: {
    none: 'none',
    sm: '0 1px 0 0 currentColor',
    md: '2px 2px 0 0 currentColor',
    lg: '4px 4px 0 0 currentColor',
  },
} as const

export type ColorToken = keyof typeof tokens.color
export type Region = 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'

/**
 * Default region → token mapping (spec §5.2).
 * Users may remap, but cannot add new tokens.
 */
export const defaultRegionColor: Record<Region, ColorToken> = {
  capture: 'red',
  inbox: 'red',
  canvas: 'black',
  archive: 'blue',
  system: 'gray',
}
