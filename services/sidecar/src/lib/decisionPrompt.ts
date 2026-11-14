import { createHash } from 'node:crypto'

export interface DecisionChoice {
  value: string
  label: string
}

export interface DecisionPrompt {
  id: string
  excerpt: string
  choices: DecisionChoice[]
}

export function decisionQuestion(prompt: DecisionPrompt): string | undefined {
  const lines = prompt.excerpt.split('\n').map((line) => line.trim()).filter(Boolean)
  const choiceIndex = lines.findIndex((line) => /^(?:[›❯>•*-]\s*)?[1-9]\d?[.)]\s+/.test(line))
  const candidates = choiceIndex >= 0
    ? lines.slice(Math.max(0, choiceIndex - 3), choiceIndex)
    : lines.slice(-2)
  const question = [...candidates].reverse().find((line) => line.includes('?'))
  return question?.slice(0, 220)
}

function visibleText(data: string) {
  return data
    .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, '')
    .replace(/\x1bP[\s\S]*?\x1b\\/g, '')
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/\r(?!\n)/g, '\n')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
}

// Only the latest visible prompt may supply buttons. Older numbered plans and
// approval menus remain in the log, so scanning the entire tail is unsafe.
export function decisionPromptFromLog(data: string): DecisionPrompt {
  const lines = visibleText(data.slice(-12_000)).split('\n').map((line) => line.trim()).filter(Boolean)
  const tail = lines.slice(-14)
  const excerpt = tail.slice(-8).join('\n').slice(-900)
  const numbered = /^(?:[›❯>•*-]\s*)?([1-9]\d?)[.)]\s+(.{1,140})$/
  let lastChoiceIndex = -1
  for (let index = tail.length - 1; index >= 0; index--) {
    if (numbered.test(tail[index])) { lastChoiceIndex = index; break }
  }
  let choices: DecisionChoice[] = []
  const trailing = tail.slice(lastChoiceIndex + 1)
  const hasTrailingPrompt = trailing.every((line) => /^(?:[›❯>](?:\s|$)|(?:enter|select|pick|press)\s+(?:a\s+)?(?:choice|option|number)\b)/i.test(line))
  if (lastChoiceIndex >= 0 && trailing.length <= 2 && hasTrailingPrompt) {
    const found: DecisionChoice[] = []
    for (let index = lastChoiceIndex; index >= 0; index--) {
      const match = tail[index].match(numbered)
      if (!match) break
      found.unshift({ value: match[1], label: `${match[1]}. ${match[2]}` })
    }
    if (found.length >= 2 && found.length <= 8 && new Set(found.map((choice) => choice.value)).size === found.length) {
      choices = found
    }
  }
  if (/\[(?:y\/n|yes\/no)\]|\((?:y\/n|yes\/no)\)|\byes\s*\/\s*no\b/i.test(tail.slice(-2).join('\n'))) {
    choices = [{ value: 'y', label: 'Yes' }, { value: 'n', label: 'No' }]
  }
  const signature = JSON.stringify({ excerpt, choices })
  return { id: createHash('sha256').update(signature).digest('hex').slice(0, 20), excerpt, choices }
}
