import type { ExtractionCandidate, SessionMessageRecord } from '@gogoagent/shared'
import { clampTitle, sentenceParts, stableId } from './utils.js'

function dedupeCandidates(candidates: ExtractionCandidate[]) {
  const seen = new Set<string>()
  return candidates.filter((candidate) => {
    const key = `${candidate.kind}:${candidate.text.toLowerCase()}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export function extractCandidates(sessionId: string, messages: SessionMessageRecord[]) {
  const candidates: ExtractionCandidate[] = []

  const assistantMessages = messages.filter((message) => message.role === 'assistant')
  const userMessages = messages.filter((message) => message.role === 'user')

  const summarySource = assistantMessages.find((message) => message.text.length > 40) ?? assistantMessages[0]
  if (summarySource) {
    candidates.push({
      id: stableId('candidate', `${sessionId}:summary:${summarySource.id}`),
      sessionId,
      kind: 'summary',
      text: clampTitle(summarySource.text.replace(/\s+/g, ' '), 220),
      sourceMessageId: summarySource.id,
    })
  }

  for (const message of assistantMessages) {
    for (const part of sentenceParts(message.text)) {
      const lower = part.toLowerCase()

      if (/\b(you should|use |prefer |always |do not|don't |never |must |important:)/.test(lower)) {
        candidates.push({
          id: stableId('candidate', `${sessionId}:rule:${message.id}:${part}`),
          sessionId,
          kind: 'rule',
          text: clampTitle(part, 220),
          sourceMessageId: message.id,
        })
      }

      if (/\b(status|summary|appears|looks like|this means|the issue|root cause|charging|failed|resolved|working|fixed)\b/.test(lower)) {
        candidates.push({
          id: stableId('candidate', `${sessionId}:decision:${message.id}:${part}`),
          sessionId,
          kind: 'decision',
          text: clampTitle(part, 220),
          sourceMessageId: message.id,
        })
      }
    }
  }

  for (const message of userMessages) {
    if (message.text.includes('<local-command-caveat>')) continue

    for (const part of sentenceParts(message.text)) {
      const cleaned = part.trim()
      const lower = cleaned.toLowerCase()
      if (!cleaned) continue
      if (cleaned.length < 12) continue

      const isTodo = /\b(i want|please |can you|need to|todo|follow up|later|remember to|let's )\b/.test(lower)
      const isCorrection =
        (!cleaned.endsWith('?') && /^no\b/.test(lower)) ||
        /\b(not quite|actually|instead|i said|i mean|that's wrong|that is wrong|wrong|do not|don't|stop|rather than|not .* but|what i want|the thing i care about|please also|focus on|not the point|the point is|that's not|that is not|more importantly|the real task|the real point)\b/.test(
          lower,
        )

      const looksGenericRequest =
        /^(can you|could you|please|i want|let's|is there a way)/.test(lower) &&
        !/\b(actually|instead|but|rather|not .* but|focus on|the point is|what i want)\b/.test(lower)

      if (isTodo) {
        candidates.push({
          id: stableId('candidate', `${sessionId}:todo:${message.id}:${cleaned}`),
          sessionId,
          kind: 'todo',
          text: clampTitle(cleaned, 220),
          sourceMessageId: message.id,
        })
      }

      if (isCorrection && !looksGenericRequest) {
        candidates.push({
          id: stableId('candidate', `${sessionId}:lesson:${message.id}:${cleaned}`),
          sessionId,
          kind: 'lesson',
          text: clampTitle(cleaned, 240),
          sourceMessageId: message.id,
        })
      }
    }
  }

  return dedupeCandidates(candidates).slice(0, 24)
}
