import { describe, it, expect, vi } from 'vitest'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { InMemoryCanvasHost, type CanvasHost } from '@cys-stift/canvas-engine'

vi.mock('@/lib/i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params
        ? `${key}(${Object.entries(params).map(([name, value]) => `${name}=${String(value)}`).join(',')})`
        : key,
    locale: 'zh' as const,
  }),
}))
vi.mock('@/lib/toast-store', () => ({ pushToast: vi.fn() }))
vi.mock('@/lib/archive-store', () => ({
  archiveStore: { append: vi.fn(), subscribe: () => () => {}, getVersion: () => 0 },
}))
vi.mock('@/lib/build-archive-payload', () => ({ buildArchivePayload: vi.fn(async () => ({})) }))
vi.mock('@cys-stift/ui', () => ({
  Modal: ({ children, open }: { children?: React.ReactNode; open: boolean }) => (open ? React.createElement('div', null, children) : null),
  Button: ({ children, onClick, disabled }: { children?: React.ReactNode; onClick?: () => void; disabled?: boolean }) =>
    React.createElement('button', { onClick, disabled, type: 'button' }, children),
}))

import { DslDialog } from '../dsl-dialog'
import { humanizeApplyIssue } from '@/lib/dsl-issue-reasons'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

function mountDialog(host: InMemoryCanvasHost, service: unknown, handlers?: Pick<Parameters<typeof DslDialog>[0], 'onCardUpdate'>) {
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(
      <DslDialog
        open={true}
        onClose={() => {}}
        host={host as unknown as CanvasHost}
        service={service as Parameters<typeof DslDialog>[0]['service']}
        canvasName="demo"
        {...handlers}
      />,
    )
  })
  return { container, unmount: () => act(() => root.unmount()) }
}

function changeText(container: HTMLElement, value: string) {
  const textarea = container.querySelector('textarea')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!
    setter.call(textarea, value)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function previewText(container: HTMLElement): string {
  return container.querySelector('.dsl-preview')?.textContent ?? ''
}

describe('DslDialog preview labels', () => {
  it('names a newly created card and an arrow by its endpoints', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = {
      get: (id: string) =>
        id === 'a'
          ? { title: 'Card A', body: 'old', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }
          : undefined,
    }
    const { container, unmount } = mountDialog(host, service)
    changeText(
      container,
      '[card #g create] right-of #a @gap(40) @title("证据 G") @content("新增")\n[arrow #e6] from #a to #g',
    )
    const text = previewText(container)
    expect(text).toContain('canvas.diffElementCard(title=证据 G)')
    expect(text).toContain('canvas.kind.arrow Card A→证据 G')
    unmount()
  })

  it('lists content fields for a card update instead of a generic summary', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = {
      get: (id: string) =>
        id === 'a'
          ? { title: 'Card A', body: 'old body', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }
          : undefined,
    }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #a] @title("新标题") @content("新正文")')
    const text = previewText(container)
    expect(text).toContain('canvas.diffElementCard(title=Card A)')
    expect(text).toContain('canvas.diffField.title')
    expect(text).toContain('canvas.diffField.content')
    expect(text).toContain('canvas.dslPreviewChanges(added=0,removed=0,changed=1)')
    unmount()
  })

  it('disables apply when the canvas changes while the dialog is open', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => undefined }
    const { container, unmount } = mountDialog(host, service)
    act(() => {
      host.upsert({ id: 'b', kind: 'card', x: 200, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    })
    expect(container.querySelector('.dsl-preview--stale')).not.toBeNull()
    const apply = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'canvas.dslApply',
    ) as HTMLButtonElement | undefined
    expect(apply?.disabled).toBe(true)
    unmount()
  })

  it('parse errors use role=alert (actionable failure, not a passive status)', () => {
    const host = new InMemoryCanvasHost()
    const service = { get: () => undefined }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #a] @pos(')
    const panel = container.querySelector('.dsl-errors')
    // Live preview is polite; only an explicit Apply escalates to alert.
    expect(panel?.getAttribute('role')).toBe('status')
    const apply = [...container.querySelectorAll('button')].find((button) => button.textContent === 'canvas.dslApply')
    act(() => apply?.click())
    expect(container.querySelector('.dsl-errors')?.getAttribute('role')).toBe('alert')
    unmount()
  })

  it('blocks a proposal whose anchor does not exist', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'e', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => ({ title: 'Card E', body: '', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }) }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #e] right-of #ghost @gap(40)')
    // 挂起面板改用与解析错误同一套 .dsl-errors 视觉语法(v11)
    const panel = container.querySelector('[data-testid="dsl-apply-blocked"]')
    expect(panel?.getAttribute('role')).toBe('status')
    const text = panel?.textContent ?? ''
    expect(text).toContain('canvas.dslPreviewBlocked')
    expect(text).toContain('ghost')
    const before = JSON.stringify(host.getElements())
    const apply = [...container.querySelectorAll('button')].find(
      (button) => button.textContent === 'canvas.dslApply',
    ) as HTMLButtonElement | undefined
    act(() => apply?.click())
    expect(container.querySelector('[data-testid="dsl-apply-blocked"]')?.getAttribute('role')).toBe('alert')
    expect(JSON.stringify(host.getElements())).toBe(before)
    unmount()
  })
})

