import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Button } from '@cys-stift/ui/button'
import { Input } from '@cys-stift/ui/input'
import { Card } from '@cys-stift/ui/card'
import { Tag } from '@cys-stift/ui/tag'
import { Toolbar } from '@cys-stift/ui/toolbar'
import { Tooltip } from '@cys-stift/ui/tooltip'
import { EditorialMotif } from '@cys-stift/ui/editorial-motif'
import { BauhausMotif } from '@cys-stift/ui/bauhaus-motif'
import { StatusDot } from '@cys-stift/ui/status-dot'
import { GridRule } from '@cys-stift/ui/grid-rule'
import { DataTable, type DataTableColumn } from '@cys-stift/ui/data-table'
import { TopBar } from '@cys-stift/ui/top-bar'
import { TabsDemo } from './tabs-demo'
import { tokens, palette, defaultRegionColor } from '@cys-stift/ui/tokens'

export const metadata: Metadata = {
  title: 'design — cy\'s Stift',
}

/** palette 分组展示(DESIGN.md colors 全量 → 视觉契约)。 */
const PALETTE_GROUPS: Array<[string, Array<keyof typeof palette>]> = [
  ['primary · 手术红', ['primary', 'onPrimary', 'primaryContainer', 'primaryFixed', 'inversePrimary', 'surfaceTint', 'accent']],
  ['secondary · 墨中性', ['secondary', 'onSecondary', 'secondaryContainer', 'secondaryFixed']],
  ['tertiary · 石油蓝', ['tertiary', 'onTertiary', 'tertiaryContainer', 'tertiaryFixed']],
  ['error', ['error', 'onError', 'errorContainer', 'onErrorContainer']],
  ['surfaces · warm paper', ['surface', 'surfaceWhite', 'surfaceContainerLowest', 'surfaceContainerLow', 'surfaceContainer', 'surfaceContainerHigh', 'surfaceContainerHighest', 'surfaceDim', 'onSurface', 'onSurfaceVariant']],
  ['lines & inverse', ['borderMuted', 'outline', 'outlineVariant', 'inverseSurface', 'inverseOnSurface']],
]

const LEGACY_MAP: Array<[string, keyof typeof palette, string]> = [
  ['--color-red', 'primary', 'region capture/inbox · danger · focus'],
  ['--color-yellow', 'outline', '置顶/高亮/计数(canvas 组色需可区分)'],
  ['--color-blue', 'tertiary', 'region archive · 画布选中'],
  ['--color-black', 'onSurface', '墨:正文/结构线'],
  ['--color-white', 'surface', '纸:页面底'],
  ['--color-gray', 'secondary', '辅助文字/次级'],
]

