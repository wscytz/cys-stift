'use client'

import ReactMarkdown from 'react-markdown'
import rehypeSanitize from 'rehype-sanitize'

/**
 * Markdown body renderer (spec §1.4 + §5.3).
 *
 * Safety:
 *   - rehype-sanitize strips <script>, javascript: URLs, event handlers, etc.
 *   - We still re-stamp external links with target=_blank rel="noopener noreferrer"
 *     (sanitize does not add these).
 *
 * Style:
 *   - All rules are token-driven (no inline hex/px).
 *   - Headings use display font, code uses mono, lists use square bullets.
 *
 * Block references (BR-T3):
 *   - `((标题))` embeds another card's body inline.
 *   - splitEmbeds is a pure segmenter (exported for unit testing).
 *   - EmbedRenderer renders recursively with cycle detection (visited Set)
 *     and a depth cap (MAX_DEPTH=5).
 *   - resolveEmbed is optional: callers that don't pass it keep the legacy
 *     behavior where `((标题))` is treated as plain text. This preserves
 *     backward compatibility for all existing MarkdownBody call sites.
 */
export interface EmbedSegment {
  type: 'text' | 'embed'
  value: string
}

/** 切分 source 成 text/embed 段。空串 → 空数组。纯函数。 */
export function splitEmbeds(source: string): EmbedSegment[] {
  if (!source) return []
  const re = /\(\(([^)]+)\)\)/g
  const out: EmbedSegment[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(source))) {
    if (m.index > last) out.push({ type: 'text', value: source.slice(last, m.index) })
    out.push({ type: 'embed', value: m[1]!.trim() })
    last = m.index + m[0].length
  }
  if (last < source.length) out.push({ type: 'text', value: source.slice(last) })
  return out
}

/** 现有 ReactMarkdown 逻辑(rehype-sanitize + 组件 a 的 safeHref)。 */
function MarkdownBlock({ source }: { source: string }) {
  return (
    <ReactMarkdown
      rehypePlugins={[rehypeSanitize]}
      components={{
        a: ({ href, children, ...rest }) => {
          const safeHref =
            typeof href === 'string' &&
            (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('/'))
              ? href
              : '#'
          return (
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              {...rest}
            >
              {children}
            </a>
          )
        },
      }}
    >
      {source}
    </ReactMarkdown>
  )
}

const MAX_DEPTH = 5

function EmbedRenderer({
  source,
  resolveEmbed,
  visited,
  depth,
}: {
  source: string
  resolveEmbed?: (title: string) => { body: string; title: string } | null
  visited: Set<string>
  depth: number
}) {
  const parts = splitEmbeds(source)
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') return <MarkdownBlock key={i} source={part.value} />
        const title = part.value
        // 无 resolver(向后兼容)→ 当文本。
        if (!resolveEmbed) return <MarkdownBlock key={i} source={`((${title}))`} />
        if (depth >= MAX_DEPTH) return <div key={i} className="md-embed md-embed--cycle">↻ 嵌套过深</div>
        if (visited.has(title)) return <div key={i} className="md-embed md-embed--cycle">↻ {title}(循环引用)</div>
        const target = resolveEmbed(title)
        if (!target) return <div key={i} className="md-embed md-embed--missing">📌 {title}(卡片不存在或已删除)</div>
        // 复制 visited,兄弟嵌入不互相污染。
        const nextVisited = new Set(visited)
        nextVisited.add(title)
        return (
          <div key={i} className="md-embed">
            <div className="md-embed__title">{target.title}</div>
            <EmbedRenderer
              source={target.body}
              resolveEmbed={resolveEmbed}
              visited={nextVisited}
              depth={depth + 1}
            />
          </div>
        )
      })}
    </>
  )
}

export function MarkdownBody({
  source,
  resolveEmbed,
}: {
  source: string
  resolveEmbed?: (title: string) => { body: string; title: string } | null
}) {
  if (!source.trim()) return null
  return (
    <div className="md">
      <EmbedRenderer source={source} resolveEmbed={resolveEmbed} visited={new Set()} depth={0} />
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.md {
  font-family: var(--font-content);
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--color-black);
  word-break: break-word;
}
.md--empty { color: var(--color-gray); font-style: italic; margin: 0; }
.md h1, .md h2, .md h3 {
  font-family: var(--font-content);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin: var(--space-3) 0 var(--space-2);
  line-height: 1.2;
}
.md h1 { font-size: var(--font-size-2xl); }
.md h2 { font-size: var(--font-size-xl); }
.md h3 { font-size: var(--font-size-lg); }
.md p { margin: 0 0 var(--space-2); }
.md a { color: var(--color-blue); text-decoration: underline; text-underline-offset: 2px; }
.md a:hover { color: var(--color-black); }
.md strong { font-weight: 600; }
.md em { font-style: italic; }
.md ul, .md ol { margin: 0 0 var(--space-2); padding-left: var(--space-4); }
.md ul { list-style: none; }
.md ul > li { position: relative; padding-left: var(--space-2); }
.md ul > li::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.6em;
  width: 6px;
  height: 6px;
  background: var(--color-red);
}
.md ol { list-style: decimal; }
.md li { margin-bottom: var(--space-1); }
.md code {
  font-family: var(--font-mono);
  font-size: 0.92em;
  background: var(--color-gray-soft);
  padding: 0 4px;
  border-radius: var(--radius-sm);
}
.md pre {
  font-family: var(--font-mono);
  font-size: var(--font-size-sm);
  background: var(--color-black);
  color: var(--color-white);
  padding: var(--space-2);
  overflow-x: auto;
  border-radius: var(--radius-sm);
  margin: 0 0 var(--space-2);
  line-height: 1.5;
}
.md pre code { background: transparent; padding: 0; border-radius: 0; color: inherit; }
.md blockquote {
  margin: 0 0 var(--space-2);
  padding: var(--space-1) var(--space-3);
  border-left: 4px solid var(--color-red);
  background: var(--color-red-soft);
  color: var(--color-black);
}
.md hr { border: 0; border-top: var(--border-hairline); margin: var(--space-3) 0; }
.md-embed {
  border-left: 2px solid var(--color-yellow);
  padding-left: var(--space-2);
  margin: var(--space-1) 0;
  background: var(--color-gray-soft);
}
.md-embed__title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-gray);
  margin-bottom: var(--space-1);
}
.md-embed--missing { color: var(--color-gray); font-style: italic; }
.md-embed--cycle { color: var(--color-red); font-size: var(--font-size-xs); }
`
