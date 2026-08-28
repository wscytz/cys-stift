#!/usr/bin/env node

/**
 * Check relative links in the user-facing Markdown surface without network access.
 * External URLs are intentionally left to the browser/CI's external checks;
 * this gate catches renamed or removed files in the public entry points.
 *
 * 存在性按 git 索引(git ls-files)判定,而非工作区 stat():gitignored 但本地
 * 存在的文件曾让死链假绿(swiss-editorial.md 被 .gitignore 拦了两天,README 和
 * packages/ui/CLAUDE.md 一直指着它,本地 stat() 绿、仓库内容实际 404)。
 * 工作区存在 ≠ 仓库存在 —— 门只认仓库内容。
 */
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const execFileP = promisify(execFile)
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

let trackedCache = null
/** git 索引里的 tracked 文件集(ROOT 相对路径)。git 不可用即硬失败 —— 门不允许静默退化。 */
async function trackedFiles() {
  if (trackedCache) return trackedCache
  const { stdout } = await execFileP('git', ['-C', ROOT, 'ls-files'])
  trackedCache = new Set(stdout.split('\n').filter(Boolean))
  return trackedCache
}

async function existsAsDocument(absPath) {
  const rel = relative(ROOT, absPath)
  if (rel.startsWith('..')) return false // 仓外目标一律不认
  const files = await trackedFiles()
  if (files.has(rel)) return true
  // 目录链接:索引里有文件落在该目录内才算存在;约定 index 文档再验一层。
  const prefix = rel === '' ? '' : `${rel}/`
  let hasDir = false
  for (const f of files) {
    if (f.startsWith(prefix)) {
      hasDir = true
      break
    }
  }
  if (!hasDir) return false
  for (const index of ['README.md', 'index.md', 'index.html']) {
    if (files.has(`${rel}/${index}`)) return true
  }
  return false
}

const files = [
  join(ROOT, 'README.md'),
  join(ROOT, 'docs/development/setup.md'),
  join(ROOT, 'docs/user/README.md'),
  join(ROOT, 'docs/user/privacy.md'),
  join(ROOT, 'docs/user/transliteration.md'),
  join(ROOT, 'packages/ui/CLAUDE.md'),
  // docs/changelog.md 故意不在严格本地链接门内:它是历史档,含大量指向私有仓
  // (cys-stift-docs)的 plans/decisions/reviews/design 内部引用(已迁出),且夹两处
  // 非链接的 `[文字](...)` 文本。面向用户的顶部 STATE.md 指针已改成纯文本。
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
