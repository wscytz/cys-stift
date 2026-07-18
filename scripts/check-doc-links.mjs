#!/usr/bin/env node

/**
 * Check relative links in the user-facing Markdown surface without network access.
 * External URLs are intentionally left to the browser/CI's external checks;
 * this gate catches renamed or removed files in the public entry points.
 */
import { readFile, stat } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function stripFencedCode(source) {
  return source.replace(/^\s*(```|~~~)[^\n]*\n[\s\S]*?^\s*\1\s*$/gm, '')
}

function localTarget(rawTarget) {
  const target = rawTarget.trim().replace(/^<|>$/g, '')
  if (!target || target.startsWith('#')) return null
  if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return null
  const withoutHash = target.split('#', 1)[0].split('?', 1)[0]
  return withoutHash ? decodeURIComponent(withoutHash) : null
}

async function existsAsDocument(path) {
  try {
    const info = await stat(path)
    if (info.isFile()) return true
    if (!info.isDirectory()) return false
    for (const index of ['README.md', 'index.md', 'index.html']) {
      try {
        if ((await stat(join(path, index))).isFile()) return true
      } catch {
        // Try the next conventional index name.
      }
    }
    return false
  } catch {
    return false
  }
}

const files = [
  join(ROOT, 'README.md'),
  join(ROOT, 'docs/development/setup.md'),
  join(ROOT, 'docs/user/README.md'),
  join(ROOT, 'docs/user/privacy.md'),
  join(ROOT, 'docs/user/transliteration.md'),
]
const failures = []
const linkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g

for (const file of files) {
  const source = stripFencedCode(await readFile(file, 'utf8'))
  for (const match of source.matchAll(linkPattern)) {
    const target = localTarget(match[1])
    if (!target) continue
    const resolved = resolve(dirname(file), target)
    if (!(await existsAsDocument(resolved))) {
      failures.push(`${file.slice(ROOT.length + 1)} -> ${target}`)
    }
  }
}

if (failures.length > 0) {
  console.error(`Public docs link check failed (${failures.length} link(s))`)
  for (const failure of failures) console.error(`- ${failure}`)
  process.exitCode = 1
} else {
  console.log(`Public docs link check passed (${files.length} Markdown files)`)
}
