import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { copyFileSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const source = fileURLToPath(new URL('../', import.meta.url))
const root = fileURLToPath(new URL('../../../', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'cys-dsl-pack-'))
const stage = join(temp, 'workspace/packages/cys-dsl')
const consumer = join(temp, 'consumer')
const env = { ...process.env, NODE_PATH: '', NODE_OPTIONS: '' }

function run(command, args, cwd, expected = 0) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 60_000 })
  if (result.error) throw result.error
  assert.equal(result.status, expected, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result
}

try {
  mkdirSync(stage, { recursive: true })
  mkdirSync(consumer)
  for (const name of ['package.json', 'README.md', 'tsconfig.json', 'tsconfig.build.json']) {
    copyFileSync(join(source, name), join(stage, name))
  }
  copyFileSync(join(root, 'LICENSE'), join(stage, 'LICENSE'))
  copyFileSync(join(root, 'tsconfig.base.json'), join(temp, 'workspace/tsconfig.base.json'))
  copyFileSync(join(root, 'pnpm-workspace.yaml'), join(temp, 'workspace/pnpm-workspace.yaml'))
  cpSync(join(source, 'src'), join(stage, 'src'), { recursive: true })
  symlinkSync(join(source, 'node_modules'), join(stage, 'node_modules'), 'junction')

  run('pnpm', ['run', 'build'], stage)
  const manifest = JSON.parse(readFileSync(join(stage, 'package.json'), 'utf8'))
  run('pnpm', ['pack', '--pack-destination', temp], stage)
  const archive = join(temp, `wscytz-dsl-${manifest.version}.tgz`)

  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ private: true, name: 'dsl-pack-consumer' }))
  run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', archive], consumer)
  const installed = JSON.parse(readFileSync(join(consumer, 'node_modules/@wscytz/dsl/package.json'), 'utf8'))
  assert.equal(installed.version, manifest.version)
  assert.equal(installed.bin['cys-dsl'], './dist/cli.js')
  for (const field of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    assert.deepEqual(installed[field] ?? {}, {})
  }
  const api = run(process.execPath, ['--input-type=module', '-e', `
    import assert from 'node:assert/strict'
    import { DSL_VERSION, parseDsl } from '@wscytz/dsl'
    assert.equal(parseDsl('[card #api] @pos(0,0)')[0].cardId, 'api')
    process.stdout.write(String(DSL_VERSION))
  `], consumer)
  assert.match(api.stdout, /^\d+$/)

  writeFileSync(join(consumer, 'sample.sift'), String.raw`[card #idea] @pos(80,80) @size(240,120) @title("想法 \"引用\"") @content("第一行\n第二行")
[card #evidence] right-of #idea @gap(48) @title("证据")
[arrow #link] from #idea to #evidence @label("参考")
`)
  writeFileSync(join(consumer, 'invalid.sift'), '[card #missing create] @title("缺位置")\n')
  const cli = join(consumer, 'node_modules/.bin/cys-dsl')
  const valid = run(cli, ['validate', 'sample.sift'], consumer)
  assert.match(valid.stdout, new RegExp(`v${api.stdout} · validate`))
  assert.equal(valid.stderr, '')
  assert.match(run(cli, ['validate', 'invalid.sift'], consumer, 1).stderr, /parse.*1/)
  assert.notEqual(run(cli, ['validate', 'absent.sift'], consumer, 2).stderr, '')

  const { nodes, edges } = JSON.parse(run(cli, ['render', 'sample.sift'], consumer).stdout)
  assert.equal(nodes.length, 2)
  assert.equal(nodes.find(node => node.id === 'idea').text, '想法 "引用"')
  assert.equal(nodes.find(node => node.id === 'idea').cys.content, '第一行\n第二行')
  assert.equal(nodes.find(node => node.id === 'evidence').x, 368)
  assert.deepEqual(edges.map(({ fromNode, toNode }) => [fromNode, toNode]), [['idea', 'evidence']])
  const svg = run(cli, ['render', 'sample.sift', '--svg'], consumer).stdout
  assert.match(svg, /<svg\b/)
  assert.match(svg, /证据/)
  assert.match(run(cli, ['roundtrip', 'sample.sift'], consumer).stdout, /roundtrip:STABLE\(3 op/)

  console.log(`@wscytz/dsl ${installed.version} (grammar v${api.stdout}): offline package API, CLI, diagnostics and roundtrip passed`)
} finally {
  rmSync(temp, { recursive: true, force: true })
}
