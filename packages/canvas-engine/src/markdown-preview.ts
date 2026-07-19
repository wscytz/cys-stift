/** Strip inline Markdown syntax while keeping the text a reader needs. */
function stripInlineMarkdown(source: string): string {
  let text = source
    // Preserve autolink text before treating angle brackets as HTML.
    .replace(/<((?:https?:\/\/|mailto:)[^>]+)>/gi, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[\^([^\]]+)\]/g, '$1')
    .replace(/`{1,3}([^`\n]+)`{1,3}/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\\([\\`*{}\[\]()#+.!_>~-])/g, '$1')
    .replace(/<[^>]+>/g, '')
    // A small entity table is enough for the characters commonly written in
    // card bodies and avoids adding a browser-only decoder to the engine.
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/gi, (_, entity: string) => {
      switch (entity.toLowerCase()) {
        case 'amp': return '&'
        case 'lt': return '<'
        case 'gt': return '>'
        case 'quot': return '"'
        case 'apos': return "'"
        default: return ' '
      }
    })

  // Strong/emphasis can be nested (for example `**重点 _说明_**`). A couple
  // of bounded passes remove the paired delimiters without treating a lone
  // multiplication/underscore character as formatting.
  for (let pass = 0; pass < 2; pass += 1) {
    text = text
      .replace(/(\*\*|__)([^\n]*?)\1/g, '$2')
      .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
      .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1$2')
  }
  return text
}

function isHorizontalRule(line: string): boolean {
  return /^(?:[-*_][ \t]*){3,}$/.test(line)
}

function isTableSeparator(line: string): boolean {
  const cells = line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

/**
 * Convert Markdown source into plain text for compact visual previews.
 *
 * This is deliberately not a Markdown renderer. A card preview has a small,
 * fixed number of rows, so blank Markdown paragraphs must not consume rows
 * that should show useful content. Meaningful line boundaries (paragraphs,
 * list items, table rows, and code lines) are retained for canvas/list
 * renderers to wrap.
 */
export function markdownPreview(source: string, maxLength = 140): string {
  if (typeof source !== 'string' || !source.trim()) return ''

  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const readable: string[] = []
  let fence: '`' | '~' | null = null

  for (const raw of lines) {
    let line = raw.trim()
    const fenceMatch = line.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      const marker = fenceMatch[1]![0] as '`' | '~'
      if (fence === null) fence = marker
      else if (fence === marker) fence = null
      continue
    }
    if (!line) continue
    if (fence !== null) {
      readable.push(line.replace(/[ \t]+/g, ' ').trim())
      continue
    }
    if (isHorizontalRule(line)) continue

    // Markdown table separator rows have no user content. Drop the row, but
    // keep ordinary table rows readable by removing only edge pipes.
    if (isTableSeparator(line)) continue
    const tableLike = line.startsWith('|') || line.endsWith('|')
    if (line.startsWith('|')) line = line.slice(1)
    if (line.endsWith('|')) line = line.slice(0, -1)

    // Remove block markers repeatedly so nested quotes/lists do not leak
    // `>`, `*`, or a task checkbox into a card preview.
    line = line
      .replace(/^(?:>[ \t]?)+/, '')
      .replace(/^(?:(?:[-*+]|\d+[.)])[ \t]+)+/, '')
      .replace(/^\[(?:[ xX])\][\t ]+/, '')
      .replace(/^[ \t]{0,3}#{1,6}[ \t]*/, '')
      // ATX headings may repeat closing hashes: `### Title ###`.
      .replace(/[ \t]+#{1,6}[ \t]*$/, '')
      .replace(/^\[\^[^\]]+\]:[ \t]*/, '')

    line = stripInlineMarkdown(line).replace(/[ \t]+/g, ' ').trim()
    if (tableLike) line = line.replace(/[ \t]*\|[ \t]*/g, ' · ')
    if (line) readable.push(line)
  }

  const plain = readable.join('\n').trim()
  if (plain.length <= maxLength) return plain
  return `${plain.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`
}
