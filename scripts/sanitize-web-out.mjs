#!/usr/bin/env node
// Post-build privacy sanitizer for the static web export.
//
// Two leaks have shown up in `apps/web/out`:
//   1. pdfjs (via markitdownllm) bakes the build machine's absolute module path
//      into a dead Node-only branch: file:///Users/<name>/projects/cys-stift/...
//      The branch never runs in the browser, but the string is served publicly.
//   2. Mimosa hook state can land under public/fonts/.mimosa and is copied into
//      the export wholesale.
//
// This step removes scanner state and rewrites build-machine paths before the
// output is uploaded. It fails the build if any user-home path remains, so a
// future dependency cannot silently reintroduce the leak.

import { readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'apps/web/out')
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.html', '.htm', '.json', '.css', '.txt', '.map',
  '.svg', '.xml', '.webmanifest', '.md',
])

const REPLACEMENTS = [
  // file:// URL form first, so the longer match wins.
  { re: /file:\/\/\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: 'file:///app' },
  { re: /file:\/\/\/[A-Za-z]:\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: 'file:///app' },
  { re: /\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: '.' },
  { re: /[A-Za-z]:\\Users\\[^\\"'\s)]+\\projects\\cys-stift/g, to: '.' },
]

const LEAK = /(\/Users\/|file:\/\/\/Users\/|[A-Za-z]:\\Users\\)/

let removed = 0
let rewritten = 0
let scanned = 0
const rewrittenFiles = new Set()

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.name === '.mimosa' || entry.name === '.DS_Store') {
      await rm(full, { recursive: true, force: true })
      removed++
      continue
    }
    if (entry.isDirectory()) {
      await walk(full)
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!TEXT_EXT.has(ext)) continue
    scanned++
    const source = await readFile(full, 'utf8')
    let next = source
    for (const { re, to } of REPLACEMENTS) next = next.replace(re, to)
    if (next !== source) {
      await writeFile(full, next, 'utf8')
      rewritten++
      rewrittenFiles.add(full)
    }
  }
}

async function assertClean(dir) {
  const leaks = []
  const entries = await readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      leaks.push(...(await assertClean(full)))
      continue
    }
    if (!entry.isFile()) continue
    const ext = path.extname(entry.name).toLowerCase()
    if (!TEXT_EXT.has(ext)) continue
    const source = await readFile(full, 'utf8')
    if (LEAK.test(source)) leaks.push(path.relative(OUT, full))
  }
  return leaks
}

async function replaceInTextFiles(oldValue, newValue) {
  async function walkReplace(dir) {
    const entries = await readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        await walkReplace(full)
        continue
      }
      if (!entry.isFile()) continue
      const ext = path.extname(entry.name).toLowerCase()
      if (!TEXT_EXT.has(ext)) continue
      const source = await readFile(full, 'utf8')
      if (!source.includes(oldValue)) continue
      await writeFile(full, source.split(oldValue).join(newValue), 'utf8')
    }
  }
  await walkReplace(OUT)
}

/**
 * Next content-hashes chunks before this sanitizer runs. Rewriting a chunk in
 * place would keep its old URL, which a CDN may already have cached. Rename
 * every rewritten chunk with a hash of the sanitized bytes and update the
 * webpack runtime's hash map. The runtime itself changes, so rename it too and
 * let the dynamic HTML point at the fresh file.
 */
async function renameRewrittenChunks() {
  const chunksDir = path.join(OUT, '_next/static/chunks')
  const renamed = []
  for (const full of rewrittenFiles) {
    if (path.dirname(full) !== chunksDir) continue
    const base = path.basename(full)
    const match = base.match(/^(.*)\.([0-9a-f]{16})\.js$/)
    if (!match) continue
    const [, prefix, oldHash] = match
    const content = await readFile(full)
    const newHash = createHash('sha256').update(content).digest('hex').slice(0, 16)
    if (newHash === oldHash) continue
    const newBase = `${prefix}.${newHash}.js`
    await rename(full, path.join(chunksDir, newBase))
    // The webpack runtime maps chunk id -> bare hash, not the full filename.
    await replaceInTextFiles(oldHash, newHash)
    renamed.push(`${base} -> ${newBase}`)
  }

  const entries = await readdir(chunksDir)
  const runtime = entries.find((name) => /^webpack-[0-9a-f]+\.js$/.test(name))
  if (runtime) {
    const full = path.join(chunksDir, runtime)
    const content = await readFile(full)
    const newHash = createHash('sha256').update(content).digest('hex').slice(0, 16)
    const newName = `webpack-${newHash}.js`
    if (newName !== runtime) {
      await rename(full, path.join(chunksDir, newName))
      await replaceInTextFiles(runtime, newName)
      renamed.push(`${runtime} -> ${newName}`)
    }
  }

  if (renamed.length > 0) {
    console.log(`✓ renamed sanitized chunks: ${renamed.join(', ')}`)
  }
}

await walk(OUT)
await renameRewrittenChunks()
const leaks = await assertClean(OUT)
if (leaks.length > 0) {
  console.error(`✗ web export still contains build-machine home paths: ${leaks.join(', ')}`)
  process.exit(1)
}
console.log(`✓ web export sanitized: ${scanned} text files scanned, ${rewritten} rewritten, ${removed} scanner/OS artifacts removed`)
