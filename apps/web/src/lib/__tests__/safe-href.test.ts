import { describe, it, expect } from 'vitest'
import {
  safeHref,
  isSafeImageDataUrl,
  isSafeFileDataUrl,
  isSafeProviderId,
  isSafeModelId,
  isSafeBaseUrl,
} from '../safe-href'

/**
 * safe-href 是安全关键层:防 XSS(javascript:/data:text/html/vbscript:)、
 * 校验图片/文件 data URL、校验 AI provider 设置。补回归测试守住这些边界。
 */

describe('safeHref — URL scheme allowlist', () => {
  it('放行 http/https/mailto/tel/相对路径', () => {
    expect(safeHref('http://example.com')).toBe('http://example.com')
    expect(safeHref('https://x.com/p?a=1')).toBe('https://x.com/p?a=1')
    expect(safeHref('mailto:a@b.com')).toBe('mailto:a@b.com')
    expect(safeHref('tel:+8613800138000')).toBe('tel:+8613800138000')
    expect(safeHref('/inbox')).toBe('/inbox')
  })
  it('大小写不敏感(scheme 可大写)', () => {
    expect(safeHref('HTTP://EXAMPLE.COM')).toBe('HTTP://EXAMPLE.COM')
    expect(safeHref('HTTPS://x')).toBe('HTTPS://x')
  })
  it('拦截 XSS scheme → #', () => {
    expect(safeHref('javascript:alert(1)')).toBe('#')
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBe('#')
    expect(safeHref('vbscript:msgbox(1)')).toBe('#')
    // 混淆前导空格 / 大写
    expect(safeHref('  javascript:alert(1)')).toBe('#')
    expect(safeHref('JAVASCRIPT:alert(1)')).toBe('#')
  })
  it('无 scheme 的裸字符串 → #(不能放行,可能被渲染成危险相对)', () => {
    expect(safeHref('example.com')).toBe('#')
    expect(safeHref('foo bar')).toBe('#')
  })
  it('空 / 非字符串 → #', () => {
    expect(safeHref('')).toBe('#')
    expect(safeHref('   ')).toBe('#')
    expect(safeHref(undefined)).toBe('#')
    expect(safeHref(null)).toBe('#')
  })
  it('保留放行 URL 的查询串/锚点', () => {
    expect(safeHref('https://x.com/p?q=1#top')).toBe('https://x.com/p?q=1#top')
  })
})

describe('isSafeImageDataUrl — 图片 data URL', () => {
  const png = 'data:image/png;base64,iVBORw0KGgo='
  it('放行 png/jpeg/jpg/gif/webp base64', () => {
    expect(isSafeImageDataUrl(png)).toBe(true)
    expect(isSafeImageDataUrl('data:image/jpeg;base64,/9j/4AAQSkZJRg==')).toBe(true)
    expect(isSafeImageDataUrl('data:image/webp;base64,UklGRg==')).toBe(true)
  })
  it('拒绝 svg(XSS 向量)/text/html/非图片', () => {
    expect(isSafeImageDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
    expect(isSafeImageDataUrl('data:text/html;base64,PGh0bWw+')).toBe(false)
    expect(isSafeImageDataUrl('data:application/pdf;base64,JVBERiA=')).toBe(false)
  })
  it('拒绝非 base64 / 普通 URL / 非字符串', () => {
    expect(isSafeImageDataUrl('data:image/png;raw,abc')).toBe(false)
    expect(isSafeImageDataUrl('https://x/a.png')).toBe(false)
    expect(isSafeImageDataUrl(undefined)).toBe(false)
  })
  it('超 maxBytes → false', () => {
    const big = 'data:image/png;base64,' + 'A'.repeat(8_000_000)
    expect(isSafeImageDataUrl(big)).toBe(false)
    // 自定义较小上限
    expect(isSafeImageDataUrl(png, 5)).toBe(false)
  })
})

describe('isSafeFileDataUrl — 文件 data URL', () => {
  it('放行 pdf/text/plain/markdown 等文档 MIME', () => {
    expect(isSafeFileDataUrl('data:application/pdf;base64,JVBERiA=')).toBe(true)
    expect(isSafeFileDataUrl('data:text/plain;base64,aGVsbG8=')).toBe(true)
    expect(isSafeFileDataUrl('data:text/markdown;base64,aGVsbG8=')).toBe(true)
  })
  it('拒绝 svg(始终 XSS 向量)', () => {
    expect(isSafeFileDataUrl('data:image/svg+xml;base64,PHN2Zz4=')).toBe(false)
  })
  it('拒绝非 base64 / 非 http(s) URL / 非字符串', () => {
    expect(isSafeFileDataUrl('https://x/a.pdf')).toBe(false)
    expect(isSafeFileDataUrl(undefined)).toBe(false)
  })
  it('超 maxBytes → false', () => {
    const big = 'data:application/pdf;base64,' + 'A'.repeat(8_000_000)
    expect(isSafeFileDataUrl(big)).toBe(false)
  })
})

describe('isSafeProviderId — AI provider', () => {
  it('放行三个支持的 provider', () => {
    expect(isSafeProviderId('openai')).toBe(true)
    expect(isSafeProviderId('anthropic')).toBe(true)
    expect(isSafeProviderId('ollama')).toBe(true)
  })
  it('拒绝其它(含 prompt-injection 风险值)', () => {
    expect(isSafeProviderId('claude')).toBe(false)
    expect(isSafeProviderId('')).toBe(false)
    expect(isSafeProviderId('openai/../../etc')).toBe(false)
    expect(isSafeProviderId(undefined)).toBe(false)
  })
})

describe('isSafeModelId — 模型 id', () => {
  it('放行短保守 token', () => {
    expect(isSafeModelId('gpt-4o')).toBe(true)
    expect(isSafeModelId('claude-3.5-sonnet')).toBe(true)
    expect(isSafeModelId('llama3:8b')).toBe(true)
  })
  it('拒绝含空格/特殊字符/超长', () => {
    expect(isSafeModelId('a b c')).toBe(false)
    expect(isSafeModelId('model@v1')).toBe(false) // @ 不在允许集
    expect(isSafeModelId('a;b')).toBe(false)
    expect(isSafeModelId('x'.repeat(65))).toBe(false) // > 64
    expect(isSafeModelId(undefined)).toBe(false)
  })
})

describe('isSafeBaseUrl — AI baseUrl', () => {
  it('放行 http/https URL', () => {
    expect(isSafeBaseUrl('https://api.openai.com')).toBe(true)
    expect(isSafeBaseUrl('http://localhost:8080')).toBe(true)
  })
  it('拒绝 ftp/javascript/非 URL', () => {
    expect(isSafeBaseUrl('ftp://x.com')).toBe(false)
    expect(isSafeBaseUrl('javascript:alert(1)')).toBe(false)
    expect(isSafeBaseUrl('notaurl')).toBe(false)
    expect(isSafeBaseUrl('')).toBe(false)
    expect(isSafeBaseUrl(undefined)).toBe(false)
  })
})
