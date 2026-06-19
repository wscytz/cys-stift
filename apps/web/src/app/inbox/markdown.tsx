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
 */
export function MarkdownBody({ source }: { source: string }) {
  if (!source.trim()) {
    return <p className="md md--empty">(no body)</p>
  }
  return (
    <div className="md">
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
      <style>{styles}</style>
    </div>
  )
}

const styles = `
.md {
  font-family: var(--font-body);
  font-size: var(--font-size-base);
  line-height: 1.6;
  color: var(--color-black);
  word-break: break-word;
}
.md--empty { color: var(--color-gray); font-style: italic; margin: 0; }
.md h1, .md h2, .md h3 {
  font-family: var(--font-display);
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
`
