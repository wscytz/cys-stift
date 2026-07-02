import type { Metadata } from 'next'
import { Button } from '@cys-stift/ui/button'
import { Input } from '@cys-stift/ui/input'
import { Card } from '@cys-stift/ui/card'
import { Tag } from '@cys-stift/ui/tag'
import { Toolbar } from '@cys-stift/ui/toolbar'
import { Tooltip } from '@cys-stift/ui/tooltip'
import { BauhausMotif } from '@cys-stift/ui/bauhaus-motif'
import { tokens, defaultRegionColor } from '@cys-stift/ui/tokens'

export const metadata: Metadata = {
  title: 'design — cy\'s Stift',
}

export default function DesignPage() {
  return (
    <main id="main" tabIndex={-1} className="design">
      <h1 className="sr-only">cy&rsquo;s stift / design</h1>
      <Toolbar region="system">
        <span className="design__crumb">cy&rsquo;s stift / design</span>
        <span className="design__crumb-spacer" />
        <Tag color="red">v0.2.0 · phase 1</Tag>
      </Toolbar>

      <div className="design__grid">
        <aside className="design__nav">
          <h2 className="design__nav-title">Index</h2>
          <ul>
            <li><a href="#manifesto">Manifesto</a></li>
            <li><a href="#color">Color</a></li>
            <li><a href="#typography">Typography</a></li>
            <li><a href="#space">Spacing · 8px</a></li>
            <li><a href="#borders">Borders &amp; shadows</a></li>
            <li><a href="#regions">Region colors</a></li>
            <li><a href="#button">Button</a></li>
            <li><a href="#input">Input</a></li>
            <li><a href="#card">Card</a></li>
            <li><a href="#tag">Tag</a></li>
            <li><a href="#toolbar">Toolbar</a></li>
            <li><a href="#modal">Modal</a></li>
            <li><a href="#tooltip">Tooltip</a></li>
            <li><a href="#motif">Motif</a></li>
          </ul>
        </aside>

        <article className="design__content">
          {/* ── Manifesto ─────────────────────────────── */}
          <section id="manifesto" className="section">
            <p className="section__eyebrow">manifesto</p>
            <h1 className="section__h1">
              Form follows <span className="accent-red">function</span>.
            </h1>
            <ul className="manifesto">
              <li>Six colours. No more.</li>
              <li>Eight-pixel grid. No more.</li>
              <li>Space Grotesk, Inter, JetBrains Mono. No more.</li>
              <li>Hard shadows. No blur. No gradients.</li>
              <li>Geometric, not rounded.</li>
            </ul>
          </section>

          {/* ── Color ─────────────────────────────── */}
          <section id="color" className="section">
            <p className="section__eyebrow">01 · color</p>
            <h2 className="section__h2">Six tokens, no more.</h2>
            <div className="palette">
              {Object.entries(tokens.color).map(([name, c]) => (
                <div key={name} className="palette__chip">
                  <div className="palette__swatch" style={{ background: c.DEFAULT }} />
                  <div className="palette__swatch palette__swatch--soft" style={{ background: c.soft }} />
                  <div className="palette__meta">
                    <code className="palette__name">{name}</code>
                    <code className="palette__hex">{c.DEFAULT}</code>
                    <code className="palette__hex palette__hex--soft">{c.soft}</code>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* ── Typography ─────────────────────────────── */}
          <section id="typography" className="section">
            <p className="section__eyebrow">02 · typography</p>
            <h2 className="section__h2">Three voices.</h2>
            <div className="type">
              <div className="type__row">
                <code className="type__role">display</code>
                <p className="type__display">你的灵感，在画布上生长</p>
              </div>
              <div className="type__row">
                <code className="type__role">body</code>
                <p className="type__body">A local-first inspiration canvas. Quick capture, slow cultivation.</p>
              </div>
              <div className="type__row">
                <code className="type__role">mono</code>
                <p className="type__mono">phase 1 · design system · v0.2.0</p>
              </div>
              <div className="type__scale">
                {Object.entries(tokens.fontSize).map(([k, v]) => (
                  <div key={k} className="type__scale-row">
                    <code className="type__role">{k}</code>
                    <code className="type__size">{v}</code>
                    <span className="type__sample" style={{ fontSize: v }}>
                      Bauhaus
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Spacing ─────────────────────────────── */}
          <section id="space" className="section">
            <p className="section__eyebrow">03 · spacing</p>
            <h2 className="section__h2">8px rhythm.</h2>
            <div className="space">
              {Object.entries(tokens.space).map(([k, v]) => (
                <div key={k} className="space__row">
                  <code className="space__key">{k}</code>
                  <code className="space__val">{v}</code>
                  <div className="space__bar" style={{ width: v }} />
                </div>
              ))}
            </div>
          </section>

          {/* ── Borders & shadows ─────────────────────────────── */}
          <section id="borders" className="section">
            <p className="section__eyebrow">04 · borders &amp; shadows</p>
            <h2 className="section__h2">Single line, hard offset.</h2>
            <div className="borders">
              <div className="borders__cell">
                <div className="borders__sample borders__sample--hairline" />
                <code>hairline 1px</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--thick" />
                <code>thick 2px</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--shadow-sm" />
                <code>shadow sm</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--shadow-md" />
                <code>shadow md</code>
              </div>
            </div>
          </section>

          {/* ── Regions ─────────────────────────────── */}
          <section id="regions" className="section">
            <p className="section__eyebrow">05 · region colors</p>
            <h2 className="section__h2">Function painted.</h2>
            <p className="section__lede">
              Each functional region carries one token. Users may remap, but no new tokens.
            </p>
            <div className="regions">
              {Object.entries(defaultRegionColor).map(([region, color]) => (
                <Toolbar key={region} region={region as 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--color-gray)' }}>
                    {region}
                  </span>
                  <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 'var(--font-size-xs)' }}>
                    → {color}
                  </span>
                </Toolbar>
              ))}
            </div>
          </section>

          {/* ── Components ─────────────────────────────── */}
          <section id="button" className="section">
            <p className="section__eyebrow">component · button</p>
            <h2 className="section__h2">Button</h2>
            <Card>
              <div className="row">
                <Button variant="primary">Primary</Button>
                <Button variant="secondary">Secondary</Button>
                <Button variant="danger">Danger</Button>
                <Button variant="ghost">Ghost</Button>
                <Button disabled>Disabled</Button>
              </div>
              <p className="hint">Press and hold to see the offset shadow compress.</p>
            </Card>
          </section>

          <section id="input" className="section">
            <p className="section__eyebrow">component · input</p>
            <h2 className="section__h2">Input</h2>
            <Card>
              <div className="stack">
                <Input label="Title" placeholder="灵感标题…" name="t1" />
                <Input label="Body" placeholder="随便写点什么…" name="t2" />
              </div>
              <p className="hint">Focus turns the underline red.</p>
            </Card>
          </section>

          <section id="card" className="section">
            <p className="section__eyebrow">component · card</p>
            <h2 className="section__h2">Card</h2>
            <div className="grid-2">
              <Card heading="A bold idea">
                Hairline border, generous padding, Space Grotesk title.
              </Card>
              <Card heading="Quiet reference">
                Used to group anything. Body uses softer black for hierarchy.
              </Card>
            </div>
          </section>

          <section id="tag" className="section">
            <p className="section__eyebrow">component · tag</p>
            <h2 className="section__h2">Tag</h2>
            <Card>
              <div className="row">
                <Tag color="red">urgent</Tag>
                <Tag color="yellow">waiting</Tag>
                <Tag color="blue">archived</Tag>
                <Tag color="black">done</Tag>
                <Tag color="gray">draft</Tag>
                <Tag color="white">reference</Tag>
              </div>
            </Card>
          </section>

          <section id="toolbar" className="section">
            <p className="section__eyebrow">component · toolbar</p>
            <h2 className="section__h2">Toolbar</h2>
            <Card>
              <div className="stack">
                <Toolbar region="capture"><span>Capture · ⌘/Ctrl+Shift+Space</span></Toolbar>
                <Toolbar region="canvas"><span>Canvas · 灵感墙</span></Toolbar>
                <Toolbar region="archive"><span>Archive · 2026 / 06</span></Toolbar>
              </div>
            </Card>
          </section>

          <section id="modal" className="section">
            <p className="section__eyebrow">component · modal</p>
            <h2 className="section__h2">Modal</h2>
            <Card>
              <ModalExample />
              <p className="hint">Click backdrop to close. Esc is handled by parent.</p>
            </Card>
          </section>

          <section id="tooltip" className="section">
            <p className="section__eyebrow">component · tooltip</p>
            <h2 className="section__h2">Tooltip</h2>
            <Card>
              <div className="row">
                <Tooltip label="打开 Inbox"><Button variant="primary">Inbox</Button></Tooltip>
                <Tooltip label="保存到画布"><Button variant="secondary">Canvas</Button></Tooltip>
                <Tooltip label="删除这张卡"><Button variant="danger">Delete</Button></Tooltip>
              </div>
              <p className="hint">Hover or focus the button.</p>
            </Card>
          </section>

          <section id="motif" className="section">
            <p className="section__eyebrow">component · motif</p>
            <h2 className="section__h2">Bauhaus motif</h2>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)', alignItems: 'flex-end' }}>
              <div><BauhausMotif variant="still" /><p className="section__eyebrow">still · 横排(默认)</p></div>
              <div><BauhausMotif variant="pulse" size={96} /><p className="section__eyebrow">pulse · 呼吸 loader</p></div>
              <div><BauhausMotif variant="overlap" size={80} /><p className="section__eyebrow">overlap · 重叠构图</p></div>
              <div><BauhausMotif variant="linear" size={120} /><p className="section__eyebrow">linear · 线条几何</p></div>
              <div><BauhausMotif variant="orbit" size={80} /><p className="section__eyebrow">orbit · 圆叠加</p></div>
            </div>
          </section>
        </article>
      </div>

      <style>{styles}</style>
    </main>
  )
}

function ModalExample() {
  // Phase 1 static showcase. The real <Modal> is a client component
  // (focus trap needs useEffect); a server showcase page can't pass a
  // function onClose into it, so we render a visual mockup instead.
  // Interactivity is verified on /inbox, /archive, etc.
  return (
    <div className="stack">
      <p className="hint">Modal: 50% black backdrop, hairline white frame, offset shadow. Focus trap + Tab cycling land in Phase B.</p>
      <div style={{ position: 'relative', height: '180px', border: '1px dashed var(--color-gray-soft)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(10,10,10,0.5)', display: 'grid', placeItems: 'center', padding: 'var(--space-4)' }}>
          <div style={{ background: 'var(--color-white)', border: 'var(--border-hairline)', padding: 'var(--space-4)', boxShadow: 'var(--shadow-md)', width: '320px' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)' }}>Example modal</h3>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-black-soft)' }}>Backdrop 50% black, frame hairline white, offset shadow.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = `
.design { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
.design__crumb { font-family: var(--font-mono); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.12em; }
.design__crumb-spacer { flex: 1; }
.design__grid { display: grid; grid-template-columns: 200px 1fr; max-width: 1280px; margin: 0 auto; padding: var(--space-6) var(--space-4); gap: var(--space-6); }
.design__nav { position: sticky; top: var(--space-4); align-self: start; }
.design__nav-title { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); margin: 0 0 var(--space-2); padding-bottom: var(--space-1); border-bottom: var(--border-hairline); }
.design__nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.design__nav a { color: var(--color-black-soft); text-decoration: none; font-family: var(--font-body); font-size: var(--font-size-sm); display: block; padding: var(--space-0, 0) var(--space-1); border-left: 2px solid transparent; }
.design__nav a:hover { border-left-color: var(--color-red); color: var(--color-black); }
.design__content { display: flex; flex-direction: column; gap: var(--space-8); }
.section { display: flex; flex-direction: column; gap: var(--space-3); scroll-margin-top: var(--space-4); }
.section__eyebrow { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.16em; color: var(--color-gray); margin: 0; }
.section__h1 { font-family: var(--font-display); font-size: var(--font-size-4xl); margin: 0; line-height: 1; letter-spacing: -0.02em; font-weight: 500; }
.section__h2 { font-family: var(--font-display); font-size: var(--font-size-2xl); margin: 0; font-weight: 500; letter-spacing: -0.01em; }
.section__lede { color: var(--color-black-soft); margin: 0; }
.accent-red { color: var(--color-red); }
.manifesto { list-style: none; padding: 0; margin: var(--space-3) 0 0; display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-display); font-size: var(--font-size-xl); }
.palette { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: var(--space-3); margin-top: var(--space-2); }
.palette__chip { border: var(--border-hairline); padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-1); }
.palette__swatch { height: 64px; border-bottom: var(--border-hairline); }
.palette__swatch--soft { height: 32px; border-bottom: none; }
.palette__meta { display: flex; flex-direction: column; gap: 2px; font-family: var(--font-mono); font-size: var(--font-size-xs); }
.palette__name { color: var(--color-black); text-transform: uppercase; letter-spacing: 0.08em; }
.palette__hex { color: var(--color-gray); }
.palette__hex--soft { color: var(--color-gray-soft); }
.type { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-2); }
.type__row { display: grid; grid-template-columns: 80px 1fr; align-items: baseline; gap: var(--space-3); }
.type__role { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.12em; color: var(--color-gray); }
.type__display { font-family: var(--font-display); font-size: var(--font-size-3xl); margin: 0; }
.type__body { font-family: var(--font-body); font-size: var(--font-size-base); margin: 0; }
.type__mono { font-family: var(--font-mono); font-size: var(--font-size-sm); margin: 0; }
.type__scale { display: flex; flex-direction: column; gap: var(--space-1); border-top: var(--border-hairline); padding-top: var(--space-3); }
.type__scale-row { display: grid; grid-template-columns: 60px 60px 1fr; align-items: baseline; gap: var(--space-3); }
.type__size { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.type__sample { font-family: var(--font-display); color: var(--color-black); }
.space { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-2); }
.space__row { display: grid; grid-template-columns: 60px 60px 1fr; align-items: center; gap: var(--space-3); }
.space__key { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; color: var(--color-gray); }
.space__val { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-black-soft); }
.space__bar { height: 16px; background: var(--color-red); max-width: 100%; }
.borders { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); margin-top: var(--space-2); }
.borders__cell { display: flex; flex-direction: column; gap: var(--space-1); align-items: flex-start; }
.borders__sample { width: 100%; height: 80px; background: var(--color-white); }
.borders__sample--hairline { border: var(--border-hairline); }
.borders__sample--thick { border: var(--border-thick); }
.borders__sample--shadow-sm { border: var(--border-hairline); box-shadow: var(--shadow-sm); }
.borders__sample--shadow-md { border: var(--border-hairline); box-shadow: var(--shadow-md); }
.borders__cell code { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.regions { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); border: var(--border-hairline); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.stack { display: flex; flex-direction: column; gap: var(--space-3); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }
.hint { color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); margin: 0; }

@media (max-width: 720px) {
  .design__grid { grid-template-columns: 1fr; }
  .design__nav { position: static; }
}
`
