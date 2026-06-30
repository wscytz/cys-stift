'use client'

/**
 * 全局错误边界(R3.1 韧性修复)。
 *
 * Next.js App Router 的 error.tsx 自动成为最近路由段的 Error Boundary。
 * 放在 app/ 根级 → 兜底所有路由:canvas 渲染崩溃 / 卡片详情渲染异常 /
 * AI popover 抛错,不再白屏——展示错误 + 重试 + 回首页。
 *
 * 必须是 client component('use client'),捕获渲染期 + 事件回调期错误。
 * 注意:layout.tsx(AppMenu/ToastHost 等)的错误 error.tsx 兜不住
 * (layout 错误需 app/global-error.tsx);此处覆盖 page 级渲染。
 */
import { useEffect } from 'react'
import { useI18n } from '@/lib/i18n'

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const { t } = useI18n()
  useEffect(() => {
    console.error('[error-boundary] route crashed', error)
  }, [error])

  return (
    <main className="err-boundary" role="alert">
      <div className="err-boundary__bar" aria-hidden="true" />
      <h1 className="err-boundary__h">{t('error.boundary.title')}</h1>
      <p className="err-boundary__msg">{t('error.boundary.subtitle')}</p>
      {error.digest && (
        <p className="err-boundary__digest">{t('error.boundary.errorCode')}:{error.digest}</p>
      )}
      {/* 调试:显示真实错误信息 + stack(生产也留,便于用户反馈定位) */}
      <details className="err-boundary__details">
        <summary className="err-boundary__digest">{t('error.boundary.tech')}</summary>
        <pre className="err-boundary__stack">{error.message}\n{error.stack ?? ''}</pre>
      </details>
      <div className="err-boundary__actions">
        <button type="button" className="err-boundary__btn" onClick={reset}>
          {t('error.boundary.retry')}
        </button>
        <a className="err-boundary__btn err-boundary__btn--ghost" href="/">
          {t('error.boundary.home')}
        </a>
      </div>
      <style>{`
.err-boundary {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: var(--space-3);
  padding: var(--space-5) var(--space-4);
  max-width: 520px;
  margin: 0 auto;
  background: var(--color-white);
  color: var(--color-black);
}
.err-boundary__bar { width: 64px; height: 8px; background: var(--color-red); }
.err-boundary__h { margin: 0; font-family: var(--font-display); font-size: var(--font-size-2xl); font-weight: 500; letter-spacing: -0.01em; }
.err-boundary__msg { margin: 0; font-family: var(--font-body); font-size: var(--font-size-base); color: var(--color-black-soft); line-height: 1.6; }
.err-boundary__digest { margin: 0; font-family: var(--font-mono); font-size: var(--font-size-xs); color: var(--color-gray); }
.err-boundary__details { margin-top: var(--space-2); width: 100%; }
.err-boundary__details summary { cursor: pointer; }
.err-boundary__stack {
  margin-top: var(--space-1); padding: var(--space-2);
  background: var(--color-gray-soft); border-radius: var(--radius-sm);
  font-family: var(--font-mono); font-size: var(--font-size-xs);
  color: var(--color-red); white-space: pre-wrap; word-break: break-word;
  max-height: 200px; overflow: auto;
}
.err-boundary__actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); }
.err-boundary__btn {
  font-family: var(--font-mono); font-size: var(--font-size-sm);
  text-transform: uppercase; letter-spacing: 0.12em;
  background: var(--color-black); color: var(--color-white);
  border: var(--border-hairline); padding: var(--space-2) var(--space-3);
  border-radius: var(--radius-sm); cursor: pointer; text-decoration: none;
}
.err-boundary__btn:hover { box-shadow: 2px 2px 0 0 var(--color-red); }
.err-boundary__btn--ghost { background: var(--color-white); color: var(--color-black); }
`}</style>
    </main>
  )
}
