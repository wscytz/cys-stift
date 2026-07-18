/**
 * Convert Markdown source into a compact card preview.
 *
 * Card grids are scan surfaces, not full document readers. Rendering the
 * source verbatim makes headings (`###`), list markers, code fences and
 * paragraph newlines look like broken content. Keep the useful text and
 * collapse formatting into readable spacing instead.
 */
export function markdownPreview(source: string, maxLength = 140): string {
  if (!source.trim()) return ''

  const plain = source
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').trim())
    .replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/~~~[^\n]*\n?/g, '').trim())
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/gm, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1$2')
    .replace(/(^|[^_])_([^_]+)_(?!_)/g, '$1$2')
    .replace(/<[^>]+>/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
