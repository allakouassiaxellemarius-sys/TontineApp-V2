import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Smartphone, Wallet } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getGroup } from '../lib/db'
import { cloudRequest } from '../lib/cloudApi'
import { extraireLiensPaiement, ouvrirPaiement } from '../lib/paiementSimple'

export default function AssistantScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { utilisateur } = useAuth()
  const group = getGroup(id)
  const code = group && group.code
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const endRef = useRef(null)

  useEffect(() => {
    endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function envoyer() {
    const texte = input.trim()
    if (!texte || loading || !code) return
    const userMsg = { role: 'user', content: texte, ts: Date.now() }
    const hist = messages.map((m) => ({ role: m.role, content: m.content }))
    setMessages((m) => [...m, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await cloudRequest('POST', 'assistant', {
        code,
        message: texte,
        historique: hist,
        nomMembre: utilisateur ? (utilisateur.displayName || utilisateur.email || '') : '',
      })
      setMessages((m) => [...m, { role: 'bot', content: (res && res.reponse) || '(pas de réponse)', ts: Date.now() }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'bot', content: '⚠️ ' + (e.message || 'Erreur'), ts: Date.now() }])
    } finally {
      setLoading(false)
    }
  }

  const btnBase = {
    border: 'none', borderRadius: 12, padding: '10px 14px', fontWeight: 700, cursor: 'pointer',
  }

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: 16, display: 'flex', flexDirection: 'column', height: '100vh', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ ...btnBase, background: '#eee' }}
          aria-label="Retour"
        >←</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700 }}>🤖 CarnetTontine IA</div>
          <div style={{ fontSize: 13, opacity: 0.65 }}>{group ? group.nom : 'Assistant'}</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {messages.length === 0 && (
          <div style={{ background: '#f3f4f6', padding: 14, borderRadius: 14, opacity: 0.9, fontSize: 14 }}>
            Salut ! Je suis le secrétaire virtuel de la tontine 😊 Demande-moi « Combien je dois payer ? » ou
            « Qui a déjà payé ? » et je te réponds.
          </div>
        )}
        {messages.map((m, i) => {
          const liens = m.role === 'bot' ? extraireLiensPaiement(m.content) : { waves: [], oms: [] }
          const aDesLiens = liens.waves.length > 0 || liens.oms.length > 0
          return (
            <div key={i} style={{ alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', maxWidth: '88%' }}>
              <div
                style={{
                  padding: '10px 13px', borderRadius: 14, whiteSpace: 'pre-wrap', lineHeight: 1.45,
                  background: m.role === 'user' ? '#2f7d4f' : '#f3f4f6', color: m.role === 'user' ? '#fff' : '#111',
                }}
              >
                {m.content}
              </div>
              {aDesLiens && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
                  {liens.waves.map((w, k) => (
                    <button
                      key={'w' + k}
                      onClick={() => ouvrirPaiement('wave', w)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 12, padding: '9px 12px', fontWeight: 700, cursor: 'pointer', background: '#1f8a4c', color: '#fff' }}
                    >
                      <Wallet size={16} /> Payer avec Wave
                    </button>
                  ))}
                  {liens.oms.map((o, k) => (
                    <button
                      key={'o' + k}
                      onClick={() => ouvrirPaiement('om', o)}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', borderRadius: 12, padding: '9px 12px', fontWeight: 700, cursor: 'pointer', background: '#f47b20', color: '#fff' }}
                    >
                      <Smartphone size={16} /> Payer avec Orange Money
                    </button>
                  ))}
                </div>
              )}
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') envoyer() }}
          placeholder="Écris un message…"
          style={{ flex: 1, padding: 12, borderRadius: 12, border: '1px solid #ccc', fontSize: 15 }}
        />
        <button onClick={envoyer} disabled={loading} style={{ ...btnBase, background: '#2f7d4f', color: '#fff', opacity: loading ? 0.6 : 1 }}>
          {loading ? '…' : 'Envoyer'}
        </button>
      </div>
    </div>
  )
}
