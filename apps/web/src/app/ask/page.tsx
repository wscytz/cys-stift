'use client'

/**
 * /ask — AI agent 对话页(全局知识库问答 + 改画布 agent)。
 *
 * Claude Code 式:对话提需求 → AI 回答(引用卡片)/ 提议改画布(cys-dsl 块)→
 * 确认门 review → 应用/拒绝。
 *
 * 三类能力(AGENT_SYSTEM_PROMPT 教 AI 分诊):
 *  - 查知识:RAG 预注入相关卡 → AI 回答 + [card #id] 引用(可点开)
 *  - 改画布:AI 输出 ```cys-dsl 块 → AgentConfirmCard 确认门
 *  - 建卡:cys-dsl create 指令 → 同确认门
 *
 * 多轮:维护 messages 历史(超 20 条截断老消息)。流式 onDelta 增量渲染。
 * 未配 AI → AiSetupCard 引导(不静默不可用)。
 *
 * R2:RAG 走 serializeCardsForAI allowlist(buildAgentUserPrompt 内);DSL 不含
 * 卡片正文;软删卡过滤。和现有 AI 排版同等安全。
 */
import { useState, useRef, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { BauhausMotif, Card as UICard, Tag, Toolbar, Button } from '@cys-stift/ui'
import type { Card, CardId, CanvasId } from '@cys-stift/domain'
import { useDb } from '@/lib/db-client'
import { useCanvases } from '@/lib/canvas-store'
import { useI18n } from '@/lib/i18n'
import { PageLoading } from '@/components/page-loading'
import { DEFAULT_CANVAS_ID } from '@/features/canvas/default-canvas'
import { CardDetailModal } from '@/features/card/card-detail'
import { AiSetupCard } from '@/features/ai/ai-setup-card'
import { isAIReady, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { streamText } from '@/features/ai/stream-text'
import { retryUntilValid, buildDslCorrection } from '@/features/ai/retry-until-valid'
import { parseDslWithDiagnostics } from '@/features/ai/dsl-parser'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import {
  AGENT_SYSTEM_PROMPT,
  buildAgentUserPrompt,
  extractDslBlocks,
  extractCardRefs,
} from '@/features/ai/agent-prompt'
import { AgentConfirmCard } from '@/features/ai/agent-confirm-card'
import { loadConversation, saveConversation, clearConversation, type PersistedConversationMessage } from '@/lib/conversation-store'
import { buildCanvasHostForCanvas } from '@/features/canvas/canvas-host-builder'
import { pushToast } from '@/lib/toast-store'
import { addSample, genSampleId } from '@/features/ai/sample-store'
import { settingsStore } from '@/lib/settings-store'

interface ChatMessage extends PersistedConversationMessage {
  /** 捕获样本用:该 assistant 消息对应的 userPrompt(RAG+snapshot) + question。send 时存。 */
  sampleContext?: { question: string; context: string }
}

const MAX_HISTORY = 20

export default function AskPage() {
  const { t } = useI18n()
  const router = useRouter()
  const { service, ready } = useDb()
  const { snapshot: canvasesSnap } = useCanvases()
  // 对话按 targetCanvasId 隔离 —— 每个画布有自己的上下文(per-canvas localStorage key)。
  // targetCanvasId 先声明:messages 的 lazy init 引用它作为 conversation key。
  const [targetCanvasId, setTargetCanvasId] = useState<CanvasId>(DEFAULT_CANVAS_ID)
  // 初始从 localStorage 读取;切画布时 reload(见下方 effect)。lazy init 只跑一次。
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(targetCanvasId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const aiReady = isAIReady(getCurrentAI())
  const canvasNameById = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of canvasesSnap.canvases) m.set(c.id, c.name)
    return m
  }, [canvasesSnap.canvases])

  // 自动滚到底(新消息/流式更新时)。
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  // 切画布时 reload 对话(per-canvas key 隔离)。
  // 用 ref 跳过首次运行(lazy init 已在 useState 里加载了,避免 mount 双载)。
  // 同时 abort 任何在飞的 stream —— 切画布后旧 stream 属于旧画布,不应写入新画布的 messages
  // (abort 后 send 的 catch 会看到新 messages 列表,但 loadConversation 清了 streaming flag,
  // 所以 catch 的 if-last-streaming 分支不命中,no-op)。
  const skipReloadRef = useRef(true)
  useEffect(() => {
    if (skipReloadRef.current) {
      skipReloadRef.current = false
      return
    }
    abortRef.current?.abort()
    setMessages(loadConversation(targetCanvasId))
  }, [targetCanvasId])

  // 历史持久化:debounce ~400ms 写入,避免每个流式 token 都打 localStorage。
  // 镜像 companion-chat.tsx 的 setTimeout + ref 单飞范式。卸载时 flush 最后一次。
  // 写入按当前 targetCanvasId 隔离(切画布后新 messages 自动归新画布 key)。
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    if (saveTimerRef.current) return // 已有 pending 写入,等它跑(覆盖最新 messages)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      saveConversation(targetCanvasId, messagesRef.current)
    }, 400)
  }, [messages, targetCanvasId])
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        saveConversation(targetCanvasId, messagesRef.current) // flush 最后一次
      }
    }
  }, [targetCanvasId])

  const send = async () => {
    const question = input.trim()
    if (!question || busy || !aiReady) return
    const cfg = getCurrentAI()!
    setInput('')
    setBusy(true)

    // 截断老消息(超 MAX_HISTORY 丢最早,保 system 逻辑在 streamText 外拼)。
    const history = messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const userMsg: ChatMessage = { role: 'user', content: question }
    const asstMsg: ChatMessage = { role: 'assistant', content: '', streaming: true }
    setMessages((prev) => [...prev, userMsg, asstMsg])

    const ac = new AbortController()
    abortRef.current = ac
    try {
      // RAG + 目标画布快照(改画布时让 AI 看到当前布局)。
      const allCards = service.listAll()
      const { host } = await buildCanvasHostForCanvas(targetCanvasId, service)
      const canvasSnapshot = formatCanvasSnapshot(snapshotCanvas(host, service, targetCanvasId))
      const userPrompt = buildAgentUserPrompt(question, allCards, canvasSnapshot)

      let acc = ''
      const r = await retryUntilValid({
        initialMessages: history.length > 0
          ? [...history, { role: 'user' as const, content: userPrompt }]
          : [{ role: 'user' as const, content: userPrompt }],
        produce: (messages, attempt) => {
          if (attempt > 0) {
            // 重试:清 acc,显「重新生成中…」占位;onDelta 静默(不流中间版)。
            acc = ''
            setMessages((prev) => {
              const next = [...prev]
              next[next.length - 1] = { ...next[next.length - 1]!, content: t('ask.retrying'), streaming: true }
              return next
            })
          }
          const onDelta =
            attempt === 0
              ? (chunk: string) => {
                  acc += chunk
                  setMessages((prev) => {
                    const next = [...prev]
                    next[next.length - 1] = { ...next[next.length - 1]!, content: acc, streaming: true }
                    return next
                  })
                }
              : () => {}
          // structuredOutput:对 DeepSeek 等思考端点关思考。实测思考模式下 DSL
          // 格式不稳定(reuse #id 而非 [card #id])+ 慢 3-7x;关思考后 DSL 稳定。
          // agent 主要任务是改画布(结构化输出),问答够用即可,取舍值得。非思考端点 no-op。
          // user 字段类型必填(provider 在有 messages 时忽略 user,但 AIRequest 类型需要)。
          return streamText(
            cfg,
            { system: AGENT_SYSTEM_PROMPT, user: userPrompt, messages, maxTokens: 4096, structuredOutput: true, timeoutMs: 60_000 },
            onDelta,
            ac.signal,
          ).then((x) => x?.content ?? '')
        },
        parse: (text) => {
          // 有 dsl 块且全坏才重试;无块(Q&A)或部分好 → 接受。
          const blocks = extractDslBlocks(text)
          if (blocks.length === 0) return { ok: true, errors: [] }
          const parsed = blocks.map((b) => parseDslWithDiagnostics(b))
          const allBad = parsed.every((p) => p.errors.length > 0 && p.ops.length === 0)
          return allBad
            ? { ok: false, errors: parsed.flatMap((p) => p.errors) }
            : { ok: true, errors: [] }
        },
        buildCorrection: buildDslCorrection,
      })
      const final = r.text
      const dslBlocks = extractDslBlocks(final)
      // Q&A 捕获:无 DSL 块 = 纯问答,记 qa 样本。开关关时 addSample 内部 no-op。
      if (dslBlocks.length === 0) {
        addSample(
          { id: genSampleId(), ts: Date.now(), kind: 'qa', source: 'ask', question, context: userPrompt, aiOutput: final, outcome: 'answered', targetCanvasId },
          settingsStore.get().aiSampleCapture,
        )
      }
      setMessages((prev) => {
        const next = [...prev]
        next[next.length - 1] = { role: 'assistant', content: final, dslBlocks, streaming: false, sampleContext: { question, context: userPrompt } }
        return next
      })
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        pushToast({ kind: 'info', message: t('ai.error', { error: 'cancelled' }) })
      } else {
        pushToast({ kind: 'error', message: t('ai.error', { error: (e as Error).message }) })
      }
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant' && last.streaming) {
          next[next.length - 1] = { ...last, content: last.content || t('ai.error', { error: (e as Error).message }), streaming: false }
        }
        return next
      })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const onApplied = (msgIdx: number) => {
    // 应用后:在该条消息标记已应用(AgentConfirmCard 内部已切 applied 态)。
    // 同时刷新 service 快照(useDb 订阅会自动 re-render)。
    void msgIdx
  }
  const onRejected = async (msgIdx: number) => {
    // 拒绝:在被拒消息后插一条「换方案」给 AI 上下文(不截断后续对话 ——
    // 原 slice(0,msgIdx+1) 会丢这条之后的所有消息)。不自动 send(让用户决定续聊,
    // AgentConfirmCard 内部已显示已拒绝态)。
    const rejectMsg: ChatMessage = {
      role: 'user',
      content: `（我拒绝了上面的提议,请换一个方案。当前画布状态未变。）`,
    }
    setMessages((prev) => {
      const next = [...prev]
      next.splice(msgIdx + 1, 0, rejectMsg)
      return next
    })
  }

  const handleClear = () => {
    const n = messages.length
    setMessages([])
    clearConversation(targetCanvasId)
    if (n > 0) pushToast({ kind: 'info', message: t('ask.cleared', { n: String(n) }) })
  }

  const liveDetail = detailCard ? (service.get(detailCard.id) ?? null) : null
  const effectiveDetail = liveDetail && !liveDetail.deletedAt ? liveDetail : null

  return (
    <main id="main" tabIndex={-1} className="page">
      <Toolbar region="system">
        <span className="crumb">{t('brand.name')}</span>
        <span className="crumb-sep">/</span>
        <h1 className="crumb crumb--here">{t('ask.crumb')}</h1>
        <span className="crumb-spacer" />
        {/* 目标画布下拉 */}
        <select
          className="ask__canvas-select"
          value={String(targetCanvasId)}
          onChange={(e) => setTargetCanvasId(e.target.value as CanvasId)}
          aria-label={t('ask.targetCanvas')}
        >
          {canvasesSnap.canvases.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {messages.length > 0 && (
          <Button variant="ghost" onClick={handleClear}>{t('ask.clear')}</Button>
        )}
      </Toolbar>

      <div className="page-content page-content--wide">
        {!ready ? (
          <PageLoading />
        ) : !aiReady ? (
          <UICard>
            <div className="empty">
              <BauhausMotif />
              <p className="eyebrow">{t('ask.crumb')}</p>
              <h2 className="display-title display-title--lg">{t('ask.title')}</h2>
              <p className="empty__lede">{t('ask.empty')}</p>
              <AiSetupCard onGoToSettings={() => router.push('/settings')} />
            </div>
          </UICard>
        ) : (
          <div className="ask">
            <div className="ask__thread" ref={scrollRef}>
              {messages.length === 0 && (
                <p className="ask__empty">{t('ask.empty')}</p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={`ask__msg ask__msg--${m.role}`}>
                  {m.role === 'assistant' && <span className="ask__role">✨ AI</span>}
                  {m.role === 'user' && <span className="ask__role">{t('brand.name')}</span>}
                  <MessageContent
                    content={m.content}
                    streaming={m.streaming}
                    dslBlocks={m.dslBlocks}
                    targetCanvasId={targetCanvasId}
                    service={service}
                    getCardTitle={(id) => service.get(id as CardId)?.title ?? id}
                    onCardRefClick={(id) => {
                      const c = service.get(id as CardId)
                      if (c && !c.deletedAt) setDetailCard(c)
                    }}
                    onApplied={() => onApplied(i)}
                    onRejected={() => { void onRejected(i) }}
                    sampleContext={m.sampleContext ? { source: 'ask', question: m.sampleContext.question, context: m.sampleContext.context, targetCanvasId } : undefined}
                  />
                </div>
              ))}
            </div>

            <div className="ask__input-row">
              <textarea
                className="ask__input"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    void send()
                  }
                }}
                placeholder={t('ask.placeholder')}
                rows={1}
                disabled={busy}
              />
              {busy ? (
                <Button variant="ghost" onClick={() => abortRef.current?.abort()}>
                  {t('ask.stop')}
                </Button>
              ) : (
                <Button variant="primary" onClick={() => void send()} disabled={!input.trim()}>
                  {t('ask.send')}
                </Button>
              )}
            </div>
          </div>
        )}

        <p className="footnote">
          <Link href="/" className="footnote__link">← {t('common.home')}</Link>
        </p>
      </div>

      {effectiveDetail && (
        <CardDetailModal
          card={effectiveDetail}
          actions={['archive', 'softDelete', 'sendToCanvas', 'pin']}
          onClose={() => setDetailCard(null)}
          getCardTitle={(id) => service.get(id as CardId)?.title}
          onJumpToCard={() => setDetailCard(null)}
          allCards={service.listAll()}
          canEditRelations={false}
          onSave={(patch) => {
            const updated = service.update(effectiveDetail.id, patch)
            if (updated) setDetailCard(updated)
            return updated != null
          }}
          onTogglePin={() => {
            const updated = service.update(effectiveDetail.id, { pinned: !effectiveDetail.pinned })
            if (updated) setDetailCard(updated)
          }}
          onConfirmDelete={() => {
            service.softDelete(effectiveDetail.id)
            setDetailCard(null)
          }}
        />
      )}

      <style>{styles}</style>
    </main>
  )
}

