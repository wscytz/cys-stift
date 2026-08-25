'use client'

import { useState } from 'react'
import { Tabs } from '@cys-stift/ui/tabs'

/** /design 展示页的 Tabs 交互样例(展示页是 server component,onChange 需 client 岛)。 */
export function TabsDemo() {
  const [view, setView] = useState<'all' | 'unread' | 'pinned'>('all')
  return (
    <div className="stack">
      <Tabs
        ariaLabel="收件箱视图切换"
        tabs={[
          { id: 'all', label: '全部' },
          { id: 'unread', label: '未读' },
          { id: 'pinned', label: '置顶' },
        ]}
        active={view}
        onChange={setView}
      />
      <p className="hint">active: {view} · 左右箭头可切换(激活即聚焦目标)</p>
    </div>
  )
}
