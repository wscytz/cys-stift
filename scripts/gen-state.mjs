#!/usr/bin/env node
// scripts/gen-state.mjs
// Regenerate the version-milestone table in docs/STATE.md from `git tag`.
// Run after tagging a release: `node scripts/gen-state.mjs`.
//
// Why: STATE.md is the single source of truth for "what version are we on",
// and a hand-maintained table drifts. This walks the tags and emits the
// rows between the <!-- gen-state:start --> / <!-- gen-state:end --> markers
// in STATE.md. Tags v0.18–v0.21 are skipped (those numbers were never used).
//
// No file deps — only child_process git + fs. Node 18+.

import { execSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const STATE = resolve(__dirname, '..', 'docs', 'STATE.md')

const SKIP = new Set([
  'v0.18.0', 'v0.19.0', 'v0.20.0', 'v0.21.0', // never used
])

function tags() {
  const out = execSync('git tag --list', { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean)
  // sort by semver-ish; strip leading v
  return out
    .filter((t) => !SKIP.has(t))
    .sort((a, b) => {
      const va = a.replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || x)
      const vb = b.replace(/^v/, '').split(/[.-]/).map((x) => Number(x) || x)
      for (let i = 0; i < Math.max(va.length, vb.length); i++) {
        const cmp = (va[i] ?? 0) < (vb[i] ?? 0) ? -1 : (va[i] ?? 0) > (vb[i] ?? 0) ? 1 : 0
        if (cmp !== 0) return cmp
      }
      return 0
    })
}

function subject(tag) {
  try {
    return execSync(`git log -1 --pretty=%s ${tag}`, { encoding: 'utf8' }).trim()
  } catch {
    return ''
  }
}

// Compress the linear tag list into contiguous ranges with a shared theme hint.
function rows() {
  const all = tags()
  const out = []
  for (const t of all) {
    const subj = subject(t)
    // Keep the row concise: tag + first ~60 chars of the commit subject.
    const brief = subj.length > 64 ? subj.slice(0, 61) + '…' : subj
    out.push(`| ${t} | ${brief.replace(/\|/g, '\\|')} | ${t} |`)
  }
  return out
}

const src = readFileSync(STATE, 'utf8')
const START = '<!-- gen-state:start -->'
const END = '<!-- gen-state:end -->'
const startIdx = src.indexOf(START)
const endIdx = src.indexOf(END)
if (startIdx === -1 || endIdx === -1) {
  console.error(`Missing ${START} / ${END} markers in ${STATE}`)
  process.exit(1)
}
const table = ['| tag | 最近 commit 主题 | tag |', '|---|---|---|', ...rows()].join('\n')
const next =
  src.slice(0, startIdx + START.length) +
  '\n' + table + '\n' +
  src.slice(endIdx)

writeFileSync(STATE, next)
console.log(`STATE.md version table regenerated — ${rows().length} tags.`)
