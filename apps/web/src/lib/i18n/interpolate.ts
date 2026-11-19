/**
 * 文案插值(单遍正则 + 回调替换)。三个不变量:
 * 1. 同一参数可出现多次(如「锚点 {anchor} 不存在…先写 [card {anchor} create]」)
 *    —— 逐 key 的 replace/replaceAll 只换得到第一处(2026-11-19 截图实锤裸占位符)。
 * 2. 参数值里的 `$&`/`` $` ``/`$'`/`$$` 不是替换模式 —— 用回调返回值;字符串
 *    replacement 的 $ 语义会把它当模式展开(审核实锤:title 'A $& B' → 'A {title} B')。
 * 3. 单遍:参数值里的 `{other}` 不会被后续参数再替换(逐 key 替换会嵌套展开)。
 * 未知的 `{xxx}`(不在 params 里)原样保留。
 */
export function interpolateMessage(
  msg: string,
  params: Record<string, string | number | null | undefined>,
): string {
  return msg.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(params, key) ? String(params[key] ?? '') : match,
  )
}