export default function DesignPage() {
  if (process.env.NODE_ENV === 'production') notFound()
  return (
    <main id="main" tabIndex={-1} className="design">
      <h1 className="sr-only">cy&rsquo;s stift / design</h1>
      <Toolbar region="system">
        <span className="design__crumb">cy&rsquo;s stift / design</span>
        <span className="design__crumb-spacer" />
        <Tag color="red">v0.2.0 · swiss editorial</Tag>
      </Toolbar>

      <div className="design__grid">
        <aside className="design__nav">
          <h2 className="design__nav-title">Index</h2>
          <ul>
            <li><a href="#manifesto">Manifesto</a></li>
            <li><a href="#color">Color</a></li>
            <li><a href="#legacy">Legacy tokens</a></li>
            <li><a href="#typography">Typography</a></li>
            <li><a href="#space">Grid &amp; spacing</a></li>
            <li><a href="#borders">Line hierarchy</a></li>
            <li><a href="#regions">Region colors</a></li>
            <li><a href="#button">Button</a></li>
            <li><a href="#input">Input</a></li>
            <li><a href="#card">Card</a></li>
            <li><a href="#tag">Tag</a></li>
            <li><a href="#toolbar">Toolbar</a></li>
            <li><a href="#modal">Modal</a></li>
            <li><a href="#tooltip">Tooltip</a></li>
            <li><a href="#motif">Motif</a></li>
            <li><a href="#statusdot">StatusDot</a></li>
            <li><a href="#gridrule">GridRule</a></li>
            <li><a href="#tabs">Tabs</a></li>
            <li><a href="#datatable">DataTable</a></li>
            <li><a href="#topbar">TopBar</a></li>
          </ul>
        </aside>

        <article className="design__content">
          {/* ── Manifesto ─────────────────────────────── */}
          <section id="manifesto" className="section">
            <p className="section__eyebrow">manifesto</p>
            <h1 className="section__h1">
              One pixel <span className="accent-red">defines</span>.
            </h1>
            <ul className="manifesto">
              <li>Warm paper, surgical red, ink structure.</li>
              <li>1px lines replace shadows. Shadows are prohibited.</li>
              <li>Every corner is sharp. Zero radius.</li>
              <li>Space Grotesk speaks, Inter works, JetBrains Mono counts.</li>
              <li>150ms ease-out. The page is printed, not animated.</li>
            </ul>
          </section>

          {/* ── Color ─────────────────────────────── */}
          <section id="color" className="section">
            <p className="section__eyebrow">01 · color</p>
            <h2 className="section__h2">Warm paper foundation.</h2>
            <p className="section__lede">
              Full palette per DESIGN.md. Red is surgical — priority interactions,
              active focus, errors. White (#ffffff) is reserved for documents,
              canvas and floating layers.
            </p>
            {PALETTE_GROUPS.map(([group, keys]) => (
              <div key={group} className="palette-group">
                <p className="palette-group__label">{group}</p>
                <div className="palette">
                  {keys.map((k) => (
                    <div key={k} className="palette__chip">
                      <div className="palette__swatch" style={{ background: palette[k] }} />
                      <div className="palette__meta">
                        <code className="palette__name">{k}</code>
                        <code className="palette__hex">{palette[k]}</code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>

          {/* ── Legacy token map ─────────────────────────────── */}
          <section id="legacy" className="section">
            <p className="section__eyebrow">01b · legacy tokens</p>
            <h2 className="section__h2">Six names, remapped.</h2>
            <p className="section__lede">
              The Bauhaus six keep their names (region colours + persisted user
              settings + canvas-engine reads depend on them). Values now resolve
              into the palette above.
            </p>
            <div className="legacy">
              {LEGACY_MAP.map(([name, target, note]) => (
                <div key={name} className="legacy__row">
                  <code className="legacy__name">{name}</code>
                  <span className="legacy__swatch" style={{ background: `var(${name})` }} />
                  <span className="legacy__swatch" style={{ background: palette[target] }} />
                  <code className="legacy__target">→ {target}</code>
                  <span className="legacy__note">{note}</span>
                </div>
              ))}
            </div>
          </section>

          {/* ── Typography ─────────────────────────────── */}
          <section id="typography" className="section">
            <p className="section__eyebrow">02 · typography</p>
            <h2 className="section__h2">Editorial cadence.</h2>
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
                <p className="type__mono">swiss editorial · v0.2.0 · 150ms ease-out</p>
              </div>
              <div className="type__scale">
                {Object.entries(tokens.fontSize).map(([k, v]) => (
                  <div key={k} className="type__scale-row">
                    <code className="type__role">{k}</code>
                    <code className="type__size">{v}</code>
                    <span className="type__sample" style={{ fontSize: v }}>
                      Editorial
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* ── Grid & spacing ─────────────────────────────── */}
          <section id="space" className="section">
            <p className="section__eyebrow">03 · grid &amp; spacing</p>
            <h2 className="section__h2">8px rhythm, fixed editorial grid.</h2>
            <div className="editorial-grid">
              {(Object.entries(tokens.editorial) as Array<[string, string]>).map(([k, v]) => (
                <div key={k} className="editorial-grid__cell">
                  <code className="editorial-grid__key">{k}</code>
                  <code className="editorial-grid__val">{v}</code>
                </div>
              ))}
            </div>
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

          {/* ── Line hierarchy ─────────────────────────────── */}
          <section id="borders" className="section">
            <p className="section__eyebrow">04 · line hierarchy</p>
            <h2 className="section__h2">Structure by the line.</h2>
            <div className="borders">
              <div className="borders__cell">
                <div className="borders__sample borders__sample--hairline" />
                <code>hairline · 1px ink</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--muted" />
                <code>muted · 1px #dbdad7</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--thick" />
                <code>thick · 2px ink</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--flat" />
                <code>shadow · none(禁)</code>
              </div>
              <div className="borders__cell">
                <div className="borders__sample borders__sample--dot">
                  <StatusDot /> <span>live</span>
                </div>
                <code>radius · 0(唯一圆=6px 点)</code>
              </div>
            </div>
          </section>

          {/* ── Regions ─────────────────────────────── */}
          <section id="regions" className="section">
            <p className="section__eyebrow">05 · region colors</p>
            <h2 className="section__h2">Function, 2px wide.</h2>
            <p className="section__lede">
              Each functional region carries one token behind a 2px vertical
              line. Users may remap, but no new tokens.
            </p>
            <div className="regions">
              {Object.entries(defaultRegionColor).map(([region, color]) => (
                <Toolbar key={region} region={region as 'capture' | 'inbox' | 'canvas' | 'archive' | 'system'}>
                  <span className="regions__label">{region}</span>
                  <span className="regions__token">→ {color}</span>
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
              <p className="hint">Hover inverts (paper↔ink). Active fills red. 48px row height.</p>
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
              <p className="hint">1px muted underline; focus turns it ink. Label = ui-label-caps.</p>
            </Card>
          </section>

          <section id="card" className="section">
            <p className="section__eyebrow">component · card</p>
            <h2 className="section__h2">Card</h2>
            <div className="grid-2">
              <Card heading="A bold idea">
                Paper field, 1px muted border, tiled against the grid lines.
              </Card>
              <Card heading="Quiet reference">
                Body uses on-surface-variant for hierarchy. No shadow, ever.
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
                <Toolbar region="capture"><span>Capture · ⌘/Ctrl+Shift+E</span></Toolbar>
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
              <p className="hint">Hover or focus the button. Inverse layer, metadata size.</p>
            </Card>
          </section>

          <section id="motif" className="section">
            <p className="section__eyebrow">component · motif</p>
            <h2 className="section__h2">Editorial motif</h2>
            <div className="motifs">
              <div><EditorialMotif variant="mark" /><p className="section__eyebrow">mark · 品牌记号(默认)</p></div>
              <div><EditorialMotif variant="grid" size={96} /><p className="section__eyebrow">grid · 结构网格</p></div>
              <div><EditorialMotif variant="rule" size={120} /><p className="section__eyebrow">rule · 编辑基线</p></div>
              <div><BauhausMotif variant="still" size={96} /><p className="section__eyebrow">bauhaus · 弃用别名</p></div>
            </div>
          </section>

          <section id="statusdot" className="section">
            <p className="section__eyebrow">component · status dot</p>
            <h2 className="section__h2">StatusDot</h2>
            <Card>
              <div className="row">
                <span className="dotline"><StatusDot /> unsaved changes</span>
                <span className="dotline"><StatusDot tone="secondary" /> synced</span>
              </div>
              <p className="hint">6px solid dot — the only circle in the system.</p>
            </Card>
          </section>

          <section id="gridrule" className="section">
            <p className="section__eyebrow">component · grid rule</p>
            <h2 className="section__h2">GridRule</h2>
            <Card>
              <div className="rules-demo">
                <p className="section__lede">Horizontal rule</p>
                <GridRule />
                <p className="section__lede">Vertical rule (in a flex row)</p>
                <div className="rules-demo__v">
                  <span>paper</span>
                  <GridRule direction="v" />
                  <span>ink</span>
                </div>
              </div>
            </Card>
          </section>
          <section id="tabs" className="section">
            <p className="section__eyebrow">component · tabs</p>
            <h2 className="section__h2">Tabs</h2>
            <Card>
              <TabsDemo />
              <p className="hint">48px row · uppercase display · active = 2px surgical-red underline · arrow keys.</p>
            </Card>
          </section>

          <section id="datatable" className="section">
            <p className="section__eyebrow">component · data table</p>
            <h2 className="section__h2">DataTable</h2>
            <Card>
              <DataTable
                ariaLabel="示例数据表"
                rows={[
                  { id: 'a', name: 'SEP:Plato', kind: 'link', updated: '08-24' },
                  { id: 'b', name: '先秦诸子系年', kind: 'quote', updated: '08-22' },
                  { id: 'c', name: '时间轴对照脚本', kind: 'code', updated: '08-19' },
                ]}
                rowKey={(r) => r.id}
                columns={DATA_TABLE_COLUMNS}
              />
              <p className="hint">48px rows · 1px dividers · uppercase headers · hover = surface-white tint.</p>
            </Card>
          </section>

          <section id="topbar" className="section">
            <p className="section__eyebrow">component · top bar</p>
            <h2 className="section__h2">TopBar</h2>
            <Card>
              <TopBar
                crumb="cy's stift"
                title="Inbox"
                actions={<Tag color="red">3</Tag>}
              />
              <p className="hint">64px height · 1px bottom line · crumb + view title + global actions · text over icons.</p>
            </Card>
          </section>
        </article>
      </div>

      <style>{styles}</style>
    </main>
  )
}

const DATA_TABLE_COLUMNS: Array<DataTableColumn<{ id: string; name: string; kind: string; updated: string }>> = [
  { key: 'name', header: 'Title', render: (r) => r.name },
  { key: 'kind', header: 'Type', render: (r) => r.kind, width: '90px' },
  { key: 'updated', header: 'Updated', render: (r) => r.updated, width: '110px', align: 'right' },
]

function ModalExample() {
  // Static showcase. The real <Modal> is a client component (focus trap
  // needs useEffect); a server showcase page can't pass a function onClose,
  // so we render a visual mockup. Interactivity is verified on /inbox etc.
  return (
    <div className="stack">
      <p className="hint">Modal: scrim 40% ink, surface-white frame, 1px ink border, no shadow.</p>
      <div style={{ position: 'relative', height: '180px', border: 'var(--border-muted)' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'var(--color-scrim)', display: 'grid', placeItems: 'center', padding: 'var(--space-4)' }}>
          <div style={{ background: 'var(--color-surface-white)', border: 'var(--border-hairline)', padding: 'var(--space-4)', width: '320px' }}>
            <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', fontWeight: 500 }}>Example modal</h3>
            <p style={{ margin: 'var(--space-2) 0 0', color: 'var(--color-on-surface-variant)' }}>Sharp corners. The line is the frame.</p>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles = `
.design { min-height: 100vh; background: var(--color-surface); color: var(--color-on-surface); }
.design__crumb { font-family: var(--font-display); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.05em; }
.design__crumb-spacer { flex: 1; }
.design__grid { display: grid; grid-template-columns: 200px 1fr; max-width: 1280px; margin: 0 auto; padding: var(--space-6) var(--space-4); gap: var(--space-6); }
.design__nav { position: sticky; top: var(--space-4); align-self: start; }
.design__nav-title { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-secondary); margin: 0 0 var(--space-2); padding-bottom: var(--space-1); border-bottom: var(--border-muted); }
.design__nav ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: var(--space-1); }
.design__nav a { color: var(--color-on-surface-variant); text-decoration: none; font-family: var(--font-body); font-size: var(--font-size-sm); display: block; padding: var(--space-0, 0) var(--space-1); border-left: 2px solid transparent; }
.design__nav a:hover { border-left-color: var(--color-accent); color: var(--color-on-surface); }
.design__content { display: flex; flex-direction: column; gap: var(--space-8); }
.section { display: flex; flex-direction: column; gap: var(--space-3); scroll-margin-top: var(--space-4); }
.section__eyebrow { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-secondary); margin: 0; }
.section__h1 { font-family: var(--font-display); font-size: var(--font-size-4xl); margin: 0; line-height: 1.1; letter-spacing: -0.03em; font-weight: 500; }
.section__h2 { font-family: var(--font-display); font-size: var(--font-size-2xl); margin: 0; font-weight: 500; letter-spacing: -0.02em; }
.section__lede { color: var(--color-on-surface-variant); margin: 0; }
.accent-red { color: var(--color-primary); }
.manifesto { list-style: none; padding: 0; margin: var(--space-3) 0 0; display: flex; flex-direction: column; gap: var(--space-1); font-family: var(--font-display); font-size: var(--font-size-xl); }
.palette-group { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-3); }
.palette-group__label { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-secondary); margin: 0; }
.palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: var(--space-2); }
.palette__chip { border: var(--border-muted); background: var(--color-surface-white); display: flex; flex-direction: column; }
.palette__swatch { height: 48px; border-bottom: var(--border-muted); }
.palette__meta { display: flex; flex-direction: column; padding: var(--space-0, 0) var(--space-1); font-family: var(--font-mono); font-size: var(--font-size-2xs); }
.palette__name { color: var(--color-on-surface); }
.palette__hex { color: var(--color-secondary); }
.legacy { display: flex; flex-direction: column; border: var(--border-muted); margin-top: var(--space-2); }
.legacy__row { display: grid; grid-template-columns: 130px 24px 24px 130px 1fr; align-items: center; gap: var(--space-2); padding: var(--space-1) var(--space-2); border-bottom: var(--border-muted); }
.legacy__row:last-child { border-bottom: none; }
.legacy__name { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-on-surface); }
.legacy__swatch { width: 24px; height: 24px; border: var(--border-muted); }
.legacy__target { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-secondary); }
.legacy__note { font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-on-surface-variant); }
.type { display: flex; flex-direction: column; gap: var(--space-4); margin-top: var(--space-2); }
.type__row { display: grid; grid-template-columns: 80px 1fr; align-items: baseline; gap: var(--space-3); }
.type__role { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-secondary); }
.type__display { font-family: var(--font-display); font-size: var(--font-size-3xl); margin: 0; letter-spacing: -0.02em; }
.type__body { font-family: var(--font-body); font-size: var(--font-size-base); margin: 0; }
.type__mono { font-family: var(--font-mono); font-size: var(--font-size-sm); margin: 0; }
.type__scale { display: flex; flex-direction: column; gap: var(--space-1); border-top: var(--border-muted); padding-top: var(--space-3); }
.type__scale-row { display: grid; grid-template-columns: 60px 60px 1fr; align-items: baseline; gap: var(--space-3); }
.type__size { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-secondary); }
.type__sample { font-family: var(--font-display); color: var(--color-on-surface); }
.editorial-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--space-2); margin-top: var(--space-2); }
.editorial-grid__cell { border: var(--border-muted); padding: var(--space-2); display: flex; flex-direction: column; gap: var(--space-quarter); }
.editorial-grid__key { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-on-surface); }
.editorial-grid__val { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-secondary); }
.space { display: flex; flex-direction: column; gap: var(--space-1); margin-top: var(--space-3); }
.space__row { display: grid; grid-template-columns: 60px 60px 1fr; align-items: center; gap: var(--space-3); }
.space__key { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; color: var(--color-secondary); }
.space__val { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-on-surface-variant); }
.space__bar { height: 16px; background: var(--color-primary); max-width: 100%; }
.borders { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: var(--space-3); margin-top: var(--space-2); }
.borders__cell { display: flex; flex-direction: column; gap: var(--space-1); align-items: flex-start; }
.borders__sample { width: 100%; height: 80px; background: var(--color-surface-white); display: flex; align-items: center; justify-content: center; gap: var(--space-1); font-family: var(--font-display); font-size: var(--font-size-sm); color: var(--color-on-surface); }
.borders__sample--hairline { border: var(--border-hairline); }
.borders__sample--muted { border: var(--border-muted); }
.borders__sample--thick { border: var(--border-thick); }
.borders__sample--flat { border: var(--border-muted); }
.borders__sample--dot { border: var(--border-muted); }
.borders__cell code { font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-secondary); }
.regions { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-2); border: var(--border-muted); }
.regions__label { font-family: var(--font-display); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-secondary); }
.regions__token { margin-left: auto; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-on-surface-variant); }
.motifs { display: flex; flex-wrap: wrap; gap: var(--space-4); align-items: flex-end; }
.dotline { display: inline-flex; align-items: center; gap: var(--space-1); font-family: var(--font-body); font-size: var(--font-size-sm); color: var(--color-on-surface); }
.rules-demo { display: flex; flex-direction: column; gap: var(--space-2); }
.rules-demo__v { display: flex; align-items: stretch; gap: var(--space-2); font-family: var(--font-display); font-size: var(--font-size-sm); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-on-surface-variant); }
.row { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
.stack { display: flex; flex-direction: column; gap: var(--space-3); }
.grid-2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: var(--space-3); }
.hint { color: var(--color-secondary); font-family: var(--font-mono); font-size: var(--font-size-xs); margin: 0; }

@media (max-width: 768px) {
  .design__grid { grid-template-columns: 1fr; }
  .design__nav { position: static; }
  .legacy__row { grid-template-columns: 110px 20px 20px 1fr; }
  .legacy__note { display: none; }
  .legacy__target { grid-column: span 2; }
}
`
