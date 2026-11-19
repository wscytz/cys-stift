/**
 * dsl-seed — 画布页 `?dsl=` URL 参数的读取/校验(外部 AI/分享入口)。
 *
 * 外部 AI(或分享链接)把 urlencoded DSL 带进 `/canvas/?dsl=…`,画布页打开转义
 * 对话框并预填审核。复用粘贴桥的既有链路(dslSeedText → DslDialog initialText):
 * **不自动应用**,确认门不变 —— URL 里的内容和其他来路一样要过预演/确认。
 *
 * 这里只做纯读取:trim、非空、长度上限。解析/清洗/求解仍由对话渲染链负责
 * (parse 永不抛错,坏行进诊断面板 —— 外部 AI 也能借此看到错误反馈界面)。
 *
 * 超限不再静默截断:截断后的 DSL 语法/语义都可能变形(行被切一半、@pos 少括号),
 * 应用的是用户没写过的内容。调用方应拒绝并在界面上说明,而不是打开一个预填了
 * 半截文本的对话框。
 */

/** 长度上限:URL 实践长度远小于此;DSL 本身还有 DSL_MAX_OPS 行数上限兜底。 */
export const DSL_SEED_MAX_CHARS = 20000

export type DslSeedReadResult =
  | { ok: true; text: string }
  | { ok: false; reason: 'too-long'; length: number; max: number }

/**
 * 读取 `?dsl=`。返回 null = 没有这个参数或值为空白(静默忽略);
 * 返回 rejection = 有内容但超限(调用方必须显式告知用户,不得截断应用)。
 */
export function readDslSeed(search: string): DslSeedReadResult | null {
  let raw: string | null = null
  try {
    raw = new URLSearchParams(search).get('dsl')
  } catch {
    return null
  }
  if (raw === null) return null
  const text = raw.trim()
  if (!text) return null
  if (text.length > DSL_SEED_MAX_CHARS) {
    return { ok: false, reason: 'too-long', length: text.length, max: DSL_SEED_MAX_CHARS }
  }
  return { ok: true, text }
}

/**
 * 从 query string 里摘掉一个参数：其余参数在语义上原样保留（重复参数仍在），
 * 但 URLSearchParams 会按标准重编码（例如 `%20` → `+`）。当前组合字段只有
 * `?card=`，重编码无副作用；若未来加入编码敏感字段，需要改成按原文切片。
 * 无该参数时返回原串（调用方据此跳过 replaceState，避免无谓历史操作）。
 *
 * 用于 `?dsl=` 的一次性语义:入口消费后立刻从地址栏移除,刷新/切画布/重新
 * 挂载都不会再次注入;不整段清空 query,`?card=` 等组合字段照常生效。
 */
export function removeSearchParam(search: string, name: string): string {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return search
  }
  if (!params.has(name)) return search
  params.delete(name)
  const next = params.toString()
  return next ? `?${next}` : ''
}
