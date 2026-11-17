import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, ArrowUpRight, FileDown, Plus, Search, ShieldCheck, Undo2 } from 'lucide-react'
import { VERSION } from '@/lib/version'

export const metadata: Metadata = {
  title: "产品展示 — cy's Stift",
  description: 'cy\'s Stift 的工作流演示：捕获、收件箱、画布、搜索与工作台；本地优先，画布也能用文字编辑。',
}

const loopSteps = [
  { number: '01', title: '捕获', detail: '写下第一句，先不用分类', href: '/' },
  { number: '02', title: '收件箱', detail: '未放置的卡片先放在这里', href: '/inbox/' },
  { number: '03', title: '画布', detail: '把卡片摆开、连成关系、重新排列', href: '/canvas/' },
  { number: '04', title: '搜索', detail: '找到卡片内容，再决定下一步', href: '/search/' },
  { number: '05', title: '工作台', detail: '补全正文，整理成可用的笔记', href: '/workbench/' },
]

const canvasCards = [
  { className: 'showcase__node--red', label: '捕获', text: '研究线索' },
  { className: 'showcase__node--yellow', label: '关系', text: '换一个角度' },
  { className: 'showcase__node--blue', label: '结果', text: '下一步行动' },
]

export default function ShowcasePage() {
  return (
    <main id="main" tabIndex={-1} lang="zh-CN" className="showcase">
      <header className="showcase__header">
        <Link href="/" className="showcase__brand">cy's Stift</Link>
        <nav aria-label="展示导航" className="showcase__nav">
          <Link href="/canvas/">打开画布 <ArrowRight size={14} aria-hidden="true" /></Link>
          <Link href="/workbench/">打开工作台 <ArrowRight size={14} aria-hidden="true" /></Link>
          <Link href="/settings/">数据与恢复 <ArrowRight size={14} aria-hidden="true" /></Link>
        </nav>
      </header>

      <section className="showcase__intro" aria-labelledby="showcase-title">
        <p className="showcase__eyebrow">LOCAL-FIRST / INSPIRATION CANVAS</p>
        <h1 id="showcase-title">让想法留下，<span>让关系显形。</span></h1>
        <p className="showcase__lead">
          cy's Stift 把快速捕获、自由画布和可撤销的画布编辑放在同一条工作流里。数据默认只存本机；不启用 AI 就不会把内容发给模型服务。画布也能用文字编辑。
        </p>
        <div className="showcase__actions">
          <Link href="/inbox/" className="showcase__primary">开始捕获 <Plus size={17} aria-hidden="true" /></Link>
          <a href="https://github.com/wscytz/cys-stift/blob/main/docs/user/README.md" target="_blank" rel="noopener noreferrer" className="showcase__secondary">阅读用户指南 <ArrowUpRight size={17} aria-hidden="true" /><span className="sr-only">（在新标签页打开）</span></a>
        </div>
      </section>

      <section className="showcase__stage" aria-label="画布工作流示意">
        <div className="showcase__stage-head">
          <div>
            <p className="showcase__eyebrow">A CANVAS YOU CAN RETURN TO</p>
            <h2>从一条线索，到一个可继续工作的空间。</h2>
          </div>
          <span className="showcase__stage-status"><ShieldCheck size={15} aria-hidden="true" /> 本机保存</span>
        </div>
        <div className="showcase__board" role="img" aria-label="画布示意图：三张卡片「研究线索」「换一个角度」「下一步行动」依次相连；底部标注搜索、可撤销、可导出。">
          <span className="showcase__board-label">工作流示意 · 默认画布 · 3 个元素</span>
          <span className="showcase__connector showcase__connector--one" aria-hidden="true" />
          <span className="showcase__connector showcase__connector--two" aria-hidden="true" />
          {canvasCards.map((card) => (
            <div key={card.text} className={`showcase__node ${card.className}`}>
              <span>{card.label}</span>
              <strong>{card.text}</strong>
            </div>
          ))}
          <div className="showcase__board-tools">
            <span><Search size={14} aria-hidden="true" /> 搜索</span>
            <span><Undo2 size={14} aria-hidden="true" /> 可撤销</span>
            <span><FileDown size={14} aria-hidden="true" /> 可导出</span>
          </div>
        </div>
      </section>

      <section className="showcase__loop" aria-labelledby="showcase-loop-title">
        <div className="showcase__section-head">
          <p className="showcase__eyebrow">THE CORE LOOP</p>
          <h2 id="showcase-loop-title">五个动作，串起同一条思路。</h2>
        </div>
        <ol className="showcase__steps">
          {loopSteps.map((step) => (
            <li key={step.number}>
              <span className="showcase__step-number">{step.number}</span>
              <div>
                <Link href={step.href}>{step.title} <ArrowRight size={14} aria-hidden="true" /></Link>
                <p>{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="showcase__proof" aria-labelledby="showcase-proof-title">
        <div>
          <p className="showcase__eyebrow">文字也能编辑画布</p>
          <h2 id="showcase-proof-title">画布能读成文字，也能安全地改回去。</h2>
          <p>在画布工具栏打开「画布转义」，粘贴一段文字。系统先列出会新增、修改或删除哪些元素；你确认后才应用。编辑期间画布若有变化，这份提议会自动作废，不会覆盖你的新改动。</p>
          <Link href="/canvas/" className="showcase__proof-link">打开画布，试用「画布转义」 <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        <figure className="showcase__dsl">
          <figcaption>文字格式示例（DSL）</figcaption>
          <pre aria-label="DSL 示例"><code>{`[card #idea create] @pos(320, 160) @title("研究线索")
[card #next create] @pos(560, 260) @title("下一步行动")
[arrow #idea-next] from #idea to #next @label("next")`}</code></pre>
        </figure>
      </section>

      <footer className="showcase__footer">
        <span>cy's Stift / v{VERSION}</span>
        <span>开源 · 本地优先 · 数据随时可导出</span>
        <Link href="/settings/#settings-data">查看本机数据与隐私 <ArrowRight size={14} aria-hidden="true" /></Link>
      </footer>

      <style>{`
        .showcase { min-height: 100vh; background: var(--color-white); color: var(--color-black); }
        .showcase__header, .showcase__intro, .showcase__stage, .showcase__loop, .showcase__proof, .showcase__footer { width: min(1180px, calc(100% - 48px)); margin: 0 auto; }
        .showcase__header { min-height: 64px; display: flex; align-items: center; justify-content: space-between; border-bottom: var(--border-hairline); }
        .showcase__brand { min-height: 44px; display: inline-flex; align-items: center; color: var(--color-black); font-family: var(--font-display); font-size: var(--font-size-lg); text-decoration: none; }
        .showcase__nav { display: flex; gap: var(--space-3); align-items: center; font-family: var(--font-mono); font-size: var(--font-size-xs); }
        .showcase__nav a, .showcase__footer a { min-height: 44px; color: var(--color-black); text-decoration: none; display: inline-flex; align-items: center; gap: 4px; border-bottom: var(--border-hairline); }
        .showcase__nav a:hover, .showcase__footer a:hover { color: var(--color-red); }
        .showcase__intro { padding: clamp(56px, 9vw, 120px) 0 var(--space-8); }
        .showcase__eyebrow { margin: 0 0 var(--space-3); color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.12em; text-transform: uppercase; }
        .showcase h1, .showcase h2, .showcase p { margin-top: 0; }
        .showcase h1 { max-width: 820px; margin-bottom: var(--space-4); font-family: var(--font-display); font-size: clamp(2.8rem, 7vw, 6.5rem); font-weight: 500; line-height: 0.98; letter-spacing: 0; }
        .showcase h1 span { display: block; color: var(--color-red); }
        .showcase__lead { max-width: 640px; margin-bottom: var(--space-5); color: var(--color-black-soft); font-size: var(--font-size-lg); line-height: 1.6; }
        .showcase__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
        .showcase__primary, .showcase__secondary { min-height: 44px; display: inline-flex; align-items: center; gap: var(--space-1); padding: 0 var(--space-3); border: var(--border-hairline); text-decoration: none; font-family: var(--font-display); }
        .showcase__primary { background: var(--color-primary); color: var(--color-on-primary); border-color: var(--color-on-surface); }
        .showcase__secondary { color: var(--color-on-surface); }
        .showcase__primary:hover, .showcase__secondary:hover { background: var(--color-on-surface); color: var(--color-surface); border-color: var(--color-on-surface); }
        .showcase__primary:focus-visible, .showcase__secondary:focus-visible, .showcase__brand:focus-visible, .showcase__nav a:focus-visible, .showcase__footer a:focus-visible, .showcase__steps a:focus-visible, .showcase__proof-link:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
        .showcase__stage { padding: var(--space-5) 0 var(--space-8); }
        .showcase__stage-head { display: flex; justify-content: space-between; align-items: end; gap: var(--space-4); margin-bottom: var(--space-3); }
        .showcase h2 { font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: 500; line-height: 1.15; }
        .showcase__stage-status { display: inline-flex; align-items: center; gap: var(--space-1); padding: var(--space-1) var(--space-2); border: var(--border-hairline); font-family: var(--font-mono); font-size: var(--font-size-xs); white-space: nowrap; }
        .showcase__board { position: relative; min-height: 360px; overflow: hidden; border: var(--border-hairline); background: var(--color-surface-container); }
        .showcase__board-label { position: absolute; left: var(--space-3); top: var(--space-3); font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
        .showcase__node { position: absolute; width: 190px; min-height: 102px; display: flex; flex-direction: column; justify-content: space-between; gap: var(--space-2); padding: var(--space-3); border: var(--border-hairline); border-color: var(--color-on-surface); }
        .showcase__node span { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; }
        .showcase__node strong { font-family: var(--font-display); font-size: var(--font-size-lg); font-weight: 500; }
        .showcase__node--red { left: 12%; top: 31%; background: var(--color-red); color: var(--color-white); }
        .showcase__node--yellow { left: 42%; top: 15%; background: var(--color-yellow); color: var(--color-black); }
        .showcase__node--blue { left: min(68%, calc(100% - 206px)); top: 50%; background: var(--color-blue); color: var(--color-white); }
        .showcase__connector { position: absolute; height: 2px; background: var(--color-black); transform-origin: left center; }
        .showcase__connector--one { width: 250px; left: 29%; top: 42%; transform: rotate(-20deg); }
        .showcase__connector--two { width: 260px; left: 57%; top: 36%; transform: rotate(28deg); }
        .showcase__board-tools { position: absolute; left: var(--space-3); right: var(--space-3); bottom: var(--space-3); display: flex; justify-content: flex-end; gap: var(--space-2); font-family: var(--font-mono); font-size: var(--font-size-xs); }
        .showcase__board-tools span { display: inline-flex; align-items: center; gap: 4px; padding: 0; background: none; border: 0; color: var(--color-black-soft); }
        .showcase__loop { padding: var(--space-8) 0; border-top: var(--border-hairline); }
        .showcase__section-head { display: flex; justify-content: space-between; gap: var(--space-4); align-items: baseline; }
        .showcase__steps { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: var(--space-2); margin: 0; padding: 0; list-style: none; }
        .showcase__steps li { min-height: 156px; display: flex; flex-direction: column; justify-content: space-between; padding: var(--space-3); border-top: var(--border-hairline); }
        .showcase__step-number { color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); }
        .showcase__steps a { min-height: 44px; display: inline-flex; align-items: center; gap: 4px; color: var(--color-black); font-family: var(--font-display); font-size: var(--font-size-lg); text-decoration: none; }
        .showcase__steps p { margin: var(--space-1) 0 0; color: var(--color-gray); font-size: var(--font-size-sm); }
        .showcase__proof { display: grid; grid-template-columns: minmax(0, 1fr) minmax(320px, 0.9fr); gap: var(--space-8); align-items: center; padding: var(--space-8) 0; border-top: var(--border-hairline); }
        .showcase__proof > * { min-width: 0; }
        .showcase__proof p:not(.showcase__eyebrow) { max-width: 560px; color: var(--color-black-soft); line-height: 1.6; }
        .showcase__proof-link { min-height: 44px; display: inline-flex; align-items: center; gap: 4px; color: var(--color-black); font-family: var(--font-display); text-decoration: none; border-bottom: var(--border-hairline); }
        .showcase__proof-link:hover { color: var(--color-red); }
        .showcase__dsl { margin: 0; min-width: 0; }
        .showcase__dsl figcaption { margin-bottom: var(--space-2); color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); letter-spacing: 0.08em; }
        .showcase__proof pre { margin: 0; max-width: 100%; padding: var(--space-4); overflow-x: auto; background: var(--color-black); color: var(--color-white); border-left: 8px solid var(--color-red); font-family: var(--font-mono); font-size: var(--font-size-sm); line-height: 1.7; }
        .showcase__footer { display: flex; justify-content: space-between; gap: var(--space-3); padding: var(--space-4) 0 var(--space-6); border-top: var(--border-hairline); color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); }
        @media (max-width: 800px) { .showcase__header, .showcase__intro, .showcase__stage, .showcase__loop, .showcase__proof, .showcase__footer { width: min(100% - 32px, 640px); } .showcase__nav { gap: var(--space-2); } .showcase__nav a:nth-child(2) { display: none; } .showcase__stage-head, .showcase__section-head { display: block; } .showcase__stage-status { width: fit-content; margin-top: var(--space-2); } .showcase__steps { grid-template-columns: repeat(2, minmax(0, 1fr)); } .showcase__proof { grid-template-columns: 1fr; gap: var(--space-4); } }
        @media (max-width: 520px) { .showcase__nav a:nth-child(3) { display: none; } .showcase h1 { font-size: clamp(2.75rem, 12vw, 3.25rem); } .showcase__lead { font-size: var(--font-size-base); } .showcase__board { min-height: 340px; } .showcase__node { width: 132px; min-height: 88px; padding: var(--space-2); } .showcase__node strong { font-size: var(--font-size-base); } .showcase__node--red { left: 4%; top: 40%; } .showcase__node--yellow { left: 44%; top: 12%; } .showcase__node--blue { left: min(62%, calc(100% - 140px)); top: 60%; } .showcase__connector--one { width: 120px; } .showcase__connector--two { width: 120px; } .showcase__board-tools { left: var(--space-2); right: var(--space-2); gap: 4px; justify-content: flex-start; overflow-x: auto; } .showcase__steps { grid-template-columns: 1fr; } .showcase__steps li { min-height: 96px; } .showcase__footer { flex-direction: column; } }
      `}</style>
    </main>
  )
}
