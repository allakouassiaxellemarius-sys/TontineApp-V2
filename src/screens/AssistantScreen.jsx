import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Send, Mic, MicOff, Image as ImageIcon, Sparkles, Check, X, Zap, User as UserIcon, Bot, Wallet, Phone, MessageCircle,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useData } from '../context/DataContext'
import { getGroup, getMembres, getTourProchain, getPaiementMembre, ajouterAuJournal } from '../lib/db'
import { analyseGroupe } from '../lib/analyseTontine'
import { assistantAgent, assistantVision, assistantStream } from '../lib/agentApi'
import { useMemoire } from '../hooks/useMemoire'
import { executerAction, decrireAction } from '../lib/agentActions'
import { extraireLiensPaiement, ouvrirPaiement } from '../lib/paiementSimple'
import { haptic } from '../lib/haptique'
import { telephoneValide, lienAppel, lienWhatsApp, ouvrirLien } from '../lib/remind'

// Suggestions contextuelles : adaptées à l'état réel de la tontine
// (retardataires, tour prêt à être distribué…) et à l'analyse comptable.
function suggestionsPour(contexte, analyse) {
  if (!contexte) return ['Comment créer ma première tontine ?']
  const payes = contexte.paiements.filter((p) => p.montant > 0).length
  const total = contexte.membres.length
  const toutPaye = total > 0 && payes >= total
  const a = analyse && analyse.periode ? analyse : null
  const sugg = []
  if (a) {
    if (a.anomalies.length) sugg.push(`Contrôle comptable : ${a.anomalies.length} point(s) à vérifier`)
    if (a.tresorerie.soldeGroupe < 0) {
      sugg.push(`Comment combler les ${Math.abs(a.tresorerie.soldeGroupe)} ${a.devise} de déficit ?`)
    }
    const retard = a.membres.plusEnRetard
    if (retard) sugg.push(`Comment relancer ${retard.nom} sans braquer le groupe ?`)
    sugg.push(`Score financier ${a.sante.score}/100 : explique-le moi`)
  }
  sugg.push('Qui doit payer cette semaine ?')
  if (toutPaye) {
    sugg.push('Prépare la distribution du pot', 'Clôture le tour et planifie le suivant')
  } else {
    sugg.push('Qui n\u2019a pas encore payé ?', 'Relance les membres en retard')
  }
  sugg.push('Fais un résumé de la collecte', 'Génère un rapport PDF de la tontine')
  return [...new Set(sugg)].slice(0, 5)
}

let MSG_ID = 0
const newId = () => 'm' + ++MSG_ID

