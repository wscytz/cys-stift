/**
 * 动效 token 三源同步守卫。
 *
 * tokens.css / tokens.ts / tailwind-preset.css 是同一套 token 的三面镜像
 * (改一处改三处 —— tokens.css 头注释的纪律)。本测试把 motion 族
 * (--duration-* / --stagger-* / --ease-*)钉进回归:三源任一处漂移
 * (改名/改值/漏加)即红。动效二轮(2026-08-24)新增 enter/row/title/
 * press/flash + staggerRow/staggerStep 后引入。
 *
 * 路径用相对 import.meta.url 走 monorepo 源码(ui 包无测试基建,挂 web 侧)。
 * 已知命名例外:--ease-standard ↔ tokens.ts motion.ease(历史命名,非 standard)。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'

// process.cwd() 拼路径(不用 new URL(..., import.meta.url) —— vite 会静态
// 分析该模式并当作资源导入处理,把 ui 包组件图拖进测试转换,炸在 CSS module)。
// vitest 的 cwd 恒为 apps/web(单测与 pnpm -r test 两种跑法均是)。
const uiSrc = (file: string) => readFileSync(resolve(process.cwd(), '../../packages/ui/src', file), 'utf8')

/** tokens.css 里所有 motion 族变量(name → value)。 */
function motionVars(css: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const m of css.matchAll(/--(duration|stagger|ease)-([\w-]+):\s*([^;]+);/g)) {
    out.set(`--${m[1]!}-${m[2]!}`, m[3]!.trim())
  }
  return out
}

/** tokens.ts 的 motion 对象(key → value),纯文本解析 —— 比模块导入更诚实:
 *  比的是三份源码的字面同步,且不走 vite 的包 exports 解析(会拖进组件图)。 */
function motionTs(source: string): Map<string, string> {
  const block = /motion:\s*\{([\s\S]*?)\n\s*\},/.exec(source)?.[1] ?? ''
  const out = new Map<string, string>()
  for (const m of block.matchAll(/(\w+):\s*'([^']+)'/g)) out.set(m[1]!, m[2]!)
  return out
}

const kebabToCamel = (s: string) => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())

describe('motion token 三源同步', () => {
  const tokensCss = motionVars(uiSrc('tokens.css'))
  const presetCss = motionVars(uiSrc('tailwind-preset.css'))
  const tsMotion = motionTs(uiSrc('tokens.ts'))

  it('三源的 motion 族均非空(防解析失效假绿)', () => {
    expect(tokensCss.size).toBeGreaterThanOrEqual(9)
    expect(presetCss.size).toBe(tokensCss.size)
    expect(tsMotion.size).toBeGreaterThanOrEqual(9)
  })

  it('tailwind-preset.css 与 tokens.css 逐变量同名同值', () => {
    const drift: string[] = []
    for (const [name, value] of tokensCss) {
      if (presetCss.get(name) !== value) {
        drift.push(`${name}: tokens.css=${value} preset=${presetCss.get(name) ?? '<缺失>'}`)
      }
    }
    expect(drift, drift.join('\n')).toEqual([])
  })

  it('tokens.ts motion 与 tokens.css 同值(命名例外:--ease-standard→ease)', () => {
    const drift: string[] = []
    for (const [name, value] of tokensCss) {
      // 键映射按族:--duration-X → X;--ease-X → X(--ease-standard→ease 历史
      // 例外);--stagger-X → stagger + X 首字母大写(staggerRow/staggerStep)。
      let key: string
      if (name.startsWith('--stagger-')) key = 'stagger' + kebabToCamel(name.slice('--stagger-'.length)).replace(/^./, (c) => c.toUpperCase())
      else if (name === '--ease-standard') key = 'ease'
      else key = kebabToCamel(name.replace(/^--(?:duration|ease)-/, ''))
      if (tsMotion.get(key) !== value) {
        drift.push(`${name}: css=${value} ts=${tsMotion.get(key) ?? `<motion.${key} 缺失>`}`)
      }
    }
    expect(drift, drift.join('\n')).toEqual([])
  })
})
