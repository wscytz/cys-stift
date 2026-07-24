'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize'
import rehypeHighlight from 'rehype-highlight'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { useI18n } from '@/lib/i18n'

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
 *
 * 富 Markdown (D1, 2026-07-03 workbench spec):
 *   - remark-gfm 解锁 GFM 表格 / 任务列表 / 删除线 / 自动链接。
 *   - sanitizeSchema 在 defaultSchema 上放行 GFM 的 table/del + 任务列表 checkbox
 *     input + GFM 注入的 className(task-list-item / contains-task-list),好让任务项
 *     去掉默认红方块项目符号。
 *   - rehype-highlight 代码高亮 + Bauhaus 语法主题(D1 收尾)。highlight 接在 sanitize
 *     之后跑,它注入的 hljs-* class 本不过 sanitize;但 defaultSchema 的
 *     attributes.span=null 会剥 span 的 class → 高亮 span 全丢。故 sanitizeSchema 显式
 *     放行 code/span 的 hljs-* className(前缀限白,非任意 class)。
 */
export interface EmbedSegment {
  type: 'text' | 'embed'
  value: string
}

/**
 * GFM-aware sanitize schema:在 defaultSchema 上放行 GFM 元素 + 代码高亮 class。
 * - tagNames:+ del / table 族
 * - attributes:ul/li 放行 className(GFM 任务列表类);input 仅放行 checkbox
 *   (GFM 任务列表产 `<input type=checkbox disabled>`)
 * - code/span 放行 `hljs-*` className:rehype-highlight 在 sanitize 之后注入
 *   hljs-keyword/hljs-string 等;defaultSchema 的 attributes.span=null 会把它们剥掉,
 *   显式放行(限 `hljs-` 前缀,不开放任意 class → 仍防注入)。
 */
