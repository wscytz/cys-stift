'use client'

/**
 * CompanionChat — 画布伴侣「对话」tab。= /ask agent 上画布,live host。
 *
 * 复用 AGENT_SYSTEM_PROMPT/buildAgentUserPrompt/extractDslBlocks/extractCardRefs/
 * AgentConfirmCard/RAG/streamText。与 /ask 唯一架构差:
 *  - context 读 live host(snapshotCanvas(host))而非 temp host;
 *  - DSL 确认门传 liveHost={host},Apply 走 applyLayout(host) 单 undo(靠画布页 writeback 持久化)。
 *
 * 多轮:沿用 /ask 实际行为 —— 每轮发新问题 + 新鲜 RAG/snapshot;同时把最近
 * MAX_HISTORY 条对话作为 messages 发给 AI,让它有上下文(镜像 ask/page.tsx)。
 *
 * R2:沿用 /ask —— buildAgentUserPrompt 内 serializeCardsForAI allowlist(不含 deviceId/
 * apiKey/软删卡);snapshotCanvas 只几何/关系/shape 描述符。本组件不新增 AI 数据路径。
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useRouter } from 'next/navigation'
import { searchCards } from '@cys-stift/domain'
import type { Card, CanvasId, CardId, CardService } from '@cys-stift/domain'
import type { CanvasHost } from '@cys-stift/canvas-engine'
import { useI18n } from '@/lib/i18n'
import { pushToast } from '@/lib/toast-store'
import { isAIReady, getCurrentAI } from '@/features/ai/ai-settings-provider'
import { streamText } from '@/features/ai/stream-text'
import { retryFailureMessageKey, retryUntilValid, buildDslCorrection } from '@/features/ai/retry-until-valid'
import { parseDslStrictWithDiagnostics } from '@cys-stift/dsl'
import { AiSetupCard } from '@/features/ai/ai-setup-card'
import {
  AGENT_SYSTEM_PROMPT,
  buildAgentUserPrompt,
  extractDslBlocks,
  extractCardRefs,
  RAG_TOP_N,
} from '@/features/ai/agent-prompt'
import { snapshotCanvas, formatCanvasSnapshot } from '@/features/ai/canvas-snapshot'
import { AgentConfirmCard } from '@/features/ai/agent-confirm-card'
import { CardDetailModal } from '@/features/card/card-detail'
import { loadConversation, saveConversation, type PersistedConversationMessage, type ConversationContextMeta } from '@/lib/conversation-store'
import { addSample, genSampleId } from '@/features/ai/sample-store'
import { settingsStore } from '@/lib/settings-store'

interface ChatMessage extends PersistedConversationMessage {
  /** 捕获样本用:该 assistant 消息对应的 userPrompt(RAG+snapshot) + question。send 时存。 */
  sampleContext?: { question: string; context: string }
}

const MAX_HISTORY = 20

