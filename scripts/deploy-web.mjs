#!/usr/bin/env node
// scripts/deploy-web.mjs
// 一键部署「网页测试版」到 Aliyun ECS(wscytz.com/cys-stift/app)。
//
// 流程:本地静态导出(带 WEB_DEPLOY_BASEPATH 子路径)→ 服务器备份旧版(app.bak-<ver>)
//       → scp 上传 → HTTPS 全路由 200 验证。
//
// 用法(仓库根目录):
//   node scripts/deploy-web.mjs            # build + 备份 + 上传 + 验证
//   node scripts/deploy-web.mjs --no-build # 跳过本地 build(已构建过,直接传 out/)
//   node scripts/deploy-web.mjs --verify-only # 只 curl 验证线上,不改任何东西
//
// 环境变量(全部可选,默认走下面的常量):
//   SERVER_HOST  服务器 ssh 主机(默认 root@47.100.54.149)
//   APP_REMOTE_DIR 服务器上 app 目录(默认 /var/www/wscytz/cys-stift/app)
//   BASE_PATH    子路径(默认 /cys-stift/app;与 next.config.ts 的 WEB_DEPLOY_BASEPATH 一致)
//   DEPLOY_URL   验证用 HTTPS 根(默认 https://wscytz.com/cys-stift/app)
//
// 无第三方依赖 —— 只用 node:child_process + node:fs。Node 18+。
// 服务器需配好 ssh 免密(keys)。见 docs/development/deploy.md。

import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = process.cwd()
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const VERSION = PKG.version

const SERVER = process.env.SERVER_HOST || 'root@47.100.54.149'
const APP_DIR = process.env.APP_REMOTE_DIR || '/var/www/wscytz/cys-stift/app'
const BASE_PATH = process.env.BASE_PATH || '/cys-stift/app'
const URL = process.env.DEPLOY_URL || `https://wscytz.com/cys-stift/app`

const args = process.argv.slice(2)
const NO_BUILD = args.includes('--no-build')
const VERIFY_ONLY = args.includes('--verify-only')

const run = (cmd, label) => {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(cmd, { shell: true, cwd: ROOT, encoding: 'utf8' })
  if (r.status !== 0) {
    console.error(`✗ 失败(exit ${r.status})`)
    if (r.stdout) console.error(r.stdout)
    if (r.stderr) console.error(r.stderr)
    process.exit(1)
  }
  return r.stdout
}

const ssh = (cmd, label) => run(`ssh -o ConnectTimeout=10 ${SERVER} "${cmd}"`, label)

/** 从服务器现有 index.html 提取版本号,做备份目录名(对齐 app.bak-<ver> 惯例)。 */
const serverVersion = () => {
  const out = run(
    `ssh -o ConnectTimeout=10 ${SERVER} "grep -oE '[0-9]+\\.[0-9]+\\.[0-9]+(-preview\\.[0-9]+)?' ${APP_DIR}/index.html 2>/dev/null | head -1"`,
    '读服务器旧版版本号',
  ).trim()
  return out || 'unknown'
}

console.log(`cy's Stift 网页测试版部署 v${VERSION} → ${SERVER}:${APP_DIR}`)

if (VERIFY_ONLY) {
  const routes = ['', 'inbox', 'canvas', 'workbench', 'ask', 'graph', 'search', 'settings', 'timeline', 'trash', 'tags', 'dev/dsl-playground']
  console.log('\n▶ 验证线上 HTTPS 路由')
  let bad = 0
  for (const r of routes) {
    const code = spawnSync(`curl -s -o /dev/null -w '%{http_code}' '${URL}/${r}/'`, { shell: true, cwd: ROOT, encoding: 'utf8' }).stdout.trim()
    const ok = code === '200'
    if (!ok) bad++
    console.log(`  ${ok ? '✓' : '✗'} ${code}  ${r || '(首页)'}/`)
  }
  console.log(bad === 0 ? '\n✅ 线上全部 200' : `\n❌ ${bad} 个路由非 200`)
  process.exit(bad === 0 ? 0 : 1)
}

// 1) 本地静态导出(带子路径)。
if (NO_BUILD) {
  console.log('\n▶ 跳过本地 build(--no-build),直接上传 apps/web/out')
} else {
  run(
    `WEB_DEPLOY_BASEPATH=${BASE_PATH} pnpm --filter web build`,
    `本地静态导出(子路径 ${BASE_PATH}, v${VERSION})`,
  )
}
// basePath 前缀校验对两条路径统一执行(ocr 审 S4 P2-2):--no-build 上传根路径
// build 的陈旧产物时,HTML 200 但 /_next 资产 404 → 白屏,而最终 curl 只查首页
// 查不出来。读 out/index.html 不依赖「刚构建」,提出 if 外。
{
  const idx = readFileSync(resolve(ROOT, 'apps/web/out/index.html'), 'utf8')
  if (!idx.includes(`${BASE_PATH}/_next`)) {
    console.error(`✗ 产物未带 ${BASE_PATH} 前缀 —— 构建可能未走 basePath,中止部署`)
    process.exit(1)
  }
}

// 2) 备份服务器旧版。
const prev = serverVersion()
ssh(
  `cd ${APP_DIR.replace(/\/app$/, '')} && rm -rf app.bak-${prev} && cp -a app app.bak-${prev} && echo "备份 app → app.bak-${prev}"`,
  `备份服务器旧版 v${prev}`,
)

// 3) 清空目标 + 上传。
ssh(
  `find ${APP_DIR} -mindepth 1 -delete && echo "清空目标 ${APP_DIR}"`,
  '清空上传目标(防残留旧 hash 文件)',
)
run(
  `scp -r apps/web/out/. ${SERVER}:${APP_DIR}/`,
  `scp 上传 apps/web/out/ → ${APP_DIR}/`,
)

// 4) 验证。
run(
  `ssh -o ConnectTimeout=10 ${SERVER} "grep -o '${VERSION}' ${APP_DIR}/index.html | head -1"`,
  '服务器 index.html 版本确认',
)
const finalCode = spawnSync(`curl -s -o /dev/null -w '%{http_code}' '${URL}/'`, { shell: true, cwd: ROOT, encoding: 'utf8' }).stdout.trim()
if (finalCode !== '200') {
  console.error(`✗ 首页非 200(${finalCode})`)
  process.exit(1)
}

console.log(`\n✅ 部署完成 v${VERSION}\n   线上: ${URL}/\n   备份: app.bak-${prev}\n   回滚: mv app app.bak-${VERSION} && mv app.bak-${prev} app`)
