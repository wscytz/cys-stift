/**
 * Swiss Editorial tokens — TypeScript mirror of tokens.css (DESIGN.md).
 *
 * Three sources on purpose:
 *   1. tokens.css — the runtime values injected as CSS variables.
 *   2. tokens.ts — this file, used by Tailwind preset + component prop types.
 *   3. tailwind-preset.css — @theme injection (same hex again).
 *   (+ canvas-engine tokenResolver fallbacks carry the resolved hex a 4th time)
 *
 * If you change one, change all. A grep for `var(--color-` in components will
 * tell you whether anything bypassed the token system.
 */

/**
 * DESIGN.md palette — the canonical Swiss Editorial color set.
 * Legacy `tokens.color` (below) maps the old Bauhaus six onto this.
 */
export const palette = {
  primary: '#b51b17',
  onPrimary: '#ffffff',
  primaryContainer: '#d9372d',
  onPrimaryContainer: '#fffbff',
  primaryFixed: '#ffdad5',
  primaryFixedDim: '#ffb4aa',
  onPrimaryFixed: '#410001',
  onPrimaryFixedVariant: '#930006',
  inversePrimary: '#ffb4aa',
  surfaceTint: '#b91e19',
  /** 品牌红(icons/manifest/状态点);交互 primary 用更深的 #b51b17 保对比度。 */
  accent: '#e03c31',
  secondary: '#5e5e5c',
  onSecondary: '#ffffff',
  secondaryContainer: '#e1dfdc',
  onSecondaryContainer: '#626360',
  secondaryFixed: '#e4e2df',
  secondaryFixedDim: '#c7c6c3',
  onSecondaryFixed: '#1b1c1a',
  onSecondaryFixedVariant: '#464744',
  tertiary: '#006480',
  onTertiary: '#ffffff',
  tertiaryContainer: '#007ea1',
  onTertiaryContainer: '#fbfdff',
  tertiaryFixed: '#bce9ff',
  tertiaryFixedDim: '#74d2f9',
  onTertiaryFixed: '#001f2a',
  onTertiaryFixedVariant: '#004d64',
  error: '#ba1a1a',
  onError: '#ffffff',
  errorContainer: '#ffdad6',
  onErrorContainer: '#93000a',
  surface: '#fbf9f6',
  surfaceDim: '#dbdad7',
  surfaceBright: '#fbf9f6',
  surfaceWhite: '#ffffff',
  surfaceContainerLowest: '#ffffff',
  surfaceContainerLow: '#f5f3f0',
  surfaceContainer: '#efeeeb',
  surfaceContainerHigh: '#eae8e5',
  surfaceContainerHighest: '#e4e2df',
  onSurface: '#1b1c1a',
  onSurfaceVariant: '#5b403c',
  surfaceVariant: '#e4e2df',
  inverseSurface: '#30312f',
  inverseOnSurface: '#f2f0ed',
  outline: '#8f706b',
  outlineVariant: '#e4beb9',
  borderMuted: '#dbdad7',
  background: '#fbf9f6',
  onBackground: '#1b1c1a',
} as const

export const tokens = {
  /**
   * Legacy Bauhaus six — names frozen (region colours + persisted user
   * settings + canvas-engine reads depend on them), values remapped onto
   * `palette`. Do not add a seventh.
   *   red→primary · yellow→outline · blue→tertiary
   *   black→onSurface · white→surface · gray→secondary
   */
  color: {
    red: { DEFAULT: palette.primary, soft: palette.primaryFixed },
    yellow: { DEFAULT: palette.outline, soft: palette.outlineVariant },
    blue: { DEFAULT: palette.tertiary, soft: palette.tertiaryFixed },
    black: { DEFAULT: palette.onSurface, soft: palette.onSurfaceVariant },
    white: { DEFAULT: palette.surface, soft: palette.surfaceWhite },
    gray: { DEFAULT: palette.secondary, soft: palette.borderMuted },
    // canvas 是 surface 色(非 6 原色),不进色板;CSS 变量 --color-canvas 在 tokens.css 定义
  },
  font: {
    display: '"Space Grotesk", system-ui, sans-serif',
    body: 'Inter, system-ui, -apple-system, sans-serif',
    mono: '"JetBrains Mono", "SF Mono", ui-monospace, monospace',
  },
  fontSize: {
    '2xs': '11px',
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
    hairline: '1px solid var(--color-on-surface)',
    thick: '2px solid var(--color-on-surface)',
    muted: '1px solid var(--color-border-muted)',
  },
  /** 全 0(唯一例外=功能性状态点圆 full)。 */
  radius: {
    none: '0',
    sm: '0',
    md: '0',
    dot: '9999px',
    full: '9999px',
  },
  /** 禁阴影。token 保留只为兼容旧消费面,值恒 none。 */
  shadow: {
    none: 'none',
    sm: 'none',
    md: 'none',
    lg: 'none',
  },
  /** 固定编辑栅格。 */
  editorial: {
    sidebarWidth: '280px',
    railWidth: '64px',
    topbarHeight: '64px',
    rowHeight: '48px',
    margin: '32px',
    gridLine: '1px',
  },
  motion: {
    fast: '150ms',
    ease: 'ease-out',
    /** PRD animated 稿入场曲线;页面切换取 350ms(600ms 是 demo hero 节奏)。 */
    editorial: 'cubic-bezier(0.16, 1, 0.3, 1)',
    page: '350ms',
  },
} as const

export type ColorToken = keyof typeof tokens.color
export type Region = 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'

/**
 * Default region → token mapping (unchanged since v0.1; user settings
 * persist these token NAMES — values shift with the palette, names must not).
 */
export const defaultRegionColor: Record<Region, ColorToken> = {
  capture: 'red',
  inbox: 'red',
  canvas: 'black',
  archive: 'blue',
  system: 'gray',
}
