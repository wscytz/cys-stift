'use client'

import type { CanvasElement, CanvasView } from './canvas-host'
import { readToken } from './self-built-render'
import { arrowEndpoints } from './self-built-arrow'
import { unionBounds, expandBounds, type Bounds } from '../export-bounds'

export interface ElementsToSvgOptions {
  background: boolean
  border: number
}

interface CardInfo {
  title: string
  body: string
  type: string
  pinned: boolean
}

/** CanvasElement[] → SVG 字符串(对齐 self-built-render 视觉;颜色 readToken 解析具体值)。 */
export function elementsToSvg(
  elements: CanvasElement[],
  view: CanvasView,
  getCardInfo: (id: string) => CardInfo | null,
  opts: ElementsToSvgOptions,
): { svg: string; width: number; height: number } {
  // 1. 算 bbox(页坐标),平移到 (border, border) 起。
  const boxes: Bounds[] = elements.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h }))
  const raw = unionBounds(boxes) ?? { x: 0, y: 0, w: 1, h: 1 }
  const expanded = expandBounds(raw, opts.border)
  const width = Math.max(1, Math.round(expanded.w))
  const height = Math.max(1, Math.round(expanded.h))
  const dx = -expanded.x
  const dy = -expanded.y

  // 2. 颜色(readToken 解析具体值;SVG 无 CSS 变量上下文)。
  const bg = opts.background ? readToken('--color-white', '#ffffff') : 'transparent'
  const cardFill = readToken('--color-white', '#ffffff')
  const cardStroke = readToken('--color-gray', '#e2e8f0')
  const textCol = readToken('--color-black', '#0f172a')
  const grayCol = readToken('--color-gray', '#64748b')
  const yellow = readToken('--color-yellow', '#eab308')
  const fontBody = readToken('--font-body', 'Inter, sans-serif')
  const fontDisplay = readToken('--font-display', 'Inter, sans-serif')
  const fontMono = readToken('--font-mono', 'monospace')

  void view // 导出时 view 不参与坐标变换(导出通常 zoom=1,pan=0);保留参数为 Task 2-4 兼容。

  const parts: string[] = []
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`)
  if (opts.background) {
    parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="${bg}"/>`)
  }
  for (const el of elements) {
    parts.push(elementToSvg(el, dx, dy, getCardInfo, { cardFill, cardStroke, textCol, grayCol, yellow, fontBody, fontDisplay, fontMono }, elements))
  }
  parts.push('</svg>')
  return { svg: parts.join(''), width, height }
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function elementToSvg(
  el: CanvasElement,
  dx: number,
  dy: number,
  getCardInfo: (id: string) => CardInfo | null,
  c: { cardFill: string; cardStroke: string; textCol: string; grayCol: string; yellow: string; fontBody: string; fontDisplay: string; fontMono: string },
  allElements: CanvasElement[],
): string {
  const x = el.x + dx
  const y = el.y + dy
  switch (el.kind) {
    case 'card': {
      const info = getCardInfo(el.id)
      const parts = [`<rect x="${x}" y="${y}" width="${el.w}" height="${el.h}" rx="4" fill="${c.cardFill}" stroke="${c.cardStroke}"/>`]
      if (info) {
        if (info.pinned) parts.push(`<text x="${x + el.w - 14}" y="${y + 16}" fill="${c.yellow}" font-family="${c.fontMono}" font-size="14">★</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="10">${esc(info.type.toUpperCase())}</text>`)
        parts.push(`<text x="${x + 10}" y="${y + 32}" fill="${c.textCol}" font-family="${c.fontDisplay}" font-size="15" font-weight="500">${esc(info.title || '(untitled)')}</text>`)
        if (info.body) {
          const lines = info.body.split('\n').slice(0, 3)
          lines.forEach((ln, i) => {
            parts.push(`<text x="${x + 10}" y="${y + 50 + i * 16}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="12">${esc(ln.slice(0, 40))}</text>`)
          })
        }
      } else {
        parts.push(`<text x="${x + 10}" y="${y + 14}" fill="${c.grayCol}" font-family="${c.fontMono}" font-size="12">(untitled)</text>`)
      }
      return parts.join('')
    }
    case 'rect':
      return `<rect x="${x}" y="${y}" width="${el.w}" height="${el.h}" fill="none" stroke="${strokeColor(el.color)}"/>`
    case 'ellipse':
      return `<ellipse cx="${x + el.w / 2}" cy="${y + el.h / 2}" rx="${el.w / 2}" ry="${el.h / 2}" fill="none" stroke="${strokeColor(el.color)}"/>`
    case 'freedraw': {
      const pts = (el.meta?.points as [number, number][] | undefined) ?? []
      if (pts.length === 0) return ''
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p[0]! + dx} ${p[1]! + dy}`).join(' ')
      return `<path d="${d}" fill="none" stroke="${strokeColor(el.color)}" stroke-width="2"/>`
    }
    case 'text':
      return `<text x="${x}" y="${y + 14}" fill="${c.textCol}" font-family="${c.fontBody}" font-size="14">${esc(el.text ?? '')}</text>`
    case 'arrow': {
      const { from, to } = arrowEndpoints(el, allElements)
      if (!from || !to) return ''
      return `<line x1="${from.x + dx}" y1="${from.y + dy}" x2="${to.x + dx}" y2="${to.y + dy}" stroke="${strokeColor(el.color)}" stroke-width="2"/>`
    }
    default:
      return ''
  }
}

function strokeColor(c: string | undefined): string {
  const map: Record<string, string> = {
    blue: '--color-blue', red: '--color-red', green: '--color-green', black: '--color-black',
  }
  return readToken(map[c ?? 'black'] ?? '--color-black', '#0f172a')
}
