'use client'

/**
 * DSL Playground(dev-only;prod 下被 dev/layout.tsx 的 notFound() 门 404)。
 *
 * 左写 cys-dsl 文本 → 防抖 → parse + 在 scratch InMemoryCanvasHost 上 applyLayout →
 * 把元素集同步进 SelfBuiltAdapter(状态+渲染一体)→ 右侧画布出图 + 诊断面板。
 *
 * 它是 @cys-stift/dsl 的"真实第二消费者":纯 DSL/内存,无 CardService/无存储。
 * 卡片内容(title/body/type)经 onCardCreate/onCardUpdate 回调填进 cardInfoRef Map,
 * 渲染器 getCardInfo 读它。范式取自 dsl-dialog.tsx 的 preview(无持久化 apply)。
 *
 * 诚实限制:v8 内容字段(@tags/@links/@code/@quote)能 parse+apply+roundtrip,但
 * canvas 卡渲染不区分显示(CardInfo 只含 title/body/type/pinned)。@type 影响卡色;
 * 关系式布局、箭头三维签名、@compute 文本、@group 组色带正常可见。
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { SelfBuiltAdapter, InMemoryCanvasHost, unionBounds } from '@cys-stift/canvas-engine'
import type { CardInfo } from '@cys-stift/canvas-engine'
import { parseDslWithDiagnostics, DSL_GRAMMAR_REFERENCE, DSL_VERSION } from '@cys-stift/dsl'
import type { DslDiagnostic } from '@cys-stift/dsl'
import { applyLayout } from '@/features/canvas/apply-layout'
import type { ApplyResult, CardCreateParams, CardUpdateContent } from '@/features/canvas/apply-layout'
import { useDebouncedCallback } from '@/lib/use-debounced-callback'
import { DSL_PRESETS, DEFAULT_DSL } from '@/features/dsl-playground/presets'

const DEFAULT_CARD_INFO: CardInfo = { title: '', body: '', type: 'note', pinned: false }

export default function DslPlaygroundPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const adapterRef = useRef<SelfBuiltAdapter | null>(null)
  const cardInfoRef = useRef<Map<string, CardInfo>>(new Map())

  const [text, setText] = useState(DEFAULT_DSL)
  const [parseErrors, setParseErrors] = useState<DslDiagnostic[]>([])
  const [result, setResult] = useState<ApplyResult | null>(null)
  const [showGrammar, setShowGrammar] = useState(false)
  const [copied, setCopied] = useState(false)

  /** 核心:DSL 文本 → scratch host apply → 同步进渲染 adapter + 更新诊断。
   *  读 refs(adapter/cardInfo),无 props 依赖,可稳定 useCallback。 */
  const computeAndApply = useCallback((dsl: string) => {
    const adapter = adapterRef.current
    if (!adapter) return
    const { ops, errors } = parseDslWithDiagnostics(dsl)
    const info = new Map<string, CardInfo>()
    const scratch = new InMemoryCanvasHost()
    const onCardCreate = (p: CardCreateParams) => {
      info.set(p.cardId, {
        title: p.title ?? '',
        body: p.content ?? '',
        type: p.cardType ?? 'note',
        pinned: false,
      })
      return { ok: true as const }
    }
    const onCardUpdate = (p: CardUpdateContent) => {
      const prev = info.get(p.cardId) ?? DEFAULT_CARD_INFO
      info.set(p.cardId, {
        title: p.title ?? prev.title,
        body: p.content ?? prev.body,
        type: p.cardType ?? prev.type,
        pinned: prev.pinned,
      })
    }
    let res: ApplyResult
    try {
      // appliedHashes=undefined:每次全量 apply(不 dedupe);onCardCreate/onCardUpdate 填 Map。
      res = applyLayout(scratch, ops, undefined, onCardCreate, onCardUpdate)
    } catch (err) {
      // applyLayout/sanitize 契约永不抛,但守一下 playground 主循环不死。
      console.error('[dsl-playground] apply threw', err)
      setParseErrors(errors)
      setResult(null)
      return
    }
    cardInfoRef.current = info
    const els = scratch.getElements()
    // 单次 echo-suppressed 清空+bulk-upsert:无 undo 噪声,upsert 内部自动 scheduleRender。
    adapter.applyWithoutEcho(() => {
      for (const e of adapter.getElements()) adapter.remove(e.id)
      for (const e of els) adapter.upsert(e)
    })
    setParseErrors(errors)
    setResult(res)
  }, [])

  const runPreview = useDebouncedCallback((dsl: string) => computeAndApply(dsl), 150)

  // 挂载 adapter;首帧立即出图(不等防抖)。
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const adapter = new SelfBuiltAdapter(canvas, {
      getCardInfo: (id) => cardInfoRef.current.get(id) ?? null,
      cardMode: 'compact',
    })
    adapterRef.current = adapter
    computeAndApply(DEFAULT_DSL)
    return () => {
      adapter.detach()
      adapterRef.current = null
    }
  }, [computeAndApply])

  // 文本变 → 防抖预览。
  useEffect(() => {
    runPreview(text)
  }, [text, runPreview])

  const fitView = () => {
    const adapter = adapterRef.current
    const canvas = canvasRef.current
    if (!adapter || !canvas) return
    const els = adapter.getElements()
    // 关系式 arrow(from/to)几何是零 bbox,会污染 unionBounds 把原点 (0,0) 拉进并集 → 适配框偏大。只算有真实尺寸的元素。
    const sized = els.filter((e) => e.w > 0 && e.h > 0)
    const box = unionBounds(sized.map((e) => ({ x: e.x, y: e.y, w: e.w, h: e.h })))
    if (!box || box.w <= 0 || box.h <= 0) return
    const cssW = canvas.clientWidth
    const cssH = canvas.clientHeight
    if (cssW <= 0 || cssH <= 0) return
    const pad = 32
    const zoom = Math.max(0.1, Math.min(8, Math.min((cssW - pad * 2) / box.w, (cssH - pad * 2) / box.h)))
    const panX = -box.x * zoom + (cssW - box.w * zoom) / 2
    const panY = -box.y * zoom + (cssH - box.h * zoom) / 2
    adapter.setView({ panX, panY, zoom, gridMode: adapter.getView().gridMode })
  }

  const copyDsl = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // 剪贴板 API 在非安全上下文可能失败;静默(noop)。
    }
  }

  const loadPreset = (dsl: string) => {
    setText(dsl)
    // 立即出图一次(不等防抖),preset 切换手感即时。
    computeAndApply(dsl)
  }

  const skippedOps = result?.opResults.filter((r) => r.status !== 'applied') ?? []

  return (
    <div className="pg">
      <header className="pg-bar">
        <span className="pg-brand">
          DSL Playground <span className="pg-ver">v{DSL_VERSION}</span>
        </span>
        <span className="pg-presets">
          {DSL_PRESETS.map((p) => (
            <button key={p.id} className="pg-btn pg-btn--ghost" onClick={() => loadPreset(p.dsl)} title={p.hint}>
              {p.label}
            </button>
          ))}
        </span>
        <span className="pg-actions">
          <button className="pg-btn" onClick={fitView}>适配</button>
          <button className="pg-btn" onClick={copyDsl}>{copied ? '已复制' : '复制 DSL'}</button>
          <button className="pg-btn pg-btn--ghost" onClick={() => setShowGrammar((s) => !s)}>
            {showGrammar ? '隐藏语法' : '语法'}
          </button>
        </span>
      </header>

      <div className="pg-body">
        <section className="pg-editor">
          <textarea
            className="pg-textarea"
            aria-label="DSL 编辑器(cys-dsl 文本,每行一个元素)"
            value={text}
            onChange={(e) => setText(e.target.value)}
            spellCheck={false}
            autoComplete="off"
            placeholder="每行一个元素:[card #id create] @pos(x,y) @size(w,h) @color(red) @title(&quot;…&quot;)"
          />
          <Diagnostics errors={parseErrors} result={result} skippedOps={skippedOps} />
          <p className="pg-limit-note">ℹ v8 内容字段(@tags/@links/@code/@quote)能 parse + roundtrip,但卡面暂只显 title/content/type——写入后诊断面板会计数,画面无变化属正常。</p>
        </section>

        <section className="pg-canvas-wrap">
          <canvas ref={canvasRef} className="pg-canvas" role="img" aria-label="DSL 画布实时预览" />
          <p className="pg-canvas-hint">滚轮缩放 · 拖拽平移(DSL 改动保留视图)</p>
        </section>
      </div>

      {showGrammar && (
        <pre className="pg-grammar">{DSL_GRAMMAR_REFERENCE}</pre>
      )}

      <style>{styles}</style>
    </div>
  )
}

