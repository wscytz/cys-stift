'use client'

import { useState } from 'react'
import { Button, Input, Card as UICard, Toolbar, Tag } from '@cys-stift/ui'

// Minimal placeholder: just rendering + state. If this works, the error
// was in db-client.ts.
export default function MinimalDev() {
  const [v, setV] = useState('')
  return (
    <main className="page">
      <Toolbar region="system">
        <span style={{ fontFamily: 'var(--font-mono)' }}>minimal dev</span>
      </Toolbar>
      <div style={{ padding: 'var(--space-4)' }}>
        <UICard heading="hi">
          <Input label="x" value={v} onChange={(e) => setV(e.target.value)} />
          <p>value: {v}</p>
          <Button onClick={() => setV('')}>clear</Button>
        </UICard>
      </div>
    </main>
  )
}