export function CompanionChat({
  host,
  service,
  canvasId,
  getCardTitle,
}: {
  host: CanvasHost
  service: CardService
  canvasId: CanvasId
  getCardTitle: (id: string) => string | undefined
}) {
  const { t } = useI18n()
  const router = useRouter()
  // 初始从 localStorage 读取(防重新载入 / crash 丢历史);per-canvas 隔离。
  // loadConversation 是 SSR-safe + try/catch,不会抛。lazy init 只跑一次。
  const [messages, setMessages] = useState<ChatMessage[]>(() => loadConversation(canvasId))
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [detailCard, setDetailCard] = useState<Card | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  // 历史持久化:debounce ~400ms 写入,避免每个流式 token 都打 localStorage。
  // 镜像 graph-canvas 的 writeView throttle 范式(setTimeout + ref 单飞)。
  // 卸载时若仍有 pending 写入,同步 flush 一次(防最后一条丢)。
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  useEffect(() => {
    if (saveTimerRef.current) return // 已有 pending 写入,等它跑(覆盖最新 messages)
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      saveConversation(canvasId, messagesRef.current)
    }, 400)
  }, [messages, canvasId])
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
        saveConversation(canvasId, messagesRef.current) // flush 最后一次
      }
    }
  }, [canvasId])

  const aiReady = isAIReady(getCurrentAI())

  const send = async () => {
    const question = input.trim()
    if (!question || busy || !aiReady) return
    const cfg = getCurrentAI()!
    setInput('')
    setBusy(true)

    // 截断老消息(超 MAX_HISTORY 丢最早);history 发给 AI 让它有上下文。
    const history = messages.slice(-MAX_HISTORY).map((m) => ({
      role: m.role,
      content: m.content,
    }))
    const allCards = service.listAll()
    const matchedCards = searchCards(allCards, question)
    const contextMeta: ConversationContextMeta = {
      retrievedCount: matchedCards.length,
      sentCount: Math.min(matchedCards.length, RAG_TOP_N),
      cardIds: matchedCards.slice(0, RAG_TOP_N).map((result) => String(result.card.id)),
    }
    const userMsg: ChatMessage = { role: 'user', content: question, targetCanvasId: String(canvasId) }
    const asstMsg: ChatMessage = { role: 'assistant', content: '', streaming: true, targetCanvasId: String(canvasId), contextMeta }
    setMessages((prev) => [...prev.slice(-MAX_HISTORY), userMsg, asstMsg])

    const ac = new AbortController()
    abortRef.current = ac
    try {
      // RAG + 当前画布 live snapshot(改画布时让 AI 看到当前布局,含未存改动)。
      const canvasSnapshot = formatCanvasSnapshot(snapshotCanvas(host, service, canvasId))
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
              const last = next[next.length - 1]
              if (last && last.role === 'assistant') {
                next[next.length - 1] = { ...last, content: t('ask.retrying'), streaming: true }
              }
              return next
            })
          }
          const onDelta =
            attempt === 0
              ? (chunk: string) => {
                  acc += chunk
                  setMessages((prev) => {
                    const next = [...prev]
                    const last = next[next.length - 1]
                    if (last && last.role === 'assistant') {
                      next[next.length - 1] = { ...last, content: acc, streaming: true }
                    }
                    return next
                  })
                }
              : () => {}
          // structuredOutput:对 DeepSeek 思考端点关思考(实测 DSL 稳定);非思考端点 no-op。
          // user 字段类型必填(provider 在有 messages 时忽略 user,但 AIRequest 类型需要)。
          return streamText(
            cfg,
            { system: AGENT_SYSTEM_PROMPT, user: userPrompt, messages, maxTokens: 4096, structuredOutput: true, timeoutMs: 60_000 },
            onDelta,
            ac.signal,
          )
        },
        parse: (text) => {
          // 有 dsl 块且全坏才重试;无块(Q&A)或部分好 → 接受。
          const blocks = extractDslBlocks(text)
          if (blocks.length === 0) return { ok: true, errors: [] }
          const parsed = blocks.map((b) => parseDslStrictWithDiagnostics(b))
          const allBad = parsed.every((p) => p.errors.length > 0 && p.ops.length === 0)
          return allBad
            ? { ok: false, errors: parsed.flatMap((p) => p.errors) }
            : { ok: true, errors: [] }
        },
        buildCorrection: buildDslCorrection,
      })
      const failureKey = retryFailureMessageKey(r.failureReason)
      if (failureKey) {
        const failureMessage = t(failureKey)
        pushToast({ kind: 'info', message: failureMessage })
        setMessages((prev) => {
          const next = [...prev]
          const last = next[next.length - 1]
          if (last?.role === 'assistant') {
            next[next.length - 1] = { ...last, content: failureMessage, streaming: false }
          }
          return next
        })
        return
      }
      // 失败样本采集(c2):retry 耗尽仍 parse 失败 → 记 parse_failed(坏输出+错误+尝试数)。
      // 失败案例是最值钱的调优/训练数据。开关关时 addSample 内部 no-op。
      if (!r.accepted) {
        addSample(
          { id: genSampleId(), ts: Date.now(), kind: 'dsl', source: 'companion', question, context: userPrompt, aiOutput: r.text, outcome: 'parse_failed', attempts: r.attempts, parseErrors: r.lastErrors, targetCanvasId: canvasId },
          settingsStore.get().aiSampleCapture,
        )
      }
      const final = r.text
      const dslBlocks = extractDslBlocks(final)
      // Q&A 捕获:无 DSL 块 = 纯问答,记 qa 样本。开关关时 addSample 内部 no-op。
      if (dslBlocks.length === 0) {
        addSample(
          { id: genSampleId(), ts: Date.now(), kind: 'qa', source: 'companion', question, context: userPrompt, aiOutput: final, outcome: 'answered', targetCanvasId: canvasId },
          settingsStore.get().aiSampleCapture,
        )
      }
      setMessages((prev) => {
        const next = [...prev]
        const last = next[next.length - 1]
        if (last && last.role === 'assistant') {
          next[next.length - 1] = { role: 'assistant', content: final, dslBlocks, streaming: false, targetCanvasId: String(canvasId), contextMeta, sampleContext: { question, context: userPrompt } }
        }
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
          next[next.length - 1] = {
            ...last,
            content: last.content || t('ai.error', { error: (e as Error).message }),
            streaming: false,
          }
        }
        return next
      })
    } finally {
      setBusy(false)
      abortRef.current = null
    }
  }

  const onRejected = (msgIdx: number) => {
    // 追加一条 user 消息「用户拒绝了,换方案」,让下一轮 AI 能看到反馈。
    // 不截断拒绝消息之后的对话，也不把占位文本偷偷塞回输入框。
    const rejectMsg: ChatMessage = {
      role: 'user',
      content: t('canvas.companion.chat.rejected'),
      targetCanvasId: String(canvasId),
    }
    setMessages((prev) => {
      const next = [...prev]
      next.splice(msgIdx + 1, 0, rejectMsg)
      return next
    })
  }

  const liveDetail = detailCard ? (service.get(detailCard.id) ?? null) : null
  const effectiveDetail = liveDetail && !liveDetail.deletedAt ? liveDetail : null

  if (!aiReady) {
    return <AiSetupCard onGoToSettings={() => router.push('/settings')} />
  }

  return (
    <div className="cc-chat" style={chatStyle}>
      <div className="cc-chat__thread" ref={scrollRef} role="log" aria-live="polite" aria-relevant="additions text" aria-label={t('canvas.companion.chat.threadLabel')}>
        {messages.length === 0 && (
          <p className="cc-chat__empty" style={emptyStyle}>{t('canvas.companion.chat.empty')}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`cc-chat__msg cc-chat__msg--${m.role}`} style={m.role === 'user' ? userMsgStyle : asstMsgStyle}>
            {m.role === 'assistant' && <span className="cc-chat__role" style={roleStyle}>{t('nav.ask')}</span>}
            {m.role === 'user' && <span className="cc-chat__role" style={roleStyle}>{t('brand.name')}</span>}
            <MessageContent
              content={m.content}
              streaming={m.streaming}
              dslBlocks={m.dslBlocks}
              contextMeta={m.contextMeta}
              canvasId={(m.targetCanvasId ?? String(canvasId)) as CanvasId}
              service={service}
              host={host}
              getCardTitle={getCardTitle}
              onCardRefClick={(id) => {
                const c = service.get(id as CardId)
                if (c && !c.deletedAt) setDetailCard(c)
              }}
              onApplied={() => { /* useDb 订阅自动 re-render;确认门内部已切 applied 态 */ }}
              onRejected={() => { void onRejected(i) }}
              sampleContext={m.sampleContext ? { source: 'companion', question: m.sampleContext.question, context: m.sampleContext.context, targetCanvasId: m.targetCanvasId ?? String(canvasId) } : undefined}
            />
          </div>
        ))}
      </div>

      <div className="cc-chat__input-row" style={inputRowStyle}>
        <input
          className="cc-chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={t('canvas.companion.chat.inputPlaceholder')}
          aria-label={t('canvas.companion.chat.inputPlaceholder')}
          disabled={busy}
          style={inputStyle}
        />
        <button
          type="button"
          className="cc-chat__send"
          onClick={() => void send()}
          disabled={busy || !input.trim()}
          style={sendStyle}
        >
          {busy ? t('ask.thinking') : t('canvas.companion.chat.send')}
        </button>
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
    </div>
  )
}

