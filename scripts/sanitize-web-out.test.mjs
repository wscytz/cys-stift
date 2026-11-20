// Fixture test for the post-build privacy sanitizer. Runs the real script with
// SANITIZE_WEB_OUT pointed at a temp export, so text rewriting and the binary
// leak gate are covered without a full Next build.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const script = resolve('scripts/sanitize-web-out.mjs')
const tempDirs = []

async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'cys-stift-sanitize-'))
  tempDirs.push(dir)
  await mkdir(join(dir, '_next/static/chunks'), { recursive: true })
  return dir
}

function runSanitizer(outDir) {
  return spawnSync(process.execPath, [script], {
    encoding: 'utf8',
    env: { ...process.env, SANITIZE_WEB_OUT: outDir },
  })
}

try {
  // Safe fixture: generic file URL is rewritten; a binary with no leak passes.
  const safe = await fixture()
  await writeFile(join(safe, 'index.html'), '<a href="file:///Users/alice/not-the-project/app.js">x</a>')
  await writeFile(join(safe, 'safe.bin'), Buffer.from([0, 1, 2, 3, 255]))
  const safeRun = runSanitizer(safe)
  assert.equal(safeRun.status, 0, safeRun.stderr || safeRun.stdout)
  assert.match(safeRun.stdout, /binary files scanned/)
  assert.match(safeRun.stdout, /1 rewritten/)

  // Binary leak: the sanitizer must fail instead of publishing the bytes.
  const binaryLeak = await fixture()
  await writeFile(join(binaryLeak, 'leak.bin'), Buffer.from('prefix /Users/alice/secret suffix'))
  const binaryRun = runSanitizer(binaryLeak)
  assert.equal(binaryRun.status, 1, binaryRun.stdout)
  assert.match(binaryRun.stderr, /leak\.bin \(binary\)/)

  // Bare home path in text is rewritten too; binary paths remain detection-only.
  const textHome = await fixture()
  await writeFile(join(textHome, 'note.txt'), '/home/alice/secret')
  const textRun = runSanitizer(textHome)
  assert.equal(textRun.status, 0, textRun.stderr || textRun.stdout)
  assert.equal(await readFile(join(textHome, 'note.txt'), 'utf8'), '.')

  console.log('PASS  sanitizer fixture: text rewrite, binary scan, bare home rewrite')
} finally {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })))
}