/** 渲染单条消息:Markdown-ish 文本 + [card #id] 可点链接 + DSL 块确认门。 */
function MessageContent({
  content,
  streaming,
  dslBlocks,
  targetCanvasId,
  service,
  getCardTitle,
  onCardRefClick,
  onApplied,
  onRejected,
  sampleContext,
}: {
  content: string
  streaming?: boolean
  dslBlocks?: string[]
  targetCanvasId: CanvasId
  service: ReturnType<typeof useDb>['service']
  getCardTitle: (id: string) => string
  onCardRefClick: (id: string) => void
  onApplied: () => void
  onRejected: () => void
  sampleContext?: { source: 'ask' | 'companion'; question?: string; context: string; targetCanvasId?: string }
}) {
  // 把 [card #id] 渲染成可点链接。简化:按引用分段。
  const refs = useMemo(() => new Set(extractCardRefs(content)), [content])
  const parts = useMemo(() => {
    const re = /\[card\s+#([a-zA-Z0-9_-]+)\]/gi
    const out: { text: string; cardId?: string }[] = []
    let last = 0
    let m: RegExpExecArray | null
    while ((m = re.exec(content)) !== null) {
      if (m.index > last) out.push({ text: content.slice(last, m.index) })
      out.push({ text: m[0], cardId: m[1] })
      last = m.index + m[0].length
    }
    if (last < content.length) out.push({ text: content.slice(last) })
    return out
  }, [content])

  return (
    <div className="ask__content">
      <p className="ask__text">
        {parts.map((p, i) =>
          p.cardId ? (
            <button
              key={i}
              type="button"
              className="ask__card-ref"
              onClick={() => onCardRefClick(p.cardId!)}
              title={getCardTitle(p.cardId!)}
            >
              {p.text}
            </button>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        {streaming && <span className="ask__cursor">▋</span>}
      </p>
      {refs.size === 0 && !dslBlocks?.length && !content && !streaming && (
        <span className="ask__empty-reply" />
      )}
      {dslBlocks?.map((dsl, i) => (
        <AgentConfirmCard
          key={i}
          dsl={dsl}
          targetCanvasId={targetCanvasId}
          service={service}
          onApplied={() => onApplied()}
          onRejected={() => onRejected()}
          sampleContext={sampleContext ? { source: 'ask', question: sampleContext.question, context: sampleContext.context, targetCanvasId } : undefined}
        />
      ))}
    </div>
  )
}

const styles = `
.ask { display: flex; flex-direction: column; gap: var(--space-3); }
.ask__thread { max-height: 60vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-3); padding: var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); background: var(--color-white); min-height: 200px; }
.ask__empty { color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-sm); margin: var(--space-3) auto; max-width: 50ch; text-align: center; line-height: 1.6; }
.ask__msg { display: flex; flex-direction: column; gap: var(--space-1); }
.ask__msg--user { align-self: flex-end; align-items: flex-end; max-width: 80%; }
.ask__msg--assistant { align-self: flex-start; max-width: 92%; }
.ask__role { font-family: var(--font-mono); font-size: var(--font-size-xs); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-gray); }
.ask__content { padding: var(--space-2); border-radius: var(--radius-sm); }
.ask__msg--user .ask__content { background: var(--color-black); color: var(--color-white); }
.ask__msg--assistant .ask__content { background: var(--color-gray-soft); }
.ask__text { margin: 0; font-family: var(--font-body); font-size: var(--font-size-sm); line-height: 1.6; white-space: pre-wrap; word-break: break-word; }
.ask__card-ref { display: inline; background: transparent; border: 0; padding: 0 2px; color: inherit; text-decoration: underline; text-underline-offset: 2px; cursor: pointer; font: inherit; }
.ask__msg--user .ask__card-ref { color: var(--color-yellow); }
.ask__msg--assistant .ask__card-ref { color: var(--color-blue); }
.ask__card-ref:hover { opacity: 0.7; }
.ask__cursor { animation: ask-blink 1s steps(2) infinite; }
@keyframes ask-blink { 50% { opacity: 0; } }
.ask__input-row { display: flex; gap: var(--space-2); align-items: flex-end; }
.ask__input { flex: 1 1 auto; font-family: var(--font-body); font-size: var(--font-size-sm); padding: var(--space-2); border: var(--border-hairline); border-radius: var(--radius-sm); resize: none; min-height: 44px; max-height: 200px; background: var(--color-white); color: var(--color-black); }
.ask__input:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
.ask__canvas-select { font-family: var(--font-mono); font-size: var(--font-size-xs); }
.empty { display: flex; flex-direction: column; align-items: flex-start; gap: var(--space-2); padding: var(--space-3) 0; }
`