describe('DslDialog — 挂起行定位与人话原因(v11)', () => {
  it('blocked 面板显示源行号 + 人话化原因(不再是 #N + relational card 行话)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'e', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => ({ title: 'Card E', body: '', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }) }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '# 注释占一行\n[card #e] right-of #ghost @gap(40)')
    const panel = container.querySelector('.dsl-errors')
    expect(panel).not.toBeNull()
    const text = panel!.textContent ?? ''
    expect(text).toContain('canvas.dslErrorLine(line=2)')
    expect(text).toContain('canvas.dslIssueAnchorMissing(card=#e,anchor=#ghost)')
    expect(text).not.toContain('relational card')
    unmount()
  })

  it('整单被闸门挂起时,其余有效行的改动仍以子集预览展示(仅显示,不改整单语义)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    // service 只认 #a:新增卡 #fresh 拿不到标题 → 人话标签回退「未命名」
    const service = {
      get: (id: string) =>
        id === 'a'
          ? { title: 'Card A', body: '', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }
          : undefined,
    }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #a] right-of #ghost @gap(40)\n[card #fresh create] @pos(300,300) @size(200,100)')
    const text = container.textContent ?? ''
    expect(text).toContain('canvas.dslPreviewBlocked(n=1)')
    expect(text).toContain('canvas.dslPreviewSubset(n=1,added=1,removed=0,changed=0)')
    expect(text).toContain('canvas.diffElementCard(title=card.untitled)')
    // 子集预览是纯显示:画布未被写入
    expect(host.getElements()).toHaveLength(1)
    unmount()
  })

  it('计划干净但个别行被跳过:显示「将被跳过」软提示,不谎称「应用已取消」', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = {
      get: () => ({ title: 'Card A', body: '', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }),
    }
    const { container, unmount } = mountDialog(host, service)
    // 箭头写在 create 之前:批内声明算端点 → 计划干净;apply 逐 op 推进 shadow,
    // 箭头行被跳过、卡照常创建。UI 必须说「将被跳过」而不是「应用已取消」。
    changeText(container, '[arrow #e] from #a to #z\n[card #z create] @pos(200,0) @size(100,50)')
    const text = container.textContent ?? ''
    expect(text).toContain('canvas.dslPreviewSkipped(n=1)')
    expect(text).not.toContain('canvas.dslPreviewBlocked')
    // 跳过原因人话化(apply 英文串 → 本地化 key),且其余改动照常预览
    expect(text).toContain('canvas.dslIssueArrowEndpoint(id=#z)')
    expect(text).toContain('canvas.dslPreviewChanges(added=1,removed=0,changed=0)')
    const softTitle = container.querySelector('.dsl-errors--soft .dsl-errors__title')?.textContent ?? ''
    expect(softTitle).toContain('canvas.dslPreviewSkipped(n=1)')
    unmount()
  })
})

