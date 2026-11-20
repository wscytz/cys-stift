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
const OUT = process.env.SANITIZE_WEB_OUT
  ? path.resolve(process.env.SANITIZE_WEB_OUT)
  : path.join(ROOT, 'apps/web/out')
const TEXT_EXT = new Set([
  '.js', '.mjs', '.cjs', '.html', '.htm', '.json', '.css', '.txt', '.map',
  '.svg', '.xml', '.webmanifest', '.md',
])

const REPLACEMENTS = [
  // file:// URL form first, so the longer match wins.
  { re: /file:\/\/\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: 'file:///app' },
  { re: /file:\/\/\/[A-Za-z]:\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: 'file:///app' },
  { re: /file:\/\/\/home\/[^/"'\s)]+\/(?:[^/"'\s)]+\/)*cys-stift/g, to: 'file:///app' },
  { re: /file:\/\/\/[A-Za-z]:\/(?:[^/"'\s)]+\/)*cys-stift/g, to: 'file:///app' },
  { re: /\/Users\/[^/"'\s)]+\/projects\/cys-stift/g, to: '.' },
  { re: /\/home\/[^/"'\s)]+\/(?:[^/"'\s)]+\/)*cys-stift/g, to: '.' },
  { re: /[A-Za-z]:\\Users\\[^\\"'\s)]+\\projects\\cys-stift/g, to: '.' },
  { re: /[A-Za-z]:\\(?:[^\\"'\s)]+\\)*cys-stift/g, to: '.' },
  // Generic user-home URL prefixes and bare paths: catch non-cys-stift build
  // paths after the project-specific replacements. Binary files are still
  // detection-only; text paths are rewritten so a dependency cannot silently
  // publish the build user's home path.
  { re: /file:\/\/\/Users\/[^/"'\s)]+/g, to: 'file:///app' },
  { re: /file:\/\/\/home\/[^/"'\s)]+/g, to: 'file:///app' },
  { re: /\/Users\/[^/"'\s)]+(?:\/[^/"'\s)]+)*/g, to: '.' },
  { re: /\/home\/[^/"'\s)]+(?:\/[^/"'\s)]+)*/g, to: '.' },
  { re: /\/root\/[^/"'\s)]+(?:\/[^/"'\s)]+)*/g, to: '.' },
  { re: /[A-Za-z]:\\Users\\[^\\"'\s)]+(?:\\[^\\"'\s)]+)*/g, to: '.' },
  // 其他构建机常见前缀（macOS 临时目录 / Homebrew / CI root / /tmp）；只在路径
  // 明确指向本项目时替换，避免误改合法文本。
  { re: /\/private\/var\/[^"'\s)]*\/cys-stift/g, to: '.' },
  { re: /\/opt\/homebrew\/[^"'\s)]*\/cys-stift/g, to: '.' },
  { re: /\/root\/[^/"'\s)]*\/cys-stift/g, to: '.' },
  { re: /\/tmp\/[^/"'\s)]*\/cys-stift/g, to: '.' },
]

const LEAK = /(\/Users\/|file:\/\/\/Users\/|file:\/\/\/home\/|\/home\/[^/"'\s)]+\/|file:\/\/\/root\/|\/root\/[^/"'\s)]+\/|[A-Za-z]:\\Users\\|[A-Za-z]:\\(?:[^\\"'\s)]+\\)*cys-stift|\/home\/[^/"'\s)]+\/.*cys-stift|file:\/\/\/[A-Za-z]:\/(?:[^/"'\s)]+\/)*cys-stift|\/private\/var\/[^"'\s)]*\/cys-stift|\/opt\/homebrew\/[^"'\s)]*\/cys-stift|\/root\/[^/"'\s)]*\/cys-stift|\/tmp\/[^/"'\s)]*\/cys-stift)/

let removed = 0
let rewritten = 0
let scanned = 0
let binaryScanned = 0
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
    // Source maps are build-machine artifacts: never publish them. They also
    // carry absolute paths that text rewriting cannot safely scrub.
    if (ext === '.map') {
      await rm(full, { force: true })
      removed++
      continue
    }
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
    const bytes = await readFile(full)
    if (!TEXT_EXT.has(ext)) {
      binaryScanned++
      // Binary assets are not rewritten (changing bytes would break them), but
      // they must not ship a build-machine path either. latin1 preserves ASCII
      // byte sequences for the leak regex.
      if (LEAK.test(bytes.toString('latin1'))) leaks.push(`${path.relative(OUT, full)} (binary)`)
      continue
    }
    if (LEAK.test(bytes.toString('utf8'))) leaks.push(path.relative(OUT, full))
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
    if (!full.startsWith(chunksDir + path.sep)) continue
    const base = path.basename(full)
    const match = base.match(/^(.*)\.([0-9a-f]{16})\.js$/)
    if (!match) continue
    const [, prefix, oldHash] = match
    const content = await readFile(full)
    const newHash = createHash('sha256').update(content).digest('hex').slice(0, 16)
    if (newHash === oldHash) continue
    const newBase = `${prefix}.${newHash}.js`
    await rename(full, path.join(path.dirname(full), newBase))
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
console.log(`✓ web export sanitized: ${scanned} text files scanned, ${binaryScanned} binary files scanned, ${rewritten} rewritten, ${removed} scanner/OS artifacts removed`)