export default function AssistantScreen() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { utilisateur } = useAuth()
  const { refresh, version } = useData()
  const group = getGroup(id)
  const code = group && (group.code || group.codeUnique)

  // Contexte local (local-first) : envoyé au worker pour que l'assistant
  // fonctionne même si la tontine n'est pas encore synchronisée sur le cloud.
  const contexte = useMemo(() => {
    if (!group) return null
    const membres = getMembres(id)
    const tour = getTourProchain(id)
    const paiements = tour
      ? membres.map((m) => {
          const p = getPaiementMembre(tour.id, m.id)
          return { membreId: m.id, montant: (p && p.montant) || 0 }
        })
      : []
    return {
      groupe: {
        nom: group.nom,
        montantCotisation: group.montantCotisation,
        devise: group.devise,
        dateEcheance: group.dateEcheance,
        statut: group.statut,
        waveSlug: group.waveSlug,
        telephoneResponsable: group.telephoneResponsable,
      },
      membres: membres.map((m) => ({ id: m.id, nom: m.nom, role: m.role })),
      tour: tour ? { membreId: tour.membreId, datePrevue: tour.datePrevue, echeance: tour.echeance, montantPot: tour.montantPot } : null,
      paiements,
    }
  }, [group, id])
  // Digest financier calculé localement (getBilan est déjà en cache). Volontairement
  // différé après le rendu : ~100 ms sur un grand groupe, à ne pas payer à
  // l'ouverture de l'écran. handleSend le recalcule de toute façon à l'envoi.
  const [analyse, setAnalyse] = useState(null)
  useEffect(() => {
    let annule = false
    const t = setTimeout(() => {
      try { const a = analyseGroupe(id); if (!annule) setAnalyse(a) } catch { /* pas de digest */ }
    }, 350)
    return () => { annule = true; clearTimeout(t) }
  }, [id, version])
  const memoire = useMemoire()

  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [live, setLive] = useState(false)
  const [listening, setListening] = useState(false)
  const [pendingImage, setPendingImage] = useState(null)
  const [showProfil, setShowProfil] = useState(false)
  const [resolu, setResolu] = useState({})

  const endRef = useRef(null)
  const fileRef = useRef(null)
  const recognitionRef = useRef(null)

  useEffect(() => { endRef.current && endRef.current.scrollIntoView({ behavior: 'smooth' }) }, [messages, loading])

  const historique = () => messages.filter((m) => m.role === 'user' || m.role === 'bot').map((m) => ({ role: m.role, content: m.content }))
  const pushMsg = (m) => setMessages((prev) => [...prev, { id: newId(), ...m }])

  const handleSend = useCallback(async () => {
    const texte = input.trim()
    const img = pendingImage
    if ((!texte && !img) || loading || !code) return
    pushMsg({ role: 'user', content: texte, image: img || undefined })
    setInput('')
    setPendingImage(null)
    const nomMembre = utilisateur ? (utilisateur.displayName || utilisateur.email || '') : ''
    // Analyse recalculée à l'envoi : des actions ont pu être exécutées depuis
    // le rendu, et le contexte mémoïsé peut dater de plusieurs minutes.
    let aAnalyse
    try { aAnalyse = analyseGroupe(id) } catch { aAnalyse = null }
    const contexteEnvoi = contexte ? { ...contexte, analyse: aAnalyse || analyse } : null

    if (img) {
      setLoading(true)
      try {
        const res = await assistantVision({ code, image: img, message: texte, nomMembre })
        pushMsg({ role: 'bot', content: (res && res.reponse) || '(pas de réponse)', vision: true })
      } catch (e) {
        pushMsg({ role: 'bot', content: '⚠️ ' + (e.message || 'Erreur vision') })
      } finally { setLoading(false) }
      return
    }

    if (live) {
      const botId = newId()
      setMessages((prev) => [...prev, { id: botId, role: 'bot', content: '' }])
      setLoading(true)
      try {
        await assistantStream(
          { code, message: texte, historique: historique(), nomMembre, memoire: memoire.texte(), contexte: contexteEnvoi },
          (tok) => setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, content: m.content + tok } : m))),
          null
        )
      } catch (e) {
        setMessages((prev) => prev.map((m) => (m.id === botId ? { ...m, content: m.content + '\n⚠️ ' + (e.message || 'Erreur') } : m)))
      } finally { setLoading(false) }
      return
    }

    setLoading(true)
    try {
      const res = await assistantAgent({ code, message: texte, historique: historique(), nomMembre, memoire: memoire.texte(), contexte: contexteEnvoi })
      if (!res) {
        pushMsg({ role: 'bot', content: '⚠️ Tontine introuvable sur le cloud. Connecte-toi à Internet et assure-toi que la tontine est synchronisée pour que l’assistant puisse répondre.' })
      } else {
        pushMsg({ role: 'bot', content: (res.reponse) || '(pas de réponse)', actions: (res.actions) || [] })
      }
    } catch (e) {
      pushMsg({ role: 'bot', content: '⚠️ ' + (e.message || 'Erreur') })
    } finally { setLoading(false) }
  }, [input, pendingImage, loading, code, live, utilisateur, memoire, contexte, analyse, id])

  const handleSendRef = useRef(handleSend)
  handleSendRef.current = handleSend
  useEffect(() => {
    const prefill = location.state && location.state.prefill
    if (prefill && messages.length === 0) {
      setInput(prefill)
      const t = setTimeout(() => handleSendRef.current(), 450)
      return () => clearTimeout(t)
    }
  }, [location.state, messages.length])

  async function confirmerActions(msgId, actions) {
    setResolu((r) => ({ ...r, [msgId]: true }))
    setLoading(true)
    const resultats = []
    for (const a of actions) {
      try { resultats.push(await executerAction(a, { groupId: id })) } catch (e) { resultats.push('⚠️ ' + (e.message || e)) }
    }
    setLoading(false)
    refresh()
    haptic.tap()
    pushMsg({ role: 'system', content: resultats.join('\n') })
  }
  function refuserActions(msgId) {
    setResolu((r) => ({ ...r, [msgId]: true }))
    pushMsg({ role: 'system', content: 'Action annulée.' })
  }

  function appelerDepuisAssistant(membre) {
    const lien = lienAppel(membre.telephone)
    if (!lien) return
    ouvrirLien(lien)
    const qui = (utilisateur && (utilisateur.displayName || utilisateur.email)) || 'Le responsable'
    ajouterAuJournal(id, 'appel', `${qui} a appelé ${membre.nom}`)
    refresh()
    haptic.tap()
  }

  function toggleVoice() {
    if (listening) { recognitionRef.current && recognitionRef.current.stop(); setListening(false); return }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { pushMsg({ role: 'system', content: 'Reconnaissance vocale non disponible sur cet appareil.' }); return }
    const rec = new SR()
    rec.lang = 'fr-FR'
    rec.interimResults = false
    rec.onresult = (e) => { setInput((v) => (v ? v + ' ' : '') + e.results[0][0].transcript) }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognitionRef.current = rec
    rec.start()
    setListening(true)
  }

  function onPickImage(e) {
    const file = e.target.files && e.target.files[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setPendingImage(reader.result)
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  const hasVoice = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

  return (
    <div className="relative mx-auto flex min-h-screen max-w-lg flex-col bg-[rgb(var(--bg))] px-3 pb-3 pt-3 pt-safe">
      {/* Header */}
      <div className="mb-2 flex items-center gap-2">
        <button className="btn btn-icon !h-10 !w-10" onClick={() => navigate(-1)} aria-label="Retour">
          <X size={18} />
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl gradient-primary text-white shadow-[0_8px_20px_-6px_rgba(27,135,218,0.6)]">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="truncate text-base font-extrabold uppercase leading-tight text-gradient">Assistant IA</h1>
            <p className="truncate text-[11px] text-[rgb(var(--text-dim))]">{group ? group.nom : 'CarnetTontine'}</p>
          </div>
        </div>
        <button
          className={`btn-icon !h-10 !w-10 ${live ? 'gradient-primary text-white' : ''}`}
          onClick={() => setLive((v) => !v)}
          aria-label="Réponse en direct"
          title="Réponse en direct (streaming)"
        >
          <Zap size={16} />
        </button>
        <button className="btn-icon !h-10 !w-10" onClick={() => setShowProfil(true)} aria-label="Profil IA">
          <UserIcon size={16} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto pb-2">
        {messages.length === 0 && (
          <div className="card glass-strong p-4 text-sm">
            <p className="mb-1 font-bold text-[rgb(var(--text))]">👋 Bonjour ! Je suis votre secrétaire, trésorier et analyste.</p>
            <p className="text-[rgb(var(--text-dim))]">Je connais les chiffres de votre tontine (collecte, retards, pénalités, trésorerie) et je vous conseille dessus. Je peux aussi <b>agir</b> : ajouter un membre, enregistrer un paiement, relancer, créer une tontine, générer un rapport…</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {suggestionsPour(contexte, analyse).map((s, i) => (
                <button key={i} onClick={() => { setInput(s); }} className="rounded-full border border-[rgba(27,135,218,0.35)] bg-[rgba(27,135,218,0.10)] px-3 py-1.5 text-xs font-bold text-[#0D6EB8] active:scale-95">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((m) => (
          <Message
            key={m.id}
            m={m}
            resolved={!!resolu[m.id]}
            membres={contexte ? contexte.membres : []}
            onAppeler={appelerDepuisAssistant}
            onConfirmer={() => confirmerActions(m.id, m.actions)}
            onRefuser={() => refuserActions(m.id)}
            onComptabiliser={() => { setInput('Enregistre le paiement correspondant à ce reçu.'); }}
          />
        ))}

        {loading && (
          <div className="flex items-center gap-2 px-2 text-[rgb(var(--text-dim))]">
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#1B87DA]" />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#0D6EB8]" style={{ animationDelay: '0.15s' }} />
            <span className="h-2 w-2 animate-bounce rounded-full bg-[#DCEBF9]" style={{ animationDelay: '0.3s' }} />
            <span className="text-xs">l'assistant réfléchit…</span>
          </div>
        )}
        <div ref={endRef} />
      </div>

      {/* Image preview */}
      {pendingImage && (
        <div className="mb-2 flex items-center gap-2 rounded-2xl border border-[rgba(27,135,218,0.3)] bg-[rgba(27,135,218,0.08)] p-2">
          <img src={pendingImage} alt="preuve" className="h-12 w-12 rounded-xl object-cover" />
          <span className="flex-1 text-xs text-[rgb(var(--text-dim))]">Preuve jointe — l'assistant va la lire.</span>
          <button className="btn-icon" onClick={() => setPendingImage(null)} aria-label="Retirer"><X size={14} /></button>
        </div>
      )}

      {/* Input bar */}
      <div className="flex items-center gap-2">
        <button className="btn-icon !h-11 !w-11 shrink-0" onClick={() => fileRef.current && fileRef.current.click()} aria-label="Joindre une image">
          <ImageIcon size={18} />
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPickImage} />
        {hasVoice && (
          <button className={`btn-icon !h-11 !w-11 shrink-0 ${listening ? 'gradient-primary text-white' : ''}`} onClick={toggleVoice} aria-label="Voix">
            {listening ? <MicOff size={18} /> : <Mic size={18} />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend() } }}
          placeholder={listening ? 'Écoute en cours…' : 'Écrivez ou parlez à l’assistant…'}
          className="input flex-1"
          autoCapitalize="sentences"
          spellCheck={false}
        />
        <button className="btn btn-primary !h-11 !w-11 shrink-0 !p-0" onClick={handleSend} disabled={loading || (!input.trim() && !pendingImage)} aria-label="Envoyer">
          <Send size={18} />
        </button>
      </div>

      {showProfil && <ProfilModal memoire={memoire} onClose={() => setShowProfil(false)} />}
    </div>
  )
}

function Message({ m, resolved, membres, onAppeler, onConfirmer, onRefuser, onComptabiliser }) {
  if (m.role === 'system') {
    return (
      <div className="mx-auto w-fit max-w-[90%] rounded-2xl bg-[rgba(27,135,218,0.12)] px-3 py-2 text-center text-xs font-semibold text-[#0D6EB8]">
        {m.content}
      </div>
    )
  }
  const isUser = m.role === 'user'
  const liens = !isUser && m.content ? extraireLiensPaiement(m.content) : { pispi: [] }
  const aDesLiens = liens.pispi.length > 0
  const mentions = (!isUser && membres && m.content)
    ? membres.filter((mm) => mm.nom && mm.nom.trim().length >= 3 && m.content.toLowerCase().includes(mm.nom.trim().toLowerCase()))
    : []
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[88%] items-end gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
        <span className={`mb-1 grid h-7 w-7 shrink-0 place-items-center rounded-full ${isUser ? 'bg-[rgba(120,120,140,0.15)] text-[rgb(var(--text-dim))]' : 'gradient-primary text-white'}`}>
          {isUser ? <UserIcon size={14} /> : <Bot size={14} />}
        </span>
        <div className={`rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${isUser ? 'gradient-primary text-white' : 'glass text-[rgb(var(--text))]'}`}>
          {m.image && <img src={m.image} alt="preuve" className="mb-2 max-h-40 rounded-xl object-cover" />}
          <span className="whitespace-pre-wrap">{m.content}</span>
          {aDesLiens && (
            <div className="mt-2 flex flex-col gap-1.5">
              {liens.pispi.map((p, k) => (
                <button key={'p' + k} onClick={() => ouvrirPaiement('pispi', p)} className="flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-3 py-2 text-xs font-bold text-white">
                  <Wallet size={14} /> Payer avec Pi-Spi
                </button>
              ))}
            </div>
          )}
          {mentions.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {mentions.map((mm) => (
                <span key={mm.id} className="flex items-center gap-1">
                  <button
                    disabled={!telephoneValide(mm.telephone)}
                    onClick={() => onAppeler(mm)}
                    className="flex items-center gap-1 rounded-xl bg-[rgba(27,135,218,0.12)] px-2.5 py-1.5 text-xs font-bold text-[#0D6EB8] transition active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Phone size={13} /> Appeler {mm.nom}
                  </button>
                  {telephoneValide(mm.telephone) && (
                    <button
                      onClick={() => ouvrirLien(lienWhatsApp(mm.telephone, `Bonjour ${mm.nom} 👋, petit rappel de la tontine. Merci !`))}
                      className="rounded-xl bg-[rgba(27,135,218,0.12)] p-2 text-[#0D6EB8] transition active:scale-95"
                      aria-label={`WhatsApp ${mm.nom}`}
                      title={`WhatsApp ${mm.nom}`}
                    >
                      <MessageCircle size={13} />
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
          {m.vision && (
            <button onClick={onComptabiliser} className="mt-2 flex items-center gap-1.5 rounded-xl border border-[rgba(27,135,218,0.4)] bg-[rgba(27,135,218,0.12)] px-3 py-1.5 text-xs font-bold text-[#0D6EB8]">
              <Check size={13} /> Comptabiliser ce paiement
            </button>
          )}
        </div>
      </div>
      {m.actions && m.actions.length > 0 && !resolved && (
        <div className="mt-1 w-full max-w-[88%] self-start">
          <div className="card glass-strong p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-[#0D6EB8]">
              <Sparkles size={13} /> Plan d'action proposé
            </p>
            <div className="space-y-1.5">
              {m.actions.map((a, i) => (
                <div key={i} className="flex items-center gap-2 rounded-xl bg-[rgba(27,135,218,0.08)] px-3 py-2 text-sm text-[rgb(var(--text))]">
                  <span className="text-[#0D6EB8]">•</span>
                  <span className="flex-1">{decrireAction(a)}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2">
              <button className="btn btn-primary flex-1 !py-2.5 text-sm" onClick={onConfirmer}>
                <Check size={16} /> Confirmer
              </button>
              <button className="btn btn-secondary flex-1 !py-2.5 text-sm" onClick={onRefuser}>
                <X size={16} /> Refuser
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfilModal({ memoire, onClose }) {
  const [nom, setNom] = useState(memoire.memoire.nom || '')
  const [role, setRole] = useState(memoire.memoire.role || '')
  const [langue, setLangue] = useState(memoire.memoire.langue || 'fr')
  const [rappel, setRappel] = useState(memoire.memoire.rappel || '')
  const [notes, setNotes] = useState(memoire.memoire.notes || '')
  const save = () => { memoire.set({ nom, role, langue, rappel, notes }); onClose() }
  // Portail vers <body> : la page animée est le conteneur bloquant du `fixed`,
  // et le panneau calé en bas de cette page (bien plus haute que l'écran)
  // resterait invisible.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 pb-safe" onClick={onClose}>
      <div className="card glass-strong w-full max-w-lg p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-[rgb(var(--text))]">
            <UserIcon size={16} className="text-[#8B5CF6]" /> Mémoire de l'assistant
          </h2>
          <button className="btn-icon" onClick={onClose} aria-label="Fermer"><X size={14} /></button>
        </div>
        <p className="mb-3 text-xs text-[rgb(var(--text-dim))]">L'assistant s'en souviendra pour vous connaître et personnaliser ses réponses.</p>
        <div className="space-y-3">
          <div><label className="label">Votre nom</label><input className="input" type="text" autoComplete="name" autoCapitalize="words" autoCorrect="off" spellCheck={false} value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex : Awa" /></div>
          <div><label className="label">Votre rôle</label><input className="input" type="text" autoCapitalize="sentences" spellCheck={false} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Ex : Responsable, Membre" /></div>
          <div><label className="label">Message de rappel par défaut</label><input className="input" type="text" autoCapitalize="sentences" spellCheck={false} value={rappel} onChange={(e) => setRappel(e.target.value)} placeholder="Ex : Hello, ta cotisation de X FCFA est due." /></div>
          <div><label className="label">Notes / préférences</label><input className="input" type="text" autoCapitalize="sentences" spellCheck={false} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ex : toujours en FCFA, ton amical" /></div>
        </div>
        <button className="btn btn-primary mt-4 w-full" onClick={save}><Check size={16} /> Enregistrer la mémoire</button>
      </div>
    </div>,
    document.body,
  )
}
