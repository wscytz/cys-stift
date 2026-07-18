/**
 * Convert Markdown source into plain text for compact visual previews.
 * Newlines are preserved so each renderer can apply its own line cap.
 */
export function markdownPreview(source: string, maxLength = 140): string {
  if (!source.trim()) return ''

  const plain = source
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```[^\n]*\n?/g, '').trim())
    .replace(/~~~[\s\S]*?~~~/g, (block) => block.replace(/~~~[^\n]*\n?/g, '').trim())
    .replace(/^\s{0,3}#{1,6}\s*/gm, '')
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
