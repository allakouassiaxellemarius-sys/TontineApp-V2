import { authHeaders, SYNC_BASE, cloudRequest } from './cloudApi'

// Appel agentique : renvoie { reponse, actions } (actions exécutées côté client)
export function assistantAgent(payload) {
  return cloudRequest('POST', 'assistant/agent', payload)
}

// Analyse d'image (reçu / preuve) via vision
export function assistantVision(payload) {
  return cloudRequest('POST', 'assistant/vision', payload)
}

// Réponse en streaming (SSE) — texte seul, pas d'actions
export async function assistantStream(payload, onToken, signal) {
  const headers = await authHeaders()
  if (!headers) throw new Error('Non connecté')
  const res = await fetch(SYNC_BASE + '/assistant/stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(payload),
    signal,
  })
  if (!res.ok || !res.body) throw new Error('Stream indisponible (' + res.status + ')')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let idx
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = chunk.replace(/^data: /, '').trim()
      if (!line || line === '[DONE]') continue
      try {
        const evt = JSON.parse(line)
        if (evt.token) onToken(evt.token)
        if (evt.error) throw new Error(evt.error)
      } catch (e) {
        if (e.message) throw e
      }
    }
  }
}