export const sanitizeSchema = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []),
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',  // 显式放行:default schema 不含 h1-h6,会被剥 → 标题不渲染(bug 1)
    'del',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'th',
    'td',
  ],
  attributes: {
    ...defaultSchema.attributes,
    ul: ['className'],
    li: ['className'],
    input: [['type', 'checkbox'], 'disabled', 'checked'],
    // hljs-* class 前缀放行(highlight 注入 + Bauhaus 主题选择器依赖)。
    code: [...(defaultSchema.attributes?.code ?? []), ['className', /^hljs-/]],
    span: [['className', /^hljs-/], 'math'],   // +inline math class(remark-math);rehype-katex 在 sanitize 之后跑,其输出绕过 sanitize
    div: [...(defaultSchema.attributes?.div ?? []), 'math'],  // +block math class
  },
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
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[
        // sanitize 先:剥 script/javascript: 等;放行 span/div 的 math class(remark-math)。
        // highlight + katex 后注入:产出的 class(hljs-* / katex)是库自身可信输出,
        // 绕过 sanitize(同现有 highlight 模式)——故无需枚举 mathml 标签。
        [rehypeSanitize, sanitizeSchema],
        rehypeHighlight,
        rehypeKatex,
      ]}
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
  const { t } = useI18n()
  const parts = splitEmbeds(source)
  return (
    <>
      {parts.map((part, i) => {
        if (part.type === 'text') return <MarkdownBlock key={i} source={part.value} />
        const title = part.value
        // 无 resolver(向后兼容)→ 当文本。
        if (!resolveEmbed) return <MarkdownBlock key={i} source={`((${title}))`} />
        if (depth >= MAX_DEPTH) return <div key={i} className="md-embed md-embed--cycle">↻ {t('md.embed.cycleDepth')}</div>
        if (visited.has(title)) return <div key={i} className="md-embed md-embed--cycle">↻ {title}({t('md.embed.cycleRef')})</div>
        const target = resolveEmbed(title)
        if (!target) return <div key={i} className="md-embed md-embed--missing">📌 {title}({t('md.embed.missing')})</div>
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
.md h1, .md h2, .md h3, .md h4, .md h5, .md h6 {
  font-family: var(--font-content);
  font-weight: 500;
  letter-spacing: -0.01em;
  margin: var(--space-3) 0 var(--space-2);
  line-height: 1.2;
}
.md h1 { font-size: var(--font-size-2xl); }
.md h2 { font-size: var(--font-size-xl); }
.md h3 { font-size: var(--font-size-lg); }
.md h4 { font-size: var(--font-size-base); }
.md h5 { font-size: var(--font-size-sm); }
.md h6 { font-size: var(--font-size-xs); }
.md p,
.md li,
.md blockquote,
.md th,
.md td {
  /* Notes are captured as plain text first. Keep intentional single line
     breaks visible in the reading surface instead of silently joining two
     thoughts into one row (the source editor remains the Markdown source). */
  white-space: pre-line;
}
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
  width: var(--space-1);
  height: var(--space-1);
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
  background: var(--color-code-bg);
  color: var(--color-code-fg);
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
/* GFM(D1 富 Markdown):表格 / 任务列表 / 删除线 */
.md del { color: var(--color-gray); }
.md table {
  border-collapse: collapse;
  width: 100%;
  margin: 0 0 var(--space-2);
  font-size: var(--font-size-sm);
}
.md th, .md td {
  border: var(--border-hairline);
  padding: var(--space-1) var(--space-2);
  text-align: left;
  vertical-align: top;
}
.md th {
  background: var(--color-blue);
  color: var(--color-white);
  font-weight: 600;
}
/* GFM 任务列表:去掉默认红方块项目符号,checkbox 走 accent-color */
.md ul.contains-task-list { padding-left: var(--space-2); }
.md li.task-list-item { padding-left: 0; list-style: none; }
.md li.task-list-item::before { content: none; }
.md input[type="checkbox"] {
  width: 1em;
  height: 1em;
  vertical-align: middle;
  margin-right: var(--space-1);
  accent-color: var(--color-blue);
}
.md-embed {
  border-left: 2px solid var(--color-yellow);
  padding-left: var(--space-2);
  margin: var(--space-1) 0;
  background: var(--color-gray-soft);
}
.md-embed__title {
  font-family: var(--font-mono);
  font-size: var(--font-size-xs);
  color: var(--color-black-soft);
  margin-bottom: var(--space-1);
}
.md-embed--missing { color: var(--color-black-soft); font-style: italic; }
.md-embed--cycle { color: var(--color-red); font-size: var(--font-size-xs); }
/* 代码高亮 Bauhaus 语法主题(rehype-highlight 注入 hljs-* class)。
   代码块 .md pre 始终黑底白字,故用黑底可读的亮色变体,只用 6 原色,避免 blue(#003f7f 黑底不可读)。 */
.md pre code.hljs { display: block; }
.md pre .hljs { color: var(--color-white); }
.md .hljs-keyword,
.md .hljs-built_in,
.md .hljs-literal,
.md .hljs-number { color: var(--color-yellow); }
.md .hljs-string { color: var(--color-red); }
.md .hljs-comment { color: var(--color-gray-soft); font-style: italic; }
.md .hljs-title,
.md .hljs-title.function_,
.md .hljs-section { color: var(--color-white); font-weight: 600; }
.md .hljs-punctuation,
.md .hljs-operator { color: var(--color-gray-soft); }
.md .hljs-attr,
.md .hljs-variable,
.md .hljs-property,
.md .hljs-params { color: var(--color-white); }
/* katex(remark-math + rehype-katex):颜色/字号继承 Bauhaus;display 居中。
   katex 自带完整渲染 CSS(顶部 import),这里只融入调色板。 */
.md .katex { color: var(--color-black); font-size: 1.1em; }
.md .katex-display { text-align: center; margin: var(--space-3) 0; overflow-x: auto; }
/* 脚注(remark-footnotes):引用号蓝色 + 脚注区低调分隔。 */
.md sup > a[href^="#"] { color: var(--color-blue); text-decoration: none; font-size: 0.8em; }
.md .footnotes {
  font-size: var(--font-size-sm);
  color: var(--color-gray);
  border-top: var(--border-hairline);
  margin-top: var(--space-3);
  padding-top: var(--space-2);
}
`
