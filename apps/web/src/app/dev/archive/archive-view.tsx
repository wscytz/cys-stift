'use client'

/**
 * /dev/archive — 开发存档列表(内容版本)。spec D7。
 *
 * 列表(版号倒序 + trigger 色标 + appVersion + note)+ 只读浏览(卡片数,不做
 * 完整 CanvasHost 渲染,spec defer)+ 每条导出 JSON + 手动「打存档点」。
 *
 * Reactivity: useSyncExternalStore(archiveStore.subscribe, archiveStore.getVersion)
 * 触发重渲染;渲染体读 archiveStore.listMeta() 拿内存缓存快照。store 在 append /
 * retention 清扫后 notify → getVersion 变 → 本组件重渲 → listMeta 返新值。
 *
 * 仅本地页面,无 AI(R2 隐私:不外发)。
 */
import { useSyncExternalStore, useState } from 'react'
import {
  archiveStore,
  type ArchiveEntryMeta,
  type ArchiveTrigger,
} from '@/lib/archive-store'
import { buildArchivePayload } from '@/lib/build-archive-payload'
import { VERSION } from '@/lib/version'

// trigger → Bauhaus token 色(spec D7;release 黄 / 风险 op 蓝 / 手动 灰)。NO hex。
const TRIGGER_COLOR: Record<ArchiveTrigger, string> = {
  release: 'var(--color-yellow)',
  'ai-layout': 'var(--color-blue)',
  'ai-agent': 'var(--color-blue)',
  cluster: 'var(--color-blue)',
  'dsl-apply': 'var(--color-blue)',
  manual: 'var(--color-gray)',
}

function triggerLabel(t: ArchiveTrigger): string {
  const map: Record<ArchiveTrigger, string> = {
    release: 'release',
    'ai-layout': 'AI 重排',
    'ai-agent': 'agent',
    cluster: 'cluster',
    'dsl-apply': 'DSL',
    manual: '手动',
  }
  return map[t]
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleString()
}

/** 导出文件名:cys-stift-archive-v{archiveVersion}-{trigger}-{timestamp}.json
 *  timestamp = ISO slice(0..19) 把 `:T` → `-`。 */
function exportFileName(m: ArchiveEntryMeta): string {
  const ts = new Date(m.createdAt)
    .toISOString()
    .slice(0, 19)
    .replace(/[:T]/g, '-')
  return `cys-stift-archive-v${m.archiveVersion}-${m.trigger}-${ts}.json`
}

export function Page(): React.ReactElement {
  // 订阅 store;getVersion 变 → 重渲染 → listMeta 拿新缓存值
  useSyncExternalStore(
    archiveStore.subscribe,
    archiveStore.getVersion,
    () => 0,
  )
  const list = archiveStore.listMeta()

  const [note, setNote] = useState('')
  const [selVersion, setSelVersion] = useState<number | null>(null)
  const [selPayload, setSelPayload] = useState<{
    cards: unknown[]
  } | null>(null)

  async function checkpoint(): Promise<void> {
    await archiveStore.append(
      'manual',
      note,
      await buildArchivePayload(),
      VERSION,
    )
    setNote('')
  }

  async function browse(v: number): Promise<void> {
    setSelVersion(v)
    const p = (await archiveStore.loadPayload(v)) as { cards: unknown[] } | null
    setSelPayload(p)
  }

  function exportOne(m: ArchiveEntryMeta): void {
    void archiveStore.loadPayload(m.archiveVersion).then((p) => {
      if (!p) return
      const blob = new Blob([JSON.stringify(p, null, 2)], {
        type: 'application/json',
      })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = exportFileName(m)
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    })
  }

  return (
    <div
      style={{
        padding: 'var(--space-5)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-4)',
      }}
    >
      <h1 style={{ margin: 0 }}>开发存档(内容版本)</h1>

      <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="存档说明(可选)"
          style={{ flex: 1 }}
        />
        <button data-testid="checkpoint-btn" onClick={() => void checkpoint()}>
          打存档点
        </button>
      </div>

      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
        }}
      >
        {list.map((m) => (
          <li
            key={m.archiveVersion}
            style={{
              display: 'flex',
              gap: 'var(--space-3)',
              alignItems: 'center',
              padding: 'var(--space-2)',
              border: '1px solid var(--color-gray-soft)',
            }}
          >
            <span
              style={{
                width: 12,
                height: 12,
                background: TRIGGER_COLOR[m.trigger],
                borderRadius: 2,
                flex: '0 0 auto',
              }}
              aria-hidden
            />
            <strong>v{m.archiveVersion}</strong>
            <span>{fmtTime(m.createdAt)}</span>
            <span>{triggerLabel(m.trigger)}</span>
            <span style={{ opacity: 0.7 }}>app {m.appVersion}</span>
            <span>{m.note}</span>
            <button onClick={() => void browse(m.archiveVersion)}>浏览</button>
            <button onClick={() => exportOne(m)}>导出 JSON</button>
          </li>
        ))}
      </ul>

      {selVersion !== null && (
        <div
          style={{
            borderTop: '1px solid var(--color-gray-soft)',
            paddingTop: 'var(--space-3)',
          }}
        >
          <h2>v{selVersion} 状态(只读)</h2>
          <p>卡片数:{selPayload?.cards.length ?? '…'}</p>
          {/* 列表级 render:卡片标题列表 + 画布几何概览;不做完整 CanvasHost 渲染(spec defer) */}
        </div>
      )}
    </div>
  )
}

export default Page