describe('DslDialog draft and retry', () => {
  function apply(container: HTMLElement) {
    const button = [...container.querySelectorAll('button')].find((entry) => entry.textContent === 'canvas.dslApply')!
    act(() => button.click())
  }

  const anchor = { id: 'a', dir: 'right-of', gap: 20 }
  const card = (id: string, x: number) => ({ id, kind: 'card' as const, x, y: 0, w: 100, h: 80, rotation: 0 })

  it.each([false, true])('keeps card positions and the stored anchor on a title edit (anchor first: %s)', (anchorFirst) => {
    const host = new InMemoryCanvasHost()
    const a = card('a', 0)
    const b = { ...card('b', 120), meta: { layoutAnchor: anchor } }
    for (const element of anchorFirst ? [a, b, card('overlap', 180)] : [b, a]) host.upsert(element)
    const onCardUpdate = vi.fn()
    const service = { get: () => ({ title: 'Original', type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }) }
    const { container, unmount } = mountDialog(host, service, { onCardUpdate })
    const original = container.querySelector('textarea')!.value
    changeText(container, original.replace(/(\[card #b\][^\n]*)@title\("Original"\)/, '$1@title("Edited")'))
    expect(previewText(container)).toContain('canvas.diffField.title')
    apply(container)
    expect(onCardUpdate).toHaveBeenCalledTimes(1)
    expect(onCardUpdate).toHaveBeenCalledWith(expect.objectContaining({ cardId: 'b', title: 'Edited' }))
    expect(host.getElement('b')).toMatchObject({ x: 120, meta: { layoutAnchor: anchor } })
    unmount()
  })

  it('previews a meta-only change instead of claiming the canvas is up to date (A-07)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    changeText(container, original.replace(/(\[card #a\][^\n]*)/, '$1 @group("g")'))
    const text = previewText(container)
    expect(text).not.toContain('canvas.dslPreviewNoChanges')
    expect(text).toContain('canvas.diffField.group')
    apply(container)
    expect(host.getElement('a')?.meta?.group).toBe('g')
    unmount()
  })

  it('keeps a dependent relation line when its anchor size changes (R-05)', () => {
    const host = new InMemoryCanvasHost()
    const a = card('a', 0)
    const b = { ...card('b', 120), meta: { layoutAnchor: anchor } }
    const c = { ...card('c', 240), meta: { layoutAnchor: { id: 'b', dir: 'right-of' as const, gap: 20 } } }
    host.upsert(a)
    host.upsert(b)
    host.upsert(c)
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    // b 是关系卡，只改它自己的 @size；c 行不动，但 c 必须跟随 b 的新宽度。
    // 缩小宽度（100→80）不会撞到当前 c，避免把避让位移混进断言。
    changeText(container, original.replace(
      /(\[card #b\][^\n]*@size\()100(?:\.0)?,/,
      (_match, before: string) => `${before}80,`,
    ))
    apply(container)
    expect(host.getElement('b')).toMatchObject({ x: 120, w: 80 })
    expect(host.getElement('c')).toMatchObject({ x: 220 })
    unmount()
  })

  it('keeps a dependent relation line when a card switches from @pos to a relation (R-05)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(card('a', 0))
    host.upsert(card('b', 500))
    host.upsert({ ...card('c', 620), meta: { layoutAnchor: { id: 'b', dir: 'right-of' as const, gap: 20 } } })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    changeText(container, original.replace(
      /(\[card #b\][^\n]*?)@pos\([^)]*\)[^\n]*/,
      (_match, before: string) => `${before}right-of #a @gap(20)`,
    ))
    apply(container)
    expect(host.getElement('b')).toMatchObject({ x: 120 })
    expect(host.getElement('c')).toMatchObject({ x: 240 })
    unmount()
  })

  it('previews a free-element group change instead of claiming the canvas is up to date (R-07)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 50, rotation: 0 })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    changeText(container, original.replace(/(\[rect #r1\][^\n]*)/, '$1 @group("g")'))
    const text = previewText(container)
    expect(text).not.toContain('canvas.dslPreviewNoChanges')
    expect(text).toContain('canvas.diffField.group')
    apply(container)
    expect(host.getElement('r1')?.meta?.group).toBe('g')
    unmount()
  })

  it('shows card meta in the gated subset preview without a TDZ crash (N-11)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'a', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0 })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    changeText(container, `${original.replace(/(\[card #a\][^\n]*)/, '$1 @group("g")')}\n[card #ghost] right-of #missing`)
    const text = container.textContent ?? ''
    expect(text).toContain('canvas.dslPreviewSubset')
    expect(text).toContain('canvas.diffField.group')
    unmount()
  })

  it('shows free meta changes in the gated subset preview (N-02)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'r1', kind: 'rect', x: 0, y: 0, w: 100, h: 50, rotation: 0 })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    changeText(container, `${original.replace(/(\[rect #r1\][^\n]*)/, '$1 @group("g")')}\n[card #ghost] right-of #missing`)
    const text = container.textContent ?? ''
    expect(text).toContain('canvas.dslPreviewSubset')
    expect(text).toContain('canvas.diffField.group')
    unmount()
  })

  it('keeps a dependent relation line when its anchor moves (A-03)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(card('a', 0))
    host.upsert({ ...card('b', 120), meta: { layoutAnchor: anchor } })
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    const original = container.querySelector('textarea')!.value
    expect(original).toMatch(/\[card #a\] @pos\(0(?:\.0)?,0(?:\.0)?\)/)
    changeText(container, original.replace(/(\[card #a\] @pos\()[^)]*(\))/, (_match, before: string, after: string) => `${before}500,0${after}`))
    apply(container)
    // 锚点 a 宽 100 + gap 20 → b 必须跟到 620，而不是留在旧 120。
    expect(host.getElement('b')).toMatchObject({ x: 620 })
    expect(host.getElement('b')?.meta?.layoutAnchor).toEqual(anchor)
    unmount()
  })

  it('refreshes the draft baseline after a partial apply so reverting a line still applies (A-05)', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(card('a', 0))
    let title = 'Original'
    const onCardUpdate = vi.fn((update: { title?: string }) => {
      if (update.title !== undefined) title = update.title
    })
    const service = {
      get: () => ({ title, type: 'note', tags: [], links: [], codeSnippets: [], quotes: [] }),
    }
    const { container, unmount } = mountDialog(host, service, { onCardUpdate })
    const original = container.querySelector('textarea')!.value
    const edited = `${original.replace(/@title\("Original"\)/, '@title("Edited")')}\n[card #bad] @pos x y`
    changeText(container, edited)
    apply(container)
    expect(title).toBe('Edited')
    changeText(container, original)
    apply(container)
    expect(title).toBe('Original')
    unmount()
  })

  it('previews a retry with the same applied hashes as the commit', () => {
    const host = new InMemoryCanvasHost()
    host.upsert(card('a', 0))
    const { container, unmount } = mountDialog(host, { get: () => undefined })
    changeText(container, '[arrow #e] from #a to #z\n[card #z create] @pos(300,0)')
    apply(container)
    expect(host.getElement('z')).toBeDefined()
    expect(host.getElement('e')).toBeUndefined()
    expect(container.textContent).not.toContain('canvas.dslPreviewBlocked')
    expect(container.textContent).toContain('canvas.dslIssueAlreadyApplied')
    expect(previewText(container)).toContain('canvas.dslPreviewChanges(added=1,removed=0,changed=0)')
    apply(container)
    expect(host.getElement('e')).toMatchObject({ from: 'a', to: 'z' })
    expect(container.textContent).not.toContain('canvas.dslPreviewSkipped')
    unmount()
  })
})

describe('humanizeApplyIssue — 原因模式族翻译', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key}(${Object.entries(params).map(([name, value]) => `${name}=${String(value)}`).join(',')})`
      : key

  it('solver 锚点缺失 → 锚点卡不存在 + 新建指引', () => {
    const out = humanizeApplyIssue('relational card #b 的 anchor #ghost 不存在(画布/同批更早均无)', t)
    expect(out).toBe('canvas.dslIssueAnchorMissing(card=#b,anchor=#ghost)')
  })

  it('组锚无成员 / 上游锚缺失 / 不在画布 / 删除缺失 / id 冲突 / 已应用,各自命中', () => {
    expect(humanizeApplyIssue('relational card #c 的组锚 @grp 无已解成员(组不存在,或组员都在本卡之后——组锚按书写顺序解)', t))
      .toContain('canvas.dslIssueGroupAnchor(anchor=@grp)')
    expect(humanizeApplyIssue('relational card #c 的 anchor #a 上游 anchor 缺失(链式占位,坐标可能不符预期)', t))
      .toContain('canvas.dslIssueUpstreamAnchor(anchor=#a)')
    expect(humanizeApplyIssue('card #x does not exist', t))
      .toBe('canvas.dslIssueNotOnCanvas(id=#x)')
    expect(humanizeApplyIssue('delete card #x does not exist', t))
      .toBe('canvas.dslIssueDeleteMissing(id=#x,kind=canvas.kind.card)')
    expect(humanizeApplyIssue('card #x id conflict with existing card', t))
      .toContain('canvas.dslIssueIdConflict(id=#x,kind=canvas.kind.card)')
    expect(humanizeApplyIssue('operation already applied in this session', t))
      .toBe('canvas.dslIssueAlreadyApplied')
  })

  it('未知 reason 原文回落(新增 reason 不改 UI 也不炸)', () => {
    expect(humanizeApplyIssue('some future solver reason', t)).toBe('some future solver reason')
  })
})

describe('humanizeApplyIssue — sanitize 中文变体与钳位族(审核 P1 补全)', () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params
      ? `${key}(${Object.entries(params).map(([name, value]) => `${name}=${String(value)}`).join(',')})`
      : key

  it('create 冲突中文变体 / 批内重复 id / compute / arrow 端点 / 跨 kind', () => {
    expect(humanizeApplyIssue('create card #a id 已存在(冲突,建卡将失败)', t))
      .toBe('canvas.dslIssueCreateExists(id=#a)')
    expect(humanizeApplyIssue('duplicate element id #a — later op overrides earlier', t))
      .toBe('canvas.dslIssueDuplicateId(id=#a)')
    expect(humanizeApplyIssue('compute: unresolved ref: #ghost', t))
      .toBe('canvas.dslIssueComputeRef(id=#ghost)')
    expect(humanizeApplyIssue('compute: division by zero', t))
      .toBe('compute: division by zero')
    expect(humanizeApplyIssue('arrow from #ghost 不存在于画布', t))
      .toBe('canvas.dslIssueArrowEndpoint(id=#ghost)')
    expect(humanizeApplyIssue('arrow to #ghost 不存在于画布', t))
      .toBe('canvas.dslIssueArrowEndpoint(id=#ghost)')
    // 三审补全:apply 报告的英文端点串(此前回落英文行话)
    expect(humanizeApplyIssue('arrow endpoint #ghost does not exist', t))
      .toBe('canvas.dslIssueArrowEndpoint(id=#ghost)')
    expect(humanizeApplyIssue('rect #r 与已有 text 跨 kind,将新建而非更新', t))
      .toBe('canvas.dslIssueKindMismatch(id=#r,kind=canvas.kind.text)')
  })

  it('delete 族:kind 缺失带 kind 人话;跨 kind delete 给对应指令指引(不再误导换 id)', () => {
    expect(humanizeApplyIssue('delete rect #r 不存在于画布(该行将跳过)', t))
      .toBe('canvas.dslIssueDeleteMissing(id=#r,kind=canvas.kind.rect)')
    expect(humanizeApplyIssue('delete arrow #e 不存在于画布(该行将跳过)', t))
      .toBe('canvas.dslIssueDeleteMissing(id=#e,kind=canvas.kind.arrow)')
    expect(humanizeApplyIssue('delete card #r id conflict with existing rect', t))
      .toBe('canvas.dslIssueDeleteKindConflict(id=#r,kind=canvas.kind.rect,directive=rect)')
    // 三审:directive 跟随目标真实 kind([arrow #x delete] 打向 card 时不再建议 rect)
    expect(humanizeApplyIssue('delete arrow #x id conflict with existing card', t))
      .toBe('canvas.dslIssueDeleteKindConflict(id=#x,kind=canvas.kind.card,directive=card)')
  })

  it('delete 只认 #id / gap 与坐标钳位 / 钳位碰撞 / 保留字组锚', () => {
    expect(humanizeApplyIssue('delete 行只认 #id,已忽略其余指令(@size, create)', t))
      .toBe('canvas.dslIssueDeleteOnlyId(detail=@size, create)')
    expect(humanizeApplyIssue('card #a 的 gap 已限制到 0..2000', t))
      .toContain('canvas.dslIssueClamped(field=canvas.organize.gap,detail=0..2000)')
    expect(humanizeApplyIssue('relational card #a 的坐标已限制到 +/-30000 边界', t))
      .toContain('canvas.dslIssueClamped(field=canvas.dslIssueClampCoordField,detail=+/-30000)')
    expect(humanizeApplyIssue('card #a 在坐标边界钳位后与 #b 碰撞', t))
      .toBe('canvas.dslIssueClampCollision(id=#b)')
    expect(humanizeApplyIssue('card #a 的组锚 @gap 与内建指令同名,已剥除——组名避开指令词;确有同名组用 @"gap" 引用;组间距写在锚后(如 right-of @组名 @gap(30))', t))
      .toBe('canvas.dslIssueReservedGroupAnchor(anchor=@gap)')
  })

  it('组锚名允许 CJK 与空格(grammar bareGroupName)', () => {
    expect(humanizeApplyIssue('relational card #m 的组锚 @数据模型 无已解成员(组不存在,或组员都在本卡之后——组锚按书写顺序解)', t))
      .toBe('canvas.dslIssueGroupAnchor(anchor=@数据模型)')
    expect(humanizeApplyIssue('relational card #m 的组锚 @Q3 规划 无已解成员(组不存在,或组员都在本卡之后——组锚按书写顺序解)', t))
      .toBe('canvas.dslIssueGroupAnchor(anchor=@Q3 规划)')
  })

  it('同一 op 多条诊断时标题按去重 op 计数', () => {
    const host = new InMemoryCanvasHost()
    host.upsert({ id: 'x', kind: 'card', x: 0, y: 0, w: 100, h: 50, rotation: 0, color: 'white' })
    const service = { get: () => undefined }
    const { container, unmount } = mountDialog(host, service)
    changeText(container, '[card #x create] @pos(0,0)\n[card #x create] @pos(1,1)')
    const title = container.querySelector('.dsl-errors__title')?.textContent ?? ''
    expect(title).toContain('canvas.dslPreviewBlocked(n=2)')
    // 同 op 两条诊断都在列表里(op1: duplicate + create 冲突)
    const items = container.querySelectorAll('.dsl-errors__item')
    expect(items.length).toBe(3)
    unmount()
  })
})
