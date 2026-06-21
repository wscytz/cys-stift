'use client'

/**
 * CanvasIcon — Bauhaus line icons for the CanvasToolbar. SVG (not font
 * glyphs) so rendering is identical across macOS / Windows / Linux and
 * the strokes stay 1.75px hairline (Bauhaus "thin line"). Stroke uses
 * currentColor so the toolbar's CSS (black default, white on red active)
 * drives the colour — no per-icon fill rules to forget.
 */
import type { CSSProperties } from 'react'

export type CanvasIconId =
  | 'select'
  | 'draw'
  | 'rectangle'
  | 'ellipse'
  | 'arrow'
  | 'note'
  | 'text'
  | 'eraser'

interface Props {
  id: CanvasIconId
  style?: CSSProperties
}

const SIZE = 18

// Each icon is a 24×24 viewBox with 1.75 stroke, no fill. Use shape
// combinations that read instantly at 18px: outlines, diagonals, an X.
export function CanvasIcon({ id, style }: Props) {
  const common = {
    width: SIZE,
    height: SIZE,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    style,
  }
  switch (id) {
    case 'select':
      // Diagonal arrow with a small tail = "pick / move".
      return (
        <svg {...common}>
          <path d="M5 3 L19 11 L12 13 L9 19 Z" />
          <path d="M12 13 L14.5 11" />
        </svg>
      )
    case 'draw':
      // Pencil: angled body with tip + nib.
      return (
        <svg {...common}>
          <path d="M4 20 L8 16 L18 6 L20 8 L10 18 L4 20 Z" />
          <path d="M14 10 L18 14" />
          <path d="M4 20 L7 19" />
        </svg>
      )
    case 'rectangle':
      // Square outline.
      return (
        <svg {...common}>
          <rect x="4" y="6" width="16" height="12" />
        </svg>
      )
    case 'ellipse':
      // Ellipse outline.
      return (
        <svg {...common}>
          <ellipse cx="12" cy="12" rx="8" ry="6" />
        </svg>
      )
    case 'arrow':
      // Horizontal arrow with arrowhead.
      return (
        <svg {...common}>
          <path d="M4 12 L19 12" />
          <path d="M14 7 L19 12 L14 17" />
        </svg>
      )
    case 'note':
      // Sticky-note: folded corner + 3 text lines.
      return (
        <svg {...common}>
          <path d="M5 4 L16 4 L20 8 L20 20 L5 20 Z" />
          <path d="M16 4 L16 8 L20 8" />
          <path d="M8 12 L17 12" />
          <path d="M8 15 L17 15" />
          <path d="M8 18 L14 18" />
        </svg>
      )
    case 'text':
      // Capital T with serif foot — text tool.
      return (
        <svg {...common}>
          <path d="M5 6 L19 6" />
          <path d="M12 6 L12 19" />
          <path d="M8 19 L16 19" />
        </svg>
      )
    case 'eraser':
      // Eraser: angled block with a diagonal "rubbed" line.
      return (
        <svg {...common}>
          <path d="M16 4 L20 8 L10 18 L4 18 L4 12 Z" />
          <path d="M8 12 L16 4" />
        </svg>
      )
  }
}