function Diagnostics({
  errors,
  result,
  skippedOps,
}: {
  errors: DslDiagnostic[]
  result: ApplyResult | null
  skippedOps: ApplyResult['opResults']
}) {
  const sanitizeCount = result?.sanitizeDiagnostics?.length ?? 0
  const hasIssues = errors.length > 0 || sanitizeCount > 0 || !!(result && (result.skipped > 0 || result.failed > 0))
  return (
    <div className="pg-diag" aria-live="polite">
      {result && (
        <p className="pg-diag-sum">
          applied <b>{result.applied}</b> · skipped <b>{result.skipped}</b> · failed <b>{result.failed}</b>
          {result.sanitizeDiagnostics && result.sanitizeDiagnostics.length > 0 && (
            <span className="pg-diag-warn"> · sanitize 修正 {result.sanitizeDiagnostics.length}</span>
          )}
        </p>
      )}
      {!hasIssues && result && <p className="pg-diag-ok">✓ 全部 apply,无诊断</p>}
      {errors.length > 0 && (
        <ul className="pg-err-list">
          {errors.map((e, i) => (
            <li key={`p${i}`} className="pg-err">
              <span className="pg-err-line">L{e.line}</span>
              <span className="pg-err-msg">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
      {skippedOps.length > 0 && (
        <ul className="pg-err-list">
          {skippedOps.map((r, i) => (
            <li key={`s${i}`} className="pg-err pg-err--op">
              <span className="pg-err-line">[{r.status}]</span>
              <span className="pg-err-msg">{r.reason ?? '(无原因)'}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles = `
.pg { display:flex; flex-direction:column; height:100vh; width:100vw; background:var(--color-canvas); overflow:hidden; }
.pg-bar {
  display:flex; align-items:center; gap:var(--space-2); flex-wrap:wrap;
  padding:var(--space-1) var(--space-3); background:var(--color-black); color:var(--color-white);
  border-bottom:3px solid var(--color-red); flex:0 0 auto;
}
.pg-brand { font-family:var(--font-mono); font-size:var(--font-size-sm); font-weight:700; letter-spacing:.02em; }
.pg-ver { color:var(--color-yellow); font-size:var(--font-size-xs); margin-left:var(--space-1); }
.pg-presets { display:flex; gap:var(--space-1); flex-wrap:wrap; }
.pg-actions { margin-left:auto; display:flex; gap:var(--space-1); }
.pg-btn {
  font-family:var(--font-mono); font-size:var(--font-size-xs);
  padding:var(--space-quarter) var(--space-1); cursor:pointer;
  background:var(--color-white); color:var(--color-black);
  border:1px solid var(--color-white); border-radius:var(--radius-sm);
}
.pg-btn:hover { background:var(--color-gray-soft); }
.pg-btn:focus-visible { outline:2px solid var(--color-red); outline-offset:2px; }
.pg-btn:active { transform:scale(.95); }
.pg-btn--ghost { background:transparent; color:var(--color-white); border-color:var(--color-gray); }
.pg-btn--ghost:hover { background:var(--color-black-soft); }
.pg-body { flex:1 1 auto; display:flex; min-height:0; }
.pg-editor { flex:1 1 50%; display:flex; flex-direction:column; min-width:0; border-right:1px solid var(--color-gray-soft); }
.pg-textarea {
  flex:1 1 auto; min-height:0; resize:none;
  padding:var(--space-2) var(--space-3); border:0; outline:0;
  font-family:var(--font-mono); font-size:var(--font-size-sm); line-height:1.6;
  color:var(--color-black); background:var(--color-white);
}
.pg-textarea:focus { box-shadow:inset 0 0 0 2px var(--color-red); outline:none; }
.pg-canvas-wrap { flex:1 1 50%; position:relative; min-width:0; background:var(--color-canvas); }
.pg-canvas { width:100%; height:100%; display:block; touch-action:none; cursor:grab; }
.pg-canvas-hint {
  position:absolute; bottom:var(--space-1); left:var(--space-2);
  font-family:var(--font-mono); font-size:var(--font-size-xs); color:var(--color-gray);
  background:var(--color-white); padding:2px var(--space-1); border:var(--border-hairline); border-radius:var(--radius-sm);
  pointer-events:none;
}
.pg-diag { flex:0 0 auto; max-height:32vh; overflow-y:auto; padding:var(--space-1) var(--space-3); border-top:var(--border-hairline); background:var(--color-white-soft); }
.pg-diag-sum { margin:0 0 var(--space-1); font-family:var(--font-mono); font-size:var(--font-size-xs); color:var(--color-black-soft); }
.pg-diag-sum b { color:var(--color-black); }
.pg-diag-warn { color:var(--color-red); }
.pg-diag-ok { margin:0; font-family:var(--font-mono); font-size:var(--font-size-xs); color:var(--color-gray); }
.pg-limit-note { margin:var(--space-1) 0 0; padding:var(--space-1) var(--space-2); font-family:var(--font-mono); font-size:var(--font-size-xs); line-height:1.5; color:var(--color-black-soft); background:var(--color-yellow-soft); border-left:3px solid var(--color-yellow); border-radius:var(--radius-sm); }
.pg-err-list { list-style:none; margin:0; padding:0; }
.pg-err { display:flex; gap:var(--space-1); padding:1px 0; font-family:var(--font-mono); font-size:var(--font-size-xs); color:var(--color-black-soft); }
.pg-err-line { color:var(--color-red); flex:0 0 auto; min-width:64px; }
.pg-err--op .pg-err-line { color:var(--color-gray); }
.pg-err-msg { word-break:break-word; }
.pg-grammar {
  flex:0 0 auto; max-height:40vh; overflow:auto; margin:0; padding:var(--space-2) var(--space-3);
  background:var(--color-code-bg); color:var(--color-code-fg); border-top:3px solid var(--color-red);
  font-family:var(--font-mono); font-size:var(--font-size-xs); line-height:1.6; white-space:pre;
}
@media (max-width:880px) {
  .pg-body { flex-direction:column; }
  .pg-editor { border-right:0; border-bottom:1px solid var(--color-gray-soft); }
  .pg-actions { margin-left:0; }
}
`
