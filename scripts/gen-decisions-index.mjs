#!/usr/bin/env node
// scripts/gen-decisions-index.mjs
// Regenerate docs/decisions/INDEX.md from the decision files on disk.
// One line per file, reverse-chronological by filename. Run after adding a
// decision: `node scripts/gen-decisions-index.mjs`.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'

const dir = resolve('docs/decisions')
const files = readdirSync(dir)
  .filter((f) => f.endsWith('.md') && f !== 'INDEX.md' && !f.startsWith('_'))

const entries = files.map((f) => {
  const txt = readFileSync(join(dir, f), 'utf8')
  const h1 = txt.split('\n').find((l) => l.startsWith('#')) || `# ${f}`
  let title = h1.replace(/^#+\s*/, '')
  // Strip a leading "YYYY-MM-DD · " / "YYYY-MM-DD - " from the H1 so the
  // index line doesn't read "date · date · title".
  title = title.replace(/^\d{4}-\d{2}-\d{2}\s*[·-]\s*/, '')
  const m = f.match(/(\d{4}-\d{2}-\d{2})/)
  const date = m ? m[1] : 'undated'
  return { f, title: title.slice(0, 80) || f, date }
}).sort((a, b) => (a.f < b.f ? 1 : -1))

const lines = entries.map((e) => `- ${e.date} · [${e.title}](${e.f})`)

const out = `# Decisions 索引

> 每条一行,按日期倒序(文件名序)。详细见对应文件。
> 新建决策档从 \`_TEMPLATE.md\` 起步。当前状态/版本见 \`../STATE.md\`,历史见 \`../changelog.md\`。

${lines.join('\n')}
`

writeFileSync(join(dir, 'INDEX.md'), out)
console.log(`INDEX.md regenerated — ${entries.length} decisions.`)
