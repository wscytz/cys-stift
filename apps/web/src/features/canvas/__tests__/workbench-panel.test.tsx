/**
 * WorkbenchPanel：渲染标题/类型;收起按钮 onClose;编辑后收起 flush onSave;
 * 无专注按钮(已砍 focusEdit);tag 编辑落 onSave。
 * react-dom/client + act(policy)。i18n mock(useI18n)。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import type { Card, MediaRef } from '@cys-stift/domain'
import { WorkbenchPanel } from '../workbench-panel'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({ t: (k: string) => k, locale: 'zh', setLocale: () => {} }),
}))

const removeSpy = vi.fn()
vi.mock('@/lib/media-store', () => ({
  mediaStore: {
    getAsset: (id: string) => (id === 'ma-1' ? { id: 'ma-1', kind: 'image', mimeType: 'image/png', dataUrl: 'data:image/png;base64,AA==', byteSize: 10 } : null),
    remove: (id: string) => removeSpy(id),
  },
}))
beforeEach(() => {
  removeSpy.mockClear()
})

const card = {
  id: 'c1',
  title: '包豪斯',
  body: '正文',
  type: 'note',
  capturedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  tags: [],
  pinned: false,
  archived: false,
} as unknown as Card

function render(el: React.ReactElement) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const root = createRoot(host)
  act(() => {
    root.render(el)
  })
  return {
    host,
    unmount() {
      act(() => {
        root.unmount()
      })
      host.remove()
    },
  }
}

describe('WorkbenchPanel', () => {
  it('渲染卡标题(input 值)', () => {
    const { host } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    const input = host.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('包豪斯')
  })

  it('不渲染专注切换按钮(已砍 focusEdit)', () => {
    const { host } = render(
      <WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />,
    )
    expect(host.querySelector('[data-testid="wb-focus-toggle"]')).toBeNull()
  })

  it('收起按钮 → onClose(无编辑不 onSave)', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onClose).toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('编辑 body 后收起 → flush onSave(含新 body)+ onClose', () => {
    const onSave = vi.fn()
    const onClose = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    // MarkdownEditor 的 textarea
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(ta, '改过的正文')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onSave).toHaveBeenCalledWith(card.id, expect.objectContaining({ body: '改过的正文' }))
    expect(onClose).toHaveBeenCalled()
  })

  it('加 tag 后收起 → flush onSave 含新 tag', () => {
    const onSave = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={vi.fn()} />)
    const tagInput = host.querySelector('.wb-panel__tag-input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(tagInput, '新标签')
      tagInput.dispatchEvent(new Event('input', { bubbles: true }))
    })
    act(() => {
      tagInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      btn.click()
    })
    expect(onSave).toHaveBeenCalledWith(
      card.id,
      expect.objectContaining({
        tags: expect.arrayContaining([expect.objectContaining({ value: '新标签' })]),
      }),
    )
  })

  it('标签输入失焦也会提交，避免点击别处时丢失', () => {
    const onSave = vi.fn()
    const { host } = render(<WorkbenchPanel card={card} onSave={onSave} onClose={vi.fn()} />)
    const tagInput = host.querySelector('.wb-panel__tag-input') as HTMLInputElement
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    act(() => {
      setter.call(tagInput, '失焦标签')
      tagInput.dispatchEvent(new Event('input', { bubbles: true }))
      tagInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }))
    })
    const btn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => btn.click())
    expect(onSave).toHaveBeenCalledWith(
      card.id,
      expect.objectContaining({
        tags: expect.arrayContaining([expect.objectContaining({ value: '失焦标签' })]),
      }),
    )
  })

  it('保存状态:初始空;编辑后显「待保存」(dirty 态可感知)', () => {
    const { host } = render(<WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />)
    const status = host.querySelector('[data-testid="wb-status"]') as HTMLElement
    expect(status.textContent).toBe('') // 初始无编辑 -> 空
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      'value',
    )!.set!
    act(() => {
      setter.call(ta, '新内容')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    expect(status.textContent).toBe('workbench.pending') // dirty -> 待保存(非误导的"保存中")
    host.remove()
  })

  it('切卡(card.id 变)重置草稿标题', () => {
    const other = { ...card, id: 'c2', title: '另一张' } as unknown as Card
    const host2 = document.createElement('div')
    document.body.appendChild(host2)
    const root2 = createRoot(host2)
    act(() => {
      root2.render(<WorkbenchPanel card={card} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    act(() => {
      root2.render(<WorkbenchPanel card={other} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    const input = host2.querySelector('.wb-panel__title') as HTMLInputElement
    expect(input.value).toBe('另一张')
    act(() => {
      root2.unmount()
    })
    host2.remove()
  })

  it('切卡前若有脏编辑 → flush 上一张(bug 1 防丢:autosave 500ms 未到也保)', () => {
    const onSave = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<WorkbenchPanel card={card} onSave={onSave} onClose={vi.fn()} />)
    })
    // 编辑 c1 body(不等 autosave 500ms)
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setter.call(ta, 'c1 的编辑')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 直接切卡 c2(模拟用户编辑后 <500ms 点另一张)
    const other = { ...card, id: 'c2', title: '另一张' } as unknown as Card
    act(() => {
      root.render(<WorkbenchPanel card={other} onSave={onSave} onClose={vi.fn()} />)
    })
    // bug 1 修:切卡 cleanup flush c1 的脏编辑,不丢
    expect(onSave).toHaveBeenCalledWith('c1', expect.objectContaining({ body: 'c1 的编辑' }))
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('切卡 flush 上一卡只改 body 时,links 富字段(title/ogImage/fetchedAt)不丢(数据完整性)', () => {
    // c1 带一条已抓富字段 link(有 title/ogImage/fetchedAt);c2 的 links 不同(模拟两张
    // 内容不同的卡)。用户只在 c1 改 body,随即切 c2。cleanup 必须 flush c1 的脏编辑,
    // 且 links 不应被抹成 {url, fetchedAt: now} —— 这是 workbench-panel prevToPatchRef
    // 修复声称要保护的场景(切卡时用上一卡的 toPatch,而非切卡后重绑的新卡 toPatch)。
    const c1 = {
      ...card,
      id: 'c1',
      body: '原正文',
      links: [
        { url: 'https://keep.example/a', title: '富标题 A', ogImageUrl: 'img-a', fetchedAt: new Date('2026-07-01T00:00:00.000Z') },
      ],
    } as unknown as Card
    const c2 = {
      ...card,
      id: 'c2',
      title: '另一张',
      body: 'c2 正文',
      // c2 的 links URL 不同 —— 触发 buildPatch 用 c2 当基准比 c1 草稿时 links 被判 dirty
      links: [{ url: 'https://other.example/b' }],
    } as unknown as Card

    const onSave = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<WorkbenchPanel card={c1} onSave={onSave} onClose={vi.fn()} />)
    })
    // 只编辑 c1 的 body,不动 links
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setter.call(ta, '改了正文')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 切卡 c2(模拟用户编辑后 <2.5s 点另一张,autosave 未触发)
    act(() => {
      root.render(<WorkbenchPanel card={c2} onSave={onSave} onClose={vi.fn()} />)
    })

    // 切卡 cleanup 应 flush c1 的脏编辑(body 改了)。
    expect(onSave).toHaveBeenCalledWith('c1', expect.objectContaining({ body: '改了正文' }))
    const c1Patch = onSave.mock.calls.find((c) => c[0] === 'c1')?.[1] as
      | { links?: Array<{ url: string; title?: string; ogImageUrl?: string; fetchedAt?: unknown }> }
      | undefined
    // 数据完整性:若 links 进了 patch(因为 prevToPatchRef 用了新卡 toPatch),
    // 它不应抹掉富字段 —— title/ogImageUrl 必须保留。bug 现状会把整条 links 重建为
    // {url, fetchedAt: now},title/ogImage 丢失。
    if (c1Patch?.links) {
      for (const l of c1Patch.links) {
        expect(l).toMatchObject({ url: 'https://keep.example/a', title: '富标题 A', ogImageUrl: 'img-a' })
      }
    }
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})

describe('WorkbenchPanel — media 删除推迟(保存成功才真删)', () => {
  const mediaCard = {
    ...card,
    media: [{ assetId: 'ma-1', order: 0, kind: 'image' }] as MediaRef[],
  } as unknown as Card

  function renderMedia() {
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<WorkbenchPanel card={mediaCard} onSave={vi.fn()} onClose={vi.fn()} />)
    })
    return { host, root }
  }

  /** 点第 1 个 media 的 ×(摘引用)。 */
  function clickRemove(host: HTMLElement) {
    const btn = host.querySelector('.mfe__remove') as HTMLButtonElement
    expect(btn, '应有 media 删除按钮').toBeTruthy()
    act(() => {
      btn.click()
    })
  }

  it('点 × 只摘引用,onSave 返回 false → mediaStore.remove 不被调(保存失败不删图)', () => {
    const onSave = vi.fn(() => false) // 保存失败(quota 等)
    const { host, root } = renderMedia()
    clickRemove(host)
    // flush(close 场景)
    act(() => {
      root.render(<WorkbenchPanel card={mediaCard} onSave={onSave} onClose={vi.fn()} />)
    })
    const closeBtn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      closeBtn.click()
    })
    expect(onSave).toHaveBeenCalled()
    expect(removeSpy).not.toHaveBeenCalled() // 失败 → 不真删(防丢图)
    act(() => {
      root.unmount()
    })
    host.remove()
  })

  it('onSave 成功 → flush 后 mediaStore.remove 被调(成功后清理二进制)', () => {
    const onSave = vi.fn(() => true)
    const { host, root } = renderMedia()
    clickRemove(host)
    act(() => {
      root.render(<WorkbenchPanel card={mediaCard} onSave={onSave} onClose={vi.fn()} />)
    })
    const closeBtn = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      closeBtn.click()
    })
    expect(onSave).toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('ma-1') // 成功 → 真删
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})

describe('WorkbenchPanel — Done 保存失败不关闭(防静默丢编辑)', () => {
  it('flush onSave 返回 false → 面板不关,onClose 不被调(quota 失败保留编辑)', () => {
    const onSave = vi.fn(() => false)
    const onClose = vi.fn()
    const host = document.createElement('div')
    document.body.appendChild(host)
    const root = createRoot(host)
    act(() => {
      root.render(<WorkbenchPanel card={card} onSave={onSave} onClose={onClose} />)
    })
    // 编辑 body 制造脏
    const ta = host.querySelector('textarea') as HTMLTextAreaElement
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    act(() => {
      setter.call(ta, '会失败的编辑')
      ta.dispatchEvent(new Event('input', { bubbles: true }))
    })
    // 点 Done(收起)
    const done = host.querySelector('button[aria-label="workbench.done"]') as HTMLButtonElement
    act(() => {
      done.click()
    })
    expect(onSave).toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled() // 失败 → 保留面板
    act(() => {
      root.unmount()
    })
    host.remove()
  })
})