/** 渲染单条消息:文本 + [card #id] 可点引用按钮 + DSL 块确认门。
 *  引用切分镜像 ask/page.tsx MessageContent 的正则 /\[card\s+#([a-zA-Z0-9_-]+)\]/gi。 */
function MessageContent({
  content,
  streaming,
  dslBlocks,
  contextMeta,
  canvasId,
  service,
  host,
  getCardTitle,
  onCardRefClick,
  onApplied,
  onRejected,
  sampleContext,
}: {
  content: string
  streaming?: boolean
  dslBlocks?: string[]
  contextMeta?: ConversationContextMeta
  canvasId: CanvasId
  service: CardService
  host: CanvasHost
  getCardTitle: (id: string) => string | undefined
  onCardRefClick: (id: string) => void
  onApplied: () => void
  onRejected: () => void
  sampleContext?: { source: 'ask' | 'companion'; question?: string; context: string; targetCanvasId?: string }
}) {
  const { t } = useI18n()
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
    <div className="cc-chat__content" style={contentStyle}>
      <p className="cc-chat__text" style={textStyle}>
        {parts.map((p, i) =>
          p.cardId ? (
            <button
              key={i}
              type="button"
              className="cc-chat__card-ref"
              onClick={() => onCardRefClick(p.cardId!)}
              title={getCardTitle(p.cardId!)}
              style={cardRefStyle}
            >
              {p.text}
            </button>
          ) : (
            <span key={i}>{p.text}</span>
          ),
        )}
        {streaming && <span className="cc-chat__cursor" aria-hidden="true">▋</span>}
      </p>
      {refs.size === 0 && !dslBlocks?.length && !content && !streaming && (
        <span className="cc-chat__empty-reply" />
      )}
      {dslBlocks?.map((dsl, i) => (
        <AgentConfirmCard
          key={i}
          dsl={dsl}
          targetCanvasId={canvasId}
          service={service}
          liveHost={host}
          onApplied={() => onApplied()}
          onRejected={() => onRejected()}
          sampleContext={sampleContext ? { source: 'companion', question: sampleContext.question, context: sampleContext.context, targetCanvasId: canvasId } : undefined}
        />
      ))}
      {contextMeta && (
        <div className="cc-chat__context-meta" role="status">
          <span>{t('ask.contextMeta', { retrieved: String(contextMeta.retrievedCount), sent: String(contextMeta.sentCount) })}</span>
          {contextMeta.cardIds.map((id) => (
            <button key={id} type="button" className="cc-chat__context-source" onClick={() => onCardRefClick(id)} title={getCardTitle(id)}>
              #{getCardTitle(id)}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

const chatStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }
const threadStyle: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--space-1)',
  maxHeight: '50vh',
  overflowY: 'auto',
  minHeight: '120px',
  padding: 'var(--space-1)',
  border: 'var(--border-hairline)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white)',
}
const emptyStyle: CSSProperties = {
  margin: '0',
  padding: 'var(--space-2)',
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  color: 'var(--color-gray)',
  lineHeight: 1.6,
  textAlign: 'center',
}
const userMsgStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-end' }
const asstMsgStyle: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '2px', alignItems: 'flex-start' }
const roleStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)',
  fontSize: 'var(--font-size-xs)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: 'var(--color-gray)',
}
const contentStyle: CSSProperties = {
  padding: 'var(--space-1) var(--space-2)',
  borderRadius: 'var(--radius-sm)',
  maxWidth: '100%',
  wordBreak: 'break-word',
}
const textStyle: CSSProperties = {
  margin: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--font-size-xs)',
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}
const cardRefStyle: CSSProperties = {
  display: 'inline',
  background: 'transparent',
  border: 0,
  padding: '0 2px',
  color: 'var(--color-blue)',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  cursor: 'pointer',
  font: 'inherit',
}
const inputRowStyle: CSSProperties = { display: 'flex', gap: 'var(--space-1)', alignItems: 'stretch' }
const inputStyle: CSSProperties = {
  flex: '1 1 auto',
  minWidth: 0,
  fontFamily: 'var(--font-body)',
  fontSize: 'var(--font-size-xs)',
  padding: 'var(--space-1)',
  border: 'var(--border-hairline)',
  borderRadius: 'var(--radius-sm)',
  background: 'var(--color-white)',
  color: 'var(--color-black)',
}
const sendStyle: CSSProperties = {
  flex: '0 0 auto',
  fontFamily: 'var(--font-display)',
  fontSize: 'var(--font-size-xs)',
  padding: 'var(--space-1) var(--space-2)',
  background: 'var(--color-black)',
  color: 'var(--color-white)',
  border: '1px solid var(--color-black)',
  borderRadius: 'var(--radius-sm)',
  cursor: 'pointer',
}

const styles = `
.cc-chat__msg--user .cc-chat__content { background: var(--color-black); color: var(--color-white); }
.cc-chat__msg--user .cc-chat__card-ref { color: var(--color-yellow); }
.cc-chat__msg--assistant .cc-chat__content { background: var(--color-gray-soft); }
.cc-chat__card-ref:hover { opacity: 0.7; }
.cc-chat__context-meta { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-1); margin-top: var(--space-1); color: var(--color-gray); font-family: var(--font-mono); font-size: var(--font-size-xs); }
.cc-chat__context-source { border: 0; padding: 0 2px; background: transparent; color: var(--color-blue); font: inherit; text-decoration: underline; cursor: pointer; }
.cc-chat__context-source:hover { color: var(--color-black); }
.cc-chat__context-source:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cc-chat__cursor { animation: cc-chat-blink 1s steps(2) infinite; }
@keyframes cc-chat-blink { 50% { opacity: 0; } }
.cc-chat__send:focus-visible { outline: 2px solid var(--color-red); outline-offset: 2px; }
.cc-chat__send:disabled { opacity: 0.5; cursor: default; }
.cc-chat__input:focus-visible { outline: 2px solid var(--color-red); outline-offset: 1px; }
`
