/**
 * preview-text - 把 markdown body 剥成单行纯文本预览(库页堆叠卡/行预览用)。
 *
 * 为什么:body 是 markdown 源,直接 `slice` 会裸露 `#`/`**`/`[[]`/代码符,预览不可读。
 * 这里做**轻量剥离**(正则,非完整 markdown 解析,YAGNI):取首非空行,剥标记,截断。
 * 不追求完美还原,只要比裸 markdown 可读;详情/工作台编辑器仍看完整渲染。
 */

/**
 * 剥 markdown 标记 -> 单行纯文本预览。
 * 取首非空行(跳过空行 / hr 分隔线 / 代码围栏开口),剥内联标记,按 maxLen 截断。
 * 空 body 或全空 -> ''。
 */
export function plainPreview(md: string, maxLen: number): string {
  if (!md) return ''
  const lines = md.split('\n')
  let first = ''
  for (const raw of lines) {
    const s = raw.trim()
    if (!s) continue
    if (/^[-*_]{3,}$/.test(s)) continue // hr 分隔线
    if (/^`{3,}/.test(s)) continue // 代码围栏开口(```ts),取下一行作预览
    first = s
    break
  }
  if (!first) return ''
  let t = first
  t = t.replace(/^#{1,6}\s*/, '') // 标题 #/##/…
  t = t.replace(/^>\s*/, '') // 引用 >
  t = t.replace(/^[-*+]\s+/, '') // 无序列表 -/*/+
  t = t.replace(/^\d+\.\s+/, '') // 有序列表 1.
  t = t.replace(/^!\[([^\]]*)\]\([^)]*\)/, '$1') // 图片 ![alt](url) -> alt
  t = t.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 链接 [text](url) -> text
  t = t.replace(/\[\[([^\]]+)\]\]/g, '$1') // wikilink [[x]] -> x
  t = t.replace(/`{1,3}([^`]+)`{1,3}/g, '$1') // `code` / ```code```
  t = t.replace(/\*\*([^*]+)\*\*/g, '$1') // **粗**
  t = t.replace(/__([^_]+)__/g, '$1') // __粗__
  t = t.replace(/\*([^*]+)\*/g, '$1') // *斜*
  t = t.replace(/_([^_]+)_/g, '$1') // _斜_
  t = t.replace(/~~([^~]+)~~/g, '$1') // ~~删~~
  t = t.replace(/\s+/g, ' ').trim()
  if (t.length > maxLen) return t.slice(0, maxLen) + '…'
  return t
}
