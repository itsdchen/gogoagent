function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character] ?? character)
}

function inline(text: string, depth = 0): string {
  if (depth > 8) return escapeHtml(text)
  let result = ''
  for (let index = 0; index < text.length;) {
    const marker = text[index]
    if (marker === '`') {
      const end = text.indexOf('`', index + 1)
      if (end > index + 1) {
        result += `<code>${escapeHtml(text.slice(index + 1, end))}</code>`
        index = end + 1
        continue
      }
    }
    if (text.startsWith('**', index)) {
      const end = text.indexOf('**', index + 2)
      if (end > index + 2) {
        result += `<strong>${inline(text.slice(index + 2, end), depth + 1)}</strong>`
        index = end + 2
        continue
      }
    }
    if (marker === '*' || marker === '_') {
      const end = text.indexOf(marker, index + 1)
      if (end > index + 1) {
        result += `<em>${inline(text.slice(index + 1, end), depth + 1)}</em>`
        index = end + 1
        continue
      }
    }
    result += escapeHtml(marker)
    index += 1
  }
  return result
}

function tableCells(line: string) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim())
}

function isTableRule(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function isBlockStart(lines: string[], index: number) {
  const line = lines[index] ?? ''
  return /^\s*(?:#{1,6}\s|```|~~~|>|[-*+]\s|\d+[.)]\s|---+\s*$|\*\*\*+\s*$)/.test(line)
    || (line.includes('|') && isTableRule(lines[index + 1] ?? ''))
}

export function renderMarkdownReader(source: string): string {
  const lines = source.replace(/\r\n?/g, '\n').split('\n')
  const blocks: string[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index]
    if (!line.trim()) { index += 1; continue }
    const fence = line.match(/^\s*(```+|~~~+)(.*)$/)
    if (fence) {
      const marker = fence[1][0]
      const width = fence[1].length
      const code: string[] = []
      index += 1
      while (index < lines.length && !new RegExp(`^\\s*${marker}{${width},}\\s*$`).test(lines[index])) code.push(lines[index++])
      if (index < lines.length) index += 1
      blocks.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = line.match(/^\s*(#{1,6})\s+(.+?)\s*#*\s*$/)
    if (heading) {
      const level = heading[1].length
      blocks.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      index += 1
      continue
    }
    if (/^\s*(?:---+|\*\*\*+)\s*$/.test(line)) {
      blocks.push('<hr>')
      index += 1
      continue
    }
    if (line.includes('|') && isTableRule(lines[index + 1] ?? '')) {
      const headers = tableCells(line)
      const rows: string[] = []
      index += 2
      while (index < lines.length && lines[index].trim() && lines[index].includes('|')) {
        const cells = tableCells(lines[index++])
        rows.push(`<tr>${headers.map((_, cell) => `<td>${inline(cells[cell] ?? '')}</td>`).join('')}</tr>`)
      }
      blocks.push(`<div class="reader-table-scroll"><table><thead><tr>${headers.map((cell) => `<th>${inline(cell)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`)
      continue
    }
    if (/^\s*>/.test(line)) {
      const quote: string[] = []
      while (index < lines.length && /^\s*>/.test(lines[index])) quote.push(lines[index++].replace(/^\s*>\s?/, ''))
      blocks.push(`<blockquote>${quote.map((part) => inline(part)).join('<br>')}</blockquote>`)
      continue
    }
    const list = line.match(/^\s*([-*+]|\d+[.)])\s+(.+)$/)
    if (list) {
      const ordered = /^\d/.test(list[1])
      const items: string[] = []
      while (index < lines.length) {
        const item = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.+)$/)
        if (!item || /^\d/.test(item[1]) !== ordered) break
        items.push(`<li>${inline(item[2])}</li>`)
        index += 1
      }
      const tag = ordered ? 'ol' : 'ul'
      blocks.push(`<${tag}>${items.join('')}</${tag}>`)
      continue
    }
    const paragraph = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim() && !isBlockStart(lines, index)) paragraph.push(lines[index++].trim())
    blocks.push(`<p>${inline(paragraph.join(' '))}</p>`)
  }
  return `<article class="reader-markdown">${blocks.join('')}</article>`
}
