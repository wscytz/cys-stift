#!/usr/bin/env node
// 生成 debug/index.html:把 dist 内核闭包内联为 data URL 模块,产出单文件双击调试台。
// 零依赖(node 内置);先跑 `tsc -b` 产 dist,再跑本脚本。用法:node debug/build-debug-page.mjs
//
// 原理:tsc 的 ESM 产物用无扩展名相对导入(`from './dsl-grammar'`),浏览器不认;
// 按依赖拓扑后序遍历,把每个模块的相对导入改写成已构建子模块的
// `data:text/javascript;base64,…` 绝对 URL —— 子模块先编码,父模块引用之,
// 浏览器原生模块加载器直接可跑,不需要 import map / 打包器 / 服务器。
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = resolve(here, '..')
const dist = join(pkgRoot, 'dist')

// dsl-parser.gen.js 是 checked-in 的 peggy 产物(裸 .js,tsc 不拷贝)→ dist 天然缺它;
// 包本体走源码消费(main 指向 src),此处为浏览器闭包补齐,使 dist 自洽
const genSrc = join(pkgRoot, 'src', 'dsl-parser.gen.js')
const genDist = join(dist, 'dsl-parser.gen.js')
if (existsSync(genSrc) && !existsSync(genDist)) copyFileSync(genSrc, genDist)

// ——— 导入解析 ———
// tsc ESM 产物只有静态 import/export-from;匹配 `from './x'` 与副作用 `import './x'`。
const FROM_RE = /from\s*(['"])(\.[^'"\n]*)\1/g
const SIDE_EFFECT_RE = /(^|\n)(\s*)import\s*(['"])(\.[^'"\n]*)\3/g

function parseImports(src) {
  const specs = new Set()
  for (const m of src.matchAll(FROM_RE)) specs.add(m[2])
  for (const m of src.matchAll(SIDE_EFFECT_RE)) specs.add(m[4])
  return [...specs]
}

// ——— 拓扑后序构建:子模块先变 data URL,父模块改写引用 ———
const built = new Map() // absPath -> dataUrl

// tsc 产物导入无扩展名(`./types`),磁盘上是 `types.js` —— 手动补全
function resolveSpec(fromFile, spec) {
  const base = resolve(dirname(fromFile), spec)
  return existsSync(base) ? base : `${base}.js`
}

function buildModule(absPath) {
  if (built.has(absPath)) return built.get(absPath)
  // 循环依赖在 ESM 下合法,但内核闭包已验证无环;遇环直接报错防静默坏产物
  if (built.get(absPath) === null) throw new Error(`import cycle at ${absPath}`)
  built.set(absPath, null)
  let src = readFileSync(absPath, 'utf8')
  for (const spec of parseImports(src)) {
    const child = buildModule(resolveSpec(absPath, spec))
    src = src.split(`'${spec}'`).join(`'${child}'`)
  }
  const url = `data:text/javascript;base64,${Buffer.from(src, 'utf8').toString('base64')}`
  built.set(absPath, url)
  return url
}

// ——— 收集闭包(从两个入口 BFS 拿模块清单,再统一构建) ———
const entries = ['index.js', 'routing.js'].map((f) => {
  const p = join(dist, f)
  if (!existsSync(p)) throw new Error(`缺 ${p} —— 先跑 tsc -b 产 dist`)
  return p
})
const closure = new Set()
const queue = [...entries]
while (queue.length) {
  const p = queue.pop()
  if (closure.has(p)) continue
  closure.add(p)
  for (const spec of parseImports(readFileSync(p, 'utf8'))) {
    queue.push(resolveSpec(p, spec))
  }
}
for (const p of closure) buildModule(p)

const [indexUrl, routingUrl] = entries.map(buildModule)
const totalKb = Math.round(
  [...closure].reduce((n, p) => n + readFileSync(p, 'utf8').length, 0) / 1024,
)

let commit = 'unknown'
try {
  commit = execSync('git rev-parse --short HEAD', { cwd: pkgRoot, encoding: 'utf8' }).trim()
} catch {
  /* 非 git 环境照常生成 */
}
const stamp = `${new Date().toISOString().slice(0, 10)} · commit ${commit} · 内核闭包 ${closure.size} 模块 / ${totalKb}KB`

const template = readFileSync(join(here, 'template.html'), 'utf8')
const html = template
  .replace('__INDEX_URL__', indexUrl)
  .replace('__ROUTING_URL__', routingUrl)
  .replace('__STAMP__', stamp)

const out = join(here, 'index.html')
writeFileSync(out, html)
console.log(
  `debug/index.html 生成:闭包 ${closure.size} 模块 ${totalKb}KB → ${(html.length / 1024).toFixed(0)}KB 单文件(${stamp})`,
)
